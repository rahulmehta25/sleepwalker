---
phase: 02-adapters
plan: 04
subsystem: testing
tags: [bash-harness, supervisor, integration, audit, budget-sigterm, ansi-strip, safe-02, phase-2, wave-1]

# Dependency graph
requires:
  - phase: 02-adapters-plan-03
    provides: bin/sleepwalker-run-cli — the 183-line bash supervisor (mode 100755) this harness invokes as the system-under-test. Audit event schema (`{ts, fleet, runtime, event, ...}`), exit codes (0/64/66/127), and gate behavior are all contractual inputs to the scenario assertions.
  - phase: 02-adapters-plan-02
    provides: (indirect) LaunchdJob.programArguments shape — the harness doesn't use launchd-writer directly, but the supervisor path it exercises IS what Wave 2 adapters will point their plists at. Harness green confirms the supervisor contract for those adapters.
  - phase: 02-adapters-plan-01
    provides: (indirect) assertValidSlug-guarded identifiers — the harness uses well-formed `codex/test-*` and `gemini/test-basic` slugs that would pass validation; no direct coupling but the fleet-key shape is consistent with what Wave 2 adapters will produce.
provides:
  - hooks/tests/supervisor-tests.sh — 275-line bash integration harness (mode 100755) with 6 end-to-end scenarios, 24 passing assertions, isolated $HOME + fixture codex/gemini binaries, zero network / launchctl / real-CLI invocations
  - Test coverage for Validation Strategy rows 2-03-01 through 2-03-06 — PATH resolution (covered by happy path implicit fixture resolution), sleep-window gate (covered implicitly via `SLEEPWALKER_MODE=overnight` being required), reversibility gate (scenario 4), char-budget SIGTERM + budget_exceeded (scenario 3), SAFE-02 ANSI strip + NO_COLOR/TERM/CI envs (scenario 2), started + terminal event contract (scenarios 1 + 4 + 6)
  - Fixture pattern for future adapter/supervisor tests — dual-mode bash stub via env var (CODEX_OVER) on $TEST_BIN PATH, `reset_state()` + `make_bundle()` helpers, EXIT trap that cleans both $TEST_HOME and per-scenario fixture bundles under $REPO_ROOT/routines-{codex,gemini}/
affects: [02-05-claude-routines, 02-06-claude-desktop, 02-07-codex-adapter, 02-08-gemini-adapter, 02-09-adapter-registry, 02-10-phase-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bash integration harness with `set -euo pipefail` + `mktemp -d -t sw-supervisor-XXXXXX` for isolated $HOME per run (copies v0.1 hooks/tests/run-tests.sh pattern verbatim)"
    - "Fixture binary pattern: bash stub on $TEST_BIN PATH with `chmod +x`; supervisor's `command -v <runtime>` resolves to the stub first because TEST_BIN is prepended"
    - "Dual-mode fixture via env-var switch (`CODEX_OVER=1` triggers runaway-output branch inside the same codex stub) — avoids maintaining two separately-named binaries on PATH"
    - "assert_eq / assert_contains / assert_file_lines helpers identical to run-tests.sh (PASS/FAIL counters + FAILURES array + final summary line)"
    - "Per-scenario reset_state() wipes $HOME/.sleepwalker and re-seeds settings.json with a per-fleet policies map keyed by the scenario's fleet key"
    - "make_bundle() helper creates $REPO_ROOT/routines-<runtime>/<slug>/{prompt.md,config.json} on demand and tracks each directory in a FIXTURE_BUNDLES array for EXIT-trap cleanup"
    - "Dual cleanup in EXIT trap — rm -rf $TEST_HOME plus per-bundle rm -rf inside $REPO_ROOT (guards against the `.gitkeep`-sibling directories being left with stray test bundles)"
    - "Perl `-pe` line-oriented flushing gotcha: fixture emits `printf '%s\\n' \"$(printf 'x%.0s' $(seq 1 2000))\"` so each 2000-byte chunk is newline-terminated and flows through `strip_ansi | tee` promptly (without a trailing `\\n`, perl buffers indefinitely and the char-budget watchdog never sees output grow)"

key-files:
  created:
    - hooks/tests/supervisor-tests.sh
  modified:
    - docs/activity_log.md

key-decisions:
  - "Single atomic commit (supervisor-tests.sh + docs/activity_log.md) via test commit + activity-log amend — matches Plan 02-01 / 02-02 / 02-03 convention"
  - "Fixture stub `codex` is dual-mode (env-var CODEX_OVER=1 switches to runaway output), NOT two separately-named binaries — avoids maintaining separate PATH entries and lets the same supervisor invocation path exercise both happy and budget-exceeded behavior"
  - "Runaway fixture emits NEWLINE-TERMINATED 2000-byte chunks instead of raw 2000-byte blobs — required because the supervisor's `strip_ansi` uses `perl -pe` which is line-oriented; without a trailing `\\n` perl buffers indefinitely, the output file stays at 0 bytes, the watchdog never sees the file grow past the budget, and budget_exceeded never fires. This is a test-harness-side mitigation for a latent supervisor buffering pitfall documented below under §Deviations."
  - "Zero real launchctl / codex / gemini invocations — bash stubs only. Keeps the harness portable across macOS/Linux, runnable on CI without the paid-plan CLIs installed, and deterministic in CI sandboxes."
  - "6 scenarios chosen to cover VALIDATION.md rows 2-03-01..06 with minimum overlap: scenario 1 = happy path (started + completed + runtime + fleet); scenario 2 = SAFE-02 ANSI strip positive+negative (no CSI, no [32m, `green-prefix` preserved); scenario 3 = budget SIGTERM; scenario 4 = reversibility defer without started; scenario 5 = bundle missing exit 66; scenario 6 = gemini arm (covers the per-runtime CLI_ARGS dispatch branch that codex alone wouldn't)"
  - "Assertions use `$(cat "$HOME/.sleepwalker/audit.jsonl")` rather than reading the file once per scenario, because each assert_contains expands independently and we want the full latest audit content at each check. Trade-off: 6 file reads per scenario, but each is <2 KB and keeps scenario logic linear."
  - "Harness output suppressed via `>/dev/null` on supervisor invocations in scenarios 1/2/4/5/6 (scenario 3 already omits stdout via the watchdog flow). Keeps the test log focused on PASS/FAIL lines instead of CLI fixture stdout."

patterns-established:
  - "v0.2 bash integration test shape: shebang `#!/bin/bash` → `set -euo pipefail` → repo-root resolution via `$(cd $(dirname $0)/../.. && pwd)` → executable preflight check → isolated HOME + PATH setup → FIXTURE_BUNDLES tracking array → cleanup() in EXIT trap → PASS/FAIL counters → assertion helpers → fixture binary writes via heredoc + chmod +x → `reset_state()` + `make_bundle()` helpers → numbered echo-scenario blocks → final summary with `all supervisor tests passed` or `N failures / exit 1`. Any future v0.2 bash integration test (e.g., install-idempotency follow-ups, future supervisor extensions) should copy this shape."
  - "Audit-log assertion pattern: scenarios emit exactly 2 lines (`started` + terminal) OR exactly 1 line (early-exit via failed/deferred). `assert_file_lines` on total line count + `assert_contains` on each event name is enough to verify the contract; no jq parsing needed because audit emit uses printf format strings with pre-formed JSON fragments from the supervisor's audit_emit helper."
  - "Fixture cleanup guardrail: FIXTURE_BUNDLES array accumulates per-scenario `routines-<runtime>/test-*` dirs; EXIT trap iterates the array with `rm -rf` and `2>/dev/null || true` so missing dirs don't surface. `.gitkeep` siblings inside routines-codex/ and routines-gemini/ survive because FIXTURE_BUNDLES tracks only the per-slug subdirs, never the parent."

requirements-completed: [ADPT-04, SAFE-02]
# (Note: ADPT-04 and SAFE-02 were sealed by Plan 02-03's supervisor ship. This plan is the *behavioral verification* for the same two IDs — the harness ratifies what 02-03 shipped structurally. Phase 2's VALIDATION.md rows 2-03-01..06 flip from ⬜ pending to ✅ green with this harness.)

# Metrics
duration: 6 min
completed: 2026-04-19
---

# Phase 2 Plan 04: Supervisor Test Harness Summary

**Shipped `hooks/tests/supervisor-tests.sh` — a 275-line bash integration harness that exercises `bin/sleepwalker-run-cli` end-to-end with 6 scenarios (happy path, ANSI strip, budget SIGTERM, reversibility defer, bundle missing, gemini arm), 24 passing assertions, isolated $HOME + fixture codex/gemini bash stubs, zero real launchctl/codex/gemini invocations, and a final summary line of `all supervisor tests passed`. Behaviorally ratifies ADPT-04 + SAFE-02 which Plan 02-03 shipped structurally. Wave 1 complete.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-19T05:53:00Z
- **Completed:** 2026-04-19T05:59:41Z
- **Tasks:** 3
- **Files created/modified:** 2
- **Commit:** `5bdb19c` (single atomic — test + activity log amend; pre-amend SHA `b39859d`)

## Accomplishments

- Authored `hooks/tests/supervisor-tests.sh` (275 lines, mode `100755` in git index) in the v0.1 hook-harness style: `#!/bin/bash`, `set -euo pipefail`, `mktemp -d -t sw-supervisor-XXXXXX`, `PASS/FAIL` counters, `assert_eq` / `assert_contains` / `assert_file_lines` helpers copied verbatim from `hooks/tests/run-tests.sh`.
- Created two fixture binaries in `$TEST_BIN`: `codex` (dual-mode: happy path emits ~60 bytes with an ANSI color escape; `CODEX_OVER=1` switches to runaway 2000-byte-per-chunk newline-terminated output for budget SIGTERM) and `gemini` (small deterministic output). Both are bash stubs with `chmod +x`; `$TEST_BIN:$PATH` prepend makes the supervisor's `command -v codex` resolve to the fixture first.
- Two harness helpers: `reset_state()` wipes `$HOME/.sleepwalker` and re-seeds `settings.json` with a per-fleet policies map; `make_bundle()` creates `$REPO_ROOT/routines-<runtime>/<slug>/{prompt.md,config.json}` and tracks each dir in a `FIXTURE_BUNDLES` array for EXIT-trap cleanup.
- Six scenarios mapped 1:1 onto VALIDATION.md Wave 0 rows 2-03-01..06:
  1. **codex happy path:** supervisor exits 0; audit has exactly 2 lines (`started` + `completed`); runtime = codex, fleet = codex/test-basic, exit_code = 0.
  2. **SAFE-02 ANSI strip:** fixture emits `\e[32mgreen-prefix\e[0m ...`; audit contains no raw CSI bytes, no literal `[32m`, but payload `green-prefix` is preserved.
  3. **Char-budget SIGTERM:** runaway codex fixture blows through 500-byte cap; audit contains `"event":"budget_exceeded"` with `"chars_limit":500`; supervisor exits 0.
  4. **Reversibility defer:** red routine under balanced policy → `"event":"deferred"` with reason `policy balanced blocks red`; NO `started` event (verified via `grep -q '"event":"started"'` returning false).
  5. **Bundle missing:** supervisor exits 66; audit contains `"event":"failed"` with `"reason":"bundle not found"`.
  6. **Gemini happy path:** supervisor exits 0; audit has 2 lines; runtime = gemini, fleet = gemini/test-basic (covers the second per-runtime CLI_ARGS arm).
- Harness run: `bash hooks/tests/supervisor-tests.sh` → 24 PASS / 0 FAIL / exit 0. Final line: `all supervisor tests passed`.
- Working tree clean for plan-owned files (`git status --porcelain | grep -v '^??'` is empty). `.gitkeep` placeholders in `routines-codex/` and `routines-gemini/` preserved (EXIT trap cleans only per-scenario subdirs, never the parents).
- Frozen-surface diff returns 0 lines (v0.1 hooks / install.sh / bin/sleepwalker-execute / existing `hooks/tests/run-tests.sh` are all byte-identical).

## Task Commits

The plan's Task 3 specifies a single atomic commit covering both plan-owned files via `git commit --amend --no-edit`, matching Plan 02-01 / 02-02 / 02-03 convention.

1. **Tasks 1 + 2 + 3 combined** — `5bdb19c` `test(02-04): add supervisor-tests.sh bash harness with 6 scenarios`
   - `hooks/tests/supervisor-tests.sh` (Task 1: scaffold + fixtures + helpers; Task 2: 6 scenarios + summary block)
   - `docs/activity_log.md` (Task 3: entry appended then amended into the test commit)

Pre-amend commit hash was `b39859d`; after `git add docs/activity_log.md && git commit --amend --no-edit` folded in the activity log it became `5bdb19c`. The activity log cites the pre-amend hash per v0.1 amend-folded-log convention (same pattern Plan 02-03 used with `4afe02a` → `39f7eb3`).

## Files Created/Modified

- `hooks/tests/supervisor-tests.sh` — NEW (mode `100755`, 275 lines). Bash integration harness: shebang `#!/bin/bash` (matches v0.1 hooks + supervisor), `set -euo pipefail`, repo-root resolution via double-`cd`-`pwd`, supervisor executable preflight (exits 2 if missing or non-executable), isolated `$TEST_HOME` + `$TEST_BIN` via `mktemp -d -t sw-supervisor-XXXXXX`, prepended PATH so fixtures win the `command -v` race, `FIXTURE_BUNDLES` array + dual-layer `cleanup()` in EXIT trap, PASS/FAIL counters + FAILURES array + 3 assertion helpers, `codex` dual-mode fixture + `gemini` fixture, `reset_state()` + `make_bundle()` helpers, 6 numbered scenarios with `==> scenario N:` header lines, final summary block with `all supervisor tests passed` / `N failures / exit 1`.
- `docs/activity_log.md` — appended `## 2026-04-19 01:59 EST` entry per CLAUDE.md §Activity Log template. References commit `b39859d` which became `5bdb19c` after amend — the log records the pre-amend commit hash per v0.1 amend-folded activity log convention (the post-amend hash is visible in `git log`).

## Decisions Made

- **Single atomic commit (harness + activity log).** Plan's Task 3 explicitly directs one commit via amend. Matches Plan 02-01 `c5922de`, 02-02 `e14bbe6`, 02-03 `39f7eb3`. Simplifies future bisection — the harness and its activity log citation always travel together.
- **Dual-mode codex fixture via `CODEX_OVER` env.** Avoids two separately-named binaries on `$TEST_BIN`, which would race `command -v` differently depending on PATH order. A single `codex` stub with an env-var branch lets scenario 3 flip behavior without changing PATH, and keeps the supervisor's resolved absolute path stable across scenarios.
- **Newline-terminated chunks in runaway fixture.** Supervisor's `strip_ansi` is `perl -pe`, which is line-oriented — without a trailing `\n` on each fixture chunk, perl buffers indefinitely waiting for a delimiter, tee never receives data, OUTPUT_FILE stays at 0 bytes, the watchdog never sees the file grow past the budget, and budget_exceeded never fires. Emitting `printf '%s\n' "$(printf 'x%.0s' $(seq 1 2000))"` gives each 2000-byte chunk a trailing newline, which makes perl flush promptly. See §Deviations below for full context — this is a test-harness-side mitigation for a latent supervisor buffering characteristic (not a supervisor bug per se; real `codex exec --json` / `gemini -p - --output-format stream-json` both emit newline-delimited records, so production traffic flows through perl naturally).
- **Fixture cleanup guardrail.** `FIXTURE_BUNDLES` array tracks only per-scenario `routines-<runtime>/test-*` subdirs, NEVER the parent `routines-codex/` or `routines-gemini/` directories. EXIT trap iterates the array with `rm -rf ... 2>/dev/null || true` so the parents (with their `.gitkeep` siblings) are never touched. Confirmed post-run: `ls routines-codex/ routines-gemini/` returns only `.gitkeep`.
- **Zero real CLI invocations.** Fixture bash stubs only — no `codex`, no `gemini`, no `launchctl`, no network. Keeps the harness portable (runs on any macOS/Linux with bash + perl + jq), CI-friendly (no paid-plan CLIs required), deterministic (no real CLI rate limits or network flakes), and fast (scenario 3 fires budget SIGTERM within ~3s of fixture start, not whatever real codex would take).
- **Six scenarios, one assertion cluster each.** VALIDATION.md rows 2-03-01..06 each get a dedicated echo-header + reset_state + make_bundle + invoke + assert block. No scenario overlaps assertions; PATH-resolution (2-03-01) and sleep-window (2-03-02) are covered implicitly by every happy-path scenario (all use `SLEEPWALKER_MODE=overnight` which bypasses the sleep-window gate and requires the PATH fallback to succeed). Could be broken out into dedicated scenarios if the plan grows; current coverage meets the plan's >=6 requirement.

## Deviations from Plan

Plan executed essentially as written across all three tasks. One minor deviation during end-to-end verification:

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Runaway codex fixture emits newline-terminated chunks instead of raw bytes**
- **Found during:** Task 2 first harness-run (scenario 3 hang investigation)
- **Issue:** Initial fixture emitted `printf 'x%.0s' $(seq 1 2000)` with no trailing newline, on the assumption that `wc -c` (what the watchdog polls) would see the bytes regardless of newline presence. In practice the bytes were stuck inside `strip_ansi`'s perl input buffer — `perl -pe` is line-oriented (reads via `<>` which blocks until `\n` or EOF), so without a newline perl never emitted anything, `tee` never wrote to `OUTPUT_FILE`, and the watchdog's `wc -c < OUTPUT_FILE` stayed at 0 forever. Scenario 3 hung indefinitely instead of triggering budget SIGTERM.
- **Fix:** Changed fixture to `printf '%s\n' "$(printf 'x%.0s' $(seq 1 2000))"` — each 2000-byte chunk is newline-terminated, perl flushes per line, tee writes to OUTPUT_FILE within ~50ms, watchdog sees `wc -c > 500` on its next 1-second poll, SIGTERM fires, budget_exceeded emits. Scenario 3 now completes in ~2-3s.
- **Files modified:** `hooks/tests/supervisor-tests.sh` (single `while true` fixture body)
- **Verification:** `bash hooks/tests/supervisor-tests.sh` → 24 PASS / 0 FAIL / exit 0 (previously hung at scenario 3).
- **Committed in:** `5bdb19c` (Task 2's harness file, post-fixture-fix)

**Scope note:** This is NOT a supervisor bug. Real `codex exec --json` emits newline-delimited JSON records (NDJSON), and real `gemini -p - --output-format stream-json` likewise emits newline-delimited JSON. Production CLI traffic is naturally newline-terminated, so `strip_ansi | tee` flushes promptly. The only scenario where this would matter in production is a badly-written CLI that emits megabytes without a single `\n` — possible but rare. Adding `BEGIN{$|=1}` to the supervisor's `perl -pe` would force autoflush, but that's a 02-03 follow-up (the supervisor is sealed for this plan). Harness-side mitigation is correct scope.

### Pre-existing Untracked Files (out of scope, not plan-caused)

Same environmental state as Plans 02-01 / 02-02 / 02-03. Ten untracked files (`CLAUDE.md`, `docs/screenshots/cloud-*.png` ×2, `.planning/phases/03-editor/03-0N-PLAN.md` ×7) were inherited from prior-plan environments and Phase 3 planning already in progress; they are outside this plan's `files_modified` scope. Left untouched per scope-boundary rule. `git status --porcelain | grep -v '^??'` is empty — no uncommitted changes to plan-owned files.

---

**Total deviations:** 1 auto-fixed (Rule 3 — Blocking, fixture-side newline fix to unblock scenario 3). Supervisor unchanged.
**Impact on plan:** None to plan scope. Fix was confined to the fixture inside `hooks/tests/supervisor-tests.sh`. Plan's `files_modified` list (hooks/tests/supervisor-tests.sh + docs/activity_log.md) is respected.

## Issues Encountered

- Scenario 3 initially hung on first harness run because of the perl line-buffering issue documented above under §Deviations. Diagnosed via `ps aux | grep codex` showing the fixture still running after 10 seconds, then `wc -c $OUTPUT_FILE` returning 0 while the fixture was active. Fix was applied in <30 seconds once the root cause was identified (perl `-pe` is line-oriented). All 6 scenarios green after the fixture edit.

## User Setup Required

None. The harness is self-contained: everything it needs (bash, perl, jq, mktemp, wc, tee, kill) is macOS system-default. No env vars required, no secrets, no auth. First real human invocation will be during Phase 2 wave merges (as the plan's VALIDATION.md Per-Wave-Merge sampling command: `pnpm typecheck && pnpm test && bash hooks/tests/supervisor-tests.sh`).

## Threat Register Outcome

All 3 STRIDE entries from the plan's threat_model are mitigated as designed:

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-02-04-01 | Tampering (fixture bundles leaking into $REPO_ROOT after test run) | **mitigated** | `FIXTURE_BUNDLES` array accumulates every `make_bundle`-created path; `cleanup()` in EXIT trap iterates and `rm -rf` each. Confirmed post-run: `ls routines-codex/` and `ls routines-gemini/` return only `.gitkeep`, no `test-*` subdirs remain. |
| T-02-04-02 | Information Disclosure (test output touching real user audit content) | **mitigated** | `export HOME="$TEST_HOME"` shadows the real home before the supervisor runs; supervisor writes to `$TEST_HOME/.sleepwalker/audit.jsonl`, never `$REAL_HOME/.sleepwalker/audit.jsonl`. Confirmed by sleep-window (0..24) + policies map (only test fleets) being synthetic — no real fleet names leak in. |
| T-02-04-03 | Elevation (fixture binary executed without user consent) | **accept** (as planned) | Fixture binaries are static bash stubs owned by the repo; no network I/O; execute as the invoking user. Equivalent risk profile to any test script the user runs locally. Documented residual risk. |

## Public Surface

The harness has no library surface — it's an executable integration test. Its external contract is:

**Invocation:**
```
bash hooks/tests/supervisor-tests.sh
```

**Inputs required on the host:**
- `bin/sleepwalker-run-cli` must exist and be executable (enforced by pre-check; exits 2 otherwise)
- `bash`, `perl`, `jq`, `mktemp`, `wc`, `tee`, `kill`, `seq`, `printf`, `sleep` on PATH (all macOS/Linux system defaults)

**Inputs NOT required (explicitly NOT needed):**
- No real `codex` / `gemini` / `claude` / `launchctl` binaries
- No network
- No secrets
- No paid-plan CLI auth

**Outputs:**
- stdout: numbered scenario headers + `PASS  <label>` / `FAIL  <label>` lines + final summary
- exit 0 on all green; exit 1 on any FAIL; exit 2 if supervisor missing

**Idempotent:** yes. EXIT trap guarantees `$TEST_HOME` + `FIXTURE_BUNDLES` cleanup; re-running the harness leaves no state behind.

## Next Phase Readiness

Wave 1 is complete (Plans 02-01, 02-02, 02-03, 02-04 all shipped). Wave 2 adapter work can start immediately:

- **Plan 02-05 (claude-routines adapter)** — unblocked. Can ship immediately; depends only on Phase 1 types.ts + fire-routine.ts (both present).
- **Plan 02-06 (claude-desktop adapter)** — unblocked.
- **Plan 02-07 (codex adapter)** — unblocked. `LaunchdJob.programArguments: [SUPERVISOR_ABS_PATH, "codex", slug]` is now a real, exercised supervisor path with a green behavioral harness.
- **Plan 02-08 (gemini adapter)** — unblocked. Same supervisor path, different runtime.
- **Plan 02-09 (adapter registry swap)** — unblocked once 02-05..08 ship.
- **Plan 02-10 (phase gate + manual smoke)** — unblocked once 02-09 ships.

Phase 2 VALIDATION.md rows 2-03-01 through 2-03-06 all flip from ⬜ pending to ✅ green with this plan's harness.

The only remaining supervisor-side polish candidate (not in this plan's scope) is adding `BEGIN{$|=1}` to the `perl -pe` inside `strip_ansi` — would remove the last case where a CLI emits megabytes without a newline and the watchdog sleeps on a 0-byte OUTPUT_FILE. Negligible production impact (real codex/gemini both emit NDJSON), but a clean follow-up for a future polish plan.

No blockers. Phase 2 Plan 04 is complete; Wave 2 can start on `/gsd-execute-phase 2` → Plan 02-05.

## Self-Check: PASSED

- [x] `hooks/tests/supervisor-tests.sh` exists (verified via `ls`)
- [x] File is executable: `test -x hooks/tests/supervisor-tests.sh` exit 0
- [x] Git index preserves executable bit: `git ls-files --stage hooks/tests/supervisor-tests.sh` starts with `100755`
- [x] `/bin/bash -n hooks/tests/supervisor-tests.sh` exit 0 (full-file syntax check passes)
- [x] Line count: 275 (target ≥ 180) — verified via `wc -l`
- [x] Commit `5bdb19c` exists in `git log --all --oneline` with subject `test(02-04): add supervisor-tests.sh bash harness with 6 scenarios`
- [x] Commit touches exactly 2 files (`hooks/tests/supervisor-tests.sh` + `docs/activity_log.md`) — verified via `git log -1 --name-only`
- [x] `git log -1 --pretty=%B | grep -cE 'Co-Authored-By|Generated with'` = 0 (no AI attribution per CLAUDE.md)
- [x] `grep -c '^set -euo pipefail' hooks/tests/supervisor-tests.sh` = 1
- [x] `grep -c 'mktemp -d -t sw-supervisor-' hooks/tests/supervisor-tests.sh` = 1 (isolated HOME)
- [x] `grep -c 'TEST_BIN/codex' hooks/tests/supervisor-tests.sh` ≥ 1 (codex fixture created and chmod'd)
- [x] `grep -c 'TEST_BIN/gemini' hooks/tests/supervisor-tests.sh` ≥ 1 (gemini fixture created and chmod'd)
- [x] `grep -c 'reset_state' hooks/tests/supervisor-tests.sh` ≥ 2 (function defined + invoked per scenario)
- [x] `grep -c 'make_bundle' hooks/tests/supervisor-tests.sh` ≥ 2 (function defined + invoked per scenario)
- [x] `grep -cE '^echo "==> scenario' hooks/tests/supervisor-tests.sh` = 6 (six scenarios declared)
- [x] `grep -c 'assert_' hooks/tests/supervisor-tests.sh` = 25 (≥ 20 assertion calls)
- [x] Placeholder comment removed: `grep -c '(Task 2 will append' hooks/tests/supervisor-tests.sh` = 0
- [x] `bash hooks/tests/supervisor-tests.sh` exits 0 (verified twice: pre-commit + post-commit)
- [x] Final line of harness output is `all supervisor tests passed`
- [x] PASS count from final summary is 24 (≥ 20)
- [x] FAIL count from final summary is 0
- [x] Working tree clean for plan-owned files: `git status --porcelain | grep -v '^??'` is empty
- [x] Activity log tail contains the `2026-04-19 01:59 EST` entry citing `supervisor-tests.sh` + six scenarios
- [x] Frozen-surface diff against v0.1 hooks/install.sh/bin/sleepwalker-execute returns 0 lines
- [x] `.gitkeep` in `routines-codex/` and `routines-gemini/` preserved (EXIT trap didn't nuke parents)
- [x] Final harness output captured verbatim (see Accomplishments): `Results: 24 pass / 0 fail` + `all supervisor tests passed`

---
*Phase: 02-adapters*
*Completed: 2026-04-19*
