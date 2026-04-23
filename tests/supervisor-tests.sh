#!/bin/bash
# tests/supervisor-tests.sh
#
# Unit tests for bin/sleepwalker-run-cli supervisor.
# Validates argument handling, safety gates, and audit emission
# WITHOUT invoking real codex/gemini binaries.
#
# Run: bash tests/supervisor-tests.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPERVISOR="${REPO_ROOT}/bin/sleepwalker-run-cli"

PASS=0
FAIL=0
FAILURES=()

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Helpers ---
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $label"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label: expected='$expected' actual='$actual'")
    echo -e "  ${RED}✗${NC} $label (expected='$expected' actual='$actual')"
  fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $label"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label: '$needle' not found in output")
    echo -e "  ${RED}✗${NC} $label ('$needle' not found)"
  fi
}

assert_exit_code() {
  local label="$1" expected="$2" actual="$3"
  assert_eq "$label (exit code)" "$expected" "$actual"
}

# --- Test fixture setup ---
setup_test_env() {
  TEST_HOME="$(mktemp -d -t sleepwalker-sup-test.XXXXXX)"
  export HOME="$TEST_HOME"

  STATE_DIR="${TEST_HOME}/.sleepwalker"
  mkdir -p "$STATE_DIR"

  # Default settings (sleep window 0-24 = always in window)
  cat > "${STATE_DIR}/settings.json" <<'EOF'
{"sleep_window":{"start_hour":0,"end_hour":24}}
EOF

  # Create stub CLI binaries that succeed
  STUB_DIR="${TEST_HOME}/stubs"
  mkdir -p "$STUB_DIR"

  cat > "${STUB_DIR}/codex" <<'STUB'
#!/bin/bash
echo "codex stub output"
exit 0
STUB
  chmod +x "${STUB_DIR}/codex"

  cat > "${STUB_DIR}/gemini" <<'STUB'
#!/bin/bash
echo "gemini stub output"
exit 0
STUB
  chmod +x "${STUB_DIR}/gemini"

  export PATH="${STUB_DIR}:${PATH}"
}

teardown_test_env() {
  rm -rf "$TEST_HOME"
}

# Create a bundle with prompt.md and config.json
create_bundle() {
  local runtime="$1" slug="$2"
  local bundle_dir="${TEST_HOME}/routines-${runtime}/${slug}"
  mkdir -p "$bundle_dir"
  echo "Test prompt for ${slug}" > "${bundle_dir}/prompt.md"
  cat > "${bundle_dir}/config.json" <<EOF
{"reversibility":"yellow","budget":40000}
EOF
  echo "$bundle_dir"
}

# Read last audit event from audit.jsonl
last_audit_event() {
  tail -1 "${STATE_DIR}/audit.jsonl" 2>/dev/null | jq -r '.event // empty' 2>/dev/null || echo ""
}

last_audit_json() {
  tail -1 "${STATE_DIR}/audit.jsonl" 2>/dev/null || echo ""
}

# ==========================================================================
echo -e "${YELLOW}==> Supervisor unit tests${NC}"
echo

# --- Test 1: Missing arguments ---
echo "Test: missing arguments"
setup_test_env
set +e
output=$("$SUPERVISOR" 2>&1)
exit_code=$?
set -e
assert_exit_code "no args → exit 64" "64" "$exit_code"
assert_contains "no args → usage message" "$output" "usage:"
teardown_test_env

# --- Test 2: Missing slug ---
echo "Test: missing slug"
setup_test_env
set +e
output=$("$SUPERVISOR" codex 2>&1)
exit_code=$?
set -e
assert_exit_code "no slug → exit 64" "64" "$exit_code"
teardown_test_env

# --- Test 3: Unknown runtime ---
echo "Test: unknown runtime"
setup_test_env
set +e
output=$("$SUPERVISOR" amp my-slug 2>&1)
exit_code=$?
set -e
assert_exit_code "unknown runtime → exit 64" "64" "$exit_code"
assert_contains "unknown runtime → error message" "$output" "unknown runtime"
teardown_test_env

# --- Test 4: Missing prompt.md ---
echo "Test: missing prompt.md"
setup_test_env
bundle_dir="${TEST_HOME}/routines-codex/no-prompt"
mkdir -p "$bundle_dir"
# No prompt.md created
cat > "${bundle_dir}/config.json" <<'EOF'
{"reversibility":"yellow","budget":40000}
EOF
set +e
"$SUPERVISOR" codex no-prompt "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
assert_exit_code "missing prompt.md → exit 66" "66" "$exit_code"
event=$(last_audit_event)
assert_eq "missing prompt.md → audit 'failed' event" "failed" "$event"
teardown_test_env

# --- Test 5: Sleep window gate (outside window) ---
echo "Test: sleep window gate"
setup_test_env
bundle_dir=$(create_bundle "codex" "sleep-test")
# Set sleep window to a 1-hour band that almost certainly excludes now.
# We pick hour 2-3 (2 AM). If the test happens to run at 2 AM, we skip.
cat > "${STATE_DIR}/settings.json" <<'EOF'
{"sleep_window":{"start_hour":2,"end_hour":3}}
EOF
export SLEEPWALKER_MODE="auto"
set +e
"$SUPERVISOR" codex sleep-test "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
unset SLEEPWALKER_MODE
current_hour=$(date +%H | sed 's/^0//'); current_hour=${current_hour:-0}
if [[ "$current_hour" -ge 2 ]] && [[ "$current_hour" -lt 3 ]]; then
  echo -e "  ${YELLOW}⊘${NC} Skipped (current hour $current_hour is inside test window)"
else
  assert_exit_code "outside sleep window → exit 0" "0" "$exit_code"
  event=$(last_audit_event)
  assert_eq "outside sleep window → audit 'deferred'" "deferred" "$event"
  audit_json=$(last_audit_json)
  assert_contains "deferred has reason" "$audit_json" "outside sleep window"
fi
teardown_test_env

# --- Test 6: Policy gate (strict blocks yellow) ---
echo "Test: policy gate (strict blocks yellow)"
setup_test_env
bundle_dir=$(create_bundle "codex" "policy-test")
cat > "${STATE_DIR}/settings.json" <<EOF
{"sleep_window":{"start_hour":0,"end_hour":24},"policies":{"codex/policy-test":"strict"}}
EOF
set +e
"$SUPERVISOR" codex policy-test "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
assert_exit_code "strict + yellow → exit 0 (deferred)" "0" "$exit_code"
event=$(last_audit_event)
assert_eq "strict + yellow → audit 'deferred'" "deferred" "$event"
audit_json=$(last_audit_json)
assert_contains "deferred has policy reason" "$audit_json" "policy strict blocks yellow"
teardown_test_env

# --- Test 7: Policy gate (balanced allows yellow) ---
echo "Test: policy gate (balanced allows yellow)"
setup_test_env
bundle_dir=$(create_bundle "codex" "balanced-test")
cat > "${STATE_DIR}/settings.json" <<EOF
{"sleep_window":{"start_hour":0,"end_hour":24},"policies":{"codex/balanced-test":"balanced"}}
EOF
set +e
"$SUPERVISOR" codex balanced-test "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
assert_exit_code "balanced + yellow → exit 0 (allowed)" "0" "$exit_code"
started=$(grep '"event":"started"' "${STATE_DIR}/audit.jsonl" | tail -1)
assert_contains "balanced + yellow → started event emitted" "$started" '"runtime":"codex"'
teardown_test_env

# --- Test 8: Audit JSON shape validation ---
echo "Test: audit JSON shape"
setup_test_env
bundle_dir=$(create_bundle "gemini" "audit-shape")
set +e
"$SUPERVISOR" gemini audit-shape "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
assert_exit_code "successful run → exit 0" "0" "$exit_code"
# Validate each audit line has required fields
shape_ok=1
while IFS= read -r line; do
  ts=$(echo "$line" | jq -r '.ts // empty')
  fleet=$(echo "$line" | jq -r '.fleet // empty')
  runtime=$(echo "$line" | jq -r '.runtime // empty')
  event=$(echo "$line" | jq -r '.event // empty')
  if [[ -z "$ts" ]] || [[ -z "$fleet" ]] || [[ -z "$runtime" ]] || [[ -z "$event" ]]; then
    shape_ok=0
    FAIL=$((FAIL + 1))
    FAILURES+=("audit line missing required field: $line")
    echo -e "  ${RED}✗${NC} audit line missing required field"
  fi
done < "${STATE_DIR}/audit.jsonl"
if [[ "$shape_ok" -eq 1 ]]; then
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✓${NC} all audit lines have required fields (ts, fleet, runtime, event)"
fi
# Verify fleet format
fleet=$(head -1 "${STATE_DIR}/audit.jsonl" | jq -r '.fleet')
assert_eq "fleet format is runtime/slug" "gemini/audit-shape" "$fleet"
teardown_test_env

# --- Test 9: Successful codex run produces started + completed ---
echo "Test: successful codex run audit events"
setup_test_env
bundle_dir=$(create_bundle "codex" "success-run")
set +e
"$SUPERVISOR" codex success-run "$bundle_dir" >/dev/null 2>&1
exit_code=$?
set -e
assert_exit_code "successful codex run → exit 0" "0" "$exit_code"
started_count=$(grep -c '"event":"started"' "${STATE_DIR}/audit.jsonl")
terminal_count=$(grep -cE '"event":"(completed|failed|budget_exceeded)"' "${STATE_DIR}/audit.jsonl")
assert_eq "exactly 1 started event" "1" "$started_count"
assert_eq "exactly 1 terminal event" "1" "$terminal_count"
teardown_test_env

# --- Test 10: CLI not found ---
echo "Test: CLI not found"
setup_test_env
bundle_dir=$(create_bundle "codex" "no-cli")
# Remove stubs from PATH AND block login-shell fallbacks by pointing HOME
# at the temp dir (no real shell profiles) and using a minimal PATH.
# Also shadow zsh and bash with stubs that always fail command -v.
mkdir -p "${TEST_HOME}/fake-shells"
cat > "${TEST_HOME}/fake-shells/zsh" <<'STUB'
#!/bin/bash
# Fake zsh that never finds the target binary
exit 1
STUB
chmod +x "${TEST_HOME}/fake-shells/zsh"
cat > "${TEST_HOME}/fake-shells/bash" <<'STUB'
#!/bin/bash
# Fake bash that never finds the target binary
exit 1
STUB
chmod +x "${TEST_HOME}/fake-shells/bash"
# PATH has only system essentials (for jq, date, etc.) but no codex/gemini stub
# and /bin/zsh + /bin/bash still exist, but the supervisor calls them with -l -c
# which will source login profiles. Since HOME is a temp dir with no profiles,
# the login shell will have minimal PATH. If real codex is installed system-wide
# this test becomes environment-dependent, so we skip when codex is globally available.
if /bin/zsh -l -c "command -v codex" >/dev/null 2>&1 || /bin/bash -l -c "command -v codex" >/dev/null 2>&1; then
  echo -e "  ${YELLOW}⊘${NC} Skipped (codex found in login-shell PATH; cannot isolate)"
else
  # Strip stubs dir from PATH so command -v fails
  export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
  set +e
  "$SUPERVISOR" codex no-cli "$bundle_dir" >/dev/null 2>&1
  exit_code=$?
  set -e
  assert_exit_code "CLI not found → exit 127" "127" "$exit_code"
  event=$(last_audit_event)
  assert_eq "CLI not found → audit 'failed'" "failed" "$event"
fi
teardown_test_env

# ==========================================================================
echo
echo -e "${YELLOW}==> Results: ${PASS} passed, ${FAIL} failed${NC}"
if (( FAIL > 0 )); then
  echo -e "${RED}Failures:${NC}"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
echo -e "${GREEN}All supervisor tests passed.${NC}"
exit 0
