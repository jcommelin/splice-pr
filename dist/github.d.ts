import { GitHub } from '@actions/github/lib/utils';
import { ExtractedChange } from './types';
type Octokit = InstanceType<typeof GitHub>;
/**
 * Get PR details
 */
export declare function getPrDetails(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<{
    title: string;
    baseBranch: string;
    headBranch: string;
    headSha: string;
}>;
/**
 * Create a new branch from the base branch
 */
export declare function createBranch(octokit: Octokit, owner: string, repo: string, branchName: string, baseBranch: string): Promise<void>;
/**
 * Commit changes to the new branch
 */
export declare function commitChanges(octokit: Octokit, owner: string, repo: string, branchName: string, changes: ExtractedChange, baseBranch: string, commitMessage: string, originalPrNumber: number, authorName: string, authorEmail: string): Promise<string>;
/**
 * Create a pull request
 */
export declare function createPullRequest(octokit: Octokit, owner: string, repo: string, title: string, body: string, head: string, base: string, draft?: boolean): Promise<{
    number: number;
    url: string;
}>;
/**
 * Add labels to a pull request
 */
export declare function addLabels(octokit: Octokit, owner: string, repo: string, prNumber: number, labels: string[]): Promise<void>;
/**
 * Request reviewers for a pull request
 */
export declare function requestReviewers(octokit: Octokit, owner: string, repo: string, prNumber: number, reviewers: string[]): Promise<void>;
/**
 * Check if changes would conflict with base branch
 * Returns true if there might be conflicts
 */
export declare function checkForConflicts(octokit: Octokit, owner: string, repo: string, path: string, baseBranch: string, prHeadBranch: string): Promise<boolean>;
/**
 * Reply to the original comment
 */
export declare function replyToComment(octokit: Octokit, owner: string, repo: string, prNumber: number, commentId: number, message: string): Promise<void>;
/**
 * Create a comment on a PR/issue
 */
export declare function createIssueComment(octokit: Octokit, owner: string, repo: string, issueNumber: number, body: string): Promise<void>;
/**
 * Check if a branch exists
 */
export declare function branchExists(octokit: Octokit, owner: string, repo: string, branchName: string): Promise<boolean>;
/**
 * Delete a branch
 */
export declare function deleteBranch(octokit: Octokit, owner: string, repo: string, branchName: string): Promise<void>;
export {};
