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

## Future Enhancements

### Batching Multiple Comments

```
splice-bot batch:refactor  # on file1.ts line 10
splice-bot batch:refactor  # on file2.ts line 25
splice-bot batch:refactor  # on file1.ts line 50
```

Collect all comments with matching batch ID and create single PR with all changes.

**Open questions**:
1. **Trigger timing**: Explicit trigger comment recommended
2. **Same-file conflicts**: Apply in line-number order or reject?
3. **Partial failures**: Create PR with successful extractions and report failures

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
