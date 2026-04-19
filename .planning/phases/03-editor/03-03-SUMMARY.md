---
phase: 03-editor
plan: 03
subsystem: editor/bundles
tags: [editor, bundles, fs, read-side, enumeration, EDIT-04]
requires:
  - dashboard/lib/runtime-adapters/types.ts (Runtime, Reversibility — Phase 1 frozen surface)
  - dashboard/lib/runtime-adapters/slug.ts (RUNTIMES tuple — Phase 1/2)
  - gray-matter@4.0.3 (installed in Plan 03-01)
provides:
  - dashboard/lib/bundles.ts :: listBundles / hasBundle / hasBundleAnyRuntime / readBundle
  - dashboard/lib/bundles.ts :: BundleDescriptor / RoutineBundleRead types
affects:
  - Plan 03-05 saveRoutine + checkSlugAvailability Server Action (unblocked — can now import hasBundle + hasBundleAnyRuntime)
  - Phase 4 routine-cards list view (listBundles)
  - Phase 5 queue cross-reference (readBundle)
tech-stack-added: []
tech-stack-patterns:
  - "Directory-enumeration reader (does NOT call toBundleDir / validateSlug on enumerated entries) — preserves v0.1 slug prefixes"
  - "Tolerant parse: gray-matter for SKILL.md (claude-desktop + claude-routines), JSON.parse for config.json (codex + gemini)"
  - "Graceful null on any error (missing dir, missing source file, malformed JSON, gray-matter throw) — never throws"
  - "First-match-wins cross-runtime collision check (RUNTIMES tuple order: claude-routines → claude-desktop → codex → gemini)"
key-files-created:
  - dashboard/lib/bundles.ts (177 lines)
  - dashboard/tests/bundles.test.ts (210 lines)
key-files-modified:
  - .planning/phases/03-editor/03-VALIDATION.md (row 20 flipped: 3-03-01 ✅ green)
key-decisions:
  - "RUNTIME_ROOT map (not toBundleDir) for the read path — preserves v0.1 `sleepwalker-*` and `_test-zen` directory prefixes that would FAIL the SLUG_REGEX guard in toBundleDir"
  - "readBundle treats claude-desktop AND claude-routines as SKILL.md shapes (both are v0.1 SKILL.md-based); only codex + gemini use config.json + prompt.md"
  - "prompt fallback cascade for codex/gemini: prompt.md file → cfg.prompt string → empty string — never throws"
  - "isReversibility type-guard (local helper) narrows unknown YAML/JSON values to Reversibility union before assignment"
  - "Test isolation via fresh mkdtemp cwd (not DASHBOARD_DIR) so enumeration starts from a clean slate — otherwise the real repo's 6 routines-local/ + 9 routines-cloud/ dirs would bleed into every test"
metrics:
  duration-minutes: 5
  completed: 2026-04-19
  tasks: 1
  commits: 1
  test-count-delta: +18 (179 → 197)
  line-count: 387 insertions (177 src + 210 tests)
---

# Phase 3 Plan 03-03: bundles.ts Read-Side Enumeration Summary

**One-liner:** Read-side directory enumeration across all 4 runtime roots (`routines-cloud` / `routines-local` / `routines-codex` / `routines-gemini`) with tolerant gray-matter + JSON parse, first-match-wins cross-runtime collision check, and 18-block test matrix — v0.1 `_test-zen` and `sleepwalker-*` prefixes preserved by construction.

## What Shipped

### dashboard/lib/bundles.ts (177 lines, commit 509adb0)

Public API (6 exports):
- `BundleDescriptor` — `{runtime, slug, bundleDir}`
- `RoutineBundleRead` — `{runtime, slug, name, prompt, schedule?, reversibility?, budget?, bundleDir}` (optional fields reflect tolerant parsing of on-disk bundles that may predate the full v0.2 schema)
- `listBundles(): BundleDescriptor[]` — enumerates all 4 runtime roots, skips missing roots, filters non-directory entries (e.g. `.DS_Store`)
- `hasBundle(runtime, slug): boolean` — `fs.existsSync` against `RUNTIME_ROOT[runtime]` (NOT `toBundleDir` — so a user typing an invalid slug yields `false` instead of an exception)
- `hasBundleAnyRuntime(slug): Runtime | null` — iterates `RUNTIMES` tuple order, returns first match or `null`
- `readBundle(runtime, slug): RoutineBundleRead | null` — gray-matter for claude-desktop/claude-routines SKILL.md, JSON.parse for codex/gemini config.json; all parse errors → `null`

Internal structure:
- `RUNTIME_ROOT` map: `claude-routines → routines-cloud`, `claude-desktop → routines-local`, `codex → routines-codex`, `gemini → routines-gemini` (exactly 4 entries; verified by grep)
- `isReversibility()` local type-guard for narrowing `unknown` YAML/JSON values before assigning to the `Reversibility` union

### dashboard/tests/bundles.test.ts (210 lines, same commit)

18 `it()` blocks across 4 `describe` groups:

**listBundles (6 blocks):**
1. Empty roots → `[]`
2. Codex + gemini bundles → 2 descriptors with correct runtime labels
3. `routines-local/sleepwalker-inbox-triage` → `claude-desktop` runtime
4. `routines-cloud/daily-brief` → `claude-routines` runtime
5. `routines-cloud/_test-zen` (v0.1 underscore-prefix slug) preserved without validateSlug rejection
6. Non-directory entries (`.DS_Store`) filtered out

**hasBundle (5 blocks — 4 via `it.each` + 1 explicit):**
- Returns `true` for present slug in codex / gemini / claude-routines / claude-desktop
- Returns `false` for missing slug

**hasBundleAnyRuntime (3 blocks):**
- Returns matching runtime when slug exists in one
- Returns `null` when absent everywhere
- Returns FIRST match (RUNTIMES tuple order) when same slug exists in multiple runtimes — verified by seeding `routines-cloud/x` AND `routines-codex/x`, expecting `"claude-routines"`

**readBundle (4 blocks):**
- Codex config.json + prompt.md → full RoutineBundleRead (name, prompt, schedule, reversibility, budget, bundleDir)
- Malformed JSON → `null`
- Claude-desktop SKILL.md parses via gray-matter (name from frontmatter, prompt from body)
- Missing bundle dir → `null`

Test infrastructure: `makeTempHome()` + fresh `fs.mkdtempSync` as cwd so each test runs in an isolated directory free of the real repo's v0.1 routines.

## Verification Contract

| Check | Command | Result |
|-------|---------|--------|
| Bundles test suite | `cd dashboard && pnpm test bundles.test.ts` | 18/18 passing |
| Full dashboard suite | `cd dashboard && pnpm test` | 197/197 passing (baseline 179; +18 new) |
| TypeScript | `cd dashboard && pnpm typecheck` | exit 0 |
| Public export count | `grep -cE "^export (function\|interface) (listBundles\|hasBundle\|hasBundleAnyRuntime\|readBundle\|BundleDescriptor\|RoutineBundleRead)" dashboard/lib/bundles.ts` | 6 |
| No validateSlug call | `grep -c "validateSlug" dashboard/lib/bundles.ts` where non-comment | 0 (only in commentary documenting the rule) |
| RUNTIME_ROOT has 4 entries | visual inspection + typechecker (Record<Runtime, string> exhaustiveness) | ✅ 4 |
| v0.1 frozen surface | `git diff HEAD~1 -- install.sh hooks/ routines-local/ routines-cloud/ bin/sleepwalker-execute dashboard/lib/queue.ts dashboard/lib/audit.ts \| wc -l` | 0 |

## Deviations from Plan

None — plan executed exactly as authored. Minor plan-vs-actual facts:
- Plan minimum 15 `it()` blocks; shipped 18 (same as secret-scan.test.ts baseline — added one v0.1-prefix-preservation test for `_test-zen` that was implicit in the plan but not enumerated).
- Plan's `<behavior>` listed the RUNTIMES-tuple-order test; ran the exact setup (`routines-cloud/x` + `routines-codex/x`) and got `"claude-routines"` as expected.
- Plan example snippet used inline types for `RoutineBundleRead.reversibility`; the implementation imports the `Reversibility` type from `runtime-adapters/types.ts` to stay in sync with the frozen Phase 1 surface (additive alignment — no interface drift).

## Auth Gates

None. Pure file-system read module; no network, no credentials, no launchctl.

## Cross-References

- `03-VALIDATION.md` row 20 (EDIT-04 `hasBundle` behavior) flipped from `TBD / ⬜ pending` to `3-03-01 / ✅ green 2026-04-19`.
- EDIT-04 coverage is now partial (3 of 7 rows green: 3-03-01 for `hasBundle`, plus 2 from 03-01 schema plans). Remaining 4 rows depend on Plan 03-05 Server Action work.
- Plan 03-05 (`saveRoutine` + `checkSlugAvailability`) can now import `hasBundle` and `hasBundleAnyRuntime` without any further work.
- Phase 2 CONTEXT.md §v0.1 Bundle Reading (lines 59-91) behavioral contract — **satisfied by construction**:
  - Directory-enumeration reader ✅
  - No validateSlug call on read ✅ (verified grep)
  - v0.1 `sleepwalker-*` and `_test-zen` prefixes preserved ✅ (verified by dedicated test)

## Scope Discipline

- Two files authored; one commit.
- `git add` used explicit paths (`dashboard/lib/bundles.ts dashboard/tests/bundles.test.ts`) to preserve pre-existing parallel-session uncommitted changes in `cloud-cache.ts` / `codex.ts` / `gemini.ts` / `cloud-cache.test.ts`. Zero scope bleed.
- No v0.1 files touched (frozen-surface diff = 0 lines).

## Self-Check: PASSED

- `[ -f "dashboard/lib/bundles.ts" ]` → FOUND
- `[ -f "dashboard/tests/bundles.test.ts" ]` → FOUND
- `git log --oneline --all | grep -q "509adb0"` → FOUND
- 18/18 bundles tests green
- 197/197 full dashboard suite green
- `pnpm typecheck` exit 0
- v0.1 frozen-surface diff: 0 lines
