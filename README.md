# Splice Bot

Extract selected lines from a pull request and create a new focused PR.

## Quick Start

### 1. Add the workflow

Copy [`.github/workflows/splice-bot.yml`](.github/workflows/splice-bot.yml) to your repository, changing `uses: ./` to `uses: jcommelin/splice-pr@master`.

### 2. Enable repository permissions

Go to **Settings** > **Actions** > **General** > **Workflow permissions**:
- Select "Read and write permissions"
- Check "Allow GitHub Actions to create and approve pull requests"

### 3. Use it

1. Review a pull request
2. Select lines in the diff view
3. Add a review comment containing `splice-bot`
4. The bot creates a new PR with just those changes

## Command Options

```
splice-bot                              # Basic usage
splice-bot "Fix typo in docs"           # Custom PR title
splice-bot title:"Fix bug" base:main    # Structured options
splice-bot labels:bug,urgent --draft    # Labels and draft PR
splice-bot reviewers:alice,bob          # Request reviewers
splice-bot --entire-hunk                # Extract full hunk
splice-bot --entire-file                # Extract all file changes
```

| Option | Description |
|--------|-------------|
| `title` | Custom PR title |
| `base` | Base branch (defaults to original PR's base) |
| `description` | Custom PR description |
| `labels` | Comma-separated labels to add |
| `reviewers` | Comma-separated usernames (@ optional) |
| `branch` | Custom branch name |
| `--draft` | Create as draft PR |
| `--entire-hunk` | Extract the complete hunk containing the comment |
| `--entire-file` | Extract all changes from the file |

## How It Works

1. Extracts the selected lines from the PR diff
2. Creates a new branch from the base branch
3. Applies only the selected changes
4. Creates a PR and replies with a link

The commit author is set to whoever left the review comment.

## Configuration

Configure post-merge behavior in your workflow:

```yaml
- uses: jcommelin/splice-pr@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    on-merge: comment,label   # Actions when spliced PR merges (default: both)
    sync-label: needs-sync    # Label to add to original PR (default: needs-sync)
```

## Limitations

- Single file selections only (multi-file support planned)
- Requires the repository permission settings above

## Source Code

The codebase is small (~600 lines) and organized for easy understanding:

```
src/
├── types.ts    # Start here: data structures
├── parser.ts   # Command parsing and PR text generation
├── diff.ts     # Unified diff parsing and application
├── github.ts   # GitHub API operations
└── index.ts    # Entry point and orchestration
```

**Recommended reading order:**
1. `types.ts` - Understand the data flow
2. `parser.ts` - How commands become instructions
3. `diff.ts` - How diffs are extracted and applied
4. `github.ts` - GitHub API wrappers
5. `index.ts` - How it all fits together

## License

MIT
