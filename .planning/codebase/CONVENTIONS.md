# Coding Conventions

**Analysis Date:** 2026-04-18

## Naming Patterns

### Routine Naming (TypeScript + Bash)
- **Routine slugs**: kebab-case, prefixed with `sleepwalker-`
  - Examples: `sleepwalker-inbox-triage`, `sleepwalker-downloads-organizer`, `pr-reviewer`
  - Local routines use full prefix; cloud routines often drop it in shortened form (`deps` for `dependency-upgrader`)

### Fleet Detection and Markers
- **Fleet marker**: `[sleepwalker:<fleet-name>]` placed at start of routine prompts/SKILL.md
  - Example in `routines-local/sleepwalker-downloads-organizer/SKILL.md`: `[sleepwalker:downloads-organizer]`
  - Used by hook scripts (`_detect_fleet.sh`) to identify sleepwalker contexts
  - Non-sleepwalker sessions (normal interactive work) must bail out early to avoid interference

### GitHub Branch Prefixes
- **Cloud routine branches**: `claude/sleepwalker/<routine-short-name>/<date>`
  - Examples: `claude/sleepwalker/deps/2026-04-18`, `claude/sleepwalker/pr-reviewer/*`
  - Defined in cloud routine `config.json` as `branch_policy`
  - Queue aggregator filters PRs by this pattern to populate cloud queue

### Files and Directories
- **Files**: camelCase for TypeScript, kebab-case for shell scripts
  - TS: `queue.ts`, `fire-routine.ts`, `cloud-cache.ts`
  - Bash: `sleepwalker-defer-irreversible.sh`, `sleepwalker-audit-log.sh`, `_detect_fleet.sh`
- **Components**: PascalCase, with client component suffix `-client.tsx`
  - Examples: `QueueClient`, `RoutinesClient`, `CloudClient`
  - Page-level server components: `page.tsx` (not named; Next.js convention)
- **Types**: PascalCase with descriptive nouns
  - Examples: `QueueEntry`, `Reversibility`, `QueueStatus`, `Settings`, `Policy`

### Function Names
- Descriptive verbs in camelCase
  - Reads: `readLocalQueue()`, `readSettings()`, `readGithubToken()`
  - Writes: `writeSettings()`, `appendQueueEntry()`, `enqueueForExecution()`
  - Checks: `hasCloudCredential()`, `hasGithubConfig()`, `pendingCount()`
  - Conversions: `getCloudCredentialPublic()` (returns safe view without secrets)
  - Async operations: `fireRoutine()`, `fetchCloudQueue()`, `aggregateQueue()`

### Variables
- **IDs**: short prefixes + semantic names
  - Queue IDs: `q_<ulid>` (e.g., `q_1719382920123456789`)
  - Session IDs: `sess-<name>` or `session_01TEST` (from Claude Code)
  - Routine names: short identifiers like `inbox-triage`, `pr-reviewer`
- **Colors/Status**: values from defined enums
  - Reversibility: `"green" | "yellow" | "red"` (from `Reversibility` type)
  - Status: `"pending" | "approved" | "rejected"` (from `QueueStatus` type)
  - Policy: `"strict" | "balanced" | "yolo"` (from `Policy` type)
- **Environment variables**: UPPER_SNAKE_CASE
  - `SLEEPWALKER_MODE` (overnight vs interactive)
  - `SLEEPWALKER_FLEET` (override fleet detection)
  - `SLEEPWALKER_REEXECUTING` (bypass re-defer loop)
  - `HOME` (standard; used by hooks for path resolution)

## Code Style

### Formatting
- **TypeScript/JavaScript**:
  - No explicit linter/formatter config found (no `.eslintrc*`, `.prettierrc`, `biome.json`)
  - Appears to follow Next.js defaults: 2-space indents, semicolons, double quotes for strings
  - Use `next lint` (inherited from Next.js scaffolding)
- **Bash**:
  - Set shebang: `#!/bin/bash`
  - Set error mode: `set -euo pipefail` (exit on error, undefined vars, pipe failures)
  - Indentation: 2 spaces
  - Quoting: double-quote all variable expansions (`"$VAR"`, not `$VAR`)

### TypeScript Strict Mode
- Enforced via `tsconfig.json`: `"strict": true`
- Required on compilation: `npm run typecheck` before commits
- Type all function parameters and return types explicitly

## Import Organization

### Order (TypeScript)
1. Built-in Node modules: `import fs from "node:fs"`
2. External packages: `import { describe, it } from "vitest"`
3. Relative lib imports: `import { queue } from "@/lib/queue"`
4. Type imports: `import type { QueueEntry } from "@/lib/queue"`
5. Local components: `import { PageHeader } from "./_components/page-header"`

### Path Aliases
- `@/*` maps to dashboard root directory via `tsconfig.json`
- Use `@/lib/<module>` for library functions
- Use `@/app/_components/<name>` for shared UI components
- Never use relative `../` paths in imports; always use `@/` alias

## Error Handling

### Patterns in TypeScript

**Graceful Fallbacks (File Operations)**:
```typescript
// queue.ts
function parseLines(raw: string): QueueEntry[] {
  return raw
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as QueueEntry;
      } catch {
        return null;  // Skip malformed lines silently
      }
    })
    .filter((x): x is QueueEntry => x !== null);
}
```

**Result Objects (for public APIs)**:
```typescript
// fire-routine.ts
export interface FireResult {
  ok: boolean;
  status: number;
  sessionId?: string;
  error?: string;  // Descriptive error code or message
}

export async function fireRoutine(routineId: string): Promise<FireResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, sessionId: parsed.claude_code_session_id };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
```

**Return Null for Not Found**:
```typescript
// settings.ts
export function getCloudCredential(routineId: string): CloudCredential | null {
  const all = readAllCloudCreds();
  return all[routineId] ?? null;
}
```

### Patterns in Bash

**Early Exit / Bail Out**:
```bash
# sleepwalker-defer-irreversible.sh
[ -z "$FLEET" ] && allow  # Exit early if no fleet detected

allow() {
  printf '...\n'
  exit 0
}
```

**Pipe Failures**:
```bash
set -euo pipefail  # Any command failure in a pipeline stops execution
```

**JSON Parsing with jq**:
```bash
# Silent defaults on missing keys
SLEEP_START=$(jq -r '.sleep_window.start_hour // 23' "$SETTINGS_FILE" 2>/dev/null || echo 23)
```

## Logging

### Framework
- **TypeScript**: Console logging (`console.log`, `console.error`) — no external logger
- **Bash**: Direct output to stdout/stderr for hook results, no log file
  - Hook output: JSON on stdout (Claude Code format)
  - User feedback: stderr prefixed with `==>` (install.sh convention)

### Patterns

**Hook Output Format** (`sleepwalker-defer-irreversible.sh`):
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"defer"},"reason":"Sleepwalker: queued for morning review"}
```

**Audit Log** (`audit.jsonl` — appended by `sleepwalker-audit-log.sh`):
```json
{"ts":"2026-04-18T05:30:00Z","fleet":"inbox-triage","session":"sess-123","tool":"WebFetch","input":{"url":"..."},"output_preview":"...","output_length":500}
```

**Queue Entries** (`queue.jsonl` — appended by hooks and dashboard):
```json
{"id":"q_abc...","ts":"2026-04-18T02:00:00Z","fleet":"downloads-organizer","tool":"Edit","args":{"file_path":"/tmp/x"},"reversibility":"yellow","session":"sess-1","status":"pending"}
```

## Comments

### When to Comment
- **Rarely**: Code should be self-documenting via clear function and variable names
- **Only when "why" is not obvious from context**:
  - Non-obvious business logic: "We defer WebFetch even under balanced policy because it modifies remote state"
  - Workarounds: "SLEEPWALKER_REEXECUTING=1 prevents re-defer loop during approval execution"
  - Performance notes: "Cache fleet detection per session to avoid re-parsing transcript"

### JSDoc/TSDoc
- Used sparingly, only for public module exports
- Example in `fire-routine.ts`:
  ```typescript
  /**
   * POST to the routine's /fire endpoint with the configured bearer token.
   * Optional `text` payload is freeform context for the routine (alert body etc.).
   */
  export async function fireRoutine(routineId: string, text?: string): Promise<FireResult>
  ```

## Function Design

### Size
- Small, single-responsibility functions preferred
- Example: `readLocalQueue()` reads, `appendQueueEntry()` writes, `pendingCount()` counts
- Max ~80 lines before considering extraction

### Parameters
- Use objects for multiple related parameters:
  ```typescript
  // Prefer:
  aggregateQueue({ fetchCloud: boolean })
  // Over:
  aggregateQueue(fetchCloud: boolean, includeArchived: boolean, ...)
  ```
- Type all parameters explicitly (strict mode enforced)

### Return Values
- Return early on error/edge cases:
  ```typescript
  if (idx === -1) return false;
  if (stat.mode & 0o777) !== 0o600) return error;
  ```
- Use consistent shapes (objects, arrays, null, or result objects)

## Module Design

### Exports
- Lib modules in `dashboard/lib/` export public functions + types:
  ```typescript
  export type QueueEntry = { ... };
  export function readLocalQueue(): QueueEntry[] { ... }
  ```
- Single file per module (no subdirectories within lib)
- Barrel exports (`index.ts`) not used; import directly from module

### File Organization
- Each lib module handles one concern:
  - `queue.ts`: read/write/update `queue.jsonl`
  - `settings.ts`: read/write settings, credentials, GitHub config
  - `approval.ts`: enqueue approved actions for re-execution
  - `cloud.ts`: list cloud routines from `routines-cloud/` directory
  - `cloud-cache.ts`: fetch + cache GitHub PRs matching `claude/sleepwalker/*` pattern
  - `audit.ts`: read audit log entries from `audit.jsonl`
  - `fire-routine.ts`: POST to /fire endpoints with bearer tokens

### Secret Handling
- **Never expose secrets**:
  - `getCloudCredential()` returns full token for internal use
  - `getCloudCredentialPublic()` returns safe view (configured: bool, host: string, no token)
  - Credentials stored at `~/.sleepwalker/cloud-credentials.json` with mode `0o600`
- **Secure operations**:
  ```typescript
  // settings.ts
  export function writeGithubToken(token: string): void {
    const f = tokenFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, token);
    fs.chmodSync(f, 0o600);  // Only owner can read
  }
  ```

## Reversibility Color System

Sleepwalker uses a three-level reversibility classification for deferral decisions:

### Green (Safe/Reversible)
- Read-only operations: `Read`, `Glob`, `Grep`, `WebSearch`, `NotebookRead`
- Safe bash commands: `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `fd`, `git log`, `git status`, `gh pr list`
- Decision: **Always allow** (under any policy)

### Yellow (Mildly Risky)
- File modifications: `Edit`, `Write`, `NotebookEdit`
- File system operations: `mkdir`, `mv`, `cp`
- Git operations that don't push: `git add`, `git commit`, `git stash`
- Decision: **Allow under balanced/yolo, defer under strict**

### Red (Irreversible/High-Risk)
- External state changes: `WebFetch`
- Destructive: `rm`, `rm -rf`
- Version control publishing: `git push`, `git reset --hard`, `git checkout --`, `gh pr create`, `gh issue close`
- Network calls that modify: `curl -X POST`, `curl -X DELETE`, `npm publish`
- Notifications: `osascript ... send`, `osascript ... delete`
- Decision: **Always defer** (under balanced/strict), only allow under yolo

### Policy Matrix
| Policy | Green | Yellow | Red |
|--------|-------|--------|-----|
| strict | allow | defer | defer |
| balanced | allow | allow | defer |
| yolo | allow | allow | allow |

---

*Conventions analysis: 2026-04-18*
