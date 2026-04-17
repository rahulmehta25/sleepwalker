#!/bin/bash
# Sleepwalker installer
#
# Sets up the LOCAL fleet (Tier B / Desktop Scheduled Tasks):
#  - Copies routine SKILL.md files into ~/.claude/scheduled-tasks/
#  - Copies hook scripts into ~/.claude/hooks/
#  - Wires hooks into ~/.claude/settings.json (idempotent)
#  - Initializes ~/.sleepwalker/ state directory with default settings
#  - Does NOT enable any routines automatically — that happens via the dashboard
#
# Cloud fleet (Tier C / Routines) is set up separately via the dashboard's
# "Cloud Routines" page, which links into claude.ai/code/routines.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
STATE_DIR="${HOME}/.sleepwalker"

echo "==> Sleepwalker installer (local fleet only)"
echo "    Repo:   $REPO_ROOT"
echo "    Claude: $CLAUDE_DIR"
echo "    State:  $STATE_DIR"
echo

# 0. Pre-flight
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Install with: brew install jq"
  exit 1
fi

# 1. Initialize state directory
mkdir -p "$STATE_DIR"
touch "$STATE_DIR/queue.jsonl"
touch "$STATE_DIR/audit.jsonl"

if [ ! -f "$STATE_DIR/settings.json" ]; then
  echo "==> Creating default settings.json"
  cat > "$STATE_DIR/settings.json" <<'EOF'
{
  "sleep_window": {
    "start_hour": 23,
    "end_hour": 7
  },
  "policies": {
    "inbox-triage":         "balanced",
    "downloads-organizer":  "balanced",
    "calendar-prep":        "balanced",
    "standup-writer":       "balanced",
    "screenshot-reviewer":  "balanced",
    "disk-cleanup":         "strict"
  },
  "budgets": {
    "inbox-triage":         50000,
    "downloads-organizer":  50000,
    "calendar-prep":        30000,
    "standup-writer":       20000,
    "screenshot-reviewer":  50000,
    "disk-cleanup":         30000
  },
  "enabled_routines": [],
  "tracked_repos": []
}
EOF
fi

if [ ! -f "$STATE_DIR/budgets.json" ]; then
  echo '{}' > "$STATE_DIR/budgets.json"
fi

if [ ! -f "$STATE_DIR/tracked-projects.json" ]; then
  cat > "$STATE_DIR/tracked-projects.json" <<EOF
[
  "$HOME/Desktop/Projects"
]
EOF
fi

# 2. Copy hooks
echo "==> Copying hooks to $CLAUDE_DIR/hooks/"
mkdir -p "$CLAUDE_DIR/hooks"
for hook in "$REPO_ROOT"/hooks/*.sh; do
  [ -f "$hook" ] || continue
  name=$(basename "$hook")
  cp "$hook" "$CLAUDE_DIR/hooks/$name"
  chmod +x "$CLAUDE_DIR/hooks/$name"
  echo "    + $name"
done

# 3. Copy local routines
echo "==> Copying local routines to $CLAUDE_DIR/scheduled-tasks/"
mkdir -p "$CLAUDE_DIR/scheduled-tasks"
for routine_dir in "$REPO_ROOT"/routines-local/*/; do
  [ -d "$routine_dir" ] || continue
  routine_name=$(basename "$routine_dir")
  dest="$CLAUDE_DIR/scheduled-tasks/$routine_name"
  mkdir -p "$dest"
  cp "$routine_dir/SKILL.md" "$dest/SKILL.md"
  echo "    + $routine_name"
done

# 4. Wire hooks into ~/.claude/settings.json (idempotent merge)
SETTINGS="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

echo "==> Wiring hooks into $SETTINGS"
TMP=$(mktemp)
DEFER_HOOK="$CLAUDE_DIR/hooks/sleepwalker-defer-irreversible.sh"
BUDGET_HOOK="$CLAUDE_DIR/hooks/sleepwalker-budget-cap.sh"
AUDIT_HOOK="$CLAUDE_DIR/hooks/sleepwalker-audit-log.sh"

jq \
  --arg defer "$DEFER_HOOK" \
  --arg budget "$BUDGET_HOOK" \
  --arg audit "$AUDIT_HOOK" \
  '
    .hooks //= {} |
    .hooks.PreToolUse  //= [] |
    .hooks.PostToolUse //= [] |
    # Hook is "present" if any entry in the array contains it inside its nested hooks list
    def hasCmd(arr; path):
      arr | map((.hooks // []) | map(.command) | index(path)) | map(. != null) | any;

    (hasCmd(.hooks.PreToolUse;  $defer))  as $haveDefer  |
    (hasCmd(.hooks.PostToolUse; $budget)) as $haveBudget |
    (hasCmd(.hooks.PostToolUse; $audit))  as $haveAudit  |

    (if $haveDefer  then . else .hooks.PreToolUse  += [{"matcher":"*","hooks":[{"type":"command","command":$defer}]}]  end) |
    (if $haveBudget then . else .hooks.PostToolUse += [{"matcher":"*","hooks":[{"type":"command","command":$budget}]}] end) |
    (if $haveAudit  then . else .hooks.PostToolUse += [{"matcher":"*","hooks":[{"type":"command","command":$audit}]}]  end)
  ' "$SETTINGS" > "$TMP"
mv "$TMP" "$SETTINGS"

echo
echo "==> Install complete."
echo
echo "Local fleet members installed:"
ls "$CLAUDE_DIR/scheduled-tasks/" 2>/dev/null | grep '^sleepwalker-' | sed 's/^/    /'
echo
echo "Next steps:"
echo "  1. cd dashboard && pnpm install && pnpm dev --port 4001"
echo "  2. Open http://localhost:4001"
echo "  3. Routines tab → enable 1-2 starter routines"
echo "  4. Tomorrow at 7am, open the Morning Queue"
echo
echo "For the cloud fleet (PR Reviewer, Dependency Upgrader, etc.):"
echo "  → Cloud Routines tab in the dashboard, or visit https://claude.ai/code/routines"
echo
echo "All routines are DISABLED by default. Enable from the dashboard."
