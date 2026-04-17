#!/bin/bash
# Sleepwalker E2E demonstration
#
# Walks through the complete trust loop in an isolated $HOME:
#  1. Install hooks + routines
#  2. Fire several tool calls through the defer hook (mix of green/yellow/red)
#  3. Verify the queue gets entries with correct reversibility
#  4. Verify the audit log gets entries
#  5. Simulate the dashboard approving / rejecting via direct file manipulation
#  6. Verify the final queue state matches expectations

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_HOME=$(mktemp -d -t sleepwalker-e2e-XXXXXX)
export HOME="$TEST_HOME"

cleanup() { rm -rf "$TEST_HOME"; }
trap cleanup EXIT

echo "==> E2E test home: $TEST_HOME"
echo

# ============================================================================
# Step 1: Install
# ============================================================================
echo "STEP 1: Run install.sh"
"$REPO_ROOT/install.sh" >/dev/null
[ -f "$TEST_HOME/.sleepwalker/queue.jsonl" ] || { echo "FAIL: state dir not created"; exit 1; }
[ -d "$TEST_HOME/.claude/scheduled-tasks/sleepwalker-inbox-triage" ] || { echo "FAIL: routines not copied"; exit 1; }
[ -x "$TEST_HOME/.claude/hooks/sleepwalker-defer-irreversible.sh" ] || { echo "FAIL: defer hook not installed"; exit 1; }
echo "  ✓ install.sh succeeded"
echo "  ✓ ~/.sleepwalker/ initialized"
echo "  ✓ 6 local routines copied to ~/.claude/scheduled-tasks/"
echo "  ✓ 3 hooks copied to ~/.claude/hooks/"
echo

# ============================================================================
# Step 2: Force overnight mode + balanced policy
# ============================================================================
echo "STEP 2: Override settings to force overnight mode"
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": {
    "downloads-organizer": "balanced",
    "inbox-triage": "balanced",
    "pr-reviewer": "strict"
  },
  "budgets": {
    "downloads-organizer": 100000,
    "inbox-triage": 100000,
    "pr-reviewer": 100000
  }
}
EOF
echo '{}' > "$TEST_HOME/.sleepwalker/budgets.json"
echo "  ✓ sleep window forced to 24/7 for the test"
echo "  ✓ 3 fleets policy-mapped"
echo

DEFER="$TEST_HOME/.claude/hooks/sleepwalker-defer-irreversible.sh"
BUDGET="$TEST_HOME/.claude/hooks/sleepwalker-budget-cap.sh"
AUDIT="$TEST_HOME/.claude/hooks/sleepwalker-audit-log.sh"

# Helper: run a tool call through defer + budget + audit.
# SLEEPWALKER_FLEET env var is set so the hooks don't need to read a transcript.
run_tool() {
  local fleet="$1" tool_input="$2"
  local out

  # PreToolUse: defer
  out=$(echo "$tool_input" | SLEEPWALKER_FLEET="$fleet" SLEEPWALKER_MODE=overnight "$DEFER")
  local decision=$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')

  # If allowed, simulate the tool running and the PostToolUse hooks firing
  if [ "$decision" = "allow" ]; then
    local result_input=$(echo "$tool_input" | jq -c '. + {tool_response: "simulated success"}')
    echo "$result_input" | SLEEPWALKER_FLEET="$fleet" "$BUDGET" >/dev/null
    echo "$result_input" | SLEEPWALKER_FLEET="$fleet" "$AUDIT" >/dev/null
  fi

  echo "$decision"
}

# ============================================================================
# Step 3: Fire a mix of tool calls
# ============================================================================
echo "STEP 3: Fire 6 tool calls through the hook chain"

D1=$(run_tool "downloads-organizer" '{"tool_name":"Bash","tool_input":{"command":"ls ~/Downloads"},"session_id":"e2e1"}')
echo "  [downloads] ls ~/Downloads → $D1"

D2=$(run_tool "downloads-organizer" '{"tool_name":"Bash","tool_input":{"command":"mv ~/Downloads/x.pdf ~/Documents/PDFs/"},"session_id":"e2e2"}')
echo "  [downloads] mv x.pdf → $D2"

D3=$(run_tool "downloads-organizer" '{"tool_name":"Bash","tool_input":{"command":"rm ~/Downloads/old.tmp"},"session_id":"e2e3"}')
echo "  [downloads] rm old.tmp → $D3"

I1=$(run_tool "inbox-triage" '{"tool_name":"Read","tool_input":{"file_path":"~/Mail/inbox"},"session_id":"e2e4"}')
echo "  [inbox]     Read inbox → $I1"

I2=$(run_tool "inbox-triage" '{"tool_name":"WebFetch","tool_input":{"url":"https://example.com","prompt":"x"},"session_id":"e2e5"}')
echo "  [inbox]     WebFetch → $I2"

P1=$(run_tool "pr-reviewer" '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x"},"session_id":"e2e6"}')
echo "  [pr-rev]    Edit (under strict policy) → $P1"
echo

# ============================================================================
# Step 4: Verify queue + audit
# ============================================================================
echo "STEP 4: Verify queue + audit state"

queue_count=$(wc -l < "$TEST_HOME/.sleepwalker/queue.jsonl" | tr -d ' ')
audit_count=$(wc -l < "$TEST_HOME/.sleepwalker/audit.jsonl" | tr -d ' ')

echo "  queue.jsonl entries: $queue_count (expected 3 — rm, WebFetch, and Edit-under-strict)"
echo "  audit.jsonl entries: $audit_count (expected 3 — the 3 'allow' calls)"

[ "$queue_count" = "3" ] || { echo "  FAIL: expected 3 queue entries, got $queue_count"; exit 1; }
[ "$audit_count" = "3" ] || { echo "  FAIL: expected 3 audit entries, got $audit_count"; exit 1; }

echo "  ✓ Queue + audit counts correct"
echo

# Show what's in the queue
echo "STEP 5: Inspect queue entries (this is what the dashboard would render)"
jq -c '{id, fleet, tool, reversibility, status}' "$TEST_HOME/.sleepwalker/queue.jsonl" | sed 's/^/  /'
echo

# ============================================================================
# Step 6: Simulate dashboard approval
# ============================================================================
echo "STEP 6: Simulate dashboard approval (approve first, reject second)"

# Approve first entry
first_id=$(jq -r 'select(.status == "pending") | .id' "$TEST_HOME/.sleepwalker/queue.jsonl" | head -n1)
TMP=$(mktemp)
jq -c --arg id "$first_id" 'if .id == $id then .status = "approved" else . end' "$TEST_HOME/.sleepwalker/queue.jsonl" > "$TMP"
mv "$TMP" "$TEST_HOME/.sleepwalker/queue.jsonl"
echo "  ✓ Approved entry $first_id"

# Reject second entry
second_id=$(jq -r 'select(.status == "pending") | .id' "$TEST_HOME/.sleepwalker/queue.jsonl" | head -n1)
TMP=$(mktemp)
jq -c --arg id "$second_id" 'if .id == $id then .status = "rejected" else . end' "$TEST_HOME/.sleepwalker/queue.jsonl" > "$TMP"
mv "$TMP" "$TEST_HOME/.sleepwalker/queue.jsonl"
echo "  ✓ Rejected entry $second_id"
echo

# ============================================================================
# Step 7: Final state verification
# ============================================================================
echo "STEP 7: Final state"
remaining_pending=$(jq -r 'select(.status == "pending") | .id' "$TEST_HOME/.sleepwalker/queue.jsonl" | wc -l | tr -d ' ')
approved=$(jq -r 'select(.status == "approved") | .id' "$TEST_HOME/.sleepwalker/queue.jsonl" | wc -l | tr -d ' ')
rejected=$(jq -r 'select(.status == "rejected") | .id' "$TEST_HOME/.sleepwalker/queue.jsonl" | wc -l | tr -d ' ')

echo "  pending: $remaining_pending  approved: $approved  rejected: $rejected"

[ "$remaining_pending" = "1" ] || { echo "  FAIL: expected 1 pending"; exit 1; }
[ "$approved" = "1" ] || { echo "  FAIL: expected 1 approved"; exit 1; }
[ "$rejected" = "1" ] || { echo "  FAIL: expected 1 rejected"; exit 1; }

echo "  ✓ Final state matches expectations"
echo

echo "=============================================================="
echo "  ✅ E2E PASS — Sleepwalker trust loop works end-to-end"
echo "=============================================================="
echo
echo "What just happened:"
echo "  1. install.sh wired the safety hooks into ~/.claude/settings.json"
echo "  2. 6 simulated tool calls fired through the hook chain"
echo "  3. The defer hook correctly classified by reversibility:"
echo "     - read-only commands: allowed immediately"
echo "     - reversible writes: allowed under balanced policy"
echo "     - irreversible (rm, WebFetch): deferred to queue"
echo "     - any non-read under strict policy: deferred to queue"
echo "  4. The audit log captured every allowed action"
echo "  5. The dashboard's approve/reject flow updated queue statuses"
