---
phase: 06-polish
purpose: Out-of-scope discoveries during plan execution (scope-boundary rule tracker)
---

# Phase 6 Polish — Deferred Items

## 2026-04-22 — Pre-existing workspace state from other sessions

### Discovered during Plan 06-01 execution

The workspace at Plan 06-01 execution time contained modifications and untracked directories NOT created by Plan 06-01 itself. The orchestrator prompt listed only `CLAUDE.md` + 2 screenshots + `templates/.gitkeep` as pre-existing untracked; the actual workspace additionally contained:

**Pre-existing modifications (not touched by Plan 06-01):**

- `.planning/ROADMAP.md` — in-progress Phase 6 authorship (likely plan-phase output)
- `.planning/STATE.md` — in-progress STATE narrative
- `README.md` — unrelated doc edit
- `bin/sleepwalker-execute` — binary edit (out of scope)
- `dashboard/app/editor/editor-client.tsx` — drops `existingSlugs` prop (1 line delete)
- `dashboard/app/editor/page.tsx` — drops `listBundles` import (5 lines delete)
- `dashboard/app/routines/_components/deploy-progress-drawer.tsx` — 8 lines delta
- `dashboard/app/routines/actions.ts` — 6 lines delta
- `dashboard/tests/editor-client.test.tsx` — 26 lines delta (props swap)
- `dashboard/tests/supervisor-runs.test.ts` — 2 lines delta (ts -> nowIso)

**Pre-existing untracked directories (not touched by Plan 06-01):**

- `dashboard/routines-codex/` — likely a stale Phase 2 scaffolding leftover
- `routines-cloud/changelog-drafter/` — net-new cloud routine (not a v0.1 catalog entry)
- `routines-cloud/repo-health-scorer/` — net-new cloud routine (not a v0.1 catalog entry)
- `routines-local/sleepwalker-dotfile-backup/` — net-new local routine
- `routines-local/sleepwalker-git-stale-branches/` — net-new local routine
- `routines-local/sleepwalker-project-health/` — net-new local routine
- `routines-local/sleepwalker-weekly-digest/` — net-new local routine

### Impact on test suite

Full dashboard test suite (`pnpm test`) currently shows 52 failures across 10 files:

- `tests/bundles.test.ts` — 13 failures (driven by `dashboard/lib/bundles.ts` modifications and untracked dirs that shift bundle counts)
- `tests/cloud.test.ts` — 1 failure (`listCloudRoutines finds all 9 bundles` — sees 11 due to untracked routines-cloud dirs)
- `tests/deploy-routine-action.test.ts` — 7 failures (downstream of `actions.ts` and `bundles.ts` modifications)
- `tests/routines-page.test.ts` — 3 failures (downstream)
- `tests/routines.test.ts` — 1 failure (`listRoutines returns the 6 local templates` — sees 10 due to untracked routines-local dirs)
- `tests/run-now-action.test.ts` — 4 failures (downstream)
- `tests/save-routine-action.test.ts` — 1 failure (downstream)
- `tests/set-enabled-action.test.ts` — failures (downstream)
- `tests/editor-client.test.tsx` — failures (props-shape change)
- `tests/supervisor-runs.test.ts` — 1 failure (tsCompact id regex timing)

### Scope boundary decision

Per executor SCOPE BOUNDARY rule: "Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing... failures in unrelated files are out of scope."

Plan 06-01's scope is:
- `templates/routine-claude-routines.md` (new)
- `templates/routine-claude-desktop.md` (new)
- `templates/routine-codex.md` (new)
- `templates/routine-gemini.md` (new)
- `dashboard/tests/templates.test.ts` (new)

None of these 5 files interact with:
- `dashboard/lib/bundles.ts` logic
- `routines-local/` / `routines-cloud/` / `routines-codex/` enumeration
- `saveRoutine` / `deployRoutine` / `runNowRoutine` Server Actions
- `supervisor-runs` q_sup_* id generation

Proof of isolation:
1. `cd dashboard && pnpm test tests/templates.test.ts` — 5/5 green
2. `cd dashboard && pnpm run typecheck` — exit 0
3. Stashing the 7 pre-existing TS modifications drops failures 52 → 3 (the remaining 3 are driven by pre-existing untracked routine dirs on disk, which Plan 06-01 did not create)

### Recommendation for the session driver

Before sealing Phase 6 (Plan 06-06 exit gate), either:
1. Commit the pre-existing modifications and routine dirs as their own plans (they look like Phase 6 scaffolding for a parallel author), OR
2. Revert them to HEAD cleanly (`git checkout HEAD -- <paths>` + `rm -rf <untracked>`) so the Phase 6 exit gate has a clean `pnpm test` baseline.

Plan 06-01 does not gate on these; the templates + round-trip test are independently green.
