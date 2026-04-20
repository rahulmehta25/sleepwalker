# Requirements: Sleepwalker v0.2 — Multi-Runtime Agent Deployment

**Defined:** 2026-04-18
**Core Value:** Write a prompt + pick a schedule + pick a runtime → click once → a live agent exists on that runtime, scheduled, audited, and reviewed from one place.

## v1 Requirements

Requirements for the v0.2 milestone. Each maps to a roadmap phase. Derived from PROJECT.md Active requirements, cross-validated against `.planning/research/SUMMARY.md` P1 feature list.

### Adapter Foundation (Phase 0/1 territory)

- [x] **ADPT-01**: `RuntimeAdapter` TypeScript interface is frozen and exported from `dashboard/lib/runtime-adapters/types.ts` with `deploy`, `undeploy`, `runNow`, `listRuns`, `healthCheck` methods and typed `RoutineBundle`, `DeployResult`, `HealthStatus` shapes — **completed 2026-04-18 (01-01, commit c146acf)**
- [x] **ADPT-02**: Slug namespacing convention is enforced everywhere: internal key `<runtime>/<slug>`, launchd label `com.sleepwalker.<runtime>.<slug>`, audit marker `[sleepwalker:<runtime>/<slug>]`, branch prefix `claude/sleepwalker/<runtime>/<slug>/*` — **completed 2026-04-18 (01-02 directory scaffolding, commit b38416c; 01-03 slug.ts validator + 7 identifier builders + 13 it() / 28 expect() unit coverage, commits 313bf62 + fbe8adc + 8b73e0f)**
- [x] **ADPT-03**: `launchd-writer.ts` produces a valid plist, installs via `launchctl bootstrap gui/$UID`, uninstalls via `launchctl bootout`, and validates with `plutil -lint` before bootstrap — **SEALED 2026-04-20 (02-02 commit e14bbe6 + 02-11 supervisor staging 3ce91b5 + 02-12 bundle staging 4cbb5bb + codex skip-git-repo-check 633a07a; real-Mac smoke from ~/Desktop/Projects/sleepwalker observed SMOKE_OK in audit.jsonl completed event at 2026-04-20T00:24:18Z)**
- [x] **ADPT-04**: `bin/sleepwalker-run-cli` supervisor resolves absolute CLI path via login shell, enforces sleep-window + reversibility + char-budget gates, strips ANSI, and emits normalized `audit.jsonl` entries — **SEALED 2026-04-20 (02-03 commit 39f7eb3 + 02-11 4-arg bundle_dir 7cc884a + 02-12 --skip-git-repo-check 633a07a)**
- [x] **ADPT-05**: Runtime adapter **Claude Code Routines** (`claude-routines.ts`) — `deploy()` returns `{handoffUrl}` for `/schedule create` + pre-filled browser; `runNow()` wraps existing `fire-routine.ts`; `healthCheck()` probes beta-header + `claude` CLI availability — **completed 2026-04-19 (02-05, commits 62bdaa7 + d7223a8)**
- [x] **ADPT-06**: Runtime adapter **Claude Code Desktop Scheduled Tasks** (`claude-desktop.ts`) — `deploy()` copies SKILL.md to `~/.claude/scheduled-tasks/<slug>/` and returns a handoff URL for Desktop's Schedule page; `healthCheck()` probes for `~/.claude/` and Desktop binary — **completed 2026-04-19 (02-06, commit 81f68ca)**
- [x] **ADPT-07**: Runtime adapter **Codex Pro** (`codex.ts`) — `deploy()` writes `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` invoking the supervisor; `healthCheck()` probes `codex --version`, active auth mode, and absolute binary path — **completed 2026-04-19 (02-07, commit fbda124)**
- [x] **ADPT-08**: Runtime adapter **Gemini CLI Pro** (`gemini.ts`) — `deploy()` writes plist with explicit `GOOGLE_CLOUD_PROJECT` env var invoking the supervisor; `healthCheck()` probes `gemini --version` + auth + quota project — **completed 2026-04-19 (02-08, commit 72c6f69)**
- [x] **ADPT-09**: `ADAPTERS` registry + `getAdapter(runtime)` + `healthCheckAll()` shipping in `dashboard/lib/runtime-adapters/index.ts`; every consumer uses registry lookups, never direct imports — **completed 2026-04-19 (02-09, commits db1e65d + a2f0563 + fc2b84a + 78eaaf7)**

### Routine Editor (Phase 2 territory)

- [x] **EDIT-01**: `/editor` route renders a Next.js form with fields for name, prompt, runtime (radio — unavailable runtimes dimmed with fix-tooltip), cron schedule (with `cronstrue` human preview), reversibility radio (green/yellow/red), and budget input — **completed 2026-04-19 (03-06 shell + 03-08 full state machine, commits f343478 + 92e8313 + f302d3d + 5e7d125)**
- [x] **EDIT-02**: `saveRoutine` Server Action validates via zod, runs a secret-scan (gitleaks-style regex) on the prompt, and writes `config.json` + `prompt.md` to `routines-<runtime>/<slug>/` atomically — **completed 2026-04-19 (03-05, commits 5505e32 + 70cc247; claude-desktop/claude-routines branch writes SKILL.md instead of config.json + prompt.md)**
- [x] **EDIT-03**: Editor auto-saves to `localStorage` (500ms debounce) and intercepts navigation when dirty — no lost work on refresh/back — **completed 2026-04-19 (03-07 DraftRecoveryBanner + 03-08 autosave + beforeunload + save-clears-draft state machine, commits 9742c56 + 5e7d125)**
- [x] **EDIT-04**: Slug validation enforces `^[a-z][a-z0-9-]{0,63}$` and rejects collisions with existing `<runtime>/<slug>` pairs anywhere across `routines-*/` — **completed 2026-04-19 (03-01 zod regex + 03-03 hasBundleAnyRuntime + 03-05 saveRoutine composition, commits 8286db4 + 509adb0 + 5505e32 + 70cc247)**
- [x] **EDIT-05**: All editor inputs set `autocomplete="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true"` to prevent password manager / spellcheck corruption of prompts — **completed 2026-04-19 (03-08 INPUT_OPT_OUT const spread applies all 8 autofill opt-out attrs to every input + prompt textarea rows=30; commit 5e7d125)**

### Deploy & Runtime Control (Phase 3 territory)

- [x] **DEPL-01**: "Deploy" button on each routine card drives a 4-stage state machine (`planning → writing → loading → verified`) tracked in `~/.sleepwalker/deploys/<slug>.state.json`; UI polls until terminal state — **completed 2026-04-20 (04-01 deploy-state.ts + 04-04 deployRoutine Server Action + 04-07 DeployProgressDrawer + 04-09 wired into /routines surface; commits 8707433 + e3526c1 + d06d22b + c585448 + 1f1feb6)**
- [x] **DEPL-02**: Deploy auto-rolls-back on any step failure: `launchctl bootout` + delete plist + delete state + emit clear error in dashboard — no orphaned artifacts ever — **completed 2026-04-20 (04-04 rollback orchestrator with 10s Promise.race + forensic rollbackActions array; 04-07 DeployProgressDrawer role=alert rollback banner + Retry deploy CTA; 04-09 wired via RoutineActionBar; commits d06d22b + c585448 + 1f1feb6)**
- [x] **DEPL-03**: Routine card status indicator shows Draft / Deployed / Drift states; Drift = mtime(bundle) > mtime(deployed artifact) → "Redeploy" badge — **completed 2026-04-20 (04-01 computeStatus + bundleMtime; 04-07 StatusPill with DRAFT/DEPLOYED/DRIFT/DISABLED variants; 04-09 listRoutinesAsync attaches status per bundle + routines-page.test.ts 4 it() blocks including "status per bundle"; commits e3526c1 + 69836bc + 1f1feb6 + 71f920d)**
- [x] **DEPL-04**: "Run now" button works for all four runtimes — Claude Routines uses `/fire`, Claude Desktop uses `claude -p`, Codex/Gemini spawn the supervisor in run-now mode (same audit shape as scheduled runs) — **completed 2026-04-20 (04-04 runNowRoutine Server Action dispatching via getAdapter(runtime).runNow; 04-07 RunNowButton with per-runtime toast copy + 800ms busy window + handoff-URL new-tab behavior; 04-09 RunNowButton wired into RoutineActionBar for Deployed + Drift states; commits d06d22b + 69836bc + 1f1feb6)**
- [x] **DEPL-05**: Per-routine enable/disable toggle calls `launchctl bootout` on disable and `launchctl bootstrap` on enable, persists state in `config.json`, and surfaces current state in the card — **completed 2026-04-20 (04-04 setRoutineEnabled with bootstrap/bootout for codex/gemini + per-runtime persistEnabledFlag + first-enable invariant; 04-08 ConfirmDialog for destructive confirm; 04-09 RoutineActionBar routes Draft-enable to Deploy drawer and Deployed-disable to ConfirmDialog; commits d06d22b + b09ab93 + 1f1feb6)**

### Queue & Audit Extension (Phase 4 territory)

- [ ] **QUEU-01**: `QueueSource` type widens to `"local" | "cloud" | "codex" | "gemini"`; existing local + cloud consumers continue to work unchanged
- [x] **QUEU-02**: Morning Queue UI renders Codex + Gemini source pills (pure CSS, no new dependency) alongside existing local/cloud pills — **completed 2026-04-20 (05-02 added `.pill-codex` + `.pill-gemini` Tailwind utility classes to dashboard/app/globals.css:78-79 using pre-existing aurora-500 + dawn-400 palette tokens with WCAG AA contrast; 05-07 wired consumer side — queue-client.tsx gains exported SourceIcon + SourcePill inline helpers driving 4-way source discriminator replacing binary isCloud ternary; codex → Terminal icon + pill-codex, gemini → Sparkles + pill-gemini, cloud → Cloud + pill-aurora, local → HardDrive + signal-green; RecentList switches to SourcePill for visual parity; 6 jsdom it() blocks in new queue-client.test.tsx cover all 4 source pill variants; commits 548d432 + 373b342)**
- [ ] **QUEU-03**: Supervisor emits normalized `audit.jsonl` entries for Codex/Gemini runs with `runtime`, `fleet` as `<runtime>/<slug>`, ANSI-stripped content, timestamp, and char-count budget info
- [ ] **QUEU-04**: `flock` on `~/.sleepwalker/audit.jsonl` write path eliminates the concurrent-write race that v0.1 CONCERNS.md flagged; applies to all four runtimes

### Safety & Budget (Phase 4 territory)

- [x] **SAFE-01**: Approximate character-based budget cap for CLI runtimes (Codex/Gemini) — supervisor SIGTERMs the subprocess when cap is exceeded; documented as ±40% approximate, labeled "approximate" in UI, never as "tokens" — **completed 2026-04-20 (supervisor SIGTERM char-budget enforcement landed in Phase 2 via bin/sleepwalker-run-cli per SAFE-02 block; 05-07 sealed the UI honest-labeling invariant at 3 sites: routines-client.tsx:62 `tokens` → `chars (approximate)`, editor-client.tsx gains `Approximate character cap. Tokens vary by ±40% depending on output format.` helper below budget input, queue-client.tsx ActionDetail supervisor-run branch renders `Stopped at {chars} chars (budget: {limit}, approximate)` for budget_exceeded events; negative invariant `grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` returns empty; jsdom test asserts both positive `toContain('approximate')` and negative `not.toMatch(/budget.*tokens/)` on rendered DOM; commits 8eebb80 + 373b342)**
- [x] **SAFE-02**: Supervisor sets `NO_COLOR=1 TERM=dumb CI=true` and pipes stdout/stderr through a 3-class perl ANSI-strip (CSI + OSC + DCS/PM/APC) before any audit write — **completed 2026-04-19 (02-03, commit 39f7eb3; perl chosen over Node stripVTControlCharacters to keep supervisor bash-only — no Node runtime dependency)**

### Save to Repo (Phase 3 territory)

- [x] **REPO-01**: "Save to repo" button on routine card does explicit-path `git add <routines-<runtime>/<slug>/*>` + commit with flock on `~/.sleepwalker/git.lock`, shows `git diff --stat` preview before confirm, never auto-pushes — **completed 2026-04-20 (04-02 save-to-repo.ts library with simple-git + proper-lockfile never-push / never-sweep invariants grep-verifiable; 04-05 previewSaveToRepoAction + commitSaveToRepoAction + releaseSaveLockAction wrappers; 04-08 SaveToRepoModal two-stage Review→Confirm with DiffStatPanel + ConfirmDialog Discard; 04-09 wired into RoutineActionBar; commits 55740f8 + 7279030 + 1ae5398 + 659ef16 + b09ab93 + feadcd6 + 1f1feb6)**

### Runtime Health (Phase 1/3 territory)

- [x] **HLTH-01**: Dashboard landing page shows four runtime health badges (Claude Routines / Claude Desktop / Codex / Gemini) following the `brew doctor` pattern — green when ready, grey with fix-instructions link when not — **completed 2026-04-20 (04-03 /api/health/all Route Handler with 2s per-adapter Promise.race timeout + Promise.allSettled; 04-06 HealthBadgeRow + HealthBadge client components with 60s sessionStorage cache + window-focus refetch + per-badge manual refresh; 04-09 mounted on landing page PageHeader meta array as first entry; commits 22b3740 + de000a6 + e3492ea + df2c279 + d016d98 + 71f920d)**

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

Each v1 requirement maps to exactly one phase. Filled during roadmap creation (2026-04-18).

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADPT-01 | Phase 1 | Complete (01-01 c146acf; 01-04 exit gate verified b924c9a, 2026-04-18) |
| ADPT-02 | Phase 1 | Complete (01-02 scaffolding b38416c; 01-03 slug.ts + tests 313bf62/fbe8adc/8b73e0f; 01-04 exit gate verified b924c9a, 2026-04-18) |
| ADPT-03 | Phase 2 | Code Complete (02-02 launchd-writer.ts + 9 Vitest blocks, commit e14bbe6, 2026-04-19; manual launchctl bootstrap smoke pending — test/manual/codex-adapter-smoke.md) |
| ADPT-04 | Phase 2 | Complete (02-03 bin/sleepwalker-run-cli supervisor, commit 39f7eb3, 2026-04-19) |
| ADPT-05 | Phase 2 | Complete (02-05 claude-routines adapter + 7 Vitest blocks, commits 62bdaa7 + d7223a8, 2026-04-19) |
| ADPT-06 | Phase 2 | Complete (02-06 claude-desktop adapter + 6 Vitest blocks, commit 81f68ca, 2026-04-19; Q1 Desktop Schedule-tab pickup smoke pending — test/manual/claude-desktop-smoke.md) |
| ADPT-07 | Phase 2 | Complete (02-07 codex adapter + 6 Vitest blocks, commit fbda124, 2026-04-19; real-Mac launchctl/audit smoke pending — test/manual/codex-adapter-smoke.md) |
| ADPT-08 | Phase 2 | Complete (02-08 gemini adapter + 7 Vitest blocks, commit 72c6f69, 2026-04-19) |
| ADPT-09 | Phase 2 | Complete (02-09 registry swap + HealthStatus.warning amendment + adapter-registry.test.ts, commits db1e65d + a2f0563 + fc2b84a + 78eaaf7, 2026-04-19) |
| EDIT-01 | Phase 3 | Complete (03-06 /editor shell + RuntimeRadioGrid + CronPreview + 03-08 full EditorClient state machine renders 7-field form + 4 runtime cards + UI-SPEC placeholders, commits f343478 + 92e8313 + f302d3d + 5e7d125, 2026-04-19) |
| EDIT-02 | Phase 3 | Complete (03-05 saveRoutine + 12 E2E test blocks covering secret-blocks-write + atomic-write + SKILL.md branch, commits 5505e32 + 70cc247, 2026-04-19) |
| EDIT-03 | Phase 3 | Complete (03-07 DraftRecoveryBanner + 03-08 500ms autosave + beforeunload-when-dirty + save-clears-draft.v1 state machine, commits 9742c56 + 5e7d125, 2026-04-19) |
| EDIT-04 | Phase 3 | Complete (03-01 zod slug regex + 03-03 hasBundleAnyRuntime + 03-05 saveRoutine/checkSlugAvailability cross-runtime composition, commits 8286db4 + 509adb0 + 5505e32 + 70cc247, 2026-04-19) |
| EDIT-05 | Phase 3 | Complete (03-08 INPUT_OPT_OUT const spread applies autocomplete/autocorrect/autocapitalize/spellcheck=false/data-1p-ignore/data-lpignore/data-form-type/data-bwignore to every input + prompt textarea rows=30, commit 5e7d125, 2026-04-19) |
| DEPL-01 | Phase 4 | Complete (04-01 deploy-state.ts atomic I/O + 04-04 deployRoutine Server Action state machine + 04-07 DeployProgressDrawer 500ms polling + 04-09 wired into /routines surface; commits 8707433 + e3526c1 + d06d22b + c585448 + 1f1feb6, 2026-04-20) |
| DEPL-02 | Phase 4 | Complete (04-04 rollback orchestrator with 10s Promise.race + rollbackActions forensic array; 04-07 role=alert banner + Retry deploy CTA; 04-09 wired; commits d06d22b + c585448 + 1f1feb6, 2026-04-20) |
| DEPL-03 | Phase 4 | Complete (04-01 computeStatus + bundleMtime + drift math; 04-07 StatusPill DRAFT/DEPLOYED/DRIFT/DISABLED variants; 04-09 listRoutinesAsync + routines-page.test.ts "status per bundle" integration verifies mtime(bundle) > verifiedAt ⇒ drift; commits e3526c1 + 69836bc + 1f1feb6 + 71f920d, 2026-04-20) |
| DEPL-04 | Phase 4 | Complete (04-04 runNowRoutine Server Action via getAdapter(runtime).runNow; 04-07 RunNowButton with per-runtime UI-SPEC-locked toast copy + 800ms anti-double-click busy window + claude-routines new-tab handoff; 04-09 wired into RoutineActionBar for Deployed + Drift states; commits d06d22b + 69836bc + 1f1feb6, 2026-04-20) |
| DEPL-05 | Phase 4 | Complete (04-04 setRoutineEnabled with bootstrap/bootout for codex/gemini + per-runtime persistEnabledFlag + first-enable invariant; 04-08 ConfirmDialog component; 04-09 RoutineActionBar routes Draft-enable to Deploy drawer and Deployed-disable to ConfirmDialog; commits d06d22b + b09ab93 + 1f1feb6, 2026-04-20) |
| QUEU-01 | Phase 5 | Partial (05-01 widened QueueSource to "local" | "cloud" | "codex" | "gemini" and QueueStatus to add "complete" + "failed" terminal supervisor-run states in dashboard/lib/queue.ts; strictly additive — typecheck exit 0 with zero consumer-side edits, RESEARCH §3.2 grep-audit prediction validated; 3 new it() blocks in queue.test.ts cover codex/gemini/complete/failed round-trip; commit a545f0b, 2026-04-20. Remaining: end-to-end consumer surface — Plan 05-03 readSupervisorRuns supervisor audit reader + Plan 05-07 queue-client.tsx UI source branch for codex/gemini pills) |
| QUEU-02 | Phase 5 | Complete (05-02 added `.pill-codex` + `.pill-gemini` Tailwind utility classes to dashboard/app/globals.css:78-79 producer side; 05-07 consumer side wired queue-client.tsx inline exported SourceIcon + SourcePill helpers — 4-way dispatch for cloud/codex/gemini/local; RecentList uses SourcePill; 6 jsdom it() blocks in queue-client.test.tsx cover all 4 variants; commits 548d432 + 373b342, 2026-04-20) |
| QUEU-03 | Phase 5 | Partial (reader-side code-complete after 05-03; supervisor audit_emit contract was already met end-to-end by Phase 2 per RESEARCH §2 — byte-identical vs HEAD~2; end-to-end Complete gates on Plan 05-07 UI consumer wiring `kind:"supervisor-run"` entries into queue-client.tsx) |
| QUEU-04 | Phase 5 | Pending |
| SAFE-01 | Phase 5 | Complete (supervisor SIGTERM char-budget landed in Phase 2 bin/sleepwalker-run-cli per SAFE-02; 05-07 sealed UI honest-labeling invariant at 3 sites — routines-client.tsx:62 `chars (approximate)`, editor-client.tsx helper `Approximate character cap. Tokens vary by ±40%`, queue-client.tsx supervisor-run ActionDetail `Stopped at {chars} chars (budget: {limit}, approximate)`; negative invariant `grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` empty; jsdom test asserts both positive + negative invariant on rendered DOM; commits 8eebb80 + 373b342, 2026-04-20) |
| SAFE-02 | Phase 2 | Complete (02-03 bin/sleepwalker-run-cli supervisor, commit 39f7eb3, 2026-04-19) |
| REPO-01 | Phase 4 | Complete (04-02 save-to-repo.ts simple-git + proper-lockfile library with never-push / never-sweep invariants grep-verifiable; 04-05 previewSaveToRepoAction + commitSaveToRepoAction + releaseSaveLockAction Server Action wrappers; 04-08 SaveToRepoModal two-stage Review→Confirm client + DiffStatPanel + ConfirmDialog Discard; 04-09 wired into RoutineActionBar; commits 55740f8 + 7279030 + 1ae5398 + 659ef16 + b09ab93 + feadcd6 + 1f1feb6, 2026-04-20) |
| HLTH-01 | Phase 4 | Complete (04-03 /api/health/all Route Handler with 2s Promise.race per-adapter timeout + Promise.allSettled; 04-06 HealthBadgeRow + HealthBadge with 60s sessionStorage cache + window-focus refetch + per-badge manual refresh; 04-09 mounted on landing page PageHeader meta array as first entry; commits 22b3740 + de000a6 + e3492ea + df2c279 + d016d98 + 71f920d, 2026-04-20) |
| DOCS-01 | Phase 6 | Pending |
| DOCS-02 | Phase 6 | Pending |
| DOCS-03 | Phase 6 | Pending |
| COMP-01 | Phase 6 | Pending |
| COMP-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32 (100%)
- Unmapped: 0

**Per-phase counts:**
- Phase 1 (Foundation): 2 requirements
- Phase 2 (Adapters): 8 requirements
- Phase 3 (Editor): 5 requirements
- Phase 4 (Deploy): 7 requirements
- Phase 5 (Queue): 5 requirements
- Phase 6 (Polish): 5 requirements

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-21 after Phase 5 Plan 03 execution (QUEU-03 flipped from Pending to Partial — reader-side code-complete at `dashboard/lib/queue-aggregator.ts` with new `readSupervisorRuns()` exported alongside v0.1 `readLocalQueue` + `fetchCloudQueue`. Supervisor audit_emit contract was already met end-to-end by Phase 2 per RESEARCH §2 — byte-identical vs HEAD~2 verified via `git diff HEAD~2 HEAD -- bin/sleepwalker-run-cli` = 0 lines. `aggregateQueue()` now merges local + cloud + supervisor into the pending/recent split with additive `supervisorCount` field on `AggregatedQueue`. 12 new it() blocks in `dashboard/tests/supervisor-runs.test.ts` cover the RESEARCH §6.1 matrix verbatim (missing/empty file, v0.1 hook drop, runtime filter, started filter, 4 event-to-status mappings, 24h cutoff, malformed-line skip, deterministic-id regex); 1 new integration block in queue-aggregator.test.ts asserts 4-source merge with all source literals surfacing. Two atomic commits `3c81b4f` + `a3e85e5`; dashboard suite 339 → 352 green. End-to-end QUEU-03 Complete gates on Plan 05-07 UI consumer branch wiring `kind:"supervisor-run"` + `source:codex|gemini` entries into queue-client.tsx alongside the 05-02 pill classes. No requirement fully flipped this plan — QUEU-01 stays Partial, QUEU-03 moves from Pending to Partial. 22/32 v1 requirements Complete; 10 remain across Phase 5 Queue (QUEU-01 Partial + QUEU-03 Partial + QUEU-02 + QUEU-04 + SAFE-01) and Phase 6 Polish (DOCS-01..03 + COMP-01 + COMP-02))*

*Previous update: 2026-04-20 after Phase 5 Plan 01 execution (QUEU-01 flipped from Pending to Partial — type surface code-complete at the lib boundary: dashboard/lib/queue.ts widens QueueSource union to "local" | "cloud" | "codex" | "gemini" and QueueStatus union to add "complete" + "failed" terminal supervisor-run states; strictly additive — zero consumer-side edits required, RESEARCH §3.2 grep-audit prediction validated by typecheck exit 0. 3 new it() blocks in queue.test.ts cover codex/gemini/complete/failed round-trip through appendQueueEntry + readLocalQueue. Single atomic commit a545f0b. End-to-end QUEU-01 consumer surface — supervisor audit reader (Plan 05-03 readSupervisorRuns) + UI source branch (Plan 05-07 queue-client.tsx codex/gemini pills) — remains pending; QUEU-01 flips to Complete only when those ship. 22/32 v1 requirements Complete; 10 remain across Phase 5 Queue (QUEU-01 Partial + QUEU-02..04 + SAFE-01) and Phase 6 Polish (DOCS-01..03 + COMP-01 + COMP-02))*

*Previous update: 2026-04-20 after Phase 4 Plan 09 execution (Phase 4 sealed — DEPL-01 / DEPL-02 / DEPL-03 / DEPL-04 / DEPL-05 + REPO-01 + HLTH-01 all flipped from Partial/Pending to Complete. 22/32 v1 requirements Complete (15 Phase 1-3 + 7 Phase 4); 10 requirements remain across Phase 5 Queue (QUEU-01..04 + SAFE-01) and Phase 6 Polish (DOCS-01..03 + COMP-01 + COMP-02). Phase 4 automated exit gate green: typecheck exit 0, 336/336 dashboard tests, 28/0 supervisor harness, 0-line frozen-surface diff vs PHASE4_BASE `8707433^`)*
