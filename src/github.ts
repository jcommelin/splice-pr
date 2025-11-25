/**
 * GitHub API operations for splice-bot.
 *
 * Thin wrappers around Octokit REST API calls, organized by function:
 * - PR operations: getPrDetails, createPullRequest, addLabels, requestReviewers
 * - Branch operations: createBranch, branchExists
 * - Git operations: commitChanges (creates blob, tree, commit)
 * - Comment operations: replyToComment, createIssueComment
 */

import { GitHub } from '@actions/github/lib/utils';
import { ExtractedChange } from './types';
import { getFileContent, applyHunk } from './diff';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Get basic PR metadata needed for splice operations.
 */
export async function getPrDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ title: string; baseBranch: string; headBranch: string; headSha: string }> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    title: pr.title,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    headSha: pr.head.sha,
  };
}

/**
 * Create a new branch pointing to the same commit as baseBranch.
 */
export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string
): Promise<void> {
  // Get the SHA of the base branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  // Create the new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });
}

/**
 * Get the tree SHA for a commit (used internally by commitChanges).
 */
async function getTreeSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  commitSha: string
): Promise<string> {
  const { data: commit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  });

  return commit.tree.sha;
}

/**
 * Create a blob for file content (used internally by commitChanges).
 */
async function createBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  content: string
): Promise<string> {
  const { data: blob } = await octokit.rest.git.createBlob({
    owner,
    repo,
    content,
    encoding: 'utf-8',
  });

  return blob.sha;
}

/**
 * Commit the spliced changes to the new branch.
 *
 * Supports both single-file and multi-file commits (for batching).
 *
 * Steps:
 * 1. Get base branch SHA and tree
 * 2. For each file: fetch base content, apply hunks, create blob
 * 3. Create tree with all modified files
 * 4. Create commit with custom author
 * 5. Update branch ref to point to new commit
 */
export async function commitChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  changes: ExtractedChange | ExtractedChange[],
  baseBranch: string,
  commitMessage: string,
  originalPrNumber: number,
  authorName: string,
  authorEmail: string
): Promise<string> {
  // Normalize to array for uniform processing
  const changesArray = Array.isArray(changes) ? changes : [changes];

  // Get the base branch SHA
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.object.sha;

  // Get the base tree
  const baseTreeSha = await getTreeSha(octokit, owner, repo, baseSha);

  // Process each file: apply hunks and create blobs
  const treeEntries = [];

  for (const fileChange of changesArray) {
    // Get the original file content from base
    // For new files, baseContent will be null - start with empty string
    const baseContent = await getFileContent(octokit, owner, repo, fileChange.path, baseBranch);

    // Apply all hunks to get the new content
    let newContent = baseContent || '';
    for (const hunk of fileChange.hunks) {
      newContent = applyHunk(newContent, hunk);
    }

    // Create a blob for the new content
    const blobSha = await createBlob(octokit, owner, repo, newContent);

    treeEntries.push({
      path: fileChange.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blobSha,
    });
  }

  // Create a new tree with all updated files
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // Create the commit with the comment author as the commit author
  const fullMessage = `${commitMessage}\n\nSpliced from PR #${originalPrNumber}`;
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: fullMessage,
    tree: newTree.sha,
    parents: [baseSha],
    author: {
      name: authorName,
      email: authorEmail,
    },
  });

  // Update the branch reference
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  });

  return newCommit.sha;
}

/**
 * Create a pull request from head branch to base branch.
 */
export async function createPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
  draft: boolean = false
): Promise<{ number: number; url: string }> {
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
    draft,
  });

  return {
    number: pr.number,
    url: pr.html_url,
  };
}

/**
 * Add labels to a PR (uses issues API since PRs are issues).
 */
export async function addLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[]
): Promise<void> {
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels,
  });
}

/**
 * Request reviewers for a pull request
 */
export async function requestReviewers(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  await octokit.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: prNumber,
    reviewers,
  });
}

/**
 * Check if changes would conflict with base branch
 * Returns true if there might be conflicts
 */
export async function checkForConflicts(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  baseBranch: string,
  prHeadBranch: string
): Promise<boolean> {
  try {
    // Compare the base branch with the PR head to see if the file was modified
    const { data: comparison } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseBranch,
      head: prHeadBranch,
    });

    // Check if the file exists in both the base branch changes and our splice
    // This is a simplified check - true conflicts would need actual merge attempt
    const modifiedInBase = comparison.files?.some(
      f => f.filename === path && f.status !== 'added'
    );

    return modifiedInBase || false;
  } catch {
    // If comparison fails, assume no conflicts to avoid blocking
    return false;
  }
}

/**
 * Reply to the original comment
 */
export async function replyToComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commentId: number,
  message: string
): Promise<void> {
  // Create a reply to the review comment
  await octokit.rest.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: commentId,
    body: message,
  });
}

/**
 * Create a comment on a PR/issue
 */
export async function createIssueComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

/**
 * Check if a branch exists
 */
export async function branchExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string
): Promise<boolean> {
  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
    return true;
  } catch (error) {
    return false;
  }
}

