import { SpliceInstruction } from './types';

/**
 * Parse splice-bot command from comment body
 * Supports formats:
 * - splice-bot
 * - splice-bot "PR title"
 * - splice-bot title:"PR title" base:branch group:name
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
      case 'group':
        instruction.group = value;
        break;
      case 'base':
        instruction.base = value;
        break;
      case 'description':
        instruction.description = value;
        break;
    }
  }

  return instruction;
}

/**
 * Generate a branch name for the spliced PR
 */
export function generateBranchName(prNumber: number, commitId: string): string {
  const shortHash = commitId.substring(0, 7);
  return `splice/pr-${prNumber}-${shortHash}`;
}

/**
 * Generate a PR title if not provided
 */
export function generatePrTitle(originalPrTitle: string, path: string): string {
  const fileName = path.split('/').pop() || path;
  return `[Splice] Extract changes from ${fileName}`;
}

/**
 * Generate PR description
 */
export function generatePrDescription(
  originalPrNumber: number,
  originalPrTitle: string,
  path: string,
  customDescription?: string
): string {
  const parts = [
    `## Spliced from #${originalPrNumber}`,
    '',
    `This PR was automatically created by Splice Bot, extracting changes from:`,
    `- **Original PR**: #${originalPrNumber} - ${originalPrTitle}`,
    `- **File**: \`${path}\``,
  ];

  if (customDescription) {
    parts.push('', '## Description', '', customDescription);
  }

  parts.push(
    '',
    '---',
    '*Created by [Splice Bot](https://github.com/your-org/splice-bot-action)*'
  );

  return parts.join('\n');
}
