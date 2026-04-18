---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [typescript, adapter-pattern, runtime-registry, isolated-modules, discriminated-union]

# Dependency graph
requires:
  - phase: none
    provides: first plan of v0.2 foundation; no prior phase dependencies
provides:
  - frozen RuntimeAdapter interface contract
  - Runtime string-literal union (4 values, ordered)
  - Reversibility type (declared in runtime-adapters, not queue.ts)
  - RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus types
  - ADAPTERS registry (Record<Runtime, RuntimeAdapter>) with compile-time exhaustiveness
  - getAdapter(runtime) dispatcher
  - healthCheckAll() fan-out helper
  - type-only re-export barrel via index.ts
affects: [01-02-PLAN (slug.ts imports Runtime from ./types), 01-03-PLAN, phase-02-adapters, phase-03-editor, phase-05-queue]

# Tech tracking
tech-stack:
  added: []  # zero dependencies — plan is types + stubs only
  patterns:
    - "Adapter pattern with discriminated-union registry keyed by Runtime literal"
    - "Record<Runtime, RuntimeAdapter> forces compile-time exhaustiveness across runtimes"
    - "Result-object error returns (never throw for adapter-level failures)"
    - "Type-only re-exports via `export type { ... } from './types'` (isolatedModules-safe)"
    - "Internal adapters import from ./types; external consumers may import from ./index — avoids circular import through the registry barrel"

key-files:
  created:
    - dashboard/lib/runtime-adapters/types.ts
    - dashboard/lib/runtime-adapters/index.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "Runtime is a string-literal union, not a TypeScript enum — matches CLAUDE.md conventions and research's explicit rejection of enum (RESEARCH.md §Anti-Patterns line 429)."
  - "Reversibility is declared in types.ts rather than imported from dashboard/lib/queue.ts because the v0.2 dep graph points queue.ts -> runtime-adapters in Phase 5, not the reverse."
  - "ADAPTERS is a Record<Runtime, RuntimeAdapter> literal (not a Map) so TypeScript enforces exhaustiveness at compile time — adding a fifth runtime to the union without updating the registry will fail typecheck."
  - "All four stub adapters live inline via notImplemented() factory in index.ts; Phase 2 replaces them with real imports from ./claude-routines.ts, ./codex.ts, etc., without changing the registry shape."
  - "Re-exports at the bottom of index.ts use `export type { ... }` (not `export { ... }`) because tsconfig.json has `isolatedModules: true`."

patterns-established:
  - "Frozen contract: types.ts comments explicitly state that any amendment forces every Phase 2 adapter and Phase 3/5 consumer to re-compile. Phase 2 plans must justify any amendment."
  - "Discriminant-first interface: RoutineBundle.runtime is required (not optional) so getAdapter(bundle.runtime) is always type-safe."
  - "Result-object I/O: adapter methods return { ok: false, error: '...' } for expected failures; throws are reserved for programmer bugs."

requirements-completed: [ADPT-01]

# Metrics
duration: ~2min
completed: 2026-04-18
---

# Phase 1 Plan 01: Foundation — RuntimeAdapter Interface Freeze Summary

**Frozen RuntimeAdapter TypeScript contract (8 exported types) + compilable registry skeleton (Record<Runtime, RuntimeAdapter> with 4 stub adapters) unblocking Phase 2 adapters, Phase 3 editor, and Phase 5 queue widening.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-18T16:58:00Z
- **Completed:** 2026-04-18T17:00:07Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 appended)

## Accomplishments

- Froze the 8 public types of the adapter layer (`Runtime`, `Reversibility`, `RoutineBundle`, `DeployResult`, `RunNowResult`, `RunRecord`, `HealthStatus`, `RuntimeAdapter`) in `dashboard/lib/runtime-adapters/types.ts`.
- Shipped a compilable `ADAPTERS: Record<Runtime, RuntimeAdapter>` registry with four `notImplemented()` stubs keyed exhaustively for `claude-routines`, `claude-desktop`, `codex`, and `gemini`.
- Exported `getAdapter(runtime)` dispatcher and `healthCheckAll()` fan-out helper in `dashboard/lib/runtime-adapters/index.ts`.
- Added type-only re-export barrel at end of `index.ts` so external consumers can `import { Runtime, RoutineBundle } from "@/lib/runtime-adapters"` without bypassing the `isolatedModules: true` guard.
- Appended Plan 01 entry to `docs/activity_log.md` per global CLAUDE.md Activity Log protocol.
- Confirmed `pnpm typecheck` exits 0 and all 43 v0.1 tests pass with zero regression.
- Frozen-surface `git status --porcelain` check across 15+ v0.1 files returned 0 lines — confirming Plan 01 is strictly additive.

## Task Commits

Per the execution-context directive, Tasks 1-3 were delivered in a single atomic commit (the plan's three tasks ship together as the Phase 1 Plan 01 freeze unit):

1. **Task 1: Create types.ts (RuntimeAdapter interface freeze — ADPT-01)** — `c146acf` (feat)
2. **Task 2: Create index.ts (registry skeleton with 4 stub adapters — ADPT-01)** — `c146acf` (feat)
3. **Task 3: Append activity log entry** — `c146acf` (feat, bundled with typescript changes)

**Plan metadata commit:** pending (will include this SUMMARY.md + STATE.md + ROADMAP.md updates).

## Files Created/Modified

- `dashboard/lib/runtime-adapters/types.ts` — frozen type contract (8 exports, ~110 lines with JSDoc). File-level comment warns any amendment requires open negotiation.
- `dashboard/lib/runtime-adapters/index.ts` — runtime registry: inline `notImplemented()` factory, `ADAPTERS` Record literal, `getAdapter()`, `healthCheckAll()`, type-only re-exports (~74 lines).
- `docs/activity_log.md` — appended 2026-04-18 12:59 EST entry for Plan 01 actions.

## Decisions Made

- **Runtime literal order:** Chose `"claude-routines" | "claude-desktop" | "codex" | "gemini"` exactly — matches research and will match the Phase 2 bash supervisor's `$RUNTIME` cases. Changing this order later would thrash bash and docs.
- **Reversibility ownership:** Declared in types.ts with a comment explicitly noting queue.ts cannot depend on runtime-adapters (Pitfall 5 avoidance). In Phase 5, queue.ts widens `QueueSource` and will import `Reversibility` from here, not the other way around.
- **Stubs inline, not file-per-adapter:** The four stubs share identical bodies; extracting four empty files now would invite Phase 2 authors to edit Plan-01 artifacts instead of replacing them. Inline `notImplemented(runtime)` keeps the seam clean for Phase 2's real adapter file drop-in.
- **Single commit for the whole plan:** Execution-context explicitly directed the combined commit message `feat(01-01): freeze RuntimeAdapter interface + registry skeleton`, and tasks 1-3 are mutually dependent (index.ts cannot compile without types.ts; activity-log entry describes both). A single atomic commit preserves bisect-ability because every intermediate state would fail typecheck.

## Deviations from Plan

None — plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** N/A. Plan 01 shipped the smallest compilable contract that unblocks Phase 2, as specified in RESEARCH.md "Key insight: Phase 1 is the most over-engineerable phase in v0.2."

## Issues Encountered

None. Baseline typecheck was green, baseline test count was 43/43, and both remained green after each file creation.

## User Setup Required

None — no external service configuration required. Plan 01 ships only type declarations and stub factories; zero I/O, zero secrets, zero user-facing state changes.

## Self-Check

**Created files exist:**
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/types.ts` — FOUND
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/index.ts` — FOUND
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/01-foundation/01-01-SUMMARY.md` — FOUND (this file)

**Modified files verified:**
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/docs/activity_log.md` — contains `runtime-adapters/types.ts` (1 match), `runtime-adapters/index.ts` (1 match), 3x `## 2026-04-18` headings.

**Commits verified:**
- `c146acf` — FOUND in `git log --oneline HEAD -1`.

**Acceptance-criteria grep checks passed:**
- `export type Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini"` — 1 match in types.ts.
- `export type Reversibility = "green" | "yellow" | "red"` — 1 match in types.ts.
- `export interface RoutineBundle`, `export interface RuntimeAdapter`, `readonly runtime: Runtime`, `deploy(bundle: RoutineBundle): Promise<DeployResult>` — each 1 match in types.ts.
- `enum Runtime` — 0 matches (confirmed union, not enum).
- `from "../queue"` — 0 matches in types.ts (dep-graph rule upheld).
- `export const ADAPTERS: Record<Runtime, RuntimeAdapter>` — 1 match in index.ts.
- All four runtime keys (`"claude-routines":`, `"claude-desktop":`, `"codex":`, `"gemini":`) — 1 match each.
- `export function getAdapter`, `export async function healthCheckAll`, `export type {` — each 1 match.
- `class RuntimeManager` — 0 matches (singleton anti-pattern not introduced).

**Regression gates:**
- `cd dashboard && pnpm typecheck` — exits 0.
- `cd dashboard && pnpm test` — 43 passed (0 failures, 0 skipped).
- Frozen-surface `git status --porcelain` for all 15+ v0.1 files — 0 lines of diff.

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 02 (`.gitkeep` scaffolding for `routines-codex/`, `routines-gemini/`, `templates/`)** — ready; Plan 01 is zero-risk additive and does not touch directories Plan 02 creates.
- **Plan 03 (`slug.ts` + `slug.test.ts`)** — ready; `slug.ts` imports `Runtime` from `./types`, and `./types.ts` exists, compiles, and is now frozen. No blockers.
- **Plan 04 (frozen-surface gate)** — ready; the gate command already returns 0 lines, so Plan 04's verification will pass as long as Plans 02-03 also stay additive.
- **Phase 2 adapter authors** — ready; they can `implements RuntimeAdapter` against the frozen shape and drop-in replace `notImplemented("<runtime>")` in `ADAPTERS` without touching the rest of the registry.

**Hand-off note to Plan 02:** No interaction. Plan 02 scaffolds directories only; it does not import from `runtime-adapters/`.

**Hand-off note to Plan 03:** `slug.ts` imports `Runtime` from `./types` — types.ts is ready and `Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini"` is locked.

---
*Phase: 01-foundation*
*Completed: 2026-04-18*
