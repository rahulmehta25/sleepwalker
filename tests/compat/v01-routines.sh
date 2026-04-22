#!/bin/bash
# tests/compat/v01-routines.sh
# COMP-01 Part 1: install.sh idempotency + 14-routine file-layout enumeration.
#
# Purpose: backward-compatibility canary for v0.1 behavior continuity.
#   - If install.sh loses idempotency, this test fails.
#   - If any of the 14 v0.1 routines loses a required file, this test fails.
#   - If the catalog floor drops below 6 local + 8 cloud (baseline), this test
#     fails. Extra routines from v0.2 /editor authoring are allowed — COMP-01
#     asserts v0.1 is preserved, not that the repo is frozen.
#
# Runs in an isolated $HOME via mktemp -d; does NOT touch real user state.
# Does NOT require codex or gemini binaries — v0.1 is Claude-only.
#
# Exit 0 on full pass; exit 1 on any failure with a line-by-line FAILURES log.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

TEST_HOME=$(mktemp -d -t sleepwalker-compat-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$TEST_HOME"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

PASS=0
FAIL=0
FAILURES=()

assert_file() {
  if [[ -f "$1" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("MISSING FILE: $1")
  fi
}

assert_eq() {
  # $1 actual, $2 expected, $3 label
  if [[ "$1" == "$2" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("NOT EQUAL ${3:-}: got '$1' expected '$2'")
  fi
}

assert_ge() {
  # $1 actual, $2 minimum, $3 label
  if (( $1 >= $2 )); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("COUNT BELOW MINIMUM ${3:-}: got '$1' expected at least '$2'")
  fi
}

echo "==> COMP-01 Part 1: v0.1 backward-compat integration"
echo "==> Test home: $TEST_HOME"
echo "==> Repo root: $REPO_ROOT"

# ---------------------------------------------------------------------------
# Phase 1 — install.sh idempotency (delegate to existing harness)
# ---------------------------------------------------------------------------
# install-idempotency.sh already proves install.sh is idempotent in an
# isolated $HOME. We wrap rather than duplicate to avoid drift.
echo
echo "==> Phase 1: install.sh idempotency (via hooks/tests/install-idempotency.sh)"
bash "$REPO_ROOT/hooks/tests/install-idempotency.sh" >/dev/null
echo "==> Phase 1 PASS: install.sh idempotent"

# ---------------------------------------------------------------------------
# Phase 2 — 14 v0.1 routine file-layout enumeration (strict v0.1 floor)
# ---------------------------------------------------------------------------
# Source of truth: docs/ROUTINES.md catalog.
# 6 local (each has SKILL.md) + 8 cloud (each has prompt.md + config.json + setup.md).
# _test-zen is a smoke-test fixture and is explicitly excluded.
# Per-slug file assertions are the primary regression canary. Count asserts
# use >= floor so v0.2 /editor-authored routines don't trip the gate.
echo
echo "==> Phase 2: 14 v0.1 routine file layout"

LOCAL_SLUGS=(
  "sleepwalker-calendar-prep"
  "sleepwalker-disk-cleanup"
  "sleepwalker-downloads-organizer"
  "sleepwalker-inbox-triage"
  "sleepwalker-screenshot-reviewer"
  "sleepwalker-standup-writer"
)

CLOUD_SLUGS=(
  "alert-triage"
  "dead-code-pruner"
  "dependency-upgrader"
  "doc-drift-fixer"
  "library-port"
  "morning-brief"
  "pr-reviewer"
  "test-coverage-filler"
)

# Every local routine must have its SKILL.md
for slug in "${LOCAL_SLUGS[@]}"; do
  assert_file "$REPO_ROOT/routines-local/$slug/SKILL.md"
done

# Every cloud routine must have prompt.md + config.json + setup.md
for slug in "${CLOUD_SLUGS[@]}"; do
  assert_file "$REPO_ROOT/routines-cloud/$slug/prompt.md"
  assert_file "$REPO_ROOT/routines-cloud/$slug/config.json"
  assert_file "$REPO_ROOT/routines-cloud/$slug/setup.md"
done

# Floor count: at least 8 real cloud routines on disk (excludes leading-underscore
# fixtures like _test-zen). A naive `ls | wc -l` would return 9 and mask drift.
#
# NOTE: v0.2 lets users author new routines via /editor, which may add more cloud
# bundles over time. COMP-01 asserts the v0.1 baseline is *preserved*, not that
# the repo is frozen — per-slug file assertions above are the real regression
# canaries. The count floor just guards against mass deletion.
REAL_CLOUD=0
for d in "$REPO_ROOT"/routines-cloud/*/; do
  name=$(basename "$d")
  # Skip underscore-prefixed smoke fixtures (_test-zen, etc.)
  [[ "$name" == _* ]] && continue
  REAL_CLOUD=$((REAL_CLOUD + 1))
done
assert_ge "$REAL_CLOUD" "8" "real cloud routine count (v0.1 baseline)"

# Floor count: at least 6 local routines on disk (v0.2 authoring may add more)
REAL_LOCAL=$(find "$REPO_ROOT/routines-local" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
assert_ge "$REAL_LOCAL" "6" "local routine count (v0.1 baseline)"

# ---------------------------------------------------------------------------
# Phase 3 — Exit reporting
# ---------------------------------------------------------------------------
echo
echo "==> Summary: $PASS passed, $FAIL failed"
if (( FAIL > 0 )); then
  echo
  echo "Failures:"
  printf '  %s\n' "${FAILURES[@]}" >&2
  exit 1
fi
echo "==> COMP-01 Part 1 PASS: all 14 v0.1 routines present, install.sh idempotent"
exit 0
