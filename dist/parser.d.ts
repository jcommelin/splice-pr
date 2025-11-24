/**
 * Command parsing for splice-bot comments.
 *
 * Parses review comment text into structured instructions and generates
 * branch names, PR titles, and PR descriptions for spliced PRs.
 */
import { SpliceInstruction } from './types';
/**
 * Parse splice-bot command from comment body.
 *
 * Supports multiple formats:
 * - `splice-bot` - bare command with defaults
 * - `splice-bot "PR title"` - simple quoted title
 * - `splice-bot title:"PR title" base:branch labels:a,b --draft` - full options
 *
 * @param body - The full comment text (may contain other content before/after)
 * @returns Parsed instruction or null if no splice-bot command found
 */
export declare function parseInstruction(body: string): SpliceInstruction | null;
/**
 * Generate a branch name for the spliced PR.
 *
 * Uses commentId for uniqueness, allowing multiple splices from the same PR.
 * Format: `splice/pr-{prNumber}-{commentId}`
 */
export declare function generateBranchName(prNumber: number, commentId: number): string;
/**
 * Generate a default PR title based on the file being spliced.
 *
 * Used when the user doesn't provide a custom title via `splice-bot "title"`.
 */
export declare function generatePrTitle(path: string): string;
/** Options for generating a spliced PR description */
export interface PrDescriptionOptions {
    /** PR number of the source PR */
    originalPrNumber: number;
    /** Title of the source PR */
    originalPrTitle: string;
    /** File path being spliced */
    path: string;
    /** First line of the selection */
    startLine: number;
    /** Last line of the selection */
    endLine: number;
    /** Comment ID (for linking back) */
    commentId: number;
    /** GitHub username who requested the splice */
    authorLogin: string;
    /** Optional custom description from the command */
    customDescription?: string;
}
/**
 * Generate PR description with metadata for post-merge callbacks.
 *
 * The description includes:
 * - Link to the original PR
 * - File and line range
 * - Link to the triggering comment
 * - Hidden JSON metadata for the merge callback to find the original PR
 */
export declare function generatePrDescription(options: PrDescriptionOptions): string;
