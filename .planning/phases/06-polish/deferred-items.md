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

---

## 2026-04-22 — Plan 06-02 closeout addendum

### Pre-existing 50-test failure set status at HEAD `72f7b63`

Between Plan 06-01 closeout (HEAD `8428061`) and Plan 06-02 execution start (HEAD `c9ff955`), the parallel session resolved most of the 50 pre-existing failures via:
- `c9ff955 test(vitest): switch to forks pool to isolate per-file process state`
- `6b27b83 fix(deploy): keep drawer open after deploy and resolve bundle path root`
- (and other intervening commits)

At Plan 06-02 execution start the dashboard suite was 363/363 green across 41 files. Plan 06-02 added 10 it() blocks (6 Node + 4 jsdom) bringing the suite to 373/373 across 43 files. **Plan 06-02 caused zero regressions** — full suite remained green throughout the plan.

### One new pre-existing failure introduced post-Plan-06-02 by parallel session

Between the Plan 06-02 feat commit (`72f7b63`) and the Plan 06-02 closeout commit (`089f0dd`), the parallel session committed:
- `2b9f9ea fix(bundles): support config.json format for claude-routines readBundle`

This commit appears alongside an untracked new local routine directory `routines-local/sleepwalker-daily-standup/` which surfaces a single test failure:
- `tests/routines.test.ts > listRoutines returns the 6 local templates from the repo (uninstalled)` — `expected 7 to be 6`

**Cause:** the test counts `routines-local/sleepwalker-*` directories on disk; with the new untracked daily-standup dir present, the count is now 7 instead of the hardcoded 6.

**Out of scope for Plan 06-02** per executor SCOPE BOUNDARY rule:
- Failure is in `tests/routines.test.ts` — not in any Plan 06-02 file
- Cause is the untracked `routines-local/sleepwalker-daily-standup/` directory which Plan 06-02 explicitly preserved untouched per the orchestrator prompt's "Pre-existing untracked: CLAUDE.md + 2 screenshots. Untouched." constraint
- The test failure is logically equivalent to the v0.1 catalog-count assumption being out of date; either commit `routines-local/sleepwalker-daily-standup/` as its own plan and update the hardcoded `6` to `7`, or revert/remove the directory

### Recommendation for the session driver (updated)

Before sealing Phase 6 (Plan 06-07 exit gate), reconcile:
- Commit `routines-local/sleepwalker-daily-standup/` if it's intentional and update `tests/routines.test.ts` (and likely `tests/cloud.test.ts` for any new cloud routines) hardcoded counts, OR
- Remove the untracked directory cleanly so the v0.1 baseline (6 local + 8 cloud + 1 _test-zen) is preserved

Plan 06-02 itself does not gate on this — the diagnostics page + library + tests are independently green and the lib has zero coupling to the v0.1 routine catalog.

---

## 2026-04-22 — Plan 06-03 closeout addendum

### Same `tests/routines.test.ts` failure persisted during Plan 06-03

At Plan 06-03 execution time, `pnpm test` reported 372 passed / 1 failed / 373 total. The single failure is the same one the Plan 06-02 addendum above already documents:

- `tests/routines.test.ts > listRoutines returns the 6 local templates from the repo (uninstalled)` — `expected 7 to be 6`

Root cause unchanged: the untracked `routines-local/sleepwalker-daily-standup/` directory (introduced by commit `58e8712` feat(routines-local): add sleepwalker-daily-standup bundle) makes the filesystem enumeration return 7 directories against the test's hardcoded 6.

**Out of scope for Plan 06-03** per executor SCOPE BOUNDARY rule:
- Plan 06-03's scope is `docs/AUTHORING.md` (new) + `README.md` (single-line link addition) — no dashboard source touched, no test file touched, no bundle enumeration logic touched
- Failure is in `tests/routines.test.ts`, which does not interact with AUTHORING.md or README.md at all
- The correct fix belongs to whichever plan commits the `sleepwalker-daily-standup` bundle formally (update hardcoded 6 → 7, or remove the bundle directory)

Plan 06-03 itself does not gate on this — AUTHORING.md passes every acceptance criterion (600-1100 lines, 7 locked-order §N. sections, 13-row Troubleshooting table, Mac-sleep §4.2 triptych, SAFE-01 negative invariant clean, all 4 runtime templates cross-referenced).
