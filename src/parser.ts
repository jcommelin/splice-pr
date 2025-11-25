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
  if (/--ship\b/i.test(args)) {
    instruction.ship = true;
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

/** Options for generating a batch PR description */
export interface BatchDescriptionOptions {
  /** PR number of the source PR */
  originalPrNumber: number;
  /** Title of the source PR */
  originalPrTitle: string;
  /** Batch ID (explicit batch name or synthetic c{commentId}) */
  batchId: string;
  /** List of files being spliced */
  filePaths: string[];
  /** Comment ID (for metadata) */
  commentId: number;
  /** GitHub username who requested the splice */
  authorLogin: string;
  /** Optional custom description from the command */
  customDescription?: string;
}

/**
 * Generate PR description for batch splice operations.
 *
 * Works uniformly for both single-file (synthetic batch) and multi-file (explicit batch) splices.
 * Lists all files being spliced with bullet points.
 */
export function generateBatchDescription(options: BatchDescriptionOptions): string {
  const {
    originalPrNumber,
    originalPrTitle,
    batchId,
    filePaths,
    commentId,
    authorLogin,
    customDescription,
  } = options;

  const fileList = filePaths.map(f => `- \`${f}\``).join('\n');

  const parts = [
    `Spliced from #${originalPrNumber} (${originalPrTitle})`,
    '',
    `**Batch ID**: \`${batchId}\``,
    `**Files**:`,
    fileList,
    '',
    `**Requested by**: @${authorLogin}`,
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
