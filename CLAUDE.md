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
3. **Branch naming**: `splice/pr-{number}-{commit-short-hash}`
4. **Commit strategy**: Single clean commit with author from comment

## Future Enhancements

### Scope Modifiers

#### `entire-file`
```
splice-bot entire-file
```
Extract the entire file's changes into a new PR. Can be placed on any line in the file.

**Implementation considerations**:
- Get all hunks for the file from the PR diff
- Apply all hunks to create the spliced content
- Useful when a file represents a self-contained change

#### `entire-hunk`
```
splice-bot entire-hunk
```
Extract the full hunk containing the comment. Can be placed on any line within the hunk.

**Implementation considerations**:
- Already have hunk boundaries from diff parsing
- Simpler than `entire-file` - just don't filter lines
- Good middle ground between line selection and entire file

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

#### Option A: Automatic rebase
When spliced PR merges, automatically rebase the original PR on its base branch.
- Pro: Clean history, removes spliced changes
- Con: Can cause conflicts, may surprise PR author

#### Option B: Comment notification
Post a comment on the original PR suggesting manual rebase.
- Pro: Non-invasive, keeps author in control
- Con: Requires manual action

#### Option C: Update base branch
Merge base branch into original PR's head branch.
- Pro: Preserves history, automatic
- Con: Creates merge commit, may not remove duplicate code cleanly

**Implementation approach**:
- Listen for `pull_request.closed` event where `merged == true`
- Check if PR was created by splice-bot (branch name pattern or PR body marker)
- Find the original PR (stored in PR description or branch metadata)
- Execute chosen sync strategy

**Decision for v2**: Option B (comment notification) - safest, non-invasive, keeps author in control.

Alternative approaches preserved for future consideration (may add automation later).

### Additional Features (v2)

#### PR Creation Options
```
splice-bot labels:bug,urgent reviewers:@alice,@bob --draft branch:fix/auth-bug
```

- **labels**: Auto-assign labels to the new PR
- **reviewers**: Auto-assign reviewers to the new PR
- **--draft**: Create as draft PR
- **branch**: Custom branch name (override auto-generated)

#### Conflict Preview
Before creating the PR, check if changes would conflict with current base branch. Include warning in reply if conflicts are likely.

**Implementation**:
- After extracting changes, attempt a test merge
- If conflicts detected, warn in reply but still create PR
- User can then resolve conflicts in the new PR

#### Improved PR Description
Update the generated PR description to include:
- Link back to original PR and specific comment
- Original PR author mention
- File path and line range
- Timestamp of splice

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

Test repository: Created separate repo to test end-to-end workflow.

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
