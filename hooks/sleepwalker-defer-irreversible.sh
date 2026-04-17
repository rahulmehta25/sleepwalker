#!/bin/bash
# Sleepwalker PreToolUse hook: defer irreversible actions during sleep window
#
# Reads JSON tool-call info from stdin, returns a permission decision on stdout.
# Decisions: {"permissionDecision": "allow" | "deny" | "ask" | "defer", "reason": "..."}
#
# Defer policy (configurable per-fleet via ~/.sleepwalker/settings.json):
#   strict   — defer all yellow + red
#   balanced — allow yellow, defer red (default)
#   yolo     — allow everything (sleep window only — interactive mode always allows)

set -euo pipefail

QUEUE_FILE="${HOME}/.sleepwalker/queue.jsonl"
SETTINGS_FILE="${HOME}/.sleepwalker/settings.json"
mkdir -p "${HOME}/.sleepwalker"
touch "$QUEUE_FILE"

# Read hook input from stdin
INPUT="$(cat)"

# Extract relevant fields (use jq with safe defaults)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -c '.tool_input // {}')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Identify the fleet member from the env (set by the SKILL.md run)
FLEET="${SLEEPWALKER_FLEET:-unknown}"

# Determine sleep window
SLEEP_START_HOUR=$(jq -r '.sleep_window.start_hour // 23' "$SETTINGS_FILE" 2>/dev/null || echo 23)
SLEEP_END_HOUR=$(jq -r '.sleep_window.end_hour // 7' "$SETTINGS_FILE" 2>/dev/null || echo 7)
HOUR=$(date +%H | sed 's/^0//')
HOUR=${HOUR:-0}

if [ "$SLEEP_START_HOUR" -gt "$SLEEP_END_HOUR" ]; then
  # Window crosses midnight (e.g. 23 → 7)
  if [ "$HOUR" -ge "$SLEEP_START_HOUR" ] || [ "$HOUR" -lt "$SLEEP_END_HOUR" ]; then
    IN_SLEEP_WINDOW=1
  else
    IN_SLEEP_WINDOW=0
  fi
else
  if [ "$HOUR" -ge "$SLEEP_START_HOUR" ] && [ "$HOUR" -lt "$SLEEP_END_HOUR" ]; then
    IN_SLEEP_WINDOW=1
  else
    IN_SLEEP_WINDOW=0
  fi
fi

# Outside sleep window — interactive mode, allow everything
if [ "$IN_SLEEP_WINDOW" -eq 0 ] && [ "${SLEEPWALKER_MODE:-auto}" != "overnight" ]; then
  echo '{"permissionDecision":"allow"}'
  exit 0
fi

# Get defer policy for this fleet (default balanced)
POLICY=$(jq -r --arg f "$FLEET" '.policies[$f] // "balanced"' "$SETTINGS_FILE" 2>/dev/null || echo "balanced")

# Yolo mode allows everything
if [ "$POLICY" = "yolo" ]; then
  echo '{"permissionDecision":"allow"}'
  exit 0
fi

# Classify reversibility
REVERSIBILITY="green"
case "$TOOL_NAME" in
  Read|Glob|Grep|WebSearch|TodoWrite|NotebookRead)
    REVERSIBILITY="green"
    ;;
  Edit|Write|NotebookEdit)
    REVERSIBILITY="yellow"
    ;;
  WebFetch)
    REVERSIBILITY="red"
    ;;
  Bash)
    CMD=$(echo "$TOOL_INPUT_JSON" | jq -r '.command // ""')
    case "$CMD" in
      *"rm "*|*"rm -"*)
        REVERSIBILITY="red"
        ;;
      *"git push"*|*"git reset --hard"*|*"git checkout --"*|*"git clean -f"*)
        REVERSIBILITY="red"
        ;;
      *"gh pr create"*|*"gh pr review"*|*"gh issue close"*|*"gh release create"*)
        REVERSIBILITY="red"
        ;;
      *"curl -X POST"*|*"curl -X PUT"*|*"curl -X DELETE"*)
        REVERSIBILITY="red"
        ;;
      *"npm publish"*|*"pnpm publish"*|*"yarn publish"*|*"cargo publish"*|*"pip install --user"*)
        REVERSIBILITY="red"
        ;;
      *"osascript"*"send"*|*"osascript"*"delete"*)
        REVERSIBILITY="red"
        ;;
      *"mv "*|*"cp "*|*"mkdir "*|*"git add"*|*"git commit"*|*"git stash"*|*"git worktree"*)
        REVERSIBILITY="yellow"
        ;;
      *)
        # Default: read-only commands like ls/cat/grep are green; unknown = yellow
        case "$CMD" in
          ls*|cat*|head*|tail*|wc*|find*|grep*|rg*|fd*|du*|df*|stat*|file*|which*|echo*|pwd|date*|env*|jq*|git\ log*|git\ status*|git\ diff*|git\ branch*|git\ show*|gh\ pr\ list*|gh\ issue\ list*|gh\ search*)
            REVERSIBILITY="green"
            ;;
          *)
            REVERSIBILITY="yellow"
            ;;
        esac
        ;;
    esac
    ;;
  *)
    # Unknown tool — be conservative
    REVERSIBILITY="yellow"
    ;;
esac

# Decision based on policy
DECISION="allow"
if [ "$POLICY" = "strict" ] && [ "$REVERSIBILITY" != "green" ]; then
  DECISION="defer"
elif [ "$POLICY" = "balanced" ] && [ "$REVERSIBILITY" = "red" ]; then
  DECISION="defer"
fi

if [ "$DECISION" = "defer" ]; then
  # Append to queue
  ULID="q_$(date +%s%N | sha256sum | head -c 16)"
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  QUEUE_ENTRY=$(jq -nc \
    --arg id "$ULID" \
    --arg ts "$TS" \
    --arg fleet "$FLEET" \
    --arg tool "$TOOL_NAME" \
    --argjson args "$TOOL_INPUT_JSON" \
    --arg rev "$REVERSIBILITY" \
    --arg session "$SESSION_ID" \
    '{id:$id,ts:$ts,fleet:$fleet,tool:$tool,args:$args,reversibility:$rev,session:$session,status:"pending"}')
  echo "$QUEUE_ENTRY" >> "$QUEUE_FILE"
  echo '{"permissionDecision":"defer","reason":"Sleepwalker: action queued for morning review"}'
else
  echo '{"permissionDecision":"allow"}'
fi
