# PR Reviewer — Setup

## What this is

A Claude Code Routine that runs on Anthropic cloud infrastructure. When a PR is opened (or updated) on any of your tracked repos, it reviews the diff inline and posts comments. It does NOT approve or request-changes — it leaves the merge decision to the human.

## One-time setup

1. **Install the Claude GitHub App** on each repo you want reviewed:
   - Go to https://github.com/apps/claude
   - Install on `your-org` or specific repos
   - This is required for GitHub event triggers to fire (separate from `/web-setup` which only grants clone access)

2. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: `Sleepwalker PR Reviewer`
   - **Prompt**: paste the contents of `prompt.md` from this directory
   - **Repositories**: select all repos you want reviewed
   - **Environment**: Default (or custom if your tests need specific tooling)
   - **Trigger**: GitHub event → `pull_request` → action `opened`. Add filter: `is_draft = false`, `from fork = false`. Optionally add a second trigger for `pull_request.synchronize` if you want re-reviews on push.
   - **Connectors**: keep `github` enabled. Remove others.
   - **Branch policy**: leave `claude/`-prefixed (default). The routine doesn't need to push.

3. **Verify** by opening a small test PR. The routine should fire within a minute and post a review comment.

## CLI alternative

```bash
/schedule create
# In the conversational form:
#   - Name: Sleepwalker PR Reviewer
#   - Prompt: <paste prompt.md>
#   - Repos: <select>
# Then visit https://claude.ai/code/routines to add the GitHub trigger (CLI only supports schedule triggers right now).
```

## Daily run estimate

~20 runs/week for a team with 4-5 PRs/day. Counts against your account's daily routine cap.

## Troubleshooting

- **Routine doesn't fire**: confirm Claude GitHub App is installed on the repo (not just `/web-setup`)
- **Comments aren't appearing**: check the run session at claude.ai/code/routines for errors
- **Bot loops**: filter out `Dependabot`, `Renovate`, `github-actions[bot]` in the prompt (already included)
