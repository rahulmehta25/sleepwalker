---
phase: 05-queue
plan: 04
subsystem: supervisor
tags: [supervisor, flock, concurrency, audit, bash, posix, queu-04]

# Dependency graph
requires:
  - phase: 02-adapters
    provides: bin/sleepwalker-run-cli supervisor with audit_emit (Phase 2 SEALED write-side)
  - phase: 05-queue
    provides: Plan 05-03 readSupervisorRuns reader consuming audit.jsonl normalized entries
provides:
  - FD-form flock wrap around supervisor audit_emit closing the concurrent-write race for the supervisor writer
  - ${HOME}/.sleepwalker/audit.jsonl.lock sidecar mutex shared byte-identical with Plan 05-05 hook writer
  - Scenario 8 (4-way concurrent write zero-corruption) + Scenario 9 (timeout graceful fallthrough) bash harness tests
  - Graceful-degradation contract for supervisor critical path — || true preserves the audit line if flock times out/absent
affects: [05-05 (hook writer shares sidecar lock), 05-06 (install.sh preflight flock requirement), 05-08 (exit-gate verifies flock presence)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "POSIX flock(1) FD-form subshell lock — ( flock -w 5 -x 200; ... ) 200>\"$LOCK_FILE\" — no nested-quoting hazard, identical 0% corruption vs command form per RESEARCH §1.3"
    - "Sidecar lock file (BashFAQ/045) — never lock the data file itself; kernel auto-releases advisory lock on process death"
    - "Supervisor graceful-fallthrough — || true on flock timeout preserves audit line on critical path"

key-files:
  created:
    - .planning/phases/05-queue/05-04-SUMMARY.md
  modified:
    - bin/sleepwalker-run-cli (audit_emit function lines 69-99 — FD-form flock wrap + LOCK_FILE declaration + sidecar touch)
    - hooks/tests/supervisor-tests.sh (+105 lines — Scenarios 8 + 9)

key-decisions:
  - "Chose FD-form flock idiom over command form: no nested-quoting hazard with %s printf formatters, future-extensible for multi-statement locked blocks, matches util-linux man page"
  - "Chose supervisor graceful fallthrough (|| true) over hard-fail: the audit is the only record of the run; data preservation beats strict serialization on the supervisor critical path (RESEARCH §1.6 option 2)"
  - "Lock file at ${HOME}/.sleepwalker/audit.jsonl.lock — shared byte-identical path with Plan 05-05 hook writer so the two writers serialize on one mutex, not two"
  - "Lock file touched eagerly alongside AUDIT_FILE; kernel releases advisory locks on process death so never-deleted is intentional (RESEARCH §1.5)"

patterns-established:
  - "FD-form flock subshell: ( flock -w 5 -x 200 || true; printf ... >> FILE ) 200>LOCK_FILE"
  - "Sidecar lock naming: <data-file>.lock as peer file in same directory"
  - "Phase 5 audit writer contract: every append to ~/.sleepwalker/audit.jsonl must pass through flock on audit.jsonl.lock"

requirements-completed: [QUEU-04]  # Supervisor side only; end-to-end QUEU-04 seals when Plan 05-05 lands the hook-writer counterpart on the same sidecar

# Metrics
duration: 14min
completed: 2026-04-21
---

# Phase 5 Plan 04: Supervisor flock-wrap + concurrency tests Summary

**FD-form POSIX flock around supervisor audit_emit on ~/.sleepwalker/audit.jsonl.lock sidecar eliminates the 78% concurrent-write corruption RESEARCH §1.7 observed without flock, with graceful-fallthrough on timeout preserving the supervisor's single source of truth for each run.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-21T03:28:00Z
- **Completed:** 2026-04-21T03:42:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wrapped `bin/sleepwalker-run-cli::audit_emit` in FD-form flock `-w 5 -x 200` on a separate sidecar `${HOME}/.sleepwalker/audit.jsonl.lock` — both printf branches (extra present / extra absent) go through the same lock path.
- JSON shape byte-identical to Phase 2: `grep -cE '\{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s"' bin/sleepwalker-run-cli` = 2 — zero printf format-string changes.
- Added Scenario 8 (QUEU-04 concurrency): 4 parallel supervisor invocations across codex + gemini runtimes produce exactly 8 lines (4 × started + completed), every line round-trips through `jq -e .`, all 4 fleets observed.
- Added Scenario 9 (QUEU-04 timeout path): a 6-second flock holder forces the supervisor's 5-second wait to time out; the `|| true` fallthrough preserves both audit events and the supervisor exits 0 — graceful degradation verified live on this host.
- Zero Phase 2 regression: all 28 pre-existing supervisor-tests scenarios stay green; supervisor-tests now reports **36 PASS / 0 FAIL** across 10 scenarios.

## Task Commits

Both tasks committed atomically as Plan 05-04 specifies (Task 1 stages only; Task 2 commits the combined change):

1. **Task 1: Wrap audit_emit with FD-form flock on ${LOCK_FILE} sidecar** — staged, committed together with Task 2
2. **Task 2: Add Scenario 8 (concurrency) + Scenario 9 (timeout) to supervisor-tests.sh** — `c139354` (feat)

Single commit on `main`:
- `c139354` `feat(05-04): flock-wrap supervisor audit_emit + concurrency tests` (2 files, +117/-5)

## Files Created/Modified

- `bin/sleepwalker-run-cli` — audit_emit wrapped in FD-form flock subshell; `LOCK_FILE` declaration + `touch "$LOCK_FILE"` added; docblock updated to document QUEU-04 contract, shared sidecar with Plan 05-05, and graceful-fallthrough rationale. **Phase 2 JSON shape preserved byte-for-byte.**
- `hooks/tests/supervisor-tests.sh` — +105 lines for Scenarios 8 + 9, inserted immediately before the Summary block. Scenario 8 uses 4 bundles × 2 runtimes with parallel `&` + `wait`, assertions on line count (==8), `jq -e .` per-line round-trip (PARSE_FAIL==0), and all 4 fleets present. Scenario 9 holds lock 6s in a background subshell then invokes supervisor, asserts exit 0 + audit has ≥1 line via the `|| true` fallthrough.

## Verification Evidence

### Static greps (acceptance criteria replay)
```
LOCK_FILE declaration count         : 1 (expected =1)
flock -w 5 -x 200 occurrences       : 2 (expected >=2, one per printf branch)
200>"$LOCK_FILE" subshell redirects : 2 (expected >=2)
touch "$LOCK_FILE"                  : 1 (expected =1)
JSON printf shape preservation      : 2 (expected =2 — both branches byte-identical)
scenario 8 marker                   : 1 (expected =1)
scenario 9 marker                   : 1 (expected =1)
zero malformed audit lines assert   : 1 (expected >=1)
flock -x ... sleep 6 holder         : 1 (expected =1)
```

### Live harness runs
```
bash -n bin/sleepwalker-run-cli  → exit 0 (syntax OK)
bash -n hooks/tests/supervisor-tests.sh  → exit 0 (syntax OK)
bash hooks/tests/supervisor-tests.sh  →
  Results: 36 pass / 0 fail  (was 28 pre-plan)
  all supervisor tests passed
pnpm typecheck  → exit 0 (no TS touched, trivial)
pnpm test  → Test Files 39 passed (39), Tests 352 passed (352) — unchanged
```

### JSON-shape preservation proof (per `<output>` spec)
`git diff HEAD~1 -- bin/sleepwalker-run-cli` shows ONLY:
1. `+LOCK_FILE=` declaration (1 line)
2. `+touch "$LOCK_FILE"` (1 line)
3. Docblock prefix changes (comment-only)
4. Subshell wrap around both printfs: `+( flock -w 5 -x 200 || true`, `+) 200>"$LOCK_FILE"` on each branch
5. Zero printf format-string mutations — `'{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s",%s}\n'` and `'{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s"}\n'` both preserved verbatim.

### Live concurrency evidence (this execution, not historical)
- Scenario 8 ran 4 parallel supervisors writing 8 events across the sidecar-serialized audit.jsonl. Result: exactly 8 lines, every line parsed by `jq -e .` without error, all 4 expected fleets present. **Zero corruption at 4-way concurrency on this macOS 26.4.1 host with Homebrew `/opt/homebrew/bin/flock` 0.4.0.** This reproduces the pattern RESEARCH §1.7 predicted for the flocked path (78% → 0% corruption synthesis).
- Scenario 9 verified the `|| true` fallthrough: holder held lock 6s, supervisor's `flock -w 5` timed out, and both `started` + `completed` events still landed (2 audit lines captured) with supervisor exit 0. Graceful degradation confirmed on the supervisor critical path.

## Decisions Made

1. **FD-form over command form** — the `( flock ... ; printf ... ) 200>"$LOCK_FILE"` idiom avoids nested-quoting hazards that would arise if `flock -c` received the multi-`%s` printf as a single-string argument; it also scales if future logging adds more statements inside the locked block. Identical zero-corruption property per RESEARCH §1.3. **Matches PATTERNS.md Option B.**
2. **Graceful fallthrough (`|| true`) on supervisor path** — RESEARCH §1.6 offers two failure modes. The supervisor chose option 2 (unlocked fallback) because the audit entry is the supervisor's only record of the run; losing it would be worse than re-introducing the narrow v0.1 race for that one entry. The hook writer in Plan 05-05 can adopt the stricter option since hook entries can tolerate drops. **Matches CONTEXT.md locked decision.**
3. **Sidecar lock at `${HOME}/.sleepwalker/audit.jsonl.lock`** — never lock the data file itself (BashFAQ/045). Shared byte-identical path with Plan 05-05's hook writer so both writers serialize on a single kernel-level mutex. **Matches PATTERNS.md Writer 1 + Writer 2 invariant.**
4. **Touch sidecar eagerly, never delete** — kernel releases advisory locks on process death automatically, so no stale-lock cleanup is needed (RESEARCH §1.5 "accept" disposition for T-05-02).

## Deviations from Plan

None — plan executed exactly as written. Scope discipline preserved (only `bin/sleepwalker-run-cli` + `hooks/tests/supervisor-tests.sh` modified per Plan 05-04 frontmatter `files_modified`). Pre-existing untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`) preserved untouched via explicit-path `git add`. Zero Rule 1 / 2 / 3 auto-fixes; zero architectural deviations; zero auth gates; zero Rule 4 checkpoints.

**Total deviations:** 0
**Impact on plan:** None — the plan specification was sufficient and correct end-to-end.

## Threat Model Dispositions

| Threat ID | Category | Component | Disposition | Outcome |
|-----------|----------|-----------|-------------|---------|
| T-05-01 | Tampering | audit.jsonl concurrent-write interleaving | **mitigated** | FD-form flock wrapping audit_emit verified via Scenario 8 (4-way concurrency, 0 parse failures, 8/8 lines round-trip through jq -e .) |
| T-05-02 | Denial of service | flock holder process crashes mid-hold | **accepted** | Kernel auto-releases advisory lock on process death (RESEARCH §1.5); no stale-lock cleanup code written — by design |
| T-05-03 | Denial of service | 5s timeout exceeded under sustained contention | **mitigated** | `flock ... \|\| true` fall-through verified by Scenario 9 (holder held lock 6s, contender fell through, 2 audit lines still landed, supervisor exit 0) |
| T-05-04 | Information disclosure | audit.jsonl.lock leaks metadata | **accepted** | Lock file contains zero content; umask-inherited mode — intentional per RESEARCH §1.5 |
| T-05-05 | Elevation of privilege | flock binary absent allows unlocked writes to pass as "locked" | **deferred to Plan 05-06** | Supervisor falls through gracefully if flock missing at runtime (scenario 9 proves the || true path); Plan 05-06 adds `install.sh` preflight `command -v flock` hard check |

## Issues Encountered

None. Baseline supervisor-tests were green (28/28) before modification, stayed green after Task 1's flock wrap (regression confirmed before Task 2), and grew to 36/36 (30 scenarios total — 28 pre-existing + Scenarios 8 + 9) after Task 2. The `flock -x "$LOCK_FILE" -c 'sleep 6'` holder pattern worked first-try on `/opt/homebrew/bin/flock` 0.4.0 (macOS 26.4.1, Homebrew `discoteq/flock`).

## VALIDATION Rows Flipped

Per 05-VALIDATION.md conventions — 2 rows map directly to Plan 05-04 acceptance criteria:

- **QUEU-04-supervisor**: supervisor `audit_emit` wraps both printf branches in `flock -w 5 -x 200` on `audit.jsonl.lock` sidecar → **flipped to `5-04-01 ✅ green 2026-04-21`** (grep anchors `flock -w 5 -x 200` count=2, `200>"$LOCK_FILE"` count=2 both pass).
- **QUEU-04-concurrency**: Scenario 8 proves 4-way zero-corruption live → **flipped to `5-04-02 ✅ green 2026-04-21`** (harness scenario 8 assertions all PASS).

Remaining QUEU-04 VALIDATION rows (hook side, install preflight, exit gate) stay Pending for Plan 05-05 / 05-06 / 05-08.

## Cross-Plan Invariant Check (self-check)

The plan's `<success_criteria>` item 7 states: "Plan 05-05 (hook writer) can run in parallel because it touches different files AND shares the same `audit.jsonl.lock` sentinel." Grep-verifiable:

```
grep "audit\.jsonl\.lock" bin/sleepwalker-run-cli → 1 hit at line 55
  (LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock")
```

Plan 05-05 will add matching `audit.jsonl.lock` references in `hooks/sleepwalker-audit-log.sh`; the grep `grep -l "audit.jsonl.lock" bin/sleepwalker-run-cli hooks/sleepwalker-audit-log.sh | wc -l` will then equal 2, proving cross-writer sidecar unification. **This invariant is closed by this plan's half of the mutex; Plan 05-05 seals the other half on the same file path.**

## Next Phase Readiness

- **Plan 05-05 (hook-side flock wrap, parallel-safe with 05-04):** unblocked. Shares `${HOME}/.sleepwalker/audit.jsonl.lock` sidecar. Can adopt stricter failure mode (hook-writer option) since hooks tolerate dropped entries.
- **Plan 05-06 (SAFE-01 char-budget + install.sh preflight):** unblocked. Install preflight should assert `command -v flock` with actionable error pointing to `brew install discoteq/flock/flock`.
- **Plan 05-08 (Phase 5 exit gate):** gains a new acceptance grep `grep -q "flock" bin/sleepwalker-run-cli` which now passes.

## Self-Check: PASSED

- `bin/sleepwalker-run-cli`: EXISTS, contains `flock -w 5 -x 200` (×2), `LOCK_FILE=` declaration (×1), `touch "$LOCK_FILE"` (×1), both preserved JSON printfs (×2).
- `hooks/tests/supervisor-tests.sh`: EXISTS, contains `scenario 8` (×1), `scenario 9` (×1), `zero malformed audit lines` (×1), `flock -x ... sleep 6` holder (×1).
- Commit `c139354`: PRESENT in git log (`git log --oneline | grep c139354` returns 1 match).
- `bash hooks/tests/supervisor-tests.sh`: exits 0, prints `all supervisor tests passed`, 36 PASS / 0 FAIL.
- `pnpm test`: 352/352 green across 39 files (unchanged — no TS/dashboard surface touched).
- `pnpm typecheck`: exit 0 (unchanged).

---
*Phase: 05-queue*
*Plan: 04*
*Completed: 2026-04-21*
