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

## Future Enhancements

### Scope Modifiers ✅ IMPLEMENTED

#### `--entire-file` ✅
```
splice-bot --entire-file
```
Extract the entire file's changes into a new PR. Extracts all hunks from the file.

#### `--entire-hunk` ✅
```
splice-bot --entire-hunk
```
Extract the full hunk containing the comment. Good middle ground between line selection and entire file.

### Batching Multiple Comments

```
splice-bot batch:refactor  # on file1.ts line 10
splice-bot batch:refactor  # on file2.ts line 25
splice-bot batch:refactor  # on file1.ts line 50
```

Collect all comments with matching batch ID and create single PR with all changes.

**Open questions**:
1. **Trigger timing**: When does the batch execute?
   - Option A: After a timeout (e.g., 5 minutes of no new batch comments)
   - Option B: Explicit trigger comment: `splice-bot batch:refactor --execute`
   - Option C: First comment creates draft PR, subsequent comments add to it

2. **Same-file conflicts**: What if batch includes overlapping ranges in same file?
   - Apply in line-number order?
   - Reject overlapping selections?

3. **Cross-file ordering**: Does order matter for commit?
   - Probably not for most cases
   - Could sort alphabetically by path

4. **Partial failures**: What if one file extraction fails?
   - Fail entire batch?
   - Create PR with successful extractions and report failures?

**Decision for v2**: Option B (explicit trigger) - most predictable behavior.

Alternative approaches preserved for future consideration.

### Post-Merge Sync

**Problem**: After the spliced PR is merged, the original PR still contains those changes, leading to:
- Duplicate changes when original PR is merged
- Potential merge conflicts

**Proposed solutions**:

#### Option A: Comment notification (v3 - implement first)
Post a comment on the original PR when spliced PR is merged.
- Pro: Non-invasive, keeps author in control
- Con: Requires manual action
- **Simplest to implement, start here**

#### Option B: Add label to original PR (v3)
Add a label like `needs-rebase` or `spliced-merged` to the original PR.
- Pro: Visible in PR list, filterable
- Con: Label must exist in repo

#### Option C: Merge base into original PR (v3 - preferred automation)
Merge base branch into original PR's head branch.
- Pro: Preserves history, automatic, safe
- Con: Creates merge commit
- **Preferred over rebase - doesn't rewrite history**

#### Option D: Automatic rebase (not recommended)
When spliced PR merges, automatically rebase the original PR.
- Pro: Clean history
- Con: Dangerous - can fail, rewrites history, may surprise author
- **Avoid this approach**

**Implementation approach**:
1. Add `pull_request.closed` trigger to workflow
2. Check if `merged == true` and branch matches `splice/pr-*`
3. Parse original PR number from description ("Spliced from #123")
4. Execute callback action

**v3 Implementation order**:
1. Comment notification (simplest, most useful)
2. Add label to original PR
3. Merge base into original PR (configurable)

**Configuration** (future):
```yaml
- uses: jcommelin/splice-pr@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    on-merge: comment  # or: label, merge-base
```

### Additional Features (v2) ✅ IMPLEMENTED

#### PR Creation Options ✅
```
splice-bot labels:bug,urgent reviewers:@alice,@bob --draft branch:fix/auth-bug
```

- **labels**: Auto-assign labels to the new PR ✅
- **reviewers**: Auto-assign reviewers to the new PR ✅
- **--draft**: Create as draft PR ✅
- **branch**: Custom branch name (override auto-generated) ✅

#### Conflict Preview ✅
Before creating the PR, check if changes would conflict with current base branch. Include warning in reply if conflicts are likely.

**Implementation**:
- After extracting changes, compare branches to check for changes to same file
- If conflicts detected, warn in reply but still create PR
- User can then resolve conflicts in the new PR

#### Improved PR Description ✅
Updated the generated PR description to include:
- Link back to original PR and specific comment
- Requesting user mention (@author)
- File path and line range
- Custom description support

### Deferred Features
- Duplicate detection (prevent same selection being spliced twice)
- Immediate acknowledgment comment before processing
- Include imports automatically
- Dependency detection warnings

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
- Implemented post-merge callback: notification comment on original PR ✅
- Added JSON metadata footer to PR descriptions for parsing
- Added configurable `on-merge` input for comment/label actions
- Created `dev` branch workflow for testing before release to master

## Open TODOs

### High Priority

#### 1. Debug `needs-sync` label not being added
The label feature was implemented but the label is not appearing on the original PR after merge.
- **Branch**: `feature/on-merge-label` (commit 8cf8097)
- **Test PR**: #6 should have received the label when PR #7 was merged
- **Action**: Check workflow logs for run 19493949230 to see if `addLabels` failed or was skipped
- **Code location**: [index.ts:176-184](src/index.ts#L176-L184) - label addition logic

#### 2. Debug line extraction bug
When creating a review comment on line 4 of a new file, the wrong content was extracted.
- **Example**: PR #3 - comment on line 4 (`export const baz = 3;`) extracted line 1 content
- **Code location**: [diff.ts](src/diff.ts) - `extractHunkForLineRange` and related functions
- **Root cause**: Likely issue with how new files (no base content) are handled
- **Action**: Add test cases to reproduce and fix

#### 3. Investigate PR #1 workflow triggers broken
After force-pushing to `test/original-pr-for-callback` branch, workflows stopped triggering.
- Works fine on fresh PRs (PR #4, #6)
- May be a GitHub security feature after force-push
- **Action**: Can likely just close PR #1 and use fresh PRs for testing

### Before Release to Master

#### 4. Cleanup test files
- Remove `src/test-callback.ts`
- Remove `src/label-test.ts`
- Remove `src/fresh-test.ts`
- Remove corresponding `dist/*.d.ts` and `dist/*.d.ts.map` files

#### 5. Cleanup test branches
Delete branches:
- `test/original-pr-for-callback`
- `test/base-for-callback`
- `test/fresh-pr`
- `test/label-feature`
- `splice/pr-*` branches

#### 6. Close test PRs
- PR #1, #4, #6 - close without merging

## Branch Structure

- `master` - Stable release (currently at commit 5da7920 with comment notification only)
- `dev` - Development branch for testing before release (same as master currently)
- `feature/on-merge-label` - Label feature ready for testing (commit 8cf8097)
