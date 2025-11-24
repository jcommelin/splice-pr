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
export function parseInstruction(body: string): SpliceInstruction | null {
  const match = body.match(/splice-bot\s*(.*)/i);
  if (!match) {
    return null;
  }

  const instruction: SpliceInstruction = {};
  const args = match[1].trim();

  if (!args) {
    return instruction;
  }

  // Simple format: just a quoted title
  const simpleTitle = args.match(/^"([^"]+)"$/);
  if (simpleTitle) {
    instruction.title = simpleTitle[1];
    return instruction;
  }

  // Check for flags
  if (/--draft\b/i.test(args)) {
    instruction.draft = true;
  }
  if (/--entire-hunk\b/i.test(args)) {
    instruction.entireHunk = true;
  }
  if (/--entire-file\b/i.test(args)) {
    instruction.entireFile = true;
  }

  // Structured format: key:value or key:"value with spaces"
  const keyValuePattern = /(\w+):(?:"([^"]+)"|(\S+))/g;
  let keyMatch;

  while ((keyMatch = keyValuePattern.exec(args)) !== null) {
    const key = keyMatch[1].toLowerCase();
    const value = keyMatch[2] || keyMatch[3];

    switch (key) {
      case 'title':
        instruction.title = value;
        break;
      case 'batch':
        instruction.batch = value;
        break;
      case 'base':
        instruction.base = value;
        break;
      case 'description':
        instruction.description = value;
        break;
      case 'labels':
        instruction.labels = value.split(',').map(l => l.trim());
        break;
      case 'reviewers':
        // Remove @ prefix if present
        instruction.reviewers = value.split(',').map(r => r.trim().replace(/^@/, ''));
        break;
      case 'branch':
        instruction.branch = value;
        break;
    }
  }

  return instruction;
}

/**
 * Generate a branch name for the spliced PR.
 *
 * Uses commentId for uniqueness, allowing multiple splices from the same PR.
 * Format: `splice/pr-{prNumber}-{commentId}`
 */
export function generateBranchName(prNumber: number, commentId: number): string {
  return `splice/pr-${prNumber}-${commentId}`;
}

/**
 * Generate a default PR title based on the file being spliced.
 *
 * Used when the user doesn't provide a custom title via `splice-bot "title"`.
 */
export function generatePrTitle(path: string): string {
  const fileName = path.split('/').pop() || path;
  return `[Splice] Extract changes from ${fileName}`;
}

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
export function generatePrDescription(options: PrDescriptionOptions): string {
  const {
    originalPrNumber,
    originalPrTitle,
    path,
    startLine,
    endLine,
    commentId,
    authorLogin,
    customDescription,
  } = options;

  const lineRange = startLine === endLine ? `line ${endLine}` : `lines ${startLine}-${endLine}`;

  const parts = [
    `Spliced from #${originalPrNumber} (${originalPrTitle})`,
    '',
    `- **File**: \`${path}\` at ${lineRange}`,
    `- **Requested by**: @${authorLogin} ([view comment](../pull/${originalPrNumber}#discussion_r${commentId}))`,
  ];

  if (customDescription) {
    parts.push('', customDescription);
  }

  // Machine-readable metadata for post-merge callbacks
  const metadata = {
    'splice-bot': {
      'original-pr': originalPrNumber,
      'comment-id': commentId,
    },
  };

  parts.push(
    '',
    '---',
    '*Created by [Splice Bot](https://github.com/jcommelin/splice-pr)*',
    `<!-- ${JSON.stringify(metadata)} -->`
  );

  return parts.join('\n');
}
