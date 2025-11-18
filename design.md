# Splice Bot - Design Document

## Overview

A GitHub Action that extracts selected lines from PR diffs and creates new focused PRs.

## Future Work

### Multi-File Support

**Problem**: Currently limited to single-file selections.

**Proposed Solution**: Grouped comments with same tag
```
splice-bot group:refactor  # on file1.ts
splice-bot group:refactor  # on file2.ts
```

Action collects all comments with matching group tag and creates single PR with all changes.

**Challenges**:
- Ordering of changes across files
- Handling partial overlaps
- Conflict resolution between grouped hunks

### Enhanced Instructions

Expand structured format:
```
splice-bot group:name base:branch title:"text" description:"text"
```

### Duplicate Detection

Prevent same selection being spliced twice:
- Check for existing PRs with identical changes
- Option to update existing PR instead

### Improved Feedback

- Immediate acknowledgment before processing
- Progress updates for long operations
- Mention original PR author in new PR

## Technical Notes

### Line Range Handling

Review comments provide:
- `line` / `start_line`: Line numbers in new code (head)
- `original_line` / `original_start_line`: Line numbers in old code (base)
- `diff_hunk`: Context around the change

Current implementation extracts only selected lines plus adjacent deletions for precision.

### Stale Line Numbers

If PR is updated after comment, line numbers may be invalid. Current approach uses `commit_id` from comment to identify exact state.
