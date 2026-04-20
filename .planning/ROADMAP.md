# Roadmap: Sleepwalker v0.2 — Multi-Runtime Agent Deployment

**Created:** 2026-04-18
**Granularity:** standard (5-8 phases, 3-5 plans each)
**Mode:** yolo
**Core Value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place.

## Phases

- [x] **Phase 1: Foundation** - Freeze the adapter interface and slug-namespacing conventions that unblock all parallel work
- [x] **Phase 2: Adapters** - Ship four runtime adapters + supervisor + launchd writer so every target runtime can be deployed and probed — **code complete 2026-04-19** (2 manual smokes pending user execution; contracts at `test/manual/*-smoke.md`)
- [x] **Phase 3: Editor** - `/editor` form writes validated, secret-scanned routine bundles to disk with autosave and collision protection — **completed 2026-04-19** (9/9 plans, dashboard suite 250/250 green, frozen-surface diff 0 lines vs PHASE3_BASE `104547f`)
- [ ] **Phase 4: Deploy** - One-click deploy state machine + Run-now + Save-to-repo + health badges wire adapters through the dashboard UI
- [ ] **Phase 5: Queue** - Codex + Gemini runs flow into the Morning Queue with ANSI-stripped, race-free, flock-protected audit
- [ ] **Phase 6: Polish** - OSS docs, per-runtime templates, diagnostics page, and backward-compat integration gate

## Phase Details

### Phase 1: Foundation
**Goal**: Freeze the `RuntimeAdapter` TypeScript interface and cross-runtime naming conventions so all adapter, editor, and deploy work can proceed in parallel without interface churn.
**Depends on**: Nothing (first phase)
**Requirements**: ADPT-01, ADPT-02
**Success Criteria** (what must be TRUE):
  1. A TypeScript consumer can `import { RuntimeAdapter, RoutineBundle, DeployResult, HealthStatus } from "dashboard/lib/runtime-adapters/types"` and the interface contract compiles without modification through the rest of v0.2.
  2. Every new identifier in the system (launchd label, marker tag, branch name, internal key) resolves to `<runtime>/<slug>` form; a Codex `daily-brief` and Gemini `daily-brief` never collide anywhere in state, logs, or git.
  3. `routines-codex/` and `routines-gemini/` directories exist as additive siblings; all four v0.1 routine paths (`routines-local/`, `routines-cloud/`, hooks, install.sh) remain byte-identical.
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md -- types.ts interface freeze + index.ts registry skeleton (ADPT-01) — **completed 2026-04-18** (commit c146acf)
- [x] 01-02-PLAN.md -- routines-codex/, routines-gemini/, templates/ .gitkeep scaffolding (ADPT-02) — **completed 2026-04-18** (commit b38416c)
- [x] 01-03-PLAN.md -- slug.ts validator + 7 builders + slug.test.ts 28 assertions (ADPT-02) — **completed 2026-04-18** (commits 313bf62 / fbe8adc / 8b73e0f)
- [x] 01-04-PLAN.md -- frozen-surface gate + full-suite verification (ADPT-01 + ADPT-02) — **completed 2026-04-18** (commit b924c9a)

### Phase 2: Adapters
**Goal**: Ship a working, health-checkable, safely-invoked implementation of `RuntimeAdapter` for all four runtimes, plus the shared launchd writer and `bin/sleepwalker-run-cli` supervisor that the Codex and Gemini adapters depend on.
**Depends on**: Phase 1
**Requirements**: ADPT-03, ADPT-04, ADPT-05, ADPT-06, ADPT-07, ADPT-08, ADPT-09, SAFE-02
**Success Criteria** (what must be TRUE):
  1. Calling `getAdapter("codex").deploy(bundle)` writes a `plutil -lint`-valid plist with an absolute `codex` binary path (resolved via login shell) and an explicit `PATH` env; `launchctl bootstrap gui/$UID` loads it; on a fresh boot 8 hours later, launchd fires the job and finds the binary.
  2. Calling `getAdapter("gemini").deploy(bundle)` produces a plist with an explicit `GOOGLE_CLOUD_PROJECT` env var; `healthCheck()` reports the active auth mode and quota project so users see auth collisions before they burn quota.
  3. The supervisor script, when invoked by launchd, strips ANSI, routes the prompt via file (never argv), enforces the character budget with SIGTERM on exceed, and emits audit entries regardless of whether the wrapped CLI exits 0.
  4. `healthCheckAll()` returns four `HealthStatus` objects where unavailable runtimes report `{available: false, reason: "..."}` and never throw; a fresh Mac missing `codex` still loads the dashboard.
  5. Every consumer in v0.2 reaches runtimes through `getAdapter(runtime)`; no file in `dashboard/` directly imports a specific adapter module.
**Plans**: 10 plans

Plans:
- [x] 02-01-PLAN.md -- slug.ts assertValidSlug guard + slug.test.ts throw coverage (ADPT-02 amend) — **completed 2026-04-19** (commit c5922de)
- [x] 02-02-PLAN.md -- launchd-writer.ts plist generator + install/uninstall + 9 Vitest blocks (ADPT-03) — **completed 2026-04-19** (commit e14bbe6)
- [x] 02-03-PLAN.md -- bin/sleepwalker-run-cli supervisor (183 bash) (ADPT-04 + SAFE-02) — **completed 2026-04-19** (commit 39f7eb3)
- [x] 02-04-PLAN.md -- supervisor-tests.sh harness 6 scenarios (ADPT-04 verification) — **completed 2026-04-19** (commit 5bdb19c)
- [x] 02-05-PLAN.md -- claude-routines.ts adapter + 7 tests (ADPT-05) — **completed 2026-04-19** (commits 62bdaa7 + d7223a8)
- [x] 02-06-PLAN.md -- claude-desktop.ts adapter + 6 tests (ADPT-06) — **completed 2026-04-19** (commit 81f68ca)
- [x] 02-07-PLAN.md -- codex.ts adapter + 6 tests (ADPT-07) — **completed 2026-04-19** (commit fbda124)
- [x] 02-08-PLAN.md -- gemini.ts adapter + 7 tests (ADPT-08) — **completed 2026-04-19** (commit 72c6f69)
- [x] 02-09-PLAN.md -- registry swap + HealthStatus.warning amendment + adapter-registry.test.ts (ADPT-09) — **completed 2026-04-19** (commits db1e65d + a2f0563 + fc2b84a + 78eaaf7)
- [x] 02-10-PLAN.md -- exit gate + manual smoke tests + ROADMAP/STATE updates (ADPT-03..09 + SAFE-02 code complete; 2 manual smokes pending user) — **code complete 2026-04-19** (commit 0331f69 contracts + this closeout commit; automated gate green: typecheck + vitest 104/104 + supervisor 24/24 + frozen-surface diff 0 lines vs PHASE2_BASE 0ec59df)

### Phase 3: Editor
**Goal**: Deliver a `/editor` route where a user can fill a form, hit Save, and have a valid, secret-free, collision-checked routine bundle written to `routines-<runtime>/<slug>/` with autosave protecting against lost work.
**Depends on**: Phase 2
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05
**Success Criteria** (what must be TRUE):
  1. A user can open `/editor`, fill in name + prompt + runtime + cron + reversibility + budget, see an immediate `cronstrue` human-readable preview of the cron, and click Save to get `config.json` + `prompt.md` atomically written to `routines-<runtime>/<slug>/`; unavailable runtimes are dimmed with a fix-instructions tooltip.
  2. Pasting a Stripe `sk_live_` key, a GitHub `ghp_` token, a 40-char hex secret, or any gitleaks-matched pattern into the prompt blocks Save with a specific error pointing to the `${VAR}` pattern in AUTHORING.md; the disk is never touched on a blocked save.
  3. A user can spend 10 minutes editing, accidentally close the tab or click "Routines" in the sidebar, and return to find their draft intact via localStorage + in-app navigation intercept; no keystrokes lost.
  4. Attempting to save a routine with slug `../../../evil`, `Has Spaces`, `UPPERCASE`, or a `(runtime, slug)` pair that already exists anywhere under `routines-*/` is rejected with a clear message and no partial writes.
  5. Password managers (1Password, LastPass), browser autofill, browser spellcheck, and autocorrect cannot silently mutate the prompt textarea; inputs announce their opt-out via `autocomplete="off"`, `data-1p-ignore`, and siblings.
**Plans**: 9 plans

Plans:
- [x] 03-01-PLAN.md -- deps install + vitest jsdom config + RoutineBundleInput zod schema + 12-block accept/reject matrix (EDIT-02, EDIT-04) — **completed 2026-04-19** (commits 104547f + 8286db4; suite 137 → 161 green)
- [x] 03-02-PLAN.md -- secret-patterns.ts + scanForSecrets pure utility + 18-block pattern test matrix (EDIT-02) — **completed 2026-04-19** (commits 64fb6ec + 891e2f3; suite 161 → 179 green)
- [x] 03-03-PLAN.md -- bundles.ts read-side directory enumeration (listBundles/hasBundle/hasBundleAnyRuntime/readBundle) + 18 tests (EDIT-04) — **completed 2026-04-19** (commit 509adb0; suite 179 → 197 green)
- [x] 03-04-PLAN.md -- atomic-write.ts directory-swap helper + 8-scenario test matrix (EDIT-02) — **completed 2026-04-19** (commit 96690b0; suite 197 → 205 green)
- [x] 03-05-PLAN.md -- saveRoutine + checkSlugAvailability Server Actions + 16-block E2E tests (EDIT-02, EDIT-04) — **completed 2026-04-19** (commits 5505e32 + 70cc247; suite 205 → 221 green)
- [x] 03-06-PLAN.md -- /editor page.tsx shell + editor-client stub + RuntimeRadioGrid + CronPreview + 10 jsdom .test.tsx blocks (EDIT-01 partial — 2/4 VALIDATION rows green) — **completed 2026-04-19** (commits f343478 + 92e8313 + f302d3d; suite 221 → 231 green; first jsdom tests in repo; vitest esbuild jsx=automatic)
- [x] 03-07-PLAN.md -- SecretScanPanel + DraftRecoveryBanner + PreviewPanel presentational subcomponents + 6 jsdom test blocks (EDIT-03 partial — 1/4 VALIDATION rows green: banner visibility) — **completed 2026-04-19** (commits 674d86e + 9b14e09 + 9742c56 + 555e9de; suite 231 → 237 green; `/editor` route still 640 B / 141 kB; Node 25 + jsdom localStorage polyfill installed inline in test)
- [x] 03-08-PLAN.md -- EditorClient full state machine: useActionState wiring against saveRoutine + 500ms autosave + slug auto-derive + beforeunload intercept + autofill opt-out + 13-block integration tests (EDIT-01 + EDIT-03 + EDIT-05 code-complete; only 4 manual-only verifications remain) — **completed 2026-04-19** (commit 5e7d125; suite 237 → 250 green; `/editor` route 640 B → 13.2 kB / 141 kB → 154 kB; one Rule-3 auto-fix: preview-panel.tsx dropped `@/lib/runtime-adapters/slug` import that pulled node:path + node:os into the client bundle)
- [x] 03-09-PLAN.md -- phase exit gate: frozen-surface diff + test suite green + 03-VALIDATION flip + ROADMAP/STATE update — **completed 2026-04-19** (typecheck exit 0; 250/250 dashboard tests green; supervisor bash harness 24/24; frozen-surface 0-line diff vs PHASE3_BASE `104547f` across 20 v0.1 + Phase 2 paths)

### Phase 4: Deploy
**Goal**: Wire adapters and editor together so Deploy, Run-now, enable/disable, Save-to-repo, and health badges are one-click actions on the dashboard, with a state-machine deploy that auto-rolls-back on partial failure.
**Depends on**: Phase 3
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, REPO-01, HLTH-01
**Success Criteria** (what must be TRUE):
  1. A user can deploy a Codex routine via the Deploy button and watch the UI progress through `planning -> writing -> loading -> verified`; on success `launchctl print gui/$UID/com.sleepwalker.codex.<slug>` returns a live state within 3 seconds; on any step failure every artifact is rolled back (`launchctl bootout` + delete plist + delete state) with zero orphaned files on disk or in launchd.
  2. The Run-now button fires an immediate run for each of the four runtimes using the runtime-appropriate mechanism (Claude Routines `/fire`, Claude Desktop `claude -p`, Codex/Gemini supervisor) and the resulting run appears in the Morning Queue with the same shape as a scheduled run.
  3. Routine cards display Draft / Deployed / Drift status reading from `~/.sleepwalker/deploys/<slug>.state.json` and mtime comparison; per-routine enable/disable toggles call `bootout`/`bootstrap` and persist state in `config.json`.
  4. Clicking Save-to-repo stages only the exact files under `routines-<runtime>/<slug>/`, flock-guards the git index via `~/.sleepwalker/git.lock`, shows the user a `git diff --stat` preview before confirmation, never auto-pushes, and never sweeps up the user's unrelated uncommitted work.
  5. The dashboard landing page displays four runtime health badges (Claude Routines / Claude Desktop / Codex / Gemini) following the `brew doctor` pattern — green when ready, grey with a linked fix-instruction when not.
**Plans**: 9 plans
**UI hint**: yes

Plans:
- [x] 04-01-PLAN.md -- deps (simple-git + proper-lockfile) + deploy-state.ts atomic I/O + drift math + 11 it() blocks (DEPL-01 + DEPL-03 primitives) — **completed 2026-04-20** (commits `8707433` chore deps + scaffold + `e3526c1` feat impl + 11 it() blocks; suite 272 → 283 green; 6/36 VALIDATION rows green — rows 1 + 2 + 3 + 9 + 10 + 12)
- [x] 04-02-PLAN.md -- save-to-repo.ts simple-git + proper-lockfile wrapper + never-push + real-git-repo tests (REPO-01) — **completed 2026-04-20** (commits `55740f8` feat module + `7279030` test matrix; suite 283 → 291 green; 13/36 VALIDATION rows green — rows 21-27 all green; never-push + never-sweep invariants grep-verifiable)
- [x] 04-03-PLAN.md -- /api/health/all Route Handler with 2s per-adapter timeout + Promise.allSettled (HLTH-01 server) — **completed 2026-04-20** (commits `22b3740` feat Route Handler + `de000a6` test matrix; suite 291 → 297 green; 16/36 VALIDATION rows green — rows 28+29+30 flipped 4-03-02; Wave 0 COMPLETE)
- [x] 04-04-PLAN.md -- routines/actions.ts 4 deploy-family Server Actions (deploy state machine + rollback + runNow + setEnabled) (DEPL-01..05) — **completed 2026-04-20** (commits `c5a9c75` feat amend DeployState warning field + `d06d22b` feat routines/actions.ts 860 lines with deployRoutine state machine + 10s Promise.race rollback timeout + getDeployState pass-through + runNowRoutine dispatch + setRoutineEnabled with bootstrap/bootout + per-runtime persistEnabledFlag; `8047e2e` test deploy-routine-action 9 blocks covering VALIDATION rows 1+5+6+7+8; `85cd378` test run-now-action 6 + set-enabled-action 6 blocks covering rows 13-20; suite 297 → 318 green across 34 files; 29/36 VALIDATION rows green; DEPL-01/02/04/05 Server Action surfaces code-complete)
- [x] 04-05-PLAN.md -- routines/actions.ts 3 save-to-repo Server Action wrappers + integration round-trip (REPO-01) — **completed 2026-04-20** (commits `1ae5398` feat append previewSaveToRepoAction + commitSaveToRepoAction + releaseSaveLockAction as pure pass-throughs to @/lib/save-to-repo; `659ef16` test save-to-repo-action 4 it() blocks real-git integration matrix against mkdtempSync repo — preview ok+lockToken, preview→commit round-trip, preview→release→preview re-allows, preview→preview returns lock-busy; suite 318 → 322 green across 35 files; never-push / never-sweep invariants propagate unchanged from lib → action layer)
- [x] 04-06-PLAN.md -- HealthBadgeRow + HealthBadge client components with 60s cache + focus refetch + manual refresh (HLTH-01 client) — **completed 2026-04-20** (commits `e3492ea` feat HealthBadge presentational pill with 4 state variants (green/amber/grey/loading) + `df2c279` feat HealthBadgeRow `"use client"` with three-layer cache (sessionStorage TTL 60_000ms + window-focus stale refetch + per-badge manual refresh) consuming /api/health/all + `d016d98` test jsdom matrix 5 it() blocks matching 04-VALIDATION.md rows 31-35 anchor filters verbatim; suite 322 → 327 green across 36 files; 34/36 VALIDATION rows green; HLTH-01 code-complete end-to-end — landing page mount deferred to 04-09)
- [x] 04-07-PLAN.md -- DeployProgressDrawer + DeployStepPill + StatusPill + RunNowButton with framer-motion + 500ms polling (DEPL-01..04) — **completed 2026-04-20** (commits `69836bc` feat DeployStepPill + StatusPill + RunNowButton with UI-SPEC-locked copy + 800ms busy window + per-runtime toast table; `c585448` feat DeployProgressDrawer with framer-motion slide-in spring damping=25 stiffness=200 + 500ms setInterval polling + terminal-state teardown + role=alert rollback banner + Q1 warning pill-amber surface + Esc-only-when-terminal keyboard guard + focus-close-on-open + retry-resets-invokedRef; `b22444c` test jsdom matrix 5 it() blocks mocking `@/app/routines/actions` via vi.mock + dynamic component import: stops polling on terminal state (VALIDATION row 4) / rollback banner with role=alert / Close + Run now footer on succeeded / Dismiss + Retry deploy footer on rolled-back / warning surface on claude-desktop succeeded; suite 327 → 332 green across 37 files; 35/36 VALIDATION rows green — row 4 flipped `4-07-03 ✅ green`; `/routines` route bundle stays at 2.14 kB because Plan 04-09 wires the import into routines-client)
- [x] 04-08-PLAN.md -- SaveToRepoModal two-stage Review->Confirm + DiffStatPanel + ConfirmDialog (REPO-01 + DEPL-05) — **completed 2026-04-20** (commits `b09ab93` feat DiffStatPanel + ConfirmDialog presentational components (DiffStatPanel `{files, totals}` consumer with UI-SPEC-locked empty-state + non-empty heading + per-file text-signal-green/text-signal-red counts and Unicode MINUS SIGN U+2212 verbatim; ConfirmDialog shared role=dialog aria-modal with AnimatePresence fade+scale + focus-on-cancel + Esc close + backdrop click + btn-ghost/btn-danger CTAs + panel-raised max-w-md centered via flex overlay with pointer-events-none/auto opt-in — placed at app/_components/ for 04-09 DisableToggle cross-segment import) + `feadcd6` feat SaveToRepoModal two-stage Review->Confirm with flock lifecycle + Cmd/Ctrl+Enter submit (555 lines across 3 sub-components; state {stage, preview, message, committing, confirmDiscardOpen, committed}; useEffect on [open, runtime, slug] kicks off previewSaveToRepoAction with invokedRef Strict Mode guard; Stage 1 branches preview===null→Loader2 spin, preview.ok→DiffStatPanel, preview.kind='lock-busy'→amber role=alert with UI-SPEC line 214 verbatim, preview.kind='no-changes'→empty DiffStatPanel, preview.kind='git-error'→red role=alert; Continue disabled when !preview.ok or totals.filesChanged===0; Cancel branches preview.ok→ConfirmDialog Discard confirm → releaseSaveLockAction+onClose, !preview.ok→direct onClose; Stage 2 Confirm renders `Commit message` heading + one-line diff summary + MESSAGE label + textarea rows=3 with INPUT_OPT_OUT 8-attr bag identical to editor-client.tsx + placeholder + onKeyDown (e.metaKey||e.ctrlKey)&&e.key==='Enter' → handleCommit + helper + never-push subtitle UI-SPEC line 216 verbatim + Back/Commit CTAs; handleCommit invokes commitSaveToRepoAction — on ok: setCommitted(true) + green 6s toast `Committed ${shortSha} — ${message.split('\n')[0]}` + onClose; on !ok: red 8s toast + stay; safe-unmount release effect releases flock when preview.ok && !committed; focus mgmt across stages; Esc routing); suite stays 332/332 green across 37 files — unchanged by plan design (Plan 04-05 real-git matrix + Plan 04-02 lib matrix already cover save-to-repo boundary end-to-end; jsdom mocking of save-to-repo.ts module-scoped flock registry infeasible without heavy scaffolding; VALIDATION.md §Manual-Only row 4 two-tab lock-busy resolves by inspection); typecheck exit 0; `pnpm build` `/routines` 2.14 kB / 143 kB and `/editor` 13.2 kB / 154 kB UNCHANGED — Plan 04-09 wires SaveToRepoModal trigger into routines-client + ConfirmDialog-backed DisableToggle; client-bundle safety check passes; REPO-01 UI surface code-complete at component level)
- [ ] 04-09-PLAN.md -- route integration (routines/page + routines-client + landing page) + RoutineActionBar + Phase 4 exit gate (all 7 requirements)

### Phase 5: Queue
**Goal**: Extend the Morning Queue and audit surface so Codex and Gemini runs produce normalized, ANSI-stripped, flock-protected JSONL that flows through every existing v0.1 consumer without code changes.
**Depends on**: Phase 4
**Requirements**: QUEU-01, QUEU-02, QUEU-03, QUEU-04, SAFE-01
**Success Criteria** (what must be TRUE):
  1. A user sees Codex and Gemini entries in the same Morning Queue as local and cloud, with distinct source pills (pure CSS, no new dependency), identical approve/reject affordances, and the existing v0.1 aggregator logic untouched.
  2. Codex/Gemini audit entries contain `runtime`, `fleet` as `<runtime>/<slug>`, ANSI-stripped content (no `\x1b[` sequences, no `[32m` prefixes), ISO 8601 timestamps, and char-count budget info; `jq .` parses every line.
  3. Four concurrent routines (one per runtime) writing to `audit.jsonl` simultaneously produce zero corrupted or interleaved JSON lines — `flock` on the write path eliminates the race v0.1 CONCERNS.md flagged.
  4. A Codex or Gemini routine that blows past its character budget is SIGTERMed by the supervisor within one budget interval; the audit log shows a `cli-budget-exceeded` event labeled "approximate" (never "tokens"); stdout is captured up to the cutoff.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Polish
**Goal**: Ship OSS-quality docs, per-runtime templates, a diagnostics page, and a backward-compatibility integration gate so a second user on a different Mac can go from clone to first custom routine in under 10 minutes without surprising any v0.1 user.
**Depends on**: Phase 5
**Requirements**: DOCS-01, DOCS-02, DOCS-03, COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. A user who has just cloned the repo can follow `docs/AUTHORING.md` and have a scheduled custom routine running on any of the four runtimes in under 10 minutes, including the Mac-sleep caveat with `caffeinate`/`pmset` alternatives and a Troubleshooting section indexed by error message.
  2. `templates/routine-claude-routines.md`, `templates/routine-claude-desktop.md`, `templates/routine-codex.md`, and `templates/routine-gemini.md` each contain a commented frontmatter block plus a skeleton prompt; a user copies one, edits it, and has a syntactically valid bundle.
  3. The `/diagnostics` page reports macOS version, Homebrew prefix (arm64/x86_64 detected at runtime), each CLI's absolute path, active shell, and `~/Library/LaunchAgents/` writability in a copy-to-GitHub-issue format; a fresh Intel Mac running fish shell with macOS 14 loads the page without crashing.
  4. An end-to-end integration test verifies that all 14 v0.1 routines (6 local + 8 cloud) deploy, run, and surface in the Morning Queue without code changes; `install.sh` is re-run idempotently on a v0.1 install and produces a no-op upgrade; no hook script name, path, or JSONL schema field has changed.
  5. The v0.1 frozen surface (hook paths, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` wiring, `QueueEntry` fields, `[sleepwalker:<fleet>]` marker format, reversibility colors, policy names) is verified unchanged by a backward-compatibility test run in CI.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-18 |
| 2. Adapters | 10/10 | Code Complete (manual smokes pending) | 2026-04-19 |
| 3. Editor | 9/9 | Complete | 2026-04-19 |
| 4. Deploy | 8/9 | In Progress (Waves 0 + 1 + 2 + 3 COMPLETE — 04-08 DiffStatPanel + ConfirmDialog + SaveToRepoModal done; only Wave 4 04-09 exit gate remains) | - |
| 5. Queue | 0/TBD | Not started | - |
| 6. Polish | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-18*
*Last updated: 2026-04-20 after Phase 4 Plan 08 execution (Wave 3 — save-to-repo UI triad landed; commits `b09ab93` feat DiffStatPanel (80 lines) + ConfirmDialog (114 lines) presentational components — DiffStatPanel renders per-file grid-cols-[1fr_auto] rows with text-signal-green +{added} / text-signal-red −{removed} and UI-SPEC-locked empty-state copy `No staged changes — this bundle is already in sync with HEAD.` + non-empty heading `{n} file{s?} changed — {added} additions, {removed} deletions`; ConfirmDialog shared role=dialog aria-modal with focus-on-cancel + Esc close + backdrop click close + AnimatePresence fade+scale + btn-ghost/btn-danger CTAs, placed at `app/_components/` for 04-09 DisableToggle cross-segment import; `feadcd6` feat SaveToRepoModal (555 lines across SaveToRepoModal + ReviewStage + ConfirmStage sub-components) two-stage Review→Confirm with owned flock lifecycle — previewSaveToRepoAction on mount acquires lockToken (invokedRef Strict Mode guard), Stage 1 branches preview===null/loading/ok/lock-busy/no-changes/git-error, Stage 2 commit-message textarea with INPUT_OPT_OUT 8-attr bag + Cmd/Ctrl+Enter submit + never-push subtitle `This writes a local commit. Push manually with \`git push\` when you're ready.` + post-commit green 6s toast `Committed {shortSha} — {message.split('\n')[0]}`; Discard via ConfirmDialog `Discard this save?` prompt; safe-unmount release when preview.ok && !committed; focus management across stages; Esc routing between stages; dashboard suite stays 332/332 green across 37 files — zero new test files by plan design (Plan 04-05 real-git matrix + Plan 04-02 lib matrix cover save-to-repo boundary end-to-end; jsdom mocking of save-to-repo.ts module-scoped flock registry infeasible without heavy scaffolding; VALIDATION.md §Manual-Only row 4 two-tab lock-busy resolves by inspection against grep-verifiable UI copy); typecheck exit 0; `pnpm build` `/routines` 2.14 kB / 143 kB and `/editor` 13.2 kB / 154 kB UNCHANGED — modal + dialog + panel authored but not yet mounted; Plan 04-09 wires SaveToRepoModal trigger into routines-client + ConfirmDialog-backed DisableToggle; client-bundle safety check passes (grep `node:|from "fs"|from "os"|from "path"` returns 0 hits); REPO-01 UI surface code-complete at component level; Phase 4 now 8/9 plans done (89%); only Wave 4 04-09 exit gate remains. Pre-existing parallel-session uncommitted paths preserved untouched via explicit staging. Zero Rule 1/2/3 auto-fixes; zero architectural deviations; zero auth gates; two minor in-scope refinements documented in 04-08-SUMMARY.md §Deviations (ConfirmStage+ReviewStage factored as local sub-components for readability; committed boolean flag suppresses duplicate unmount release — behavior-neutral))*
