# Splice Bot - Design Document

## Overview

A GitHub Action that allows reviewers to extract portions of a pull request and create new, focused PRs from those selections. The bot responds to review comments containing a special command, extracts the selected code changes, and creates a new PR with just those changes.

## Problem Statement

When reviewing a large PR, reviewers often notice that certain parts of the diff represent standalone improvements that could be merged independently. Currently, there's no easy way to:
1. Select a range of lines from a PR diff
2. Extract those changes into a new branch
3. Create a new PR with just those changes

This tool automates that workflow.

## Existing Tools

After research, we found:
- **Stacked Pull Requests** - Splits large PRs into dependent sub-PRs, but focuses on pre-splitting, not extracting from existing PRs
- **DiffEnder** - AI-suggested splits, but not for selecting specific line ranges
- **Rebbot** - Manages dependent PRs, not extracting portions

**Conclusion**: No existing tool provides this specific workflow.

## Proposed Design

### Core Workflow

1. Reviewer reviews a PR on GitHub
2. Reviewer selects a range of lines in the diff and leaves a review comment
3. Comment contains: `splice-bot [instructions]`
4. GitHub Action triggers on the review comment
5. Action extracts the selected code changes
6. Action creates a new branch and PR with those changes
7. Action replies to the original comment with a link to the new PR

### Trigger Mechanism

- **Event Type**: `pull_request_review_comment` (NOT `issue_comment`)
  - Review comments have line range metadata (`path`, `line`, `original_line`, `diff_hunk`)
  - Issue comments don't have line ranges
- **Trigger Condition**: Comment body contains `splice-bot`

### Line Range Extraction

Review comments provide:
- `path`: File path
- `line`: Line number in the head commit (new code)
- `original_line`: Line number in the base commit (old code)
- `diff_hunk`: Context around the change

**Decision needed**: Extract just the selected lines, or the entire hunk for context?

**Recommendation**: Include the full hunk for better context and to avoid broken code.

### Multi-File Selections

**Problem**: A single review comment targets one file. What if the user wants to splice changes across multiple files?

**Options**:
- **A) Grouped Comments**: Multiple comments with same group tag
  - `splice-bot group:refactor` on file1
  - `splice-bot group:refactor` on file2
  - Action collects all comments with same group tag
- **B) Separate PRs**: One comment = one file = one PR
- **C) File Paths in Instructions**: `splice-bot file1:10-20 file2:5-15`

**Recommendation**: Start with Option A (grouped comments) for MVP, add Option C later.

### Base Branch Selection

**Question**: What should the new PR be based on?
- Original PR's base branch (preserves context)
- Current state of main/master (may have conflicts)
- Configurable via instructions: `splice-bot base:main`

**Recommendation**: Default to original PR's base, allow override via instructions.

### Instruction Parsing

What should the "foo bar" part of `splice-bot foo bar` do?

**Proposed structured format**:
```
splice-bot [group:name] [base:branch] [title:"text"] [description:"text"]
```

**Examples**:
- `splice-bot` - Minimal, auto-generate everything
- `splice-bot title:"Extract helper function"` - Custom PR title
- `splice-bot group:refactor base:main` - Group tag and base branch
- `splice-bot title:"Fix bug" description:"This fixes the matrix multiplication issue"` - Full control

**MVP Simplification**: Start with just `splice-bot` or `splice-bot "PR title"` for simplicity.

### Commit Strategy

**Options**:
1. Single clean commit with descriptive message
2. Preserve original commit history (if all changes come from one commit)
3. Squash all related commits

**Recommendation**: Single clean commit for simplicity. Include attribution to original PR in commit message.

### Branch Naming

**Options**:
- `splice/pr-123-selection` - Simple, includes PR number
- `splice/pr-123-{hash}` - Includes hash for uniqueness
- `splice/pr-123-{sanitized-title}` - Includes title hint
- Configurable via instructions

**Recommendation**: `splice/pr-{number}-{short-hash}` for uniqueness and traceability.

### Error Handling

Must handle:
- Invalid line ranges
- Merge conflicts when creating branch
- Permission issues
- File deleted/renamed between comment and action
- Stale line numbers (PR updated after comment)

**Response Strategy**: Reply to the original comment with:
- Success: Link to new PR
- Error: Clear error message and suggestions

### Permissions

Required permissions:
- Read PR and comments
- Read repository contents
- Create branches
- Create pull requests
- Write comments (to reply)

**Security Consideration**: Should require maintainer approval or specific label? Or allow any collaborator?

## Implementation Details

### Repository Structure

Create a new repository (e.g., `splice-bot-action`) with:

```
splice-bot-action/
├── action.yml              # Action metadata
├── README.md
├── package.json            # If using Node.js
├── src/
│   └── index.js           # Main action code
└── .github/workflows/
    └── test.yml            # Tests for the action itself
```

### Technology Choice

**Option 1: JavaScript/TypeScript (Recommended)**
- Most common for GitHub Actions
- Excellent libraries: `@actions/github`, `@octokit/rest`
- Fast execution
- Good documentation

**Option 2: Python**
- Familiar if team uses Python
- Requires Docker container or composite action
- Libraries: `pygithub`, `requests`

**Recommendation**: Start with JavaScript/TypeScript for better ecosystem support.

### Key Implementation Steps

1. **Listen for Events**
   - Configure `pull_request_review_comment` event in `action.yml`
   - Filter for comments containing `splice-bot`

2. **Extract Metadata**
   - Get PR number from comment context
   - Extract line range from comment (`path`, `line`, `original_line`)
   - Parse instructions from comment body

3. **Fetch PR Diff**
   - Use GitHub API to get PR diff
   - Extract relevant hunk(s) based on line range
   - Handle context lines appropriately

4. **Create New Branch**
   - Checkout base branch
   - Create new branch
   - Apply extracted changes
   - Handle merge conflicts gracefully

5. **Create PR**
   - Generate PR title and description
   - Create pull request
   - Link back to original PR

6. **Reply to Comment**
   - Post comment with PR link
   - Include status and any warnings

## Open Questions

### Design Decisions

1. **Hunk vs. Selected Lines**: Extract full hunk or just selected lines?
   - **Decision**: Full hunk for context

2. **Multi-file Support**: How to handle multiple files?
   - **Decision**: Start with grouped comments (Option A)

3. **Base Branch**: Default behavior?
   - **Decision**: Original PR's base, allow override

4. **Instruction Format**: Simple or structured?
   - **Decision**: Start simple, add structure later

5. **Permissions**: Who can trigger the bot?
   - **Decision**: TBD - consider maintainer-only or collaborator

### Technical Questions

1. **Stale Line Numbers**: How to handle if PR is updated after comment?
   - **Option A**: Use comment timestamp to get PR state at that time
   - **Option B**: Re-validate line numbers, fail gracefully if invalid
   - **Option C**: Use commit SHA from comment context

2. **Conflict Resolution**: What if applying changes causes conflicts?
   - **Option A**: Fail with helpful error message
   - **Option B**: Create PR with conflicts, let user resolve
   - **Option C**: Attempt automatic resolution (risky)

3. **Testing Strategy**: How to test the action?
   - Unit tests for parsing logic
   - Integration tests with test repository
   - Manual testing workflow

4. **Rate Limiting**: GitHub API rate limits?
   - Use token efficiently
   - Handle rate limit errors gracefully
   - Consider caching

### User Experience Questions

1. **Feedback Timing**: Should the bot reply immediately or wait for completion?
   - **Recommendation**: Immediate acknowledgment, update when done

2. **PR Description**: Auto-generate or allow customization?
   - **Recommendation**: Auto-generate with link to original PR, allow override

3. **Notifications**: Should original PR author be notified?
   - **Recommendation**: Yes, mention them in the new PR description

4. **Duplicate Prevention**: What if same selection is spliced twice?
   - **Option A**: Check for existing PRs with same changes
   - **Option B**: Allow duplicates (user responsibility)
   - **Option C**: Update existing PR if found

## MVP Scope

For initial version, keep it simple:

1. ✅ Single comment, single file
2. ✅ Simple instruction: `splice-bot` or `splice-bot "PR title"`
3. ✅ Auto-generated branch name
4. ✅ Default base (original PR base)
5. ✅ Single clean commit
6. ✅ Full hunk extraction
7. ✅ Basic error handling
8. ✅ Comment reply with PR link

**Defer to later**:
- Multi-file support
- Grouped comments
- Structured instructions
- Conflict auto-resolution
- Duplicate detection

## Next Steps

1. Create new repository for the action
2. Set up basic structure (action.yml, package.json)
3. Implement event listener
4. Implement line range extraction
5. Implement PR creation
6. Add error handling
7. Write tests
8. Document usage
9. Test with real PRs
10. Iterate based on feedback

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Creating Actions](https://docs.github.com/en/actions/creating-actions)
- [GitHub API - Pull Request Review Comments](https://docs.github.com/en/rest/pulls/comments)
- [GitHub Actions Toolkit](https://github.com/actions/toolkit)
- [Octokit.js](https://github.com/octokit/octokit.js)

## Notes

- This design document should be moved to the new repository
- Update as decisions are made and questions are answered
- Keep a changelog of design decisions
