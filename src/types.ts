/**
 * Parsed options from a splice-bot command comment.
 *
 * Example command:
 *   splice-bot "Fix auth bug" labels:bug,urgent reviewers:@alice --draft
 *
 * Maps command syntax to structured options:
 *   - title:"..." or first quoted string → title
 *   - description:"..." → description
 *   - labels:a,b → labels array
 *   - reviewers:@a,@b → reviewers array
 *   - --draft → draft: true
 *   - --entire-hunk → entireHunk: true
 *   - --entire-file → entireFile: true
 *   - base:branch-name → base
 *   - branch:custom-name → branch
 *   - batch:id → batch (future feature)
 */
export interface SpliceInstruction {
  /** Custom title for the spliced PR (defaults to "Splice from PR #N") */
  title?: string;
  /** Custom description for the PR body */
  description?: string;
  /** Labels to apply to the new PR */
  labels?: string[];
  /** GitHub usernames to request as reviewers */
  reviewers?: string[];
  /** Create the PR as a draft */
  draft?: boolean;
  /** Extract the entire hunk containing the comment, not just selected lines */
  entireHunk?: boolean;
  /** Extract all changes to the file, not just selected lines */
  entireFile?: boolean;
  /** Target base branch for the new PR (defaults to original PR's base) */
  base?: string;
  /** Custom branch name (overrides auto-generated splice/pr-N-commentId) */
  branch?: string;
  /** Batch ID for combining multiple splice comments (future feature) */
  batch?: string;
  /** Finalize and create PR for the batch (used with batch option) */
  ship?: boolean;
}

/**
 * Context extracted from a GitHub pull_request_review_comment event.
 *
 * Captures all information needed to identify what code was selected
 * and who requested the splice operation.
 */
export interface CommentContext {
  /** Unique ID of the review comment (used in branch naming) */
  commentId: number;
  /** PR number where the comment was made */
  prNumber: number;
  /** File path the comment is attached to */
  path: string;
  /** First line of selection in the new file (after changes) */
  startLine: number;
  /** Last line of selection in the new file (after changes) */
  endLine: number;
  /** First line of selection in the old file (before changes), null for additions */
  originalStartLine: number | null;
  /** Last line of selection in the old file (before changes), null for additions */
  originalEndLine: number | null;
  /** The diff hunk snippet shown in the GitHub comment UI */
  diffHunk: string;
  /** Full text of the comment (contains the splice-bot command) */
  body: string;
  /** SHA of the commit the comment is attached to */
  commitId: string;
  /** GitHub username of the comment author (becomes commit author) */
  authorLogin: string;
  /** Email address for the commit author */
  authorEmail: string;
  /** Which side of the diff the comment is on: LEFT = old file (deletions), RIGHT = new file (additions) */
  side: 'LEFT' | 'RIGHT';
  /** Side for start of multi-line selection, null for single-line comments */
  startSide: 'LEFT' | 'RIGHT' | null;
}

/**
 * The extracted diff changes to be applied in the new spliced PR.
 *
 * Contains a single file's path and the hunks selected for extraction.
 */
export interface ExtractedChange {
  /** File path being modified */
  path: string;
  /** Diff hunks to apply (usually one, but could be multiple with --entire-file) */
  hunks: DiffHunk[];
}

/**
 * A single hunk from a unified diff.
 *
 * Corresponds to the unified diff format header:
 *   @@ -oldStart,oldLines +newStart,newLines @@
 *
 * Used both for extraction (parsing PR diffs) and application (creating
 * new file content by applying the hunk to base branch content).
 */
export interface DiffHunk {
  /** Starting line number in the old (base) file */
  oldStart: number;
  /** Number of lines from the old file in this hunk */
  oldLines: number;
  /** Starting line number in the new (changed) file */
  newStart: number;
  /** Number of lines in the new file in this hunk */
  newLines: number;
  /** Raw diff content including header and all +/-/space prefixed lines */
  content: string;
}

/**
 * Result of a splice operation.
 *
 * Returned from the main splice flow to indicate success/failure
 * and provide details for the reply comment.
 */
export interface SpliceResult {
  /** Whether the splice operation completed successfully */
  success: boolean;
  /** URL of the created PR (on success) */
  prUrl?: string;
  /** Name of the created branch (on success) */
  branchName?: string;
  /** Error message describing what went wrong (on failure) */
  error?: string;
}

/**
 * Batched changes from multiple splice comments.
 *
 * Aggregates multiple selections across potentially multiple files
 * into a single set of changes to be committed together.
 */
export interface BatchedChanges {
  /** Extracted changes grouped by file */
  files: ExtractedChange[];
}
