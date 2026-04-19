# Roadmap: Sleepwalker v0.2 — Multi-Runtime Agent Deployment

**Created:** 2026-04-18
**Granularity:** standard (5-8 phases, 3-5 plans each)
**Mode:** yolo
**Core Value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place.

## Phases

- [x] **Phase 1: Foundation** - Freeze the adapter interface and slug-namespacing conventions that unblock all parallel work
- [x] **Phase 2: Adapters** - Ship four runtime adapters + supervisor + launchd writer so every target runtime can be deployed and probed — **code complete 2026-04-19** (2 manual smokes pending user execution; contracts at `test/manual/*-smoke.md`)
- [ ] **Phase 3: Editor** - `/editor` form writes validated, secret-scanned routine bundles to disk with autosave and collision protection
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
**Plans**: 8 plans

Plans:
- [x] 03-01-PLAN.md -- deps install + vitest jsdom config + RoutineBundleInput zod schema + 12-block accept/reject matrix (EDIT-02, EDIT-04) — **completed 2026-04-19** (commits 104547f + 8286db4; suite 137 → 161 green)
- [x] 03-02-PLAN.md -- secret-patterns.ts + scanForSecrets pure utility + 18-block pattern test matrix (EDIT-02) — **completed 2026-04-19** (commits 64fb6ec + 891e2f3; suite 161 → 179 green)
- [x] 03-03-PLAN.md -- bundles.ts read-side directory enumeration (listBundles/hasBundle/hasBundleAnyRuntime/readBundle) + 18 tests (EDIT-04) — **completed 2026-04-19** (commit 509adb0; suite 179 → 197 green)
- [ ] 03-04-PLAN.md -- atomic-write.ts directory-swap helper + 7-scenario test matrix (EDIT-02)
- [ ] 03-05-PLAN.md -- saveRoutine + checkSlugAvailability Server Actions + 12-block E2E tests (EDIT-02, EDIT-04)
- [ ] 03-06-PLAN.md -- /editor page.tsx shell + 5 presentational subcomponents + 3 jsdom .test.tsx files (EDIT-01)
- [ ] 03-07-PLAN.md -- EditorClient state machine + autosave + autofill opt-out + secret-scan preview + integration tests (EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05)
- [ ] 03-08-PLAN.md -- phase exit gate: frozen-surface diff + test suite green + 03-VALIDATION flip + ROADMAP/STATE update

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
**Plans**: TBD
**UI hint**: yes

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
| 3. Editor | 3/8 | In Progress (Wave 0 COMPLETE + 03-03 landed; Wave 1 half done) | - |
| 4. Deploy | 0/TBD | Not started | - |
| 5. Queue | 0/TBD | Not started | - |
| 6. Polish | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-18*
*Last updated: 2026-04-19 after Phase 3 Plan 03 execution (bundles.ts read-side directory enumeration landed — commit 509adb0; 18 new test blocks; dashboard suite 179 → 197 green; typecheck exit 0; Plan 03-05 saveRoutine + checkSlugAvailability Server Action now unblocked since hasBundle + hasBundleAnyRuntime are live; Phase 3 progress 3/8 plans complete — Wave 0 sealed + 03-03 landed; v0.1 frozen surface diff 0 lines)*
