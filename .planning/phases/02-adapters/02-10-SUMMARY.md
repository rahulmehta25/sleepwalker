---
phase: 02-adapters
plan: 10
subsystem: phase-exit-gate
tags: [exit-gate, smoke-test, frozen-surface, manual-verify, phase-2, wave-4]
requires:
  - phase-2-plan-02-09 (ADAPTERS registry swap + HealthStatus.warning)
  - phase-2-plan-02-04 (supervisor-tests.sh harness)
provides:
  - test/manual/codex-adapter-smoke.md (11-step real-Mac contract)
  - test/manual/claude-desktop-smoke.md (Q1 resolution contract)
  - Phase 2 automated exit gate (typecheck + vitest + supervisor harness + frozen-surface diff = 0)
affects:
  - .planning/ROADMAP.md (Phase 2 row -> Code Complete, 10/10 plans with manual smokes deferred)
  - .planning/STATE.md (Current Position advanced; metrics refreshed; decision + todo logged)
  - .planning/REQUIREMENTS.md (ADPT-03..09 + SAFE-02 marked Code Complete with smoke-pending flag)
tech-stack:
  added: []
  patterns:
    - dynamic-PHASE2_BASE SHA resolution from `git log --reverse --diff-filter=A -- <sentinel-file>` (Phase 1 lessons learned)
    - automation-first exit gate (typecheck -> vitest -> bash harness -> frozen-surface diff, each gated on prior exit 0)
    - contract-as-documentation for smoke tests that cannot be mocked (real launchctl / Claude Desktop UI)
key-files:
  created:
    - test/manual/codex-adapter-smoke.md (118 lines, 11-step contract)
    - test/manual/claude-desktop-smoke.md (87 lines, Q1 3-outcome resolution)
    - .planning/phases/02-adapters/02-10-SUMMARY.md (this file)
    - .planning/phases/02-adapters/02-SUMMARY.md (phase-level rollup)
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/REQUIREMENTS.md
    - docs/activity_log.md
decisions:
  - "Phase 2 sealed via automated-only execution — manual smoke tests (real launchctl bootstrap, Claude Desktop Schedule tab observation) deferred to user because they produce real hardware side-effects (live launchd agents, plist on real ~/Library/LaunchAgents) that cannot be autonomously reversed. Contract documents in test/manual/ are the reference the user runs later; results are recorded back into 02-SUMMARY.md under a Manual Smoke Test Results section."
  - "PHASE2_BASE resolved dynamically to commit 0ec59df (parent of e14bbe6 — first commit introducing launchd-writer.ts). Hardcoded SHAs were explicitly called out as brittle in Phase 1 lessons learned; the `git log --reverse --diff-filter=A` idiom is rebase-safe and forward-compatible."
metrics:
  duration: ~12 min (automated-only execution)
  completed: 2026-04-19
---

# Phase 2 Plan 10: Phase Exit Gate (Automated Portion) Summary

Wave 4 Phase 2 exit gate executed in automated-only mode. Two manual smoke test contracts authored and committed earlier (commit `0331f69`). Automated four-step gate runs green (typecheck exit 0; vitest 104/104 across 16 files; supervisor harness 24 PASS / 0 FAIL; frozen-surface diff against dynamic PHASE2_BASE returns 0 lines). Manual smoke tests (real launchctl bootstrap for codex; Claude Desktop Schedule tab observation for Q1 resolution) are explicitly deferred to the user — they produce real hardware side-effects that cannot be automated. The two contract docs under `test/manual/` are the reference the user runs later; results get recorded back into `02-SUMMARY.md`.

## What shipped

- **Two manual smoke test contracts** (already committed at `0331f69`):
  - `test/manual/codex-adapter-smoke.md` (118 lines) — 11-step real-Mac contract: fixture bundle -> adapter deploy -> `launchctl print` verification -> `plutil -lint` gate -> `launchctl kickstart -k` -> audit.jsonl `SMOKE_OK` assertion -> undeploy -> cleanup verification.
  - `test/manual/claude-desktop-smoke.md` (87 lines) — Q1 resolution contract: synthetic timestamp-writer SKILL.md drop -> Schedule tab observation -> three-way outcome recording (auto-pickup / refresh-triggered / manual-add-only) that dictates Phase 6 AUTHORING.md wording.
- **Automated exit gate executed** (all green — see Automated Gate Results below).
- **Phase-level SUMMARY** (`02-SUMMARY.md`) — per-plan rollup + automated gate results + frozen-surface diff record + TODO section pointing at the two deferred manual smokes.
- **Plan-level SUMMARY** (this file) — records what this specific closeout plan did.
- **ROADMAP / STATE / REQUIREMENTS updated** — honest phrasing: Phase 2 is "Code Complete (manual smokes pending)"; STATE.md carries an open todo pointing at both contract docs; REQUIREMENTS.md Traceability shows ADPT-03..09 + SAFE-02 as "Code Complete (manual smoke pending)".

## Automated Gate Results

Executed 2026-04-19 03:10-03:11 EST on main working tree at HEAD = `0331f69`.

### Step 1: pnpm typecheck

```
> sleepwalker-dashboard@0.1.0 typecheck
> tsc --noEmit
(no output)
EXIT: 0
```

### Step 2: pnpm test (full dashboard vitest suite)

```
 Test Files  16 passed (16)
      Tests  104 passed (104)
   Start at  03:10:50
   Duration  528ms (transform 418ms, setup 0ms, collect 615ms, tests 658ms, environment 1ms, prepare 768ms)
EXIT: 0
```

Per-file breakdown:
- `slug.test.ts` 20 · `audit.test.ts` 4 · `approval.test.ts` 4 · `settings.test.ts` 6 · `queue.test.ts` 7 · `routines.test.ts` 3 · `queue-aggregator.test.ts` 2 · `cloud-cache.test.ts` 2 · `fire-routine.test.ts` 11 · `launchd-writer.test.ts` 9 · `claude-routines.test.ts` 7 · `claude-desktop.test.ts` 6 · `codex.test.ts` 6 · `gemini.test.ts` 7 · `cloud.test.ts` 4 · `adapter-registry.test.ts` 6.

Target was >= 90 (plan's estimate: ~103); actual 104. Green.

### Step 3: bash hooks/tests/supervisor-tests.sh

```
──────────────────────────────────────
  Results: 24 pass / 0 fail
──────────────────────────────────────
all supervisor tests passed
EXIT: 0
```

All 6 scenarios (codex happy, SAFE-02 ANSI strip, budget SIGTERM, red+balanced defer, bundle missing EX_NOINPUT, gemini happy) green. The shell-level traps about backgrounded pipelines (`Broken pipe` / `Terminated: 15`) are expected output from the budget-SIGTERM watchdog killing the stubbed runaway fixture — same behavior as Plan 02-04 ship.

### Step 4: frozen-surface diff with dynamic PHASE2_BASE

```
PHASE2_BASE_RAW = e14bbe6930a7d60088adf91754d5184d9b936fb2
PHASE2_BASE     = e14bbe6930a7d60088adf91754d5184d9b936fb2~1
PHASE2_BASE_SHA = 0ec59df
DIFF_LINES      = 0
```

Command:
```bash
PHASE2_BASE=$(git log --reverse --format=%H --diff-filter=A -- dashboard/lib/runtime-adapters/launchd-writer.ts | head -1)~1
git diff "$PHASE2_BASE" HEAD -- \
  install.sh \
  hooks/sleepwalker-defer-irreversible.sh hooks/sleepwalker-budget-cap.sh hooks/sleepwalker-audit-log.sh hooks/_detect_fleet.sh \
  routines-local/ routines-cloud/ \
  bin/sleepwalker-execute \
  dashboard/lib/queue.ts dashboard/lib/routines.ts dashboard/lib/cloud.ts \
  dashboard/lib/cloud-cache.ts dashboard/lib/queue-aggregator.ts \
  dashboard/lib/settings.ts dashboard/lib/approval.ts dashboard/lib/audit.ts \
  dashboard/lib/github.ts dashboard/lib/fire-routine.ts \
  dashboard/app/ \
  dashboard/package.json dashboard/tsconfig.json dashboard/vitest.config.ts
```

Result: **0 lines**. v0.1 public surface is byte-identical against the pre-Phase-2 baseline across all 20 enumerated paths. Phase 2 is strictly additive as designed.

## Deferred to User (Manual Smoke Tests)

The two tasks the plan flagged as `type="checkpoint:human-action"` are deferred. Both produce real hardware side-effects that cannot be automated or mocked:

1. **Codex smoke** (`test/manual/codex-adapter-smoke.md`) — requires real `launchctl bootstrap gui/$UID`, real plist under `~/Library/LaunchAgents/`, real `codex` CLI invocation. No mock path exists.
2. **Claude Desktop Q1 smoke** (`test/manual/claude-desktop-smoke.md`) — requires human observation of Claude Desktop's Schedule tab to resolve the research question ("does Desktop pick up a fresh SKILL.md?").

Both contract documents are fully specified and ready for the user to execute on their Mac. Results should be appended to `02-SUMMARY.md` under the "Manual Smoke Test Results (Wave 4)" section (template provided in that file).

## Deviations from Plan

### Rule 3 (blocking-but-auto-fixable) — Plan task 3 is `checkpoint:human-action`; executed in automated-only mode

**Found during:** Task 3 (manual smoke execution).
**Issue:** Plan 02-10 Task 3 requires running `launchctl bootstrap` against the user's real launchd and observing Claude Desktop's Schedule tab UI. Neither action can be performed autonomously by a coding agent — they would leave real state on the user's machine (plist files, launchd agents registered, Claude Desktop config changes) that only the user can safely manage.
**Fix:** Honored the user's explicit instruction to execute Task 3 as "deferred to user". Completed all other Task 1/2/4 work in full. Documented the two deferred smoke tests in STATE.md open todos pointing at the contract documents. Added a "Manual Smoke Test Results (Wave 4)" placeholder section in `02-SUMMARY.md` for the user to fill in later. ROADMAP/STATE/REQUIREMENTS honestly flag "Code Complete (manual smoke pending)" rather than full "Complete".
**Commit:** (this closeout commit, see Task 4).

No Rule 1/2/4 deviations. No authentication gates. No build/test failures.

## Self-Check: PASSED

- [x] `test/manual/codex-adapter-smoke.md` exists (118 lines, commit `0331f69`)
- [x] `test/manual/claude-desktop-smoke.md` exists (87 lines, commit `0331f69`)
- [x] Automated gate all 4 steps exit 0 (typecheck + vitest 104/104 + supervisor 24/24 + frozen-surface 0 lines)
- [x] PHASE2_BASE dynamically resolved to `0ec59df` (parent of `e14bbe6`)
- [x] ROADMAP/STATE/REQUIREMENTS updated with honest "Code Complete (manual smoke pending)" phrasing
- [x] `02-SUMMARY.md` + `02-10-SUMMARY.md` both written
- [x] activity_log.md appended
- [x] No real launchctl / Claude Desktop side effects
