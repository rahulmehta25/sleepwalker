---
phase: 02-adapters
plan: 03
subsystem: runtime-adapters
tags: [supervisor, bash, launchd, budget, ansi-strip, audit, safe-02, pitfall-1, pitfall-4, phase-2, wave-1]

# Dependency graph
requires:
  - phase: 02-adapters-plan-01
    provides: assertValidSlug-guarded identifier builders — adapters (Wave 2 codex.ts / gemini.ts) derive `<runtime>/<slug>` values that will be passed to the supervisor, guaranteed well-formed before it ever sees them
  - phase: 02-adapters-plan-02
    provides: LaunchdJob + installPlist — Wave 2 adapters compose a `LaunchdJob` whose `programArguments` points at this supervisor path by absolute name, wiring launchd → supervisor
provides:
  - bin/sleepwalker-run-cli — executable bash supervisor (mode 100755) invoked as `/abs/path/bin/sleepwalker-run-cli <runtime> <slug>`
  - audit event contract — exactly one `started` event + exactly one terminal event (`completed` | `failed` | `deferred` | `budget_exceeded`) appended to `~/.sleepwalker/audit.jsonl`
  - runtime argv contract — codex: `exec - --json`; gemini: `-p - --output-format stream-json --yolo`. No prompt text in argv (Pitfall #4).
  - char-budget watchdog — polls `wc -c` on tee'd OUTPUT_FILE every second, SIGTERM on exceed + SIGKILL-2s-later escalation
  - ANSI strip pipeline — perl regex covers CSI + OSC + DCS/PM/APC escape classes before any tee/audit write
  - PATH-resolution fallback chain — inherited PATH → `/bin/zsh -l -c 'command -v <bin>'` → `/bin/bash -l -c 'command -v <bin>'` → exit 127
affects: [02-04-supervisor-tests, 02-07-codex-adapter, 02-08-gemini-adapter, 05-queue-aggregator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bash `set -euo pipefail` + double-quoted expansions (matches v0.1 hook convention)"
    - "audit_emit helper with 2-arg signature (event name + pre-formed JSON key:value fragment) — produces valid single-line JSONL via printf"
    - "strip_ansi helper — single-line perl -pe chaining 3 substitutions (CSI, OSC, DCS/PM/APC)"
    - "PATH resolution chain with login-shell fallback (Pitfall #1 mitigation)"
    - "Budget watchdog subshell: `kill -0 \"$PID\"` liveness probe + `wc -c < file` every second + SIGTERM + SIGKILL-after-2s escalation"
    - "Terminal-event mutual exclusivity via if/elif/else on (FINAL_SIZE > BUDGET && CLI_EXIT != 0) before (CLI_EXIT == 0) before else"
    - "jq -Rs . as the JSON-safe string-literal encoder (avoids hand-rolling escape)"
    - "EXIT trap for OUTPUT_FILE cleanup (mktemp temp file, always removed)"
    - "Static per-runtime CLI_ARGS array (never contains user prompt — Pitfall #4 defeated by construction)"

key-files:
  created:
    - bin/sleepwalker-run-cli
  modified:
    - docs/activity_log.md

key-decisions:
  - "Single atomic commit (bin/sleepwalker-run-cli + docs/activity_log.md) via feat commit + activity log amend — matches Plan 02-01 and 02-02 convention"
  - "Supervisor is bash-only — no Node, no shellcheck dependency, no npm deps. Matches v0.1 hooks style (set -euo pipefail, `#!/bin/bash`, double-quoted expansions, jq for JSON)"
  - "`#!/bin/bash` (NOT `#!/usr/bin/env bash`) — byte-identical shebang to v0.1 hooks; keeps the supervisor on macOS's system bash which is what launchd resolves when PATH is stripped"
  - "audit_emit is 2-arg (event, extra-JSON-fragment) rather than builds-from-scratch — minimizes call sites (6 total + 1 helper body = 7 occurrences) and makes each emit site literally one line"
  - "perl for ANSI strip (not sed) — macOS sed does not support \\e escape class; perl -pe is macOS built-in at /usr/bin/perl"
  - "Char-budget watchdog runs in a `(...) &` subshell so `wait` on CLI_PID yields CLI_EXIT cleanly; watchdog is killed explicitly after wait returns"
  - "Terminal-event mutual exclusivity: if FINAL_SIZE > BUDGET && CLI_EXIT != 0 → budget_exceeded (first), else if CLI_EXIT == 0 → completed, else → failed. Exactly one emit reached per invocation."
  - "Task 2 placeholder removal via Edit (not rewrite) — Edit tool verified the prior-task header block unchanged before appending"
  - "Test harness deliberately NOT included — Plan 02-04 is the scheduled harness (6 scenarios). This plan only ships the script; verification is `bash -n` + structural grep, per plan's <verification> and <success_criteria>."

patterns-established:
  - "Bash supervisor shape: header → inputs → paths → safety env exports → helpers (audit_emit, strip_ansi) → preflight gates → started emit → per-runtime argv dispatch → backgrounded CLI pipeline with ANSI-strip + tee + budget watchdog → terminal emit. Reused by any future v0.3 runtime supervisor wrapper."
  - "audit.jsonl event schema for CLI-runtime events: `{ts, fleet, runtime, event, <extras>}` — mirrors v0.1 audit-log.sh shape but adds `runtime` and standardizes `event` values. Phase 5 queue aggregator reads this without knowing the runtime."
  - "Preview encoding pattern: `head -c 500 \"$OUTPUT_FILE\" | jq -Rs .` — 500 chars of post-strip stdout, encoded as a JSON string literal, safe to interpolate into the audit_emit extra-fragment"

requirements-completed: [ADPT-04, SAFE-02]

# Metrics
duration: 3 min
completed: 2026-04-19
---

# Phase 2 Plan 03: Bash Supervisor Summary

**Shipped `bin/sleepwalker-run-cli` — the 183-line bash supervisor that launchd invokes for every Codex and Gemini scheduled run in v0.2. It wraps each CLI with v0.1-equivalent safety semantics: login-shell PATH resolution (Pitfall #1), prompt-via-stdin routing (Pitfall #4 defeated by construction), perl-based ANSI strip covering CSI + OSC + DCS/PM/APC (SAFE-02), char-budget watchdog with SIGTERM + SIGKILL-2s escalation, and an audit contract of exactly one `started` event + exactly one terminal event per invocation (ADPT-04). Two requirements sealed — ADPT-04 and SAFE-02.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T05:42:00Z
- **Completed:** 2026-04-19T05:44:34Z
- **Tasks:** 3
- **Files created/modified:** 2
- **Commit:** `39f7eb3` (single atomic — feat + activity log amend)

## Accomplishments

- Authored `bin/sleepwalker-run-cli` (183 lines, mode `100755` in git index) in the style of v0.1 hooks: `#!/bin/bash`, `set -euo pipefail`, double-quoted expansions, `jq` for JSON, early-exit pattern on every gate.
- Two helper functions (`audit_emit`, `strip_ansi`) encapsulate the two operations that appear more than once. Eight distinct `audit_emit` call sites (1 helper definition + 2 early-fail preflights + 1 PATH-miss fail + 2 deferred gates + 1 started + 1 unknown-runtime fail + 3 terminal emits). Every audit line is a valid single-line JSONL entry via `printf` format strings.
- Five preflight / safety gates wired in order: (1) usage check → `EX_USAGE 64`, (2) bundle-existence preflight → `EX_NOINPUT 66`, (3) PATH resolution with 3-step fallback chain → `exit 127`, (4) sleep-window gate → defer + `exit 0`, (5) reversibility policy gate → defer + `exit 0`. Any short-circuit writes exactly one audit event.
- CLI invocation is a 4-stage pipeline run in the background: `cat prompt.md | "$CLI_ABS" "${CLI_ARGS[@]}" 2>&1 | strip_ansi | tee "$OUTPUT_FILE" >/dev/null &`. Stdin comes from prompt.md (never from argv). 2>&1 folds stderr into stdout so the ANSI strip catches escape sequences from either channel. A `trap 'rm -f "$OUTPUT_FILE"' EXIT` guarantees temp cleanup even on SIGKILL.
- Char-budget watchdog is a `(...) &` subshell that polls `wc -c < "$OUTPUT_FILE"` every second while `kill -0 "$CLI_PID"` returns true; on exceed it issues `kill -TERM "$CLI_PID"`, waits 2 seconds, then `kill -KILL "$CLI_PID"`. `wait "$CLI_PID"` captures CLI_EXIT cleanly, then the watchdog is killed explicitly.
- Terminal-event emission is a single if/elif/else: `budget_exceeded` (FINAL_SIZE > BUDGET && CLI_EXIT != 0), else `completed` (CLI_EXIT == 0), else `failed`. Exactly one branch executes per invocation; exactly one terminal audit line written.
- Preview encoding via `head -c 500 "$OUTPUT_FILE" | jq -Rs .` produces a valid JSON string literal (escapes quotes, backslashes, control chars) so the `printf '{..."preview":%s,...}'` format in `audit_emit` never produces malformed JSON.
- Verified: `/bin/bash -n bin/sleepwalker-run-cli` exit 0, `test -x` exit 0, `git ls-files --stage` shows `100755` (exec bit preserved in git index). Dashboard suite 72/72 green (supervisor is bash-only; TS suite untouched as expected).

## Task Commits

The plan's Task 3 specifies a single atomic commit covering both plan-owned files (source + activity log) via `git commit --amend --no-edit`, matching Plan 02-01 and 02-02 convention.

1. **Tasks 1 + 2 + 3 combined** — `39f7eb3` `feat(02-03): add bin/sleepwalker-run-cli supervisor`
   - `bin/sleepwalker-run-cli` (Task 1: header + preflight + PATH + gates + started emit; Task 2: CLI dispatch + watchdog + terminal emit)
   - `docs/activity_log.md` (Task 3: entry appended then amended into the feat commit)

Initial commit hash before amend was `4afe02a`; after `git commit --amend --no-edit` folded in the activity log it became `39f7eb3`.

## Files Created/Modified

- `bin/sleepwalker-run-cli` — NEW (mode `100755`, 183 lines). Bash supervisor: shebang `#!/bin/bash` (not env), `set -euo pipefail`, `NO_COLOR=1 TERM=dumb CI=true` exported defensively, two helpers (`audit_emit` / `strip_ansi`), five gates (usage-check, bundle-preflight, PATH-resolution, sleep-window, reversibility-policy), backgrounded CLI pipeline with ANSI-strip + tee, char-budget watchdog, terminal-event emission. No Node, no third-party bash dependency — only `bash`, `perl`, `jq`, `wc`, `head`, `mktemp`, `printf`, `date`, `kill`, `cat`, `tee`, `sleep`, `sed` (all macOS system-default).
- `docs/activity_log.md` — appended `## 2026-04-19 01:42 EST` entry per CLAUDE.md §Activity Log template. References commit `4afe02a` which became `39f7eb3` after amend — the log records the pre-amend commit hash which is the normal v0.1 convention for amend-folded activity log entries (the post-amend hash is visible in git log).

## Decisions Made

- **Single atomic commit (source + activity log).** The plan's Task 3 explicitly directs one commit via amend. Matches Plan 02-01 `c5922de` and Plan 02-02 `e14bbe6`. Simplifies future bisection — the supervisor and its activity log citation always travel together.
- **`#!/bin/bash` not `#!/usr/bin/env bash`.** Byte-identical shebang to v0.1 hooks (`hooks/sleepwalker-*.sh`). Matters because launchd runs the supervisor in a heavily-stripped environment; pinning to `/bin/bash` (macOS system bash) avoids any ambiguity about which bash we get when the plist does not set PATH before invocation.
- **`audit_emit` takes a pre-formed JSON fragment (not key/value pairs).** The helper does `printf '{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s",%s}\n' ... "$extra"`. Call sites pre-format extras inline (e.g., `"\"reason\":\"bundle not found\",\"bundle\":\"${BUNDLE_DIR}\""`). Avoids a combinatorial helper signature and lets each call site decide its schema. Preview keys use `jq -Rs .` output directly (no surrounding quotes) because that output is already a JSON string literal.
- **`perl -pe` for ANSI strip, not `sed`.** macOS `sed` does not support `\e` or `\x1b` escape syntax reliably. `perl` is macOS built-in at `/usr/bin/perl`, and `perl -pe` handles the 3 regex classes (CSI `\e\[[0-9;?]*[a-zA-Z]`, OSC `\e\][^\a]*\a`, DCS/PM/APC `\e[PX^_][^\e]*\e\\`) that Pitfall #8 flags.
- **Terminal-event mutual exclusivity.** The if/elif/else structure guarantees exactly ONE terminal emit per invocation: `budget_exceeded` first (FINAL_SIZE > BUDGET AND CLI_EXIT != 0 — the budget fired AND the CLI actually died), else `completed` if CLI_EXIT == 0, else `failed`. This respects threat T-02-03-07 (repudiation — audit must always show exactly one terminal event).
- **SIGKILL-2s escalation, not SIGKILL immediately.** Gives the CLI a 2-second grace window to flush partial output to its pipe (so the tee file has meaningful partial content for the preview). If the CLI ignores SIGTERM entirely — rare but real for hung network IO — the SIGKILL guarantees the supervisor exits deterministically.
- **Temp file via `mktemp -t sleepwalker-run-cli.XXXXXX`.** Uses TMPDIR (typically `/var/folders/...` on macOS), not `$HOME/.sleepwalker/logs/`. Rationale: the log dir is reserved for the plist-redirected stdout/stderr (from launchd), not for internal book-keeping. Unlinked by EXIT trap.
- **Test harness deliberately deferred to Plan 02-04.** Plan 02-03 scope explicitly says "This plan ONLY delivers the supervisor script." Plan 02-04 will build `test/supervisor-tests.sh` (bash harness, 6 scenarios) to exercise the behavioral paths. `bash -n` + structural grep is the full verification in this plan.

## Deviations from Plan

Plan executed exactly as written across all three tasks. Two minor acceptance-criterion grep imprecisions worth noting for future auditors (same category as Plan 02-01's AC5/AC2 notes) — neither required code changes:

### Acceptance-Criterion Clarifications

**1. Task 2 AC `audit_emit "(completed|failed|budget_exceeded)" = 3` returns 6, not 3**
- **Found during:** Task 2 acceptance verification
- **Cause:** The plan's AC counts "exactly one terminal-event emit per terminal class" but the grep pattern matches the same strings in early-exit audit emits that are NOT terminal-block emits. Three `failed` emits exist in preflight early-exit paths (line 73 bundle-missing, line 88 PATH-miss, line 133 unknown-runtime case); they run BEFORE the terminal-event block and never coexist with a `started` event on the same invocation (they abort before `started` is emitted). The terminal-event BLOCK (lines 170-183) contains exactly 3 emits — one `completed`, one `failed`, one `budget_exceeded` — satisfying the behavioral intent.
- **Resolution:** No fix needed. Verified via scoped grep: `sed -n '170,183p' bin/sleepwalker-run-cli | grep -cE 'audit_emit "(completed|failed|budget_exceeded)"'` → 3. `grep -c 'audit_emit "started"' bin/sleepwalker-run-cli` → 1. Invariant "exactly one `started` + exactly one terminal event per invocation" holds structurally.

**2. Task 2 AC `head -c 500 .* jq -Rs . = 3` returns 4, not 3**
- **Found during:** Task 2 acceptance verification
- **Cause:** The grep pattern `head -c 500.*jq -Rs ` matches the explanatory comment on line 170 (`# JSON-safe preview: \`head -c 500 | jq -Rs .\` produces a valid JSON string literal`) in addition to the three actual encoder calls at lines 172/177/180. The behavioral intent — 3 preview encodings in 3 terminal branches — is satisfied (verified via `grep -v '^#' bin/sleepwalker-run-cli | grep -c 'head -c 500.*jq -Rs '` → 3).
- **Resolution:** No fix needed. The extra match is a documentation comment, not a live code path.

### Pre-existing Untracked Files (out of scope, not plan-caused)

Same environmental state as Plan 02-01 and 02-02. Three untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`) were inherited from prior-plan environments and are outside this plan's `files_modified` scope. Left untouched per scope-boundary rule. `git status --porcelain | grep -v '^??'` is empty — no uncommitted changes to plan-owned files.

---

**Total deviations:** 0 code-level (plan executed exactly as written). 2 minor AC-grep clarifications documented above, same category as Plan 02-01 precedent.
**Impact on plan:** None. Script ships the exact diff shape prescribed in RESEARCH §Pattern 2 Supervisor Exact Bash. Both tasks' `<done>` blocks are satisfied.

## Issues Encountered

None. `/bin/bash -n bin/sleepwalker-run-cli` exit 0 on first write; `test -x` passed after `chmod +x`; commit + amend both clean; dashboard suite remained 72/72 green (unsurprising — supervisor is bash-only).

## User Setup Required

None. The supervisor writes to `$HOME/.sleepwalker/` (auto-creates the dir) and reads from `$REPO_ROOT/routines-<runtime>/<slug>/` (bundles are written by the editor in Phase 3). First real invocation of the supervisor will be:
- Wave 2 Plan 02-07 `codex.ts` / 02-08 `gemini.ts` adapters construct a `LaunchdJob` with `programArguments: [SUPERVISOR_ABS_PATH, bundle.runtime, bundle.slug]` and call `installPlist`.
- Wave 4 manual smoke test (`test/manual/codex-adapter-smoke.md`) is the first time a human exercises the full pipeline against real `codex`/`gemini` binaries.

No env vars, no secrets, no auth steps for this plan. The supervisor is library code that sits quiescent on disk until Wave 2 adapters wire it in.

## Threat Register Outcome

All 8 STRIDE entries from the plan's threat_model are mitigated as designed (T-02-03-04 is explicitly `accept`ed as residual risk):

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-02-03-01 | Tampering (prompt injection via argv) | **mitigated** | `CLI_ARGS=(exec - --json)` / `CLI_ARGS=(-p - --output-format stream-json --yolo)` are STATIC arrays per runtime; prompt flows via `cat "$PROMPT_FILE" \| "$CLI_ABS" "${CLI_ARGS[@]}"`. `grep -cE 'CLI_ARGS=\([^)]*prompt'` returns 0. |
| T-02-03-02 | Tampering (shell expansion of slug/runtime in paths) | **mitigated** | Every expansion is double-quoted: `"$SLUG"`, `"${BUNDLE_DIR}"`, `"${CLI_ARGS[@]}"`, `"$CLI_ABS"`, `"$PROMPT_FILE"`, `"$OUTPUT_FILE"`. Slug validity enforced upstream at the TypeScript builder layer (Plan 02-01 `assertValidSlug`). |
| T-02-03-03 | Information Disclosure (ANSI in audit preview) | **mitigated** | Triple layer: plist env sets `NO_COLOR=1 TERM=dumb CI=true` (set by Plan 02-02 adapters); supervisor re-exports the same; perl regex strips CSI + OSC + DCS/PM/APC before tee. 3 regex classes in `strip_ansi` cover Pitfall #8. |
| T-02-03-04 | Information Disclosure (audit preview containing secret) | **accept** | Preview is 500 chars of post-strip stdout. Stripping secrets is outside this layer — Phase 3 editor scans prompts at save time, and `~/.codex/auth.json` is CLI-owned state. Documented residual risk. |
| T-02-03-05 | Denial of Service (runaway CLI output) | **mitigated** | Background subshell polls `wc -c < "$OUTPUT_FILE"` every second; `kill -TERM "$CLI_PID"` on exceed + 2s grace + `kill -KILL`; `budget_exceeded` event emitted before supervisor exits. |
| T-02-03-06 | Denial of Service (crash-loop respawn storm) | **mitigated** | Supervisor always exits 0 on any terminal state (including `failed` / `budget_exceeded` / `deferred`) so launchd never interprets non-zero as "retry immediately." PLIST-layer `ThrottleInterval=300` is the secondary gate from Plan 02-02. |
| T-02-03-07 | Repudiation (audit log missing terminal event) | **mitigated** | Structural: `audit_emit "started"` is the last line before `set +e`; the terminal if/elif/else covers all three paths (budget_exceeded / completed / failed) with exactly one emit per branch; `exit 0` terminates before any other path can fire. Plan 02-04 harness will behaviorally verify this. |
| T-02-03-08 | Elevation (supervisor running as root) | **mitigated** | Supervisor never `sudo`s, never writes to system paths. Inherits the user's UID because launchd invokes it in the `gui/$UID` domain (Plan 02-02 `installPlist`). |

## Public Surface (Bash)

The script has no public library surface — it's an executable. Its external contract is:

**Invocation:**
```
bin/sleepwalker-run-cli <runtime> <slug>
```
- `<runtime>` ∈ {codex, gemini}
- `<slug>` matches `^[a-z][a-z0-9-]{0,63}$` (enforced upstream)

**Inputs read:**
- `$REPO_ROOT/routines-<runtime>/<slug>/prompt.md` (required)
- `$REPO_ROOT/routines-<runtime>/<slug>/config.json` (optional — provides `reversibility`, `budget`)
- `$HOME/.sleepwalker/settings.json` (optional — provides `sleep_window`, `policies[<fleet>]`)

**Outputs written:**
- `$HOME/.sleepwalker/audit.jsonl` — append-only, exactly 1 `started` event + exactly 1 terminal event per invocation

**Exit codes:**
- `0` — any terminal state (completed/failed/deferred/budget_exceeded)
- `64` (EX_USAGE) — missing args
- `66` (EX_NOINPUT) — bundle prompt.md missing
- `127` — CLI not found on any PATH source

## Next Phase Readiness

Plan 02-04 (bash test harness) is the immediate next critical-path target. 02-04 will:
1. Create `test/supervisor-tests.sh` — 6 behavioral scenarios (bundle-missing, PATH-miss, sleep-window defer, reversibility defer, char-budget SIGTERM, happy-path completed).
2. Use a fake-CLI pattern (`$TMPDIR/fake-codex` shell script) to exercise the pipeline without depending on real `codex`/`gemini` installations.
3. Assert the audit.jsonl contract (exactly 1 started + exactly 1 terminal event per scenario, correct event name, correct exit code).

Wave 2 Plans 02-07 (codex adapter) and 02-08 (gemini adapter) are unblocked — their `LaunchdJob.programArguments` is now a real file path instead of a placeholder. Wave 1 is complete after Plan 02-04 ships the harness.

Plan 5 Queue aggregator will consume `audit.jsonl` lines written by this supervisor — the schema (`{ts, fleet, runtime, event, ...}`) matches the v0.1 shape exactly (runtime field is new but additive), so no queue aggregator changes are required for codex/gemini run entries.

No blockers. Phase 2 Plan 03 is complete; Plan 04 can start immediately on sequential execution.

## Self-Check: PASSED

- [x] `bin/sleepwalker-run-cli` exists (verified via `test -x` and `ls`)
- [x] File is executable: `test -x bin/sleepwalker-run-cli` exit 0
- [x] Git index preserves executable bit: `git ls-files --stage bin/sleepwalker-run-cli` starts with `100755`
- [x] `/bin/bash -n bin/sleepwalker-run-cli` exit 0 (full-file syntax check passes)
- [x] Line count: 183 (target ≥ 180) — verified via `wc -l`
- [x] Commit `39f7eb3` exists in `git log --all --oneline` with subject `feat(02-03): add bin/sleepwalker-run-cli supervisor`
- [x] Commit touches exactly 2 files (bin/sleepwalker-run-cli + docs/activity_log.md) — verified via `git log -1 --name-only`
- [x] `grep -cE 'Co-Authored-By|Generated with' <(git log -1 --pretty=%B)` = 0 (no AI attribution per CLAUDE.md)
- [x] `grep -c '^set -euo pipefail' bin/sleepwalker-run-cli` = 1
- [x] `grep -c '^export NO_COLOR=1' bin/sleepwalker-run-cli` = 1
- [x] `grep -c '^export TERM=dumb' bin/sleepwalker-run-cli` = 1
- [x] `grep -c '^export CI=true' bin/sleepwalker-run-cli` = 1
- [x] `grep -c '/bin/zsh -l -c' bin/sleepwalker-run-cli` = 1 (Pitfall #1 first fallback)
- [x] `grep -c '/bin/bash -l -c' bin/sleepwalker-run-cli` = 1 (Pitfall #1 second fallback)
- [x] `grep -c 'exit 64' bin/sleepwalker-run-cli` = 2 (two usage checks)
- [x] `grep -c 'exit 66' bin/sleepwalker-run-cli` = 1 (bundle-missing)
- [x] `grep -c 'exit 127' bin/sleepwalker-run-cli` = 1 (PATH-not-found)
- [x] `grep -c 'CLI_ARGS=(exec - --json)' bin/sleepwalker-run-cli` = 1 (Codex runtime argv)
- [x] `grep -c 'CLI_ARGS=(-p - --output-format stream-json --yolo)' bin/sleepwalker-run-cli` = 1 (Gemini runtime argv)
- [x] `grep -c 'cat "\$PROMPT_FILE"' bin/sleepwalker-run-cli` = 1 (stdin prompt routing — Pitfall #4)
- [x] `grep -c 'kill -TERM' bin/sleepwalker-run-cli` = 1 (budget SIGTERM)
- [x] `grep -c 'kill -KILL' bin/sleepwalker-run-cli` = 1 (budget SIGKILL escalation)
- [x] `grep -c 'audit_emit "started"' bin/sleepwalker-run-cli` = 1 (exactly one started emit)
- [x] Terminal block (lines 170-183) contains exactly 3 `audit_emit` calls (1 completed + 1 failed + 1 budget_exceeded) — verified via scoped sed + grep
- [x] `grep -cE 'CLI_ARGS=\([^)]*prompt' bin/sleepwalker-run-cli` = 0 (critical Pitfall #4 assertion — no prompt in argv)
- [x] Placeholder comment removed: `grep -c '(Task 2 will append' bin/sleepwalker-run-cli` = 0
- [x] Dashboard suite 72/72 green (unchanged from Plan 02-02 baseline — supervisor is bash-only; no TS regressions expected or found)
- [x] `pnpm typecheck` exit 0 (no TS changes this plan)
- [x] Working tree clean for plan-owned files: `git status --porcelain | grep -v '^??'` is empty
- [x] Activity log tail contains the `2026-04-19 01:42 EST` entry citing `sleepwalker-run-cli` (4 mentions in the new entry)

---
*Phase: 02-adapters*
*Completed: 2026-04-19*
