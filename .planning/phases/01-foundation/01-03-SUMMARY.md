---
phase: 01-foundation
plan: 03
subsystem: infra
tags: [typescript, slug, runtime-adapters, vitest, adpt-02, identifier-builders]

# Dependency graph
requires:
  - phase: 01-01
    provides: Runtime type alias in dashboard/lib/runtime-adapters/types.ts (imported as type-only)
  - phase: 01-02
    provides: routines-codex/ and routines-gemini/ sibling directories on disk so toBundleDir() paths resolve
provides:
  - dashboard/lib/runtime-adapters/slug.ts — SLUG_REGEX-backed validator + 7 identifier builders + RUNTIMES tuple + parseFleetKey (10 public symbols total)
  - dashboard/tests/slug.test.ts — 13 it() blocks, 28 expect() assertions covering every export across all four runtimes
  - Enforced <runtime>/<slug> naming convention lockable by code reuse (ADPT-02)
affects: [01-04-PLAN, phase-02-adapters, phase-03-editor, phase-05-queue]

# Tech tracking
tech-stack:
  added: []  # zero runtime dependencies — pure stdlib (node:os, node:path)
  patterns:
    - "Single-source-of-truth builders: every Phase 2+ consumer imports these rather than concatenating identifier strings at call sites"
    - "Type-guard / predicate split: isRuntime() narrows string -> Runtime, validateSlug() is a pure boolean predicate"
    - "Result-object error handling: parseFleetKey() returns null for bad input rather than throwing"
    - "Authoring vs loading separation: validateSlug() gates NEW slugs only; legacy v0.1 names (_test-zen) are never re-validated"
    - "Conditional bundle dir for v0.1 preservation: claude-desktop -> routines-local, claude-routines -> routines-cloud, else routines-<runtime>"

key-files:
  created:
    - dashboard/lib/runtime-adapters/slug.ts
    - dashboard/tests/slug.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "Exact regex ^[a-z][a-z0-9-]{0,63}$ per CLAUDE.md Conventions and REQUIREMENTS.md EDIT-04 — single class, bounded size, no underscores, no leading digit, no path traversal."
  - "RUNTIMES tuple exported (not private) so tests can iterate, guaranteeing adding a fifth runtime to the Runtime type without extending RUNTIMES breaks the test."
  - "process.env.HOME || os.homedir() fallback in toPlistPath() — matches Phase 2 supervisor expectations and keeps the path deterministic under test harnesses that rewrite HOME."
  - "Separate commits per task (not bundled): slug.ts ships as feat(01-03), slug.test.ts as test(01-03), activity log as docs. Each commit independently compiles and keeps bisect-ability at the finest meaningful granularity."

patterns-established:
  - "JSDoc header naming bash duplication (bin/sleepwalker-run-cli) so future edits to RUNTIMES trigger grep-visible warnings in adjacent files."
  - "Builders accept Runtime (not string) — TypeScript enforces at compile time that callers have already passed through isRuntime() or come from a typed source."
  - "toPlistPath() uses path.join() rather than string concatenation, tolerating trailing-slash HOME values without breaking."

requirements-completed: [ADPT-02]

# Metrics
duration: ~3min
completed: 2026-04-18
---

# Phase 1 Plan 03: Foundation — Slug Validator + Identifier Builders Summary

**`dashboard/lib/runtime-adapters/slug.ts` locks the `<runtime>/<slug>` namespacing convention into 10 pure-function exports — every Phase 2+ consumer (adapters, editor, audit reader) constructs launchd labels, marker tags, branch prefixes, and plist paths through these builders, making collision between Codex `daily-brief` and Gemini `daily-brief` impossible by construction. Backed by 28 expect() assertions across 13 it() blocks; full dashboard suite grows from 43 to 56 green tests.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-18T17:08:39Z
- **Completed:** 2026-04-18T17:11:22Z (approximate)
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 appended)

## Accomplishments

- Shipped `dashboard/lib/runtime-adapters/slug.ts` (91 lines) exporting `RUNTIMES`, `validateSlug`, `isRuntime`, `toFleetKey`, `parseFleetKey`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath`, `toBundleDir` — 10 public symbols.
- Shipped `dashboard/tests/slug.test.ts` (82 lines) with 4 describe blocks, 13 it() blocks, 28 expect() assertions — covers canonical-accept, bad-reject, 64-char boundary, all four runtimes per builder, v0.1 path preservation (`routines-local/`, `routines-cloud/`) vs new patterns (`routines-codex/`, `routines-gemini/`), round-trip parsing, and null-return for bad runtime / bad slug / missing slash.
- `pnpm typecheck` exits 0 (strict mode, TS 5.7).
- `pnpm test` shows 56/56 tests green (43 v0.1 baseline + 13 new slug tests); zero regressions.
- Frozen-surface `git status --porcelain` gate across v0.1 paths (install.sh, hooks/, routines-local/, routines-cloud/, bin/, 10 dashboard/lib/*.ts files, dashboard/app/, package.json, tsconfig.json, vitest.config.ts) returns 0 lines.
- Appended Plan 03 entry to `docs/activity_log.md` per global CLAUDE.md Activity Log protocol.

## Task Commits

Each task was committed atomically per v0.1 finest-granularity convention:

1. **Task 1: Create slug.ts (validator + 7 builders + RUNTIMES tuple — ADPT-02)** — `313bf62` (feat)
2. **Task 2: Create slug.test.ts (13 it blocks, 28 assertions — ADPT-02 unit coverage)** — `fbe8adc` (test)
3. **Task 3: Append activity log entry for Plan 03** — `8b73e0f` (docs)

**Plan metadata commit:** pending (will include this SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md updates).

## Files Created/Modified

- `dashboard/lib/runtime-adapters/slug.ts` — Single-source-of-truth module for the `<runtime>/<slug>` convention. Imports only `node:os`, `node:path`, and `type { Runtime } from "./types"`. Exports RUNTIMES readonly tuple, SLUG_REGEX-backed validateSlug, isRuntime type guard, plus seven builder functions. File-level JSDoc header names `bin/sleepwalker-run-cli` as a bash duplication site for future edits.
- `dashboard/tests/slug.test.ts` — Vitest unit file importing from `@/lib/runtime-adapters/slug`. Four describe blocks mirror the module structure: validateSlug, isRuntime, identifier builders (composite of 6 it blocks, one per builder), parseFleetKey. No helpers import — slug.ts is pure functions with zero disk touch.
- `docs/activity_log.md` — Appended 2026-04-18 13:10 EST entry per CLAUDE.md Activity Log protocol, naming slug.ts and slug.test.ts as the Plan 03 artifacts.

## Decisions Made

- **Three separate commits instead of one atomic bundle.** Plan 02 bundled its four .gitkeep tasks into a single commit because no intermediate state compiled in isolation. Plan 03 is different: slug.ts compiles independently (Task 1); slug.test.ts requires slug.ts to already be on disk (Task 2 depends on Task 1); activity log is a pure docs append (Task 3). Separate commits preserve bisect-ability at the test-first boundary and let a future `git bisect` pinpoint exactly which commit introduced a test or implementation regression.
- **Lines split for readability in the code (not in tests).** `toBundleDir()` uses a nested ternary over multiple lines. The first slug.test.ts write auto-wrapped several `expect().toBe(...)` calls across two lines, which would have failed the plan's literal grep-based acceptance criteria; reformatted to single-line to match the plan's verifiable contract exactly. Test behavior identical; only whitespace changed.
- **process.env.HOME || os.homedir() in toPlistPath().** The plan specified this exact fallback. Rationale: Phase 2 bash supervisor sets HOME explicitly in every launchd env; honoring process.env first ensures the Node side and bash side resolve identical paths. os.homedir() is the safety net for environments where HOME is somehow unset (rare on macOS but cheap defense).
- **Bundle dir branching expresses v0.1 preservation explicitly.** Rather than a lookup table or Map, `toBundleDir()` uses two equality checks and a template-literal default. The equality checks are literal string comparisons against `"claude-desktop"` and `"claude-routines"` — self-documenting, no indirection, and the linter flags a missing case if Runtime ever gains a fifth value.

## Deviations from Plan

None — plan executed exactly as written.

One cosmetic observation (not a deviation): the plan's prose said "The 44-test suite (43 existing v0.1 + new slug.test.ts)" but Vitest counts `it()` blocks, so the actual total is **56 tests** (43 v0.1 + 13 new slug it() blocks), not 44. The plan's arithmetic treated slug.test.ts as contributing a single test rather than 13 it() blocks. This is a counting discrepancy in the plan text, not an execution deviation — all 56 tests are green and the must_haves.truths "44-test suite is green" is satisfied at the spirit level (every prior test still passes, plus the new tests).

**Total deviations:** 0
**Impact on plan:** None. Every acceptance criterion (typecheck 0, grep counts, test pass, frozen-surface 0 lines) matched the plan's contract on the first successful run.

## Issues Encountered

- **Read-before-edit hook friction:** The PreToolUse hook flagged `slug.test.ts` and `activity_log.md` as "already exists, must Read first" on edits that followed a Write in the same session. No functional impact — the Write had already completed, the Read was redundant, and continuing to the next step verified everything was correct.
- **First draft of slug.test.ts split long assertions across multiple lines for readability.** This broke the plan's literal grep-based acceptance criteria (e.g., `grep -c 'toBe("routines-local/inbox-triage")'`). Rewrote to single-line assertions matching the plan's exact patterns; tests continue to pass unchanged.

## User Setup Required

None — no external service configuration required. Plan 03 ships two pure TypeScript files and one docs line; zero I/O at module-load time (toPlistPath reads process.env.HOME only when called), zero secrets, zero user-facing state changes.

## Self-Check

**Created files exist:**
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/slug.ts` — FOUND (91 lines, 10 exports).
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/slug.test.ts` — FOUND (82 lines, 4 describe / 13 it / 28 expect).
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/01-foundation/01-03-SUMMARY.md` — FOUND (this file).

**Modified files verified:**
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/docs/activity_log.md` — contains `runtime-adapters/slug.ts` (1 match) and `tests/slug.test.ts` (1 match) and a fresh `## 2026-04-18 13:10 EST` heading with User Prompt + Actions Taken subheads.

**Commits verified:**
- `313bf62` — FOUND in `git log --oneline -5` (feat: slug.ts).
- `fbe8adc` — FOUND in `git log --oneline -5` (test: slug.test.ts).
- `8b73e0f` — FOUND in `git log --oneline -5` (docs: activity_log.md).

**Acceptance-criteria grep checks passed:**
- `grep -c 'import type { Runtime } from "./types"' slug.ts` -> 1.
- 10 export lines present in slug.ts (1 const RUNTIMES + 9 function exports).
- `SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/` present verbatim.
- `com.sleepwalker.` + `[sleepwalker:` + `claude/sleepwalker/` + `routines-local` + `routines-cloud` all present in slug.ts.
- `from "@/lib/runtime-adapters/slug"` + 4 describe() blocks present in slug.test.ts.
- `toBe("routines-local/inbox-triage")` / `("routines-cloud/pr-reviewer")` / `("routines-codex/morning-brief")` / `("routines-gemini/daily-brief")` all present (1 each).
- `toBeNull()` appears 4 times (>= 4 required).

**Regression gates:**
- `cd dashboard && pnpm typecheck` — exit 0.
- `cd dashboard && pnpm test` — 10 test files / 56 tests all passed, 0 skipped, 0 failed.
- `git status --porcelain` across all v0.1 frozen paths — 0 lines.
- `git diff --diff-filter=D --name-only HEAD~3 HEAD` — empty (no file deletions).

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 04 (frozen-surface gate)** — ready. v0.1 surface byte-identical; the Plan 04 gate will confirm zero regression.
- **Phase 2 adapter authors** — ready. All four adapters (claude-routines.ts, claude-desktop.ts, codex.ts, gemini.ts) can now `import { toLaunchdLabel, toPlistPath, toBundleDir, toMarkerTag, toBranchPrefix, validateSlug } from "@/lib/runtime-adapters/slug"` and construct identifiers without string concatenation.
- **Phase 2 supervisor author** — ready. `bin/sleepwalker-run-cli` duplicates the RUNTIMES list in bash; slug.ts JSDoc header names this duplication site explicitly so any future edit to the TypeScript tuple is grep-discoverable at the bash layer.
- **Phase 3 editor author** — ready. `validateSlug(input)` is the canonical authoring gate for new routine slugs; the editor can call it directly for live form validation without needing a server round-trip.
- **Phase 5 audit reader author** — ready. `parseFleetKey(entry.fleet)` round-trips the queue JSONL `fleet` field back into `{runtime, slug}` for display, returning null on legacy v0.1 entries where the existing string format doesn't match the new convention (RESEARCH.md §Pitfall 3 — legacy data is never re-validated).

**Hand-off note to Plan 04:** ADPT-02 builders are live and tested; Plan 04 runs the frozen-surface git diff gate to confirm no v0.1 files changed. Inputs unchanged — slug.ts and slug.test.ts are both strictly additive (a new subdirectory file and a new tests/ file respectively).

**Hand-off note to Phase 2 adapters:** Never construct `com.sleepwalker.<runtime>.<slug>` or `[sleepwalker:<runtime>/<slug>]` or `claude/sleepwalker/<runtime>/<slug>/*` manually. Always import the builder from `@/lib/runtime-adapters/slug`. Code review for Phase 2 PRs should grep for literal `com.sleepwalker.` and `[sleepwalker:` in new files — any hit outside slug.ts is a bug per ADPT-02.

---
*Phase: 01-foundation*
*Completed: 2026-04-18*
