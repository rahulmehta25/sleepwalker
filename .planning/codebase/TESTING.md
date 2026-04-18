# Testing Patterns

**Analysis Date:** 2026-04-18

## Test Framework

### Runners

**Dashboard (TypeScript/React):**
- Framework: **Vitest** 2.1.8
- Config: `dashboard/vitest.config.ts`
- Environment: Node.js (server/lib testing; not jsdom)
- Run commands:
  ```bash
  cd dashboard && pnpm test              # Run all tests once
  cd dashboard && pnpm test:watch        # Watch mode
  cd dashboard && pnpm run typecheck     # TypeScript check before testing
  ```

**Hooks (Bash):**
- Framework: **Bash test harness** (custom)
- Config: `hooks/tests/run-tests.sh` (main suite, 26 tests)
- Additional: `hooks/tests/install-idempotency.sh`, `hooks/tests/e2e.sh`
- Run commands:
  ```bash
  hooks/tests/run-tests.sh               # All hook tests (26 tests)
  hooks/tests/install-idempotency.sh     # Install re-run safety
  hooks/tests/e2e.sh                     # End-to-end synthetic run
  ```

### Assertion Library
- **Vitest**: Built-in `expect()` API
- **Bash**: Manual assertions via `assert_eq()`, `assert_contains()`, `assert_file_lines()` helper functions in `run-tests.sh`

## Test File Organization

### Location
- **TS/React**: Co-located with source code
  - Pattern: `lib/queue.ts` → `tests/queue.test.ts`
  - All tests in single `dashboard/tests/` directory (flat; no subdirectories)
- **Bash**: Separate `hooks/tests/` directory
  - `run-tests.sh`: Main harness (PreToolUse, PostToolUse, helper scripts)
  - `install-idempotency.sh`: Verify install.sh can re-run safely
  - `e2e.sh`: Full end-to-end routine test with real Claude Code calls

### Naming
- **TS files**: `<module>.test.ts` (e.g., `queue.test.ts`, `fire-routine.test.ts`)
- **Bash**: Functions named `test: <description>` within `run-tests.sh`
- **Test suites**: Use `describe()` blocks with semantic names

### Structure Example

```typescript
// dashboard/tests/queue.test.ts
describe("queue lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(async () => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
  });

  it("readLocalQueue returns empty when no file exists", async () => {
    const { readLocalQueue } = await import("@/lib/queue");
    expect(readLocalQueue()).toEqual([]);
  });
});
```

## Test Structure

### TypeScript Pattern

**Setup (beforeEach):**
- Create isolated HOME environment via `makeTempHome()`
- Ensure `~/.sleepwalker/` directory via `ensureSleepwalkerDir()`
- Each test runs against temporary files, not real user state

**Teardown (afterEach):**
- Restore original HOME from env object
- Clean up temp directory recursively
- Reset mocks: `vi.restoreAllMocks()`

**Assertion Pattern:**
```typescript
// Import dynamically to ensure test env is set up first
const { functionUnderTest } = await import("@/lib/queue");
const result = functionUnderTest(testInput);
expect(result).toEqual(expectedOutput);
```

### Bash Pattern

**Reset (reset_state function):**
```bash
reset_state() {
  rm -rf "$TEST_HOME/.sleepwalker"
  mkdir -p "$TEST_HOME/.sleepwalker/sessions"
  cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{...}
EOF
  echo '{}' > "$TEST_HOME/.sleepwalker/budgets.json"
}
```

**Input Construction (hook_input function):**
```bash
# Build REAL Claude Code hook JSON format
hook_input() {
  local event="$1" tool="$2" tool_input="$3" session="$4" transcript="$5"
  jq -nc --arg s "$session" --arg t "$transcript" \
    '{session_id:$s, transcript_path:$t, hook_event_name:$ev, tool_name:$tn, tool_input:$ti}'
}
```

**Transcript Setup (make_transcript function):**
```bash
# Create fake transcript with sleepwalker fleet marker
make_transcript() {
  local fleet="$1"
  local file="$TEST_HOME/transcript-${fleet}.jsonl"
  cat > "$file" <<EOF
{"type":"user","message":{"role":"user","content":"[sleepwalker:${fleet}]\n\nYou are running as a Sleepwalker fleet member."}}
EOF
  echo "$file"
}
```

**Assertion Helpers:**
```bash
assert_eq "test name" "$expected" "$actual"          # String equality
assert_contains "test name" "needle" "haystack"      # Substring check
assert_file_lines "test name" "5" "$FILE"            # Line count check
```

## Mocking

### Framework
- **Vitest**: `vi` object for mocks
- **Bash**: Function stubbing + environment variable override

### Patterns

**Mock Global Fetch (TS):**
```typescript
// fire-routine.test.ts
globalThis.fetch = vi.fn(async (url, init) => {
  const initObj = init as RequestInit;
  const headers = initObj.headers as Record<string, string>;
  expect(headers["Authorization"]).toBe("Bearer sk-ant-oat01-test");
  return new Response(JSON.stringify({
    claude_code_session_id: "session_01TEST",
  }), { status: 200 });
}) as typeof fetch;

const { fireRoutine } = await import("@/lib/fire-routine");
const result = await fireRoutine("pr-reviewer");
expect(result.ok).toBe(true);

vi.restoreAllMocks();  // Important: reset after test
```

**Mock Filesystem via Temp HOME (TS):**
```typescript
// approval.test.ts
let env = makeTempHome();  // Sets process.env.HOME to temp dir

// Lib code now reads/writes to temp HOME instead of real user home
const { enqueueForExecution } = await import("@/lib/approval");
const file = enqueueForExecution(entry);

env.restore();  // Cleanup
```

**Environment Variable Override (Bash):**
```bash
# Override fleet detection without modifying settings.json
SLEEPWALKER_FLEET=test-fleet SLEEPWALKER_MODE=overnight \
  "$HOOKS_DIR/sleepwalker-defer-irreversible.sh"

# Bypass re-defer loop detection
SLEEPWALKER_REEXECUTING=1 "$HOOKS_DIR/sleepwalker-defer-irreversible.sh"
```

**PreToolUse Hook Input Simulation (Bash):**
```bash
# Construct real hook JSON, pass via stdin
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"https://x.com"}' "session-2" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")

# Assert deferred decision
assert_eq "WebFetch returns defer" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
```

**PostToolUse Hook Input Simulation (Bash):**
```bash
# Pass tool response as part of input
in=$(hook_input "PostToolUse" "Read" '{}' "sess-b1" "$TR" "small response")
out=$(echo "$in" | "$HOOKS_DIR/sleepwalker-budget-cap.sh")

# Token counting is automatic from response length
assert_eq "under budget continues" "true" "$(echo "$out" | jq -r '.continue // "true"')"
```

## What to Mock

**Mock:**
- Global `fetch()` when testing API calls (e.g., GitHub API, /fire endpoint)
- File I/O via temporary HOME directory (all tests do this)
- Environment variables to test conditional paths

**Do NOT Mock:**
- Built-in Node modules (`fs`, `path`, `os`) — instead use real temp dirs
- Lib functions when testing other lib functions — let them call each other
- Hook scripts themselves — test by invoking directly with stdin

## What NOT to Mock

**Never mock:**
- File system for state operations — use real files in temp HOME
- jq or JSON parsing — these are critical to correctness
- Shell built-ins — if something doesn't work with `ls` or `grep`, it needs fixing

## Fixtures and Factories

### Test Data

**Bash Test Fixtures (`run-tests.sh`):**
```bash
# Settings fixture
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{
  "sleep_window": { "start_hour": 0, "end_hour": 24 },
  "policies": { "test-fleet": "balanced" },
  "budgets": { "test-fleet": 1000 }
}
EOF

# Settings file is committed in repo; tests write temporary versions
```

**TypeScript Fixtures (inline in tests):**
```typescript
// fire-routine.test.ts — fixture as mock response
const cred = { url: "https://api.anthropic.com/v1/test/fire", token: "sk-ant-oat01-test" };
await import("@/lib/settings").then(m => m.setCloudCredential("pr-reviewer", cred.url, cred.token));

// cloud.test.ts — mock GitHub API response structure
const mockPR = {
  number: 142,
  title: "[sleepwalker] dependency-upgrader: bump 12 deps",
  head: { ref: "claude/sleepwalker/deps/2026-04-18" },
  user: { login: "claude-bot" },
  html_url: "https://github.com/owner/repo/pull/142",
};
```

### Location
- No separate fixture files; inline in test files
- Settings fixtures: temporary JSON written during `beforeEach()`
- Mock data: hardcoded in test functions using jq/JSON

### Builders
- Use `makeTempHome()` and `ensureSleepwalkerDir()` helper functions from `dashboard/tests/helpers.ts`
- These are shared across all TS tests

## Coverage

### Requirements
- **Not enforced** — no coverage threshold in vitest.config
- Tests are pragmatic: focus on state changes and decision logic

### View Coverage
```bash
cd dashboard && pnpm test --coverage
# (Would require @vitest/coverage package; not currently installed)
```

## Test Types

### Unit Tests

**Scope:** Single lib function behavior
- File I/O: `readLocalQueue()`, `writeSettings()`, `appendQueueEntry()`
- State updates: `updateLocalStatus()`, `enqueueForExecution()`
- Business logic: `pendingCount()`, `reversibility classification`

**Example (`queue.test.ts`):**
```typescript
it("updateLocalStatus updates a known id and returns true", async () => {
  const { appendQueueEntry, updateLocalStatus, readLocalQueue } = await import("@/lib/queue");
  appendQueueEntry({ id: "q_x", ts: "2026-04-18T00:00:00Z", fleet: "f", status: "pending" });
  expect(updateLocalStatus("q_x", "approved")).toBe(true);
  expect(readLocalQueue()[0].status).toBe("approved");
});
```

### Integration Tests

**Scope:** Hook behavior with real input format
- PreToolUse defer decisions under different policies
- PostToolUse budget cap enforcement
- Audit log entry appending
- Fleet detection + transcript parsing

**Example (`run-tests.sh` — bash):**
```bash
echo "  test: WebFetch under balanced → defer"
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"https://x.com"}' "session-2" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "WebFetch returns defer" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue has 1 entry" "1" "$TEST_HOME/.sleepwalker/queue.jsonl"
```

### E2E Tests

**Scope:** End-to-end routine execution from init to re-execution
- File `hooks/tests/e2e.sh` runs a synthetic routine with real Claude Code invocation
- Creates a fake scheduled task, triggers it, validates defer hook queueing, then re-executes approval

**Not automated via CI** — requires manual validation that Desktop Scheduled Tasks integration works

## Common Patterns

### Async Testing

**Dynamic imports to ensure env setup:**
```typescript
beforeEach(async () => {
  env = makeTempHome();  // Set HOME env var
});

it("reads from temp home", async () => {
  const { readLocalQueue } = await import("@/lib/queue");  // Import AFTER env setup
  expect(readLocalQueue()).toEqual([]);
});
```

**Async fetch mocking:**
```typescript
globalThis.fetch = vi.fn(async (url, init) => {
  return new Response(JSON.stringify({ ... }), { status: 200 });
}) as typeof fetch;

const result = await fireRoutine("test");
```

### Error Testing

**Expect failed states:**
```typescript
// fire-routine.test.ts
it("returns error on non-2xx response", async () => {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
  ) as typeof fetch;

  const result = await fireRoutine("x");
  expect(result.ok).toBe(false);
  expect(result.status).toBe(401);
  expect(result.error).toBe("HTTP 401");
});

// bash — test that reversibility classification is correct
echo "  test: Bash command classification — git push is red"
in=$(hook_input "PreToolUse" "Bash" '{"command":"git push origin main"}' "session-4" "$TR")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "git push defers" "defer" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
```

### Non-Sleepwalker Session Bailout

Critical pattern: hooks must not interfere with normal (non-sleepwalker) Claude Code sessions.

**Bash test:**
```bash
reset_state
echo "  test: NOT a sleepwalker context → allow (no interference)"
NOT_SLEEPWALKER="$TEST_HOME/normal.jsonl"
echo '{"role":"system","content":"You are Claude Code."}' > "$NOT_SLEEPWALKER"
in=$(hook_input "PreToolUse" "WebFetch" '{"url":"x"}' "session-x" "$NOT_SLEEPWALKER")
out=$(echo "$in" | SLEEPWALKER_MODE=overnight "$HOOKS_DIR/sleepwalker-defer-irreversible.sh")
assert_eq "non-sleepwalker always allows" "allow" "$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision')"
assert_file_lines "queue stays empty" "0" "$TEST_HOME/.sleepwalker/queue.jsonl"
```

## Test Run Examples

### Dashboard Tests (43 tests)
```bash
$ cd dashboard && pnpm test

✓ tests/queue.test.ts (9 tests)
  ✓ readLocalQueue returns empty when no file exists
  ✓ readLocalQueue parses jsonl entries and tags them as local source
  ✓ readLocalQueue skips malformed lines without throwing
  ✓ appendQueueEntry adds a line
  ✓ updateLocalStatus updates a known id and returns true
  ✓ updateLocalStatus returns false for unknown id
  ✓ pendingCount counts only pending entries

✓ tests/approval.test.ts (6 tests)
✓ tests/audit.test.ts
✓ tests/cloud-cache.test.ts
✓ tests/cloud.test.ts
✓ tests/fire-routine.test.ts (13 tests)
✓ tests/queue-aggregator.test.ts
✓ tests/routines.test.ts
✓ tests/settings.test.ts

Test Files  10 passed (10)
     Tests  43 passed (43)
```

### Hook Tests (26 tests)
```bash
$ hooks/tests/run-tests.sh

==> defer-irreversible.sh — REAL hook input format
  test: green tool (Read) → allow
    PASS  Read returns allow
    PASS  hookEventName is PreToolUse
    PASS  queue empty after Read
  test: red tool (WebFetch) → defer
    PASS  WebFetch returns defer
    PASS  queue has 1 entry
    PASS  queue entry has fleet=inbox-triage
  [... 20+ more tests ...]

──────────────────────────────────────
  Results: 26 pass / 0 fail
──────────────────────────────────────
```

---

*Testing analysis: 2026-04-18*
