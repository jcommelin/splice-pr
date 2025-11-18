import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseInstruction, generateBranchName, generatePrTitle, generatePrDescription } from './parser';
import { extractChanges } from './diff';
import {
  getPrDetails,
  createBranch,
  commitChanges,
  createPullRequest,
  replyToComment,
  branchExists,
  deleteBranch,
  addLabels,
  requestReviewers,
  checkForConflicts,
} from './github';
import { CommentContext, SpliceResult } from './types';

async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);

    // Get event context
    const context = github.context;

    if (context.eventName !== 'pull_request_review_comment') {
      core.setFailed(`Invalid event type: ${context.eventName}. Expected: pull_request_review_comment`);
      return;
    }

    const payload = context.payload;
    const comment = payload.comment;
    const pullRequest = payload.pull_request;

    if (!comment || !pullRequest) {
      core.setFailed('Missing comment or pull request in payload');
      return;
    }

    // Parse the instruction from the comment
    const instruction = parseInstruction(comment.body);
    if (!instruction) {
      core.info('Comment does not contain splice-bot command');
      return;
    }

    core.info(`Processing splice-bot command from comment ${comment.id}`);

    // Extract comment context
    // For multi-line comments, start_line is the first line and line is the last
    // For single-line comments, start_line is null
    const endLine = comment.line || comment.original_line;
    const startLine = comment.start_line || endLine;

    // Get author information from the comment
    const authorLogin = comment.user?.login || 'github-actions[bot]';
    const authorEmail = comment.user?.id
      ? `${comment.user.id}+${authorLogin}@users.noreply.github.com`
      : 'github-actions[bot]@users.noreply.github.com';

    const commentContext: CommentContext = {
      commentId: comment.id,
      prNumber: pullRequest.number,
      path: comment.path,
      startLine,
      endLine,
      originalStartLine: comment.original_start_line || comment.original_line,
      originalEndLine: comment.original_line,
      diffHunk: comment.diff_hunk,
      body: comment.body,
      commitId: comment.commit_id,
      authorLogin,
      authorEmail,
    };

    // Get repository info
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    // Run the splice operation
    const result = await splice(octokit, owner, repo, commentContext, instruction);

    if (result.success) {
      core.info(`Successfully created PR: ${result.prUrl}`);
      core.setOutput('pr-url', result.prUrl);
      core.setOutput('branch-name', result.branchName);
    } else {
      core.setFailed(result.error || 'Unknown error');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

async function splice(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  commentContext: CommentContext,
  instruction: ReturnType<typeof parseInstruction>
): Promise<SpliceResult> {
  const { prNumber, path, startLine, endLine, commentId, commitId, authorLogin, authorEmail } = commentContext;

  try {
    // Get PR details
    core.info(`Getting PR #${prNumber} details...`);
    const prDetails = await getPrDetails(octokit, owner, repo, prNumber);

    // Determine the base branch
    const baseBranch = instruction?.base || prDetails.baseBranch;

    // Generate or use custom branch name
    const branchName = instruction?.branch || generateBranchName(prNumber, commitId);

    // Check if branch already exists
    if (await branchExists(octokit, owner, repo, branchName)) {
      core.info(`Branch ${branchName} already exists, deleting...`);
      await deleteBranch(octokit, owner, repo, branchName);
    }

    // Extract the changes
    const lineRange = startLine === endLine ? `line ${endLine}` : `lines ${startLine}-${endLine}`;
    core.info(`Extracting changes from ${path} at ${lineRange}...`);
    const changes = await extractChanges(octokit, owner, repo, prNumber, path, startLine, endLine);

    if (!changes) {
      const errorMessage = `Could not extract changes from ${path} at ${lineRange}. The file may not have changes at this location.`;
      await replyToComment(
        octokit,
        owner,
        repo,
        prNumber,
        commentId,
        `❌ **Splice Bot Error**\n\n${errorMessage}`
      );
      return { success: false, error: errorMessage };
    }

    // Create the new branch
    core.info(`Creating branch ${branchName}...`);
    await createBranch(octokit, owner, repo, branchName, baseBranch);

    // Generate PR title
    const prTitle = instruction?.title || generatePrTitle(path);

    // Commit the changes
    core.info('Committing changes...');
    await commitChanges(
      octokit,
      owner,
      repo,
      branchName,
      changes,
      baseBranch,
      prTitle,
      prNumber,
      authorLogin,
      authorEmail
    );

    // Check for potential conflicts
    core.info('Checking for potential conflicts...');
    const hasConflicts = await checkForConflicts(
      octokit,
      owner,
      repo,
      path,
      baseBranch,
      prDetails.headBranch
    );
    if (hasConflicts) {
      core.warning(`File ${path} may have been modified in base branch - conflicts possible`);
    }

    // Generate PR description
    const prDescription = generatePrDescription({
      originalPrNumber: prNumber,
      originalPrTitle: prDetails.title,
      path,
      startLine,
      endLine,
      commentId,
      authorLogin,
      customDescription: instruction?.description,
    });

    // Create the PR
    core.info('Creating pull request...');
    const newPr = await createPullRequest(
      octokit,
      owner,
      repo,
      prTitle,
      prDescription,
      branchName,
      baseBranch,
      instruction?.draft || false
    );

    // Add labels if specified
    if (instruction?.labels && instruction.labels.length > 0) {
      core.info(`Adding labels: ${instruction.labels.join(', ')}`);
      await addLabels(octokit, owner, repo, newPr.number, instruction.labels);
    }

    // Request reviewers if specified
    if (instruction?.reviewers && instruction.reviewers.length > 0) {
      core.info(`Requesting reviewers: ${instruction.reviewers.join(', ')}`);
      await requestReviewers(octokit, owner, repo, newPr.number, instruction.reviewers);
    }

    // Reply to the original comment
    let successMessage = `✅ **Splice Bot** created:\n [#${newPr.number} - ${prTitle}](${newPr.url})`;
    if (hasConflicts) {
      successMessage += `\n\n⚠️ **Warning**: The file \`${path}\` may have been modified in the base branch. Please check for conflicts.`;
    }
    await replyToComment(octokit, owner, repo, prNumber, commentId, successMessage);

    return {
      success: true,
      prUrl: newPr.url,
      branchName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.error(`Splice operation failed: ${errorMessage}`);

    // Try to reply with error
    try {
      await replyToComment(
        octokit,
        owner,
        repo,
        prNumber,
        commentId,
        `❌ **Splice Bot Error**\n\n${errorMessage}\n\nPlease check the action logs for more details.`
      );
    } catch (replyError) {
      core.warning(`Could not reply to comment: ${replyError}`);
    }

    return { success: false, error: errorMessage };
  }
}

run();
