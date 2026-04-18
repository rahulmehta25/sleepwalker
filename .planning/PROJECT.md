# Sleepwalker

## What This Is

Sleepwalker is an overnight-agent fleet manager. A single dashboard at `localhost:4001` lets you author, schedule, and approve the output of AI coding agents running across multiple runtimes — Claude Code Routines (cloud), Claude Code Desktop Scheduled Tasks (local Mac), OpenAI Codex Pro (local Mac), and Google Gemini CLI Pro (local Mac). v0.1 shipped 2026-04-17 with 14 prebuilt routines and a unified Morning Queue; v0.2 turns the dashboard into a one-click deployment surface for **net-new** routines across all four runtimes.

## Core Value

Write a prompt + pick a schedule + pick a runtime → click once → a live agent exists on that runtime, scheduled, audited, and reviewed from one place. No copy-paste, no terminal, no multi-step wiring.

## Requirements

### Validated

<!-- Shipped in v0.1 (2026-04-17) — confirmed by real Claude Code hook invocations, Anthropic API round-trip, and green test suites (43 Vitest + 26 bash tests). -->

- ✓ Local fleet of 6 Desktop Scheduled Tasks (`routines-local/sleepwalker-*`) — existing
- ✓ Cloud fleet of 8 Claude Code Routines + 1 test-zen bundle (`routines-cloud/`) — existing
- ✓ Morning Queue UI unifying local JSONL + GitHub PR polling (`dashboard/`) — existing
- ✓ Three PreToolUse / PostToolUse hooks: defer-irreversible, budget-cap, audit-log — existing
- ✓ Per-routine API trigger with bearer-token credentials (mode 0600, Run-now button) — existing
- ✓ Fleet detection via `[sleepwalker:routine-name]` marker tag — existing
- ✓ Defer → approve → re-execute loop with `SLEEPWALKER_REEXECUTING=1` bypass env — existing
- ✓ Idempotent `install.sh` that merges into `~/.claude/settings.json` — existing
- ✓ Reversibility-color-coded defer policies (green / yellow / red) — existing
- ✓ Zero-interference bailout for non-Sleepwalker Claude Code sessions — existing

### Active

<!-- v0.2 scope. Building toward these. All are hypotheses until shipped. -->

- [ ] Dashboard **routine editor**: form-based UI for prompt + schedule + runtime + reversibility → click "Save" → routine persists to disk (`routines-<runtime>/<slug>/`) immediately
- [ ] Dashboard **Save-to-repo** button: commits the authored routine bundle to git (local commit, no auto-push) so authored routines are versioned alongside prebuilt ones
- [ ] Dashboard **one-click deploy** per routine: wires the routine into its target runtime (launchd plist written / Desktop scheduled-tasks symlink created / Claude Routine `/schedule create` payload emitted + opened in browser)
- [ ] Runtime adapter: **Claude Code Routines** (cloud) — deploy via API where possible, fall back to pre-filled `/schedule create` URL if not
- [ ] Runtime adapter: **Claude Code Desktop Scheduled Tasks** — deploy by copying SKILL.md into `~/.claude/scheduled-tasks/<slug>/` and verifying via Desktop's SQLite state file where accessible
- [ ] Runtime adapter: **Codex Pro** (via `codex` CLI on Mac) — deploy by writing a launchd plist that invokes `codex -p <prompt-file>`
- [ ] Runtime adapter: **Gemini CLI Pro** (via `gemini` CLI on Mac) — deploy by writing a launchd plist that invokes `gemini` with the prompt
- [ ] Trigger support: **cron schedule** (every runtime) via launchd/Mac for local & CLI runtimes, via the runtime's native scheduler for Claude Routines
- [ ] Trigger support: **manual Run-now** via dashboard button for every runtime (bearer-token API trigger for Claude Routines, direct CLI shell-out for local/CLI runtimes)
- [ ] Unified **audit surface**: Codex / Gemini CLI runs stream stdout/stderr into `~/.sleepwalker/audit.jsonl` with a normalized shape, so the existing audit UI just works
- [ ] Unified **Morning Queue entries** for CLI runtimes: agent stdout → parsed artifact → queue entry with `source: "codex" | "gemini"` in the same shape as `"local"` and `"cloud"`
- [ ] Approximate **token/cost cap** for non-Claude runtimes (character-based, same approximation as v0.1's budget-cap hook but applied to CLI stdout/stderr)
- [ ] OSS-quality **docs + templates**: a `docs/AUTHORING.md` walkthrough + an empty template per runtime (`templates/routine-<runtime>.md`) so external users can write their first routine in under 10 minutes
- [ ] Backward compatibility: every existing v0.1 routine (14 prebuilt + hooks + install.sh) keeps working without change

### Out of Scope

<!-- Documented exclusions with reasoning — prevents scope creep during planning. -->

- Amp (SourceGraph) support — different CLI surface, different auth model; defer to v0.3
- Devin support — hosted platform with its own UI; doesn't fit the "local launchd" pattern; defer to v0.3
- GitHub event triggers for non-Claude runtimes — requires a webhook receiver or polling loop beyond launchd; defer to v0.3
- User-provided cloud VM as execution host — real infra, real auth flow; defer to v0.3
- Sleepwalker-hosted scheduler (shared cron) — turns OSS into SaaS; explicitly off-ramp for this milestone
- Auto-runtime-selection ("which runtime should run this prompt?") — interesting but out of scope; user picks
- Webhook triggers beyond the Run-now button (PagerDuty, Sentry, deploy pipelines for non-Claude) — defer to v0.3
- Multi-tenant auth / team accounts — Sleepwalker stays single-user-on-Mac for v0.2
- Runtime output *comparison* (fan-out one prompt → 4 runtimes → diff) — tempting, but scope creep

## Context

**Origin:** v0.1 was Anthropic-surface-only (Claude Code Routines + Claude Code Desktop). v0.2 is the moment Sleepwalker stops being "Claude fleet manager" and becomes "Claude + Codex + Gemini fleet manager." The user has paid plans on all three + Amp + Devin; the OSS artifact demonstrates that one dashboard can orchestrate every CLI-shaped agent runtime on your Mac.

**Codebase snapshot (see `.planning/codebase/`):**
- ~1,935 lines of mapper output across 7 documents
- Dashboard: Next.js 15 App Router, TypeScript, Vitest — the natural place for the editor
- Hooks: bash with `set -euo pipefail`, jq, clean test harness; adding a `token-cap` equivalent for CLI stdout is ~1 hook-sized change
- Concerns already surfaced by mapper: reversibility classification is hardcoded in bash (v0.2 editor should write into a config file instead), budget accounting is ±40% approximate, concurrent JSONL writes can race — v0.2 work will brush against all three

**Ecosystem positioning:** Devin / Cursor BG / Replit Agent / Lindy / OpenAI Operator all have the same three complaints (surprise bills, false "done," no audit). Sleepwalker's bet is that being multi-runtime + local + OSS is more defensible than any single hosted competitor.

## Constraints

- **Runtime**: macOS + launchd for local/CLI cron — user's Mac must be awake during the scheduled slot. No cloud execution in v0.2.
- **Auth**: Each runtime owns its own CLI/API auth (`claude login`, `codex login`, `gemini auth`, Routine bearer tokens). Sleepwalker never centralizes or proxies keys.
- **CLI availability**: Target users are assumed to have `claude`, `codex`, and `gemini` on their PATH. Dashboard detects availability and dims unavailable runtimes.
- **Compatibility**: v0.1 routines, hooks, and `install.sh` must keep working unchanged. New functionality layers on top.
- **OSS quality**: Code readable, documented, no magic. `docs/AUTHORING.md` + per-runtime templates must be in scope, not an afterthought.
- **Footprint**: Zero new always-on processes. No background daemon beyond what launchd already provides.
- **Performance**: Dashboard "click deploy" must complete in <3 seconds for local/CLI runtimes; Claude Routine deployment may take longer if it requires browser handoff.
- **Security**: Bearer tokens and CLI auth tokens stay in files with mode 0600; no plaintext in git; no tokens in dashboard logs.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Support exactly 4 runtimes in v0.2 (Claude Routines, Claude Desktop, Codex Pro, Gemini CLI Pro) | User has all 4; they share the "CLI that takes a prompt" shape; Amp + Devin defer because they don't | — Pending |
| Cron via launchd on the user's Mac (not cloud VM, not hosted) | Zero infra, zero ongoing cost, matches the v0.1 ethos; Mac-must-be-awake is an acceptable tradeoff for an OSS reference impl | — Pending |
| Hybrid editor (disk-first, Save-to-repo optional) | Fastest possible authoring loop; git is opt-in so experiments don't pollute history; matches existing `routines-local/` / `routines-cloud/` directory convention | — Pending |
| Only cron + manual Run-now triggers in v0.2 | Covers 95% of the "overnight agent fleet" use case; webhooks and GitHub events add big infra surface area, defer | — Pending |
| OSS reference implementation is the shape of success | Rahul already has the paid product idea backlog; this milestone's ROI is credibility + stars + docs, not revenue | — Pending |
| Multi-runtime, not runtime-comparison | Shipping "4 runtimes work" is a clean story; shipping "fan-out + diff" doubles the surface and splits focus | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-18 after initialization*
