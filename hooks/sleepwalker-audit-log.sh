#!/bin/bash
# Sleepwalker PostToolUse hook: append every tool call to the audit log
#
# Reads tool result from stdin, writes a structured JSONL entry.

set -euo pipefail

AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
mkdir -p "${HOME}/.sleepwalker"
touch "$AUDIT_FILE"

# Read hook input
INPUT="$(cat)"

FLEET="${SLEEPWALKER_FLEET:-unknown}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -c '.tool_input // {}')

# Truncate output for storage (full output stays in Claude session log)
OUTPUT_PREVIEW=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // ""' | head -c 500)
OUTPUT_LEN=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // ""' | wc -c | tr -d ' ')

# Build audit entry
ENTRY=$(jq -nc \
  --arg ts "$TS" \
  --arg fleet "$FLEET" \
  --arg tool "$TOOL_NAME" \
  --argjson input "$TOOL_INPUT_JSON" \
  --arg out_preview "$OUTPUT_PREVIEW" \
  --argjson out_len "$OUTPUT_LEN" \
  '{ts:$ts,fleet:$fleet,tool:$tool,input:$input,output_preview:$out_preview,output_length:$out_len}')

echo "$ENTRY" >> "$AUDIT_FILE"

# Always allow — this is just observability
echo '{"permissionDecision":"allow"}'
