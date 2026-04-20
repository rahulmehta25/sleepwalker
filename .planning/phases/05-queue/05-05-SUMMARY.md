---
phase: 05-queue
plan: 05
subsystem: hooks
tags: [hook, flock, concurrency, audit, bash, posix, queu-04, v0.1-surface-amendment]

# Dependency graph
requires:
  - phase: 05-queue
    provides: Plan 05-04 supervisor flock-wrap landed the shared ${HOME}/.sleepwalker/audit.jsonl.lock sidecar; Plan 05-05 mirrors the FD-form idiom on the hook side so the two writers serialize on one mutex
  - phase: 01-foundation
    provides: hooks/sleepwalker-audit-log.sh v0.1 PostToolUse writer with jq -nc construction + printf '{}\n' stdout contract + SLEEPWALKER_FLEET env override — all preserved byte-identical
provides:
  - FD-form flock wrap around the hook audit writer closing the hook side of the v0.1 concurrent-write race
  - End-to-end QUEU-04 seal — supervisor + hook now share a single kernel-level mutex on ${HOME}/.sleepwalker/audit.jsonl.lock
  - Strict-failure contract for the hook writer — flock timeout propagates as nonzero hook exit; next PostToolUse emits a fresh entry (recoverable)
  - New run-tests.sh scenario asserting 4 parallel PostToolUse invocations produce exactly 4 valid-JSON audit lines with correct fleet tag
affects: [05-06 (install.sh preflight flock requirement now has both writers depending on flock), 05-08 (exit-gate verifies cross-writer lock identity via diff)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "POSIX flock(1) FD-form subshell lock mirrored verbatim from bin/sleepwalker-run-cli — ( flock -w 5 -x 200; echo ... ) 200>\"$LOCK_FILE\""
    - "Strict-failure hook writer — NO || true; set -euo pipefail propagates flock timeout as nonzero hook exit per RESEARCH §1.6 for secondary-capture writers"
    - "Shared-sidecar cross-writer mutex — hook + supervisor reference the byte-identical ${HOME}/.sleepwalker/audit.jsonl.lock path so one kernel lock serializes both writers"

key-files:
  created:
    - .planning/phases/05-queue/05-05-SUMMARY.md
  modified:
    - hooks/sleepwalker-audit-log.sh (+7/-1 — LOCK_FILE declaration line 10, touch line 15, FD-form flock subshell lines 47-57 replacing line 45's bare echo)
    - hooks/tests/run-tests.sh (+38/0 — new concurrent-audit scenario appended before Summary block)

key-decisions:
  - "Strict failure (no || true) for the hook writer per RESEARCH §1.6 — divergent from Plan 05-04's supervisor choice because hook entries are per-tool-call secondary capture (one loss recoverable on next PostToolUse); supervisor entries are the sole record of a scheduled run (not recoverable)"
  - "FD-form flock idiom mirrored verbatim from Plan 05-04 — keeps the 'one idiom, one mutex' property grep-verifiable for future maintainers; both writers now match the same pattern Writer 1 in PATTERNS.md"
  - "Lock-file path string-identical with supervisor (diff exit 0 across grep 'LOCK_FILE=' on both files) — if the paths diverged even by whitespace, the mutex would not cover cross-writer contention"
  - "v0.1 frozen-surface audit: jq -nc JSON construction, bail-out semantics, stdout contract printf '{}\\n', set -euo pipefail, script path + name all preserved byte-identical — additive hardening of the append serialization only; CONTEXT.md exception for the frozen hook path applies cleanly"
  - "Sidecar touch in the hook itself (line 15) mirrors supervisor line 62 — belt-and-braces idempotent creation so neither writer depends on the other running first"

patterns-established:
  - "Divergent failure-mode policy for two writers sharing one mutex — graceful fallthrough on critical paths, strict failure on secondary-capture paths; codified in the diff'd audit comments at bin/sleepwalker-run-cli:76-78 vs hooks/sleepwalker-audit-log.sh:51-53"
  - "Cross-writer lock-path identity enforced via diff-based verification — both plan's acceptance criteria and exit-gate 05-08 use the same diff invariant"

requirements-completed: [QUEU-04]  # end-to-end seal: supervisor (05-04) + hook (05-05) now share the audit.jsonl.lock sidecar

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 5 Plan 05: Hook audit-log flock-wrap + concurrency test Summary

**FD-form POSIX flock around the hook PostToolUse audit writer on ~/.sleepwalker/audit.jsonl.lock — the SAME sidecar Plan 05-04 wraps the supervisor on — closes the hook side of the v0.1 concurrent-write race with STRICT failure semantics; QUEU-04 now end-to-end sealed across both writers on one kernel mutex.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T07:42:23Z
- **Completed:** 2026-04-20T07:45:58Z
- **Tasks:** 2
- **Files modified:** 2 (both in hooks/ — zero TS touched)
- **Commits:** 1 atomic `feat(05-05)` on `main`

## Accomplishments

- Wrapped `hooks/sleepwalker-audit-log.sh:45`'s bare `echo "$ENTRY" >> "$AUDIT_FILE"` append in an FD-form flock subshell `( flock -w 5 -x 200; echo "$ENTRY" >> "$AUDIT_FILE" ) 200>"$LOCK_FILE"` — idiom byte-identical to Plan 05-04's supervisor wrap for grep-verifiability.
- Declared `LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"` at line 10 + eager `touch "$LOCK_FILE"` at line 15 — the diff-verified cross-writer lock-path identity invariant that makes the two writers serialize on ONE mutex.
- Preserved v0.1 frozen-surface contracts byte-for-byte: jq -nc construction (lines 37-45), bail-out semantics (lines 26-29), stdout contract `printf '{}\n'` (both bail-out line 27 + success line 59), `set -euo pipefail`, `_detect_fleet.sh` invocation, `SLEEPWALKER_FLEET` env override, script path + name + shebang.
- Added Scenario "sleepwalker-audit-log.sh serializes 4 concurrent audit writes" to `hooks/tests/run-tests.sh` (lines 248-286, +38 lines): fires 4 parallel PostToolUse hook invocations through the existing `hook_input()` helper with distinct `sess-1..4` session IDs and `"output payload 1..4"` payloads, then asserts (a) exactly 4 audit.jsonl lines land, (b) every line round-trips through `jq -e .`, (c) `grep -c '"fleet":"inbox-triage"'` returns exactly 4.
- Zero regressions across the full test matrix: run-tests.sh 26 → 29 pass / 0 fail; supervisor-tests.sh 36/36 still green (Plan 05-04 scenarios 8+9 untouched — live proof of cross-writer mutex compatibility); vitest 352/352 pass across 39 files.

## Task Commits

Both tasks committed atomically as Plan 05-05 specifies (Task 1 staged only; Task 2 combined both files into one `feat` commit):

1. **Task 1: Wrap hook line 45 echo with FD-form flock on SHARED lock sidecar** — staged, committed together with Task 2
2. **Task 2: Add concurrent-hook-audit scenario to run-tests.sh** — `13cd12b` (feat)

Single commit on `main`:
- `13cd12b` `feat(05-05): flock-wrap hook audit-log + concurrency test` (2 files, +51/-1)

## Frozen-surface audit

Exact diff of `hooks/sleepwalker-audit-log.sh` (`git diff HEAD~1 HEAD -- hooks/sleepwalker-audit-log.sh`):

```diff
@@ -7,10 +7,12 @@
 set -euo pipefail

 AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
+LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
 HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

 mkdir -p "${HOME}/.sleepwalker"
 touch "$AUDIT_FILE"
+touch "$LOCK_FILE"

 INPUT="$(cat)"
 SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
@@ -42,6 +44,16 @@ ENTRY=$(jq -nc \
   --argjson out_len "$OUTPUT_LEN" \
   '{ts:$ts,fleet:$fleet,session:$session,tool:$tool,input:$input,output_preview:$out_preview,output_length:$out_len}')

-echo "$ENTRY" >> "$AUDIT_FILE"
+# QUEU-04: flock-wrap the append — serializes against bin/sleepwalker-run-cli's
+# audit_emit writing to the same ~/.sleepwalker/audit.jsonl. Shared sidecar
+# at $LOCK_FILE makes this ONE mutex across both writers. See
+# .planning/codebase/CONCERNS.md §concurrent JSONL race for the v0.1
+# background the flock closes. Hook uses STRICT failure (no || true) per
+# RESEARCH §1.6: a dropped audit line is recoverable — the next PostToolUse
+# call emits a fresh entry; a race-corrupted line is not.
+(
+  flock -w 5 -x 200
+  echo "$ENTRY" >> "$AUDIT_FILE"
+) 200>"$LOCK_FILE"

 printf '{}\n'
```

Three additions and one deletion — nothing else. The JSON construction block (lines 37-45 of the new file), bail-out block (lines 26-29), stdout contract (`printf '{}\n'` at both line 27 and line 59), `set -euo pipefail`, and every other line are byte-identical to HEAD~1. The deletion is the bare `echo "$ENTRY" >> "$AUDIT_FILE"` which is replaced by the flock-wrapped equivalent — same append target, same entry payload, only gains serialization. Additive hardening, not surface break.

## Cross-writer lock-path verification

```bash
$ diff <(grep 'LOCK_FILE=' bin/sleepwalker-run-cli) <(grep 'LOCK_FILE=' hooks/sleepwalker-audit-log.sh)
# (diff exit 0, zero differences — not even whitespace)

$ grep -n 'LOCK_FILE=' bin/sleepwalker-run-cli hooks/sleepwalker-audit-log.sh
bin/sleepwalker-run-cli:55:LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
hooks/sleepwalker-audit-log.sh:10:LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
```

Byte-identical path strings confirm the QUEU-04 "one mutex across both writers" invariant: both writers advisory-lock on `${HOME}/.sleepwalker/audit.jsonl.lock` so the kernel serializes appends to `audit.jsonl` regardless of which process holds the lock first.

## Acceptance criteria replay

- `grep -c 'LOCK_FILE="\${HOME}/.sleepwalker/audit.jsonl.lock"' hooks/sleepwalker-audit-log.sh` = 1 ✓
- `grep -c 'flock -w 5 -x 200' hooks/sleepwalker-audit-log.sh` = 1 ✓
- `grep -c '200>"\$LOCK_FILE"' hooks/sleepwalker-audit-log.sh` = 1 ✓
- `diff <(grep 'LOCK_FILE=' bin/sleepwalker-run-cli) <(grep 'LOCK_FILE=' hooks/sleepwalker-audit-log.sh)` exit 0 ✓
- `grep -c "jq -nc" hooks/sleepwalker-audit-log.sh` = 1 ✓
- stdout contract preserved — `printf '{}\n'` at both bail-out (line 27) + success (line 59) paths ✓
- `bash -n hooks/sleepwalker-audit-log.sh` exit 0 ✓
- `bash hooks/tests/run-tests.sh` = 29 pass / 0 fail (26 pre-existing + 3 new assertions) ✓
- `bash hooks/tests/supervisor-tests.sh` = 36 pass / 0 fail (zero cross-file regression from Plan 05-04) ✓
- `pnpm test` = 352 pass / 0 fail across 39 files (zero TS impact) ✓
- `grep -c "concurrent audit" hooks/tests/run-tests.sh` = 5 (>= 1) ✓
- `grep -c "4 concurrent" hooks/tests/run-tests.sh` = 2 (>= 1) ✓

## Threat model dispositions

| Threat ID | Disposition | Outcome |
|-----------|-------------|---------|
| T-05-06 (Tampering — concurrent writers interleave into audit.jsonl) | mitigate | Closed. Shared FD-form flock on `${HOME}/.sleepwalker/audit.jsonl.lock` serializes supervisor + hook writers on one mutex; live test scenario asserts 4 parallel hook invocations produce 4 valid-JSON lines with zero corruption. |
| T-05-07 (Denial of service — hook's flock times out at 5s) | mitigate | Closed by design. Strict failure (no `\|\| true`) — on 5s timeout the hook exits nonzero, Claude Code's PostToolUse machinery surfaces the failure, next tool call emits a fresh audit entry. Data loss bounded to one event per contention burst, which is acceptable for secondary-capture writer. |
| T-05-08 (Repudiation — tool call happens but hook audit line missing) | accept | Accepted as documented. The authoritative "deny tampering" guarantee comes from the supervisor audit trail which uses unlocked fallback; the hook audit is a secondary-capture channel whose loss on flock timeout is the deliberate tradeoff for crash-consistent serialization. |

## Failure-mode contract

Plan 05-04 (supervisor) and Plan 05-05 (hook) deliberately chose divergent failure modes for the same flock idiom:

| Aspect | Supervisor (05-04) | Hook (05-05) |
|--------|--------------------|--------------|
| Lock idiom | FD-form `( flock -w 5 -x 200 \|\| true ; ... ) 200>"$LOCK_FILE"` | FD-form `( flock -w 5 -x 200 ; ... ) 200>"$LOCK_FILE"` |
| Failure-mode switch | `\|\| true` — graceful fallthrough | NO `\|\| true` — strict exit |
| Rationale | Supervisor audit line is the only record of a scheduled run; data preservation beats strict serialization | Hook audit is per-tool-call secondary capture; next PostToolUse emits a fresh entry; strict serialization beats data preservation of one line |
| Reference | RESEARCH §1.6 option 2 | RESEARCH §1.6 option 1 |

Both choices satisfy QUEU-04 ("eliminate concurrent-write corruption at the audit.jsonl boundary") because the mutex still serializes the common case; the divergence only applies when flock itself times out, and the two writers' contention profiles make different tradeoffs optimal.

## Deviations from Plan

None — plan executed exactly as written. Zero Rule 1/2/3 auto-fixes; zero Rule 4 architectural changes; zero auth gates. Pre-existing untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`) preserved untouched via explicit per-file staging — zero scope bleed.

One minor plan-spec observation recorded for transparency, NOT a deviation: plan `<acceptance_criteria>` says `grep -c "printf '{}\\n'" hooks/sleepwalker-audit-log.sh equals 1` — actual count is 2 because the original v0.1 file already had two printf sites (bail-out line 27 + success line 59). Both were preserved byte-identical to HEAD~1. The real invariant (stdout contract preserved on both code paths) is fully intact; only the acceptance-grep expected value was slightly off because the planner wrote it against a mental model of one printf. Verified via `git show HEAD~1:hooks/sleepwalker-audit-log.sh | grep -c "printf '{}\\\\n'"` = 2 — pre-existing state.

## Self-Check: PASSED

- File `hooks/sleepwalker-audit-log.sh` exists: FOUND
- File `hooks/tests/run-tests.sh` exists: FOUND
- File `.planning/phases/05-queue/05-05-SUMMARY.md` exists: FOUND
- Commit `13cd12b`: FOUND in `git log --oneline --all`
- Hook wrap is additive hardening — v0.1 consumer-visible surface (JSON schema + stdout contract + bail-out + exit codes + script path) unchanged; frozen-surface exception per CONTEXT.md cleanly applies.
