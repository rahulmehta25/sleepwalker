---
phase: 02-adapters
plan: 05
subsystem: runtime-adapter
tags: [adapter, claude-routines, fire-routine, beta-header, browser-handoff, login-shell-path, pitfall-1, pitfall-12, vitest, phase-2, wave-2]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "RuntimeAdapter + DeployResult + RunNowResult + HealthStatus + RoutineBundle type shapes; ADAPTERS registry stub for claude-routines slot"
  - phase: 02-adapters
    provides: "slug.ts assertValidSlug guard (02-01) — adapters inherit path-traversal / shell-metacharacter rejection by construction when they call builders"
provides:
  - "claudeRoutinesAdapter (first live adapter — pattern template for other three)"
  - "CC_ROUTINE_BETA constant as single-source-of-truth cross-check with fire-routine.ts BETA_HEADER (Pitfall 12 mitigation)"
  - "Login-shell PATH probe pattern (/bin/zsh -l -c claude --version) — Pitfall 1 mitigation reusable by claude-desktop / codex / gemini adapters in plans 02-06..08"
  - "Browser-handoff deploy pattern with encodeURIComponent on every query param (Threat T-02-05-01 / ASVS V14 output encoding) — reusable by claude-desktop in plan 02-06"
  - "fireRoutine delegation pattern: adapter.runNow wraps v0.1 helper rather than duplicates request logic — keeps bearer-token flow untouched and beta-header single-source"
affects: [02-09 registry swap, 02-10 phase exit gate, 03-editor preview rendering of handoffUrl, Phase 5 queue-aggregator runNow callers]

# Tech tracking
tech-stack:
  added: []
  patterns: [browser-handoff-deploy, login-shell-path-probe, v0.1-helper-delegation, beta-header-re-export-ssot]

key-files:
  created:
    - dashboard/lib/runtime-adapters/claude-routines.ts
    - dashboard/tests/claude-routines.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "Task 3 shipped as two commits (feat(02-05) for source+test, docs(02-05) for activity log) instead of one amended commit — a parallel Phase 3 planning agent committed in the race window between my initial commit and amend, so the atomic 3-file shape was not achievable without rewriting a concurrent agent's commit. Both commits are scoped exclusively to Plan 05 files; no Phase 3 contamination."
  - "encodeURIComponent on every handoffUrl query param (name, prompt, cadence) — cadence defaults to empty string when bundle.schedule is null so the URL shape stays stable."
  - "healthCheck reason string hardcoded as 'claude CLI not found on login-shell PATH; see docs/AUTHORING.md' — tests assert .toContain('claude CLI not found') to give future reword room without breaking the suite."

patterns-established:
  - "Browser-handoff deploy: deploy returns {ok: true, handoffUrl: <URL with encoded params>, artifact: 'browser-handoff:<slug>'}; undeploy returns list-page URL with artifact: 'browser-handoff-undeploy'. Template for claude-desktop (plan 02-06)."
  - "Login-shell PATH probe: promisify(execFile)('/bin/zsh', ['-l', '-c', '<cli> --version']) — never throws, returns {available, version} on success or {available: false, reason} on failure. Template for codex / gemini healthCheck in plans 02-07 / 02-08."
  - "v0.1 helper delegation for runNow: adapter imports fireRoutine, maps {sessionId, sessionUrl} → {runId, watchUrl}, passes res.error through with 'HTTP <status>' fallback. Zero duplication of bearer-token flow, beta-header stays single-source."
  - "Mock isolation in adapter tests: vi.doMock('node:child_process', ...) inside each it() block + vi.resetModules in beforeEach + vi.doUnmock in afterEach for clean separation between healthCheck scenarios. globalThis.fetch + setCloudCredential pattern copied verbatim from fire-routine.test.ts."

requirements-completed: [ADPT-05]

# Metrics
duration: 4m
completed: 2026-04-19
---

# Phase 2 Plan 05: claude-routines Adapter Summary

**First live RuntimeAdapter — Claude Cloud Routines with browser-handoff deploy, v0.1 fireRoutine delegation for runNow, login-shell claude --version probe, and Pitfall-12 beta-header re-export; 7 Vitest blocks green, dashboard suite 72 → 79 tests.**

## Performance

- **Duration:** 4m 12s
- **Started:** 2026-04-19T06:09:19Z
- **Completed:** 2026-04-19T06:13:31Z
- **Tasks:** 3
- **Files created:** 2 (source + test)
- **Files modified:** 1 (activity log)

## Accomplishments

- Shipped `dashboard/lib/runtime-adapters/claude-routines.ts` (105 lines): `claudeRoutinesAdapter: RuntimeAdapter` with all 5 methods + `CC_ROUTINE_BETA` re-export. First of four Wave 2 adapters.
- Shipped `dashboard/tests/claude-routines.test.ts` (183 lines, 7 `it()` blocks): deploy URL-encoding, undeploy list-URL, runNow happy + no-cred, healthCheck happy + fail, CC_ROUTINE_BETA equality.
- Dashboard Vitest suite grew from 72 → 79 passing tests (+7), 12 → 12 test files. `pnpm typecheck` exit 0. Zero real `claude` invocations, zero real network I/O.
- Unlocked ADPT-05. Pattern templates in place for claude-desktop (plan 02-06), codex (plan 02-07), gemini (plan 02-08): browser-handoff deploy shape, login-shell PATH probe, v0.1 delegation where applicable.

## Task Commits

1. **Task 1 — Author claude-routines.ts (5 methods + CC_ROUTINE_BETA)** — included in `62bdaa7` (`feat(02-05): add claude-routines runtime adapter`)
2. **Task 2 — Author claude-routines.test.ts (7 Vitest blocks)** — included in `62bdaa7` (same commit; paired with source for atomic review)
3. **Task 3 — Activity log append** — `d7223a8` (`docs(02-05): append activity log entry for plan 05`) — separated from feat commit due to concurrent-agent commit race (see Deviations below)

**Plan-level commits:**
- `62bdaa7` — `feat(02-05): add claude-routines runtime adapter` (2 files, +288 lines)
- `d7223a8` — `docs(02-05): append activity log entry for plan 05` (1 file, +13 lines)

## Files Created/Modified

- `dashboard/lib/runtime-adapters/claude-routines.ts` — (CREATED, 105 lines) `claudeRoutinesAdapter: RuntimeAdapter` implementing deploy / undeploy / runNow / listRuns / healthCheck + `CC_ROUTINE_BETA` re-export. Imports `fireRoutine` from `../fire-routine`; uses `promisify(execFile)` for login-shell PATH probe.
- `dashboard/tests/claude-routines.test.ts` — (CREATED, 183 lines) 4 describe blocks × 7 it() blocks with `vi.doMock('node:child_process')` for healthCheck scenarios and `globalThis.fetch` + `setCloudCredential` from v0.1 helpers for runNow. `makeTempHome` isolation on runNow describe block.
- `docs/activity_log.md` — (MODIFIED, +13 lines) Plan 05 entry under 2026-04-19 02:10 EST heading, cross-references commit `62bdaa7`.

## All 5 RuntimeAdapter Methods Implemented

| Method | Shape | Key Behavior |
|---|---|---|
| `deploy(bundle)` | async | Returns `{ok: true, handoffUrl: https://claude.ai/code/routines/new?name=...&prompt=...&cadence=..., artifact: 'browser-handoff:<slug>'}`. Params URL-encoded (Threat T-02-05-01). |
| `undeploy(bundle)` | async | Returns `{ok: true, handoffUrl: 'https://claude.ai/code/routines', artifact: 'browser-handoff-undeploy'}`. |
| `runNow(bundle, context?)` | async | Delegates to `fireRoutine(bundle.slug, context)`; maps `{sessionId, sessionUrl}` → `{runId, watchUrl}`; passes `res.error` through with `HTTP <status>` fallback. |
| `listRuns(bundle, limit?)` | async | Returns `[]` (Phase 5 wires queue-aggregator — comment documents this). |
| `healthCheck()` | async | `execFile('/bin/zsh', ['-l', '-c', 'claude --version'])`; returns `{available: true, version}` on success or `{available: false, reason: '...claude CLI not found...'}` on failure. Never throws. |

## CC_ROUTINE_BETA Single-Source-of-Truth Assertion

- `claude-routines.ts` line 35: `export const CC_ROUTINE_BETA = "experimental-cc-routine-2026-04-01";`
- `fire-routine.ts` line 3: `const BETA_HEADER = "experimental-cc-routine-2026-04-01";`
- Test block 7 asserts `CC_ROUTINE_BETA === "experimental-cc-routine-2026-04-01"` — fire-routine.test.ts line 87 independently asserts header value. A future Anthropic deprecation that bumps one constant but not the other trips at least one test.

## Decisions Made

- **Source + test in one commit** — `62bdaa7` contains both `claude-routines.ts` and `claude-routines.test.ts` (plan tasks 1 & 2). Kept atomic because neither alone passes the acceptance criteria (source needs test to validate, test needs source to import).
- **Two-commit plan shape** — feat + docs instead of single amended commit. Forced by concurrent Phase 3 planning agent — see Deviations.
- **encodeURIComponent on every query param** — name, prompt, and cadence all run through it. Cadence defaults to empty string (`bundle.schedule ?? ""`) when null, keeping URL structure stable.
- **healthCheck reason wording** — "claude CLI not found on login-shell PATH; see docs/AUTHORING.md" — tests use `.toContain("claude CLI not found")` so wording can evolve without breaking tests.
- **No auth-conflict warning field yet** — plan 02-05 scope is the simplest adapter (claude-routines has no local CLI auth conflict — only Anthropic console handles routine scheduling). Auth-conflict logic for codex / gemini adapters lives in plans 02-07 / 02-08 per 02-CONTEXT.md decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two-commit shape instead of single amended commit**

- **Found during:** Task 3 (commit + amend activity log)
- **Issue:** Plan Task 3 AC requires a single `feat(02-05):` commit containing 3 files (source + test + activity log) via `git commit --amend --no-edit`. Between my initial commit `62bdaa7` and my `git commit --amend`, a parallel Phase 3 planning agent committed `7e4fbed` (`refactor(03): split 03-06, renumber plans...`) onto HEAD. My amend therefore attached the activity log to the Phase 3 agent's commit (producing `8774db4`), not mine.
- **Fix:** Reset HEAD via `git reset --mixed 7e4fbed` to restore the Phase 3 agent's original commit as HEAD with the activity_log.md delta preserved in the working tree. Then committed activity log as `d7223a8` (`docs(02-05)`). Net result: my `62bdaa7` feat commit stands unmodified with exactly 2 files; `7e4fbed` stands unmodified with the Phase 3 agent's 5 files; my `d7223a8` docs commit holds the activity log entry cross-referencing `62bdaa7`.
- **Files modified:** None beyond plan scope (activity log was always planned to ship; just in a different commit).
- **Verification:** `git show 62bdaa7 --stat` shows exactly 2 files (source + test, +288 lines). `git show d7223a8 --stat` shows exactly 1 file (activity log, +13 lines). `git show 7e4fbed --stat` unchanged (5 Phase 3 files, Phase 3 agent's work preserved).
- **Committed in:** `d7223a8` (new follow-up commit).

**Scope discipline:** Both my commits use explicit `git add <path>` with individual file paths. Zero Phase 3 files in either of my commits. `git log -1 --pretty=%B 62bdaa7 | grep -cE 'Co-Authored-By|Generated with'` returns 0; same for `d7223a8`.

---

**Total deviations:** 1 auto-fix (Rule 3 blocking — concurrent-agent commit race).
**Impact on plan:** Acceptance criteria reworded from "single commit with 3 files" to "feat(02-05) + docs(02-05) paired commits, both scoped to Plan 05 files only". All substantive criteria still met: source file with 5 async methods, CC_ROUTINE_BETA export, fireRoutine delegation, /bin/zsh login-shell, 0 throws, 7 green tests, typecheck green, activity log updated.

## Issues Encountered

- **Concurrent git agent race** — Phase 3 planning agent committed between my feat and amend. Documented + resolved above. Main-branch sequential execution with a concurrent planner is the root cause; recognized as risk in the executor prompt's "concurrent agent warning" section.

## Threat-Model Mitigation Status

All four threats in plan `<threat_model>` are addressed in code:

| Threat ID | Status | Evidence |
|---|---|---|
| T-02-05-01 (Tampering — handoffUrl) | mitigated | `handoffUrlForBundle` uses `encodeURIComponent(bundle.name)`, `encodeURIComponent(bundle.prompt)`, `encodeURIComponent(bundle.schedule ?? "")`. Test 1 asserts encoded forms of "Morning Brief" / "Do a daily brief." / "0 6 * * *". |
| T-02-05-02 (Information Disclosure — bearer token) | mitigated | `runNow` delegates to `fireRoutine`; token flow is v0.1 code, unchanged. Token never enters `claude-routines.ts` scope. |
| T-02-05-03 (Spoofing — beta-header drift) | mitigated | `CC_ROUTINE_BETA` re-exported as string literal; Test 7 asserts equality with hardcoded value. Independent assertion in `fire-routine.test.ts` line 87. |
| T-02-05-04 (Repudiation — runNow swallows error) | mitigated | `return { ok: false, error: res.error ?? HTTP ${res.status} };` — preserves upstream error verbatim, falls back to HTTP code. Test 4 asserts `error === "no-credentials-configured"` (verbatim pass-through). |

## VALIDATION.md Row Status

Rows 2-04-01, 2-04-02, 2-04-03 flip from pending to green with this plan:
- 2-04-01: deploy returns browser-handoff — covered by test 1
- 2-04-02: runNow wraps fireRoutine — covered by tests 3 & 4
- 2-04-03: healthCheck login-shell probe — covered by tests 5 & 6

## Next Plan Readiness

- Plan 02-06 (claude-desktop adapter) can now copy the browser-handoff deploy shape and login-shell PATH probe from this plan.
- Plans 02-07 (codex) and 02-08 (gemini) can copy the login-shell PATH probe + `execFile` mocking test pattern.
- Plan 02-09 (registry swap) still blocks on all four Wave 2 adapters; one of four now green.

## Self-Check: PASSED

- FOUND: `dashboard/lib/runtime-adapters/claude-routines.ts` (verified via `ls`)
- FOUND: `dashboard/tests/claude-routines.test.ts` (verified via `ls`)
- FOUND: commit `62bdaa7` (feat(02-05)) in `git log --oneline`
- FOUND: commit `d7223a8` (docs(02-05)) in `git log --oneline`
- FOUND: activity log entry at `docs/activity_log.md` line 138 under `## 2026-04-19 02:10 EST`
- VERIFIED: `pnpm typecheck` exit 0
- VERIFIED: `pnpm test --run` — 79/79 pass (was 72, +7 new)
- VERIFIED: `grep -c "^export const claudeRoutinesAdapter" dashboard/lib/runtime-adapters/claude-routines.ts` = 1
- VERIFIED: `grep -c "^export const CC_ROUTINE_BETA" dashboard/lib/runtime-adapters/claude-routines.ts` = 1
- VERIFIED: `grep -cE "async (deploy|undeploy|runNow|listRuns|healthCheck)"` = 5
- VERIFIED: `grep -c "throw"` = 0
- VERIFIED: no `Co-Authored-By` / `Generated with` in any of my commits

---
*Phase: 02-adapters*
*Plan: 05 (Wave 2 — first of four parallel adapters)*
*Completed: 2026-04-19*
