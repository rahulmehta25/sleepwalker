# Test Coverage Filler — Setup

## What this is

Weekly Routine. Saturdays 02:00 local. For each tracked repo, identifies the highest-blast-radius uncovered functions and writes 3 tests each (happy + edge + error). Opens one PR per repo.

## One-time setup

1. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: `Sleepwalker Test Coverage Filler`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: select repos with existing test suites
   - **Environment**: must include the language toolchain that runs your tests (Node + pnpm, Python + pytest, etc.)
   - **Trigger**: Schedule → custom cron `0 2 * * 6` (Sat 02:00 local)

2. **Pre-flight your repos**:
   - Ensure `pnpm test`, `pytest`, or `cargo test` works from a clean checkout
   - If your tests need env vars (DB URL, API keys), configure them in the Routine's environment

## Cost / run estimate

- 1 run/week
- One PR per tracked repo per week (when there are uncovered functions worth testing)

## Troubleshooting

- **PRs lack context**: the routine reads existing tests to learn style. If your tests are sparse, the new tests will be barer than ideal. Consider adding 2-3 high-quality reference tests so the routine has a style to copy.
- **Routine times out**: if you have > 10 tracked repos, split into two routines (one for JS repos, one for Python, etc.)
