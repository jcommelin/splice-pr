export interface SpliceInstruction {
  title?: string;
  group?: string;
  base?: string;
  description?: string;
}

export interface CommentContext {
  commentId: number;
  prNumber: number;
  path: string;
  startLine: number;
  endLine: number;
  originalStartLine: number | null;
  originalEndLine: number | null;
  diffHunk: string;
  body: string;
  commitId: string;
}

export interface ExtractedChange {
  path: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface SpliceResult {
  success: boolean;
  prUrl?: string;
  branchName?: string;
  error?: string;
}
