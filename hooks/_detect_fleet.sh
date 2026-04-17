#!/bin/bash
# Sleepwalker fleet-context detector.
#
# Given a session_id and a transcript_path (from the hook input JSON),
# determines whether the current Claude Code session was started by a
# sleepwalker-* scheduled task. If yes, echoes the fleet name (e.g.
# "inbox-triage"). If no, echoes nothing.
#
# Result is cached per session at ~/.sleepwalker/sessions/<session_id>.fleet
# so we don't re-read the transcript on every tool call.
#
# Usage: detect_fleet.sh <session_id> <transcript_path>

set -euo pipefail

SESSION_ID="${1:-}"
TRANSCRIPT="${2:-}"
CACHE_DIR="${HOME}/.sleepwalker/sessions"
mkdir -p "$CACHE_DIR"

[ -z "$SESSION_ID" ] && exit 0
CACHE_FILE="$CACHE_DIR/${SESSION_ID}.fleet"

# Cached?
if [ -f "$CACHE_FILE" ]; then
  cat "$CACHE_FILE"
  exit 0
fi

# Cache miss. Read the transcript and look for the SKILL.md name field
# Claude Code stores the loaded skill content in the system prompt.
# A sleepwalker SKILL.md frontmatter contains: name: sleepwalker-<routine>

FLEET=""
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  # Each routine SKILL.md body contains a literal marker tag at the top:
  # [sleepwalker:routine-name]
  # Match it explicitly (case-sensitive). Tolerate grep exit 1 (no match).
  FLEET=$(head -c 65536 "$TRANSCRIPT" 2>/dev/null \
    | grep -oE '\[sleepwalker:[a-z][a-z0-9-]*\]' 2>/dev/null \
    | head -n1 \
    | sed -E 's/\[sleepwalker:(.*)\]/\1/' || true)
fi

# Cache the result (even if empty — empty cache means "not sleepwalker, don't re-check")
echo -n "$FLEET" > "$CACHE_FILE"
echo "$FLEET"
