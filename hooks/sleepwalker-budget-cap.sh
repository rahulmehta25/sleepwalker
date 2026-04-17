#!/bin/bash
# Sleepwalker PostToolUse hook: enforce per-fleet token budgets
#
# Reads tool result from stdin, increments running token count for the fleet,
# halts the agent (deny + reason) if over budget.

set -euo pipefail

BUDGETS_FILE="${HOME}/.sleepwalker/budgets.json"
SETTINGS_FILE="${HOME}/.sleepwalker/settings.json"
mkdir -p "${HOME}/.sleepwalker"

# Initialize budgets file if missing
if [ ! -f "$BUDGETS_FILE" ]; then
  echo '{}' > "$BUDGETS_FILE"
fi

# Read hook input
INPUT="$(cat)"

FLEET="${SLEEPWALKER_FLEET:-unknown}"

# Approximate tokens used by this tool call (rough heuristic; refined later)
# Sum input + output character counts / 4
INPUT_LEN=$(echo "$INPUT" | jq -r '.tool_input // {} | tostring | length')
OUTPUT_LEN=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // "" | tostring | length')
TOKENS_USED=$(( (INPUT_LEN + OUTPUT_LEN) / 4 ))

# Get budget for this fleet (default 50000)
BUDGET=$(jq -r --arg f "$FLEET" '.budgets[$f] // 50000' "$SETTINGS_FILE" 2>/dev/null || echo 50000)

# Increment running total
TOTAL=$(jq -r --arg f "$FLEET" '.[$f] // 0' "$BUDGETS_FILE")
TOTAL=$((TOTAL + TOKENS_USED))

# Save updated total
TMP=$(mktemp)
jq --arg f "$FLEET" --argjson t "$TOTAL" '.[$f] = $t' "$BUDGETS_FILE" > "$TMP"
mv "$TMP" "$BUDGETS_FILE"

# Check budget
if [ "$TOTAL" -gt "$BUDGET" ]; then
  echo "{\"permissionDecision\":\"deny\",\"reason\":\"Sleepwalker: fleet '$FLEET' exceeded token budget ($TOTAL/$BUDGET)\"}"
  # Also append to audit
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "{\"ts\":\"$TS\",\"fleet\":\"$FLEET\",\"event\":\"budget_exceeded\",\"total\":$TOTAL,\"budget\":$BUDGET}" >> "${HOME}/.sleepwalker/audit.jsonl"
  exit 0
fi

# Continue
echo '{"permissionDecision":"allow"}'
