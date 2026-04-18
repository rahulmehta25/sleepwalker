# Codebase Structure

**Analysis Date:** 2026-04-18

## Directory Layout

```
sleepwalker/
├── README.md                           # Main project docs, feature table, quickstart
├── RESEARCH.md                         # Design rationale (architecture decisions, rejected options)
├── LICENSE                             # MIT
├── install.sh                          # Setup script: copies routines + hooks, wires hooks into ~/.claude/
│
├── docs/
│   ├── ARCHITECTURE.md                 # Architecture overview (this repo includes deep dive)
│   ├── QUICKSTART.md                   # User onboarding guide
│   ├── ROUTINES.md                     # Catalog of all 14 routines (Tier A + B features)
│   └── screenshots/                    # UI screenshots (queue, routines, audit, settings)
│
├── bin/
│   └── sleepwalker-execute             # Re-execution driver: reads approved tasks, invokes claude -p
│
├── hooks/                              # Hook scripts wired into ~/.claude/settings.json
│   ├── sleepwalker-defer-irreversible.sh    # PreToolUse: classify reversibility, defer to queue
│   ├── sleepwalker-budget-cap.sh            # PostToolUse: count tokens, halt if over budget
│   ├── sleepwalker-audit-log.sh             # PostToolUse: append all tool calls to audit.jsonl
│   ├── _detect_fleet.sh                     # Helper: parse transcript for [sleepwalker:fleet] marker
│   └── tests/
│       ├── run-tests.sh                     # Hook harness: 26 unit + integration tests
│       ├── install-idempotency.sh           # Verify install.sh idempotency
│       ├── e2e.sh                           # Synthetic E2E: real claude -p invocations with test prompts
│       └── *.sh                             # Individual hook test files
│
├── routines-local/                     # Tier B (Desktop Scheduled Tasks)
│   ├── sleepwalker-inbox-triage/
│   │   └── SKILL.md                    # Mail.app inbox triage: classify, draft replies, queue
│   ├── sleepwalker-downloads-organizer/
│   │   └── SKILL.md                    # ~/Downloads filing, stale item queue
│   ├── sleepwalker-calendar-prep/
│   │   └── SKILL.md                    # Tomorrow's meetings: calendar.app read, brief assembly
│   ├── sleepwalker-standup-writer/
│   │   └── SKILL.md                    # Daily standup from local git + calendar
│   ├── sleepwalker-screenshot-reviewer/
│   │   └── SKILL.md                    # Desktop screenshot OCR + classification
│   └── sleepwalker-disk-cleanup/
│       └── SKILL.md                    # brew/npm cache cleanup, DerivedData sweep
│
├── routines-cloud/                     # Tier C (Claude Code Routines)
│   ├── pr-reviewer/                    # GitHub PR review (opened/synchronize)
│   │   ├── config.json                 # Trigger types, repos, connectors
│   │   ├── prompt.md                   # Routine system prompt + instructions
│   │   └── setup.md                    # Manual setup steps for user
│   │
│   ├── dependency-upgrader/            # npm/pip/cargo deps (weekdays 04:00)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── doc-drift-fixer/                # README drift detection (Sun 03:00)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── test-coverage-filler/           # Uncovered function tests (Sat 02:00)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── dead-code-pruner/               # Unused exports (monthly)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── morning-brief/                  # Slack/Linear digest (weekdays 06:00)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── library-port/                   # Cross-language library port (on merged PR)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   ├── alert-triage/                   # Sentry/PagerDuty triage (API trigger)
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── setup.md
│   │
│   └── _test-zen/                      # Integration test bundle: fetches GitHub Zen wisdom
│       ├── config.json                 # Triggers: schedule (annual) + API
│       ├── prompt.md                   # Simple prompt, returns repo URL + zen quote
│       └── setup.md
│
├── dashboard/                          # Next.js Morning Queue UI (localhost:4001)
│   ├── package.json                    # Dependencies: next, react, typescript, vitest, tailwind
│   ├── next.config.js                  # Next.js config
│   ├── tsconfig.json                   # TypeScript strict mode
│   ├── tailwind.config.js              # Tailwind v4 (CSS custom properties for theme)
│   ├── postcss.config.js               # PostCSS plugins
│   ├── vitest.config.ts                # Vitest test runner config
│   │
│   ├── app/                            # Next.js app directory
│   │   ├── page.tsx                    # GET: /       Morning Queue (unified, SSR)
│   │   ├── layout.tsx                  # Root layout: header nav, theme provider
│   │   ├── globals.css                 # Global styles: Tailwind, custom properties, animations
│   │   │
│   │   ├── _components/                # Shared page components
│   │   │   └── page-header.tsx         # Title, subtitle, metadata pills
│   │   │
│   │   ├── queue-client.tsx            # Client component: swipe UI, approve/reject handlers
│   │   │
│   │   ├── routines/
│   │   │   └── page.tsx                # GET: /routines  Local fleet display + enable/disable
│   │   │
│   │   ├── cloud/
│   │   │   ├── page.tsx                # GET: /cloud     Cloud routines catalog + Run now buttons
│   │   │   └── fire/
│   │   │       └── route.ts            # POST: /api/cloud/fire  API trigger handler
│   │   │
│   │   ├── audit/
│   │   │   └── page.tsx                # GET: /audit     All tool calls from audit.jsonl
│   │   │
│   │   ├── settings/
│   │   │   └── page.tsx                # GET: /settings  Sleep window, policies, budgets, GitHub token, tracked repos, cloud credentials
│   │   │
│   │   └── api/                        # API routes (JSON endpoints)
│   │       ├── queue/
│   │       │   └── route.ts            # GET: list pending + recent (local + cloud aggregated)
│   │       │                           # POST: approve/reject/dismiss actions
│   │       │
│   │       ├── routines/
│   │       │   └── route.ts            # GET: list local routines + enabled status
│   │       │
│   │       ├── cloud/
│   │       │   ├── route.ts            # GET: list cloud routines + queue (optionally refresh GitHub polling)
│   │       │   └── fire/
│   │       │       └── route.ts        # POST: fire cloud routine (bearer token + beta headers)
│   │       │
│   │       ├── audit/
│   │       │   └── route.ts            # GET: paginated audit log entries
│   │       │
│   │       └── settings/
│   │           └── route.ts            # GET/POST: read/write settings, GitHub token, cloud credentials
│   │
│   ├── lib/                            # Domain logic & data access (TypeScript)
│   │   ├── queue.ts                    # QueueEntry interface, readLocalQueue, updateLocalStatus, appendQueueEntry
│   │   ├── cloud.ts                    # CloudRoutineConfig, listCloudRoutines, getCloudRoutine
│   │   ├── cloud-cache.ts              # fetchCloudQueue (GitHub polling), prToQueueEntry normalizer, TTL cache
│   │   ├── queue-aggregator.ts         # aggregateQueue: merge local + cloud, sort by timestamp
│   │   ├── approval.ts                 # enqueueForExecution: write task files for re-execution
│   │   ├── settings.ts                 # readSettings, writeSettings, GitHub token, cloud credentials (mode 600)
│   │   ├── github.ts                   # listSleepwalkerPRs (GitHub API polling), pingGitHub
│   │   ├── audit.ts                    # readAuditLog, parseAuditEntries
│   │   ├── routines.ts                 # readLocalRoutines (from ~/.claude/scheduled-tasks/)
│   │   └── fire-routine.ts             # fireRoutine: POST /fire endpoint with bearer token
│   │
│   ├── tests/                          # Vitest unit tests (43 total)
│   │   ├── approval.test.ts            # enqueueForExecution, pendingExecutionCount
│   │   ├── audit.test.ts               # parseAuditEntries, filtering
│   │   ├── cloud.test.ts               # listCloudRoutines, loading routines-cloud/
│   │   ├── cloud-cache.test.ts         # GitHub PR polling, cache TTL, normalization
│   │   ├── queue.test.ts               # readLocalQueue, updateLocalStatus
│   │   ├── queue-aggregator.test.ts    # aggregateQueue merging local + cloud
│   │   ├── routines.test.ts            # readLocalRoutines from ~/.claude/
│   │   ├── settings.test.ts            # readSettings, writeSettings, GitHub token CRUD
│   │   ├── fire-routine.test.ts        # fireRoutine: bearer token headers, error handling
│   │   └── helpers.ts                  # Test utilities: temp dir, mock data
│   │
│   └── .next/                          # Build output (generated, not committed)
│
└── .planning/codebase/                 # (Generated by /gsd-map-codebase)
    ├── ARCHITECTURE.md
    └── STRUCTURE.md
```

## Directory Purposes

**sleepwalker/ (root):**
- Purpose: Project root; contains setup script, docs, routine definitions, hooks, dashboard
- Key files: `install.sh` (entry point), `README.md` (overview), LICENSE

**docs/:**
- Purpose: User documentation
- Contains: Architecture guide, quickstart, routine catalog, screenshots
- Key files: `ARCHITECTURE.md` (deep dive), `QUICKSTART.md` (onboarding), `ROUTINES.md` (feature table)

**bin/:**
- Purpose: Executable scripts
- Contains: `sleepwalker-execute` (re-execution driver)
- Key files: `sleepwalker-execute` (reads approved tasks, runs `claude -p` with bypass env)

**hooks/:**
- Purpose: Claude Code hook scripts (PreToolUse, PostToolUse)
- Contains: Three safety hooks + fleet detector + test harness
- Key files: `sleepwalker-defer-irreversible.sh`, `sleepwalker-budget-cap.sh`, `sleepwalker-audit-log.sh`

**routines-local/:**
- Purpose: Tier B routine definitions (copied to `~/.claude/scheduled-tasks/` by install.sh)
- Contains: Six local routines, each with one SKILL.md file
- Key files: `sleepwalker-*/SKILL.md` (routine prompts with `[sleepwalker:name]` marker tag)

**routines-cloud/:**
- Purpose: Tier C routine definitions (referenced by dashboard, not copied)
- Contains: Eight cloud routines + _test-zen integration test, each with config/prompt/setup
- Key files: `*/config.json`, `*/prompt.md`, `*/setup.md`

**dashboard/ (app directory):**
- Purpose: Next.js app directory structure (routing, pages, API)
- Contains: Pages (queue, routines, cloud, audit, settings), API routes, layout
- Key files: `page.tsx` (Morning Queue), `queue-client.tsx` (swipe UI), `layout.tsx` (root)

**dashboard/lib/ (domain logic):**
- Purpose: Data access, business logic, utilities
- Contains: Queue operations, settings CRUD, GitHub polling, cloud credentials, approval workflow
- Key files: `queue.ts`, `settings.ts`, `cloud-cache.ts`, `approval.ts`

**dashboard/tests/ (unit tests):**
- Purpose: Vitest test suite for dashboard lib
- Contains: 43 tests covering queue, settings, approval, GitHub polling, cloud routines
- Key files: All `*.test.ts` files

## Key File Locations

**Entry Points:**

- `install.sh`: User runs this once to set up local fleet + hooks; orchestrates copy + hook wiring
- `dashboard/app/page.tsx`: Morning Queue UI entry point; server-side rendered, loads aggregated queue
- `dashboard/app/layout.tsx`: Root layout; navigation header, theme provider
- `bin/sleepwalker-execute`: Re-execution driver; reads approved task files, invokes `claude -p` with bypass

**Configuration:**

- `install.sh`: Wires hooks into `~/.claude/settings.json` (idempotent jq merge)
- `dashboard/lib/settings.ts`: Read/write `~/.sleepwalker/settings.json`, GitHub token, cloud credentials
- `routines-cloud/*/config.json`: Per-routine trigger config (schedule, GitHub event, API)
- `dashboard/vitest.config.ts`: Test runner config

**Core Logic:**

- `hooks/sleepwalker-defer-irreversible.sh`: PreToolUse classification + deferral
- `hooks/sleepwalker-budget-cap.sh`: PostToolUse token counting + halt decision
- `hooks/sleepwalker-audit-log.sh`: PostToolUse audit append
- `dashboard/lib/queue.ts`: QueueEntry CRUD + local JSONL parsing
- `dashboard/lib/cloud-cache.ts`: GitHub PR polling + cache + normalization
- `dashboard/lib/approval.ts`: Task file creation for re-execution
- `dashboard/lib/fire-routine.ts`: API trigger POST with bearer token

**Testing:**

- `hooks/tests/run-tests.sh`: Hook test harness (26 tests)
- `dashboard/tests/*.test.ts`: Vitest unit tests (43 tests)

## Naming Conventions

**Files:**

- `sleepwalker-<routine-name>/SKILL.md`: Local routine definition
- `sleepwalker-<routine-name>.sh`: Hook script or test utility
- `*.test.ts`: Vitest unit test file
- `.jsonl`: Append-only JSON lines (audit, queue)
- `.json`: Config or state file

**Directories:**

- `routines-local/`: Tier B routines (Desktop Scheduled Tasks)
- `routines-cloud/`: Tier C routines (Claude Code Routines)
- `hooks/`: Safety hook scripts
- `dashboard/app/`: Next.js pages and API routes
- `dashboard/lib/`: Domain logic and utilities
- `dashboard/tests/`: Test suite

**Variables & Identifiers:**

- `FLEET`: Routine name extracted from `[sleepwalker:name]` marker tag (e.g., "inbox-triage")
- `QueueEntry`: Unified abstraction for both local deferred + cloud PR entries
- `Reversibility`: green/yellow/red classification (used in PreToolUse, stored in queue entries)
- `Policy`: strict/balanced/yolo (per-fleet defer configuration)
- `Source`: "local" (from defer hook) or "cloud" (from GitHub PR polling)

## Where to Add New Code

**New Local Routine:**
- Implementation: Create `routines-local/sleepwalker-<name>/SKILL.md` with marker tag `[sleepwalker:<name>]`
- Markup: Follow SKILL.md frontmatter (name, description, constraints)
- Config: Add to `dashboard/lib/settings.ts` default policies + budgets
- Tests: Hook tests already cover defer/budget/audit; routine-specific logic tested via E2E

**New Cloud Routine:**
- Implementation: Create `routines-cloud/<id>/` with `config.json`, `prompt.md`, `setup.md`
- Config: Include `name`, `tier: "C"`, `triggers`, `repos`, `connectors`, `branch_policy`
- Prompt: Add `[sleepwalker:<id>]` marker tag at top (for consistency with local routines)
- Dashboard integration: Automatic (listCloudRoutines reads config.json)

**New API Route:**
- Location: `dashboard/app/api/<resource>/route.ts`
- Pattern: Export `GET` and/or `POST` handlers; use `NextResponse.json()`
- State Access: Use lib functions (readSettings, readLocalQueue, etc.)
- Examples: `api/queue/route.ts`, `api/cloud/fire/route.ts`

**New Page:**
- Location: `dashboard/app/<path>/page.tsx`
- Pattern: Server-side render (async function) or use `"use client"` for interactivity
- Components: Pull shared components from `_components/`
- Data: Call aggregator or lib functions; pass to client components or show SSR

**Utilities/Helpers:**
- Shared domain logic: `dashboard/lib/<domain>.ts`
- React components: `dashboard/app/_components/<name>.tsx`
- Test helpers: `dashboard/tests/helpers.ts`
- Examples: `cloud.ts` (routine loading), `github.ts` (API polling), `approval.ts` (task workflow)

## Special Directories

**~/.claude/ (After Install):**
- Purpose: Claude Code user directory (created by Claude Code Desktop)
- Generated: Yes (by Claude Code, created by install.sh via `mkdir -p`)
- Committed: No (local user directory)
- Contents:
  - `scheduled-tasks/sleepwalker-*/SKILL.md`: Local routines (copied from repo)
  - `hooks/sleepwalker-*.sh`: Hook scripts (copied from repo)
  - `settings.json`: Hook wiring (merged by install.sh jq script)

**~/.sleepwalker/ (After Install):**
- Purpose: Sleepwalker state directory
- Generated: Yes (by install.sh and hooks/dashboard at runtime)
- Committed: No (local state)
- Contents:
  - `queue.jsonl`: Deferred actions (append-only)
  - `audit.jsonl`: All tool calls (append-only)
  - `settings.json`: User config
  - `budgets.json`: Token counters (per-session)
  - `github-token`: GitHub PAT (mode 600)
  - `cloud-credentials.json`: Routine API endpoints + bearer tokens (mode 600)
  - `cloud-cache.json`: GitHub PR poll snapshot
  - `tracked-projects.json`: Local repos
  - `sessions/`: Fleet detection cache (per-session)
  - `approved/`: Task files waiting for executor
  - `executed/`: Executed tasks (archive)

**dashboard/.next/:**
- Purpose: Next.js build output
- Generated: Yes (by `pnpm build` or dev server)
- Committed: No (in .gitignore)
- Contents: Compiled pages, routes, static assets

**routines-cloud/_test-zen/:**
- Purpose: Integration test routine (validates GitHub PR polling, API trigger, re-execution)
- Generated: No (committed to repo)
- Committed: Yes
- Contents: Minimal routine that fetches GitHub Zen wisdom to validate bridge

---

*Structure analysis: 2026-04-18*
