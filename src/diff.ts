import { GitHub } from '@actions/github/lib/utils';
import { ExtractedChange, DiffHunk } from './types';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Parse a unified diff hunk header
 * Format: @@ -oldStart,oldLines +newStart,newLines @@
 */
function parseHunkHeader(header: string): { oldStart: number; oldLines: number; newStart: number; newLines: number } | null {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return null;
  }

  return {
    oldStart: parseInt(match[1], 10),
    oldLines: parseInt(match[2] || '1', 10),
    newStart: parseInt(match[3], 10),
    newLines: parseInt(match[4] || '1', 10),
  };
}

/**
 * Represents a line in the diff with its metadata
 */
interface DiffLine {
  content: string;
  type: 'context' | 'addition' | 'deletion';
  oldLineNum: number | null;
  newLineNum: number | null;
}

/**
 * Extract only the selected lines from a file's diff
 */
export function extractHunkForLineRange(filePatch: string, startLine: number, endLine: number): DiffHunk | null {
  const lines = filePatch.split('\n');
  const allDiffLines: DiffLine[] = [];

  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;

  // Parse all lines with their line numbers
  for (const line of lines) {
    const header = parseHunkHeader(line);
    if (header) {
      currentOldLine = header.oldStart;
      currentNewLine = header.newStart;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith('+')) {
      allDiffLines.push({
        content: line,
        type: 'addition',
        oldLineNum: null,
        newLineNum: currentNewLine,
      });
      currentNewLine++;
    } else if (line.startsWith('-')) {
      allDiffLines.push({
        content: line,
        type: 'deletion',
        oldLineNum: currentOldLine,
        newLineNum: null,
      });
      currentOldLine++;
    } else {
      // Context line
      allDiffLines.push({
        content: line,
        type: 'context',
        oldLineNum: currentOldLine,
        newLineNum: currentNewLine,
      });
      currentOldLine++;
      currentNewLine++;
    }
  }

  // Filter to only include lines within the selected range
  // Include a line if:
  // - It's an addition/context and its newLineNum is in range
  // - It's a deletion that's adjacent to selected lines (same oldLineNum region)
  const selectedLines: DiffLine[] = [];
  let minOldLine = Infinity;
  let maxOldLine = 0;
  let minNewLine = Infinity;
  let maxNewLine = 0;

  // First pass: find additions and context lines in range
  for (const diffLine of allDiffLines) {
    if (diffLine.newLineNum !== null &&
        diffLine.newLineNum >= startLine &&
        diffLine.newLineNum <= endLine) {
      selectedLines.push(diffLine);
      if (diffLine.oldLineNum !== null) {
        minOldLine = Math.min(minOldLine, diffLine.oldLineNum);
        maxOldLine = Math.max(maxOldLine, diffLine.oldLineNum);
      }
      minNewLine = Math.min(minNewLine, diffLine.newLineNum);
      maxNewLine = Math.max(maxNewLine, diffLine.newLineNum);
    }
  }

  // Second pass: include deletions that are adjacent to our selected additions
  // We need to find deletions that occur immediately before the first selected line
  // or within the old line range if we have context lines
  for (let i = 0; i < allDiffLines.length; i++) {
    const diffLine = allDiffLines[i];
    if (diffLine.type === 'deletion' && diffLine.oldLineNum !== null) {
      // Include deletion if it's within our old line range (when we have context)
      if (minOldLine !== Infinity && diffLine.oldLineNum >= minOldLine && diffLine.oldLineNum <= maxOldLine + 1) {
        if (!selectedLines.includes(diffLine)) {
          selectedLines.push(diffLine);
        }
      }
      // Also include deletions that are immediately followed by our selected additions
      // Check if the next line in the diff is one of our selected additions
      else if (i + 1 < allDiffLines.length) {
        const nextLine = allDiffLines[i + 1];
        if (selectedLines.includes(nextLine) && nextLine.type === 'addition') {
          if (!selectedLines.includes(diffLine)) {
            selectedLines.push(diffLine);
          }
        }
      }
    }
  }

  if (selectedLines.length === 0) {
    return null;
  }

  // Sort by original position in diff
  selectedLines.sort((a, b) => {
    const aIdx = allDiffLines.indexOf(a);
    const bIdx = allDiffLines.indexOf(b);
    return aIdx - bIdx;
  });

  // Calculate new hunk header values
  let oldLinesCount = 0;
  let newLinesCount = 0;

  for (const diffLine of selectedLines) {
    if (diffLine.type === 'deletion') {
      oldLinesCount++;
    } else if (diffLine.type === 'addition') {
      newLinesCount++;
    } else {
      oldLinesCount++;
      newLinesCount++;
    }
  }

  // Find the starting line numbers
  const firstOldLine = selectedLines.find(l => l.oldLineNum !== null)?.oldLineNum || 1;
  const firstNewLine = selectedLines.find(l => l.newLineNum !== null)?.newLineNum || 1;

  // Build the hunk content with header
  const header = `@@ -${firstOldLine},${oldLinesCount} +${firstNewLine},${newLinesCount} @@`;
  const content = [header, ...selectedLines.map(l => l.content)].join('\n');

  return {
    oldStart: firstOldLine,
    oldLines: oldLinesCount,
    newStart: firstNewLine,
    newLines: newLinesCount,
    content,
  };
}

/**
 * Get the file diff from a PR
 */
export async function getFileDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string
): Promise<string | null> {
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const file = files.find(f => f.filename === filePath);
  if (!file || !file.patch) {
    return null;
  }

  return file.patch;
}

/**
 * Get the full file content at a specific commit
 */
export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data && data.type === 'file') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Apply a diff hunk to base content to get the new content
 */
export function applyHunk(baseContent: string, hunk: DiffHunk): string {
  // Handle empty base content (new files)
  const baseLines = baseContent === '' ? [] : baseContent.split('\n');
  const hunkLines = hunk.content.split('\n');

  // Remove the hunk header
  const patchLines = hunkLines.slice(1);

  // Build the result
  const result: string[] = [];

  // Add lines before the hunk
  for (let i = 0; i < hunk.oldStart - 1; i++) {
    result.push(baseLines[i]);
  }

  // Apply the hunk
  for (const line of patchLines) {
    if (line.startsWith('+')) {
      // Addition - add the new line
      result.push(line.substring(1));
    } else if (line.startsWith('-')) {
      // Deletion - skip this line from base
      continue;
    } else if (line.startsWith(' ') || line === '') {
      // Context line
      result.push(line.substring(1) || '');
    }
  }

  // Add lines after the hunk
  const afterHunkStart = hunk.oldStart - 1 + hunk.oldLines;
  for (let i = afterHunkStart; i < baseLines.length; i++) {
    result.push(baseLines[i]);
  }

  return result.join('\n');
}

/**
 * Extract changes for a specific file and line range
 */
export async function extractChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  startLine: number,
  endLine: number
): Promise<ExtractedChange | null> {
  const patch = await getFileDiff(octokit, owner, repo, prNumber, filePath);
  if (!patch) {
    return null;
  }

  const hunk = extractHunkForLineRange(patch, startLine, endLine);
  if (!hunk) {
    return null;
  }

  return {
    path: filePath,
    hunks: [hunk],
  };
}
