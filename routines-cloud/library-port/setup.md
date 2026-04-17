# Library Port — Setup

## What this is

A GitHub-event Routine. When a PR is merged to `main` on the source SDK repo, it ports the change to the target SDK in another language and opens a matching PR.

This is the canonical multi-language SDK keep-in-sync routine — the docs reference it directly as a use case.

## When to use this

You maintain (or contribute to) two libraries that should stay in sync:
- `sdk-typescript` ↔ `sdk-python`
- `client-go` ↔ `client-rust`
- An open-source project with first-party multi-language clients

## One-time setup

1. **Install the Claude GitHub App** on BOTH the source and target repos.

2. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: e.g., `Sleepwalker Library Port (TS → Python)`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: add BOTH source and target
   - **Environment variables**:
     - `LIBRARY_PORT_SOURCE_REPO` = `acme/sdk-typescript`
     - `LIBRARY_PORT_TARGET_REPO` = `acme/sdk-python`
     - `LIBRARY_PORT_SOURCE_LANG` = `typescript`
     - `LIBRARY_PORT_TARGET_LANG` = `python`
   - **Trigger**: GitHub event → `pull_request` → action `closed`. Add filters:
     - `is_merged = true`
     - `base_branch = main`
   - **Important**: the trigger is on the SOURCE repo. The PR opens on the TARGET repo.

3. **Verify** by merging a small public-API change in the source repo. The routine should fire within a minute.

## Multiple language pairs

Create a separate routine for each language pair (TS→Python, Python→Go, Go→Rust, etc.). Each is a small variation on the same prompt.

## Troubleshooting

- **Routine doesn't fire**: confirm Claude GitHub App is on the SOURCE repo, and the trigger is on `pull_request.closed` filtered to `is_merged = true`
- **PR opens but is wrong**: the prompt may be over-translating. Edit `prompt.md` to add explicit language idioms ("In Python, use `snake_case` for everything; never `camelCase`")
- **Internal refactors trigger ports**: tighten the "what is internal-only refactor" section in your prompt with examples specific to your codebase
