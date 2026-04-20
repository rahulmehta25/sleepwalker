---
phase: 04-deploy
status: sealed
completed: 2026-04-20
plans: 9
requirements: [DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, REPO-01, HLTH-01]
---

# Phase 4 — Deploy (Rollup Summary)

Phase 4 wires Phase 2 adapters and Phase 3 editor bundles into the user-facing /routines surface with a one-click deploy state machine, Run-now, enable/disable, Save-to-repo, and landing-page health badges. Sealed 2026-04-20 after 9/9 plans.

## Automated Exit Gate

| Step | Command | Result |
|------|---------|--------|
| 1. Typecheck | `pnpm run typecheck` | exit 0 |
| 2. Dashboard suite | `pnpm test` | 336/336 passed across 38 files (~10.5s) |
| 3. Supervisor harness | `bash hooks/tests/supervisor-tests.sh` | 28 pass / 0 fail |
| 4. Frozen-surface diff | `git diff --stat PHASE4_BASE HEAD -- <24 paths>` | 0 lines |

PHASE4_BASE resolves to `8707433^` (parent of the first `dashboard/lib/deploy-state.ts` commit). 24 enumerated v0.1 + Phase 2/3 paths all byte-identical.

## Plans (9)

| Plan | Subject | Commits | Tests Delta |
|------|---------|---------|-------------|
| 04-01 | deploy-state.ts atomic I/O + drift math + 11 it() blocks (DEPL-01 + DEPL-03 primitives) | 8707433 + e3526c1 | 272 → 283 (+11) |
| 04-02 | save-to-repo.ts simple-git + proper-lockfile wrapper + 8 it() blocks (REPO-01 lib) | 55740f8 + 7279030 | 283 → 291 (+8) |
| 04-03 | /api/health/all Route Handler with 2s Promise.race + Promise.allSettled (HLTH-01 server) | 22b3740 + de000a6 | 291 → 297 (+6) |
| 04-04 | routines/actions.ts 4 deploy-family Server Actions + 21 it() blocks (DEPL-01..05) | c5a9c75 + d06d22b + 8047e2e + 85cd378 | 297 → 318 (+21) |
| 04-05 | save-to-repo Server Action wrappers + 4 integration blocks (REPO-01 actions) | 1ae5398 + 659ef16 | 318 → 322 (+4) |
| 04-06 | HealthBadgeRow + HealthBadge with 60s cache + 5 jsdom blocks (HLTH-01 client) | e3492ea + df2c279 + d016d98 | 322 → 327 (+5) |
| 04-07 | DeployProgressDrawer + DeployStepPill + StatusPill + RunNowButton + 5 jsdom blocks (DEPL-01..04 UI) | 69836bc + c585448 + b22444c | 327 → 332 (+5) |
| 04-08 | DiffStatPanel + ConfirmDialog + SaveToRepoModal (REPO-01 + DEPL-05 UI) | b09ab93 + feadcd6 | 332 → 332 (0 — zero new test files by plan design) |
| 04-09 | Route integration + RoutineActionBar + HealthBadgeRow landing mount + 4 routines-page blocks + Phase 4 exit gate | 1f1feb6 + 71f920d + docs | 332 → 336 (+4) |

## Requirements Sealed

All 7 Phase 4 requirements moved to Complete (see REQUIREMENTS.md traceability table for commit refs):
- **DEPL-01** — 4-stage state machine + UI polling
- **DEPL-02** — auto-rollback zero-orphan invariant
- **DEPL-03** — Draft / Deployed / Drift status with mtime comparison
- **DEPL-04** — Run-now for all 4 runtimes with per-runtime dispatch
- **DEPL-05** — enable/disable toggle with launchctl bootstrap/bootout + persist
- **REPO-01** — Save-to-repo with diff preview + flock + never-push + never-sweep
- **HLTH-01** — four landing-page health badges (brew doctor pattern)

## Frozen Surface Proof

Phase 4 is strictly additive. Every v0.1 + Phase 2 + Phase 3 invariant path is byte-identical vs PHASE4_BASE:
- install.sh + 4 hooks + 4 hook-tests (9 paths) → Phase 1/2 frozen surface
- 8 runtime-adapter files (types/index/slug/launchd-writer/4 adapters) → Phase 2 frozen surface
- 5 dashboard/lib files (bundles/atomic-write/secret-scan/secret-patterns/bundle-schema) + editor/actions.ts → Phase 3 frozen surface
- bin/sleepwalker-run-cli → Phase 2 supervisor

Phase 4 net-new files (strictly additive): 2 libs (deploy-state.ts, save-to-repo.ts) + 1 Route Handler (app/api/health/all/route.ts) + 11 client components under dashboard/app/_components and dashboard/app/routines/_components + 1 extended Server Actions file (routines/actions.ts now bundles Phase 2's adapters through deploy/runNow/setEnabled + save-to-repo wrappers). Widening of dashboard/lib/routines.ts preserves v0.1 `listRoutines()` + `setEnabled()` byte-compatible; `listRoutinesAsync()` is an additive export used only by the /routines server component.

## Net-New Dependencies (Phase 4)

- `simple-git@3.36.0` (runtime, REPO-01)
- `proper-lockfile@4.1.2` (runtime, REPO-01 — macOS has no flock(1))
- `@types/proper-lockfile@4.1.4` (dev, TS types)

All three landed in Plan 04-01 chore commit `8707433`.

## Manual Verifications (Deferred)

Per 04-VALIDATION.md §Manual-Only, 4 behaviors resolve via live Mac inspection:
1. Real `launchctl bootstrap` wall-clock < 10s on live Mac
2. `simple-git` diff preview matches CLI `git diff --stat`
3. Window-focus refetch fires in real Chrome
4. Two concurrent tabs: second tab shows lock-busy toast

These are tracked but do not block Phase 4 seal — the automated gate confirms the code-level behavior end-to-end via real-git integration tests, mocked launchctl tests, and jsdom focus-event tests.

## Next

User runs `/gsd-plan-phase 5` to plan Phase 5 Queue (QUEU-01..04 + SAFE-01 — Codex/Gemini runs flow into Morning Queue with ANSI-stripped, flock-protected audit).
