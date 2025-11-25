# Splice Bot - Development Notes

## Project Summary

Splice Bot is a GitHub Action that extracts selected lines from PR diffs and creates new focused PRs. Triggered by review comments containing `splice-bot`.

## Current Status

MVP complete with:
- Fine-grained line selection (not just full hunks)
- Single-file extraction
- Custom PR titles via `splice-bot "title"` or `splice-bot title:"title"`
- Commit authorship matches comment author
- Branch cleanup on re-runs
- Post-merge notification comments
- Configurable on-merge actions (comment, label)

## Architecture

```
src/
├── index.ts    - Entry point, event handling
├── types.ts    - TypeScript interfaces
├── parser.ts   - Command parsing
├── diff.ts     - Diff extraction and hunk application
└── github.ts   - GitHub API operations
```

## Key Design Decisions

1. **Line selection**: Extracts only selected lines plus adjacent deletions, not full hunks
2. **Base branch**: Defaults to original PR's base, configurable via `base:` option
3. **Branch naming**: `splice/pr-{number}-{commentId}` (uses comment ID for uniqueness)
4. **Commit strategy**: Single clean commit with author from comment

## Repository Setup

### Two-Repo Structure

**Main repo (`jcommelin/splice-pr`)** - Stable code
- `master` branch contains tested, stable code
- Feature branches for new features (e.g., `feature/on-merge-label`)
- Workflow uses `jcommelin/splice-pr@master` for users to copy

**Test repo (`jcommelin/test-splice`)** - Testing
- Contains dummy files for testing splice operations
- Workflow uses feature branches or `@dev` for testing
- All end-to-end testing happens here
- Can be messy with test PRs and branches

### Development Workflow

1. Create feature branch in main repo
2. Update test-splice workflow to use that feature branch
3. Test thoroughly in test-splice
4. Merge feature branch to master in main repo
5. Update test-splice workflow to use `@master`

### Test Repo Structure

```
test-splice/
├── src/
│   ├── auth.ts        # Authentication module (~100 lines)
│   ├── database.ts    # Database utilities (~100 lines)
│   └── api.ts         # API handlers (~100 lines)
├── lib/
│   ├── utils.ts       # Utility functions (~100 lines)
│   └── validators.ts  # Validation helpers (~100 lines)
├── app.js             # Main app entry
├── calculator.js      # Simple calculator
└── README.md
```

## Implemented Features

### Scope Modifiers

#### `--entire-file`
```
splice-bot --entire-file
```
Extract the entire file's changes into a new PR. Extracts all hunks from the file.

#### `--entire-hunk`
```
splice-bot --entire-hunk
```
Extract the full hunk containing the comment. Good middle ground between line selection and entire file.

### PR Creation Options
```
splice-bot labels:bug,urgent reviewers:@alice,@bob --draft branch:fix/auth-bug
```

- **labels**: Auto-assign labels to the new PR
- **reviewers**: Auto-assign reviewers to the new PR
- **--draft**: Create as draft PR
- **branch**: Custom branch name (override auto-generated)

### Post-Merge Sync

When a spliced PR is merged, the action can:
- Post a notification comment on the original PR
- Add a label to the original PR (default: `needs-sync`)

**Configuration**:
```yaml
- uses: jcommelin/splice-pr@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    on-merge: comment,label  # default: both
    sync-label: needs-sync   # default: needs-sync
```

### Conflict Preview
Before creating the PR, checks if changes would conflict with current base branch. Includes warning in reply if conflicts are likely.

### Improved PR Description
Generated PR description includes:
- Link back to original PR and specific comment
- Requesting user mention (@author)
- File path and line range
- Custom description support
- Machine-readable metadata for post-merge callbacks

## Testing

```bash
npm test        # Run Jest tests
npm run build   # Build for distribution
```

### End-to-End Testing with `gh`

Create review comments using `gh api` with JSON input:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews \
  --method POST \
  --input - <<EOF
{
  "event": "COMMENT",
  "body": "Testing splice-bot",
  "comments": [
    {
      "path": "example.js",
      "start_line": 14,
      "line": 17,
      "body": "splice-bot title:\"My title\" labels:bug,enhancement reviewers:alice --draft branch:custom-name"
    }
  ]
}
EOF
```

Use `start_line` + `line` for multi-line selections, or just `line` for single-line.

Verify results with `gh pr view {pr_number} --json labels,reviewRequests,isDraft`.

## Known Limitations

- Single file per splice operation
- Requires repository settings: "Allow GitHub Actions to create and approve pull requests"
- New files must be handled specially (no base content)

---

## Batching v2 Design

### Overview

Batching allows collecting multiple selections across files into a single PR. Uses review comments as stateless storage - no external database needed.

### Command Syntax

```
splice-bot batch:refactor              # Add selection to "refactor" batch (no immediate action)
splice-bot batch:refactor --ship       # Finalize and create PR from all "refactor" selections
```

The `--ship` flag triggers PR creation. Without it, the bot replies reminding the user to add a `--ship` comment when ready.

### How It Works

**Collection phase:**
1. User leaves review comments with `splice-bot batch:<id>` on selected lines
2. Each comment triggers the action, but only replies with a reminder about `--ship`
3. Comments themselves store the selection metadata (file, lines, side)

**Execution phase:**
1. User posts `splice-bot batch:<id> --ship` (can be a regular comment, doesn't need line selection)
2. Action fetches all PR review comments
3. Filters for `splice-bot batch:<id>` commands (excluding `--ship` comments)
4. Parses each comment's selection: file path, line range, side (LEFT/RIGHT)
5. Groups by file, merges overlapping selections (union)
6. Creates single PR with all changes
7. Replies only to the `--ship` comment with PR link

### Side Handling (LEFT/RIGHT)

GitHub review comments include `side` and `start_side` fields:
- `side: "RIGHT"` → selection is on additions (new file lines)
- `side: "LEFT"` → selection is on deletions (old file lines)
- Mixed selection → `start_side` and `side` may differ

The extraction logic must respect these:
- RIGHT side: use `line`/`start_line` (new file line numbers)
- LEFT side: use `original_line`/`original_start_line` (old file line numbers)
- Mixed: extract the contiguous block spanning both sides

### Multi-File Support

Changes from `ExtractedChange` (single file) to `BatchedChanges`:
```typescript
interface BatchedChanges {
  files: ExtractedChange[];  // Multiple files
}
```

The `commitChanges` function creates blobs/trees for all files in one commit.

### Selection Merging (Union)

When multiple selections in the same file overlap:
```
Selection 1: lines 10-20 (additions)
Selection 2: lines 15-25 (additions)
Result: lines 10-25 (union)
```

Non-overlapping selections in same file become separate hunks:
```
Selection 1: lines 10-15
Selection 2: lines 30-35
Result: Two hunks, both included
```

### Design Decisions

1. **Per-PR only**: Batches are scoped to a single PR
2. **Anyone can ship**: Common use case is one reviewer doing multiple comments + `--ship` in same review
3. **No expiration**: Old batch comments are harmless if never shipped
4. **No partial ship**: All selections in a batch are included. KISS.
5. **Single response**: Only reply to `--ship` comment, not every batch comment

### Implementation Steps

#### 1. Update types.ts
- Add `side: 'LEFT' | 'RIGHT'` and `startSide: 'LEFT' | 'RIGHT' | null` to `CommentContext`
- Add `BatchedChanges` interface: `{ files: ExtractedChange[] }`

#### 2. Update parser.ts
- Parse `--ship` flag
- `batch:<id>` parsing already exists but is unused

#### 3. Update index.ts - capture side info
- Extract `comment.side` and `comment.start_side` from payload
- Add to `CommentContext`

#### 4. Update diff.ts - respect side in extraction
- Modify `extractHunkForLineRange` signature to accept side info
- Use appropriate line numbers based on side

#### 5. Add batch collection (new function in github.ts or index.ts)
- `collectBatchSelections(octokit, owner, repo, prNumber, batchId)`
- Fetch all PR review comments via `octokit.rest.pulls.listReviewComments`
- Filter for `splice-bot batch:<batchId>` (excluding `--ship`)
- Parse each comment's selection metadata

#### 6. Add batch merging (new function in diff.ts)
- `mergeSelections(selections: Selection[]): BatchedChanges`
- Group by file path
- For same-file: compute union of line ranges
- Sort for deterministic output

#### 7. Update commitChanges in github.ts
- Accept `BatchedChanges` instead of `ExtractedChange`
- Create blob for each file
- Build tree with all file changes
- Single commit

#### 8. Update main flow in index.ts
- If `batch:<id>` without `--ship`: reply with reminder
- If `batch:<id> --ship`: run batch flow
- Non-batch commands: existing single-selection flow

---

## Future Enhancements

### Auto-merge base into original PR
Merge base branch into original PR's head branch automatically after spliced PR merges.
- Pro: Preserves history, automatic, safe
- Con: Creates merge commit

### Deferred Features
- Duplicate detection (prevent same selection being spliced twice)
- Immediate acknowledgment comment before processing
- Include imports automatically
- Dependency detection warnings

---

## Open TODOs

### High Priority

#### Debug line extraction bug
When creating a review comment on line 4 of a new file, the wrong content was extracted.
- **Example**: PR #3 - comment on line 4 (`export const baz = 3;`) extracted line 1 content
- **Code location**: [diff.ts](src/diff.ts) - `extractHunkForLineRange` and related functions
- **Root cause**: Likely issue with how new files (no base content) are handled
- **Action**: Add test cases to reproduce and fix

#### Investigate PR #1 workflow triggers broken
After force-pushing to `test/original-pr-for-callback` branch, workflows stopped triggering.
- Works fine on fresh PRs (PR #4, #6)
- May be a GitHub security feature after force-push
- **Action**: Can likely just close PR #1 and use fresh PRs for testing

### Before Release to Master

#### Cleanup test files
- Remove `src/test-callback.ts`
- Remove `src/label-test.ts`
- Remove `src/fresh-test.ts`
- Remove corresponding `dist/*.d.ts` and `dist/*.d.ts.map` files

#### Cleanup test branches
Delete branches:
- `test/original-pr-for-callback`
- `test/base-for-callback`
- `test/fresh-pr`
- `test/label-feature`
- `splice/pr-*` branches

#### Close test PRs
- PR #1, #4, #6 - close without merging

### Future Refactoring

#### Refactor `diff.ts`
- Deletion handling may not be correct in all cases
- Move `getFileDiff`, `getFileContent`, and `extractChanges` (functions using Octokit) to `github.ts`
- Keep `diff.ts` focused on pure diff parsing/application logic

---

## Development Log

### Session 1
- Implemented complete MVP
- Added fine-grained line selection
- Fixed new file handling
- Set commit author to comment author
- Documented repository permission requirements

### Session 2
- Added v2 features: labels, reviewers, draft PRs, custom branch names
- Added conflict preview warning
- Improved PR description format
- Fixed branch naming to use commentId for uniqueness
- Added `--entire-hunk` and `--entire-file` scope modifiers
- Tested all features with `gh api` commands

### Session 3
- Implemented post-merge callback: notification comment on original PR
- Added JSON metadata footer to PR descriptions for parsing
- Added configurable `on-merge` input for comment/label actions
- Set up two-repo structure (main + test-splice) for development workflow
- Added dummy files to test-splice for comprehensive testing
