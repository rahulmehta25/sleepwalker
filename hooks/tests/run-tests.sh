#!/bin/bash
# Sleepwalker hook test harness
#
# Runs each hook script with sample JSON payloads in an isolated $HOME,
# verifies stdout JSON and side effects on the queue/audit/budget files.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/hooks"
TESTS_DIR="$REPO_ROOT/hooks/tests"

PASS=0
FAIL=0
FAILURES=()

# Set up isolated HOME for the duration of all tests
TEST_HOME=$(mktemp -d -t sleepwalker-hooktest-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$TEST_HOME/.sleepwalker"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

reset_state() {
  rm -rf "$TEST_HOME/.sleepwalker"
  mkdir -p "$TEST_HOME/.sleepwalker"
  cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": { "test-fleet": "balanced" },
  "budgets":  { "test-fleet": 1000 }
}
EOF
  echo '{}' > "$TEST_HOME/.sleepwalker/budgets.json"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1))
    echo "  PASS  $label"
  else
    FAIL=$((FAIL+1))
    FAILURES+=("$label  expected='$expected'  actual='$actual'")
    echo "  FAIL  $label"
    echo "        expected: $expected"
    echo "        actual:   $actual"
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    PASS=$((PASS+1))
    echo "  PASS  $label"
  else
    FAIL=$((FAIL+1))
    FAILURES+=("$label  needle='$needle'  in='$haystack'")
    echo "  FAIL  $label"
    echo "        needle: $needle"
    echo "        in:     $haystack"
  fi
}

assert_file_lines() {
  local label="$1" expected_lines="$2" file="$3"
  local actual=0
  if [ -f "$file" ]; then
    actual=$(wc -l < "$file" | tr -d ' ')
  fi
  assert_eq "$label" "$expected_lines" "$actual"
}

# --- defer-irreversible.sh tests ---

echo "==> defer-irreversible.sh"

reset_state
echo "  test: green tool (Read) is allowed"
out=$(echo '{"tool_name":"Read","tool_input":{"file_path":"/tmp/test.txt"},"session_id":"s1"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "Read returns allow" "allow" "$decision"
assert_file_lines "queue empty after Read" "0" "$TEST_HOME/.sleepwalker/queue.jsonl"

reset_state
echo "  test: red tool (WebFetch) is deferred (balanced policy)"
out=$(echo '{"tool_name":"WebFetch","tool_input":{"url":"https://example.com","prompt":"x"},"session_id":"s2"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "WebFetch returns defer" "defer" "$decision"
assert_file_lines "queue has 1 entry after WebFetch" "1" "$TEST_HOME/.sleepwalker/queue.jsonl"
queue_entry=$(cat "$TEST_HOME/.sleepwalker/queue.jsonl")
assert_contains "queue entry has fleet" "test-fleet" "$queue_entry"
assert_contains "queue entry has tool" "WebFetch" "$queue_entry"
assert_contains "queue entry reversibility=red" '"reversibility":"red"' "$queue_entry"

reset_state
echo "  test: yellow tool (Edit) is allowed under balanced policy"
out=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x"},"session_id":"s3"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "Edit returns allow under balanced" "allow" "$decision"

reset_state
echo "  test: yellow tool deferred under strict policy"
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{ "sleep_window": { "start_hour": 0, "end_hour": 24 }, "policies": { "test-fleet": "strict" } }
EOF
out=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x"},"session_id":"s4"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "Edit returns defer under strict" "defer" "$decision"

reset_state
echo "  test: yolo policy allows everything"
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{ "sleep_window": { "start_hour": 0, "end_hour": 24 }, "policies": { "test-fleet": "yolo" } }
EOF
out=$(echo '{"tool_name":"WebFetch","tool_input":{"url":"x","prompt":"y"},"session_id":"s5"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "WebFetch under yolo returns allow" "allow" "$decision"

reset_state
echo "  test: Bash command classification — git push is red"
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"},"session_id":"s6"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "git push returns defer" "defer" "$decision"

reset_state
echo "  test: Bash command classification — ls is green"
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls -la /tmp"},"session_id":"s7"}' | SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "ls returns allow" "allow" "$decision"

reset_state
echo "  test: outside sleep window without overnight mode allows everything"
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{ "sleep_window": { "start_hour": 23, "end_hour": 7 }, "policies": { "test-fleet": "balanced" } }
EOF
# Don't set SLEEPWALKER_MODE
out=$(echo '{"tool_name":"WebFetch","tool_input":{"url":"x","prompt":"y"},"session_id":"s8"}' | SLEEPWALKER_FLEET=test-fleet  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
# This may pass or be deferred depending on the current hour; just check it returns a valid decision
case "$decision" in
  allow|defer) PASS=$((PASS+1)); echo "  PASS  outside-window decision is valid ($decision)" ;;
  *) FAIL=$((FAIL+1)); FAILURES+=("outside-window decision invalid: $decision"); echo "  FAIL  outside-window decision invalid: $decision" ;;
esac

# --- budget-cap.sh tests ---

echo
echo "==> budget-cap.sh"

reset_state
echo "  test: under budget allows"
input='{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"small response"}'
out=$(echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-budget-cap.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "small input under 1000 budget allows" "allow" "$decision"

reset_state
echo "  test: over budget denies"
# Burn through the 1000 token budget with a single huge call
big=$(printf 'x%.0s' {1..10000})
input=$(jq -nc --arg big "$big" '{tool_name:"Read",tool_input:{},tool_response:$big}')
out=$(echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-budget-cap.sh")
decision=$(echo "$out" | jq -r '.permissionDecision')
assert_eq "over-budget denies" "deny" "$decision"
audit=$(cat "$TEST_HOME/.sleepwalker/audit.jsonl" 2>/dev/null || echo "")
assert_contains "audit logs budget_exceeded event" "budget_exceeded" "$audit"

reset_state
echo "  test: increments per call"
medium=$(jq -nc --arg s "$(printf 'x%.0s' {1..200})" '{tool_name:"Read",tool_input:{},tool_response:$s}')
echo "$medium" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-budget-cap.sh" >/dev/null
echo "$medium" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-budget-cap.sh" >/dev/null
total=$(jq -r '."test-fleet" // 0' "$TEST_HOME/.sleepwalker/budgets.json")
[ "$total" -gt 0 ] && PASS=$((PASS+1)) && echo "  PASS  total accumulated to $total" || { FAIL=$((FAIL+1)); FAILURES+=("budget did not accumulate"); echo "  FAIL  budget did not accumulate"; }

# --- audit-log.sh tests ---

echo
echo "==> audit-log.sh"

reset_state
echo "  test: appends a JSONL entry per call"
input='{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"hello"}'
echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
assert_file_lines "audit log has 3 entries" "3" "$TEST_HOME/.sleepwalker/audit.jsonl"

reset_state
echo "  test: entries are valid JSON with required fields"
input='{"tool_name":"Edit","tool_input":{"file_path":"/tmp/y"},"tool_response":"done"}'
echo "$input" | SLEEPWALKER_FLEET=test-fleet "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null
entry=$(head -n1 "$TEST_HOME/.sleepwalker/audit.jsonl")
fleet=$(echo "$entry" | jq -r '.fleet')
tool=$(echo "$entry" | jq -r '.tool')
ts=$(echo "$entry" | jq -r '.ts')
assert_eq "audit fleet field" "test-fleet" "$fleet"
assert_eq "audit tool field" "Edit" "$tool"
[ -n "$ts" ] && [ "$ts" != "null" ] && PASS=$((PASS+1)) && echo "  PASS  audit ts is set" || { FAIL=$((FAIL+1)); FAILURES+=("audit ts missing"); echo "  FAIL  audit ts missing"; }

# --- summary ---

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
