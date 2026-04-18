# External Integrations

**Analysis Date:** 2026-04-18

## APIs & External Services

**GitHub:**
- Service: GitHub API for repository polling and PR management
  - SDK/Client: gh (CLI for cloud routines), native Node.js fetch (dashboard)
  - Auth: Personal access token stored in `~/.sleepwalker/github-token`
  - Usage: Cloud routines detect PR events, dashboard polls for Sleepwalker PRs on tracked repos
  - Endpoints: v2022-11-28 (Accept: application/vnd.github+json)

**Anthropic Claude Code Routines (Beta):**
- Service: Cloud-hosted routine execution with webhook triggers
  - SDK/Client: None (direct HTTP POST to routine-specific /fire endpoint)
  - Auth: Per-routine bearer token stored in `~/.sleepwalker/cloud-credentials.json`
  - Usage: Dashboard "Run now" feature fires routines manually; routines trigger via GitHub webhooks, scheduled CRON, or external API webhooks
  - Endpoint contract: POST to {routine_url}/fire with Authorization header, anthropic-beta and anthropic-version headers
  - Response: Returns claude_code_session_id and session_url for viewing execution

**Anthropic Claude Code Desktop:**
- Service: Local machine execution via Desktop Scheduled Tasks
  - SDK/Client: claude CLI tool invoked with -p flag (prompt) and --permission-mode bypassPermissions
  - Auth: OAuth keychain-managed credentials (claude login)
  - Usage: Scheduled tasks run routines on Mac; defer/re-execution via sleepwalker-execute script
  - Integration: Hooks wired into ~/.claude/settings.json (PreToolUse, PostToolUse)

## Data Storage

**Databases:**
- Not used. All state is file-based JSON and JSONL in `~/.sleepwalker/`

**File Storage:**
- Local filesystem only: `~/.sleepwalker/` directory
  - settings.json - Configuration (sleep window, policies, budgets, tracked repos)
  - queue.jsonl - Local defer queue (one JSON object per line)
  - audit.jsonl - Audit trail of executed actions
  - budgets.json - Per-session token spending (fleet_name__session_id → tokens)
  - github-token - GitHub personal access token (600 mode, not committed)
  - cloud-credentials.json - Per-routine API /fire endpoint URLs and bearer tokens (600 mode, not committed)
  - cloud-cache.json - Cached cloud PR list (1-minute TTL, re-fetched on demand)
  - approved/ - Task files awaiting re-execution by sleepwalker-execute
  - executed/ - Completed task results

**Caching:**
- In-memory: None (dashboard is stateless)
- File-based: `~/.sleepwalker/cloud-cache.json` (1-minute TTL for GitHub PR polling)

## Authentication & Identity

**Auth Provider:**
- Custom multi-token approach (no centralized auth service):
  - GitHub personal access token (user configures in dashboard Settings)
  - Claude Code OAuth (system-level, managed by claude CLI)
  - Per-routine Anthropic bearer tokens (dashboard Settings → Cloud Routines tab)

**Implementation:**
- GitHub: stored plaintext in `~/.sleepwalker/github-token` (600 mode)
- Cloud routines: stored plaintext in `~/.sleepwalker/cloud-credentials.json` (600 mode, with URL and configuredAt timestamp)
- Dashboard validates token presence before allowing GitHub-dependent features

## Monitoring & Observability

**Error Tracking:**
- None. Errors logged to `~/.sleepwalker/audit.jsonl` as structured JSON entries

**Logs:**
- Audit trail: `~/.sleepwalker/audit.jsonl` (append-only JSONL)
  - Local routine events: PreToolUse defer decisions, PostToolUse token budget checks, re-execution results
  - Cloud routine decisions: approve/reject/dismiss actions recorded with timestamp and fleet name
  - Format: {ts, fleet, event, tool, args, status, output_preview, ...}

## CI/CD & Deployment

**Hosting:**
- Development: localhost:4001 (Next.js dev server on user's Mac)
- Production: Not deployed; this is a local-only tool (though cloud routines run on Anthropic infra)

**CI Pipeline:**
- None configured. Local dev workflow only

## Environment Configuration

**Required env vars:**
- HOME - Used to resolve `~/.sleepwalker/` state directory (defaults to os.homedir())

**Secrets location:**
- `~/.sleepwalker/github-token` - GitHub personal access token (plaintext, 600 mode)
- `~/.sleepwalker/cloud-credentials.json` - Routine API tokens (JSON, 600 mode)
- Not in .env files (no .env files present in dashboard/)
- Not committed to git (.gitignore covers ~/.sleepwalker/)

## Webhooks & Callbacks

**Incoming:**
- Claude Code Routines /fire endpoint: dashboard can POST to trigger cloud routines manually
- GitHub webhook events: Routines configured to listen for pull_request.opened, pull_request.synchronize, and custom API triggers
- External webhooks: alert-triage routine accepts Sentry/PagerDuty webhooks via /fire endpoint with text payload

**Outgoing:**
- GitHub: cloud routines create PRs, post review comments, close issues (via gh CLI)
- No outbound webhooks to external services (Sleepwalker is sink-only)

## Protocol & API Contracts

**Claude Code PreToolUse Hook:**
- stdin: {session_id, transcript_path, tool_name, tool_input}
- stdout: {hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow"|"deny"|"ask"|"defer"}}
- Implementation: `hooks/sleepwalker-defer-irreversible.sh`

**Claude Code PostToolUse Hook:**
- stdin: {session_id, transcript_path, tool_input, tool_response, tool_output}
- stdout: {} (continue) or {continue: false, stopReason: "..."}
- Implementations: `hooks/sleepwalker-budget-cap.sh`, `hooks/sleepwalker-audit-log.sh`

**Sleepwalker Re-execution Protocol:**
- Dashboard approves deferred action → writes to ~/.sleepwalker/approved/{id}.task
- sleepwalker-execute script polls ~/.sleepwalker/approved/ every 15 minutes
- Invokes `claude -p` with SLEEPWALKER_REEXECUTING=1 env var
- Hook respects env var and bypasses re-defer, allowing tool to execute
- Result appended to ~/.sleepwalker/audit.jsonl

**Cloud Routine Config Schema:**
- Located: `routines-cloud/{id}/config.json`
- Fields: name, tier ("C"), triggers (schedule/github/api), repos, connectors, env_vars, recommended_schedule, branch_policy, approx_runs_per_week
- Prompt: `routines-cloud/{id}/prompt.md` (markdown instruction for Claude)
- Setup: `routines-cloud/{id}/setup.md` (user setup documentation)

## Data Flows

**Local Routine Execution:**
1. Claude Code Desktop runs SKILL.md at scheduled time
2. PreToolUse hook intercepts irreversible tools (git push, rm, etc.)
3. If deferred: hook appends to ~/.sleepwalker/queue.jsonl with status:pending
4. PostToolUse hook counts tokens, records to audit.jsonl, stops if budget exceeded
5. User sees queue entry in Morning Queue dashboard
6. User approves → entry written to ~/.sleepwalker/approved/{id}.task
7. sleepwalker-execute script re-runs `claude -p` with tool+args
8. Result recorded to audit.jsonl, task file moved to executed/

**Cloud Routine Execution:**
1. Routine triggers via GitHub event, API /fire endpoint, or schedule
2. Routine runs in Anthropic cloud with access to git, gh CLI, MCP connectors
3. Routine creates branch `claude/sleepwalker/{routine_id}/{id}` and opens PR
4. Dashboard polls GitHub API every 1 minute (cached) for open PRs with head branch matching `claude/sleepwalker/*`
5. Cloud PR appears in Morning Queue alongside local entries
6. User reviews PR (inline comments, context visible)
7. User clicks approve/dismiss on queue entry → recorded to local queue.jsonl as decision
8. Human manually merges/closes PR on GitHub (Sleepwalker does not auto-merge)

**GitHub Token Configuration:**
1. User navigates to /settings in dashboard
2. Enters GitHub personal access token (scopes: repo, workflow)
3. Dashboard stores in ~/.sleepwalker/github-token (600 mode)
4. Cloud queue polling enabled → fetches all tracked repos' open PRs

**Cloud Routine API Trigger Configuration:**
1. User navigates to /cloud in dashboard
2. Selects routine, clicks "Configure API trigger"
3. User copies /fire endpoint URL + bearer token from claude.ai/code/routines
4. Pastes into dashboard form (token shown once, stored in cloud-credentials.json)
5. User clicks "Run now" → dashboard POSTs to /fire endpoint with Authorization header
6. Routine executes immediately on Anthropic cloud

---

*Integration audit: 2026-04-18*
