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
export declare function createPullRequest(octokit: Octokit, owner: string, repo: string, title: string, body: string, head: string, base: string): Promise<{
    number: number;
    url: string;
}>;
/**
 * Reply to the original comment
 */
export declare function replyToComment(octokit: Octokit, owner: string, repo: string, prNumber: number, commentId: number, message: string): Promise<void>;
/**
 * Check if a branch exists
 */
export declare function branchExists(octokit: Octokit, owner: string, repo: string, branchName: string): Promise<boolean>;
/**
 * Delete a branch
 */
export declare function deleteBranch(octokit: Octokit, owner: string, repo: string, branchName: string): Promise<void>;
export {};
