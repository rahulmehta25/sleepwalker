# Sleepwalker: Research Brief
*Compiled 2026-04-17*

## Top-Line Insight

The cross-cutting complaint across **every** overnight-agent product (Devin, Cursor BG agents, Replit Agent, Lindy, Operator) is the **same**: cost surprises, false "done" claims, and no good answer to *"what did it do while I was asleep?"*. Sleepwalker wins by being native to Claude Code Desktop's scheduled-tasks tier, using the `defer` hook decision to build a single-pane morning review queue, and hard-bounding token budgets per fleet member.

## Claude Code's Three Scheduling Tiers

| Tier | Where | Persistence | Trust model | Use for |
|------|-------|-------------|-------------|---------|
| **A. CronCreate / `/loop`** | Open session | 7-day max | Inherits session permissions | Active polling, in-session loops |
| **B. Desktop Scheduled Tasks** | `~/.claude/scheduled-tasks/<id>/SKILL.md` | Persistent | Per-task permission mode + "Always allowed" list | **Sleepwalker's substrate** |
| **C. Routines** | Anthropic cloud (research preview) | Persistent | Branch sandbox + cloud env scoping | GitHub webhook agents, no local file access |

**Tier B is Sleepwalker.** Frequencies: Manual / Hourly / Daily / Weekdays / Weekly. At-most-one missed-run replay over last 7 days when machine wakes. Optional per-task **git worktree isolation** built in. Requires "Keep computer awake."

## Hooks = Sleepwalker's Safety Rails

- Events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`, `SessionEnd`
- Handler types: `command` (shell), `http`, `prompt` (LLM judge, 30s), `agent` (subagent verifier, 60s)
- Decisions: `allow` / `deny` / `ask` / **`defer`** (pauses for external UI)
- Async support: `async: true`, `asyncRewake: true` (post-tool validators wake Claude on failure)

**The `defer` decision is THE killer primitive for the Morning Queue.** Park every irreversible overnight action; serve a swipe-through approval flow at wake.

## Programmatic Interface

- `mcp__scheduled-tasks__create_scheduled_task` (cron, fireAt, ad-hoc; stores `SKILL.md`)
- `mcp__scheduled-tasks__list_scheduled_tasks`
- `mcp__scheduled-tasks__update_scheduled_task` (partial updates, enable/disable, notification subscribe)
- `schedule` skill (conversational wrapper)
- **Claude Agent SDK** (renamed from Claude Code SDK): same loop programmatically
- **Managed Agents** (`managed-agents-2026-04-01` beta): hosted long-horizon harness, sessions, environments, SSE streaming, steer/interrupt mid-execution

## Competitor Landscape — Who's Ahead, What People Hate

| Product | What works | Universal complaint |
|---------|-----------|---------------------|
| **Devin (Cognition)** | Async backlog grunt work, migrations | ~14% real success rate, ACU billing opaque, "spirals after ~10 ACUs" |
| **Cursor Background Agents** | Parallel work, 2.0 was leap | $135/wk burn, 47-iteration overnight runs, claims done when not |
| **Replit Agent v3** | 200-min autonomy, self-healing | $1000/wk surprise bills, brute-forced auth, redesigned UIs without permission |
| **Lindy.ai** | "Offensive productivity," 30hr w/ Sonnet 4.5 | Credit pricing punishing |
| **OpenAI Operator** | Most stable web automation | Slow/expensive/error-prone, **needs active session, not true background**, prompt-injection fears |
| **Skyvern / AutoGPT / BabyAGI** | Browser templates | Loop stalls, hallucinated plans |
| **n8n / Zapier Agents** | Predictable, deterministic | Per-task pricing brutal, not built for agentic loops |
| **GitHub Copilot Cloud Agent** | Tight PR loop | Tied to GitHub repo, not personal-Mac scope |

## High-Value Overnight Workflows (Real Demand)

1. **Inbox triage with morning digest** — labels, drafts top 5, calendar invites, single approve-all/reject-all. Saves "60-120 min/day."
2. **PR/code review batch** — overnight reviews; avg PR waits 20hrs for first review.
3. **Codebase maintenance loops** — dependency upgrades, test coverage, dead-code pruning, doc-drift fixes.
4. **Research aggregation / morning brief** — overnight news + Slack/Linear digests + recommended next-day tasks.
5. **File organization** — Downloads/Desktop/Screenshots, receipts → Drive folders, photos by event.
6. **Weekly reports / standups** — pulled from commits, tickets, calendar.
7. **Bill/expense reconciliation, subscription audits, calendar prep packets.**

## Trust/Approval UX — Best Patterns

Mature systems converge on:
- **Timestamped action-audit log grouped by task**
- **Reversibility color-coding**: green = pure read, yellow = reversible write, red = irreversible/external
- **Per-action selective undo**
- **Before/after diff views** for every modification
- **Single-pane morning review queue** that batches everything overnight into one swipe-through approval (THIS IS THE GAP nobody fills well)

## 5 Differentiated Angles for Sleepwalker

1. **Native to Claude Code Desktop, not a wrapper.** Each fleet member is a Tier-B scheduled task with its own `SKILL.md`, permission scope, "Always allowed" allowlist. OS-level trust boundary, not a YAML config.
2. **The Morning Queue (`defer`-hooked review surface).** `PreToolUse` hooks with `permissionDecision: "defer"` park irreversible actions overnight; at wake, Sleepwalker presents one swipe-through diff stack. **The UX hole Devin/Cursor/Replit all leave open.**
3. **Local-first, cost-bounded fleets.** Runs on user's Mac (Tier B), not Anthropic cloud — file access, calendar, Mail.app, Photos, local repos all work. Per-fleet token budgets enforced by `PostToolUse` hooks. Directly answers cost-surprise complaint.
4. **Worktree-per-task isolation by default.** Every code-touching agent runs in a separate git worktree. "Undo" is `git worktree remove`, not a guess.
5. **Curated agent roster, not blank prompts.** Devin/Cursor make you write the prompt. Win = hand-tuned library of 15-20 fleet members shipped as versioned skills.

## Recommended v1 Fleet (15 starter routines)

**Productivity:**
1. Inbox Triager (Mail.app + GPT label/draft)
2. Calendar Prep Packet (briefs for tomorrow's meetings)
3. Subscription Auditor (scan email + bills for unused subs)
4. Receipt Filer (Desktop screenshots → Drive folders)

**Code:**
5. PR Reviewer (GitHub PRs queued for me, batch comment)
6. Dependency Upgrader (npm/pip/cargo, auto-PR on green)
7. Test Coverage Filler (target uncovered functions, write tests)
8. Doc-Drift Fixer (regenerate stale docstrings/READMEs)
9. Dead Code Pruner (find unused, propose removal in worktree)

**Knowledge:**
10. Morning Brief (overnight news + Slack/Linear digest + tomorrow's TODO)
11. Standup Writer (pull from commits/tickets/calendar)
12. Weekly Report (Friday: what shipped, what's next)

**Mac maintenance:**
13. Downloads Organizer (categorize + file)
14. Screenshot Reviewer (Vision OCR + classify keep/delete)
15. Disk Cleanup (homebrew old versions, npm cache, Xcode DerivedData)

## Sources

- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/desktop-scheduled-tasks
- https://code.claude.com/docs/en/hooks
- https://platform.claude.com/docs/en/managed-agents/overview
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously
- https://www.lindy.ai/blog/devin-review
- https://dev.to/ai-agent-economy/set-a-spending-limit-before-your-cursor-agent-goes-rogue-3od6
- https://www.theregister.com/2025/09/18/replit_agent3_pricing/
- https://www.aiuxdesign.guide/patterns/action-audit-trail
- https://aimaker.substack.com/p/build-ai-email-triage-agent-automation-make-tutorial
- https://www.xda-developers.com/let-ai-agent-organize-my-entire-pc-and-it-actually-worked/
