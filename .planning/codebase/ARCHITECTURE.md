# Architecture

**Analysis Date:** 2026-04-18

## Pattern Overview

**Overall:** Two-tier hybrid execution model with unified approval queue.

Sleepwalker is built on a **Local Tier B (Desktop Scheduled Tasks) + Cloud Tier C (Claude Code Routines)** hybrid architecture. The local fleet can touch your Mac directly (Mail.app, Downloads, Calendar, local repos). The cloud fleet runs on Anthropic infrastructure with GitHub event triggers and API endpoints. Both tiers feed into a single Morning Queue UI that defers all irreversible actions overnight, surfaces them at wake-up (07:00), and provides one swipe-through approval interface.

**Key Characteristics:**
- Two execution surfaces unified into one queue: local JSONL + GitHub PR polling
- Three hook scripts enforce safety on local tier: defer, budget, audit
- Reversibility classification (green/yellow/red) guides per-fleet policies
- Per-routine API triggers with bearer-token credentials (mode 0600)
- Fleet detection via `[sleepwalker:routine-name]` marker tag in routine prompts
- Re-execution loop: approve → write task file → `bin/sleepwalker-execute` → fresh `claude -p` with bypass env

## Layers

**Layer 3: Morning Queue UI (Next.js Dashboard):**
- Purpose: Unified approval surface for both local and cloud queue entries
- Location: `dashboard/` (Next.js app router)
- Contains: React pages, API routes, domain logic (queue, settings, approval)
- Depends on: Local JSONL files, GitHub API (via `github-token`), cloud routine configs
- Used by: User at wake-up time (07:00), dashboard web interface at `localhost:4001`

**Layer 2a: Local Hook Safety (Bash Scripts):**
- Purpose: Enforce defer policies, budget caps, and audit logging for Tier B routines
- Location: `hooks/` (three hook scripts + fleet detector)
- Contains: PreToolUse (defer-irreversible), PostToolUse (budget-cap), PostToolUse (audit-log)
- Depends on: Claude Code hook schema (JSON stdin/stdout)
- Used by: Claude Code Desktop, wired into `~/.claude/settings.json`

**Layer 2b: Cloud Safety (GitHub + Subscription):**
- Purpose: Route cloud routine output to `claude/sleepwalker/*` branches for human review
- Location: Cloud Routines at claude.ai/code/routines (external, not in repo)
- Contains: Per-routine configuration, API trigger endpoints
- Depends on: GitHub repos, Anthropic Routine infrastructure
- Used by: GitHub event webhooks, API caller (dashboard "Run now" button)

**Layer 1a: Tier B / Local Fleet (Desktop Scheduled Tasks):**
- Purpose: Run overnight busywork on your Mac (mail, downloads, calendar, local repos)
- Location: `routines-local/` (SKILL.md files, copied to `~/.claude/scheduled-tasks/` by install.sh)
- Contains: sleepwalker-inbox-triage, downloads-organizer, calendar-prep, standup-writer, screenshot-reviewer, disk-cleanup
- Depends on: Local file system, Mail.app, Calendar.app, AppleScript access, local git repos
- Used by: cron/scheduler triggers (minute granularity)

**Layer 1b: Tier C / Cloud Fleet (Claude Code Routines):**
- Purpose: Run on Anthropic infrastructure with GitHub and API triggers
- Location: `routines-cloud/` (config.json, prompt.md, setup.md for each routine)
- Contains: pr-reviewer, dependency-upgrader, doc-drift-fixer, test-coverage-filler, dead-code-pruner, morning-brief, library-port, alert-triage (+ _test-zen for validation)
- Depends on: GitHub repos, MCP connectors (Slack, Linear, Sentry), Routine API
- Used by: GitHub event webhooks, cron schedules, API `/fire` endpoints

## Data Flow

**Local Queue → Dashboard (Layer 1a → Layer 3):**

1. Local routine runs during sleep window (23:00–07:00)
2. PreToolUse hook detects `[sleepwalker:fleet]` marker tag in routine prompt
3. For red/yellow reversibilities, hook appends JSON entry to `~/.sleepwalker/queue.jsonl`
4. Hook returns `permissionDecision: "defer"` to Claude Code
5. PostToolUse budget hook increments per-fleet token counter
6. PostToolUse audit hook appends entry to `~/.sleepwalker/audit.jsonl`
7. At 07:00, user opens dashboard
8. Dashboard reads `queue.jsonl` with source="local"
9. User swipes through, approves/rejects
10. Approved entries written to `~/.sleepwalker/approved/<id>.task` by `lib/approval.ts`

**Approved Task → Re-execution (Layer 3 → Layer 1a):**

1. User approves deferred action in Morning Queue
2. Dashboard calls `enqueueForExecution(entry)` → writes task file to `~/.sleepwalker/approved/`
3. User runs `bin/sleepwalker-execute` (can be scheduled, or manual)
4. Executor reads task file, builds re-run prompt with `[sleepwalker:fleet]` marker
5. Executor invokes `SLEEPWALKER_REEXECUTING=1 claude -p --permission-mode bypassPermissions`
6. PreToolUse hook sees env var, allows action immediately (no re-defer loop)
7. Tool executes, result logged to audit
8. Task file moved to `~/.sleepwalker/executed/` directory

**Cloud Queue → Dashboard (Layer 1b → Layer 3):**

1. Cloud routine completes, pushes to `claude/sleepwalker/<routine>/<date>` branch
2. GitHub PR created, visible on GitHub
3. Dashboard polls GitHub API: `GET /repos/{owner}/{repo}/pulls?state=open&head=claude/sleepwalker`
4. GitHub library (`lib/github.ts`) iterates all tracked repos, filters for `claude/sleepwalker/*` head branches
5. `lib/cloud-cache.ts` normalizes GitHub PR into `QueueEntry` shape (with source="cloud")
6. Cache TTL = 60 seconds, falls back to stale cache on fetch error
7. Dashboard merges local + cloud entries, sorts by timestamp (descending)

**Cloud Routine Approval (Layer 3 → Layer 1b):**

1. User swipes through Morning Queue, sees cloud PR entry
2. User chooses "Approve" → dashboard appends decision entry to local queue (for audit)
3. User manually merges PR on GitHub (dashboard does not auto-merge; humans retain control)
4. Merged PR closed → cloud routine continues (if it's a long-running task)

**API Trigger (Dashboard → Layer 1b):**

1. Dashboard displays "Run now" button for cloud routines with API trigger
2. User clicks → dashboard calls `fireRoutine(routineId, optionalContext)`
3. `lib/fire-routine.ts` reads bearer-token credential from `~/.sleepwalker/cloud-credentials.json`
4. Sends POST to Routine's `/fire` endpoint with `Authorization: Bearer {token}` + beta headers
5. Returns session URL if successful
6. Routine starts execution immediately

**State Management:**

Local state files (all in `~/.sleepwalker/`):
- `queue.jsonl`: Deferred actions from PreToolUse hook (append-only until approved/rejected)
- `audit.jsonl`: All tool calls across all fleets (append-only)
- `settings.json`: User config (sleep window, policies, budgets, enabled routines, tracked repos)
- `budgets.json`: Per-session token counter (reset on new session)
- `github-token`: GitHub PAT (mode 600, for cloud queue polling)
- `cloud-credentials.json`: Per-routine API trigger URL + bearer token (mode 600)
- `cloud-cache.json`: Most recent GitHub PR poll snapshot
- `tracked-projects.json`: List of local repos to scan (for local routines)
- `sessions/<session-id>.fleet`: Fleet name cache (so we don't re-parse transcript on every tool call)
- `approved/<id>.task`: Approved deferred tasks waiting for executor
- `executed/<id>.task`: Executed tasks (archive)

Dashboard state is read-only (config files) + append-only (queue).

## Key Abstractions

**QueueEntry (Unified Abstraction for Both Tiers):**
- Purpose: Represents one queued action, whether from local hook or cloud PR
- Examples: `dashboard/lib/queue.ts`, `dashboard/lib/cloud-cache.ts`
- Pattern: JSON with `id`, `ts`, `fleet`, `reversibility`, `status` (local) + `kind`, `payload` (cloud PR)

**Fleet Detection via Marker Tag:**
- Purpose: Identify which sleepwalker routine owns a session/transcript
- Examples: `hooks/_detect_fleet.sh` parses transcript for `[sleepwalker:routine-name]`
- Pattern: Each routine SKILL.md or prompt.md includes literal tag; cached in `~/.sleepwalker/sessions/`

**Reversibility Classification:**
- Purpose: Determine which tool calls should be deferred
- Examples: Green (Read, Bash ls), Yellow (Edit, Bash mv), Red (WebFetch, Bash push)
- Pattern: PreToolUse hook classifies per tool name + bash command pattern
- Policy-driven: `strict` (defer yellow+red), `balanced` (defer red only), `yolo` (allow all, outside sleep window only)

**Hook Chain (Safety Layers):**
- Purpose: Apply three independent safety checks to every tool call in sleepwalker sessions
- Examples: PreToolUse (defer), PostToolUse (budget), PostToolUse (audit)
- Pattern: Each hook reads JSON from stdin, writes JSON to stdout; Claude Code chains them

**Task File for Deferred Re-execution:**
- Purpose: Preserve original tool args so approved actions can be re-run without re-deferring
- Examples: `~/.sleepwalker/approved/<id>.task` → loaded by `bin/sleepwalker-execute`
- Pattern: JSON with `fleet`, `tool`, `args`, `reversibility`, `session`, `approvedAt`; env bypass `SLEEPWALKER_REEXECUTING=1` prevents re-defer

## Entry Points

**Installation / Setup:**
- Location: `install.sh`
- Triggers: User runs `./install.sh` once to set up local fleet
- Responsibilities: Copy routines to `~/.claude/scheduled-tasks/`, copy hooks to `~/.claude/hooks/`, wire hooks into `~/.claude/settings.json` (idempotent)

**Local Routine Execution:**
- Location: `routines-local/sleepwalker-<name>/SKILL.md`
- Triggers: Claude Code Desktop, cron schedule (user enables from dashboard)
- Responsibilities: Task-specific logic (inbox triage, downloads org, etc.); calls to defer hook via tool calls

**Hook Entry (PreToolUse):**
- Location: `hooks/sleepwalker-defer-irreversible.sh`
- Triggers: Claude Code on every tool call in sleepwalker sessions
- Responsibilities: Detect fleet, classify reversibility, defer to queue if policy/reversibility match

**Hook Entry (PostToolUse / Budget):**
- Location: `hooks/sleepwalker-budget-cap.sh`
- Triggers: Claude Code after every tool response in sleepwalker sessions
- Responsibilities: Count tokens, increment per-session budget, halt if exceeded

**Hook Entry (PostToolUse / Audit):**
- Location: `hooks/sleepwalker-audit-log.sh`
- Triggers: Claude Code after every tool response in sleepwalker sessions
- Responsibilities: Append JSON entry to audit log with tool name, args, output preview

**Dashboard (Morning Queue):**
- Location: `dashboard/app/page.tsx`, `dashboard/app/queue-client.tsx`
- Triggers: User opens `localhost:4001` at wake-up
- Responsibilities: Load local + cloud queues, display pending actions, handle approve/reject, route to re-execution

**Dashboard (Routines Page):**
- Location: `dashboard/app/routines/page.tsx`
- Triggers: User clicks "Routines" tab
- Responsibilities: List local fleet members, toggle enable/disable, display per-routine config, show budget + policy

**Dashboard (Cloud Routines Page):**
- Location: `dashboard/app/cloud/page.tsx`
- Triggers: User clicks "Cloud" tab
- Responsibilities: List cloud routines from `routines-cloud/`, display triggers/repos/connectors, link to `/schedule create` deeplink, show "Run now" button if API trigger configured

**Dashboard (Settings Page):**
- Location: `dashboard/app/settings/page.tsx`
- Triggers: User clicks "Settings" tab
- Responsibilities: Configure sleep window, policies, budgets, GitHub token, tracked repos, cloud routine credentials

**Dashboard (Audit Page):**
- Location: `dashboard/app/audit/page.tsx`
- Triggers: User clicks "Audit" tab
- Responsibilities: Display all actions (local + cloud) from `~/.sleepwalker/audit.jsonl`, filtered/sorted, with reversal colors

**Re-execution Executor:**
- Location: `bin/sleepwalker-execute`
- Triggers: User runs manually or schedules via SKILL.md
- Responsibilities: Read approved task files, invoke `claude -p` with bypass env, append result to audit log

**Cloud Routine API Trigger:**
- Location: `dashboard/lib/fire-routine.ts` (frontend), Routine's `/fire` endpoint (backend)
- Triggers: User clicks "Run now" button on cloud routine card
- Responsibilities: Load credentials, POST to `/fire` with bearer token + beta headers, return session URL

## Error Handling

**Strategy:** Fail-safe with fallback, never lose data.

**Patterns:**

1. **Queue File Operations**: Always append-only; never truncate. If write fails, logged to stderr but does not halt agent.
2. **GitHub API Failures**: `lib/cloud-cache.ts` catches fetch errors, falls back to stale cache (up to last successful poll). Dashboard shows `cloudError` flag in UI.
3. **Settings File Corruption**: `readSettings()` catches JSON parse errors, returns `DEFAULT_SETTINGS`.
4. **Task File Cleanup**: After re-execution, task file is **moved** (not deleted) to `executed/` directory as archive.
5. **Fleet Detection Cache Miss**: If transcript is unavailable or `[sleepwalker:]` tag not found, hook bails out fast with `allow` (no-op).
6. **Budget Exceeded**: PostToolUse hook returns `continue: false` to halt agent, logs `budget_exceeded` event to audit.
7. **Credential Not Found**: `fireRoutine()` returns error response with `ok: false`, dashboard shows error message instead of attempting POST.
8. **Pre-flight Checks**: `install.sh` exits if `jq` not installed, providing clear error message.

## Cross-Cutting Concerns

**Logging:** 

- Append-only audit log at `~/.sleepwalker/audit.jsonl`
- PostToolUse audit hook captures every tool call: timestamp, fleet, tool name, args, output preview (500 chars)
- Re-execution script appends result entries
- User can export/rotate via dashboard Settings page

**Validation:**

- PreToolUse hook validates tool name + bash command against reversibility patterns
- Settings schema enforced by TypeScript interfaces in `dashboard/lib/settings.ts`
- Cloud routine config validates against `CloudRoutineConfig` interface
- GitHub token tested via `pingGitHub()` before using for PR polling

**Authentication:**

- GitHub PAT stored in `~/.sleepwalker/github-token` (mode 600)
- Cloud API bearer token stored in `~/.sleepwalker/cloud-credentials.json` (mode 600, never returned by GET)
- Public-safe view via `getCloudCredentialPublic()` (only shows configured/yes, host, timestamp)
- Dashboard API endpoints check credentials before polling GitHub

**Reversibility & Deferral:**

- PreToolUse hook classifies every tool call before execution
- Policies applied per-fleet (strict/balanced/yolo)
- Sleep window check gates policy enforcement (outside window, hook allows all, no defer)
- `SLEEPWALKER_REEXECUTING=1` env var bypasses defer hook on re-execution

**Token Budget:**

- PostToolUse budget hook counts input + output char length / 4 as approximation
- Per-fleet, per-session counters in `~/.sleepwalker/budgets.json`
- Budget reset at start of each new session (first PostToolUse zeros counter)
- Halt decision cached; once over budget, all subsequent PostToolUse calls return deny

**Fleet Detection & Isolation:**

- Each routine SKILL.md / prompt.md contains `[sleepwalker:routine-name]` marker tag
- Fleet detector script reads transcript, parses marker, caches in `sessions/<session-id>.fleet`
- Hooks use fleet name to apply per-fleet policies/budgets
- Non-sleepwalker sessions (no marker tag found) skip all defer/budget/audit logic

---

*Architecture analysis: 2026-04-18*
