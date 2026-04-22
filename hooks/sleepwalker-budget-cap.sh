#!/bin/bash
# Sleepwalker PostToolUse hook: enforce per-fleet token budgets.
#
# Reads tool result from stdin, increments running token count for the fleet.
# If over budget, returns continue=false to halt the agent.
#
# PostToolUse output schema:
#   {"continue": false, "stopReason": "..."} — stop the agent
#   {} — continue normally

set -euo pipefail

BUDGETS_FILE="${HOME}/.sleepwalker/budgets.json"
SETTINGS_FILE="${HOME}/.sleepwalker/settings.json"
AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "${HOME}/.sleepwalker"
touch "$LOCK_FILE"
[ ! -f "$BUDGETS_FILE" ] && echo '{}' > "$BUDGETS_FILE"

INPUT="$(cat)"
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# Detect fleet
FLEET="${SLEEPWALKER_FLEET:-}"
if [ -z "$FLEET" ]; then
  FLEET=$("$HOOK_DIR/_detect_fleet.sh" "$SESSION_ID" "$TRANSCRIPT" 2>/dev/null || echo "")
fi

# Not in sleepwalker context — silently allow
if [ -z "$FLEET" ]; then
  printf '{}\n'
  exit 0
fi

# Approximate token cost: input + output character count divided by 4
INPUT_LEN=$(echo "$INPUT" | jq -r '.tool_input // {} | tostring | length')
OUTPUT_LEN=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // "" | tostring | length')
TOKENS_USED=$(( (INPUT_LEN + OUTPUT_LEN) / 4 ))

# Default budget = 50000
BUDGET=$(jq -r --arg f "$FLEET" '.budgets[$f] // 50000' "$SETTINGS_FILE" 2>/dev/null || echo 50000)

# Increment per-session budget (so multiple sessions of the same fleet get fresh budgets)
KEY="${FLEET}__${SESSION_ID}"
TOTAL=$(jq -r --arg k "$KEY" '.[$k] // 0' "$BUDGETS_FILE")
TOTAL=$((TOTAL + TOKENS_USED))
TMP=$(mktemp)
jq --arg k "$KEY" --argjson t "$TOTAL" '.[$k] = $t' "$BUDGETS_FILE" > "$TMP" && mv "$TMP" "$BUDGETS_FILE"

if [ "$TOTAL" -gt "$BUDGET" ]; then
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ENTRY=$(jq -nc --arg ts "$TS" --arg fleet "$FLEET" --arg session "$SESSION_ID" \
    --argjson total "$TOTAL" --argjson budget "$BUDGET" \
    '{ts:$ts,fleet:$fleet,event:"budget_exceeded",total:$total,budget:$budget,session:$session}')
  # Graceful fallthrough on missing flock(1) — same rationale as
  # sleepwalker-audit-log.sh: flock is not shipped on stock macOS, so
  # strict failure would turn a missing binary into a silent Claude Code
  # hook error every time a fleet crossed its token budget.
  (
    flock -w 5 -x 200 || true
    echo "$ENTRY" >> "$AUDIT_FILE"
  ) 200>"$LOCK_FILE"
  jq -nc --arg reason "Sleepwalker budget exceeded for $FLEET ($TOTAL/$BUDGET tokens)" \
    '{continue:false, stopReason:$reason}'
  exit 0
fi

printf '{}\n'
