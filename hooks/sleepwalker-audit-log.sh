#!/bin/bash
# Sleepwalker PostToolUse hook: append every tool call from a sleepwalker
# session to the audit log.
#
# Bails out (no-op) if the current session is not a sleepwalker context.

set -euo pipefail

AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "${HOME}/.sleepwalker"
touch "$AUDIT_FILE"

INPUT="$(cat)"
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')

FLEET="${SLEEPWALKER_FLEET:-}"
if [ -z "$FLEET" ]; then
  FLEET=$("$HOOK_DIR/_detect_fleet.sh" "$SESSION_ID" "$TRANSCRIPT" 2>/dev/null || echo "")
fi

if [ -z "$FLEET" ]; then
  printf '{}\n'
  exit 0
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -c '.tool_input // {}')
OUTPUT_PREVIEW=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // ""' | head -c 500)
OUTPUT_LEN=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // ""' | wc -c | tr -d ' ')

ENTRY=$(jq -nc \
  --arg ts "$TS" \
  --arg fleet "$FLEET" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --argjson input "$TOOL_INPUT_JSON" \
  --arg out_preview "$OUTPUT_PREVIEW" \
  --argjson out_len "$OUTPUT_LEN" \
  '{ts:$ts,fleet:$fleet,session:$session,tool:$tool,input:$input,output_preview:$out_preview,output_length:$out_len}')

echo "$ENTRY" >> "$AUDIT_FILE"

printf '{}\n'
