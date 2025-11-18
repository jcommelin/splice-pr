# Splice Bot

A GitHub Action that allows reviewers to extract portions of a pull request and create new, focused PRs from those selections.

## Overview

When reviewing a large PR, you might notice that certain changes could be merged independently. Splice Bot lets you select specific changes and automatically create a new PR with just those changes.

## Usage

### Installation

Add the following workflow to your repository at `.github/workflows/splice-bot.yml`:

```yaml
name: Splice Bot

on:
  pull_request_review_comment:
    types: [created]

jobs:
  splice:
    runs-on: ubuntu-latest
    if: contains(github.event.comment.body, 'splice-bot')

    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Splice Bot
        uses: your-org/splice-bot-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Triggering the Bot

1. Review a pull request on GitHub
2. Select a range of lines in the diff view
3. Leave a review comment containing `splice-bot`
4. The bot will extract the changes and create a new PR

### Command Syntax

**Basic usage:**
```
splice-bot
```

**With custom title:**
```
splice-bot "Extract helper function"
```

**With structured options:**
```
splice-bot title:"Fix bug" base:main description:"This fixes the issue"
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `title` | Custom PR title | `title:"My PR title"` |
| `base` | Base branch for new PR | `base:main` |
| `description` | Custom PR description | `description:"Details here"` |
| `group` | Group multiple comments (future) | `group:refactor` |

## How It Works

1. **Trigger**: The action triggers when a review comment is created containing `splice-bot`
2. **Extract**: The bot extracts the diff hunk associated with the selected lines
3. **Branch**: Creates a new branch from the original PR's base branch
4. **Apply**: Applies the extracted changes to the new branch
5. **PR**: Creates a new pull request with the changes
6. **Reply**: Replies to the original comment with a link to the new PR

## Permissions

The action requires the following permissions:
- `contents: write` - To create branches and commits
- `pull-requests: write` - To create PRs and reply to comments

### Repository Settings

You must also enable these permissions in your repository settings:

1. Go to **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Check **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

Without these settings, the action will fail with a permissions error when trying to create the spliced PR.

## Development

### Building

```bash
npm install
npm run build
```

### Project Structure

```
splice-bot-action/
├── action.yml          # Action metadata
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts        # Main entry point
│   ├── types.ts        # TypeScript types
│   ├── parser.ts       # Command parsing
│   ├── diff.ts         # Diff extraction
│   └── github.ts       # GitHub API operations
└── dist/               # Compiled output (generated)
```

### Testing Locally

1. Create a test repository
2. Add the workflow file
3. Create a PR with some changes
4. Leave a review comment with `splice-bot`

## Limitations

- Currently supports single-file selections only
- Multi-file support (grouped comments) is planned for future releases

## Error Handling

If the bot encounters an error, it will:
1. Reply to the original comment with an error message
2. Log details to the GitHub Actions console
3. Fail the workflow run

Common errors:
- Invalid line range
- File not found in PR
- Permission issues
- Branch already exists (will be deleted and recreated)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
