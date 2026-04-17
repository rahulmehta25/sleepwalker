# Dead Code Pruner — Setup

## What this is

Monthly Routine (1st of each month, 01:00 local). Finds unused exports/files in each tracked repo, opens a conservative removal PR.

## One-time setup

1. **Install detection tooling per repo** if not already:
   - JS: `pnpm add -D ts-prune knip`
   - Python: `pip install vulture`
   - Rust: `cargo install cargo-udeps`

2. **Create the routine**:
   - **Name**: `Sleepwalker Dead Code Pruner`
   - **Prompt**: paste `prompt.md`
   - **Schedule**: `0 1 1 * *`
   - **Environment**: must have the dead-code tooling above

## Cost / run estimate

- ~1 run per month per account
- One PR per tracked repo per month (when there's something Tier-1 to remove)

## Why monthly, not weekly

Aggressive dead-code pruning has a high false-positive rate (especially with reflection, plugins, public APIs). Monthly cadence gives the codebase time to settle and avoids PR fatigue.
