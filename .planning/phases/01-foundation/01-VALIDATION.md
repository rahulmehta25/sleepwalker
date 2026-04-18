---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `01-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (existing — no install) |
| **Config file** | `dashboard/vitest.config.ts` (existing — no changes) |
| **Quick run command** | `cd dashboard && pnpm typecheck && pnpm test -- slug.test.ts` |
| **Full suite command** | `cd dashboard && pnpm typecheck && pnpm test` |
| **Estimated runtime** | ~10 seconds quick, ~30 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm typecheck && pnpm test -- slug.test.ts`
- **After every plan wave:** Run `cd dashboard && pnpm typecheck && pnpm test` (full 44-test suite)
- **Before `/gsd-verify-work`:** Full suite must be green + frozen-surface `git diff` returns zero
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | ADPT-01 | — | `RuntimeAdapter` interface compiles; stub satisfies it | typecheck | `cd dashboard && pnpm typecheck` | ❌ W0 — `types.ts` | ⬜ pending |
| 1-01-02 | 01 | 1 | ADPT-01 | — | `ADAPTERS: Record<Runtime, RuntimeAdapter>` compile-time exhaustive for all 4 runtimes | typecheck | `cd dashboard && pnpm typecheck` | ❌ W0 — `index.ts` | ⬜ pending |
| 1-02-01 | 02 | 1 | ADPT-02 | V12 file resources | `routines-codex/`, `routines-gemini/`, `templates/` exist with `.gitkeep` | smoke | `test -d routines-codex && test -d routines-gemini && test -d templates && ls routines-codex/.gitkeep routines-gemini/.gitkeep templates/.gitkeep` | ❌ W0 — directories | ⬜ pending |
| 1-03-01 | 03 | 1 | ADPT-02 | V5 input validation | `validateSlug()` accepts valid, rejects invalid (leading digit, uppercase, path-traversal, overflow) | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ W0 — `slug.ts`, `slug.test.ts` | ⬜ pending |
| 1-03-02 | 03 | 1 | ADPT-02 | — | Identifier builders produce exact strings per CLAUDE.md for all 4 runtimes | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ W0 — same file | ⬜ pending |
| 1-03-03 | 03 | 1 | ADPT-02 | — | `parseFleetKey("codex/morning-brief")` round-trips; rejects bad runtime and bad slug | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ W0 — same file | ⬜ pending |
| 1-04-01 | 04 | 1 | ADPT-01 + ADPT-02 | — | All 43 v0.1 tests still pass | regression | `cd dashboard && pnpm test` | ✅ v0.1 tests exist | ⬜ pending |
| 1-04-02 | 04 | 1 | COMP-01 + COMP-02 (adjacent) | — | v0.1 frozen-surface files are byte-identical to pre-Phase-1 SHA | smoke | See "Frozen-surface gate" below | ✅ git available | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Frozen-surface gate command (Task 1-04-02):**

```bash
# Dynamically pin the pre-Phase-1 SHA (parent of the commit that first created types.ts).
# This works correctly in yolo mode where Phase 1 commits land directly on main —
# `git diff main --` would vacuously pass because working-tree == HEAD after commit.
PHASE1_BASE=$(git log --reverse --format=%H --diff-filter=A -- dashboard/lib/runtime-adapters/types.ts | head -1)~1
git diff "$PHASE1_BASE" HEAD -- \
  install.sh \
  hooks/ \
  routines-local/ routines-cloud/ \
  bin/sleepwalker-execute \
  dashboard/lib/queue.ts dashboard/lib/routines.ts dashboard/lib/cloud.ts \
  dashboard/lib/cloud-cache.ts dashboard/lib/queue-aggregator.ts \
  dashboard/lib/settings.ts dashboard/lib/approval.ts dashboard/lib/audit.ts \
  dashboard/lib/github.ts dashboard/lib/fire-routine.ts \
  dashboard/app/ \
  dashboard/package.json dashboard/tsconfig.json dashboard/vitest.config.ts \
  | wc -l
# Expected: 0
```

---

## Wave 0 Requirements

- [ ] `dashboard/lib/runtime-adapters/types.ts` — exports `Runtime`, `RoutineBundle`, `DeployResult`, `RunNowResult`, `RunRecord`, `HealthStatus`, `RuntimeAdapter` (covers ADPT-01)
- [ ] `dashboard/lib/runtime-adapters/slug.ts` — exports `validateSlug`, `parseFleetKey`, `toFleetKey`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath`, `toBundleDir` (covers ADPT-02)
- [ ] `dashboard/lib/runtime-adapters/index.ts` — exports `ADAPTERS: Record<Runtime, RuntimeAdapter>` registry skeleton with 4 stub adapters + `getAdapter()` + `healthCheckAll()` (covers ADPT-01 typecheck exhaustiveness)
- [ ] `dashboard/tests/slug.test.ts` — 8 `it()` blocks, ~25 assertions (covers ADPT-02 unit behaviour)
- [ ] `routines-codex/.gitkeep` — empty sibling directory (ADPT-02 convention artifact)
- [ ] `routines-gemini/.gitkeep` — empty sibling directory (ADPT-02 convention artifact)
- [ ] `templates/.gitkeep` — placeholder for Phase 6

**No framework install needed.** Vitest and TypeScript are already wired in v0.1. No changes to `vitest.config.ts`, `tsconfig.json`, or `package.json`.

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification via typecheck, unit tests, smoke shell commands, and `git diff`.*

---

## Anti-Requirements (Frozen-Surface Guards)

Phase 1 MUST NOT touch any of the following (see RESEARCH.md §Anti-Requirements for full list):

| Asset | Reason |
|------|--------|
| `install.sh` | v0.1 public surface — signature + idempotency frozen |
| `hooks/*.sh` + `hooks/tests/*.sh` | Three hooks + test harness frozen; any change risks v0.1 regression |
| `routines-local/sleepwalker-*/` (all 6) | 14 v0.1 routine paths preserved byte-for-byte |
| `routines-cloud/<id>/` (all 9) | Same — including `_test-zen` |
| `bin/sleepwalker-execute` | v0.1 re-execution loop frozen |
| `dashboard/lib/queue.ts` | `QueueSource` widening deferred to Phase 5 |
| `dashboard/lib/{routines,cloud,cloud-cache,queue-aggregator,settings,approval,audit,github,fire-routine}.ts` | v0.1 reader/writer contracts frozen |
| `dashboard/app/**` | No routes or pages added in Phase 1 |
| `dashboard/package.json` | No new dependencies in Phase 1 (all v0.2 libs enter in Phase 2+) |
| `dashboard/tsconfig.json` + `vitest.config.ts` | Config frozen for Phase 1 |

Phase 1 ships additive code in `dashboard/lib/runtime-adapters/`, `dashboard/tests/slug.test.ts`, and three sibling `routines-*/` + `templates/` directories. Nothing else.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Phase 1 has zero such gaps)
- [ ] Wave 0 covers all MISSING references (`types.ts`, `slug.ts`, `index.ts`, `slug.test.ts`, 3× `.gitkeep`)
- [ ] No watch-mode flags in any task command
- [ ] Feedback latency < 30s (quick: ~10s, full: ~30s)
- [ ] `nyquist_compliant: true` set in frontmatter once planner delivers PLAN.md files matching this contract
- [ ] Frozen-surface gate returns zero lines of diff after phase merge

**Approval:** pending — awaiting plans from gsd-planner.
