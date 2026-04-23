#!/bin/bash
# Sleepwalker PostToolUse hook: append every tool call from a sleepwalker
# session to the audit log.
#
# Bails out (no-op) if the current session is not a sleepwalker context.

set -euo pipefail

AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "${HOME}/.sleepwalker"
touch "$AUDIT_FILE"
touch "$LOCK_FILE"

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

# Size-based rotation: identical policy to bin/sleepwalker-run-cli's
# _audit_rotate_if_needed. Runs inside the flock (below) so concurrent
# writers cannot both observe "over cap" and both rotate. Keeping two
# copies of this function is the cost we pay to avoid a third shell
# script the supervisor-staging.ts path would have to ship — when
# updating one copy, update the other.
_audit_rotate_if_needed() {
  local max_bytes size
  max_bytes="${SLEEPWALKER_AUDIT_MAX_BYTES:-10485760}"  # 10 MB default
  [ -f "$AUDIT_FILE" ] || return 0
  size=$(wc -c < "$AUDIT_FILE" 2>/dev/null | tr -d ' ')
  [ "${size:-0}" -gt "$max_bytes" ] || return 0
  [ -f "${AUDIT_FILE}.3" ] && rm -f "${AUDIT_FILE}.3"
  [ -f "${AUDIT_FILE}.2" ] && mv -f "${AUDIT_FILE}.2" "${AUDIT_FILE}.3"
  [ -f "${AUDIT_FILE}.1" ] && mv -f "${AUDIT_FILE}.1" "${AUDIT_FILE}.2"
  mv -f "$AUDIT_FILE" "${AUDIT_FILE}.1"
  touch "$AUDIT_FILE"
}

# QUEU-04: flock-wrap the append — serializes against bin/sleepwalker-run-cli's
# audit_emit writing to the same ~/.sleepwalker/audit.jsonl. Shared sidecar
# at $LOCK_FILE makes this ONE mutex across both writers. See
# .planning/codebase/CONCERNS.md §concurrent JSONL race for the v0.1
# background the flock closes.
#
# Graceful fallthrough (|| true) mirrors bin/sleepwalker-run-cli's audit_emit:
# flock(1) is not shipped on stock macOS (users get it only via `brew install
# util-linux`), so strict failure would turn a missing binary into a silent
# Claude Code hook error on every PostToolUse — worse than the narrow race
# window the lock was closing. The race is already accepted by the supervisor
# side of the shared mutex; accepting it here keeps the two writers symmetric.
(
  flock -w 5 -x 200 || true
  _audit_rotate_if_needed
  echo "$ENTRY" >> "$AUDIT_FILE"
) 200>"$LOCK_FILE"

printf '{}\n'
