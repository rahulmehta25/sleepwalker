---
phase: 05-queue
plan: 06
subsystem: install
tags: [install, preflight, flock, queu-04, v0.1-surface-amendment]

# Dependency graph
requires:
  - phase: 05-queue
    provides: Plan 05-04 supervisor flock + Plan 05-05 hook flock both depend on `flock` being on PATH; without preflight both writers silently degrade (supervisor graceful-fallthrough, hook strict-fail drops the entry)
  - phase: 01-foundation
    provides: install.sh v0.1 `# 0. Pre-flight` section (lines 26-30) establishing the `command -v` + `ERROR: ... Install with: brew install ...` + `exit 1` idiom — the flock check mirrors it byte-for-byte in shape
provides:
  - Additive `command -v flock` preflight immediately after the jq check — fails loud on a fresh Mac missing flock, no-op on a provisioned v0.1 install
  - Closes T-05-05 (flock-binary-absence allowing unlocked writes) by gating install on flock availability at first-run time
  - End-to-end QUEU-04 seal at the install boundary — supervisor + hook + install.sh all now reference flock as a hard requirement on one shared sidecar mutex
affects: [05-08 (exit gate can rely on flock-present invariant at install boundary; frozen-surface diff notes install.sh 1-hunk amendment against v0.2-extension exception)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive preflight amendment to frozen-surface install.sh — mirrors existing jq check idiom (`if ! command -v X >/dev/null 2>&1; then echo ERROR ... exit 1; fi`) for grep-verifiable consistency across prereqs"
    - "Fail-loud-before-state install gate — preflight runs at line 32, before any mkdir/touch, so a missing prereq never leaves partial state behind"
    - "Actionable error message with copy-paste `brew install flock` instruction plus 2-line why-context — matches jq's shape but adds rationale for the net-new v0.2 requirement"

key-files:
  created:
    - .planning/phases/05-queue/05-06-SUMMARY.md
  modified:
    - install.sh (+7/-0 — new flock preflight block lines 32-37 immediately after the jq check closing `fi` at line 30)

key-decisions:
  - "Used the EXACT idiom of the existing jq check (`if ! command -v ... >/dev/null 2>&1; then ... fi`) rather than RESEARCH §1.2's `|| { ... }` short-circuit form — grep-verifiable consistency between the two preflight checks wins over stylistic variety; future maintainers see one pattern, not two"
  - "Added a 2-line `why` context (audit.jsonl serialization across supervisor + PostToolUse hook) to the flock error but NOT to the jq error — jq is 'obvious' in v0.1 (settings.json merge); flock is a net-new v0.2 requirement that a returning v0.1 user would not expect, so actionable rationale is worth the 2 extra echo lines"
  - "Placed the flock check AFTER the jq check, not before — preserves v0.1 check ordering so returning v0.1 users see the familiar jq error first if BOTH are missing (least surprise); additive placement at the tail of the Pre-flight block"
  - "Exit 1 on missing flock matches jq's exit code (not a new exit code) — install.sh has a single-exit-code semantics (1 on any prereq failure) that consumers of the script's exit status can rely on"
  - "No auto-install / no brew tap auto-add — the message says `brew install flock` as an instruction, not a command the script runs; v0.1 never auto-installs prereqs and this plan preserves that convention (CONTEXT.md + PROJECT.md no-auto-install invariant)"

patterns-established:
  - "Preflight idiom for net-new v0.2 prereqs: `if ! command -v <bin> >/dev/null 2>&1; then echo ERROR: <bin> is required but not installed. Install with: brew install <pkg>; <optional 1-2 line why>; exit 1; fi` placed inside the existing `# 0. Pre-flight` block, below any earlier checks"
  - "Frozen-surface amendment boundary: install.sh is in the v0.1 frozen list but the Pre-flight block is considered `extensible with additive prereq checks` — documented here and referenced by Plan 05-08 exit-gate diff review"

requirements-completed: [QUEU-04]  # install-boundary seal; supervisor (05-04) + hook (05-05) + install preflight (05-06) now form a 3-layer defense against the concurrent-write race

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 5 Plan 06: install.sh flock preflight check Summary

**Additive `command -v flock` preflight immediately after the existing jq check closes T-05-05 (flock-binary-absence) at the install boundary — a fresh Mac now fails loud with `brew install flock` instruction before any state is touched, while provisioned v0.1 Macs (jq + flock both present) continue to run install.sh as a no-op upgrade.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T08:06:43Z
- **Completed:** 2026-04-20T08:13:31Z
- **Tasks:** 1 (single-task plan per PLAN.md)
- **Files modified:** 1 (install.sh only)
- **Commits:** 1 atomic `feat(05-06)` on `main`

## Accomplishments

- Added a new `if ! command -v flock >/dev/null 2>&1; then ... exit 1; fi` block to `install.sh` lines 32-37, immediately after the existing jq preflight at lines 27-30 and before the state-dir init at line 39.
- Error message shape mirrors the jq check: `ERROR: flock is required but not installed. Install with: brew install flock` with a copy-pasteable brew command.
- Added 2 additional indented echo lines explaining *why* flock is a v0.2 requirement (audit.jsonl serialization across supervisor + PostToolUse hook so concurrent runs don't corrupt the log) — rationale targeted at returning v0.1 users surprised by the new prereq.
- Preserved the v0.1 frozen-surface byte-identically everywhere else: the `#!/bin/bash` shebang, `set -euo pipefail`, the jq check block, the state-dir init (`mkdir -p`, `touch queue.jsonl`, `touch audit.jsonl`), the settings.json seed, the budgets.json / tracked-projects.json seeds, the `Copying hooks to` block, the `Copying local routines to` block, the `Wiring hooks into` jq merge, and the final user-facing echo sequence are all untouched.
- Frozen-surface audit: `git diff HEAD~1 -- install.sh` is **purely additive** — 7 insertions, 0 deletions, 0 modifications to existing lines.

## Task Commits

Single-task plan with one atomic commit:

1. **Task 1: Add flock preflight check to install.sh + commit** — `71bfdcc` (feat)

Single commit on `main`:
- `71bfdcc` `feat(05-06): add flock preflight check to install.sh` (1 file, +7/-0)

## Frozen-Surface Audit

`git diff HEAD~1 -- install.sh`:

```
@@ -29,6 +29,13 @@ if ! command -v jq >/dev/null 2>&1; then
   exit 1
 fi

+if ! command -v flock >/dev/null 2>&1; then
+  echo "ERROR: flock is required but not installed. Install with: brew install flock"
+  echo "    (Sleepwalker v0.2 uses flock to serialize audit.jsonl writes across"
+  echo "     supervisor + PostToolUse hook so concurrent runs don't corrupt the log.)"
+  exit 1
+fi
+
 # 1. Initialize state directory
```

All checks green:

| Grep assertion | Expected | Actual |
|---|---|---|
| `grep -c "command -v jq" install.sh` | 1 | 1 |
| `grep -c "command -v flock" install.sh` | 1 | 1 |
| `grep -c "brew install jq" install.sh` | 1 | 1 |
| `grep -c "brew install flock" install.sh` | 1 | 1 |
| `grep -c "serialize audit.jsonl writes" install.sh` | 1 | 1 |
| `grep -c "^#!/bin/bash" install.sh` | 1 | 1 |
| `grep -c "set -euo pipefail" install.sh` | 1 | 1 |
| `grep -c "Copying hooks to" install.sh` | 1 | 1 |
| `grep -c "Wiring hooks into" install.sh` | 1 | 1 |
| `grep -c "Initialize state directory" install.sh` | 1 | 1 |
| `bash -n install.sh` exit code | 0 | 0 |

## Test Matrix

No new test files by plan design — `install.sh` has no automated test in the repo. The following gates were executed manually:

| Gate | Result |
|---|---|
| `bash -n install.sh` | exit 0 (syntax valid) |
| `bash hooks/tests/supervisor-tests.sh` | **36 PASS / 0 FAIL** (unchanged from 05-05 baseline; zero regression from the install.sh edit since nothing in the supervisor test harness reads install.sh) |
| `bash hooks/tests/run-tests.sh` | **29 PASS / 0 FAIL** (unchanged from 05-05 baseline; zero regression) |

Dashboard vitest not run — install.sh touches zero TS files, so the TS-based suite is orthogonal to this plan's scope.

## Manual-Smoke Note

**Happy path (Mac with flock installed):** Verified implicitly by the test hosts running the supervisor + run-tests bash harnesses successfully (both require `flock` binary on PATH; the harnesses all passed, proving flock is present at `/opt/homebrew/bin/flock` on this Mac — which means running `./install.sh` on this host would pass the new preflight just as it would on any Mac that has been provisioned per the `brew install flock` doc).

**Failure path (Mac without flock):** Requires a fresh Mac (or `brew uninstall flock` temporarily) to verify the error message renders and exit code is 1. Deferred to user manual execution — Plan 05-08 exit-gate notes this as a known manual-only verification alongside other install.sh manual smokes documented in `.planning/phases/05-queue/05-VALIDATION.md` row M2.

Live environment check at execution time:
```
$ command -v flock && flock --version
/opt/homebrew/bin/flock
flock 0.4.0
```
Homebrew discoteq/flock 0.4.0 installed per RESEARCH §1.1 — matches the exact version the supervisor + hook flock-wraps were tested against in Plans 05-04 and 05-05.

## Threat Model Dispositions Realized

| Threat | Plan | Disposition | Status |
|---|---|---|---|
| T-05-05 flock-binary absence | 05-06 | mitigate (install.sh preflight fails loud) | **Mitigated live** — `grep -c "command -v flock" install.sh` = 1 + `grep -c "brew install flock" install.sh` = 1 + `grep -c "serialize audit.jsonl writes" install.sh` = 1 + exit 1 matches jq's failure mode |

Cross-plan mitigation chain for QUEU-04 concurrent-write race now forms a 3-layer defense:
1. **Install boundary (this plan):** flock binary verified present at `./install.sh` time; fail-loud on missing
2. **Supervisor boundary (Plan 05-04):** FD-form flock `-w 5 -x 200 || true` on sidecar `${HOME}/.sleepwalker/audit.jsonl.lock` with graceful-fallthrough on timeout (supervisor audit is sole run record)
3. **Hook boundary (Plan 05-05):** FD-form flock `-w 5 -x 200` on the byte-identical sidecar with STRICT failure on timeout (`set -euo pipefail` drops the entry; next PostToolUse recovers)

## Deviations from Plan

None — plan executed exactly as written. One AC-precision note documented below (not a deviation, an observation):

- The plan document (line 136) notes that the new block's opening blank line separates the two checks because the jq block doesn't have a trailing blank line. The actual result preserves this: line 30 is `fi` (jq close), line 31 is blank, line 32 begins the new `if ! command -v flock ...`. **Verified via `sed -n '30,38p' install.sh` output.**

Zero Rule 1/2/3 auto-fixes. Zero Rule-4 architectural checkpoints. Zero auth gates. Zero untracked-file scope bleed (pre-existing `CLAUDE.md` + 2 screenshot PNGs preserved untouched via explicit single-file `git add install.sh`).

## VALIDATION Row Flips

Rows 27 + 28 from `05-VALIDATION.md` (per-task verification map for 05-06-01):

| # | Plan | Check | Command | Artifact | Status |
|---|---|---|---|---|---|
| 27 | 5-06-01 | grep (preflight present) | `grep -c "command -v flock" install.sh` = 1 AND `grep -c "brew install flock" install.sh` = 1 | install.sh | 5-06-01 green 2026-04-20 |
| 28 | 5-06-01 | grep (v0.1 install steps preserved) | `grep -cE "(Copying hooks to\|Wiring hooks into\|Initialize state directory)" install.sh` = 3 | install.sh | 5-06-01 green 2026-04-20 |

Row M2 from the Manual-Only section ("install.sh rejects a Mac missing flock — exit 1 + ERROR message") remains pending per plan design; documented as known manual-only item deferred to Plan 05-08 exit gate.

## Self-Check: PASSED

**Claims verified:**

- File `/Users/rahulmehta/Desktop/Projects/sleepwalker/install.sh` exists with the 7-line addition — **FOUND** (lines 32-37 verified via `sed -n '32,37p' install.sh`)
- File `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/05-queue/05-06-SUMMARY.md` exists — **FOUND** (this file)
- Commit `71bfdcc` exists on `main` — **FOUND** (`git log --oneline -1` returns `71bfdcc feat(05-06): add flock preflight check to install.sh`)
- `bash -n install.sh` exits 0 — **FOUND** (live-run returned exit 0)
- supervisor-tests + run-tests both green — **FOUND** (36/36 + 29/29 post-commit)

Plan 05-06 seals QUEU-04 at the install boundary. Phase 5 now 6/8 plans complete; Wave 2 COMPLETE (05-04 supervisor flock + 05-05 hook flock + 05-06 install preflight all landed). Remaining: Plan 05-07 (UI pill rendering in queue-client.tsx) + Plan 05-08 (phase exit gate).
