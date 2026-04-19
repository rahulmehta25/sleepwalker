---
phase: 01-foundation
verified: 2026-04-18T17:22:08Z
status: passed
score: 3/3
overrides_applied: 0
re_verification: false
---

# Phase 1: Foundation — Verification Report

**Phase Goal:** Freeze the `RuntimeAdapter` TypeScript interface and cross-runtime naming conventions so all adapter, editor, and deploy work can proceed in parallel without interface churn.
**Verified:** 2026-04-18T17:22:08Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TypeScript consumer can `import { RuntimeAdapter, RoutineBundle, DeployResult, HealthStatus }` from `dashboard/lib/runtime-adapters/types` and it compiles without modification | VERIFIED | `pnpm typecheck` exits 0; all 4 interfaces present in types.ts (lines 26, 46, 76, 92); barrel re-exports in index.ts lines 61-70 include all 4 |
| 2 | Every new identifier resolves to `<runtime>/<slug>` form; Codex `daily-brief` and Gemini `daily-brief` never collide | VERIFIED | fleet key `codex/daily-brief` vs `gemini/daily-brief`; launchd `com.sleepwalker.codex.daily-brief` vs `com.sleepwalker.gemini.daily-brief`; all 5 builders produce distinct outputs by construction |
| 3 | `routines-codex/` and `routines-gemini/` exist as additive siblings; all v0.1 paths remain byte-identical | VERIFIED | Both directories exist with .gitkeep; `git diff 03d063d HEAD -- routines-local/ routines-cloud/ hooks/ install.sh` returns 0 lines |

**Score:** 3/3 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `dashboard/lib/runtime-adapters/types.ts` | Frozen interface contract — 8 exported types | VERIFIED | 110 lines; exports Runtime, Reversibility, RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus, RuntimeAdapter |
| `dashboard/lib/runtime-adapters/index.ts` | Registry skeleton — ADAPTERS + getAdapter + healthCheckAll + barrel re-exports | VERIFIED | 71 lines; Record<Runtime, RuntimeAdapter> with 4 notImplemented() stubs; all 3 functions exported; type-only barrel at lines 61-70 |
| `dashboard/lib/runtime-adapters/slug.ts` | 10 pure-function exports for identifier construction (ADPT-02) | VERIFIED | 92 lines; exports RUNTIMES, validateSlug, isRuntime, toFleetKey, parseFleetKey, toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath, toBundleDir |
| `dashboard/tests/slug.test.ts` | 28 assertions across 4 describe / 13 it blocks | VERIFIED | 83 lines; 4 describe blocks, 13 it() blocks, 28 expect() assertions; 56/56 tests pass |
| `routines-codex/.gitkeep` | Additive sibling directory with protective comment | VERIFIED | 154 bytes; Pitfall-2 comment citing Phase 2 codex.ts as future writer |
| `routines-gemini/.gitkeep` | Additive sibling directory with protective comment | VERIFIED | 155 bytes; Pitfall-2 comment citing Phase 2 gemini.ts as future writer |
| `templates/.gitkeep` | Phase 6 placeholder directory | VERIFIED | 218 bytes; comment enumerates 4 Phase 6 template filenames |

**All 7 artifacts present and substantive.**

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts` | `types.ts` | `import type { RuntimeAdapter, Runtime, ... }` | WIRED | Line 9-17; type-only import (isolatedModules-safe) |
| `slug.ts` | `types.ts` | `import type { Runtime } from "./types"` | WIRED | Line 17; Runtime union consumed by all 7 builder signatures |
| `index.ts` | external consumers | `export type { Runtime, RoutineBundle, RuntimeAdapter, HealthStatus, DeployResult, ... }` | WIRED | Lines 61-70; barrel re-export covers all SC-1 types plus RunNowResult, RunRecord, Reversibility |
| `slug.test.ts` | `slug.ts` | `import { validateSlug, isRuntime, ... } from "@/lib/runtime-adapters/slug"` | WIRED | Line 2-13; all 10 exports imported and exercised; 56/56 tests green |
| `ADAPTERS` registry | all 4 runtimes | `Record<Runtime, RuntimeAdapter>` exhaustive literal | WIRED | TypeScript compile-time exhaustiveness — adding a 5th runtime to the union without a registry entry fails typecheck |

---

## Data-Flow Trace (Level 4)

Not applicable. Phase 1 artifacts are pure type declarations, identifier builders, and stub adapters. No dynamic data rendering.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles all Phase 1 artifacts | `pnpm typecheck` in `dashboard/` | exit 0 | PASS |
| All 56 tests pass (43 v0.1 + 13 new) | `pnpm test` in `dashboard/` | 56/56, 285ms | PASS |
| v0.1 frozen surface unchanged | `git diff 03d063d HEAD -- routines-local/ routines-cloud/ hooks/ install.sh \| wc -l` | 0 | PASS |
| Codex/Gemini `daily-brief` fleet keys do not collide | identifier simulation | `codex/daily-brief` != `gemini/daily-brief` | PASS |
| Codex/Gemini launchd labels do not collide | identifier simulation | distinct com.sleepwalker.{runtime}.daily-brief labels | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| ADPT-01 | `RuntimeAdapter` interface frozen + exported from `types.ts` with deploy/undeploy/runNow/listRuns/healthCheck + typed RoutineBundle, DeployResult, HealthStatus shapes | SATISFIED | 8 types exported; interface has all 5 methods with correct signatures; compiles clean |
| ADPT-02 | Slug namespacing — internal key `<runtime>/<slug>`, launchd label `com.sleepwalker.<runtime>.<slug>`, marker tag `[sleepwalker:<runtime>/<slug>]`, branch prefix `claude/sleepwalker/<runtime>/<slug>/*`, plist path `~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist` | SATISFIED | All 5 naming conventions implemented in slug.ts builders; 28 assertions verify all patterns; routines-codex/ and routines-gemini/ directories exist |

---

## Anti-Patterns Found

No blockers. Two review-raised concerns assessed below; both are acceptable as Phase 1 scope-limited behavior.

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `slug.ts` lines 39-91 | Builders accept `slug: string` without calling `validateSlug()` internally | Info | Builders already accept `Runtime` (typed) for the runtime arg — TypeScript prevents invalid runtimes. The slug arg is intentionally unvalidated inside builders per the authoring/loading separation documented in slug.ts header: `validateSlug()` is for authoring gates only. Phase 3 editor calls it before invoking builders. The risk is: a Phase 2/3 author could pass an unvalidated slug to a builder. This is a Phase 2 code-review concern, not a Phase 1 gap. See Known Debt below. |
| `slug.ts` line 85 | `toBundleDir("claude-desktop", "inbox-triage")` returns `"routines-local/inbox-triage"` but v0.1 actual path is `routines-local/sleepwalker-inbox-triage/` | Info | The builder is for v0.2 NEW routines only. v0.1 routine reading will be handled by Phase 2/3 `bundles.ts` which reads existing directories by path, not by slug reconstruction. The split is by design per the SUMMARY.md "authoring vs loading separation" pattern. See Known Debt below. |

---

## Human Verification Required

None. All success criteria are verifiable programmatically for a types-and-primitives phase.

---

## Known Debt (Not Blocking)

These items were raised in the cross-AI review (01-REVIEWS.md) as HIGH/MEDIUM concerns. They do not block the Phase 1 goal — the goal is "interface and naming conventions frozen so parallel work can proceed." Both items are acceptable as Phase 1 primitives; enforcement and v0.1 reconciliation are Phase 2/3 responsibilities.

### Debt-1: Slug builders do not validate the `slug` argument internally

**Raised by:** Codex (HIGH) and Gemini (HIGH — same root concern)

**Evidence:** `slug.ts` line 29 defines `validateSlug()`. Lines 39-91 (7 builders) accept `slug: string` without calling it. The header comment (lines 12-14) explicitly states this is the intended separation. `path.join("routines-codex", "../x")` returns `"x"` — a path traversal does escape the intended directory if a caller passes an unvalidated slug.

**Why not a blocker for Phase 1:** Phase 1 goal is to provide the *primitives*, not enforce them end-to-end. The enforcement surface is the Phase 3 editor form (which calls `validateSlug()` before invoking any builder) and Phase 2 adapter code review (which must not accept user-supplied strings without validation). The interface is not wrong; the risk is in future callers. This is correctly a Phase 2/3 code-review discipline item.

**Recommendation for Phase 2 plans:** Add `assertValidSlug(slug: string): void` (throws on bad input) to slug.ts and have builders call it. This closes the escape hatch at the primitive level. Alternatively, introduce a branded `Slug` type — callers must go through `validateSlug` to obtain one.

### Debt-2: `toBundleDir("claude-desktop", slug)` produces `routines-local/<slug>` but v0.1 routines use `routines-local/sleepwalker-<slug>`

**Raised by:** Gemini (HIGH — "split-brain directory structure")

**Evidence:** `routines-local/` contains `sleepwalker-inbox-triage/`, `sleepwalker-standup-writer/`, etc. `toBundleDir("claude-desktop", "inbox-triage")` returns `"routines-local/inbox-triage"` — no `sleepwalker-` prefix. The Phase 3 slug test at line 65 asserts exactly this bare-slug behavior and passes.

**Why not a blocker for Phase 1:** ADPT-02 specifies namespacing for NEW identifiers in the v0.2 system. The slug.ts header comments (line 13) say `validateSlug()` is for AUTHORING, not loading. Phase 2's `bundles.ts` will read v0.1 routines by enumerating actual directories (not by reconstructing paths via `toBundleDir`). New v0.2 claude-desktop routines will use `routines-local/<slug>` (bare, no prefix). Legacy v0.1 routines are read-only from Phase 2 onwards; they do not go through `toBundleDir`. The directories coexist without conflict.

**Recommendation for Phase 2 plans:** Document explicitly in `bundles.ts` that v0.1 claude-desktop routines are discovered by `fs.readdir("routines-local/")` with a `sleepwalker-` prefix filter, and v0.2 claude-desktop routines use bare `toBundleDir("claude-desktop", slug)` paths. No path collision possible since v0.2 slugs cannot start with `sleepwalker-` (SLUG_REGEX rejects underscores: `_` fails `[a-z0-9-]`).

---

## Gaps Summary

No gaps. All three success criteria verified. Two known debt items documented above for Phase 2 planning awareness; neither blocks the phase goal or Phase 2 parallel work.

---

_Verified: 2026-04-18T17:22:08Z_
_Verifier: Claude (gsd-verifier)_
