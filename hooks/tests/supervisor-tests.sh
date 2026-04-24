#!/bin/bash
# Sleepwalker supervisor test harness.
#
# Invokes bin/sleepwalker-run-cli with fixture bundles in an isolated $HOME,
# mocks codex/gemini with bash stubs on $TEST_BIN PATH, and asserts on the
# resulting ~/.sleepwalker/audit.jsonl content + supervisor exit codes.
#
# Covers Phase 2 Validation Strategy tasks 2-03-01 through 2-03-06:
#   - PATH resolution via login-shell fallback (2-03-01)
#   - Sleep-window gate (2-03-02)
#   - Reversibility allowlist gate (2-03-03)
#   - Char-budget SIGTERM + budget_exceeded event (2-03-04)
#   - SAFE-02: NO_COLOR/TERM/CI envs + ANSI stripped from audit (2-03-05)
#   - started + exactly one terminal event (2-03-06)
#
# Run: hooks/tests/supervisor-tests.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
SUPERVISOR="$REPO_ROOT/bin/sleepwalker-run-cli"

if [ ! -x "$SUPERVISOR" ]; then
  echo "FAIL: supervisor not found or not executable: $SUPERVISOR" >&2
  exit 2
fi

# --- Isolated HOME + PATH ---
TEST_HOME="$(mktemp -d -t sw-supervisor-XXXXXX)"
TEST_BIN="$TEST_HOME/bin"
mkdir -p "$TEST_BIN" "$TEST_HOME/.sleepwalker"
export HOME="$TEST_HOME"
# Prepend $TEST_BIN so command -v codex finds our fixture first
export PATH="$TEST_BIN:$PATH"

# Track fixture bundles we create under $REPO_ROOT/routines-*/ so cleanup works
FIXTURE_BUNDLES=()

cleanup() {
  for b in "${FIXTURE_BUNDLES[@]:-}"; do
    rm -rf "$b" 2>/dev/null || true
  done
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

# --- Counters + assertions (pattern from hooks/tests/run-tests.sh) ---
PASS=0
FAIL=0
SKIP=0
FAILURES=()
SKIPS=()

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1)); echo "  PASS  $label"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$label  expected='$expected'  actual='$actual'")
    echo "  FAIL  $label"; echo "        expected: $expected"; echo "        actual:   $actual"
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    PASS=$((PASS+1)); echo "  PASS  $label"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$label  needle='$needle'  in='$haystack'")
    echo "  FAIL  $label"; echo "        needle: $needle"; echo "        in:     $haystack"
  fi
}

assert_file_lines() {
  local label="$1" expected="$2" file="$3"
  local actual
  actual=$(wc -l < "$file" 2>/dev/null | tr -d ' ' || echo 0)
  assert_eq "$label" "$expected" "$actual"
}

# --- Fixture binaries ---
# codex fixture (dual-mode via CODEX_OVER env switch):
#  - default: emits ~60 bytes of output including an ANSI color escape, exits 0.
#  - CODEX_OVER=1: emits runaway output in a loop to trigger budget SIGTERM.
# Because the supervisor resolves the `codex` binary via PATH lookup once,
# we cannot ship two codex binaries simultaneously; we parameterize via env.
cat > "$TEST_BIN/codex" <<'FAKE'
#!/bin/bash
cat > /dev/null  # drain stdin (the prompt), discard
if [ "${CODEX_OVER:-0}" = "1" ]; then
  # Emit ~2000 newline-terminated bytes per iteration.
  # Perl runs in -p mode (line-oriented) so output must have newlines to flow
  # through strip_ansi to tee; supervisor polls wc -c every 1s and should
  # cross the 500-byte budget within the first poll.
  # A trailing \n on each chunk ensures perl flushes the line to tee promptly.
  while true; do
    printf '%s\n' "$(printf 'x%.0s' $(seq 1 2000))"
    sleep 0.05
  done
else
  # Happy path: emit ~60 bytes, exit 0. Includes a sample ANSI color escape
  # to let us assert SAFE-02 stripping in audit.
  printf '\e[32mgreen-prefix\e[0m hello from codex fake\n'
fi
FAKE
chmod +x "$TEST_BIN/codex"

# Separate gemini fixture (exit 0, small output, unique string for assert).
cat > "$TEST_BIN/gemini" <<'FAKE'
#!/bin/bash
cat > /dev/null
echo -n "gemini fake output payload"
FAKE
chmod +x "$TEST_BIN/gemini"

# --- reset_state: wipes + re-seeds $HOME/.sleepwalker between scenarios ---
reset_state() {
  rm -rf "$HOME/.sleepwalker"
  mkdir -p "$HOME/.sleepwalker/logs"
  # sleep_window 0..24 = always-in-window; policies default balanced so green/yellow run, red defers
  cat > "$HOME/.sleepwalker/settings.json" <<EOF
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": {
    "codex/test-basic": "balanced",
    "codex/test-budget": "balanced",
    "codex/test-deferred-red": "balanced",
    "codex/test-ansi": "balanced",
    "codex/test-missing-bundle": "balanced",
    "gemini/test-basic": "balanced"
  }
}
EOF
  : > "$HOME/.sleepwalker/audit.jsonl"
}

# --- make_bundle: creates a test routine bundle under $REPO_ROOT/routines-<runtime>/<slug>/ ---
make_bundle() {
  local runtime="$1" slug="$2" reversibility="$3" budget="$4"
  local dir="$REPO_ROOT/routines-${runtime}/${slug}"
  mkdir -p "$dir"
  FIXTURE_BUNDLES+=("$dir")
  cat > "$dir/prompt.md" <<EOF
[sleepwalker:${runtime}/${slug}]
Test prompt for ${runtime}/${slug}.
EOF
  cat > "$dir/config.json" <<EOF
{"name":"${slug}","reversibility":"${reversibility}","budget":${budget}}
EOF
}

# =============================================================================
# Scenario 1: happy path — codex fires, emits started + completed, exits 0
# =============================================================================
echo "==> scenario 1: codex happy path (started + completed)"
reset_state
make_bundle "codex" "test-basic" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex test-basic >/dev/null
SCEN1_EXIT=$?
set -e
assert_eq  "s1: supervisor exits 0"           "0" "$SCEN1_EXIT"
assert_file_lines "s1: audit has 2 lines"      "2" "$HOME/.sleepwalker/audit.jsonl"
assert_contains "s1: started event present"   '"event":"started"'    "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s1: completed event present" '"event":"completed"'  "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s1: fleet is codex/test-basic" '"fleet":"codex/test-basic"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s1: runtime is codex"        '"runtime":"codex"'    "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s1: exit_code 0 on completed" '"exit_code":0'        "$(cat "$HOME/.sleepwalker/audit.jsonl")"

# =============================================================================
# Scenario 2: SAFE-02 — ANSI escape sequences stripped from audit preview
# =============================================================================
echo "==> scenario 2: ANSI stripped from audit (SAFE-02)"
reset_state
make_bundle "codex" "test-ansi" "yellow" 40000
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex test-ansi >/dev/null
AUDIT_RAW="$(cat "$HOME/.sleepwalker/audit.jsonl")"
# Raw ANSI CSI bytes: \x1b[ (the ESC char followed by [)
if printf '%s' "$AUDIT_RAW" | grep -q $'\x1b\\['; then
  FAIL=$((FAIL+1)); FAILURES+=("s2: audit contains raw CSI escape")
  echo "  FAIL  s2: audit contains raw CSI escape"
else
  PASS=$((PASS+1)); echo "  PASS  s2: audit contains no raw CSI escape"
fi
# Should also not contain literal "[32m" or "[0m" fragments from color codes
if printf '%s' "$AUDIT_RAW" | grep -q '\[32m'; then
  FAIL=$((FAIL+1)); FAILURES+=("s2: audit contains literal [32m")
  echo "  FAIL  s2: audit contains literal [32m"
else
  PASS=$((PASS+1)); echo "  PASS  s2: audit contains no literal [32m"
fi
# But the plain word "green-prefix" should have made it through (ANSI markers stripped, payload preserved)
assert_contains "s2: stripped payload contains green-prefix" "green-prefix" "$AUDIT_RAW"

# =============================================================================
# Scenario 3: char-budget SIGTERM -> budget_exceeded event
# =============================================================================
echo "==> scenario 3: budget exceeded -> SIGTERM + budget_exceeded event"
reset_state
# Low budget (500 bytes) + CODEX_OVER=1 switches fixture into runaway output mode
make_bundle "codex" "test-budget" "yellow" 500
set +e
SLEEPWALKER_MODE=overnight CODEX_OVER=1 "$SUPERVISOR" codex test-budget >/dev/null
SCEN3_EXIT=$?
set -e
assert_eq  "s3: supervisor exits 0 on budget" "0" "$SCEN3_EXIT"
assert_contains "s3: budget_exceeded event" '"event":"budget_exceeded"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s3: chars_limit 500"        '"chars_limit":500'         "$(cat "$HOME/.sleepwalker/audit.jsonl")"

# =============================================================================
# Scenario 4: reversibility gate — red routine under balanced policy -> deferred
# =============================================================================
echo "==> scenario 4: red reversibility + balanced policy -> deferred"
reset_state
make_bundle "codex" "test-deferred-red" "red" 40000
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex test-deferred-red >/dev/null
SCEN4_EXIT=$?
set -e
assert_eq  "s4: supervisor exits 0 on defer"  "0" "$SCEN4_EXIT"
assert_contains "s4: deferred event" '"event":"deferred"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s4: defer reason mentions policy" 'policy balanced blocks red' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
# Defer is a terminal event; there should NOT be a started event for the blocked run
if grep -q '"event":"started"' "$HOME/.sleepwalker/audit.jsonl"; then
  FAIL=$((FAIL+1)); FAILURES+=("s4: deferred run should not emit started")
  echo "  FAIL  s4: deferred run should not emit started"
else
  PASS=$((PASS+1)); echo "  PASS  s4: deferred run does not emit started"
fi

# =============================================================================
# Scenario 5: bundle missing -> exit 66 + failed event
# =============================================================================
echo "==> scenario 5: bundle missing -> EX_NOINPUT + failed event"
reset_state
# Do NOT call make_bundle — the bundle dir does not exist
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex test-missing-bundle >/dev/null
SCEN5_EXIT=$?
set -e
assert_eq  "s5: supervisor exits 66"          "66" "$SCEN5_EXIT"
assert_contains "s5: failed event" '"event":"failed"'              "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s5: reason bundle not found" '"reason":"bundle not found"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"

# =============================================================================
# Scenario 6: gemini happy path — covers the second runtime arm
# =============================================================================
echo "==> scenario 6: gemini happy path"
reset_state
make_bundle "gemini" "test-basic" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" gemini test-basic >/dev/null
SCEN6_EXIT=$?
set -e
assert_eq  "s6: supervisor exits 0"           "0" "$SCEN6_EXIT"
assert_file_lines "s6: audit has 2 lines"      "2" "$HOME/.sleepwalker/audit.jsonl"
assert_contains "s6: runtime is gemini"       '"runtime":"gemini"'  "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s6: fleet is gemini/test-basic" '"fleet":"gemini/test-basic"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"

# =============================================================================
# Scenario 7: explicit bundle_dir arg ($3 override) — Plan 02-11 follow-up.
# Staged supervisor at ~/.sleepwalker/bin/... cannot derive REPO_ROOT from
# $(dirname $0)/.. The adapter must pass bundle.bundlePath as $3 so the
# supervisor reads prompt.md from the real bundle location, not
# ~/.sleepwalker/routines-codex/<slug>/.
# =============================================================================
echo "==> scenario 7: explicit bundle_dir arg overrides derived REPO_ROOT"
reset_state
# Create fixture bundle in a location that is NOT $REPO_ROOT/routines-codex/
# so the only way the supervisor finds it is via the $3 override.
S7_BUNDLE_DIR="$TEST_HOME/custom-bundles/codex/s7-explicit"
mkdir -p "$S7_BUNDLE_DIR"
cat > "$S7_BUNDLE_DIR/prompt.md" <<'EOF'
scenario 7 prompt via explicit bundle_dir
EOF
cat > "$S7_BUNDLE_DIR/config.json" <<'EOF'
{"reversibility":"yellow","char_budget":40000}
EOF
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex s7-explicit "$S7_BUNDLE_DIR" >/dev/null
SCEN7_EXIT=$?
set -e
assert_eq "s7: supervisor exits 0 when \$3 points to real bundle"  "0" "$SCEN7_EXIT"
assert_file_lines "s7: audit has 2 lines (started + completed)"    "2" "$HOME/.sleepwalker/audit.jsonl"
assert_contains "s7: fleet is codex/s7-explicit"  '"fleet":"codex/s7-explicit"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"

# Negative control: without $3, the supervisor derives REPO_ROOT from
# $(dirname $0)/.. (which is the real repo here, so
# $REPO_ROOT/routines-codex/s7-explicit doesn't exist).
echo "==> scenario 7b: missing \$3 with non-derivable bundle -> exit 66"
reset_state
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex s7-explicit >/dev/null 2>&1
SCEN7B_EXIT=$?
set -e
assert_eq "s7b: supervisor exits 66 (EX_NOINPUT) when derived bundle missing" "66" "$SCEN7B_EXIT"

# =============================================================================
# Scenarios 8 + 9: flock-backed mutex behavior (QUEU-04)
# =============================================================================
# Both scenarios require flock(1) to actually exercise the feature they
# claim to test. flock is NOT shipped on stock macOS (users install it via
# `brew install util-linux`). Without flock, scenario 8 would trivially
# "pass" under unlocked appends at low contention, and scenario 9 could
# not hold the artificial lock it depends on — both would report PASS for
# the wrong reason, masking regressions. Skip with a clear message when
# absent so the test output is honest about what was verified.
if ! command -v flock >/dev/null 2>&1; then
  echo ""
  echo "==> scenarios 8 + 9: SKIPPED (flock(1) not found on PATH)"
  echo "    install with: brew install util-linux"
  echo "    and re-run this harness to verify QUEU-04 mutex behavior."
  SKIP=$((SKIP+2))
  SKIPS+=("s8: flock-serialized concurrent audit writes (needs flock(1))")
  SKIPS+=("s9: flock timeout graceful fallthrough (needs flock(1))")
else

echo ""
echo "==> scenario 8: flock serializes 4 concurrent supervisor audit writes"
reset_state
make_bundle "codex"  "s8-a" "yellow" 40000
make_bundle "codex"  "s8-b" "yellow" 40000
make_bundle "gemini" "s8-c" "yellow" 40000
make_bundle "gemini" "s8-d" "yellow" 40000

# Ensure the lock file sidecar is ready before the fan-out (supervisor's
# own `touch "$LOCK_FILE"` also covers this, but we pre-create here to keep
# the test independent of supervisor boot ordering).
S8_LOCK_FILE="$TEST_HOME/.sleepwalker/audit.jsonl.lock"
mkdir -p "$(dirname "$S8_LOCK_FILE")"
touch "$S8_LOCK_FILE"

# Fire all 4 in parallel. Each supervisor emits: started + completed = 2 lines.
for pair in "codex s8-a" "codex s8-b" "gemini s8-c" "gemini s8-d"; do
  SLEEPWALKER_MODE=overnight "$SUPERVISOR" $pair >/dev/null 2>&1 &
done
wait

# Count: 4 runs × 2 events each = 8 lines exactly. flock serialization
# prevents the interleaving RESEARCH §1.7 observed. Even at small line
# sizes, interleaved appends show up as drifted line counts under wc -l
# because embedded partial writes break lines in half.
assert_file_lines "s8: audit has exactly 8 lines (4 runs × 2 events)" "8" "$TEST_HOME/.sleepwalker/audit.jsonl"

# Every line must round-trip through jq -e . cleanly — this is the
# "zero corruption" invariant the flock closes.
PARSE_FAIL=0
while IFS= read -r line; do
  printf '%s' "$line" | jq -e . >/dev/null 2>&1 || PARSE_FAIL=$((PARSE_FAIL+1))
done < "$TEST_HOME/.sleepwalker/audit.jsonl"
assert_eq "s8: zero malformed audit lines" "0" "$PARSE_FAIL"

# Each of the 4 bundles should appear in at least one fleet field
assert_contains "s8: codex/s8-a fleet observed"  '"fleet":"codex/s8-a"'  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl")"
assert_contains "s8: codex/s8-b fleet observed"  '"fleet":"codex/s8-b"'  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl")"
assert_contains "s8: gemini/s8-c fleet observed" '"fleet":"gemini/s8-c"' "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl")"
assert_contains "s8: gemini/s8-d fleet observed" '"fleet":"gemini/s8-d"' "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl")"

# =============================================================================
# Scenario 9: flock -w 5 times out gracefully (supervisor degrades safely)
# =============================================================================
# Per RESEARCH §1.6, the supervisor chooses "option 2" on flock timeout:
# fall through to unlocked append (|| true). Preserves the audit entry
# (critical path for the supervisor) at the cost of re-introducing the
# v0.1 race for that one entry — better than killing the run.
echo ""
echo "==> scenario 9: flock -w 5 times out gracefully when lock is held"
reset_state
S9_LOCK_FILE="$TEST_HOME/.sleepwalker/audit.jsonl.lock"
mkdir -p "$(dirname "$S9_LOCK_FILE")"
touch "$S9_LOCK_FILE"

# Hold the lock for 6 seconds in a background subshell. Use the FD form
# (exec 9>lockfile && flock -e 9) instead of the file+command form
# (flock -x lockfile -c 'sleep 6') because the latter may not release
# reliably on macOS ARM64 (discoteq flock quirk with -c). The FD form
# keeps the advisory lock alive via an open FD until the subshell exits.
( exec 9>"$S9_LOCK_FILE" && flock -e 9 && sleep 6 ) &
HOLDER=$!
sleep 0.3  # Let the holder actually grab the lock before the contender starts

make_bundle "codex" "s9-blocked" "yellow" 40000

set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex s9-blocked >/dev/null 2>&1
S9_EXIT=$?
set -e

# Clean up the holder. Bound the wait with a watchdog in case the lock
# was never acquired (flock failure) and the subshell runs indefinitely.
( sleep 15 && kill "$HOLDER" 2>/dev/null ) & _S9WD=$!
wait "$HOLDER" 2>/dev/null || true
kill "$_S9WD" 2>/dev/null; wait "$_S9WD" 2>/dev/null || true; unset _S9WD

# Supervisor must not crash on flock timeout. Via the || true fallthrough
# in audit_emit, the unlocked append still runs and exit stays 0.
assert_eq "s9: supervisor exits 0 even on flock timeout" "0" "$S9_EXIT"

# Expect at least the started + completed events (2 lines). If the
# unlocked-fallback introduced corruption under extreme contention, line
# count could differ — we accept >=1 as proof the graceful fallthrough ran.
AUDIT_LINES=$(wc -l < "$TEST_HOME/.sleepwalker/audit.jsonl" 2>/dev/null | tr -d ' ' || echo 0)
if [ "$AUDIT_LINES" -lt 1 ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s9: no audit lines landed after flock timeout fallthrough")
  echo "  FAIL  s9: audit empty after timeout (expected >=1 line via unlocked fallthrough)"
else
  PASS=$((PASS+1)); echo "  PASS  s9: audit captured $AUDIT_LINES line(s) via graceful fallthrough"
fi

fi  # end: flock-available gate for scenarios 8 + 9

# =============================================================================
# Scenario 10: sleep-window gate — narrow window that excludes NOW,
#              no overnight bypass → deferred with "outside sleep window".
# Closes coverage gap: every other scenario sets sleep_window {0..24} and
# SLEEPWALKER_MODE=overnight, so the actual gate never fired in CI until now.
# Window construction: start=(now+1)%24, end=(now+2)%24 — a 1-hour slot that
# begins one hour from now and deliberately excludes the current hour in both
# the START<END (daytime) and START>END (overnight) branches of the gate.
# =============================================================================
echo ""
echo "==> scenario 10: sleep-window gate defers when hour is outside window (no overnight mode)"
reset_state
# Overwrite settings.json with a narrow window that excludes NOW, clearing the
# SLEEPWALKER_MODE bypass so the gate actually runs.
NOW_H=$(date +%H | sed 's/^0//'); NOW_H=${NOW_H:-0}
SLP_START=$(( (NOW_H + 1) % 24 ))
SLP_END=$(( (NOW_H + 2) % 24 ))
cat > "$HOME/.sleepwalker/settings.json" <<EOF
{
  "sleep_window": { "start_hour": ${SLP_START}, "end_hour": ${SLP_END} },
  "policies": { "codex/test-sleep-defer": "balanced" }
}
EOF
make_bundle "codex" "test-sleep-defer" "yellow" 40000
set +e
# No SLEEPWALKER_MODE=overnight — gate must trigger
"$SUPERVISOR" codex test-sleep-defer >/dev/null 2>&1
SCEN10_EXIT=$?
set -e
assert_eq       "s10: supervisor exits 0 on sleep-window defer" "0" "$SCEN10_EXIT"
assert_file_lines "s10: audit has exactly 1 line (single deferred event)" "1" "$HOME/.sleepwalker/audit.jsonl"
assert_contains "s10: deferred event"                    '"event":"deferred"'            "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s10: defer reason mentions sleep window" '"reason":"outside sleep window"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains "s10: defer payload includes hour"       "\"hour\":${NOW_H}"              "$(cat "$HOME/.sleepwalker/audit.jsonl")"
# Negative: no started event (deferred is terminal before the run)
if grep -q '"event":"started"' "$HOME/.sleepwalker/audit.jsonl"; then
  FAIL=$((FAIL+1)); FAILURES+=("s10: sleep-deferred run should not emit started")
  echo "  FAIL  s10: sleep-deferred run should not emit started"
else
  PASS=$((PASS+1)); echo "  PASS  s10: sleep-deferred run does not emit started"
fi

# =============================================================================
# Scenario 11: sleep-window gate — window includes NOW, no overnight bypass,
#              supervisor proceeds normally (positive control for scenario 10).
# Window construction: start=now, end=(now+1)%24 — a 1-hour slot that includes
# the current hour. Covers both branches:
#   - START < END (daytime): e.g. now=14 → [14, 15)  → in-window
#   - START > END (overnight wrap): e.g. now=23 → [23, 0) → in-window via OR
# =============================================================================
echo ""
echo "==> scenario 11: sleep-window gate allows when hour is inside window (no overnight mode)"
reset_state
NOW_H2=$(date +%H | sed 's/^0//'); NOW_H2=${NOW_H2:-0}
IN_START=${NOW_H2}
IN_END=$(( (NOW_H2 + 1) % 24 ))
cat > "$HOME/.sleepwalker/settings.json" <<EOF
{
  "sleep_window": { "start_hour": ${IN_START}, "end_hour": ${IN_END} },
  "policies": { "codex/test-sleep-allow": "balanced" }
}
EOF
make_bundle "codex" "test-sleep-allow" "yellow" 40000
set +e
"$SUPERVISOR" codex test-sleep-allow >/dev/null 2>&1
SCEN11_EXIT=$?
set -e
assert_eq         "s11: supervisor exits 0"                        "0" "$SCEN11_EXIT"
assert_file_lines "s11: audit has 2 lines (started + completed)"   "2" "$HOME/.sleepwalker/audit.jsonl"
assert_contains   "s11: started event present"                     '"event":"started"'   "$(cat "$HOME/.sleepwalker/audit.jsonl")"
assert_contains   "s11: completed event present"                   '"event":"completed"' "$(cat "$HOME/.sleepwalker/audit.jsonl")"
# Negative: no deferred event — gate allowed the run through
if grep -q '"event":"deferred"' "$HOME/.sleepwalker/audit.jsonl"; then
  FAIL=$((FAIL+1)); FAILURES+=("s11: in-window run should not emit deferred")
  echo "  FAIL  s11: in-window run should not emit deferred"
else
  PASS=$((PASS+1)); echo "  PASS  s11: in-window run does not emit deferred"
fi

# =============================================================================
# Scenario 12: PATH login-shell fallback (Pitfall #1).
# When `command -v codex` fails on the invoking-shell PATH, the supervisor
# must fall back to `/bin/zsh -l -c "command -v codex"` which runs a login
# shell that sources ~/.zprofile. Test fixture:
#   - remove codex from $TEST_BIN (the path the invoking shell can see)
#   - stage a codex stub in $TEST_BIN_FALLBACK (NOT on invoking PATH)
#   - write $HOME/.zprofile that prepends $TEST_BIN_FALLBACK to PATH
#   - assert the supervisor resolves codex via the zsh-login fallback
# This scenario is skipped if /bin/zsh is absent (vanishingly unlikely on
# macOS — zsh is the default shell since 10.15) or if the test host's
# /etc/zprofile does something hostile to user-level PATH prepends.
# =============================================================================
echo ""
echo "==> scenario 12: PATH resolution falls back to /bin/zsh -l when invoking PATH misses"
# This scenario is the ONLY test of tier-2 resolution in the supervisor. Every
# other scenario runs with $TEST_BIN on PATH so tier-1 `command -v codex`
# always hits. Here we strip every directory that contains a real `codex`
# from the invoking PATH, then expose a stub ONLY via $HOME/.zprofile — so
# the sole way the supervisor can resolve `codex` is by firing tier-2
# (/bin/zsh -l -c "command -v codex"), which sources our custom .zprofile.
#
# Pre-req: jq must still be reachable by the supervisor itself (used for
# settings + config parsing). We symlink jq into a test-only dir and use
# that dir plus /usr/bin:/bin as the minimal invoking PATH. /opt/homebrew/bin
# stays out entirely so no real codex leaks into tier-1.
if [ ! -x /bin/zsh ]; then
  echo "    SKIPPED (/bin/zsh not found — macOS default since 10.15)"
  SKIP=$((SKIP+1))
  SKIPS+=("s12: PATH login-shell fallback (needs /bin/zsh)")
elif ! command -v jq >/dev/null 2>&1; then
  echo "    SKIPPED (jq not found — supervisor depends on it)"
  SKIP=$((SKIP+1))
  SKIPS+=("s12: PATH login-shell fallback (needs jq)")
else
  reset_state
  # Fallback bin dir reachable ONLY via zsh-login. Must NOT appear on the
  # invoking PATH — that would make tier-1 succeed and tier-2 never fire.
  TEST_BIN_FALLBACK="$TEST_HOME/fallback-bin"
  mkdir -p "$TEST_BIN_FALLBACK"
  cat > "$TEST_BIN_FALLBACK/codex" <<'FAKE'
#!/bin/bash
cat > /dev/null
echo -n "fallback-path codex output"
FAKE
  chmod +x "$TEST_BIN_FALLBACK/codex"

  # Symlink the supervisor's hard deps (jq) into a test-only sysbin so we
  # can construct a minimal invoking PATH that excludes /opt/homebrew/bin
  # (which is where every dev host keeps the real codex).
  TEST_SYSBIN="$TEST_HOME/sysbin"
  mkdir -p "$TEST_SYSBIN"
  ln -sf "$(command -v jq)" "$TEST_SYSBIN/jq"
  # flock is optional (supervisor degrades with || true); link if present so
  # audit writes stay serialized for this scenario.
  if command -v flock >/dev/null 2>&1; then
    ln -sf "$(command -v flock)" "$TEST_SYSBIN/flock"
  fi

  # Write $HOME/.zprofile so zsh -l prepends the fallback dir during tier-2.
  # macOS /etc/zprofile runs path_helper which resets PATH; user .zprofile
  # runs AFTER that, so our prepend survives into `command -v codex`.
  cat > "$HOME/.zprofile" <<EOF
export PATH="${TEST_BIN_FALLBACK}:\$PATH"
EOF

  make_bundle "codex" "test-path-fallback" "yellow" 40000
  cat > "$HOME/.sleepwalker/settings.json" <<EOF
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": { "codex/test-path-fallback": "balanced" }
}
EOF

  # Minimal invoking PATH: no Homebrew, no $TEST_BIN (which has a codex
  # stub for other scenarios), no user paths at all. Only the symlinked
  # deps + POSIX /usr/bin and /bin. This guarantees tier-1 miss.
  SAVED_PATH="$PATH"
  set +e
  env -i \
    HOME="$HOME" \
    PATH="$TEST_SYSBIN:/usr/bin:/bin" \
    SLEEPWALKER_MODE=overnight \
    /bin/bash "$SUPERVISOR" codex test-path-fallback >/dev/null 2>&1
  SCEN12_EXIT=$?
  set -e

  # Restore harness state
  export PATH="$SAVED_PATH"
  rm -f "$HOME/.zprofile"

  assert_eq         "s12: supervisor exits 0 via zsh-login fallback"   "0" "$SCEN12_EXIT"
  assert_file_lines "s12: audit has 2 lines (started + completed)"    "2" "$HOME/.sleepwalker/audit.jsonl"
  # Definitive proof tier-2 ran: the resolved CLI_ABS is the fallback-path
  # stub, which exists ONLY in a dir reachable via $HOME/.zprofile.
  assert_contains "s12: started event cli is fallback-path codex" \
    "\"cli\":\"${TEST_BIN_FALLBACK}/codex\"" \
    "$(cat "$HOME/.sleepwalker/audit.jsonl")"
  # And the completed output should contain the fallback stub's signature
  # string, confirming the stub (not some real codex) actually executed.
  assert_contains "s12: completed preview contains fallback stub output" \
    "fallback-path codex output" \
    "$(cat "$HOME/.sleepwalker/audit.jsonl")"
fi

# =============================================================================
# Scenario 13: audit rotation — size-based rotation with 3 generations kept.
# Uses SLEEPWALKER_AUDIT_MAX_BYTES=2048 to force rotation on the first write
# (pre-existing 3000-byte file exceeds the 2KB cap). Matrix:
#   13a: first rotation — audit -> audit.1, fresh audit has just the new event
#   13b: second rotation — audit.1 -> audit.2, new audit.1, fresh audit
#   13c: third rotation — shifts through all three generations
#   13d: fourth rotation — oldest (.3) is dropped; .1 .2 .3 kept
#   13e: override env var lowers the cap; default (unset) keeps file intact
# =============================================================================
echo ""
echo "==> scenario 13: audit rotation at SLEEPWALKER_AUDIT_MAX_BYTES"
reset_state

# seed_audit_with_token TOKEN writes ~3KB of audit lines each tagged with
# the given TOKEN so we can trace which generation each rotated file came
# from. TOKEN=A, B, C, D through the four rotations — by the 4th rotation
# the A content must have been dropped (.3 keeps 3 generations only).
# Writes OVERWRITE the audit file — this simulates the "audit filled up
# again since last rotation" condition, because each supervisor run
# writes only ~200 bytes of its own events, not enough to fire rotation
# on its own under a 2KB cap.
seed_audit_with_token() {
  local target="$1"
  local token="$2"
  : > "$target"
  local i=0
  while [ "$(wc -c < "$target" | tr -d ' ')" -lt 2500 ]; do
    printf '{"ts":"2026-04-22T00:00:%02dZ","fleet":"codex/seed","runtime":"codex","event":"completed","chars_consumed":%d,"preview":"tok-%s-%d"}\n' \
      "$((i % 60))" "$((i * 10))" "$token" "$i" >> "$target"
    i=$((i+1))
  done
}

# 13a: first rotation — audit (token A) -> .1
seed_audit_with_token "$HOME/.sleepwalker/audit.jsonl" "A"
make_bundle "codex" "rot-a" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight \
  SLEEPWALKER_AUDIT_MAX_BYTES=2048 \
  "$SUPERVISOR" codex rot-a >/dev/null 2>&1
S13A_EXIT=$?
set -e
assert_eq "s13a: supervisor exits 0 across rotation" "0" "$S13A_EXIT"
if [ ! -f "$HOME/.sleepwalker/audit.jsonl.1" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s13a: audit.jsonl.1 should exist after rotation")
  echo "  FAIL  s13a: audit.jsonl.1 should exist"
else
  PASS=$((PASS+1)); echo "  PASS  s13a: audit.jsonl.1 exists"
fi
assert_contains "s13a: .1 holds token A content (just-rotated generation)" \
  '"preview":"tok-A-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
assert_contains "s13a: fresh audit has this run's events" \
  '"fleet":"codex/rot-a"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl" 2>/dev/null || echo '')"
assert_file_lines "s13a: fresh audit has 2 lines (started + completed)" "2" "$HOME/.sleepwalker/audit.jsonl"
# Negative: no .2 or .3 yet — only one rotation has happened
if [ -f "$HOME/.sleepwalker/audit.jsonl.2" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s13a: .2 must not exist after only 1 rotation")
  echo "  FAIL  s13a: .2 must not exist yet"
else
  PASS=$((PASS+1)); echo "  PASS  s13a: no .2 yet (only 1 rotation)"
fi

# 13b: second rotation — token B -> .1, token A shifts .1 -> .2
seed_audit_with_token "$HOME/.sleepwalker/audit.jsonl" "B"
make_bundle "codex" "rot-b" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight \
  SLEEPWALKER_AUDIT_MAX_BYTES=2048 \
  "$SUPERVISOR" codex rot-b >/dev/null 2>&1
set -e
assert_contains "s13b: .1 holds token B (just rotated)" \
  '"preview":"tok-B-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
assert_contains "s13b: .2 holds token A (shifted from .1)" \
  '"preview":"tok-A-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.2" 2>/dev/null || echo '')"

# 13c: third rotation — C -> .1, B shifts .1 -> .2, A shifts .2 -> .3
seed_audit_with_token "$HOME/.sleepwalker/audit.jsonl" "C"
make_bundle "codex" "rot-c" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight \
  SLEEPWALKER_AUDIT_MAX_BYTES=2048 \
  "$SUPERVISOR" codex rot-c >/dev/null 2>&1
set -e
assert_contains "s13c: .1 holds C" '"preview":"tok-C-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
assert_contains "s13c: .2 holds B" '"preview":"tok-B-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.2" 2>/dev/null || echo '')"
assert_contains "s13c: .3 holds A" '"preview":"tok-A-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.3" 2>/dev/null || echo '')"

# 13d: fourth rotation — D -> .1, C -> .2, B -> .3, A is DROPPED.
seed_audit_with_token "$HOME/.sleepwalker/audit.jsonl" "D"
make_bundle "codex" "rot-d" "yellow" 40000
set +e
SLEEPWALKER_MODE=overnight \
  SLEEPWALKER_AUDIT_MAX_BYTES=2048 \
  "$SUPERVISOR" codex rot-d >/dev/null 2>&1
set -e
assert_contains "s13d: .1 holds D"                                   '"preview":"tok-D-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
assert_contains "s13d: .2 holds C (shifted from .1)"                 '"preview":"tok-C-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.2" 2>/dev/null || echo '')"
assert_contains "s13d: .3 holds B (shifted from .2)"                 '"preview":"tok-B-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl.3" 2>/dev/null || echo '')"
# Token A must be GONE from every generation — dropping the oldest is
# what makes rotation bounded in disk use.
if grep -q '"preview":"tok-A-' "$HOME/.sleepwalker/audit.jsonl" \
                               "$HOME/.sleepwalker/audit.jsonl.1" \
                               "$HOME/.sleepwalker/audit.jsonl.2" \
                               "$HOME/.sleepwalker/audit.jsonl.3" 2>/dev/null; then
  FAIL=$((FAIL+1)); FAILURES+=("s13d: token A must be dropped after 4th rotation")
  echo "  FAIL  s13d: oldest generation (token A) was not dropped"
else
  PASS=$((PASS+1)); echo "  PASS  s13d: oldest generation (token A) dropped"
fi
if [ -f "$HOME/.sleepwalker/audit.jsonl.4" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s13d: no 4th generation should ever exist")
  echo "  FAIL  s13d: audit.jsonl.4 must not exist"
else
  PASS=$((PASS+1)); echo "  PASS  s13d: exactly 3 generations kept (no .4)"
fi

# 13e: rotation does NOT fire under default cap (10MB) for a small file
reset_state
seed_audit_with_token "$HOME/.sleepwalker/audit.jsonl" "E"
make_bundle "codex" "rot-e" "yellow" 40000
set +e
# No SLEEPWALKER_AUDIT_MAX_BYTES -> default 10MB cap. ~2.5KB is well under.
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex rot-e >/dev/null 2>&1
set -e
if [ -f "$HOME/.sleepwalker/audit.jsonl.1" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s13e: no rotation should occur under default 10MB cap")
  echo "  FAIL  s13e: audit.jsonl.1 should NOT exist under default cap"
else
  PASS=$((PASS+1)); echo "  PASS  s13e: default cap (10MB) does not rotate 3KB file"
fi
assert_contains "s13e: audit still has seed (not rotated)" \
  '"preview":"tok-E-0"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl" 2>/dev/null || echo '')"
assert_contains "s13e: audit has new run events appended" \
  '"fleet":"codex/rot-e"' \
  "$(cat "$HOME/.sleepwalker/audit.jsonl" 2>/dev/null || echo '')"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "──────────────────────────────────────"
if [ "$SKIP" -gt 0 ]; then
  echo "  Results: $PASS pass / $FAIL fail / $SKIP skip"
  for s in "${SKIPS[@]:-}"; do
    [ -n "$s" ] && echo "    SKIP  $s"
  done
else
  echo "  Results: $PASS pass / $FAIL fail"
fi
echo "──────────────────────────────────────"
if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
echo "all supervisor tests passed"
exit 0
