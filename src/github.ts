import { GitHub } from '@actions/github/lib/utils';
import { CommentContext, ExtractedChange, DiffHunk } from './types';
import { getFileContent, applyHunk } from './diff';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Get PR details
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
 * Create a new branch from the base branch
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
 * Get the tree SHA for a commit
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
 * Create a blob for file content
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
 * Commit changes to the new branch
 */
export async function commitChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  changes: ExtractedChange,
  baseBranch: string,
  commitMessage: string,
  originalPrNumber: number,
  authorName: string,
  authorEmail: string
): Promise<string> {
  // Get the base branch SHA
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.object.sha;

  // Get the base tree
  const baseTreeSha = await getTreeSha(octokit, owner, repo, baseSha);

  // Get the original file content from base
  // For new files, baseContent will be null - start with empty string
  const baseContent = await getFileContent(octokit, owner, repo, changes.path, baseBranch);

  // Apply all hunks to get the new content
  // For new files (baseContent is null), the hunk contains only additions
  let newContent = baseContent || '';
  for (const hunk of changes.hunks) {
    newContent = applyHunk(newContent, hunk);
  }

  // Create a blob for the new content
  const blobSha = await createBlob(octokit, owner, repo, newContent);

  // Create a new tree with the updated file
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [
      {
        path: changes.path,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      },
    ],
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
 * Create a pull request
 */
export async function createPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string
): Promise<{ number: number; url: string }> {
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  return {
    number: pr.number,
    url: pr.html_url,
  };
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

/**
 * Delete a branch
 */
export async function deleteBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string
): Promise<void> {
  await octokit.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  });
}
