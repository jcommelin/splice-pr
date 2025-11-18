import { SpliceInstruction } from './types';
/**
 * Parse splice-bot command from comment body
 * Supports formats:
 * - splice-bot
 * - splice-bot "PR title"
 * - splice-bot title:"PR title" base:branch group:name
 */
export declare function parseInstruction(body: string): SpliceInstruction | null;
/**
 * Generate a branch name for the spliced PR
 */
export declare function generateBranchName(prNumber: number, commitId: string): string;
/**
 * Generate a PR title if not provided
 */
export declare function generatePrTitle(originalPrTitle: string, path: string): string;
/**
 * Generate PR description
 */
export declare function generatePrDescription(originalPrNumber: number, originalPrTitle: string, path: string, customDescription?: string): string;
