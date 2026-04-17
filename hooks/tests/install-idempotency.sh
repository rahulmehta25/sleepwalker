#!/bin/bash
# Verify that install.sh is idempotent.
# Runs it twice in an isolated $HOME, diffs the resulting state.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

TEST_HOME=$(mktemp -d -t sleepwalker-installtest-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$TEST_HOME"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

echo "==> Test home: $TEST_HOME"
echo "==> First install"
"$REPO_ROOT/install.sh" >/dev/null

# Snapshot
SNAP1=$(mktemp)
{
  find "$TEST_HOME/.claude" -type f 2>/dev/null | sort
  echo "---"
  find "$TEST_HOME/.sleepwalker" -type f 2>/dev/null | sort
  echo "---"
  cat "$TEST_HOME/.claude/settings.json" 2>/dev/null | jq -S .
} > "$SNAP1"

# Run again
echo "==> Second install"
"$REPO_ROOT/install.sh" >/dev/null

SNAP2=$(mktemp)
{
  find "$TEST_HOME/.claude" -type f 2>/dev/null | sort
  echo "---"
  find "$TEST_HOME/.sleepwalker" -type f 2>/dev/null | sort
  echo "---"
  cat "$TEST_HOME/.claude/settings.json" 2>/dev/null | jq -S .
} > "$SNAP2"

if diff -q "$SNAP1" "$SNAP2" >/dev/null; then
  echo "==> PASS: install.sh is idempotent"
  echo
  echo "Files created:"
  find "$TEST_HOME/.claude" -type f | sort | sed "s|$TEST_HOME/||" | sed 's/^/    /'
  find "$TEST_HOME/.sleepwalker" -type f | sort | sed "s|$TEST_HOME/||" | sed 's/^/    /'
  echo
  echo "Hooks wired in settings.json:"
  jq '.hooks' "$TEST_HOME/.claude/settings.json"
  exit 0
else
  echo "==> FAIL: install.sh produced different state on second run"
  diff "$SNAP1" "$SNAP2"
  exit 1
fi
