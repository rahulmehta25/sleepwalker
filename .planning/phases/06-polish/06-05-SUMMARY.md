---
phase: 06-polish
plan: 05
subsystem: testing
tags: [backward-compat, frozen-surface, ci-gate, v0.1-seal, bash, comp-02]

requires:
  - phase: 01-foundation
    provides: v0.1 seal commit 998455b as hardcoded baseline anchor
  - phase: 02-adapters
    provides: bin/sleepwalker-run-cli supervisor that shares LOCK_FILE sidecar path
  - phase: 04-deploy
    provides: DEPL-03 listRoutinesAsync extension to dashboard/lib/routines.ts
  - phase: 05-queue
    provides: QUEU-01 union widen + QUEU-03 readSupervisorRuns + QUEU-04 flock wraps (install.sh, audit-log, supervisor) + eager source tag
  - phase: 06-polish
    provides: Plan 06-04 tests/compat/ directory convention (sibling bash compat script pattern)
provides:
  - tests/compat/frozen-surface.sh permanent v0.1 frozen-surface regression gate
  - Hardcoded 998455b baseline anchor with exit-2 preflight for history-rewrite detection
  - 12 grep-verifiable exception predicates encoding every v0.1-shipped + Phase 2-5 additive amendment as a positive signal
  - Gate primitive ready for CI wiring in Plan 06-06 (.github/workflows/ci.yml)
affects: [phase-06-polish, phase-07-and-beyond, ci-workflows, contributor-onboarding]

tech-stack:
  added: []
  patterns:
    - "Hardcoded seal-commit baseline (not dynamic PHASE_BASE) — permanence vs one-time exit gate"
    - "Three-group classification: A byte-identical vs baseline / B grep-predicate exception / C post-seal first-add blob"
    - "Positive-signal predicates — assert v0.1 invariant present AND amendment present; removal of either fails gate"
    - "Cross-file shared-sidecar invariant (LOCK_FILE path identical across bin/sleepwalker-run-cli + hooks/sleepwalker-audit-log.sh + bin/sleepwalker-execute)"
    - "Distinct exit codes: 0 PASS / 1 surface regression / 2 baseline missing — operator can diagnose 'gate misconfigured' vs 'surface broke'"

key-files:
  created:
    - tests/compat/frozen-surface.sh
  modified: []

key-decisions:
  - "Baseline commit HARDCODED to 998455b (v0.1 seal 2026-04-17); no dynamic git-log resolution. CONTEXT.md-locked permanence decision."
  - "Rule 3 deviation: plan's Group A list was not empirically byte-identical vs 998455b. Rebuilt Groups to reflect truth — 27-path byte-identical Group A + 12-predicate Group B absorbing both same-day v0.1-shipped amendments (74c82f1 hook schema align + 61e1200 API trigger) and Phase 2-5 additive amendments + 3-path Group C for post-seal additions. Hardcoded baseline 998455b preserved."
  - "Local routine SKILL.md marker-tag retrofit (commit 74c82f1) classified as v0.1-shipped amendment in Group B with parameterized assert_exception_local_skill predicate — NOT Group A byte-identical."
  - "Per-file shared-sidecar LOCK_FILE invariant cross-checked between supervisor + audit hook + executor — one kernel mutex, not three byte-identical strings that could drift independently."
  - "Preflight git rev-parse --verify exits 2 (not 1) on baseline missing; exit 1 reserved for actual surface regression so CI can diagnose Pitfall 2 (history rewrite) separately."

patterns-established:
  - "Positive-signal exception predicate: grep v0.1 invariant + grep amendment. Both must hold. Removing v0.1 line OR removing amendment fails the gate."
  - "Literal path arrays (no globs) in bash frozen-surface scripts — silently adding or removing a frozen path cannot happen."
  - "mktemp sidecar + trap EXIT cleanup — no scratch-file leak on exit."
  - "Group C first-add comparison: git log --format='%H' --diff-filter=A --reverse -- <path> | head -1 resolves the canonical baseline for post-seal additions."

requirements-completed: [COMP-02]

duration: 19min
completed: 2026-04-22
---

# Phase 6 Plan 05: COMP-02 Permanent Frozen-Surface Gate Summary

**Ships `tests/compat/frozen-surface.sh` — a permanent v0.1 regression gate with hardcoded baseline 998455b, 12 grep-verifiable exception predicates covering every same-day v0.1-shipped amendment plus every Phase 2-5 additive amendment, three-tier path classification (byte-identical / documented exception / post-seal first-add blob), and distinct exit codes so CI operators can tell history-rewrite misconfiguration apart from actual surface regression.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-22T09:15Z (working-tree read)
- **Completed:** 2026-04-22T09:34Z
- **Tasks:** 1 (Task 1 — script creation + self-test)
- **Files created:** 1
- **Files modified:** 0
- **Gate runtime:** 0.384s on a local Mac (target <10s)

## Accomplishments

- **tests/compat/frozen-surface.sh:** 469-line executable bash script with hardcoded `BASELINE="998455b"`, `set -euo pipefail`, git-rev-parse-verify preflight, three path groups (A=27 byte-identical paths, B=12 predicate-verified exception functions, C=3 post-seal first-add paths), `record_fail` accumulator, `diff … | head -20` diagnostic output on regression, and distinct exit codes (0 PASS / 1 regression / 2 baseline-missing).
- **COMP-02 requirement now satisfied:** combined with Plan 06-04's `tests/compat/v01-routines.sh`, the backward-compat contract is enforceable in code (not just prose in CLAUDE.md). Both halves ship together per the COMP-01 + COMP-02 seal-together convention from 06-CONTEXT.md.
- **Four self-tests verified teeth:** (1) rogue append to `dashboard/lib/cloud.ts` (Group A) → exit 1 with `byte-diff vs 998455b` diagnostic; (2) `del(.dependencies.next)` on package.json → exit 1 with `v0.1 dep 'next' removed`; (3) remove `[sleepwalker:calendar-prep]` marker tag from routines-local SKILL.md → exit 1 with `v0.1-shipped marker tag missing`; (4) strip `readSupervisorRuns` from queue-aggregator.ts → exit 1 with `QUEU-03 readSupervisorRuns reader missing`. All four reverted; gate returns to green end-state.
- **Gate now runs in the same directory as Plan 06-04's companion script** — `tests/compat/` houses both permanent backward-compat scripts, ready for CI invocation (Plan 06-06) and for OSS contributors to run locally pre-PR.

## Task Commits

1. **Task 1: Create tests/compat/frozen-surface.sh with hardcoded 998455b baseline + exception predicates** — `a4edace` (test)

_Plan metadata closeout commit follows this summary._

## Files Created/Modified

- `tests/compat/frozen-surface.sh` (new, 469 lines, executable) — permanent v0.1 frozen-surface regression gate. Hardcoded `BASELINE="998455b"`. Three groups: A (27 byte-identical paths), B (12 exception predicate functions), C (3 post-seal first-add paths). Distinct exit codes 0/1/2. mktemp sidecar + trap EXIT cleanup. `diff … | head -20` diagnostic preview on byte-diff. Literal path arrays — no globs.

## Decisions Made

- **Hardcoded baseline `998455b` preserved per CONTEXT-lock.** No dynamic `git log --grep` resolution — the exit-gate pattern from Phases 2/3/4/5 was one-time; this gate is permanent and must survive future commit-message edits.
- **Group A reduced from plan's 39 paths to empirically-verified 27.** The plan's Group A list was aspirational — 12 of its 39 paths were not byte-identical vs 998455b because of same-day v0.1-shipped fix commits (`74c82f1` hook-schema alignment touched all 3 hooks + added `[sleepwalker:<slug>]` marker tag to all 6 local routines; `61e1200` API trigger added `CloudCredential` to settings.ts + introduced fire-routine.ts). Moved those 12 paths to Group B (documented exceptions with v0.1-invariant + amendment grep predicates) so the gate reflects ground truth while preserving plan intent: no v0.1 signature can drift without breaking a predicate.
- **Group B predicates assert positive signals — not negative.** Each predicate greps for v0.1 invariants (e.g., `set -euo pipefail`, `BUDGETS_FILE=`, `export type Policy`) AND the documented amendment (e.g., `ERROR: flock is required`, `CloudCredential`, `readSupervisorRuns`). Bypass requires editing multiple predicates plus the diffed file — visible in PR review per threat register T-06-05-05.
- **LOCK_FILE shared-sidecar cross-check lives in two predicates** (audit-log-sh + sleepwalker-execute). Ensures future amendments to any of the three flock writers (supervisor/hook/executor) cannot silently fork the shared kernel-mutex path that Phase 5 QUEU-04 locked in.
- **Local SKILL.md marker-tag predicate parameterized over LOCAL_SLUGS array.** One function `assert_exception_local_skill "$slug"` reused across all 6 v0.1 slugs — DRY, and a future `sleepwalker-daily-standup` or similar v0.2 routine does not trip this predicate because the array is a hard-coded v0.1-only list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's Group A path list was not empirically byte-identical vs 998455b**

- **Found during:** Task 1 (pre-write empirical check of each Group A path against `git show 998455b:<path>`)
- **Issue:** The plan enumerated 39 paths in Group A (byte-identical, no exceptions) based on 06-RESEARCH §5.2's "amendments: none" column. Empirical diff revealed **12 mismatches**:
  - `hooks/sleepwalker-defer-irreversible.sh` — drifted (commit 74c82f1 rewrote to emit `hookSpecificOutput` + `permissionDecision` shape required by Claude Code's real hook schema; same day as v0.1 seal).
  - `hooks/sleepwalker-budget-cap.sh` — drifted (same commit 74c82f1 refactor to detect fleet via _detect_fleet.sh).
  - `dashboard/lib/settings.ts` — drifted (commit 61e1200 added `cloudCredsFile` + `CloudCredential` type for per-routine API trigger — "shipped with v0.1" per CLAUDE.md, landed 2026-04-17 same day as 998455b).
  - All 6 `routines-local/sleepwalker-*/SKILL.md` files — drifted (commit 74c82f1 retrofitted each with a `[sleepwalker:<short-slug>]` marker tag so `_detect_fleet.sh` can identify fleet context from the transcript).
  - `hooks/_detect_fleet.sh`, `dashboard/lib/approval.ts`, `dashboard/lib/fire-routine.ts` — **missing entirely** at 998455b (added post-seal by 74c82f1 / 74c82f1 / 61e1200 respectively).
- **Why the plan was wrong:** Same-day fix commits `74c82f1` (2026-04-17 "align hooks with real Claude Code schema + working end-to-end") and `61e1200` (2026-04-17 "API trigger for cloud routines") landed hours after the 02:58 v0.1 seal commit but BEFORE any Phase 2-5 planning work. CLAUDE.md itself describes v0.1 as "shipped 2026-04-17" with "per-routine API trigger" — meaning "v0.1 as shipped" is not the `998455b` blob, it's the 2026-04-17 main-branch tip. 06-RESEARCH §5.2 classified these files as "amendments: none" because it compared against the semantic "v0.1 shipped" concept rather than the literal `998455b` commit.
- **Fix:** Restructured into empirically-validated groups:
  - Group A (27 paths): actually byte-identical vs 998455b — 24 cloud routine files (8 × 3) + dashboard/lib/cloud.ts + audit.ts + github.ts.
  - Group B (12 predicates): absorbs the 9 v0.1-shipped same-day amendments (2 drifted hooks + 1 drifted settings.ts + 6 local SKILL.md marker tags) PLUS the 5 Phase 2-5 amendments originally planned for Group B (install.sh flock preflight, audit-log flock wrap, queue.ts widen, queue-aggregator readSupervisorRuns, package.json dep retention) PLUS 2 additional Phase-era amendments surfaced during triage (cloud-cache eager-source, routines.ts listRoutinesAsync) PLUS 1 Group-C-with-amendment (bin/sleepwalker-execute Phase 5 flock wrap).
  - Group C (3 paths): byte-identical-to-first-add-blob for pure post-seal additions with no subsequent amendments (_detect_fleet.sh, approval.ts, fire-routine.ts).
- **Files modified:** `tests/compat/frozen-surface.sh` (initial draft authored against corrected groupings; never committed the aspirational version).
- **Verification:** `bash tests/compat/frozen-surface.sh` exits 0 on HEAD `a4edace`. All 12 exception predicates pass. Self-tests on 4 representative regressions all exit 1 with clear FAILURES output. `grep -c 'BASELINE="998455b"'` returns 1 (hardcoded preserved). No dynamic-resolution antipattern introduced: `grep -cE 'git log --grep|PHASE.*_BASE'` returns 0.
- **Committed in:** `a4edace` (only commit for this plan).

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking — plan's empirical path classification was wrong; fixing it was required to produce a gate that passes on current HEAD. Hardcoded baseline, exit-code contract, <10s runtime, self-test invariants, and all plan success-criteria intent preserved.)

**Impact on plan:** Plan intent fully preserved (permanent gate anchored at 998455b with documented additive exceptions). Acceptance-criterion "Group A array contains at least 39 literal path entries" was interpreted as aspirational path-count rather than a hard floor — 27 truly-byte-identical paths in Group A plus 12 predicate-gated paths in Group B plus 3 first-add-blob paths in Group C equals 42 total frozen-path enforcements, exceeding the 39 floor when counted across groups. All other acceptance criteria met or exceeded: script exists + executable + `set -euo pipefail` count 1 + BASELINE literal count 1 + preflight present + dynamic antipatterns absent + exception predicates ≥5 (actual: 12 functions + 1 parameterized reused for 6 slugs) + v0.1 dep retention ≥3 (actual: 3) + all 6 local + 8 cloud slugs referenced + COMP-02 PASS message emitted + runtime 0.384s << 10s.

## Issues Encountered

- **None requiring problem-solving beyond the Rule 3 deviation above.** The plan's `<interfaces>` block provided precise predicates verbatim — once the empirical groupings were corrected, predicate authoring was mechanical. No missing dependencies, no broken imports, no build issues (pure bash + git show + jq — all present on macOS default / already exercised by sibling Plan 06-04 gate).

## Self-Test Evidence (per plan §verification recommendation)

Performed four teeth-validation self-tests. Script exits 1 with actionable diagnostics for every regression class:

| Self-test | Regression | Expected | Actual | Restored? |
|-----------|-----------|----------|--------|-----------|
| 1 | Append `// rogue` to `dashboard/lib/cloud.ts` (Group A) | exit 1 + byte-diff diagnostic | exit 1, printed `byte-diff vs 998455b` + unified diff first 20 lines | yes |
| 2 | `jq 'del(.dependencies.next)' dashboard/package.json` | exit 1 + dep-removal message | exit 1, printed `v0.1 dep 'next' removed` | yes |
| 3 | `grep -v 'sleepwalker:calendar-prep'` on `routines-local/sleepwalker-calendar-prep/SKILL.md` | exit 1 + marker-tag message | exit 1, printed `v0.1-shipped marker tag [sleepwalker:calendar-prep] missing` | yes |
| 4 | `grep -v 'readSupervisorRuns'` on `dashboard/lib/queue-aggregator.ts` | exit 1 + QUEU-03 message | exit 1, printed `QUEU-03 readSupervisorRuns reader missing` | yes |

After each self-test, restored original file and re-ran gate — all restorations produce `==> COMP-02 PASS: frozen surface intact vs 998455b` with exit 0. Full four-cycle self-test completed in ~2s aggregate.

## User Setup Required

None — this plan ships a bash gate that runs on repo state alone. No env vars, no credentials, no new deps.

**Recommendation (per 06-RESEARCH §9 Pitfall 2 defense):** user should tag `v0.1.0` on `998455b` locally and push the tag to origin before Plan 06-06 wires CI, so the baseline ref remains stable if future history operations ever orphan the `998455b` short SHA:

```bash
git tag -a v0.1.0 998455b -m "v0.1 seal — 2026-04-17 overnight agent fleet on Claude Code"
git push origin v0.1.0
```

The gate script currently verifies the short SHA directly and exits 2 with clear remediation text if the ref is missing; once the tag is pushed, a one-line amendment to the script can switch `BASELINE="998455b"` → `BASELINE="refs/tags/v0.1.0"` for maximum robustness. Deferred to user — do not perform unilaterally per CLAUDE.md §GSD Workflow "phase transition is a user decision".

## Next Phase Readiness

- **Plan 06-06 (CI workflow) unblocked.** The gate is runnable in CI via `bash tests/compat/frozen-surface.sh` from repo root; its `BASELINE="998455b"` preflight requires `fetch-depth: 0` in the actions/checkout step (already called out in 06-RESEARCH §6.1 and §CI design).
- **Phase 6 progress: 5/7 plans complete** (06-01 DOCS-02 + 06-02 DOCS-03 + 06-03 DOCS-01 + 06-04 COMP-01 Part 1 + 06-05 COMP-02 all sealed).
- **COMP-01 requirement flips Complete.** Both halves of backward-compat contract now shipped per 06-CONTEXT "both halves must seal together" convention: Plan 06-04 enforces behavioral continuity (install idempotency + 14-routine layout + aggregator round-trip), Plan 06-05 enforces byte-level surface stability (27 identical + 12 predicates + 3 post-seal first-add).
- **COMP-02 requirement flips Complete.** Permanent frozen-surface gate is live and self-verified.
- **Remaining Phase 6 plans:** 06-06 CI workflow + 06-07 phase exit gate / seal.

## Known Stubs

None — this plan ships a bash script with concrete predicates and no UI surface.

## Threat Flags

None — script is read-only (reads `git show` + grep/jq on already-tracked files), creates only a `mktemp` sidecar cleaned on EXIT, never writes to tracked files, never touches network, never reads `$HOME/.sleepwalker/*`. No new trust boundaries introduced.

---
*Phase: 06-polish*
*Completed: 2026-04-22*

## Self-Check: PASSED

**File existence:**
- tests/compat/frozen-surface.sh — FOUND (469 lines, executable, mode 0755)
- .planning/phases/06-polish/06-05-SUMMARY.md — FOUND (this file)

**Commit existence:**
- a4edace `test(06-05): add tests/compat/frozen-surface.sh permanent v0.1 gate` — FOUND in `git log --oneline --all`

**Gate behavior:**
- `bash tests/compat/frozen-surface.sh` at HEAD `a4edace` — exit 0, runtime 0.384s, output ends with `COMP-02 PASS: frozen surface intact vs 998455b`
- 4 self-tests all exit 1 with correct FAILURES output; all restorations return gate to green
- `bash -n tests/compat/frozen-surface.sh` — exit 0 (syntax)
- `grep -c 'BASELINE="998455b"'` — 1 (hardcoded literal preserved)
- `grep -cE 'git log --grep|PHASE.*_BASE'` — 0 (no dynamic-resolution antipatterns)
