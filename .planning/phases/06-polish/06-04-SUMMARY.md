---
phase: 06-polish
plan: 04
subsystem: testing
tags: [backward-compat, integration, v0.1, bash, vitest, install-idempotency, queue-aggregator]

requires:
  - phase: 01-foundation
    provides: 14 v0.1 routines (6 local + 8 cloud) + install.sh idempotency
  - phase: 05-queue
    provides: aggregateQueue({fetchCloud: false}) 3-source merge API

provides:
  - tests/compat/v01-routines.sh — bash integration test asserting the 14 v0.1 routines have their required files + install.sh idempotency
  - dashboard/tests/v01-queue-integration.test.ts — TS integration test asserting aggregateQueue surfaces all 14 v0.1 entries without dropping any and with zero v0.2-shape leakage
  - tests/compat/ directory — new home for Plan 06-05 frozen-surface.sh and Plan 06-06 CI workflow invocations

affects: [06-polish, 06-05 COMP-02 frozen-surface, 06-06 CI workflow]

tech-stack:
  added: []
  patterns:
    - "Bash integration test: mktemp -d isolated $HOME + trap cleanup EXIT + assert_file/assert_eq/assert_ge helpers + PASS/FAIL counter exit discipline"
    - "Wrap-don't-duplicate: tests/compat/v01-routines.sh invokes hooks/tests/install-idempotency.sh rather than re-implementing the twice-install-then-diff proof"
    - "v0.1 vs v0.2 test-file split: v01-queue-integration.test.ts seeds ONLY v0.1 shapes; Phase 5 queue-aggregator.test.ts owns multi-source v0.2 seeds"
    - "Floor-count over strict-count: >= 6 local + >= 8 cloud tolerates v0.2 /editor-authored additions while still catching mass deletion"

key-files:
  created:
    - tests/compat/v01-routines.sh (152 lines, executable)
    - dashboard/tests/v01-queue-integration.test.ts (151 lines, 2 it blocks)
  modified: []

key-decisions:
  - "Floor-count (>=) instead of strict-count (==) for routine directory tallies — Rule 1 auto-fix because a parallel-session sleepwalker-daily-standup bundle already pushed local routines to 7; v0.2 is about /editor authoring new routines, so COMP-01 must tolerate additions while still catching v0.1 deletions"
  - "Bash Phase 1 delegates install.sh idempotency to hooks/tests/install-idempotency.sh rather than duplicating the twice-run-then-diff logic — landmine #4 compliance, keeps one source of truth for the proof"
  - "Underscore-prefix filter on cloud enumeration excludes _test-zen fixture — landmine #1 defense; a naive ls | wc -l would return 9 not 8 and silently mask future drift"

patterns-established:
  - "tests/compat/ directory as the home for backward-compat integration scripts — Plan 06-05 frozen-surface.sh will live here too"
  - "v0.1 slug enumeration by exact name in both bash + TS test files — regression canary for v0.1 catalog preservation"
  - "assert_ge helper alongside assert_eq + assert_file in the bash harness — enables floor-count assertions that accept additive growth"

requirements-completed: []

duration: ~11min
completed: 2026-04-22
---

# Phase 6 Plan 04: COMP-01 v0.1 Backward-Compat Integration Test Summary

**Two-part v0.1 regression canary: bash file-layout enumeration of 14 v0.1 routines + install.sh idempotency proof, plus TS aggregator round-trip asserting 14 v0.1 queue entries survive without v0.2 supervisor-run leakage.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-22T05:05:00Z (approx)
- **Committed:** 2026-04-22T05:10:42-04:00 (Task 1) + 2026-04-22T05:13:32-04:00 (Task 2)
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- `tests/compat/v01-routines.sh` (152 lines, executable) enumerates all 14 v0.1 routines by exact slug name — 6 local with SKILL.md plus 8 cloud with prompt.md/config.json/setup.md. 32 assertions pass on HEAD. Removing any v0.1 routine exits 1 with MISSING FILE failures (self-test verified).
- `dashboard/tests/v01-queue-integration.test.ts` (151 lines, 2 it blocks) seeds 6 local + 8 cloud v0.1-shape entries via `makeTempHome`, asserts `aggregateQueue({fetchCloud: false})` returns all 14 with localCount=6 and cloudCount=8. Second test guards against v0.2 leakage — no entry carries `kind:"supervisor-run"` or `source ∈ {codex, gemini}` when seed is v0.1-only.
- Dashboard test suite grew from 373 to 375 tests (+2); test-file count 43 → 44. Typecheck clean. Full suite runs in 10.5s.
- `tests/compat/` directory created as new home for Plan 06-05's `frozen-surface.sh` and Plan 06-06's CI workflow invocations.

## Task Commits

1. **Task 1: tests/compat/v01-routines.sh** — `561186f` (test)
2. **Task 2: dashboard/tests/v01-queue-integration.test.ts** — `c64f40f` (test)

Both commits are pure `test(06-04): ...` — zero production code touched, zero existing tests modified.

## Files Created/Modified

- `tests/compat/v01-routines.sh` — Bash integration test for COMP-01 Part 1: delegates install.sh idempotency to `hooks/tests/install-idempotency.sh`, then enumerates the 14 v0.1 routines with per-slug file assertions plus floor-count guards. Runs in isolated `$HOME` via `mktemp -d` + `trap cleanup EXIT`. No `codex`/`gemini` binary required.
- `dashboard/tests/v01-queue-integration.test.ts` — TS integration test for COMP-01 Part 2: seeds 14 v0.1-shape entries (LOCAL_SLUGS + CLOUD_SLUGS constants mirror `docs/ROUTINES.md`), calls `aggregateQueue({fetchCloud: false})`, asserts exact counts plus no v0.2 shape leakage.

## Decisions Made

- **Floor-count (>= 6 local, >= 8 cloud) instead of strict equality (== 6, == 8).** The plan as written expected exact counts. The repo at execution time had 7 local routines because a parallel session added `sleepwalker-daily-standup` (commit `58e8712`). A strict-count test would fail not because v0.1 was violated but because v0.2 authoring was working. Rule 1 auto-fix applied — the per-slug file assertions above the counts are the real regression canaries; the count assertion is a floor guard against mass deletion only. Documented as deviation below.
- **Delegate install.sh idempotency to the existing harness.** Plan line 169 explicitly called this out as landmine #4: "wrap, don't duplicate." Phase 1 of the new script invokes `bash "$REPO_ROOT/hooks/tests/install-idempotency.sh" >/dev/null` and treats its exit code as the pass/fail signal. Keeps one source of truth for the proof.
- **Slug enumeration by exact name (not glob).** Both test files hardcode the 14 v0.1 slugs as explicit arrays. Per the plan's landmine #1 and the CRITICAL note in `<interfaces>`, a naive `ls routines-cloud/ | wc -l` returns 9 (8 real + 1 `_test-zen`) and masks drift. The exact-name check is immune to both rename and underscore-fixture contamination.
- **`kind: "supervisor-run"` literal in the second test's assertion is intentional.** The acceptance criterion grep `grep -c '"supervisor-run"' ... equals 0` is an over-specified smoke test — the test file needs the literal in the assertion (`e.kind === "supervisor-run"`) for the v0.2-leakage check to mean anything. Final state: exactly 1 occurrence of `"supervisor-run"` on line 142 in the assertion; zero occurrences in any seed object. Intent satisfied; strict grep slightly over-counts by design. Documented below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict-count assertion replaced with floor-count (`assert_ge`) on routine directory tallies**

- **Found during:** Task 1 (self-test after initial write — temporarily renamed `sleepwalker-downloads-organizer` then restored)
- **Issue:** The plan's `<action>` block specified `assert_eq "$REAL_LOCAL" "6"` and `assert_eq "$REAL_CLOUD" "8"`. At HEAD the repo had 7 local routines because parallel session commit `58e8712` (`sleepwalker-daily-standup`) already landed before Plan 06-04 started. A strict equality assertion would fire `NOT EQUAL local routine count: got '7' expected '6'` — a false positive for "v0.1 regression," because v0.1 routines are all still present; the extra routine is v0.2 `/editor` authoring working as designed.
- **Fix:** Added `assert_ge` helper alongside `assert_eq` + `assert_file`; rewrote the two count assertions as `assert_ge "$REAL_CLOUD" "8" "real cloud routine count (v0.1 baseline)"` and `assert_ge "$REAL_LOCAL" "6" "local routine count (v0.1 baseline)"`. Updated header comment and Phase 2 banner to clarify that per-slug file assertions are the primary regression canary; the count is a floor guard against mass deletion. Plan's landmine #1 defense (underscore-prefix filter) preserved verbatim.
- **Files modified:** `tests/compat/v01-routines.sh`
- **Verification:** `bash tests/compat/v01-routines.sh` exits 0 with `Summary: 32 passed, 0 failed` on current HEAD (7 local). Self-test: `mv routines-cloud/pr-reviewer /tmp && bash tests/compat/v01-routines.sh` exits 1 with 4 FAILURES (3 MISSING FILE + 1 COUNT BELOW MINIMUM). `mv routines-local/sleepwalker-downloads-organizer /tmp && bash tests/compat/v01-routines.sh` exits 1 with 1 MISSING FILE failure (count stays at 6 which is the floor).
- **Committed in:** `561186f` (Task 1 commit)

**2. [Rule 1 - Bug] Comment on the test file's `<action>` block contained the literal string `"supervisor-run"` in a no-supervisor comment**

- **Found during:** Task 2 grep-audit against acceptance criterion `grep -c '"supervisor-run"' dashboard/tests/v01-queue-integration.test.ts equals 0`
- **Issue:** The plan's `<action>` scaffolding placed the literal `"supervisor-run"` in a comment explaining what we are NOT seeding. The grep-count acceptance criterion doesn't distinguish between comment and code, so initial draft had 2 occurrences (1 comment + 1 assertion). The comment occurrence added no value — the full phrase was already readable without the literal.
- **Fix:** Rewrote the comment from `no runtime, no kind:"supervisor-run"` to `no runtime, no supervisor kind discriminant`. The assertion-side occurrence on line 142 (`e.kind === "supervisor-run"`) is intentional and load-bearing — removing it would break the no-leakage check. Final state: 1 occurrence of the literal, on the assertion line only.
- **Files modified:** `dashboard/tests/v01-queue-integration.test.ts`
- **Verification:** `grep -n '"supervisor-run"' dashboard/tests/v01-queue-integration.test.ts` returns only line 142 (the assertion). `grep -cE 'kind:\s*"supervisor-run"' ...` returns 0 — no seed object uses it.
- **Committed in:** `c64f40f` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — both in the plan's over-specified acceptance criteria, not in intent)

**Impact on plan:** Both auto-fixes preserve the plan's INTENT (v0.1 regression canary + zero v0.2 shape leakage) while correcting over-specified checks that would have produced false positives. No scope creep, no architectural change. COMP-01 remains flippable to Complete once Plan 06-05 (frozen-surface gate) ships.

## Issues Encountered

- **Parallel-session artifact in `routines-local/`.** A concurrent session added `sleepwalker-daily-standup` (commit `58e8712`) which pushes local routine count to 7. This was flagged in the executor prompt as expected and handled via the floor-count auto-fix above. The executor prompt also flagged a pre-existing `tests/routines.test.ts` failure driven by this same artifact; that failure was NOT present at the time Plan 06-04 executed (`pnpm test --run` shows 44 passed / 44 / 375 tests), apparently resolved upstream in commit `e0e7437` (`fix(run-now): resolve claude path via login shell, portal toast survives RSC refresh`). No action needed.
- **An extra commit landed on main between the expected base (`c8a63b7`) and this plan's first commit.** `e0e7437` was authored by the parallel session. My two commits (`561186f` + `c64f40f`) are clean on top of it and don't conflict.

## Verification Summary

- `test -x tests/compat/v01-routines.sh` — passes (executable bit set)
- `bash -n tests/compat/v01-routines.sh` — syntax check exits 0
- `bash tests/compat/v01-routines.sh` — exits 0, Summary: 32 passed, 0 failed
- `head -1 tests/compat/v01-routines.sh` — `#!/bin/bash`
- `grep -c '^set -euo pipefail' tests/compat/v01-routines.sh` — 1
- All 14 v0.1 slugs referenced by exact name in both test files (grep ≥ 1 each confirmed)
- `grep -c install-idempotency.sh tests/compat/v01-routines.sh` — 1 (delegation, not duplication)
- `grep -c 'TEST_HOME=\$(mktemp' tests/compat/v01-routines.sh` — 1
- `grep -c 'trap cleanup EXIT' tests/compat/v01-routines.sh` — 1
- `grep -c 'aggregateQueue' dashboard/tests/v01-queue-integration.test.ts` — 1
- `grep -c 'makeTempHome' dashboard/tests/v01-queue-integration.test.ts` — 1
- `grep -c 'fetchCloud: false' dashboard/tests/v01-queue-integration.test.ts` — 2 (both tests use it)
- `grep -c '"supervisor-run"' dashboard/tests/v01-queue-integration.test.ts` — 1 (assertion only; zero in seeds)
- `grep -cE 'source:\s*"codex"|source:\s*"gemini"' dashboard/tests/v01-queue-integration.test.ts` — 0 (no v0.2 leakage in seeds)
- `pnpm run typecheck` — exits 0
- `pnpm test --run` — Test Files 44 passed (44); Tests 375 passed (375); delta +2 from 373 baseline
- `pnpm test -- tests/v01-queue-integration.test.ts --run` — 2 passed
- Optional self-test performed: rename `routines-local/sleepwalker-downloads-organizer/` out of place → `bash tests/compat/v01-routines.sh` exits 1 with `MISSING FILE: ...SKILL.md` failure; restore and re-run → exits 0. Test has teeth.

## Next Plan Readiness

- **Plan 06-05 (COMP-02 frozen-surface gate):** `tests/compat/` directory now exists and houses its first occupant. Plan 06-05's `frozen-surface.sh` can sit next to `v01-routines.sh` and both will be invoked from the Plan 06-06 CI workflow.
- **COMP-01 Complete flag:** Requirement stays Pending in REQUIREMENTS.md per the plan's success criteria — "COMP-01 requirement flippable to Complete once Plan 06-05 (frozen-surface gate) also ships." Both halves of the backward-compat contract must land before COMP-01 can seal.
- **No user setup required.** Neither test touches real user state; both run in `mktemp -d` or `makeTempHome` isolated `$HOME`. No external service configuration needed.

## Self-Check

- `test -f /Users/rahulmehta/Desktop/Projects/sleepwalker/tests/compat/v01-routines.sh` → FOUND
- `test -f /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/v01-queue-integration.test.ts` → FOUND
- `git log --oneline --all | grep -q 561186f` → FOUND (`test(06-04): add tests/compat/v01-routines.sh for COMP-01 Part 1`)
- `git log --oneline --all | grep -q c64f40f` → FOUND (`test(06-04): add v01-queue-integration.test.ts for COMP-01 Part 2`)

## Self-Check: PASSED

---

*Phase: 06-polish*
*Completed: 2026-04-22*
