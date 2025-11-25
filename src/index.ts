/**
 * Entry point for splice-bot GitHub Action.
 *
 * Handles two event types:
 * - pull_request_review_comment: Extract changes and create new PR
 * - pull_request (closed+merged): Notify original PR about spliced PR merge
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseInstruction, generateBatchDescription } from './parser';
import { getFileDiff, extractHunkForLineRange } from './diff';
import { ExtractedChange } from './types';
import {
  getPrDetails,
  createBranch,
  commitChanges,
  createPullRequest,
  replyToComment,
  branchExists,
  addLabels,
  requestReviewers,
  createIssueComment,
} from './github';
import { CommentContext, SpliceResult, BatchedChanges } from './types';

/**
 * Metadata embedded in spliced PR descriptions as an HTML comment.
 * Used by handleMergeCallback to identify the original PR.
 */
interface SpliceBotMetadata {
  'splice-bot': {
    'original-pr': number;
    'comment-id': number;
  };
}

async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);

    // Get event context
    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    if (context.eventName === 'pull_request_review_comment') {
      await handleSpliceComment(octokit, owner, repo, context);
    } else if (context.eventName === 'issue_comment') {
      await handleIssueComment(octokit, owner, repo, context);
    } else if (context.eventName === 'pull_request_review') {
      await handlePullRequestReview(octokit, owner, repo, context);
    } else if (context.eventName === 'pull_request') {
      await handleMergeCallback(octokit, owner, repo, context);
    } else {
      core.setFailed(`Invalid event type: ${context.eventName}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

/**
 * Handle pull request review events (review summary comments for --ship commands)
 */
async function handlePullRequestReview(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  context: typeof github.context
): Promise<void> {
  const payload = context.payload;
  const review = payload.review;
  const pullRequest = payload.pull_request;

  if (!pullRequest) {
    core.info('Review is not on a pull request, skipping');
    return;
  }

  if (!review || !review.body) {
    core.info('Review has no body, skipping');
    return;
  }

  // Parse the instruction from the review body
  const instruction = parseInstruction(review.body);
  if (!instruction) {
    core.info('Review body does not contain splice-bot command');
    return;
  }

  // Only handle batch:id --ship commands from review bodies
  if (!instruction.batch || !instruction.ship) {
    core.info('Review body must be batch:id --ship command');
    return;
  }

  core.info(`Processing batch:${instruction.batch} --ship from review ${review.id}`);

  // Get author information from the review
  const authorLogin = review.user?.login || 'github-actions[bot]';
  const authorEmail = review.user?.id
    ? `${review.user.id}+${authorLogin}@users.noreply.github.com`
    : 'github-actions[bot]@users.noreply.github.com';

  // Create a minimal CommentContext for the --ship review
  // This review doesn't have file/line info since it's a summary comment
  const commentContext: CommentContext = {
    commentId: review.id,
    prNumber: pullRequest.number,
    path: '', // Not applicable for review summaries
    startLine: 0,
    endLine: 0,
    originalStartLine: null,
    originalEndLine: null,
    diffHunk: '',
    body: review.body,
    commitId: review.commit_id || '',
    authorLogin,
    authorEmail,
    side: 'RIGHT',
    startSide: null,
  };

  // Run batch splice operation
  const result = await spliceBatch(
    octokit,
    owner,
    repo,
    pullRequest.number,
    instruction.batch,
    false, // Not synthetic - explicit batch
    commentContext,
    instruction
  );

  if (result.success) {
    core.info(`Successfully created PR: ${result.prUrl}`);
    core.setOutput('pr-url', result.prUrl);
    core.setOutput('branch-name', result.branchName);
  } else {
    core.setFailed(result.error || 'Unknown error');
  }
}

/**
 * Handle issue comment events (regular PR comments for --ship commands)
 */
async function handleIssueComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  context: typeof github.context
): Promise<void> {
  const payload = context.payload;
  const comment = payload.comment;
  const issue = payload.issue;

  // Only process comments on pull requests
  if (!issue || !issue.pull_request) {
    core.info('Comment is not on a pull request, skipping');
    return;
  }

  if (!comment) {
    core.setFailed('Missing comment in payload');
    return;
  }

  // Parse the instruction from the comment
  const instruction = parseInstruction(comment.body);
  if (!instruction) {
    core.info('Comment does not contain splice-bot command');
    return;
  }

  // Only handle batch:id --ship commands from issue comments
  if (!instruction.batch || !instruction.ship) {
    core.info('Issue comment must be batch:id --ship command');
    return;
  }

  core.info(`Processing batch:${instruction.batch} --ship from issue comment ${comment.id}`);

  // Get author information from the comment
  const authorLogin = comment.user?.login || 'github-actions[bot]';
  const authorEmail = comment.user?.id
    ? `${comment.user.id}+${authorLogin}@users.noreply.github.com`
    : 'github-actions[bot]@users.noreply.github.com';

  // Create a minimal CommentContext for the --ship comment
  // This comment doesn't have file/line info since it's not a review comment
  const commentContext: CommentContext = {
    commentId: comment.id,
    prNumber: issue.number,
    path: '', // Not applicable for issue comments
    startLine: 0,
    endLine: 0,
    originalStartLine: null,
    originalEndLine: null,
    diffHunk: '',
    body: comment.body,
    commitId: '',
    authorLogin,
    authorEmail,
    side: 'RIGHT',
    startSide: null,
  };

  // Run batch splice operation
  const result = await spliceBatch(
    octokit,
    owner,
    repo,
    issue.number,
    instruction.batch,
    false, // Not synthetic - explicit batch
    commentContext,
    instruction
  );

  if (result.success) {
    core.info(`Successfully created PR: ${result.prUrl}`);
    core.setOutput('pr-url', result.prUrl);
    core.setOutput('branch-name', result.branchName);
  } else {
    core.setFailed(result.error || 'Unknown error');
  }
}

/**
 * Handle splice-bot comment events
 */
async function handleSpliceComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  context: typeof github.context
): Promise<void> {
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
    side: comment.side || 'RIGHT',
    startSide: comment.start_side || null,
  };

  // Batch comments without --ship are no-ops (handled when --ship is posted)
  if (instruction.batch && !instruction.ship) {
    core.info(`Added to batch:${instruction.batch}, waiting for --ship`);
    return;
  }

  // Determine batch ID: explicit batch or synthetic single-comment batch
  const batchId = instruction.batch || `c${comment.id}`;
  const isSyntheticBatch = !instruction.batch;
  core.info(`Processing ${isSyntheticBatch ? 'single-comment' : 'batch'} splice with id: ${batchId}`);

  // Run unified splice operation
  const result = await spliceBatch(octokit, owner, repo, pullRequest.number, batchId, isSyntheticBatch, commentContext, instruction);

  if (result.success) {
    core.info(`Successfully created PR: ${result.prUrl}`);
    core.setOutput('pr-url', result.prUrl);
    core.setOutput('branch-name', result.branchName);
  } else {
    core.setFailed(result.error || 'Unknown error');
  }
}

/**
 * Handle merge callback when a spliced PR is merged
 */
async function handleMergeCallback(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  context: typeof github.context
): Promise<void> {
  const payload = context.payload;
  const pr = payload.pull_request;

  if (!pr) {
    core.setFailed('Missing pull request in payload');
    return;
  }

  // Verify this is a merge event
  if (payload.action !== 'closed' || !pr.merged) {
    core.info('PR was closed but not merged, skipping');
    return;
  }

  // Parse metadata from PR description
  const metadata = parseSpliceBotMetadata(pr.body || '');
  if (!metadata) {
    core.info('Not a splice-bot PR (no metadata found), skipping');
    return;
  }

  const originalPrNumber = metadata['splice-bot']['original-pr'];
  const baseBranch = pr.base.ref;

  core.info(`Spliced PR #${pr.number} merged into ${baseBranch}, notifying original PR #${originalPrNumber}`);

  // Get on-merge configuration
  const onMergeConfig = core.getInput('on-merge') || 'comment,label';
  const actions = onMergeConfig.split(',').map(a => a.trim().toLowerCase());

  // Post notification comment on original PR
  if (actions.includes('comment')) {
    const message = `🔀 Spliced PR #${pr.number} has been merged into \`${baseBranch}\`.\n\nYou may want to merge \`${baseBranch}\` into this PR to incorporate those changes and avoid duplicates.`;

    try {
      await createIssueComment(octokit, owner, repo, originalPrNumber, message);
      core.info(`Posted notification to PR #${originalPrNumber}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      core.warning(`Failed to post notification to PR #${originalPrNumber}: ${errorMessage}`);
    }
  }

  // Add sync label to original PR
  if (actions.includes('label')) {
    const syncLabel = core.getInput('sync-label') || 'needs-sync';
    try {
      await addLabels(octokit, owner, repo, originalPrNumber, [syncLabel]);
      core.info(`Added '${syncLabel}' label to PR #${originalPrNumber}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      core.warning(`Failed to add label to PR #${originalPrNumber}: ${errorMessage}`);
    }
  }
}

/**
 * Parse splice-bot metadata from PR description.
 * Looks for `<!-- {"splice-bot": {...}} -->` HTML comment.
 */
function parseSpliceBotMetadata(body: string): SpliceBotMetadata | null {
  try {
    const match = body.match(/<!--\s*(\{"splice-bot":.+?\})\s*-->/);
    const metadata = JSON.parse(match![1]) as SpliceBotMetadata;
    const isValid = metadata['splice-bot'] && typeof metadata['splice-bot']['original-pr'] === 'number';
    return isValid ? metadata : null;
  } catch {
    return null;
  }
}

/**
 * Collect all review comments with the same batch ID.
 *
 * Fetches all review comments from the PR and filters to those that:
 * 1. Contain a splice-bot command
 * 2. Have the matching batch ID
 *
 * @returns Array of CommentContext objects for all comments in the batch
 */
async function collectBatchComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  batchId: string
): Promise<CommentContext[]> {
  core.info(`Collecting batch comments for batch:${batchId}...`);

  // Fetch all review comments from the PR
  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
  });

  const batchComments: CommentContext[] = [];

  for (const comment of comments) {
    // Parse instruction from comment
    const instruction = parseInstruction(comment.body);
    if (!instruction || instruction.batch !== batchId) {
      continue;
    }

    // Extract comment context
    const endLine = comment.line || comment.original_line || 0;
    const startLine = comment.start_line || endLine;

    const authorLogin = comment.user?.login || 'github-actions[bot]';
    const authorEmail = comment.user?.id
      ? `${comment.user.id}+${authorLogin}@users.noreply.github.com`
      : 'github-actions[bot]@users.noreply.github.com';

    batchComments.push({
      commentId: comment.id,
      prNumber,
      path: comment.path,
      startLine,
      endLine,
      originalStartLine: comment.original_start_line || comment.original_line || null,
      originalEndLine: comment.original_line || null,
      diffHunk: comment.diff_hunk,
      body: comment.body,
      commitId: comment.commit_id,
      authorLogin,
      authorEmail,
      side: comment.side || 'RIGHT',
      startSide: comment.start_side || null,
    });
  }

  core.info(`Found ${batchComments.length} comments in batch:${batchId}`);
  return batchComments;
}

/**
 * Merge batch comments into a single set of changes.
 *
 * Groups selections by file and side, sorts ranges by start line, merges overlapping ranges.
 */
async function mergeBatchComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  comments: CommentContext[]
): Promise<BatchedChanges> {
  core.info('Merging batch comments...');

  // Group comments by file
  const fileGroups = new Map<string, CommentContext[]>();
  for (const comment of comments) {
    const existing = fileGroups.get(comment.path) || [];
    existing.push(comment);
    fileGroups.set(comment.path, existing);
  }

  const files: ExtractedChange[] = [];

  // Process each file
  for (const [path, fileComments] of fileGroups.entries()) {
    core.info(`Processing ${fileComments.length} selections in ${path}...`);

    // Get the file's full diff
    const patch = await getFileDiff(octokit, owner, repo, prNumber, path);
    if (!patch) {
      core.warning(`Could not get diff for ${path}, skipping`);
      continue;
    }

    // Collect ranges grouped by side
    const leftRanges: Array<{start: number; end: number}> = [];
    const rightRanges: Array<{start: number; end: number}> = [];

    for (const comment of fileComments) {
      const side = comment.side;
      const start = side === 'LEFT'
        ? (comment.originalStartLine || comment.originalEndLine || 0)
        : comment.startLine;
      const end = side === 'LEFT'
        ? (comment.originalEndLine || 0)
        : comment.endLine;

      // Skip if we couldn't determine valid line numbers
      if (start === 0 || end === 0) {
        core.warning(`Skipping comment ${comment.commentId} - could not determine line numbers`);
        continue;
      }

      const targetRanges = side === 'LEFT' ? leftRanges : rightRanges;
      targetRanges.push({ start, end });
    }

    // Merge overlapping ranges for each side
    const extractedHunks = [];

    const sidesToProcess: Array<{ side: 'LEFT' | 'RIGHT'; ranges: Array<{start: number; end: number}> }> = [
      { side: 'LEFT', ranges: leftRanges },
      { side: 'RIGHT', ranges: rightRanges },
    ];

    for (const { side, ranges } of sidesToProcess) {
      if (ranges.length === 0) continue;

      // Sort ranges by start line (ascending order)
      // compareFn returns: negative if first < second, 0 if equal, positive if first > second
      ranges.sort((first, second) => {
        if (first.start < second.start) return -1;
        if (first.start > second.start) return 1;
        return 0;
      });

      // Merge overlapping or adjacent ranges
      const merged: Array<{start: number; end: number}> = [];
      let current = ranges[0];

      for (let i = 1; i < ranges.length; i++) {
        const next = ranges[i];

        if (next.start <= current.end + 1) {
          // Ranges overlap or are adjacent - merge them
          current.end = Math.max(current.end, next.end);
        } else {
          // Gap between ranges - save current and start new
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);

      // Extract hunk for each merged range
      for (const range of merged) {
        const hunk = extractHunkForLineRange(patch, range.start, range.end, side);
        if (hunk) {
          extractedHunks.push(hunk);
        }
      }
    }

    if (extractedHunks.length > 0) {
      files.push({ path, hunks: extractedHunks });
    }
  }

  return { files };
}

/**
 * Common helper to create PR from extracted changes.
 */
async function createSplicePr(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  changes: ExtractedChange | ExtractedChange[],
  commentContext: CommentContext,
  instruction: ReturnType<typeof parseInstruction>,
  metadata: {
    branchNameBase: string;
    defaultTitle: string;
    description: string;
  }
): Promise<SpliceResult> {
  // Get PR details
  core.info(`Getting PR #${prNumber} details...`);
  const prDetails = await getPrDetails(octokit, owner, repo, prNumber);

  // Determine the base branch
  const baseBranch = instruction?.base || prDetails.baseBranch;

  // Generate or use custom branch name, appending suffix if exists
  let branchName = instruction?.branch || metadata.branchNameBase;
  let suffix = 2;
  while (await branchExists(octokit, owner, repo, branchName)) {
    const baseName = instruction?.branch || metadata.branchNameBase;
    branchName = `${baseName}-${suffix}`;
    suffix++;
  }

  // Create the new branch
  core.info(`Creating branch ${branchName}...`);
  await createBranch(octokit, owner, repo, branchName, baseBranch);

  // Use custom title or default
  const prTitle = instruction?.title || metadata.defaultTitle;

  // Commit the changes
  const changesArray = Array.isArray(changes) ? changes : [changes];
  core.info(`Committing ${changesArray.length} file(s)...`);
  await commitChanges(
    octokit,
    owner,
    repo,
    branchName,
    changes,
    baseBranch,
    prTitle,
    prNumber,
    commentContext.authorLogin,
    commentContext.authorEmail
  );

  // Create the PR
  core.info('Creating pull request...');
  const newPr = await createPullRequest(
    octokit,
    owner,
    repo,
    prTitle,
    metadata.description,
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
  const successMessage = `✅ **Splice Bot** created:\n [#${newPr.number} - ${prTitle}](${newPr.url})`;

  // Use appropriate reply method based on whether this is a review comment or issue comment
  if (commentContext.path) {
    // Review comment - use replyToComment
    await replyToComment(octokit, owner, repo, prNumber, commentContext.commentId, successMessage);
  } else {
    // Issue comment - use createIssueComment
    await createIssueComment(octokit, owner, repo, prNumber, successMessage);
  }

  return {
    success: true,
    prUrl: newPr.url,
    branchName,
  };
}

/**
 * Unified splice operation: handles both single-comment and batch splices.
 * Single-comment splices are treated as batches of size 1 with synthetic batch ID.
 */
async function spliceBatch(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  batchId: string,
  isSyntheticBatch: boolean,
  shipCommentContext: CommentContext,
  instruction: ReturnType<typeof parseInstruction>
): Promise<SpliceResult> {
  try {
    // Step 1: Collect batch comments
    // ONLY special casing: synthetic batch vs explicit batch
    const batchComments = isSyntheticBatch
      ? [shipCommentContext]
      : await collectBatchComments(octokit, owner, repo, prNumber, batchId);

    if (batchComments.length === 0) {
      const errorMessage = `No comments found in batch:${batchId}`;
      const errorMsg = `❌ **Splice Bot Error**\n\n${errorMessage}`;

      // Use appropriate reply method
      if (shipCommentContext.path) {
        await replyToComment(octokit, owner, repo, prNumber, shipCommentContext.commentId, errorMsg);
      } else {
        await createIssueComment(octokit, owner, repo, prNumber, errorMsg);
      }

      return { success: false, error: errorMessage };
    }

    core.info(`Processing batch:${batchId} with ${batchComments.length} comment(s)`);

    // Step 2: Merge all comments into unified changes
    const batchedChanges = await mergeBatchComments(octokit, owner, repo, prNumber, batchComments);

    if (batchedChanges.files.length === 0) {
      const errorMessage = `Could not extract changes from batch:${batchId}`;
      const errorMsg = `❌ **Splice Bot Error**\n\n${errorMessage}`;

      // Use appropriate reply method
      if (shipCommentContext.path) {
        await replyToComment(octokit, owner, repo, prNumber, shipCommentContext.commentId, errorMsg);
      } else {
        await createIssueComment(octokit, owner, repo, prNumber, errorMsg);
      }

      return { success: false, error: errorMessage };
    }

    // Step 3: Generate metadata (NO branching - same logic for all)
    const prDetails = await getPrDetails(octokit, owner, repo, prNumber);

    const branchNameBase = `splice/pr-${prNumber}-${batchId}`;
    const defaultTitle = `[Splice] ${batchId} from PR #${prNumber}`;
    const description = generateBatchDescription({
      originalPrNumber: prNumber,
      originalPrTitle: prDetails.title,
      batchId,
      filePaths: batchedChanges.files.map(f => f.path),
      commentId: shipCommentContext.commentId,
      authorLogin: shipCommentContext.authorLogin,
      customDescription: instruction?.description,
    });

    // Step 4: Create the PR
    return await createSplicePr(
      octokit,
      owner,
      repo,
      prNumber,
      batchedChanges.files,
      shipCommentContext,
      instruction,
      {
        branchNameBase,
        defaultTitle,
        description,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.error(`Batch splice operation failed: ${errorMessage}`);

    // Try to reply with error
    try {
      const errorMsg = `❌ **Splice Bot Error**\n\n${errorMessage}\n\nPlease check the action logs for more details.`;

      // Use appropriate reply method
      if (shipCommentContext.path) {
        await replyToComment(octokit, owner, repo, prNumber, shipCommentContext.commentId, errorMsg);
      } else {
        await createIssueComment(octokit, owner, repo, prNumber, errorMsg);
      }
    } catch (replyError) {
      core.warning(`Could not reply to comment: ${replyError}`);
    }

    return { success: false, error: errorMessage };
  }
}

run();
