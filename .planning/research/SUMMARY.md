# Project Research Summary

**Project:** Sleepwalker v0.2 — Multi-Runtime Agent Deployment
**Domain:** Local-first multi-runtime AI agent orchestration dashboard (macOS + launchd + 4 CLI/cloud runtimes)
**Researched:** 2026-04-18
**Confidence:** HIGH

## Executive Summary

Sleepwalker v0.2 is an OSS reference implementation of a multi-runtime agent deployment dashboard. The product's core claim is that a single UI at `localhost:4001` can author, schedule, deploy, and review overnight AI coding agents across four distinct runtimes: Claude Code Routines (cloud), Claude Code Desktop Scheduled Tasks (local), OpenAI Codex CLI (local), and Google Gemini CLI (local). No comparable OSS project was found — Sleepwalker's design is ahead of the reference implementations in this space. The recommended approach mirrors how Airflow, Prefect, and Terraform manage multi-backend orchestration: a clean TypeScript adapter interface with four concrete implementations, keyed by a `runtime` discriminant on each routine bundle. All new directories, files, and behaviors are strictly additive to the v0.1 foundation; `install.sh`, hooks, and all 14 existing routines must not change.

The recommended build order is driven by a hard dependency graph: the adapter interface and its types must be frozen before any adapter, editor, or dashboard feature can be written. The supervisor wrapper script (`bin/sleepwalker-run-cli`) must exist before the Codex/Gemini adapters register their launchd plists, because launchd will invoke the supervisor directly. The editor can only land after adapters exist and the bundle read/write API is stable. The unified audit/queue extension is the last structural change, because it depends on all four runtime sources emitting normalized JSONL. Docs and OSS polish close the release.

The three highest-priority risks are the launchd `$PATH` pitfall (CLI binaries not found at 03:00 because launchd strips the login-shell PATH), shell injection via user-authored prompts interpolated into plist arguments, and partial-success deploy leaving orphaned plists with no rollback. All three are solvable with patterns established in the research: absolute binary path resolution at plist-generation time, prompt-to-file-to-stdin routing via a wrapper script (never prompt-in-argv), and a state-machine deploy with verified final status check. These patterns must be established in Phase 0/1 — retrofitting them later is a rewrite.

## Key Findings

### Recommended Stack

The v0.1 stack carries forward unchanged: Next.js 15.1.4, React 19, TypeScript 5.7, Tailwind 3.4, Vitest 2.1, pnpm, bash+jq hooks. Net-new dependencies for v0.2 are minimal. For process spawning, `execa@9.6.1` is recommended over `child_process.exec` to eliminate shell injection surface and provide structured stderr. For git operations, `simple-git@3.36.0` handles the Save-to-repo button with safer explicit-path staging than raw `execFile("git", ...)`. Plist generation is hand-rolled XML (30 lines, zero deps) using `launchctl bootstrap/bootout` — the `plist` npm package adds a dependency for no benefit since the XML contract is stable and trivial. ARCHITECTURE.md and STACK.md agree on this. `zod@^3.25.x` validates routine schema before any disk write; an invalid plist or malformed SKILL.md silently fails to schedule. `yaml@^2.6.x` + `gray-matter@^4.0.x` read/write YAML frontmatter. `cronstrue` renders cron expressions as human-readable strings in the editor (20KB, MIT).

**Core technologies (net-new for v0.2):**
- `execa@9.6.1`: subprocess wrapper for `codex`/`gemini`/`claude` shell-outs — structured stderr, no shell injection surface, ESM-native
- `simple-git@3.36.0`: Save-to-repo git operations from Next.js server — 11M+ weekly downloads, actively maintained, explicit-path staging
- `yaml@^2.6.x` + `gray-matter@^4.0.x`: YAML frontmatter for SKILL.md and routine configs
- `zod@^3.25.x`: validate `RoutineBundle` schema before any disk write
- `cronstrue` (npm, 20KB): cron expression → human-readable preview in the editor
- Hand-rolled plist XML writer (~30 lines) + `launchctl bootstrap gui/<uid>` / `bootout`: deploy/undeploy launchd agents (NOT deprecated `load`/`unload`)

**Critical non-existence facts the roadmap must not assume:**
1. No API endpoint exists to programmatically create a Claude Routine with full trigger types. Schedule triggers use `claude /schedule create` (CLI); API-trigger tokens require the web UI. The Claude Routines adapter `deploy()` must return a `handoffUrl` for browser completion.
2. Desktop Scheduled Tasks have no file-based schedule control. SKILL.md controls only prompt text. Frequency, model, and enabled state live in Desktop's internal state store.
3. No maintained Node.js library exists for launchd orchestration. The `launchd.plist` npm package was last published 2013, version 0.0.1.
4. Codex and Gemini have no hook schema equivalent to Claude Code's PreToolUse/PostToolUse. Safety enforcement is moved up one layer via the supervisor script.

### Expected Features

The core authoring loop defines the MVP: open `localhost:4001` → click "New Routine" → fill form (name, prompt, runtime, schedule, reversibility, budget) → click Save → click Deploy → live scheduled agent exists, visible in Morning Queue like the 14 prebuilt routines.

**Must have (v0.2 launch, P1):**
- Routine editor form: name, prompt textarea, runtime picker, cron schedule + `cronstrue` human preview, reversibility radio (green/yellow/red), budget input
- Runtime picker with availability detection: dim unavailable runtimes with tooltip explaining the fix
- Save writes to disk immediately into `routines-<runtime>/<slug>/` — disk-first, git is opt-in
- Four runtime adapters: Claude Routines (CLI + URL handoff), Claude Desktop (SKILL.md copy + browser handoff), Codex (launchd plist via supervisor), Gemini (launchd plist via supervisor)
- Deploy button + Deploy/Drift/Draft status indicator per routine card
- Run-now button for every runtime (not just Claude Routines as in v0.1)
- Unified audit shape: Codex/Gemini stdout/stderr via supervisor → normalized `audit.jsonl` with `source: "codex" | "gemini"`
- Morning Queue `QueueSource` widened: `"local" | "cloud" | "codex" | "gemini"` — one-line type change
- Approximate token/cost cap for CLI runtimes (character-based, reuse v0.1 ±40% approximation — document it as approximate)
- Runtime health badges on landing page (`brew doctor` pattern: green/gray per runtime, clickable to fix)
- Per-routine enable/disable toggle: `launchctl bootout` on disable, `launchctl bootstrap` on enable, state written to `config.json`
- Save-to-repo button: `git add <explicit-paths>` + commit, flock on index, show diff preview before committing, never auto-push
- Four runtime templates (`templates/routine-<runtime>.md`) + `docs/AUTHORING.md` walkthrough (under 10 min)
- Backward compatibility: all 14 v0.1 routines, hooks, and install.sh unchanged

**Should have (v0.2.x patches, P2):**
- Test-run mode: invoke adapter synchronously, stream output to modal, no plist written
- Drift detection: mtime of local bundle vs mtime of deployed artifact → "Redeploy" badge on card
- Two-tier editor: Simple form / Advanced raw-file toggle
- Reversibility-aware authoring: radio in editor auto-selects hook policy
- Runtime comparison matrix (static table: cost/speed/capabilities per runtime, shown inline in editor)

**Defer (v0.3+, explicitly out of scope per PROJECT.md):**
- Amp and Devin runtime adapters
- GitHub event triggers for non-Claude runtimes
- Fan-out: one prompt → N runtimes → compare results
- Live log streaming via SSE/WebSocket
- Multi-tenant accounts
- User-provided cloud VM execution host
- Auto-runtime-selection

**Anti-features to explicitly reject:**
- Visual drag-and-drop workflow builder
- Built-in scheduler daemon (zero new always-on processes is a hard constraint)
- Real tokenizer for budget cap (±40% character approximation is acceptable; a tokenizer dependency is not)
- Full MCP secret manager integration (conflicts with each CLI's native auth model)

### Architecture Approach

The architecture adds four layers atop the unchanged v0.1 foundation. The `RuntimeAdapter` TypeScript interface (`deploy`, `undeploy`, `runNow`, `listRuns`, `healthCheck`) has four concrete implementations as plain module exports (no class hierarchy, no singleton manager) in `dashboard/lib/runtime-adapters/`. A `ADAPTERS` registry maps `Runtime` string to adapter; callers call `getAdapter(bundle.runtime)` and are agnostic to runtime details. The `bin/sleepwalker-run-cli` bash supervisor wraps all Codex/Gemini CLI invocations with the same safety semantics as v0.1 Claude hooks: PATH setup, sleep-window gate, reversibility gate, character-count budget envelope with SIGTERM, ANSI-stripped audit JSONL stream. All launchd plists invoke the supervisor, never the CLI directly. New directories `routines-codex/` and `routines-gemini/` are additive siblings; `QueueSource` widening is one line. Nothing in v0.1's frozen surface changes.

**Major components:**
1. `dashboard/lib/runtime-adapters/types.ts` — interface freeze: `RuntimeAdapter`, `Runtime`, `RoutineBundle`, `DeployResult`, `HealthStatus`
2. `dashboard/lib/runtime-adapters/launchd-writer.ts` — hand-rolled plist XML + `launchctl bootstrap/bootout`; shared by Codex and Gemini adapters
3. `bin/sleepwalker-run-cli` — bash supervisor: resolves absolute CLI path, gates on reversibility policy, enforces char budget, writes normalized `audit.jsonl`
4. Four adapter modules — each thin: composes launchd-writer + supervisor invocation (Codex/Gemini) or wraps existing code (Claude Routines/Desktop)
5. `dashboard/app/editor/` — Next.js Server Action form: validates with zod, secret-scans prompt, writes `config.json` + `prompt.md` to `routines-<runtime>/<slug>/`
6. `dashboard/lib/save-to-repo.ts` — explicit-path git add + commit, flock-protected, shows diff before confirming

**Build order (hard dependency chain, non-negotiable):**
`types.ts` → (`launchd-writer.ts` + `supervisor script`) → four adapters in parallel → `bundles.ts` + `routines.ts` extension → editor + deploy button → queue widening + audit extension → docs and polish

### Critical Pitfalls

1. **Launchd strips `$PATH` — CLI binary not found at 03:00** — At plist-generation time, resolve the absolute path of each binary by running `which codex` inside a login shell: `/bin/zsh -l -c 'command -v codex'`. Embed the absolute path in `ProgramArguments`. Write `EnvironmentVariables.PATH` explicitly into every plist. Always set `StandardOutPath`/`StandardErrorPath`. Address in Phase 1; retrofitting every plist later is painful.

2. **Shell injection via user prompt interpolated into plist arguments** — Never embed the prompt as a string in `ProgramArguments`. Write the prompt to `prompt.md`. The supervisor script reads it via `cat prompt.md | codex exec --stdin`. `ProgramArguments` points to the supervisor script by absolute path. The user's prompt never touches a shell-expanded string. Address in Phase 0 (convention) + Phase 1 (every adapter follows it).

3. **Partial-success deploy leaves orphaned plist** — Model deploy as a 4-phase state machine (`planning → writing → loading → verified`) tracked in `~/.sleepwalker/deploys/<slug>.state.json`. Only show "Deployed" after `launchctl print gui/$UID/com.sleepwalker.<runtime>.<slug>` returns a non-error state. Auto-rollback on failure: `launchctl bootout` + delete plist + delete state. Address in Phase 3; must be the deploy button's foundation.

4. **Codex auth mode collision (subscription login overrides env-var API key)** — Never write `OPENAI_API_KEY` into the plist. Probe active auth mode in `healthCheck()` and display it in the dashboard. Document in `docs/AUTHORING.md` that switching auth modes requires editing `~/.codex/config.toml` directly. Address in Phase 1 Codex adapter.

5. **Cross-runtime slug collision desyncs state** — Namespace all identifiers: internal key is `<runtime>/<slug>`, launchd label is `com.sleepwalker.<runtime>.<slug>`, audit `fleet` is `<runtime>/<slug>`. v0.1 routines get `runtime: "claude-desktop"` or `runtime: "claude-routines"` when read by the unified bundle reader. Address in Phase 0; this is the naming convention decision.

## Implications for Roadmap

### Phase 0: Groundwork

**Rationale:** The adapter interface and slug-namespacing convention are blocking dependencies for all parallel work. One day to establish them eliminates weeks of interface-churn and cross-runtime slug collisions.

**Delivers:**
- `dashboard/lib/runtime-adapters/types.ts`: frozen `RuntimeAdapter` interface + all shared types
- Naming convention: `<runtime>/<slug>` as internal key; `com.sleepwalker.<runtime>.<slug>` as launchd label; `[sleepwalker:<runtime>/<slug>]` as marker tag
- Empty directory stubs: `routines-codex/`, `routines-gemini/`, `templates/`
- Bundle frontmatter convention: `runtime:` field in YAML frontmatter is the authoritative discriminant

**Avoids:** Pitfall #7 (slug collision), lays groundwork for Pitfall #4 (shell injection via wrapper convention)

**Research flag:** No research needed. Standard TypeScript interface patterns.

---

### Phase 1: Runtime Adapters

**Rationale:** Adapters are the central deliverable and block the editor, deploy button, health badges, and run-now. Claude Routines and Claude Desktop adapters are near-zero-new-code. Codex and Gemini adapters are the novel work, each requiring the launchd writer, PATH resolution, and auth probe. The supervisor must ship with these adapters because launchd calls it.

**Delivers:**
- `dashboard/lib/runtime-adapters/launchd-writer.ts`: hand-rolled plist XML + `launchctl bootstrap/bootout` + `plutil -lint` validation
- `bin/sleepwalker-run-cli`: PATH setup, reversibility gate, char-budget SIGTERM, audit JSONL stream
- `claude-routines.ts`: wraps `fire-routine.ts` Run-now; `deploy()` returns `{handoffUrl}` for `/schedule create` browser handoff; beta-header constant centralized with startup version-check
- `claude-desktop.ts`: writes SKILL.md + opens Desktop Schedule page for frequency setup
- `codex.ts`: login-shell PATH resolution, `codex` auth probe, plist generation invoking supervisor
- `gemini.ts`: PATH resolution, Gemini auth probe (explicit `GOOGLE_CLOUD_PROJECT` in plist env), plist generation invoking supervisor
- `ADAPTERS` registry + `getAdapter()` + `healthCheckAll()`
- Vitest unit tests for all adapters (mock `execFile` + `fs`)

**Avoids:** Pitfall #1 (PATH), Pitfall #2 (Codex auth), Pitfall #3 (Gemini quota), Pitfall #12 (beta-header version check)

**Research flag:** Claude Desktop adapter scheduling requires integration validation: run a synthetic "timestamp writer" routine to confirm SKILL.md write creates a schedulable task, per CONCERNS.md. Everything else is well-documented.

---

### Phase 2: Routine Editor

**Rationale:** Depends on Phase 1 (adapters for runtime picker validation) and `bundles.ts` (read side for the routines list). Secret scanning and unsaved-changes recovery must ship in the first editor iteration — retrofitting after users lose work creates trust debt.

**Delivers:**
- `dashboard/app/editor/page.tsx` + `actions.ts`: form with runtime radio (grayed-out if unavailable), cron input + `cronstrue` preview, reversibility radio, budget input; `saveRoutine()` Server Action with zod validation + secret scanner + disk write
- `dashboard/lib/bundles.ts`: `readBundle(runtime, slug)` + `listBundles(runtime)` parsing frontmatter into `RoutineBundle`
- `dashboard/lib/editor.ts`: slug validation (`^[a-z][a-z0-9-]{0,63}$`), gitleaks-style secret regex scan, frontmatter generation
- localStorage autosave (500ms debounce) + dirty-state indicator + "unsaved changes" navigation intercept
- `autocomplete="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true"` on all form fields

**Uses stack:** `yaml`, `gray-matter`, `zod`, `cronstrue`

**Avoids:** Pitfall #11 (secret scanner), Pitfall #14 (unsaved-changes recovery), Pitfall #15 (autofill corruption)

**Research flag:** If Monaco is chosen over `<textarea>`, validate `dynamic(ssr:false)` in a standalone spike before building the form around it. Turbopack + Monaco bug (#72613) is unresolved; use the standard Webpack compiler.

---

### Phase 3: Deploy Button + Run-Now + Save-to-Repo

**Rationale:** Wires adapters and editor through dashboard UI. The deploy state machine is the most complex piece and must be foundational. Save-to-repo requires care around git index races with the user's terminal.

**Delivers:**
- Deploy button with 4-step progress indicator (planning → writing → loading → verified); auto-rollback on any step failure
- Deploy state machine: `~/.sleepwalker/deploys/<slug>.state.json`; UI polls until verified or error
- Routine card status indicators: Draft / Deployed / Drift (mtime comparison)
- Run-now for all four runtimes (Codex/Gemini spawn supervisor; Claude Routines uses `/fire`; Claude Desktop uses `claude -p`)
- Per-routine enable/disable toggle (`bootout`/`bootstrap` + `config.json` update)
- `dashboard/lib/save-to-repo.ts`: explicit-path `git add`, flock on `~/.sleepwalker/git.lock`, `git diff --stat` preview before confirming, no auto-push
- Runtime health badges on landing page: `healthCheckAll()` → four status indicators

**Uses stack:** `simple-git`, `execa`

**Avoids:** Pitfall #5 (partial-success deploy), Pitfall #9 (git clobber)

**Research flag:** No further research needed. State machine patterns are established in prior art.

---

### Phase 4: Unified Audit and Morning Queue Extension

**Rationale:** Once routines run, their output must appear in the Morning Queue. This is purely additive — one type-union widening, ANSI stripping, and two new source-pill badges. Must also fix the concurrent JSONL write race that v0.2 would otherwise make 4× worse.

**Delivers:**
- `QueueSource` widened to include `"codex"` and `"gemini"`
- Supervisor emits normalized audit JSONL: `runtime`, `fleet` as `<runtime>/<slug>`, ANSI-stripped content
- ANSI stripping: `NO_COLOR=1 TERM=dumb CI=true` in supervisor env + `stripVTControlCharacters()` (Node v20 built-in) before writing to `audit.jsonl`
- Morning Queue UI: Codex and Gemini source pill badges (pure CSS)
- `flock` on `audit.jsonl` write path: addresses concurrent-write race from v0.1 CONCERNS.md

**Avoids:** Pitfall #8 (ANSI codes in audit), concurrent JSONL write race

**Research flag:** No further research needed.

---

### Phase 5: Docs, Templates, OSS Polish

**Rationale:** PROJECT.md states docs and templates are in scope, not an afterthought. This phase is the gate before claiming v0.2 is done. Second-user validation surfaces all Rahul-specific assumptions baked into earlier phases.

**Delivers:**
- `docs/AUTHORING.md`: full authoring walkthrough (under 10 minutes), Mac-sleep caveat with `caffeinate`/`pmset` alternatives, Troubleshooting section indexed by error message, per-runtime prerequisites
- `templates/routine-<runtime>.md` (four files): empty-but-structured with commented frontmatter fields
- Dashboard Settings: sleep-check widget reading `pmset -g` — warns if Mac will sleep before scheduled time; shows (but does NOT run) the exact `pmset` command
- Diagnostics page: macOS version, Homebrew prefix (arm64 vs x86_64), each CLI's absolute path, shell, username safety, `~/Library/LaunchAgents/` writability
- Runtime detection graceful degradation: no crashes, no throws — `{ available: false, reason: "..." }` for every missing CLI

**Avoids:** Pitfall #10 (Mac sleep warning), Pitfall #13 (second-user install failures)

**Research flag:** Second-user validation on a different Mac (Intel + different shell + different macOS version) before shipping. This is integration testing, not research.

---

### Phase Ordering Rationale

Three constraints drive this order:

1. **Interface freeze before parallel work.** `types.ts` is the single blocking dependency for all four adapter authors and the editor author. Phase 0 costs one day and eliminates weeks of interface-churn.

2. **Safety patterns before user-facing surfaces.** Shell injection (Pitfall #4) and slug collision (Pitfall #7) must be established in Phase 0/1 because the editor and deploy button will encode whatever patterns exist in adapters. Retrofitting wrapper-script conventions onto shipped adapters is a rewrite.

3. **Read side before write side.** `bundles.ts` (read from disk) must precede the editor (write to disk). `routines.ts` extension (list all four runtimes) must precede the routines page. The audit/queue extension (Phase 4) is last because it requires all four runtimes to be producing normalized output.

### Research Flags

Needs integration validation (not further research):
- **Phase 1 — Claude Desktop adapter:** CONCERNS.md flags Desktop Schedule tab as unverified. Run the synthetic timestamp-writer test before declaring the adapter done.
- **Phase 2 — Monaco SSR:** If Monaco is chosen over `<textarea>`, validate the `dynamic(ssr:false)` pattern in a standalone spike first.

Standard patterns — skip research phase:
- **Phase 0:** TypeScript interface patterns are well-understood.
- **Phase 3:** Deploy state machine follows established Airflow/Prefect prior art.
- **Phase 4:** Queue widening is a one-line change; audit normalization follows v0.1 patterns.
- **Phase 5:** Docs structure follows GitHub Actions / Render / Railway template conventions.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions confirmed via `npm view` against npm registry; official CLI docs verified 2026-04-18; v0.1 stack carries forward unchanged |
| Features | HIGH | Grounded in PROJECT.md Active requirements; cross-validated against 10+ orchestrator and scheduler reference implementations |
| Architecture | HIGH | Adapter interface verified against Airflow/Prefect/Terraform prior art; existing codebase mapped end-to-end; CLI contracts for `codex exec --json` and `gemini -p --output-format json` confirmed in official docs |
| Pitfalls | HIGH for launchd + CLI-auth pitfalls; MEDIUM for Claude Routines API stability | launchd pitfalls confirmed across Apple docs and upstream issue trackers; Routines `/fire` is a research preview with documented version-window behavior |

**Overall confidence:** HIGH

### Gaps to Address During Implementation

- **Claude Desktop adapter scheduling:** Writing SKILL.md alone may not register a new scheduled task in Desktop's state store. Start with browser handoff (conservative, confirmed); validate `claude -p "add scheduled task..."` approach before switching to it.

- **Gemini quota-project env-var precedence:** The exact order in which Gemini CLI resolves `GOOGLE_CLOUD_PROJECT`, `gcloud config`, and `GOOGLE_APPLICATION_CREDENTIALS` is not fully specified in official docs. Mitigation (explicitly set `GOOGLE_CLOUD_PROJECT` in plist env) is the recommended approach; validate with the "Test Gemini auth" button before allowing any Gemini routine to deploy.

- **Codex exec stdin vs file-path flag:** The research recommends `cat prompt.md | codex exec --stdin` via the supervisor. Confirm this invocation form with a live `codex` CLI session before finalizing the plist template. If `--stdin` is unavailable, `codex exec -f <file>` is the fallback.

- **Budget approximation transparency:** The v0.1 character/4 approximation carries forward to v0.2. Document it in `docs/AUTHORING.md` as "approximate budget (±40%)" and label it that way in the dashboard UI. Do not relabel as "tokens."

## Sources

### Primary (HIGH confidence — official docs)
- [Claude Code Routines](https://code.claude.com/docs/en/routines) — `/fire` endpoint, `/schedule` CLI, trigger types, daily caps (Pro 5/day, Max 15/day)
- [Claude Code Desktop Scheduled Tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) — SKILL.md format, state separation (prompt on disk; schedule in app state)
- [OpenAI Codex CLI Reference](https://developers.openai.com/codex/cli/reference) — `exec`, `--json`, `--cd`, `--sandbox` flags; `@openai/codex@0.121.0` confirmed 2026-04-15
- [Gemini CLI Headless Mode](https://geminicli.com/docs/cli/headless/) — `-p`, `--output-format json|stream-json`, exit codes 0/1/42/53; `@google/gemini-cli@0.38.2` confirmed 2026-04-17
- [Apple launchd.info](https://www.launchd.info/) — `bootstrap`/`bootout` vs deprecated `load`/`unload`, `gui/<uid>` domain target

### Secondary (MEDIUM confidence — triangulated)
- Airflow Executor docs, Prefect Worker docs, Terraform Plugin Framework — adapter pattern prior art
- openai/codex GitHub issues #2733, #3286, #5823 — Codex auth collision documented behavior
- google-gemini/gemini-cli issues #12121, #8883 — Gemini quota-project conflict documented
- vercel/next.js#72613 — Monaco + Turbopack dynamic import bug (unresolved as of 2026-04-18)

### Tertiary (informational only)
- Flowise, Continue.dev, Open-Interpreter — surveyed as multi-runtime agent OSS comparisons; none solve the same problem as Sleepwalker; no direct prior art found

---
*Research completed: 2026-04-18*
*Ready for roadmap: yes*
