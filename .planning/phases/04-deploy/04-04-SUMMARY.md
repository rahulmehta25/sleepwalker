---
phase: 04-deploy
plan: 04
subsystem: deploy
tags: [server-actions, state-machine, rollback, launchctl, runtime-adapters]
requirements:
  completed: [DEPL-01, DEPL-02, DEPL-04, DEPL-05]
dependency_graph:
  requires:
    - dashboard/lib/deploy-state.ts (Plan 04-01 — writeDeployState + readDeployState + deleteDeployState)
    - dashboard/lib/runtime-adapters/index.ts (Phase 2 — getAdapter + ADAPTERS registry)
    - dashboard/lib/runtime-adapters/slug.ts (Phase 1 — toFleetKey + toLaunchdLabel + toPlistPath)
    - dashboard/lib/bundles.ts (Phase 3 — readBundle + RUNTIME_ROOT)
    - dashboard/lib/routines.ts (v0.1 — setEnabled for claude-desktop)
  provides:
    - dashboard/app/routines/actions.ts (4 Server Actions + 3 result unions)
  affects:
    - dashboard/lib/deploy-state.ts (additive `warning?: string` field)
    - Plan 04-07 (deploy-progress-drawer consumes deployRoutine + getDeployState)
    - Plan 04-08 (run-now-button consumes runNowRoutine)
    - Plan 04-09 (routines action bar consumes setRoutineEnabled)
tech-stack:
  added:
    - node:util promisify(execFile) — launchctl bootstrap/bootout inside Server Action
  patterns:
    - "use server" directive at file head (Next.js 15 Server Action marker)
    - Result-object discriminated union (ok:true|false)
    - Step-composition early-return state machine
    - Adapter registry dispatch via getAdapter(runtime) — no direct imports
    - Promise.race timeout wrapper that resolves-never-rejects for rollback
key-files:
  created:
    - dashboard/app/routines/actions.ts (860 lines)
    - dashboard/tests/deploy-routine-action.test.ts (339 lines, 9 it() blocks)
    - dashboard/tests/run-now-action.test.ts (212 lines, 6 it() blocks)
    - dashboard/tests/set-enabled-action.test.ts (254 lines, 6 it() blocks)
  modified:
    - dashboard/lib/deploy-state.ts (+10 lines: optional warning field)
decisions:
  - DeployActionResult carries rollbackActions[] on the failure branch (not just in a separate state file) so tests and the UI can observe the forensic trail without re-reading disk
  - Rollback does NOT rewrite a rolled-back state file on disk — deleteDeployState is authoritative for the zero-orphan invariant; the returned result object is the only forensic surface
  - Double-deploy guard uses 60s window matching 04-RESEARCH.md Open Question #1 recommendation
  - launchctlPrintWithRetry with 3 attempts × 100ms backoff (Pitfall #2 per research)
  - withTimeout wrapper uses real setTimeout + 15s test override rather than vi.useFakeTimers to avoid microtask-pump interactions with fs.promises
metrics:
  duration: "~11 minutes"
  completed: "2026-04-20"
  tasks: 3
  files_created: 4
  files_modified: 1
  tests_added: 21
  suite_before: "297/297"
  suite_after: "318/318"
  suite_duration: "10.42s"
---

# Phase 04 Plan 04: Deploy-Family Server Actions Summary

**One-liner:** Four Server Actions (deployRoutine + getDeployState + runNowRoutine + setRoutineEnabled) composing Phase 2 adapters and Plan 04-01 deploy-state into a 4-stage state machine with zero-orphan rollback for DEPL-01/02/04/05.

## What shipped

### `dashboard/app/routines/actions.ts` (new, 860 lines)

Four Server Actions, each a `"use server"` export:

1. **`deployRoutine({runtime, slug}): DeployActionResult`**
   - 4-stage state machine: `planning → writing → loading → verified`
   - Per-step work mapping:
     - `planning`: readBundle + healthCheck
     - `writing`: adapter.deploy(bundle) — captures `artifact` + `warning`
     - `loading`: `launchctl print gui/<uid>/<label>` with 3 × 100ms retry for codex/gemini; artifact-exists check for claude-desktop; no-op for claude-routines
     - `verified`: terminal succeeded state with `verifiedAt` (feeds drift detection) and copied-through `warning` (Q1 claude-desktop surface)
   - Per-step `elapsedMs` timing recorded for UI step pills
   - Atomic `writeDeployState` on every transition so 500ms polling sees progress
   - Double-deploy guard: prior running state < 60s short-circuits with `{ok:false, error:"deploy already in progress"}`
   - **Rollback orchestrator** on any step failure:
     1. `withTimeout(adapter.undeploy(bundle), 10_000, fallback)` — resolves-never-rejects
     2. `deleteDeployState(runtime, slug)` — zero-orphan invariant
     3. Returns `{ok:false, error, failedStep, rollbackActions}` — forensic trail to UI

2. **`getDeployState({runtime, slug}): DeployState | null`**
   - Read-only pass-through to `readDeployState`. No mutation. 500ms-polled by the drawer.

3. **`runNowRoutine({runtime, slug}): RunNowActionResult`**
   - Dispatches via `getAdapter(runtime).runNow(bundle)`
   - For claude-routines: surfaces adapter's `watchUrl` as `handoffUrl` so the UI can open a browser handoff tab without knowing the runtime
   - For codex/gemini/claude-desktop: propagates `{runId, watchUrl}`

4. **`setRoutineEnabled({runtime, slug, enabled}): SetEnabledActionResult`**
   - First-enable invariant: `enabled=true` requires `phase.kind === "succeeded"` — otherwise returns `{ok:false, error:"Not deployed yet. Click Deploy first."}`
   - codex/gemini: `launchctl bootstrap gui/<uid> <plistPath>` (enable) or `launchctl bootout gui/<uid>/<label>` (disable); plist stays on disk either way for fast re-enable
   - Per-runtime persistence:
     - codex/gemini: rewrite `routines-<runtime>/<slug>/config.json` with new `enabled` field
     - claude-desktop: `setEnabled(slug, enabled)` from v0.1 `routines.ts` (COMP-02 frozen surface)
     - claude-routines: `~/.sleepwalker/routines.json::archived_fleets[]` with **inverse semantics** (disable = add fleet, enable = remove fleet); no launchctl involvement

### `dashboard/lib/deploy-state.ts` (amended, +10 lines)

Added optional `warning?: string` field to the `DeployState` interface. Purely additive — 11/11 existing deploy-state tests remain green. Populated by deployRoutine on the verified transition from `adapter.deploy().warning`, so the drawer's success toast can surface the claude-desktop manual-add instruction ("Claude Desktop does not auto-detect routines...") alongside the "Close" + "Run now" CTAs.

### Three new test files (21 it() blocks total)

**`dashboard/tests/deploy-routine-action.test.ts`** (9 blocks):
1. `state machine transitions planning -> writing -> loading -> verified` (row 1)
2. `rollback on writing failure` (row 5)
3. `nested error captured in rollbackActions array` (row 6)
4. `no orphaned state after failed deploy` (row 7)
5. `bootout timeout surfaces as rolled-back with timed out entry` (row 8) — real 10s timer + 15s test override
6. `planning step fails when adapter is unavailable`
7. `double-deploy guard: prior running state < 60s returns already in progress`
8. `successful deploy preserves warning from adapter (claude-desktop Q1 surface)`
9. `bundle not found returns error without writing state`

**`dashboard/tests/run-now-action.test.ts`** (6 blocks):
1. `claude-routines: returns handoffUrl from adapter watchUrl` (row 13)
2. `claude-desktop: invokes adapter.runNow with the bundle and returns runId` (row 14)
3. `codex detached: adapter.runNow returns runId for fire-and-forget spawn` (row 15)
4. `gemini detached: same shape as codex` (row 16)
5. `adapter.runNow error surfaces as {ok:false, error}`
6. `bundle not found returns {ok:false, error} without calling adapter`

**`dashboard/tests/set-enabled-action.test.ts`** (6 blocks):
1. `disable bootout: launchctl bootout invoked with gui/<uid>/<label>` (row 17)
2. `enable bootstrap: launchctl bootstrap invoked with gui/<uid> <plistPath>` (row 18)
3. `persist flag: config.json enabled field flips after disable` (row 19)
4. `enable draft error: enabling a non-succeeded state returns error` (row 20)
5. `claude-routines: no launchctl invocation, archived_fleets toggles`
6. `bundle not found returns {ok:false, error}`

## VALIDATION.md rows flipped

| Row | Requirement | Anchor | Status |
|-----|-------------|--------|--------|
| 1   | DEPL-01     | state machine transitions | 4-04 green |
| 5   | DEPL-02     | rollback on writing failure | 4-04 green |
| 6   | DEPL-02     | nested error captured | 4-04 green |
| 7   | DEPL-02     | no orphaned state | 4-04 green |
| 8   | DEPL-02     | bootout timeout | 4-04 green |
| 13  | DEPL-04     | claude-routines | 4-04 green |
| 14  | DEPL-04     | claude-desktop | 4-04 green |
| 15  | DEPL-04     | codex detached | 4-04 green |
| 16  | DEPL-04     | gemini detached | 4-04 green |
| 17  | DEPL-05     | disable bootout | 4-04 green |
| 18  | DEPL-05     | enable bootstrap | 4-04 green |
| 19  | DEPL-05     | persist flag | 4-04 green |
| 20  | DEPL-05     | enable draft error | 4-04 green |

**13 rows flipped from ⬜ pending to ✅ green.**

## Must-have truths (9/9 observable)

| Truth | Evidence |
|-------|----------|
| deployRoutine advances planning → writing → loading → verified, writing state file each transition | `state machine transitions` asserts steps.{planning,writing,loading,verified} all defined + file persisted |
| Any step failure triggers adapter.undeploy + deleteDeployState before returning | `rollback on writing failure` asserts undeploy called once + state file absent |
| Rollback captures nested errors in phase.rollbackActions[] | `nested error captured` asserts undeploy.ok=false AND deleteDeployState.ok entries both present |
| 10s bootout/undeploy timeout surfaces as terminal rolled-back with `timed out` reason | `bootout timeout` asserts rollbackActions[].error matches /timed out/ |
| getDeployState is read-only pass-through to readDeployState | Source: `getDeployState` body is `return readDeployState(args.runtime, args.slug)` — no mutation |
| runNowRoutine dispatches to getAdapter(runtime).runNow for all 4 runtimes | 4 runtime-specific test blocks assert adapter.runNow invocation + result shape |
| setRoutineEnabled(enabled=false) calls launchctl bootout on codex/gemini | `disable bootout` asserts launchctl args[0]=="bootout" |
| setRoutineEnabled(enabled=true) re-calls launchctl bootstrap | `enable bootstrap` asserts launchctl args[0]=="bootstrap" |
| setRoutineEnabled on a Draft returns `Not deployed yet...` error | `enable draft error` asserts res.error matches /Not deployed yet/ |

## Suite count delta

**Before:** 297 tests in 31 files, ~2.1s
**After:** 318 tests in 34 files, ~10.4s

Delta: +21 tests (9 + 6 + 6), +3 files. The ~8s duration increase is entirely attributable to the real-timer bootout-timeout test (blocks 10s to exercise the 10s undeploy window); the other 20 new tests run in <300ms combined.

## Claude-desktop Q1 warning surface path confirmed

End-to-end flow (covered by `successful deploy preserves warning` block):

1. `adapter.deploy(bundle)` returns `{ok:true, artifact, warning:"Claude Desktop does not auto-detect..."}`
2. deployRoutine captures `warning` into the verified-step DeployState: `{phase:{kind:"succeeded"}, artifact, warning, verifiedAt}`
3. `writeDeployState` persists the full state including the warning field (added to DeployState in this plan's micro-commit)
4. Server Action returns `{ok:true, state}` with state.warning carrying the instruction
5. Plan 04-07's deploy-progress-drawer renders `state.warning` in the success toast alongside Close + Run-now CTAs

## Rule-2/Rule-3 auto-fixes

**None required.** Plan executed verbatim against the prescribed algorithm. The only "deviation" from a literal reading of the plan text was **not persisting a rolled-back state file** — which is the direct consequence of the 04-RESEARCH.md governing invariant that `deleteDeployState` leaves no state file on disk after rollback. Forensic trail moved to the `DeployActionResult.rollbackActions` field instead, which is what the UI (and tests) inspect.

## Commits

1. `c5a9c75` — `feat(04-04): amend DeployState with optional warning field for claude-desktop Q1 surface`
2. `d06d22b` — `feat(04-04): routines/actions.ts with deployRoutine state machine + getDeployState + runNowRoutine + setRoutineEnabled`
3. `8047e2e` — `test(04-04): deploy-routine-action.test.ts with state-machine + rollback matrix (9 it() blocks)`
4. `85cd378` — `test(04-04): run-now-action + set-enabled-action test matrices (6 it() blocks each)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript strict mode required rollbackActions to be non-optional on failure branch**
- **Found during:** Task 1 typecheck
- **Issue:** Initial `DeployActionResult` had `rollbackActions` as an optional field; once required, all pre-rollback early-return sites failed typecheck
- **Fix:** Added `rollbackActions: []` to every early-return path (bundle-not-found, double-deploy guard, planning-write failure) and `rollbackActions` (populated) to the rollback() function's return
- **Rationale:** The UI contract is stronger when `rollbackActions` is always a typed array — callers don't have to guard against `undefined | []`
- **Files modified:** dashboard/app/routines/actions.ts
- **Commit:** `d06d22b` (folded in pre-commit)

**2. [Rule 1 - Bug] Fake-timer strategy for bootout-timeout test caused 5s hang**
- **Found during:** Task 2 initial run
- **Issue:** `vi.useFakeTimers()` default mode fakes setTimeout AND setImmediate/nextTick, which blocks `fs.promises.writeFile` resolution paths used by `writeDeployState` inside `deployRoutine`
- **Attempted fix:** `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })` + `await Promise.resolve()` pumps — still hung at 5s test timeout
- **Final fix:** Use real timers, set test-scoped `testTimeout: 15_000` in the `it()` call, let the 10s undeploy window actually elapse
- **Trade-off:** Adds 10s to total suite runtime (10.42s vs 2.12s baseline) — below 90s Nyquist target; acceptable for the forensic value of exercising the exact timeout path
- **Files modified:** dashboard/tests/deploy-routine-action.test.ts (it block 5)
- **Commit:** `8047e2e`

## Known stubs

None. All 4 Server Actions are wired end-to-end to real Phase 2 adapters and real Plan 04-01 deploy-state functions. The test suite mocks `@/lib/runtime-adapters` and `node:child_process` for isolation but the production code path has zero `TODO`/`placeholder`/`empty-return` stubs.

## Threat Flags

None. This plan introduces no new network endpoints, no new file-system write paths outside the already-reviewed `~/.sleepwalker/deploys/` + `~/.sleepwalker/routines.json` + `routines-<runtime>/<slug>/config.json` surfaces from Plans 04-01 and 04-02 + Phase 3. The `launchctl` shell-outs use `execFile` (no shell injection surface) with args built from `toLaunchdLabel`/`toPlistPath` (which both call `assertValidSlug`). The user-authored prompt never reaches `execFile`/`launchctl` args — supervisor-level prompt routing remains Phase 2's responsibility.

## Self-Check: PASSED

Files:
- FOUND: dashboard/app/routines/actions.ts
- FOUND: dashboard/tests/deploy-routine-action.test.ts
- FOUND: dashboard/tests/run-now-action.test.ts
- FOUND: dashboard/tests/set-enabled-action.test.ts

Commits:
- FOUND: c5a9c75
- FOUND: d06d22b
- FOUND: 8047e2e
- FOUND: 85cd378

Typecheck: exits 0
Full suite: 318/318 passing
