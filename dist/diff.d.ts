import { GitHub } from '@actions/github/lib/utils';
import { ExtractedChange, DiffHunk } from './types';
type Octokit = InstanceType<typeof GitHub>;
/**
 * Extract only the selected lines from a file's diff
 */
export declare function extractHunkForLineRange(filePatch: string, startLine: number, endLine: number): DiffHunk | null;
/**
 * Extract the entire hunk containing a specific line
 */
export declare function extractEntireHunkForLine(filePatch: string, line: number): DiffHunk | null;
/**
 * Extract all hunks from a file's patch (for entire-file extraction)
 */
export declare function extractAllHunks(filePatch: string): DiffHunk[];
/**
 * Get the file diff from a PR
 */
export declare function getFileDiff(octokit: Octokit, owner: string, repo: string, prNumber: number, filePath: string): Promise<string | null>;
/**
 * Get the full file content at a specific commit
 */
export declare function getFileContent(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<string | null>;
/**
 * Apply a diff hunk to base content to get the new content
 */
export declare function applyHunk(baseContent: string, hunk: DiffHunk): string;
/**
 * Extract changes for a specific file and line range
 */
export declare function extractChanges(octokit: Octokit, owner: string, repo: string, prNumber: number, filePath: string, startLine: number, endLine: number): Promise<ExtractedChange | null>;
export {};
