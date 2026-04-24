#!/bin/bash
# Sleepwalker hook test harness
#
# Runs each hook script with REAL Claude Code hook input format JSON in an
# isolated $HOME, verifies stdout JSON (hookSpecificOutput shape) and side
# effects on the queue/audit/budget files.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/hooks"

PASS=0
FAIL=0
FAILURES=()

# Set up isolated HOME for the duration of all tests
TEST_HOME=$(mktemp -d -t sleepwalker-hooktest-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$TEST_HOME/.sleepwalker"

cleanup() { rm -rf "$TEST_HOME"; }
trap cleanup EXIT

reset_state() {
  rm -rf "$TEST_HOME/.sleepwalker"
  mkdir -p "$TEST_HOME/.sleepwalker/sessions"
  cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": { "test-fleet": "balanced", "inbox-triage": "balanced", "downloads-organizer": "balanced", "pr-reviewer": "strict" },
  "budgets":  { "test-fleet": 1000, "inbox-triage": 100000, "downloads-organizer": 100000, "pr-reviewer": 100000 }
}
EOF
  echo '{}' > "$TEST_HOME/.sleepwalker/budgets.json"
}

# Build a fake transcript that contains the [sleepwalker:fleet] marker tag,
# matching the format that real SKILL.md prompt bodies use after install.sh.
make_transcript() {
  local fleet="$1"
  local file="$TEST_HOME/transcript-${fleet}.jsonl"
  cat > "$file" <<EOF
{"type":"user","message":{"role":"user","content":"[sleepwalker:${fleet}]\n\nYou are running as a Sleepwalker fleet member. Do the work."}}
EOF
  echo "$file"
}

# Build a hook input JSON in the REAL Claude Code format
hook_input() {
  local event="$1" tool="$2" tool_input="$3" session="$4" transcript="$5"
  local response="${6:-}"
  if [ -n "$response" ]; then
    jq -nc --arg s "$session" --arg t "$transcript" --arg ev "$event" --arg tn "$tool" --argjson ti "$tool_input" --arg tr "$response" \
      '{session_id:$s, transcript_path:$t, cwd:"/tmp", permission_mode:"default", hook_event_name:$ev, tool_name:$tn, tool_input:$ti, tool_response:$tr, tool_use_id:"toolu_01TEST"}'
  else
    jq -nc --arg s "$session" --arg t "$transcript" --arg ev "$event" --arg tn "$tool" --argjson ti "$tool_input" \
      '{session_id:$s, transcript_path:$t, cwd:"/tmp", permission_mode:"default", hook_event_name:$ev, tool_name:$tn, tool_input:$ti, tool_use_id:"toolu_01TEST"}'
  fi
}

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
  local label="$1" expected_lines="$2" file="$3"
  local actual=0
  [ -f "$file" ] && actual=$(wc -l < "$file" | tr -d ' ')
  assert_eq "$label" "$expected_lines" "$actual"
}

# ========================================================================
# defer-irreversible.sh tests
# ========================================================================
echo "==> defer-irreversible.sh — REAL hook input format"

reset_state
TR=$(make_transcript "inbox-triage")

echo "  test: green tool (Read) → allow"
in=$(hook_input "PreToolUse" "Read" '{"file_path":"/tmp/x"}' "session-1" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "Read returns allow" "allow" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_eq "hookEventName is PreToolUse" "PreToolUse" "$(echo "$out" | jq -r '.hookSpecificOutput.hookEventName')"
assert_file_lines "queue empty after Read" "0" "$TEST_HOME/.sleepwalker/queue.jsonl"

reset_state
TR=$(make_transcript "inbox-triage")

echo "  test: red tool (WebFetch) → defer"
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"https://x.com","prompt":"y"}' "session-2" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "WebFetch returns defer" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue has 1 entry" "1" "$TEST_HOME/.sleepwalker/queue.jsonl"
assert_contains "queue entry has fleet=inbox-triage" "inbox-triage" "$(cat "$TEST_HOME/.sleepwalker/queue.jsonl")"

reset_state
TR=$(make_transcript "pr-reviewer")

echo "  test: yellow tool (Edit) under strict → defer"
in=$(hook_input "PreToolUse" "Edit" '{"file_path":"/tmp/x"}' "session-3" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "Edit defers under strict" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"

reset_state
echo "  test: NOT a sleepwalker context → allow (no interference)"
# Transcript that does NOT mention sleepwalker
NOT_SLEEPWALKER="$TEST_HOME/normal.jsonl"
echo '{"role":"system","content":"You are Claude Code. Help the user."}' > "$NOT_SLEEPWALKER"
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"x","prompt":"y"}' "session-x" "$NOT_SLEEPWALKER")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "non-sleepwalker session always allows" "allow" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue stays empty for non-sleepwalker" "0" "$TEST_HOME/.sleepwalker/queue.jsonl"

reset_state
TR=$(make_transcript "downloads-organizer")
echo "  test: Bash command classification — git push is red"
in=$(hook_input "PreToolUse" "Bash" '{"command":"git push origin main"}' "session-4" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "git push defers" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"

reset_state
TR=$(make_transcript "downloads-organizer")
echo "  test: Bash command classification — ls is green"
in=$(hook_input "PreToolUse" "Bash" '{"command":"ls -la /tmp"}' "session-5" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "ls allows" "allow" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"

reset_state
TR=$(make_transcript "test-fleet")
echo "  test: SLEEPWALKER_FLEET env override works"
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"x","prompt":"y"}' "session-6" "/nonexistent")
out=$(echo "$in" | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "env override defers" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"

reset_state
TR=$(make_transcript "inbox-triage")
echo "  test: re-execution bypass allows only exact approved tool+args"
approved_args='{"prompt":"y","url":"https://x.com"}'
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"https://x.com","prompt":"y"}' "session-r1" "$TR")
out=$(echo "$in" | SLEEPWALKER_REEXECUTING=1 SLEEPWALKER_APPROVED_TOOL=WebFetch SLEEPWALKER_APPROVED_ARGS="$approved_args" SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "exact approved WebFetch re-exec allows" "allow" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue empty after exact re-exec allow" "0" "$TEST_HOME/.sleepwalker/queue.jsonl"

in=$(hook_input "PreToolUse" "WebFetch" '{"url":"https://evil.example","prompt":"y"}' "session-r2" "$TR")
out=$(echo "$in" | SLEEPWALKER_REEXECUTING=1 SLEEPWALKER_APPROVED_TOOL=WebFetch SLEEPWALKER_APPROVED_ARGS="$approved_args" SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "different red call during re-exec still defers" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue has mismatched re-exec red call" "1" "$TEST_HOME/.sleepwalker/queue.jsonl"

# ========================================================================
# budget-cap.sh tests
# ========================================================================
echo
echo "==> budget-cap.sh — PostToolUse format"

reset_state
TR=$(make_transcript "test-fleet")

echo "  test: under budget returns empty/continue"
in=$(hook_input "PostToolUse" "Read" '{}' "sess-b1" "$TR" "small response")
out=$(echo "$in" | "$HOOKS_DIR/sleepwalker-budget-cap.sh")
# Empty {} or no continue:false means continue
HAS_STOP=$(echo "$out" | jq -r '.continue // "true"')
assert_eq "small response continues" "true" "$HAS_STOP"

reset_state
TR=$(make_transcript "test-fleet")
echo "  test: over budget returns continue=false"
big=$(printf 'x%.0s' {1..10000})
in=$(hook_input "PostToolUse" "Read" '{}' "sess-b2" "$TR" "$big")
out=$(echo "$in" | "$HOOKS_DIR/sleepwalker-budget-cap.sh")
assert_eq "over-budget returns continue=false" "false" "$(echo "$out" | jq -r '.continue')"
assert_contains "stopReason mentions budget" "budget" "$(echo "$out" | jq -r '.stopReason')"
assert_contains "audit logs budget_exceeded event" "budget_exceeded" "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl" 2>/dev/null || echo '')"

reset_state
echo "  test: NOT a sleepwalker context → no-op (no budget tracking)"
NOT_SLEEPWALKER="$TEST_HOME/normal.jsonl"
echo '{"role":"system","content":"You are Claude Code."}' > "$NOT_SLEEPWALKER"
in=$(hook_input "PostToolUse" "Read" '{}' "sess-bx" "$NOT_SLEEPWALKER" "small")
out=$(echo "$in" | "$HOOKS_DIR/sleepwalker-budget-cap.sh")
assert_eq "non-sleepwalker returns empty {}" "true" "$(echo "$out" | jq -r '.continue // "true"')"

# ========================================================================
# audit-log.sh tests
# ========================================================================
echo
echo "==> audit-log.sh"

reset_state
TR=$(make_transcript "inbox-triage")
echo "  test: appends an entry per tool call"
in=$(hook_input "PostToolUse" "Read" '{"file_path":"/tmp/x"}' "sess-a1" "$TR" "hello")
echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
assert_file_lines "audit log has 3 entries" "3" "$TEST_HOME/.sleepwalker/audit.jsonl"

reset_state
TR=$(make_transcript "inbox-triage")
echo "  test: entries are valid JSON with required fields"
in=$(hook_input "PostToolUse" "Edit" '{"file_path":"/tmp/y"}' "sess-a2" "$TR" "done")
echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
entry=$(head -n1 "$TEST_HOME/.sleepwalker/audit.jsonl")
assert_eq "audit fleet field" "inbox-triage" "$(echo "$entry" | jq -r '.fleet')"
assert_eq "audit tool field" "Edit" "$(echo "$entry" | jq -r '.tool')"
assert_eq "audit session field" "sess-a2" "$(echo "$entry" | jq -r '.session')"

reset_state
echo "  test: NOT a sleepwalker context → no audit entry"
NOT_SLEEPWALKER="$TEST_HOME/normal.jsonl"
echo '{"role":"system","content":"You are Claude Code."}' > "$NOT_SLEEPWALKER"
in=$(hook_input "PostToolUse" "Read" '{}' "sess-ax" "$NOT_SLEEPWALKER" "result")
echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
assert_file_lines "no audit entry for non-sleepwalker" "0" "$TEST_HOME/.sleepwalker/audit.jsonl"

# ========================================================================
# _detect_fleet.sh tests
# ========================================================================
echo
echo "==> _detect_fleet.sh"

reset_state
TR=$(make_transcript "morning-brief")
echo "  test: extracts fleet from transcript"
fleet=$("$HOOKS_DIR/_detect_fleet.sh" "session-d1" "$TR")
assert_eq "fleet extracted correctly" "morning-brief" "$fleet"

reset_state
echo "  test: returns empty for non-sleepwalker transcript"
NOT_SLEEPWALKER="$TEST_HOME/normal.jsonl"
echo '{"role":"system","content":"You are Claude Code."}' > "$NOT_SLEEPWALKER"
fleet=$("$HOOKS_DIR/_detect_fleet.sh" "session-d2" "$NOT_SLEEPWALKER")
assert_eq "empty for non-sleepwalker" "" "$fleet"

reset_state
TR=$(make_transcript "calendar-prep")
echo "  test: caches result per session"
"$HOOKS_DIR/_detect_fleet.sh" "session-d3" "$TR" >/dev/null
[ -f "$TEST_HOME/.sleepwalker/sessions/session-d3.fleet" ] && PASS=$((PASS+1)) && echo "  PASS  cache file created" || { FAIL=$((FAIL+1)); FAILURES+=("cache file not created"); echo "  FAIL  cache file not created"; }
# Returns same value from cache even if transcript missing
fleet=$("$HOOKS_DIR/_detect_fleet.sh" "session-d3" "/nonexistent")
assert_eq "cache hit returns fleet" "calendar-prep" "$fleet"

# =============================================================================
# Scenario: sleepwalker-audit-log.sh serializes concurrent audit writes (QUEU-04)
# =============================================================================
# Requires flock(1). Without it, the hook's graceful fallthrough (added
# alongside Fix 1 to keep the hook from silently failing on stock macOS)
# means 4 unlocked appends at low concurrency might "pass" without
# actually exercising the mutex — masking regressions. Skip with a clear
# message when flock is absent. Symmetric with supervisor scenarios 8+9.
if ! command -v flock >/dev/null 2>&1; then
  echo
  echo "==> scenario: serialized audit writes — SKIPPED (flock(1) not on PATH)"
  echo "    install with: brew install util-linux (or: brew install flock)"
  echo "──────────────────────────────────────"
  echo "  Results: $PASS pass / $FAIL fail / 3 skip"
  echo "    SKIP  4 concurrent audit: exactly 4 lines landed (needs flock)"
  echo "    SKIP  concurrent audit: zero malformed lines (needs flock)"
  echo "    SKIP  concurrent audit: 4 entries tagged with inbox-triage fleet (needs flock)"
  echo "──────────────────────────────────────"
  if [ $FAIL -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]}"; do echo "  - $f"; done
    exit 1
  fi
  exit 0
fi

echo
echo "==> scenario: sleepwalker-audit-log.sh serializes 4 concurrent audit writes"
reset_state
TR=$(make_transcript "inbox-triage")

# Ensure lock sidecar ready. The hook also touches it, but pre-creating keeps
# this scenario's assertions focused on the serialization contract.
LOCK_FILE="$TEST_HOME/.sleepwalker/audit.jsonl.lock"
mkdir -p "$(dirname "$LOCK_FILE")"
touch "$LOCK_FILE"

# Fire 4 parallel PostToolUse hook invocations. Each writes 1 audit line.
# Without flock, the echo "$ENTRY" >> $AUDIT_FILE appends could interleave
# (RESEARCH §1.7 measured 78% corruption at realistic payload sizes).
# With flock on the shared sidecar, exactly 4 lines land and every line is
# valid JSON.
for i in 1 2 3 4; do
  in=$(hook_input "PostToolUse" "Read" '{}' "sess-$i" "$TR" "output payload $i")
  echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null 2>&1 &
done
wait

assert_file_lines "4 concurrent audit: exactly 4 lines landed" "4" "$TEST_HOME/.sleepwalker/audit.jsonl"

# Every line valid JSON
PARSE_FAIL=0
while IFS= read -r line; do
  printf '%s' "$line" | jq -e . >/dev/null 2>&1 || PARSE_FAIL=$((PARSE_FAIL+1))
done < "$TEST_HOME/.sleepwalker/audit.jsonl"
assert_eq "concurrent audit: zero malformed lines" "0" "$PARSE_FAIL"

# Every line carries the expected fleet tag
FLEET_COUNT=$(grep -c '"fleet":"inbox-triage"' "$TEST_HOME/.sleepwalker/audit.jsonl" || true)
assert_eq "concurrent audit: 4 entries tagged with inbox-triage fleet" "4" "$FLEET_COUNT"

# =============================================================================
# Scenario: sleepwalker-audit-log.sh rotates audit.jsonl at
# SLEEPWALKER_AUDIT_MAX_BYTES cap with 3-generation retention.
# Mirrors supervisor-tests.sh scenario 13 because the two writers share
# the same rotation policy (intentionally duplicated function); this
# scenario exists to catch drift if one copy is edited without the other.
# =============================================================================
echo
echo "==> scenario: sleepwalker-audit-log.sh rotation"
reset_state
TR=$(make_transcript "inbox-triage")

# Seed the audit file with ~3KB of a token-tagged content so we can
# identify which rotated file came from which rotation pass.
seed_hook_audit() {
  local target="$1"
  local token="$2"
  : > "$target"
  local i=0
  while [ "$(wc -c < "$target" | tr -d ' ')" -lt 2500 ]; do
    printf '{"ts":"2026-04-22T00:00:%02dZ","fleet":"inbox-triage","session":"seed","tool":"Read","input":{},"output_preview":"tok-%s-%d","output_length":1}\n' \
      "$((i % 60))" "$token" "$i" >> "$target"
    i=$((i+1))
  done
}

# 1st rotation — hook receives a single tool call, trips the 2KB cap.
seed_hook_audit "$TEST_HOME/.sleepwalker/audit.jsonl" "H1"
in=$(hook_input "PostToolUse" "Read" '{"file_path":"/tmp/x"}' "sess-rot" "$TR" "rot-call-1")
echo "$in" | SLEEPWALKER_AUDIT_MAX_BYTES=2048 "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
if [ ! -f "$TEST_HOME/.sleepwalker/audit.jsonl.1" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("hook-rot 1: .1 should exist")
  echo "  FAIL  hook-rot 1: audit.jsonl.1 missing after 1st rotation"
else
  PASS=$((PASS+1)); echo "  PASS  hook-rot 1: .1 exists after 1st rotation"
fi
assert_contains "hook-rot 1: .1 holds token H1 (just rotated)" \
  '"output_preview":"tok-H1-0"' \
  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
# Fresh audit should have just the single appended event
assert_file_lines "hook-rot 1: fresh audit has 1 line (the appended event)" "1" "$TEST_HOME/.sleepwalker/audit.jsonl"

# 4 total rotations — by the end, token H1 must be dropped (3-gen cap).
for token in H2 H3 H4; do
  seed_hook_audit "$TEST_HOME/.sleepwalker/audit.jsonl" "$token"
  in=$(hook_input "PostToolUse" "Read" '{"file_path":"/tmp/x"}' "sess-rot" "$TR" "rot-${token}")
  echo "$in" | SLEEPWALKER_AUDIT_MAX_BYTES=2048 "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
done
# After 4th rotation: .1=H4, .2=H3, .3=H2 — H1 GONE.
assert_contains "hook-rot 4: .1 holds H4" '"output_preview":"tok-H4-0"' \
  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl.1" 2>/dev/null || echo '')"
assert_contains "hook-rot 4: .2 holds H3" '"output_preview":"tok-H3-0"' \
  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl.2" 2>/dev/null || echo '')"
assert_contains "hook-rot 4: .3 holds H2" '"output_preview":"tok-H2-0"' \
  "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl.3" 2>/dev/null || echo '')"
if grep -q '"output_preview":"tok-H1-' "$TEST_HOME/.sleepwalker/audit.jsonl" \
                                        "$TEST_HOME/.sleepwalker/audit.jsonl.1" \
                                        "$TEST_HOME/.sleepwalker/audit.jsonl.2" \
                                        "$TEST_HOME/.sleepwalker/audit.jsonl.3" 2>/dev/null; then
  FAIL=$((FAIL+1)); FAILURES+=("hook-rot 4: H1 must be dropped")
  echo "  FAIL  hook-rot 4: oldest generation (H1) not dropped"
else
  PASS=$((PASS+1)); echo "  PASS  hook-rot 4: oldest generation (H1) dropped"
fi
if [ -f "$TEST_HOME/.sleepwalker/audit.jsonl.4" ]; then
  FAIL=$((FAIL+1)); FAILURES+=("hook-rot 4: .4 must not exist")
  echo "  FAIL  hook-rot 4: audit.jsonl.4 created (policy violation)"
else
  PASS=$((PASS+1)); echo "  PASS  hook-rot 4: no .4 (3-generation cap honored)"
fi

# Summary
echo
echo "──────────────────────────────────────"
echo "  Results: $PASS pass / $FAIL fail"
echo "──────────────────────────────────────"
if [ $FAIL -gt 0 ]; then
  echo
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
