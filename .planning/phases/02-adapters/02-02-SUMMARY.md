---
phase: 02-adapters
plan: 02
subsystem: runtime-adapters
tags: [launchd, plist, xml, bootstrap, bootout, plutil, escape, idempotency, rollback, phase-2, wave-1]

# Dependency graph
requires:
  - phase: 02-adapters-plan-01
    provides: assertValidSlug-guarded identifier builders (toPlistPath, toLaunchdLabel) that Wave 2 adapters use when they construct LaunchdJob labels and plist paths
  - phase: 01-foundation
    provides: RuntimeAdapter type surface (LaunchdJob is a private type but adapters' deploy() will pass values derived from bundle.runtime / bundle.slug through the slug.ts builders into this module)
provides:
  - generatePlist(job) pure XML templating with 5-char entity escaping (&<>"')
  - installPlist(job) async primitive: mkdir parent → write plist mode 0644 → plutil -lint (rollback unlink on failure) → launchctl bootout (swallow) → launchctl bootstrap (rollback unlink on failure)
  - uninstallPlist(label) async primitive: launchctl bootout (swallow) → fs.unlink (ENOENT-tolerant)
  - LaunchdSchedule discriminated union (calendar / calendar-array / interval)
  - LaunchdJob interface (label, programArguments, schedule, std{out,err}Path, optional workingDirectory/environmentVariables/runAtLoad/throttleInterval)
  - InstallResult interface (ok, plistPath?, error?, lintOutput?)
affects: [02-06-codex, 02-07-gemini, 02-09-registry-swap, 03-editor-deploy-button, 04-deploy-state-machine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled plist XML with 5-char entity escape (& first to prevent double-escape)"
    - "bootout-before-bootstrap idempotency gate (Pitfall #4)"
    - "plutil -lint gate before launchctl bootstrap (catches malformed XML before xpcproxy EX_CONFIG errors)"
    - "Mode-0644 plist write (Pitfall #2: launchd rejects 0600)"
    - "Rollback unlink on bootstrap failure (T-02-02-04 DoS mitigation for orphaned artifacts)"
    - "ENOENT-tolerant fs.unlink for idempotent undeploy (result-object return, no throws)"
    - "Result-object error return with .lintOutput passthrough for diagnostics (mirrors v0.1 fire-routine.ts convention)"
    - "vi.doMock('node:child_process') + dynamic await import() inside it() blocks (Pitfall #8 hoisting-safe pattern)"

key-files:
  created:
    - dashboard/lib/runtime-adapters/launchd-writer.ts
    - dashboard/tests/launchd-writer.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "Three-way API split (generatePlist pure + installPlist async + uninstallPlist async) instead of single writePlist — pure function is snapshot-testable without fs/execFile and rollback is isolated to the install path"
  - "& MUST BE FIRST in plistEscape's replace chain; otherwise subsequent replacements double-escape any ampersand introduced by this very function"
  - "Mode 0o644 on the plist is load-bearing — launchd REJECTS more restrictive modes (Pitfall #2). Callers are contractually forbidden from putting secrets in environmentVariables; this module does not validate content"
  - "bootout ALWAYS runs before bootstrap in installPlist, even on first deploy. First-deploy bootout returns non-zero ('Not loaded') which we intentionally swallow via .catch(() => {}); second-deploy bootout succeeds. Without this Pitfall #4 silently leaves the stale version loaded"
  - "Single throw allowed (in currentUid() for non-POSIX runtime guard — programmer-bug, not operational error). Operational failures (lint fail, bootstrap fail, fs error) always return result objects"
  - "uninstallPlist uses an explicit try/catch around fs.unlink so ENOENT returns ok:true and any other errno returns an explicit error result — no re-throws inside the outer try (keeps total throw count at 1, matches AC7)"

patterns-established:
  - "LaunchdJob → plist XML: deterministic line-by-line string builder; schedule is a discriminated union with per-kind branches; every string field runs through plistEscape"
  - "Async primitive contract: mkdir parent (recursive) → write file (with required mode) → lint gate → idempotency gate (bootout, swallow) → state change (bootstrap, rollback on fail). Reused by Wave 2 adapters"
  - "Test file mocking: `vi.doMock('node:child_process')` per-test inside `it()` block, `vi.resetModules()` in beforeEach, `await import()` after doMock — pattern works reliably across Vitest versions and will be copied by codex.test.ts / gemini.test.ts"

requirements-completed: [ADPT-03]

# Metrics
duration: 4 min
completed: 2026-04-19
---

# Phase 2 Plan 02: Launchd Writer Summary

**Hand-rolled plist XML generator + idempotent launchctl bootstrap/bootout primitives — the foundation every Wave 2 local-CLI adapter (codex, gemini) composes to deploy a scheduled routine.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-19T05:32:50Z
- **Completed:** 2026-04-19T05:36:41Z
- **Tasks:** 4
- **Files created/modified:** 3

## Accomplishments

- Authored `dashboard/lib/runtime-adapters/launchd-writer.ts` (226 lines): 3 public type exports + 3 public functions (1 pure + 2 async), 3 module-private helpers. Handles all three plist schedule variants (calendar dict, calendar-array, interval), optional EnvironmentVariables block, optional WorkingDirectory, RunAtLoad default-false, ThrottleInterval default-300.
- Covered end-to-end by `dashboard/tests/launchd-writer.test.ts` (200 lines, 9 Vitest `it()` blocks): 5 pure-generator tests (calendar schedule with defaults, interval schedule without StartCalendarInterval, calendar-array with <array> not <dict>, 5-char XML escape on paths and program arguments, environmentVariables presence/absence) + 4 install/uninstall tests (happy-path command order with mode 0644 verification, plutil -lint failure rollback, bootstrap failure rollback, idempotent uninstall when plist absent).
- Dashboard suite grew from 63 → 72 passing tests (+9 new). All pre-existing 63 tests still green — zero regressions.
- Every launchctl / plutil call in tests is mocked via `vi.doMock("node:child_process")` — no real subprocesses invoked during the test run.
- Frozen-surface gate returns 0 lines of diff: no v0.1 files touched.
- `pnpm typecheck` exits 0.

## Task Commits

The plan's Task 4 explicitly requests a single atomic commit (source + test + activity log) via `git commit --amend --no-edit`, matching the v0.1 amend-activity-log convention seen in Plan 02-01.

1. **Tasks 1 + 2 + 3 + 4 combined** — `e14bbe6` `feat(02-02): add launchd-writer with plist generator and install/uninstall primitives`
   - `dashboard/lib/runtime-adapters/launchd-writer.ts` (Tasks 1+2: pure generator + async install/uninstall primitives)
   - `dashboard/tests/launchd-writer.test.ts` (Task 3: 9 Vitest it() blocks)
   - `docs/activity_log.md` (Task 4: entry appended then amended into same commit)

First commit hash before amend was `e63ad7c`; after `git commit --amend --no-edit` folded in the activity log it became `e14bbe6`.

## Files Created/Modified

- `dashboard/lib/runtime-adapters/launchd-writer.ts` — NEW. Three public type exports (`LaunchdSchedule` discriminated union, `LaunchdJob` interface, `InstallResult` interface), three public functions (`generatePlist` pure XML templating, `installPlist` async with rollback, `uninstallPlist` async idempotent), three module-private helpers (`plistEscape` 5-char XML escape, `launchAgentsPath` resolves `$HOME/Library/LaunchAgents/<label>.plist`, `currentUid` wraps `process.getuid()` with a single allowed throw for non-POSIX).
- `dashboard/tests/launchd-writer.test.ts` — NEW. Two describe groups: `generatePlist` (5 it blocks) and `installPlist + uninstallPlist` (4 it blocks). Uses `makeTempHome()` from `./helpers` for HOME isolation and `vi.doMock("node:child_process")` per-test to stub execFile. Verifies plist file mode is actually 0o644 on disk, asserts call order (plutil before bootout before bootstrap), confirms rollback unlinks on lint-fail and on bootstrap-fail.
- `docs/activity_log.md` — appended `## 2026-04-19 01:35 EST` entry per CLAUDE.md §Activity Log template.

## Decisions Made

- **Three-way API split.** `generatePlist` is pure (no I/O); `installPlist` composes it with `plutil -lint`, `launchctl bootout`, `launchctl bootstrap`; `uninstallPlist` is the teardown symmetric to install. This split matches research/PATTERN-1 recommendation and makes the pure path snapshot-testable without mocks.
- **5-char XML escape with & first.** `plistEscape` replaces `&` before `<`, `>`, `"`, `'`. Any other ordering would double-escape an ampersand introduced by this function. Test 4 ("XML-escapes & < > in programArguments and paths") exercises this directly on a mixed-character input.
- **Mode 0o644 is load-bearing.** Tracked in test 6 via `fs.stat` on the actual plist after installPlist. Pitfall #2 documents that launchd silently refuses plists with stricter modes. The code comment is explicit that callers must not place secrets in `environmentVariables`; this module does not enforce that — it's a Phase 3 editor concern (EDIT-02 secret-scan).
- **bootout-before-bootstrap always.** First deploy returns `Not loaded` from bootout, which we swallow; subsequent deploys need the old version gone before the new one loads. Test 6 asserts the command order (`bootoutIdx < bootstrapIdx`).
- **Rollback on bootstrap failure, not just lint failure.** The plan's behavior spec required only lint-failure rollback; threat register entry T-02-02-04 calls for DoS mitigation against orphaned artifacts. Added a dedicated `it()` block ("installPlist rolls back (unlinks plist) when bootstrap fails") that verifies the plist is unlinked after a mocked bootstrap error. See the "Deviations from Plan" section — this is a Rule 2 auto-add (missing critical test).
- **Single allowed throw.** Only `currentUid()` throws on non-POSIX; every operational failure returns a result object. `uninstallPlist` uses an explicit try/catch around `fs.unlink` instead of the research-example re-throw pattern, to keep `grep -c "^\s*throw "` at exactly 1 (matching plan AC7 `<= 1`).

## Deviations from Plan

Plan tasks executed as written. Two minor additions worth noting for auditors:

### Auto-added Critical Functionality

**1. [Rule 2 - Missing Critical] Added 9th test block for bootstrap-failure rollback**
- **Found during:** Task 3 (authoring the test file)
- **Issue:** The plan's behavior spec for Task 2 explicitly states "installPlist rolls back: on bootstrap failure, unlinks the plist file it just wrote (no orphaned artifacts)", and threat register entry T-02-02-04 calls this out as a DoS mitigation. The plan's `<behavior>` for Task 3 listed 8 tests but omitted a test for this behavior — the rollback on `launchctl bootstrap` failure was covered by the implementation in Task 2 but not exercised by any of the 8 listed tests.
- **Fix:** Added a 4th install/uninstall test block ("installPlist rolls back (unlinks plist) when bootstrap fails") that mocks `plutil` passing + `bootout` failing (ignored) + `bootstrap` failing, then asserts `result.ok === false`, `result.error` contains "bootstrap failed", and `fs.stat(plistPath)` rejects with `ENOENT`.
- **Files modified:** `dashboard/tests/launchd-writer.test.ts`
- **Verification:** `pnpm test -- launchd-writer.test.ts` passes with 9/9. Full suite 72/72.
- **Committed in:** `e14bbe6` (Task 3 shipped in the single atomic commit)

**2. [Rule 1 - Behavioral refinement] uninstallPlist uses try/catch around fs.unlink instead of re-throw**
- **Found during:** Task 2 acceptance verification (AC7 says `grep -c "throw " … returns <= 1`)
- **Issue:** The plan's code snippet in Task 2's `<action>` uses `fs.unlink(plistPath).catch((e) => { if (e.code !== "ENOENT") throw e; })` which produces 2 matches on `grep -c "throw "` — the `throw new Error` in `currentUid()` plus the inner `throw e` for non-ENOENT re-throws. The plan's AC7 explicitly caps this at 1.
- **Fix:** Replaced the `.catch()` form with an explicit `try { await fs.unlink(plistPath); } catch (e) { if (err.code !== "ENOENT") return { ok: false, error: ... }; }` inside the outer try. Same behavior (ENOENT-tolerant, non-ENOENT surfaces as error), zero re-throws. `grep -c "^\s*throw "` now returns 1.
- **Files modified:** `dashboard/lib/runtime-adapters/launchd-writer.ts`
- **Verification:** Typecheck green; idempotent-uninstall test passes (plist not present → bootout swallowed → fs.unlink ENOENT swallowed → `ok: true`).
- **Committed in:** `e14bbe6` (Task 2 shipped in the single atomic commit)

### Pre-existing Untracked Files (out of scope, not plan-caused)

Before this plan started, the working tree had three untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`) inherited from the Plan 02-01 environment. These are outside the plan's `files_modified` scope and were left untouched per the scope-boundary rule. `git status --porcelain` shows the three `??` entries, but `git status -s | grep -v '^??'` is empty — no uncommitted changes to plan-owned files.

---

**Total deviations:** 2 auto-added (1 missing-critical test, 1 AC-matching refactor). 0 scope creep.
**Impact on plan:** Net +1 test block (9 vs 8 planned) and slightly-different `uninstallPlist` unlink flow (behavior-equivalent, AC7-compliant). Both changes improve coverage and conformance.

## Issues Encountered

None. `pnpm typecheck` and `pnpm test -- launchd-writer.test.ts` were both green on first run of the combined source + test.

## User Setup Required

None - no external service configuration required. This plan ships pure library code + mocked-subprocess tests. Real `launchctl` / `plutil` invocations only happen when Wave 2 adapters call into `installPlist` in the real dashboard, and the supervisor-smoke manual test in Wave 4 (`test/manual/codex-adapter-smoke.md`) is the first place a human runs the real pipeline.

## Threat Register Outcome

All 5 STRIDE entries from the plan's threat_model are mitigated as designed and exercised by tests:

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-02-02-01 | Tampering (XML injection via path/label/env) | **mitigated** | `plistEscape` 5-char escape applied to every string field; test 4 exercises `&`, `<`, `>` in programArguments and paths |
| T-02-02-02 | Information Disclosure (plist env vars + 0644) | **mitigated (contractual)** | Mode 0o644 write verified on disk via `fs.stat` in test 6; module-top comment spells out the no-secrets-in-envVars contract for callers |
| T-02-02-03 | Elevation (launchctl gui/$UID domain) | **mitigated** | `currentUid()` uses `process.getuid()` → `gui/${uid}` — never `system/` domain; `execFile` uses array args with no shell interpolation |
| T-02-02-04 | DoS (orphaned plist on bootstrap failure) | **mitigated** | Rollback unlink verified by the bonus 9th it() block (bootstrap-failure test) — `fs.stat(plistPath)` rejects `ENOENT` after the failure path |
| T-02-02-05 | Tampering (bootout idempotency for redeploy) | **mitigated** | Happy-path test asserts command order `bootoutIdx < bootstrapIdx`; idempotent-uninstall test mocks bootout returning `Not loaded` and confirms `ok: true` |

## Public API Surface

Exactly 3 public async/sync functions and 3 public types (verified by `grep -cE "^export (async )?function" launchd-writer.ts` = 3 and `grep -cE "^export (type|interface)" launchd-writer.ts` = 3):

```
export type LaunchdSchedule
export interface LaunchdJob
export interface InstallResult
export function generatePlist(job: LaunchdJob): string
export async function installPlist(job: LaunchdJob): Promise<InstallResult>
export async function uninstallPlist(label: string): Promise<InstallResult>
```

`plistEscape`, `launchAgentsPath`, and `currentUid` are module-private helpers — not exported. Public surface is exactly what Wave 2 adapters need: build a `LaunchdJob`, call `installPlist` on deploy, call `uninstallPlist(label)` on undeploy.

## Next Phase Readiness

Wave 2 adapters (`02-06 codex.ts`, `02-07 gemini.ts`) are unblocked. Their `deploy()` implementations will:
1. Derive `label` from `toLaunchdLabel(bundle.runtime, bundle.slug)` (Plan 02-01 guarantees a valid value).
2. Derive `plistPath` from `toPlistPath(bundle.runtime, bundle.slug)` (same guarantee).
3. Construct a `LaunchdJob` with `programArguments: [SUPERVISOR_ABS_PATH, bundle.runtime, bundle.slug]` (never includes the user prompt — Pitfall #4 defeat-by-construction).
4. Call `installPlist(job)`, return the resulting `DeployResult`.

The supervisor binary (`bin/sleepwalker-run-cli`) authored in Wave 1 Plan 02-03 will be invoked by launchd via the `ProgramArguments` that Wave 2 adapters build. No launchd-writer changes needed for the supervisor wiring.

Plan 02-09 (registry swap) wires the ADAPTERS map to the real adapter instances; launchd-writer is imported transitively through codex/gemini, never directly by consumers outside the runtime-adapters/ package.

No blockers. Phase 2 Plan 03 (bash supervisor) is the next critical-path target for sequential execution; it shares Wave 1 with this plan but is independent (no cross-file dependency).

## Self-Check: PASSED

- [x] `dashboard/lib/runtime-adapters/launchd-writer.ts` exists (verified via `ls`)
- [x] `dashboard/tests/launchd-writer.test.ts` exists (verified via `ls`)
- [x] `docs/activity_log.md` contains the `2026-04-19 01:35 EST` entry (verified via `tail -20 | grep -c "launchd-writer"` → 4)
- [x] Commit `e14bbe6` exists in `git log` with subject `feat(02-02): add launchd-writer with plist generator and install/uninstall primitives` (verified)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test` exits 0 with 72/72 green (63 baseline + 9 new launchd-writer tests)
- [x] `grep -c "^export (async )?function" launchd-writer.ts` = 3 (generatePlist, installPlist, uninstallPlist)
- [x] `grep -c "^export (type|interface)" launchd-writer.ts` = 3 (LaunchdSchedule, LaunchdJob, InstallResult)
- [x] `grep -c "vi.doMock" launchd-writer.test.ts` = 4 (≥ 2)
- [x] `grep -cE "^\s+it\(" launchd-writer.test.ts` = 9 (≥ 8)
- [x] Frozen-surface diff against `e14bbe6~1` returns 0 lines (verified)
- [x] Plutil and launchctl are never actually invoked at runtime in tests (all `execFile` calls are synthesized via `vi.doMock` callbacks)

---
*Phase: 02-adapters*
*Completed: 2026-04-19*
