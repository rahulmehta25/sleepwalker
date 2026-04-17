# Dependency Upgrader — Setup

## What this is

A scheduled Routine that runs weeknights at 04:00 local. For each tracked repo, it bumps dependencies, runs the test suite in the cloud sandbox, and opens a PR per scope (patch+minor / major / devdeps).

## One-time setup

1. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: `Sleepwalker Dependency Upgrader`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: select repos you want auto-bumped
   - **Environment**: ensure your test runner has needed tooling. For JS repos with custom builds, consider a custom environment with the right Node version
   - **Trigger**: Schedule → custom cron `0 4 * * 1-5` (weekdays at 04:00 local)
   - **Branch policy**: `claude/`-prefixed (default). PRs will land on `claude/sleepwalker/deps/<scope>-<date>` branches

2. **Configure repo branch protection** (recommended):
   - Require status checks to pass before merging on `main`
   - This means broken dependency bumps can never reach main even if a PR is approved by mistake

3. **Add a CODEOWNERS entry** if you want auto-assigned reviewers:
   ```
   /package.json @your-username
   /pnpm-lock.yaml @your-username
   ```

## CLI alternative

```bash
/schedule create
# Conversational walk-through. Cron supports custom intervals:
/schedule update <name> --cron "0 4 * * 1-5"
```

## Cost / run estimate

- ~5 runs/week per account (5 weekdays)
- Each run processes all tracked repos, but only opens PRs where tests pass
- Counts against subscription usage + daily routine cap

## Troubleshooting

- **No PRs opened**: check the run session — likely test failures. Look at the failure log; you may need to add deps the routine can't infer
- **Test suite slow**: configure a custom environment with caching for `node_modules`
- **Routine times out**: split tracked repos across multiple routines (one per language ecosystem)
