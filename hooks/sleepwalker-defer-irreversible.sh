#!/bin/bash
# Sleepwalker PreToolUse hook: defer irreversible actions during scheduled-task runs.
#
# Reads JSON tool-call info from stdin, returns a permission decision on stdout
# in the format Claude Code expects:
#   {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow|deny|ask|defer"}}
#
# Bails out fast (returns allow) if the current session is not a sleepwalker
# scheduled task, so it does not interfere with interactive sessions.
#
# Defer policy (configurable per-fleet via ~/.sleepwalker/settings.json):
#   strict   — defer all yellow + red
#   balanced — allow yellow, defer red (default)
#   yolo     — allow everything

set -euo pipefail

QUEUE_FILE="${HOME}/.sleepwalker/queue.jsonl"
QUEUE_LOCK_FILE="${HOME}/.sleepwalker/queue.jsonl.lock"
SETTINGS_FILE="${HOME}/.sleepwalker/settings.json"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

allow() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'
  exit 0
}

# --- Read input ---
INPUT="$(cat)"
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

# --- Re-execution bypass ---
# sleepwalker-execute sets these env vars when re-running an approved task.
# Only the exact approved tool+args bypasses deferral; any other tool call in
# that same Claude session still flows through the normal safety classifier.
if [ "${SLEEPWALKER_REEXECUTING:-}" = "1" ]; then
  APPROVED_TOOL="${SLEEPWALKER_APPROVED_TOOL:-}"
  APPROVED_ARGS="${SLEEPWALKER_APPROVED_ARGS:-}"
  if [ -n "$APPROVED_TOOL" ] && [ -n "$APPROVED_ARGS" ] && [ "$TOOL_NAME" = "$APPROVED_TOOL" ]; then
    TOOL_INPUT_CANON=$(echo "$TOOL_INPUT" | jq -S -c . 2>/dev/null || echo "")
    APPROVED_ARGS_CANON=$(echo "$APPROVED_ARGS" | jq -S -c . 2>/dev/null || echo "")
    if [ -n "$TOOL_INPUT_CANON" ] && [ "$TOOL_INPUT_CANON" = "$APPROVED_ARGS_CANON" ]; then
      allow
    fi
  fi
fi

# --- Detect fleet context ---
# SLEEPWALKER_FLEET env override (used by tests + manual invocation)
FLEET="${SLEEPWALKER_FLEET:-}"
if [ -z "$FLEET" ]; then
  FLEET=$("$HOOK_DIR/_detect_fleet.sh" "$SESSION_ID" "$TRANSCRIPT" 2>/dev/null || echo "")
fi
[ -z "$FLEET" ] && allow

# --- Determine sleep window ---
mkdir -p "${HOME}/.sleepwalker"
  touch "$QUEUE_FILE"
  touch "$QUEUE_LOCK_FILE"
SLEEP_START=$(jq -r '.sleep_window.start_hour // 23' "$SETTINGS_FILE" 2>/dev/null || echo 23)
SLEEP_END=$(jq -r '.sleep_window.end_hour // 7' "$SETTINGS_FILE" 2>/dev/null || echo 7)
HOUR=$(date +%H | sed 's/^0//'); HOUR=${HOUR:-0}
if [ "$SLEEP_START" -gt "$SLEEP_END" ]; then
  if [ "$HOUR" -ge "$SLEEP_START" ] || [ "$HOUR" -lt "$SLEEP_END" ]; then IN_SLEEP=1; else IN_SLEEP=0; fi
else
  if [ "$HOUR" -ge "$SLEEP_START" ] && [ "$HOUR" -lt "$SLEEP_END" ]; then IN_SLEEP=1; else IN_SLEEP=0; fi
fi

# Outside sleep window AND not explicit overnight mode → behave as interactive (allow all)
if [ "$IN_SLEEP" -eq 0 ] && [ "${SLEEPWALKER_MODE:-auto}" != "overnight" ]; then
  allow
fi

# --- Get policy ---
POLICY=$(jq -r --arg f "$FLEET" '.policies[$f] // "balanced"' "$SETTINGS_FILE" 2>/dev/null || echo "balanced")
if [ "$POLICY" = "yolo" ]; then allow; fi

# --- Classify reversibility ---
REVERSIBILITY="green"
case "$TOOL_NAME" in
  Read|Glob|Grep|WebSearch|TodoWrite|NotebookRead) REVERSIBILITY="green" ;;
  Edit|Write|NotebookEdit) REVERSIBILITY="yellow" ;;
  WebFetch) REVERSIBILITY="red" ;;
  Bash)
    CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
    case "$CMD" in
      *"rm "*|*"rm -"*) REVERSIBILITY="red" ;;
      *"git push"*|*"git reset --hard"*|*"git checkout --"*|*"git clean -f"*) REVERSIBILITY="red" ;;
      *"gh pr create"*|*"gh pr review"*|*"gh issue close"*|*"gh release create"*) REVERSIBILITY="red" ;;
      *"curl -X POST"*|*"curl -X PUT"*|*"curl -X DELETE"*) REVERSIBILITY="red" ;;
      *"npm publish"*|*"pnpm publish"*|*"yarn publish"*|*"cargo publish"*|*"pip install --user"*) REVERSIBILITY="red" ;;
      *"osascript"*"send"*|*"osascript"*"delete"*) REVERSIBILITY="red" ;;
      *"mv "*|*"cp "*|*"mkdir "*|*"git add"*|*"git commit"*|*"git stash"*|*"git worktree"*) REVERSIBILITY="yellow" ;;
      *)
        case "$CMD" in
          ls*|cat*|head*|tail*|wc*|find*|grep*|rg*|fd*|du*|df*|stat*|file*|which*|echo*|pwd|date*|env*|jq*|git\ log*|git\ status*|git\ diff*|git\ branch*|git\ show*|gh\ pr\ list*|gh\ issue\ list*|gh\ search*) REVERSIBILITY="green" ;;
          *) REVERSIBILITY="yellow" ;;
        esac
        ;;
    esac
    ;;
  *) REVERSIBILITY="yellow" ;;
esac

# --- Decision ---
DECISION="allow"
if [ "$POLICY" = "strict" ] && [ "$REVERSIBILITY" != "green" ]; then DECISION="defer"; fi
if [ "$POLICY" = "balanced" ] && [ "$REVERSIBILITY" = "red" ]; then DECISION="defer"; fi

if [ "$DECISION" = "defer" ]; then
  ULID="q_$(date +%s%N | shasum -a 256 | head -c 16)"
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ENTRY=$(jq -nc \
    --arg id "$ULID" --arg ts "$TS" --arg fleet "$FLEET" --arg tool "$TOOL_NAME" \
    --argjson args "$TOOL_INPUT" --arg rev "$REVERSIBILITY" --arg session "$SESSION_ID" \
    '{id:$id,ts:$ts,fleet:$fleet,tool:$tool,args:$args,reversibility:$rev,session:$session,status:"pending"}')
  # Graceful fallthrough on missing flock(1) — same rationale as
  # sleepwalker-audit-log.sh: flock is not shipped on stock macOS, so
  # strict failure would turn a missing binary into a silent Claude Code
  # hook error on every deferred tool call. Symmetric with the supervisor.
  (
    flock -w 5 -x 200 || true
    echo "$ENTRY" >> "$QUEUE_FILE"
  ) 200>"$QUEUE_LOCK_FILE"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"defer"},"reason":"Sleepwalker: queued for morning review"}\n'
else
  allow
fi
