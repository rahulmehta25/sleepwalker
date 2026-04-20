---
phase: 4
slug: deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
source: derived from 04-RESEARCH.md §Validation Architecture
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Mirrors `04-RESEARCH.md` §Validation Architecture (lines 931–1007). Planner fills `Task ID` column when authoring plans.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (existing) |
| **Config file** | `dashboard/vitest.config.ts` (node + jsdom environmentMatchGlobs from Phase 3) |
| **Quick run command** | `cd dashboard && pnpm test tests/<file>.test.ts` |
| **Full suite command** | `cd dashboard && pnpm run typecheck && pnpm test` |
| **Test helper** | `dashboard/tests/helpers.ts::makeTempHome()` |
| **Estimated runtime** | ~60s baseline (250 tests) → projected ~90s after Phase 4 adds ~60 blocks |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm test tests/<touched-file>.test.ts` (<5s quick feedback)
- **After every plan wave:** Run `cd dashboard && pnpm run typecheck && pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + `bash hooks/tests/supervisor-tests.sh` (Phase 2 regression check) + frozen-surface diff = 0 lines vs PHASE4_BASE
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Planner fills `Task ID` (`4-NN-MM`) and `Plan` columns when authoring `04-NN-PLAN.md` files. Behaviors below are fixed by research.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-02 | 04-01 | 0 | DEPL-01 | — | Deploy advances state machine `planning → writing → loading → verified` writing state file each transition | unit | `pnpm test tests/deploy-state.test.ts -t "state machine transitions"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| 4-01-02 | 04-01 | 0 | DEPL-01 | — | `getDeployState` Server Action returns parsed state-file object | unit | `pnpm test tests/deploy-state.test.ts -t "readDeployState parses JSON"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| 4-01-02 | 04-01 | 0 | DEPL-01 | — | State file is atomic (crash mid-write leaves no partial JSON) | unit | `pnpm test tests/deploy-state.test.ts -t "atomic write"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| TBD | TBD | 0 | DEPL-01 | — | Polling stops on terminal state | integration (jsdom) | `pnpm test tests/deploy-progress-drawer.test.tsx -t "stops polling"` | ❌ Wave 0 | ⬜ pending |
| 4-04-02 | 04-04 | 1 | DEPL-02 | — | Rollback runs adapter.undeploy + deleteDeployState on ANY step failure | unit | `pnpm test tests/deploy-routine-action.test.ts -t "rollback on writing failure"` | ✓ dashboard/tests/deploy-routine-action.test.ts | ✅ green 2026-04-20 |
| 4-04-02 | 04-04 | 1 | DEPL-02 | — | Rollback captures nested errors in rollbackActions array | unit | `pnpm test tests/deploy-routine-action.test.ts -t "nested error captured"` | ✓ dashboard/tests/deploy-routine-action.test.ts | ✅ green 2026-04-20 |
| 4-04-02 | 04-04 | 1 | DEPL-02 | — | Zero orphaned state files after rollback | integration | `pnpm test tests/deploy-routine-action.test.ts -t "no orphaned state"` | ✓ dashboard/tests/deploy-routine-action.test.ts | ✅ green 2026-04-20 |
| 4-04-02 | 04-04 | 1 | DEPL-02 | — | 10s bootout timeout surfaces as `rolled-back` state with timeout reason | unit | `pnpm test tests/deploy-routine-action.test.ts -t "bootout timeout"` | ✓ dashboard/tests/deploy-routine-action.test.ts | ✅ green 2026-04-20 |
| 4-01-02 | 04-01 | 0 | DEPL-03 | — | `mtime(bundle) > verifiedAt` returns status=drift | unit | `pnpm test tests/deploy-state.test.ts -t "drift detection"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| 4-01-02 | 04-01 | 0 | DEPL-03 | — | `mtime(bundle) < verifiedAt` returns status=deployed | unit | `pnpm test tests/deploy-state.test.ts -t "deployed — no drift"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| TBD | TBD | 0 | DEPL-03 | — | `listRoutines` attaches `status` per bundle | integration | `pnpm test tests/routines-page.test.ts -t "status per bundle"` | ❌ Wave 0 | ⬜ pending |
| 4-01-02 | 04-01 | 0 | DEPL-03 | — | bundleMtime picks max across dir contents (not dir mtime alone) | unit | `pnpm test tests/deploy-state.test.ts -t "bundleMtime across files"` | ✓ dashboard/tests/deploy-state.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-04 | — | claude-routines runNow returns handoffUrl | unit | `pnpm test tests/run-now-action.test.ts -t "claude-routines"` | ✓ dashboard/tests/run-now-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-04 | — | claude-desktop runNow invokes `claude -p` | unit | `pnpm test tests/run-now-action.test.ts -t "claude-desktop"` | ✓ dashboard/tests/run-now-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-04 | — | codex runNow spawns supervisor detached+unref | unit | `pnpm test tests/run-now-action.test.ts -t "codex detached"` | ✓ dashboard/tests/run-now-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-04 | — | gemini runNow same shape as codex | unit | `pnpm test tests/run-now-action.test.ts -t "gemini detached"` | ✓ dashboard/tests/run-now-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-05 | — | setRoutineEnabled(enabled=false) calls launchctl bootout | unit | `pnpm test tests/set-enabled-action.test.ts -t "disable bootout"` | ✓ dashboard/tests/set-enabled-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-05 | — | setRoutineEnabled(enabled=true) calls launchctl bootstrap | unit | `pnpm test tests/set-enabled-action.test.ts -t "enable bootstrap"` | ✓ dashboard/tests/set-enabled-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-05 | — | enabled flag persists in config.json | unit | `pnpm test tests/set-enabled-action.test.ts -t "persist flag"` | ✓ dashboard/tests/set-enabled-action.test.ts | ✅ green 2026-04-20 |
| 4-04-03 | 04-04 | 1 | DEPL-05 | — | Enable on Draft returns error ("Not deployed yet") | unit | `pnpm test tests/set-enabled-action.test.ts -t "enable draft error"` | ✓ dashboard/tests/set-enabled-action.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | `previewSaveToRepo` stages only `routines-<runtime>/<slug>/*` | unit (real tmp git repo) | `pnpm test tests/save-to-repo.test.ts -t "stages only subpath"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | `previewSaveToRepo` returns `git diff --stat`-shaped `DiffSummary` | unit | `pnpm test tests/save-to-repo.test.ts -t "diff shape"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | Second concurrent `previewSaveToRepo` returns `lock-busy` immediately | unit | `pnpm test tests/save-to-repo.test.ts -t "lock-busy"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | `commitSaveToRepo` NEVER calls `git.push` | unit | `pnpm test tests/save-to-repo.test.ts -t "never pushes"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | `releaseSaveLock` runs `git reset` on subpath + releases lock | unit | `pnpm test tests/save-to-repo.test.ts -t "release resets"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | Stale lock (>30s) is reclaimable | unit | `pnpm test tests/save-to-repo.test.ts -t "stale lock reclaim"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-02-02 | 04-02 | 0 | REPO-01 | — | Never-sweep: uncommitted file outside subpath stays unstaged | unit | `pnpm test tests/save-to-repo.test.ts -t "never sweeps"` | ✓ dashboard/tests/save-to-repo.test.ts | ✅ green 2026-04-20 |
| 4-03-02 | 04-03 | 0 | HLTH-01 | — | `/api/health/all` returns `{statuses, checkedAt}` | integration | `pnpm test tests/health-route.test.ts -t "shape"` | ✓ dashboard/tests/health-route.test.ts | ✅ green 2026-04-20 |
| 4-03-02 | 04-03 | 0 | HLTH-01 | — | Timeout per adapter is 2000ms, never hangs response | unit | `pnpm test tests/health-route.test.ts -t "timeout"` | ✓ dashboard/tests/health-route.test.ts | ✅ green 2026-04-20 |
| 4-03-02 | 04-03 | 0 | HLTH-01 | — | Promise.allSettled catches throwing adapter | unit | `pnpm test tests/health-route.test.ts -t "adapter throws"` | ✓ dashboard/tests/health-route.test.ts | ✅ green 2026-04-20 |
| TBD | TBD | 0 | HLTH-01 | — | Client component renders green/amber/grey/loading pills | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "render states"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | HLTH-01 | — | sessionStorage cache hit on second mount within 60s | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "cache hit"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | HLTH-01 | — | Cache expires after 60s | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "cache expiry"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | HLTH-01 | — | Window-focus triggers refetch after TTL | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "focus refetch"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | HLTH-01 | — | Manual refresh icon clears cache | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "manual refresh"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | — | Phase exit | — | Full suite green after Phase 4 merge | smoke | `cd dashboard && pnpm run typecheck && pnpm test` | ✓ existing | ⬜ pending |
| TBD | TBD | — | Phase exit | — | Supervisor harness still green (Phase 2 no regression) | smoke | `bash hooks/tests/supervisor-tests.sh` | ✓ existing | ⬜ pending |
| TBD | TBD | — | Phase exit | — | v0.1 frozen surface untouched (PHASE4_BASE vs HEAD = 0 lines across v0.1 + Phase 2/3 paths) | smoke | `git diff --stat PHASE4_BASE HEAD -- <paths>` | ✓ existing pattern | ⬜ pending |

**Total rows:** 36 (DEPL-01 ×4, DEPL-02 ×4, DEPL-03 ×4, DEPL-04 ×4, DEPL-05 ×4, REPO-01 ×7, HLTH-01 ×8, phase-exit ×3)

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files to create (all ❌ currently):

- [ ] `dashboard/tests/deploy-state.test.ts` — state-machine I/O + drift math (DEPL-01, DEPL-03)
- [ ] `dashboard/tests/deploy-routine-action.test.ts` — deployRoutine Server Action with mocked adapters (DEPL-01, DEPL-02)
- [ ] `dashboard/tests/deploy-progress-drawer.test.tsx` — jsdom drawer component with polling (DEPL-01)
- [ ] `dashboard/tests/run-now-action.test.ts` — per-runtime runNow dispatch (DEPL-04)
- [ ] `dashboard/tests/set-enabled-action.test.ts` — bootstrap/bootout + persist (DEPL-05)
- [ ] `dashboard/tests/save-to-repo.test.ts` — real tmp git repo + simple-git ops + proper-lockfile (REPO-01)
- [ ] `dashboard/tests/health-route.test.ts` — `/api/health/all` Route Handler with mocked adapters (HLTH-01 server)
- [ ] `dashboard/tests/health-badge-row.test.tsx` — jsdom client component (HLTH-01 client)
- [ ] `dashboard/tests/routines-page.test.ts` — server-component listRoutines + drift attach (DEPL-03 integration)

Net-new deps:
- [ ] `simple-git@3.36.0` (runtime — REPO-01)
- [ ] `proper-lockfile@4.1.2` (runtime — REPO-01 flock replacement; macOS has no `flock(1)`)
- [ ] `@types/proper-lockfile` (dev — TS types for proper-lockfile)

**Framework install:** none needed. Vitest + jsdom + @testing-library/react are already in devDependencies from Phase 3 Plan 01.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `launchctl bootstrap` takes < 10s on live Mac | DEPL-01, DEPL-02 | A1 assumption in research — bootout timing can't be verified in mocks | On a Mac with codex installed: deploy a real routine, measure wall-clock from Save click to "verified" state; also measure a forced-failure rollback (Assumption A2) |
| `simple-git` diff preview matches CLI `git diff --stat` | REPO-01 | simple-git's DiffSummary shape is an abstraction — sanity-check against real git output once | Make a small routine edit, click Save-to-repo, screenshot the modal diff and run `git diff --stat <path>` in terminal; confirm lines changed + file count match |
| Window-focus refetch reliably fires in real Chrome | HLTH-01 | jsdom fires `focus` events but real browser behavior can differ with backgrounded tabs | Install a runtime (e.g. `brew install gemini-cli`) while dashboard open; switch tab away and back; confirm badge flips green within 1s (no reload) |
| Two concurrent tabs save-to-repo: second tab shows "lock-busy" toast | REPO-01 | Integration test covers the lib; manual verifies the UI toast surface | Open dashboard in two tabs; click Save-to-repo on different routines simultaneously; second tab must show lock-busy (not silent failure) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (9 test files + 3 deps)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after plans fill Task IDs

**Approval:** pending — set to `approved YYYY-MM-DD` by planner after plans are authored and Task IDs filled in.
