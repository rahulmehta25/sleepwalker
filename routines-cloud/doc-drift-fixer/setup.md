# Doc-Drift Fixer — Setup

## What this is

A weekly scheduled Routine. Sunday 03:00 local. Per repo, scans READMEs and docstrings for drift from the actual code, opens a doc-only PR.

## One-time setup

1. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: `Sleepwalker Doc-Drift Fixer`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: select repos you want monitored
   - **Trigger**: Schedule → weekly Sunday at 03:00 local. Or via CLI: `/schedule update <name> --cron "0 3 * * 0"`
   - **Branch policy**: `claude/`-prefixed. PRs land on `claude/sleepwalker/doc-drift/<date>`

## CLI alternative

```bash
/schedule create
# Then visit web to refine cron and repo selection
```

## Cost / run estimate

- 1 run/week per account
- Up to one PR per tracked repo per week (only if drift detected)

## Troubleshooting

- **No PRs**: probably no drift this week. Look at the run session for the report.
- **Too many false-positive drifts**: add aspirational sections to a `<!-- sleepwalker-skip -->` comment block in the README; the prompt respects HTML comment tags
