# Feature Research

**Domain:** Multi-runtime AI-agent deployment dashboard (OSS reference implementation, single-user-on-Mac, local-first + cloud-hybrid)
**Researched:** 2026-04-18
**Confidence:** HIGH (features grounded in v0.2 PROJECT.md Active requirements + convergent patterns across n8n / Airflow / Temporal / Prefect / LaunchControl / CrewAI Studio / LangSmith / GitHub Actions / Lingon / Render deploy buttons)

## Scope Anchor (Read Before Proceeding)

Every feature below ties back to `PROJECT.md` "Active" requirements. The core flow this milestone must nail is:

> User opens `localhost:4001` → clicks "New Routine" → writes a prompt → picks a schedule → picks one of 4 runtimes (Claude Routines, Claude Desktop, Codex Pro, Gemini CLI Pro) → clicks "Deploy" → a live scheduled agent exists on that runtime, discoverable in the Morning Queue like the 14 prebuilt ones.

Everything that doesn't serve that sentence is a candidate for anti-feature list.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the product feel incomplete for a "multi-runtime agent deployment dashboard."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Routine editor form** (name, prompt, runtime, schedule, reversibility, budget) | Every orchestrator (n8n, Zapier, Airflow UI, LangSmith) has a creation form with required/optional fields marked | MEDIUM | Next.js form in `dashboard/app/routines/new/page.tsx`; fields = name (slug-validated), description, prompt textarea, runtime radio, schedule input, reversibility (green/yellow/red radio), per-run budget, policy (strict/balanced/yolo). Required fields get asterisks; shape mirrors Zapier's "asterisk-required" UX. |
| **Runtime picker with availability detection** | Users expect the dashboard to know what's installed (`brew doctor`, `gh extension list` green-check pattern, Lingon's "problem description for invalid services") | MEDIUM | Detect `claude`/`codex`/`gemini` binaries via `which`; show green check if installed+authed, gray+tooltip if missing. Dim unavailable runtimes in the picker (matches PROJECT.md constraint). |
| **Cron schedule input with human-readable preview** | Every modern cron UI shows "Runs every weekday at 3:00 AM" below the raw expression (crontab.guru, Crontab.io, Beekeeper Studio, Lingon X's natural-language toolbar) | SMALL | Reuse `cronstrue` (npm, 20KB, MIT); render human translation inline. Accept both cron expr and presets ("nightly", "weekdays 3am"). No custom parser — too many edge cases. |
| **"Save" writes to disk immediately** | Every file-based orchestrator (Airflow DAGs folder, n8n workflow JSON, GitHub Actions YAML) persists immediately; users expect "Save = durable" | SMALL | Write to `routines-<runtime>/<slug>/` matching v0.1 convention. `config.json` + `prompt.md` + (for cloud) `setup.md`. Disk-first is explicitly in PROJECT.md Key Decisions. |
| **"Deploy" button per routine** | The phrase "one-click deploy" is the milestone's headline; Render/Railway/Vercel all ship a single button that moves code → live | MEDIUM | Per-runtime adapter writes plist (local/CLI) or emits `/schedule create` URL (Claude Routines). Show spinner + result toast. Must complete <3s for local/CLI per PROJECT.md Constraint. |
| **Deploy status indicator** | Every orchestrator surfaces "deployed / not deployed / drift detected" (n8n Active toggle, Airflow paused/unpaused, LaunchControl service status) | SMALL | Three states per routine card: Draft (on disk, not deployed), Deployed (wired into runtime), Drift (disk ≠ runtime). Read plist existence / Desktop symlink / Routines-API state. |
| **Runs list (per routine + global)** | Non-negotiable — Symphony/Airflow/Temporal/Prefect/LangSmith all open to a runs list; 2025/2026 consensus: "observability is non-negotiable" | MEDIUM | Filter by routine, runtime, status, date. This IS the existing Morning Queue extended. Add a "Runs" tab that's all-runs-ever, not just pending. |
| **Drill-in to a single run: logs + status + cost** | Azure Durable Task, Dagster, Temporal all let you open one run and see the full story. Minimum bundle: stdout/stderr tail, exit code, duration, approximate cost, tool calls (already in audit.jsonl) | MEDIUM | `/runs/[id]/page.tsx`. Read audit.jsonl filtered by session/routine + stdout/stderr files for CLI runtimes. Tail UI with line-count, pre-wrap. Not streaming live in v0.2 — see anti-features. |
| **Run-now button (manual trigger)** | Already shipped in v0.1 for Claude Routines; users expect the same for every runtime | SMALL | For local/CLI: shell out to `claude`/`codex`/`gemini` with the prompt, pipe stdout to `~/.sleepwalker/audit.jsonl` with normalized shape. PROJECT.md Active: explicit requirement. |
| **Per-routine enable/disable toggle** | Every scheduler dashboard has this (n8n Active switch, Airflow pause toggle, LaunchControl enable/disable "with a single click") | SMALL | Toggle writes state to `settings.json`; deploy adapter checks state on next cron tick. Also unload-and-reload the plist on toggle. |
| **Secrets UX: reveal-once + mode-0600 file storage** | Already the v0.1 pattern for bearer tokens; BYOK is table stakes per OWASP + 1Password/Infisical conventions. Factory CLI's "API keys remain local, not uploaded" is the mental model users expect here | SMALL | Continue v0.1 pattern: `~/.sleepwalker/cloud-credentials.json` mode 0600. Per PROJECT.md Constraint: "Sleepwalker never centralizes or proxies keys." Each runtime's CLI owns its own auth (`claude login`, `codex login`, `gemini auth`). Dashboard just detects auth status via CLI's own whoami command. |
| **Audit log view** | Already shipped in v0.1; v0.2 just needs to handle `source: "codex" \| "gemini"` additions. Datadog Live Tail / Docker logs `-f` pattern is the reference | SMALL | Extend existing `/audit` page. PROJECT.md Active: "Unified audit surface: Codex/Gemini CLI runs stream stdout/stderr into `~/.sleepwalker/audit.jsonl` with a normalized shape." |
| **Templates: one starter per runtime** | GitHub Actions workflow templates, Airflow DAG samples, Temporal SDK samples all ship starter files. OSS credibility requires this | SMALL | `templates/routine-claude-routine.md`, `templates/routine-claude-desktop.md`, `templates/routine-codex.md`, `templates/routine-gemini.md`. Empty-but-structured, with comments explaining fields. PROJECT.md Active requirement. |
| **Docs: `AUTHORING.md` walkthrough** | Every OSS reference implementation has a "build your first X in 10 min" guide (Render render.yaml docs, Railway template docs, GitHub Actions quickstart) | SMALL | Single file in `docs/AUTHORING.md`. Show the full loop: open dashboard → click New → fill form → deploy → see first run. Explicit PROJECT.md Active requirement ("under 10 minutes"). |
| **Runtime health badges on dashboard landing** | Copies `brew doctor` / `gh extension list` / LaunchControl "highlighted invalid services" pattern. 2026 convention: `doctor` command is now standard (Flutter, gemini-cli GitHub issue #18692 requesting one, AWS Doctor) | SMALL | Top strip on `/` shows four badges: Claude Routines (API reachable?), Claude Desktop (SQLite state readable?), Codex CLI (binary + auth?), Gemini CLI (binary + auth?). Each clickable → docs on how to fix. |
| **"Click-to-copy" for any CLI commands we still require** | v0.1 already uses this for `/schedule create`. Users expect it everywhere terminal paste is needed | TRIVIAL | Standard clipboard button component, reused from v0.1. |
| **Error messages with remediation** | Users complain about Airflow's cryptic errors. "Specific and actionable, no stack traces" is universal requirement | SMALL | Every deploy failure says what's wrong ("codex CLI not found at /usr/local/bin/codex") + how to fix ("install via `brew install codex-cli`"). Matches global CLAUDE.md rule. |

### Differentiators (Competitive Advantage)

Features where Sleepwalker v0.2 can uniquely win. These align with the Core Value from PROJECT.md: "Write a prompt + pick a schedule + pick a runtime → click once → a live agent exists on that runtime, scheduled, audited, and reviewed from one place."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Four runtimes unified under one schema** | No other OSS tool orchestrates Claude Routines + Claude Desktop + Codex + Gemini from one dashboard. LangSmith is Claude-only-ish; CrewAI Studio is framework-locked; n8n doesn't know CLI tools; Lingon doesn't know agents. Sleepwalker is the only Venn-diagram-center candidate. | HIGH | This IS the milestone. Concretely: `RuntimeAdapter` interface with `{ deploy(config), undeploy(id), runNow(id), getStatus(id), getLogs(id) }` implemented four times. Same `RoutineConfig` type feeds all four. |
| **Zero-centralization secrets story** | Every hosted orchestrator (LangSmith, Langfuse, Zapier, n8n Cloud) wants your API keys on their servers. Sleepwalker's "each CLI owns its auth, we never touch keys" is a real security differentiator for OSS + Mac users. | SMALL | Already table-stakes code-wise; the differentiator is marketing/docs. README prominently states "we never see your API keys" — it's what BYOK users actually want to hear. Factory CLI has this same positioning. |
| **Reversibility-aware authoring (green/yellow/red in the editor)** | Shipped in v0.1 but only for prebuilt routines. Making users *pick* reversibility when authoring is rare — most tools treat all actions equal. This is Sleepwalker's safety story made first-class. | SMALL | Radio in editor: "What's the worst this routine can do?" green (read-only)/yellow (modifies files)/red (touches network/git). Picks policy automatically. Educates users as they author. |
| **Runtime comparison panel (read-only)** | Not fan-out execution (see anti-features), just "here's the tradeoff matrix between the 4 runtimes" shown inline in the editor when picking | SMALL | Static table: Cost per run (rough), Speed, Can-write-files (Desktop yes, Routines via PR), Has-hooks (Claude yes, Codex/Gemini no), Awake-required (local yes, cloud no). Helps users pick without committing to a fan-out product. |
| **Approximate token/cost cap for CLI runtimes** | PROJECT.md Active: "character-based, same approximation as v0.1's budget-cap hook but applied to CLI stdout/stderr." Codex/Gemini have no native hooks, so the dashboard being the cost gatekeeper is a real feature | MEDIUM | Wrap `codex`/`gemini` CLI invocation in bash that counts bytes on stdout/stderr. If over cap, `kill -TERM` the child and log `budget_exceeded` to audit. Reuses v0.1's ±40% approximation (acceptable per CONCERNS.md). |
| **Test-run mode (dry deploy)** | GitHub Agentic Workflows and OpenAI Agent Builder ship preview/dry-run as differentiators. A "run this once, locally, interactively, don't schedule it yet" button is a common authoring need | MEDIUM | Before "Deploy," offer "Test Run" that invokes the runtime synchronously with the prompt, streams output into a modal, doesn't persist a plist. Catches "my prompt is broken" before scheduling. |
| **Save-to-repo button (git commit authored routine)** | PROJECT.md Active requirement. GitHub Actions workflow files live in `.github/workflows/` and get committed; Airflow DAGs are committed. Making git opt-in preserves the experimentation loop while letting users version routines they like. | SMALL | After "Save," show "Commit to repo" button. Shell-out `git add routines-<runtime>/<slug> && git commit -m "add routine: <name>"`. No push. Matches PROJECT.md Key Decision: "git is opt-in so experiments don't pollute history." |
| **Two-tier editor: "Simple" (form) + "Advanced" (raw file)** | LaunchControl's "Standard Editor + Expert mode" pattern. Airflow users who "get stuck on basics" need the form; power users need the file | SMALL | Toggle button on editor. Simple = fields. Advanced = raw markdown+frontmatter textarea. Both write the same files. |
| **Drift detection (disk vs. runtime)** | Novel for the agent space. Borrowed from k8s `kubectl diff` and Airflow's DAG-vs-code comparison. "Your `routines-local/foo/SKILL.md` is newer than what's deployed" is actionable. | MEDIUM | Compare mtime of local SKILL.md vs. mtime of installed `~/.claude/scheduled-tasks/<slug>/SKILL.md` (or plist mtime for CLI). Badge "drift" on routine card, offer "Redeploy" button. |
| **Unified Morning Queue with `source` field extended** | Already shipped for local+cloud in v0.1. Extending to 4 runtimes means the same swipe UI reviews every agent's overnight output. This is the moat. | SMALL | PROJECT.md Active: add `source: "codex" \| "gemini"` to existing `QueueEntry`. Queue aggregator already merges; just add two more sources. |
| **"Copy as curl" / "Copy as task" export** | Power-user feature: if the user wants to invoke the same routine from a script, shell alias, or CI, export the right snippet per runtime | TRIVIAL | Button on each routine card. Emits `curl -H "Authorization: Bearer ..." https://.../fire` for cloud routines; emits `claude -p "$(cat prompt.md)"` or equivalent for local/CLI. |

### Anti-Features (Commonly Requested, Often Problematic)

These are where every orchestrator tool loses users to complexity. Document them so they don't sneak in during implementation.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Visual drag-and-drop workflow builder** | CrewAI Studio, n8n, Zapier all have one; looks impressive in demos | Doubles the UI surface area, duplicates what file-based editing does, users end up wanting "how do I see the file anyway?". Airflow's complaint: "the web UI is slow" correlates with visual builder weight. | Form-based editor only. If users want visual, they can author a markdown file. Matches v0.2 Active requirement ("form-based UI"). |
| **Fan-out: one prompt → 4 runtimes → diff results** | User's own brain will want this the moment they see the 4-runtime picker | Explicitly in PROJECT.md Out of Scope ("doubles the surface and splits focus"); requires a diff viewer, a comparison schema, and 4× the cost per run. | Defer to v0.3. Differentiator instead: static comparison matrix in editor. |
| **Auto-runtime-selection ("which runtime should run this prompt?")** | Feels magical; every AI-era product wants "smart" defaults | Explicitly in PROJECT.md Out of Scope. Requires a classifier, eval corpus, feedback loop. 90% of the time the user already knows which CLI they want. | User picks. Show cost+speed+capability trade-off matrix; let human decide. |
| **Live log streaming via SSE/WebSockets** | Datadog Live Tail, Heroku logs `-f` are the references; users "expect real-time" | New infra (SSE endpoint or WS server), concurrency bugs, stale-connection handling, mobile battery drain. PROJECT.md Constraint: "Zero new always-on processes." | Show last N lines from audit.jsonl + stdout/stderr files; "Refresh" button. Streaming is a v0.3 win. |
| **Multi-tenant / team accounts / sharing** | Every dashboard gets this request eventually | PROJECT.md Out of Scope ("Sleepwalker stays single-user-on-Mac for v0.2"). Opens up auth, authz, cloud backend, billing. | OSS-first, single-user-first. If a team wants this, they fork. |
| **Webhooks beyond "Run now"** (PagerDuty, Sentry, deploy pipelines for non-Claude) | Claude Routines already has it for cloud; people will ask "where's mine on Codex?" | PROJECT.md Out of Scope. Requires a public webhook receiver → port forwarding / ngrok / reverse proxy on the user's Mac. Huge infra surface. | Users can script around the existing API trigger for Claude; for CLI runtimes, defer to v0.3. |
| **Built-in scheduler daemon (sleepwalker-cron)** | "Why not our own cron? Then we don't depend on launchd" | PROJECT.md Constraint: "Zero new always-on processes. No background daemon beyond what launchd already provides." launchd is already running; adding a second scheduler is duplication. | Use launchd for local/CLI; use runtime's native scheduler for Claude Routines. Dashboard writes config; scheduler runs it. |
| **Real tokenizer for budget cap** | CONCERNS.md notes ±40% accuracy of current char/4 approximation; tempting to "fix" | Accurate tokenization requires either (a) Claude's token-counter API (rate-limit + latency) or (b) shipping tiktoken (new dependency). v0.1's approximation is fine for "stop runaway agents" use case. | Keep character-based. Document in README that it's ±40%. v0.3 problem if at all. |
| **Full MCP secret manager integration** | Infisical / 1Password / AWS Secrets Manager would look professional | Users already have `~/.claude/`, `~/.codex/`, `~/.gemini/` auth; introducing an abstraction layer conflicts with CLI's native auth. PROJECT.md Constraint: "Sleepwalker never centralizes or proxies keys." | Each CLI handles its own auth. Dashboard just reads CLI's `whoami` status. |
| **User-provided cloud VM as execution host** | "I want this running 24/7 even when my Mac is asleep" | PROJECT.md Out of Scope. Real infra, real auth flow. Introduces the complaints every hosted scheduler has (cold starts, billing, region selection). | Mac-must-be-awake is documented. v0.3 maybe. |
| **Plugin system for 5th+ runtime** | Amp, Devin, Operator will come up in every feedback thread | Premature generalization. PROJECT.md Out of Scope: Amp + Devin explicitly deferred. Adapter interface should be clean, not "extensible." | Build 4 adapters. If 5th comes up later, refactor then, not now. |
| **Real-time cost dashboard with charts** | Tokemon / TokenTracker / agent-cost-guardrails are doing this; feels expected | PROJECT.md doesn't require it and char-based approximation won't look credible in charts. Risks looking like a cost tool instead of a deployment tool. | Show cumulative approximate spend per routine in the routine card. No charts. No per-hour. |
| **Workflow versioning (rollback to previous routine)** | Airflow users want this; 2026 top-requested Airflow feature | Users who want versioning can use git (Save-to-repo button exists). Building a parallel history store is scope creep. | git. Period. |
| **Analytics / user behavior tracking** | PostHog-ish metrics to "see what users do" | Single-user local-Mac app. Observability is of agents, not of the human. Adds telemetry surface area. | None. Dashboard is for one user, no tracking. |

## Feature Dependencies

```
Runtime adapter interface
    └──enables──> Deploy button per runtime
    └──enables──> Run-now button per runtime
    └──enables──> Runtime health badges
    └──enables──> Test-run mode (dry deploy)

Routine editor form
    └──requires──> Cron schedule input with preview
    └──requires──> Runtime picker with availability detection
    └──requires──> Reversibility radio
    └──enables──> Save writes to disk
         └──enables──> Save-to-repo button
         └──enables──> Deploy button

Runs list (global + per-routine)
    └──extends──> Unified Morning Queue (v0.1)
    └──requires──> Normalized audit.jsonl shape
    └──enables──> Drill-in to a single run
         └──requires──> stdout/stderr files per CLI run
         └──enables──> Approximate token/cost cap (CLI) display

Runtime health badges
    └──requires──> CLI availability detection (`which claude`, etc.)
    └──requires──> CLI auth-status probe per runtime
    └──enables──> Error messages with remediation

Templates + AUTHORING.md
    └──enhances──> Routine editor (preload from template)
    └──enhances──> OSS credibility

Drift detection
    └──requires──> Deploy status indicator
    └──requires──> mtime comparison logic

Reversibility-aware authoring
    └──extends──> v0.1 hook reversibility classification
    └──enables──> policy auto-selection in editor
```

### Dependency Notes

- **Runtime adapter interface is the foundation.** Deploy, Run-now, health badges, test-run all call it. Must land early in the build. Interface: `{ deploy(config), undeploy(id), runNow(id), getStatus(id), getLogs(id), detectInstalled(), detectAuthed() }`.
- **Routine editor depends on schedule-input and runtime-picker.** Build those two primitives first, then assemble the editor around them.
- **Save writes-to-disk is the contract between authoring and deployment.** Every downstream feature (deploy, git, test-run) reads from disk. Keep one canonical serialization format (`config.json` + `prompt.md`) across all 4 runtimes.
- **Unified audit shape is the contract between runtimes and Morning Queue.** If Codex/Gemini don't emit JSONL matching v0.1's shape, the queue can't show them. This is a must-ship-together pair.
- **Drift detection requires deploy status first.** Can't compare disk vs. runtime if we don't track runtime state. Ship deploy status in an early phase, drift in a later one.
- **Test-run and Deploy conflict only if naively coupled.** Test-run MUST NOT write a plist / MUST NOT persist to Claude Routines. Make the adapter's `runNow(config, {dryRun: true})` a first-class mode.

## MVP Definition

### Launch With (v0.2)

Minimum features that let us honestly claim "multi-runtime agent deployment dashboard."

- [ ] **Routine editor form** — core authoring surface; without it, "click deploy" has nothing to deploy
- [ ] **Runtime picker with availability detection** — dashboard must show which of the 4 runtimes are usable *on this machine*
- [ ] **Cron schedule input with human preview** — scheduling is half the value prop
- [ ] **Save writes to disk immediately** — durability contract
- [ ] **Runtime adapter: Claude Code Routines** — hybrid API + `/schedule create` URL fallback
- [ ] **Runtime adapter: Claude Code Desktop** — copy SKILL.md into `~/.claude/scheduled-tasks/`
- [ ] **Runtime adapter: Codex Pro** — write plist invoking `codex -p`
- [ ] **Runtime adapter: Gemini CLI Pro** — write plist invoking `gemini`
- [ ] **Deploy button + status indicator** — Draft/Deployed/Drift states per routine
- [ ] **Run-now button per routine** — manual trigger for every runtime
- [ ] **Per-runtime unified audit shape** — Codex/Gemini stdout/stderr → normalized `audit.jsonl`
- [ ] **Morning Queue source extension** — `source: "codex" | "gemini"` alongside `"local"` and `"cloud"`
- [ ] **Approximate token/cost cap for CLI runtimes** — reuse v0.1 approximation
- [ ] **Templates: one per runtime** (`templates/routine-<runtime>.md`)
- [ ] **`docs/AUTHORING.md` walkthrough** — OSS quality gate; PROJECT.md explicit requirement
- [ ] **Runtime health badges on landing page** — copy `brew doctor`/`gh extension list` pattern
- [ ] **Per-routine enable/disable toggle** — standard across every scheduler
- [ ] **Backward compatibility** — all v0.1 routines + hooks + install.sh work unchanged

### Add After Validation (v0.2.x patches)

Features to add once the core flow ships and gets real usage.

- [ ] **Save-to-repo button** — add once users ask "how do I share these?" (already in PROJECT.md Active — keep in MVP if time permits; otherwise first patch)
- [ ] **Test-run mode (dry deploy)** — add when users complain "I broke my prompt and didn't notice until morning"
- [ ] **Drift detection** — add once users are editing routines and forgetting to redeploy
- [ ] **"Copy as curl" export** — add when first power-user files an issue asking for it
- [ ] **Two-tier editor (Simple/Advanced toggle)** — add when users want to edit raw markdown

### Future Consideration (v0.3+)

Features explicitly deferred per PROJECT.md Out of Scope.

- [ ] **Amp + Devin runtime adapters** — v0.3
- [ ] **GitHub event triggers for non-Claude runtimes** — v0.3 (needs webhook receiver)
- [ ] **User-provided cloud VM as host** — v0.3 (real infra)
- [ ] **Fan-out runtime comparison with diff** — tempting scope creep; out of scope for v0.2
- [ ] **Auto-runtime-selection** — out of scope; user picks
- [ ] **Live log streaming (SSE/WebSocket)** — defer until async infra is justified
- [ ] **Multi-tenant / team accounts** — OSS stays single-user

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Routine editor form | HIGH | MEDIUM | P1 |
| Runtime picker + availability detection | HIGH | MEDIUM | P1 |
| Cron schedule input + preview | HIGH | LOW (npm `cronstrue`) | P1 |
| Save to disk | HIGH | LOW | P1 |
| Runtime adapter: Claude Routines | HIGH | MEDIUM (API + URL fallback) | P1 |
| Runtime adapter: Claude Desktop | HIGH | LOW (file copy) | P1 |
| Runtime adapter: Codex Pro | HIGH | MEDIUM (plist writer) | P1 |
| Runtime adapter: Gemini CLI Pro | HIGH | MEDIUM (plist writer) | P1 |
| Deploy button + status | HIGH | MEDIUM | P1 |
| Run-now per runtime | HIGH | LOW-MEDIUM | P1 |
| Unified audit shape (CLI runtimes) | HIGH | MEDIUM | P1 |
| Morning Queue source extension | HIGH | LOW | P1 |
| CLI budget cap (char-based) | MEDIUM | LOW | P1 |
| Templates (4 files) | MEDIUM | LOW | P1 |
| AUTHORING.md | HIGH (OSS credibility) | LOW | P1 |
| Runtime health badges | MEDIUM | LOW | P1 |
| Enable/disable toggle | MEDIUM | LOW | P1 |
| Save-to-repo button | MEDIUM | LOW | P1/P2 |
| Error messages with remediation | HIGH | LOW | P1 |
| Test-run mode | MEDIUM | MEDIUM | P2 |
| Drift detection | LOW-MEDIUM | MEDIUM | P2 |
| Reversibility-aware authoring | MEDIUM | LOW | P2 |
| Runtime comparison matrix (static) | LOW | LOW | P2 |
| Two-tier editor (Simple/Advanced) | LOW | LOW | P2 |
| Copy-as-curl export | LOW | TRIVIAL | P2/P3 |
| Fan-out / runtime comparison exec | LOW (and harmful to scope) | HIGH | P3 (out of scope) |
| Real tokenizer | LOW | MEDIUM | P3 (out of scope) |
| Live log streaming | LOW-MEDIUM | HIGH | P3 (out of scope) |

**Priority key:**
- P1: Must have for v0.2 launch
- P2: Should have, add in patch release
- P3: Defer to v0.3 or reject as anti-feature

## Competitor Feature Analysis

| Feature | n8n / Zapier | Airflow / Prefect / Temporal | LangSmith / Langfuse / CrewAI Studio | Lingon / LaunchControl | GitHub Actions | Sleepwalker v0.2 Approach |
|---------|--------------|------------------------------|---------------------------------------|------------------------|----------------|---------------------------|
| Authoring surface | Visual drag-drop | Code-first (Python DAGs) | Visual / IDE-ish (CrewAI Studio) | Form + natural language | YAML files in repo | Form editor + raw-file advanced toggle (between n8n and GitHub Actions) |
| Runtime picker | Fixed (own runtime) | Executor type (local/K8s/etc.) | Framework-locked | N/A (launchd only) | runs-on label | Explicit 4-runtime radio with detection |
| Schedule input | Interval + cron | Cron + dataset triggers | Usually none | Date picker + calendar interval | Cron in YAML | Cron + human preview (crontab.guru pattern) |
| One-click deploy | Activate toggle | `prefect deploy`, Airflow pause/unpause | "Deploy" button in CrewAI Studio | Load/unload service | git push = deploy | Explicit "Deploy" button per routine + status indicator |
| Health check / doctor | Connection test per node | Scheduler health page | Per-model status | Service status highlighting | workflow syntax check | Top-strip runtime badges (brew-doctor pattern) |
| Runs list + drill-in | Yes (extensive) | Yes (DAG runs + task instances) | Yes (trace view) | Limited (stdout only) | Actions runs list | Extend v0.1 Morning Queue to 4-source runs list |
| Secrets | Platform-managed or env | Connections + variables | Platform-hosted | N/A (env) | Encrypted secrets | Each CLI owns its auth; dashboard never stores keys |
| Templates / catalog | Community workflows | DAG examples | Example notebooks | None | Workflow marketplace | 4 built-in templates + AUTHORING.md |
| Cost tracking | Minimal | None core | Token cost charts (LangSmith) | None | Usage hours | Approximate char-based cap + cumulative-per-routine display |
| Drift detection | No | DAG-vs-code warn in some versions | No | Service status | Out-of-sync branch | mtime compare between disk and runtime |
| Test / dry-run | "Test step" | `airflow tasks test` | Preview playground | No | `act` (community) | Test-run mode (runs adapter synchronously without persisting) |

## Sources

Research drew on convergent patterns from 10+ tools across the scheduler / orchestrator / agent-dashboard / launchd-GUI space. The features above are table-stakes across all of them OR are deliberate omissions per PROJECT.md scope constraints.

- [n8n Docs — Navigating the Editor UI](https://docs.n8n.io/courses/level-one/chapter-1/)
- [n8n Docs — Scheduling the Workflow](https://docs.n8n.io/courses/level-one/chapter-5/chapter-5.7/)
- [N8n Workflow Automation: The 2026 Guide](https://medium.com/@aksh8t/n8n-workflow-automation-the-2026-guide-to-building-ai-powered-workflows-that-actually-work-cd62f22afcc8)
- [Zapier — Set up your Zap trigger](https://help.zapier.com/hc/en-us/articles/8496288188429-Set-up-your-Zap-trigger)
- [Zapier — Set up your Zap action](https://help.zapier.com/hc/en-us/articles/8496257774221-Set-up-your-Zap-action)
- [Airflow UI Overview](https://airflow.apache.org/docs/apache-airflow/stable/ui.html)
- [Airflow DAG Dashboard and Form Triggering](https://medium.com/maisonsdumonde/road-to-add-form-for-airflows-dag-1dcf2e7583ef)
- [Common Apache Airflow Mistakes and How to Avoid Them](https://risingwave.com/blog/common-apache-airflow-mistakes-and-how-to-avoid-them/)
- [We're All Using Airflow Wrong and How to Fix It](https://medium.com/bluecore-engineering/were-all-using-airflow-wrong-and-how-to-fix-it-a56f14cb0753)
- [Prefect — How to create schedules](https://docs.prefect.io/v3/how-to-guides/deployments/create-schedules)
- [Temporal Web UI — Platform Documentation](https://docs.temporal.io/web-ui)
- [Temporal UI: Monitoring Workflows — Startupik](https://startupik.com/temporal-ui-monitoring-workflows-in-temporal/)
- [LangSmith — Agent Deployment Infrastructure](https://www.langchain.com/langsmith/deployment)
- [LangSmith vs LangFuse: Which Wins in 2026?](https://muoro.io/blog/langsmith-vs-langfuse)
- [CrewAI — Crew Studio Documentation](https://docs.crewai.com/en/enterprise/features/crew-studio)
- [CrewAI — Enabling Domain Experts to Build Agentic Workflows](https://blog.crewai.com/enabling-domain-experts-to-build-and-deploy-agentic-workflows-without-the-need-to-write-code/)
- [LaunchControl — The launchd GUI (soma-zone)](https://www.soma-zone.com/LaunchControl/)
- [Lingon — Peter Borg Apps](https://www.peterborgapps.com/lingon/)
- [Launched — A Plist Generator](https://launched.zerowidth.com/)
- [GitHub Docs — Using Pre-Written Building Blocks](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/using-pre-written-building-blocks-in-your-workflow)
- [GitHub Docs — Reusing Workflow Configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
- [GitHub Actions Self-Hosted Runners Reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Railway — Quick Start and Template Creation](https://docs.railway.com/templates/create)
- [Render — Deploy to Render Button](https://render.com/docs/deploy-to-render)
- [GitHub Deploy Buttons — BinBashBanana](https://github.com/BinBashBanana/deploy-buttons)
- [Crontab.guru](https://crontab.guru/)
- [Free Cron Expression Generator — Beekeeper Studio](https://www.beekeeperstudio.io/tools/cron-generator)
- [Human to Cron — OneDev Tools](https://onedev.tools/cron/human)
- [gemini-cli issue #18692 — doctor command request](https://github.com/google-gemini/gemini-cli/issues/18692)
- [Homebrew FAQ — brew doctor](https://docs.brew.sh/FAQ)
- [GitHub Blog — New GitHub CLI Extension Tools (gh extension list)](https://github.blog/developer-skills/github/new-github-cli-extension-tools/)
- [Tokemon — Terminal Dashboard for Tracking LLM Token Usage](https://agent-wars.com/news/2026-03-13-tokemon-terminal-dashboard-for-tracking-llm-token-usage)
- [BYOKList — AI Tools with BYOK](https://byoklist.com/)
- [Factory CLI — BYOK Documentation](https://docs.factory.ai/cli/byok/overview)
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OpenAI Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder)
- [GitHub Agentic Workflows — Testing & Validation](https://github.github.com/gh-aw/blog/2026-01-13-meet-the-workflows-testing-validation/)
- [Datadog Live Tail](https://docs.datadoghq.com/logs/explorer/live_tail/)
- [Dagster — Data Pipeline Orchestration Tools](https://dagster.io/learn/data-pipeline-orchestration-tools)
- [Symphony Spec — OpenAI Orchestrator](https://github.com/openai/symphony/blob/main/SPEC.md)

---
*Feature research for: Sleepwalker v0.2 — Multi-Runtime Agent Deployment Dashboard*
*Researched: 2026-04-18*
*Milestone scope anchor: `.planning/PROJECT.md` Active requirements*
