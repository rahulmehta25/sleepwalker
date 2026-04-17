# Sleepwalker Architecture

## Three layers, two execution surfaces

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Layer 3: Morning Queue UI                          │
│                    (Next.js dashboard, localhost:4001)                   │
│                                                                          │
│   Reads from TWO queue sources, presents ONE unified swipe-through:      │
│   1. ~/.sleepwalker/queue.jsonl       (local routines via defer hook)   │
│   2. open claude/sleepwalker/* PRs    (cloud routines via GitHub poll)  │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ approve / reject / undo
                ┌────────────────────┼────────────────────┐
                ▼                                         ▼
┌────────────────────────────────────┐   ┌────────────────────────────────┐
│   Layer 2a: Local hook safety      │   │   Layer 2b: Cloud safety       │
│                                    │   │                                │
│   PreToolUse  → defer-irreversible │   │   claude/-prefixed branches    │
│   PostToolUse → budget-cap         │   │   GitHub branch protection      │
│   PostToolUse → audit-log          │   │   Per-routine subscription cap  │
└────────────────────┬───────────────┘   └─────────────────┬──────────────┘
                     │ allow / deny / defer                │ open PR
                     ▼                                     ▼
┌────────────────────────────────────┐   ┌────────────────────────────────┐
│   Layer 1a: Tier B (local)         │   │   Layer 1b: Tier C (cloud)     │
│   ~/.claude/scheduled-tasks/       │   │   claude.ai/code/routines      │
│                                    │   │                                │
│   sleepwalker-inbox-triage         │   │   pr-reviewer                  │
│   sleepwalker-downloads-organizer  │   │   dependency-upgrader          │
│   sleepwalker-calendar-prep        │   │   doc-drift-fixer              │
│   sleepwalker-standup-writer       │   │   test-coverage-filler         │
│   sleepwalker-screenshot-reviewer  │   │   dead-code-pruner             │
│   sleepwalker-disk-cleanup         │   │   morning-brief                │
│                                    │   │   library-port                 │
│   Triggers: cron only (≥1 min)     │   │   alert-triage                 │
│                                    │   │                                │
│   Access: full Mac                 │   │   Triggers: cron, GitHub, API  │
│                                    │   │   Access: GitHub repos +       │
│                                    │   │           MCP connectors only  │
└────────────────────────────────────┘   └────────────────────────────────┘
```

## Why hybrid

I considered three architectures and rejected the first two.

### Option 1: Tier B only (rejected)

Pure Desktop Scheduled Tasks. Why I rejected it:
- Requires Mac to be awake — bad for the canonical "while you sleep" use case (closed laptop)
- No GitHub event triggers — PR Reviewer would have to poll
- No per-routine API endpoint — can't wire to Sentry/PagerDuty/iOS Shortcut
- Locks out the cleanest cloud-native workflows (dependency upgrades, library ports)

### Option 2: Tier C only (rejected)

Pure Routines. Why I rejected it:
- No Mail.app, no Calendar, no `~/Downloads`, no local Photos
- No local repo access (Routines clone GitHub repos into the cloud sandbox)
- Loses ~40% of the high-value overnight workflows

### Option 3: Hybrid (chosen)

Each fleet member is assigned to the tier that matches what it actually touches. The dashboard unifies both into one Morning Queue.

| Routine | Reason for tier | Tier |
|---------|----------------|------|
| Inbox Triager | Mail.app is local | B |
| Downloads Organizer | `~/Downloads` is local | B |
| Calendar Prep | Calendar.app is local | B |
| Standup Writer | Reads local git across multiple projects | B |
| Screenshot Reviewer | Reads `~/Desktop` screenshots | B |
| Disk Cleanup | brew/npm caches are local | B |
| **PR Reviewer** | **GitHub `pull_request.opened` is exactly the cloud trigger** | **C** |
| **Dependency Upgrader** | **Schedule + open PR from `claude/` branch — perfect Routines fit** | **C** |
| **Doc-Drift Fixer** | **Operates on GitHub repos, opens PR** | **C** |
| **Test Coverage Filler** | **GitHub-native, runs tests in cloud sandbox** | **C** |
| **Dead Code Pruner** | **Same** | **C** |
| **Morning Brief** | **Slack/Linear connectors — laptop closed is fine** | **C** |
| **Library Port** | **`pull_request.closed` (merged) trigger — direct doc example** | **C** |
| **Alert Triage** | **API trigger from Sentry/PagerDuty webhook** | **C** |

## The unified Morning Queue

Two sources, one card stack.

### Source 1: Local jsonl (Tier B → defer hook)

When a Tier-B routine runs and tries to do something irreversible during the sleep window:

```json
{
  "id": "q_01HX...",
  "ts": "2026-04-18T02:00:18Z",
  "fleet": "downloads-organizer",
  "tool": "WebFetch",
  "args": { "url": "...", "prompt": "..." },
  "reversibility": "red",
  "session": "...",
  "status": "pending"
}
```

The defer hook appends this to `~/.sleepwalker/queue.jsonl`. The dashboard reads the file. Approve = re-run; reject = drop.

### Source 2: GitHub PR poll (Tier C → claude/sleepwalker/* branches)

When a Tier-C Routine completes, it pushes to a `claude/sleepwalker/<routine>/<date>` branch and opens a PR. The dashboard polls GitHub for open PRs matching `claude/sleepwalker/*` across all tracked repos.

```
GET /repos/{owner}/{repo}/pulls?state=open&head=claude/sleepwalker
  → [
      {
        "url": "https://github.com/.../pull/142",
        "title": "[sleepwalker] dependency-upgrader: bump 12 deps",
        "body": "Updated next 15.1.4 → 15.2.0, react 19.0.0 → 19.0.1, ...",
        "head": { "ref": "claude/sleepwalker/deps/2026-04-18" },
        "user": { "login": "claude-bot" }
      }
    ]
```

The dashboard normalizes this into the same `QueueEntry` shape as the local source. Approve = `gh pr merge`; reject = `gh pr close`.

## File layout

### In this repo

```
sleepwalker/
├── README.md
├── install.sh                          # Sync local routines + hooks into ~/.claude
├── docs/
│   ├── ARCHITECTURE.md                 # This file
│   ├── QUICKSTART.md                   # User onboarding
│   └── ROUTINES.md                     # Catalog of all 14 routines
├── routines-local/                     # Tier B (Desktop Scheduled Tasks)
│   ├── sleepwalker-inbox-triage/
│   │   └── SKILL.md
│   ├── sleepwalker-downloads-organizer/
│   │   └── SKILL.md
│   └── ... (4 more)
├── routines-cloud/                     # Tier C (Routines on claude.ai)
│   ├── pr-reviewer/
│   │   ├── prompt.md                   # Prompt body for /schedule create
│   │   ├── setup.md                    # Manual install steps
│   │   └── config.json                 # Triggers, repos, connectors, env vars
│   ├── dependency-upgrader/
│   └── ... (6 more)
├── hooks/                              # Local hook scripts
│   ├── sleepwalker-defer-irreversible.sh
│   ├── sleepwalker-budget-cap.sh
│   ├── sleepwalker-audit-log.sh
│   └── tests/                          # bash test harness
├── dashboard/                          # Next.js Morning Queue
│   ├── app/
│   │   ├── page.tsx                    # Morning Queue (unified)
│   │   ├── routines/page.tsx           # Local fleet
│   │   ├── cloud/page.tsx              # Cloud fleet (Routines)
│   │   ├── audit/page.tsx              # Action log
│   │   ├── settings/page.tsx           # Config
│   │   └── api/
│   │       ├── queue/route.ts
│   │       ├── routines/route.ts
│   │       ├── cloud/route.ts          # Polls GitHub for claude/sleepwalker/* PRs
│   │       ├── audit/route.ts
│   │       └── settings/route.ts
│   └── lib/
│       ├── queue.ts
│       ├── audit.ts
│       ├── routines.ts
│       ├── cloud.ts                    # GitHub PR polling
│       ├── settings.ts
│       └── github.ts
└── tests/                              # vitest + playwright
```

### After install (state)

```
~/.claude/
├── scheduled-tasks/
│   ├── sleepwalker-inbox-triage/SKILL.md       (copied from routines-local/)
│   └── ... (5 more)
├── hooks/
│   ├── sleepwalker-defer-irreversible.sh        (copied from hooks/)
│   ├── sleepwalker-budget-cap.sh
│   └── sleepwalker-audit-log.sh
└── settings.json                               (hooks wired in, idempotent)

~/.sleepwalker/
├── queue.jsonl                                 # Local-only queue
├── audit.jsonl                                 # All actions, both tiers (cloud writes via GitHub poll cache)
├── budgets.json                                # Token budgets per fleet
├── settings.json                               # Sleep window, policies, enabled routines
├── tracked-projects.json                       # Repos for local fleet to scan
├── github-token                                # ghp_... (set via dashboard, mode 600)
└── cloud-cache.json                            # Most recent GitHub PR poll cache
```

## Reversibility classification

The defer hook classifies every Tool call into one of three colors before deciding to allow or queue.

| Color | Meaning | Example tools / commands |
|-------|---------|--------------------------|
| **Green** | Pure read | `Read`, `Glob`, `Grep`, `WebSearch`, `Bash(ls/cat/grep/git log/git status)` |
| **Yellow** | Reversible write | `Edit`, `Write` (in worktree), `Bash(mv/cp/mkdir/git add/git commit/git stash/git worktree)` |
| **Red** | Irreversible / external | `WebFetch`, `Bash(rm/git push/git reset --hard/curl POST/gh pr create/npm publish)` |

Defer policy (configurable per fleet member):
- `strict` — defer all yellow + red
- `balanced` — allow yellow, defer red (default)
- `yolo` — allow everything (only honored outside the sleep window)

## Token budget enforcement

Every PostToolUse, the budget hook reads the input/output character counts from the hook payload, divides by 4 for a token approximation, and increments the running total in `~/.sleepwalker/budgets.json`. When the total exceeds `settings.json -> budgets.<fleet>` (default 50,000), the hook returns `permissionDecision: "deny"` and the agent halts.

Budgets reset at the start of each scheduled run (the routine's first PostToolUse zeros its counter).

## Sleep window

`~/.sleepwalker/settings.json`:

```json
{
  "sleep_window": { "start_hour": 23, "end_hour": 7 },
  "policies": { "inbox-triage": "balanced", ... },
  "budgets":  { "inbox-triage": 50000, ... },
  "enabled_routines": [],
  "tracked_repos": ["rahulmehta25/osmoti-backend", "rahulmehta25/codebase-wikipedia"]
}
```

Outside the sleep window, hooks operate in "interactive" mode — no defer, no budget cap. This lets the same routines be triggered manually during the day for testing without surprise behavior.

## Why this is differentiated vs Devin / Cursor / Replit / Lindy

| Concern | Devin / Cursor / Replit / Lindy | Sleepwalker |
|---------|--------------------------------|-------------|
| Cost surprise | Self-billed at $0.04/req or per-ACU; users report $1k/wk overruns | Token cap per fleet via PostToolUse hook (Tier B) + subscription-bound (Tier C) |
| False "done" | Reports success even on partial work | Tier B: defer hook surfaces every irreversible step. Tier C: every output is a reviewable PR |
| Audit trail | Scattered across product UI, terminal, GitHub | One `~/.sleepwalker/audit.jsonl` + one Morning Queue UI |
| Local file access | Cloud-only or fragile bridge | Tier B has full Mac access via SKILL.md permissions |
| GitHub-native | Various third-party bridges | Tier C is native Claude Code Routines with `pull_request.opened` triggers |

## Roadmap

### v0.2

- iOS companion app (push notifications + voice notes for approval)
- Slack-bot delivery of Morning Brief and approval requests
- Per-routine cost dashboards (sparkline, weekly trend)
- Marketplace of community-contributed routines

### v0.3

- Multi-Mac sync via iCloud Drive (`~/.sleepwalker/` synced across devices)
- Optional self-hosted relay (replace GitHub PR polling with webhooks)
- Audit log compression + retention policy
