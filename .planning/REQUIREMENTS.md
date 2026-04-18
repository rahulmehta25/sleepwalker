# Requirements: Sleepwalker v0.2 — Multi-Runtime Agent Deployment

**Defined:** 2026-04-18
**Core Value:** Write a prompt + pick a schedule + pick a runtime → click once → a live agent exists on that runtime, scheduled, audited, and reviewed from one place.

## v1 Requirements

Requirements for the v0.2 milestone. Each maps to a roadmap phase. Derived from PROJECT.md Active requirements, cross-validated against `.planning/research/SUMMARY.md` P1 feature list.

### Adapter Foundation (Phase 0/1 territory)

- [ ] **ADPT-01**: `RuntimeAdapter` TypeScript interface is frozen and exported from `dashboard/lib/runtime-adapters/types.ts` with `deploy`, `undeploy`, `runNow`, `listRuns`, `healthCheck` methods and typed `RoutineBundle`, `DeployResult`, `HealthStatus` shapes
- [ ] **ADPT-02**: Slug namespacing convention is enforced everywhere: internal key `<runtime>/<slug>`, launchd label `com.sleepwalker.<runtime>.<slug>`, audit marker `[sleepwalker:<runtime>/<slug>]`, branch prefix `claude/sleepwalker/<runtime>/<slug>/*`
- [ ] **ADPT-03**: `launchd-writer.ts` produces a valid plist, installs via `launchctl bootstrap gui/$UID`, uninstalls via `launchctl bootout`, and validates with `plutil -lint` before bootstrap
- [ ] **ADPT-04**: `bin/sleepwalker-run-cli` supervisor resolves absolute CLI path via login shell, enforces sleep-window + reversibility + char-budget gates, strips ANSI, and emits normalized `audit.jsonl` entries
- [ ] **ADPT-05**: Runtime adapter **Claude Code Routines** (`claude-routines.ts`) — `deploy()` returns `{handoffUrl}` for `/schedule create` + pre-filled browser; `runNow()` wraps existing `fire-routine.ts`; `healthCheck()` probes beta-header + `claude` CLI availability
- [ ] **ADPT-06**: Runtime adapter **Claude Code Desktop Scheduled Tasks** (`claude-desktop.ts`) — `deploy()` copies SKILL.md to `~/.claude/scheduled-tasks/<slug>/` and returns a handoff URL for Desktop's Schedule page; `healthCheck()` probes for `~/.claude/` and Desktop binary
- [ ] **ADPT-07**: Runtime adapter **Codex Pro** (`codex.ts`) — `deploy()` writes `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` invoking the supervisor; `healthCheck()` probes `codex --version`, active auth mode, and absolute binary path
- [ ] **ADPT-08**: Runtime adapter **Gemini CLI Pro** (`gemini.ts`) — `deploy()` writes plist with explicit `GOOGLE_CLOUD_PROJECT` env var invoking the supervisor; `healthCheck()` probes `gemini --version` + auth + quota project
- [ ] **ADPT-09**: `ADAPTERS` registry + `getAdapter(runtime)` + `healthCheckAll()` shipping in `dashboard/lib/runtime-adapters/index.ts`; every consumer uses registry lookups, never direct imports

### Routine Editor (Phase 2 territory)

- [ ] **EDIT-01**: `/editor` route renders a Next.js form with fields for name, prompt, runtime (radio — unavailable runtimes dimmed with fix-tooltip), cron schedule (with `cronstrue` human preview), reversibility radio (green/yellow/red), and budget input
- [ ] **EDIT-02**: `saveRoutine` Server Action validates via zod, runs a secret-scan (gitleaks-style regex) on the prompt, and writes `config.json` + `prompt.md` to `routines-<runtime>/<slug>/` atomically
- [ ] **EDIT-03**: Editor auto-saves to `localStorage` (500ms debounce) and intercepts navigation when dirty — no lost work on refresh/back
- [ ] **EDIT-04**: Slug validation enforces `^[a-z][a-z0-9-]{0,63}$` and rejects collisions with existing `<runtime>/<slug>` pairs anywhere across `routines-*/`
- [ ] **EDIT-05**: All editor inputs set `autocomplete="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true"` to prevent password manager / spellcheck corruption of prompts

### Deploy & Runtime Control (Phase 3 territory)

- [ ] **DEPL-01**: "Deploy" button on each routine card drives a 4-stage state machine (`planning → writing → loading → verified`) tracked in `~/.sleepwalker/deploys/<slug>.state.json`; UI polls until terminal state
- [ ] **DEPL-02**: Deploy auto-rolls-back on any step failure: `launchctl bootout` + delete plist + delete state + emit clear error in dashboard — no orphaned artifacts ever
- [ ] **DEPL-03**: Routine card status indicator shows Draft / Deployed / Drift states; Drift = mtime(bundle) > mtime(deployed artifact) → "Redeploy" badge
- [ ] **DEPL-04**: "Run now" button works for all four runtimes — Claude Routines uses `/fire`, Claude Desktop uses `claude -p`, Codex/Gemini spawn the supervisor in run-now mode (same audit shape as scheduled runs)
- [ ] **DEPL-05**: Per-routine enable/disable toggle calls `launchctl bootout` on disable and `launchctl bootstrap` on enable, persists state in `config.json`, and surfaces current state in the card

### Queue & Audit Extension (Phase 4 territory)

- [ ] **QUEU-01**: `QueueSource` type widens to `"local" | "cloud" | "codex" | "gemini"`; existing local + cloud consumers continue to work unchanged
- [ ] **QUEU-02**: Morning Queue UI renders Codex + Gemini source pills (pure CSS, no new dependency) alongside existing local/cloud pills
- [ ] **QUEU-03**: Supervisor emits normalized `audit.jsonl` entries for Codex/Gemini runs with `runtime`, `fleet` as `<runtime>/<slug>`, ANSI-stripped content, timestamp, and char-count budget info
- [ ] **QUEU-04**: `flock` on `~/.sleepwalker/audit.jsonl` write path eliminates the concurrent-write race that v0.1 CONCERNS.md flagged; applies to all four runtimes

### Safety & Budget (Phase 4 territory)

- [ ] **SAFE-01**: Approximate character-based budget cap for CLI runtimes (Codex/Gemini) — supervisor SIGTERMs the subprocess when cap is exceeded; documented as ±40% approximate, labeled "approximate" in UI, never as "tokens"
- [ ] **SAFE-02**: Supervisor sets `NO_COLOR=1 TERM=dumb CI=true` and pipes stdout/stderr through `stripVTControlCharacters()` (Node 20 built-in) before any audit write

### Save to Repo (Phase 3 territory)

- [ ] **REPO-01**: "Save to repo" button on routine card does explicit-path `git add <routines-<runtime>/<slug>/*>` + commit with flock on `~/.sleepwalker/git.lock`, shows `git diff --stat` preview before confirm, never auto-pushes

### Runtime Health (Phase 1/3 territory)

- [ ] **HLTH-01**: Dashboard landing page shows four runtime health badges (Claude Routines / Claude Desktop / Codex / Gemini) following the `brew doctor` pattern — green when ready, grey with fix-instructions link when not

### Docs & OSS Polish (Phase 5 territory)

- [ ] **DOCS-01**: `docs/AUTHORING.md` walks a new user from "just cloned the repo" to "first custom routine running" in under 10 minutes, covering all four runtimes and the Mac-sleep caveat
- [ ] **DOCS-02**: Four runtime templates at `templates/routine-claude-routines.md`, `templates/routine-claude-desktop.md`, `templates/routine-codex.md`, `templates/routine-gemini.md` — commented frontmatter + skeleton prompt
- [ ] **DOCS-03**: Diagnostics page at `/diagnostics` reports macOS version, Homebrew prefix (arm64/x86_64), each CLI's absolute path, active shell, `~/Library/LaunchAgents/` writability — the "copy this into a GitHub issue" panel

### Backward Compatibility

- [ ] **COMP-01**: All 14 v0.1 routines (6 local + 8 cloud) continue to deploy, run, and appear in the Morning Queue without code changes or user intervention; `install.sh` stays idempotent and signature-compatible
- [ ] **COMP-02**: v0.1 public surface is frozen — hook script names + paths, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` hook wiring, existing `QueueEntry` field names — none change

## v2 Requirements

Deferred to post-v0.2.x patches or a later milestone. Tracked but not in current roadmap.

### Test & Iteration

- **TEST-01**: Synchronous "Test run" mode — invoke adapter, stream output to a dashboard modal, no plist written
- **TEST-02**: Two-tier editor: Simple form / Advanced raw-file toggle
- **TEST-03**: Reversibility-aware authoring: editor radio auto-selects hook policy for Claude runtimes
- **TEST-04**: Runtime comparison matrix (static table of cost/speed/capabilities per runtime) shown inline in editor

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Amp (SourceGraph) runtime adapter | Different CLI surface + auth model; defer to v0.3 |
| Devin runtime adapter | Hosted platform with its own UI; doesn't fit the local-launchd pattern; defer to v0.3 |
| GitHub event triggers for non-Claude runtimes | Requires webhook receiver or polling loop beyond launchd; defer to v0.3 |
| User-provided cloud VM execution host | Real infra + auth; defer to v0.3 |
| Sleepwalker-hosted shared scheduler | Turns OSS into SaaS — explicit off-ramp for this milestone |
| Webhook triggers beyond Run-now (PagerDuty/Sentry/deploy for non-Claude) | Defer to v0.3 |
| Multi-tenant auth / team accounts | Stays single-user-on-Mac for v0.2 |
| Fan-out execution (one prompt → N runtimes → compare) | Doubles surface area, splits focus |
| Auto-runtime-selection ("which runtime for this prompt?") | User picks — we don't guess |
| Visual drag-and-drop workflow builder | Out of style with the OSS reference-impl goal |
| Built-in scheduler daemon | Zero new always-on processes is a hard constraint |
| Real tokenizer for budget cap | ±40% character approximation is acceptable; adding a tokenizer dep isn't |
| Live log streaming (SSE/WebSocket) | Polling is sufficient for overnight-agent cadence |
| Plugin system for third-party adapters | Premature extension point |
| Full MCP secret manager integration | Conflicts with each CLI's native auth model |

## Traceability

Filled during roadmap creation. Each v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADPT-01 | TBD | Pending |
| ADPT-02 | TBD | Pending |
| ADPT-03 | TBD | Pending |
| ADPT-04 | TBD | Pending |
| ADPT-05 | TBD | Pending |
| ADPT-06 | TBD | Pending |
| ADPT-07 | TBD | Pending |
| ADPT-08 | TBD | Pending |
| ADPT-09 | TBD | Pending |
| EDIT-01 | TBD | Pending |
| EDIT-02 | TBD | Pending |
| EDIT-03 | TBD | Pending |
| EDIT-04 | TBD | Pending |
| EDIT-05 | TBD | Pending |
| DEPL-01 | TBD | Pending |
| DEPL-02 | TBD | Pending |
| DEPL-03 | TBD | Pending |
| DEPL-04 | TBD | Pending |
| DEPL-05 | TBD | Pending |
| QUEU-01 | TBD | Pending |
| QUEU-02 | TBD | Pending |
| QUEU-03 | TBD | Pending |
| QUEU-04 | TBD | Pending |
| SAFE-01 | TBD | Pending |
| SAFE-02 | TBD | Pending |
| REPO-01 | TBD | Pending |
| HLTH-01 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| COMP-01 | TBD | Pending |
| COMP-02 | TBD | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 0 (filled during roadmap creation)
- Unmapped: 32 ⚠️ — roadmap phase will resolve

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after initial definition*
