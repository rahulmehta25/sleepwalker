---
phase: 02-adapters
plan: 01
subsystem: runtime-adapters
tags: [slug, validation, guard, path-traversal, assertValidSlug, phase-2, wave-1, security]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: slug.ts (10 public exports, 6 identifier builders) + slug.test.ts (13 it blocks)
provides:
  - assertValidSlug module-private guard in slug.ts that throws on invalid input
  - 6 guarded identifier builders (toFleetKey, toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath, toBundleDir)
  - "construct → throw; parse → null" asymmetry preserved (parseFleetKey still returns null)
  - 7 new it() blocks in slug.test.ts exercising the throw path + non-throw assertion for parseFleetKey
affects: [02-02-launchd-writer, 02-05-claude-routines, 02-06-claude-desktop, 02-07-codex, 02-08-gemini, 03-editor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TypeScript assertion functions (`asserts slug is string`) as module-private input guards"
    - "Construct-throws / parse-returns-null asymmetry for builder vs reader semantics"
    - "Defense-in-depth double-validation (toPlistPath + inner toLaunchdLabel both call assertValidSlug)"

key-files:
  created: []
  modified:
    - dashboard/lib/runtime-adapters/slug.ts
    - dashboard/tests/slug.test.ts
    - docs/activity_log.md

key-decisions:
  - "assertValidSlug is module-private (no export) — public API stays at exactly 10 exports, preserving Phase 1 surface"
  - "parseFleetKey deliberately NOT guarded — parsing legacy / partial data returns null by design (result-object convention)"
  - "Error message includes JSON.stringify(slug) for developer diagnostics; slugs are not secrets (directory names)"
  - "toPlistPath double-validates (itself + inner toLaunchdLabel) — intentional defense-in-depth, not a bug"
  - "Single atomic commit (slug.ts + slug.test.ts + activity log) per plan Task 3 instructions, not three separate commits"

patterns-established:
  - "Assertion-function guard pattern: every builder validates input at entry via `assertValidSlug(slug)` as first statement"
  - "Test pattern for throw coverage: one describe block `builders reject invalid slugs` with one it() per builder + one non-throw it() for the parser"

requirements-completed: [ADPT-02]

# Metrics
duration: 3 min
completed: 2026-04-19
---

# Phase 2 Plan 01: Slug Guard Injection Summary

**Enforced ADPT-02 at the code level by adding a module-private `assertValidSlug()` throw guard and injecting it into every identifier builder in `slug.ts` — path traversal (`../x`), uppercase, spaces, leading digits, leading underscores, and empty strings now fail by construction in `toFleetKey`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath`, and `toBundleDir`.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-19T05:25:30Z
- **Completed:** 2026-04-19T05:28:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Resolved Phase 1 review debt item #1 (Gemini + Codex HIGH consensus: builders accepting raw strings made ADPT-02 "primitive only, not enforcement")
- `slug.ts` grew 92 → 118 lines; public export count unchanged at 10 (`RUNTIMES`, `validateSlug`, `isRuntime`, `toFleetKey`, `parseFleetKey`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath`, `toBundleDir`)
- `slug.test.ts` grew from 13 it() blocks / 28 expect() assertions to 20 it() blocks / 35 expect() assertions (+7 it / +7 expect). New describe group `builders reject invalid slugs`
- Dashboard suite grew from 56/56 green to 63/63 green — zero regressions on the 56 v0.1+Phase-1 baseline tests
- `parseFleetKey` null-on-invalid asymmetry preserved and documented with an explicit NOTE comment so future maintainers do not "helpfully" add the guard
- Wave 2 adapters (`codex.ts`, `gemini.ts`, `claude-desktop.ts`, `claude-routines.ts`) now have a guaranteed-valid contract — no adapter can silently construct a bad identifier

## Task Commits

Per the plan's Task 3 instructions, all three logical changes (slug.ts, slug.test.ts, activity log) shipped as one atomic commit:

1. **Tasks 1 + 2 + 3 combined** — `c5922de` `feat(02-01): enforce slug validation in identifier builders`
   - `dashboard/lib/runtime-adapters/slug.ts` (Task 1: assertValidSlug helper + 6 guarded builders + parseFleetKey NOTE)
   - `dashboard/tests/slug.test.ts` (Task 2: new describe block with 7 it() blocks)
   - `docs/activity_log.md` (Task 3: entry appended then amended into same commit per v0.1 convention)

The plan's Task 3 explicitly directs `git commit --amend --no-edit` to fold the activity log into the feat commit rather than shipping two commits. First commit hash was `cb16382`; after amend it became `c5922de`.

## Files Created/Modified
- `dashboard/lib/runtime-adapters/slug.ts` — added `assertValidSlug()` helper (module-private, `asserts slug is string` signature, throws `Invalid slug: <json>. Must match ^[a-z][a-z0-9-]{0,63}$`); injected `assertValidSlug(slug);` as the first statement of all 6 identifier builders; added NOTE comment to `parseFleetKey` explaining the construct-throws / parse-returns-null asymmetry
- `dashboard/tests/slug.test.ts` — appended new `describe("builders reject invalid slugs", ...)` with 7 it() blocks: one per guarded builder (`toFleetKey` / `toLaunchdLabel` / `toMarkerTag` / `toBranchPrefix` / `toPlistPath` / `toBundleDir`) asserting `toThrow(/Invalid slug/)` on canonical invalid inputs, plus one non-throw assertion verifying `parseFleetKey` still returns null on invalid input
- `docs/activity_log.md` — appended `## 2026-04-19 01:27 EST` entry with the canonical CLAUDE.md §Activity Log template

## Decisions Made
- **Single atomic commit (vs. per-task commits).** The plan's Task 3 explicitly directs one commit covering all three files (amending the activity log into the feat commit). This matches v0.1 convention (`git log --oneline -2` at the time of plan authoring showed the same amend-activity-log pattern).
- **`assertValidSlug` is module-private.** Not exported so the public API stays at exactly 10 surfaces; Phase 1 export set is byte-identical in type shape. Builders are the intended enforcement point; no consumer should call `assertValidSlug` directly.
- **`parseFleetKey` intentionally unguarded.** Preserving the null-on-invalid asymmetry — parsing is used by audit readers and legacy data consumers that must tolerate partial / malformed input. Added a NOTE comment so future readers understand the intent and do not "helpfully" add the guard.
- **Double-call in `toPlistPath` is defense-in-depth.** `toPlistPath` calls `assertValidSlug(slug)` first, then calls `toLaunchdLabel` which calls `assertValidSlug(slug)` again. The second call is a cheap no-op for valid slugs and a safety net if a future caller bypasses `toPlistPath`.

## Deviations from Plan

Plan executed exactly as written on all three tasks. Two minor acceptance-criterion clarifications worth noting for future auditors, neither requiring code changes:

### Acceptance-Criterion Clarifications

**1. Task 1 AC5 — `grep "parseFleetKey" | grep "assertValidSlug"` returns 1, not 0**
- **Found during:** Task 1 acceptance verification
- **Cause:** The plan's step 3 action explicitly requires adding a NOTE comment to `parseFleetKey` that *names* `assertValidSlug`. The plan's AC5 grep was written to detect the *call*, not a text match, so a literal `grep` on the symbol name picks up the comment as a false positive. The behavioral intent — `parseFleetKey` body does not *invoke* `assertValidSlug` — is satisfied (verified by scoped grep on lines 66–76: 0 calls).
- **Resolution:** No fix needed. The plan's AC5 verification command is slightly imprecise; the behavioral intent is verified by `sed -n '66,76p' dashboard/lib/runtime-adapters/slug.ts | grep -c "assertValidSlug(slug);"` → 0.

**2. Task 2 AC2 — `^describe(` count is 5, not 6**
- **Found during:** Task 2 acceptance verification
- **Cause:** Plan AC2 stated "existing 5 describe groups + 1 new = 6", but the pre-plan file had 4 describe groups (`validateSlug`, `isRuntime`, `identifier builders`, `parseFleetKey`), not 5. The correct post-plan count is 4 + 1 = 5.
- **Resolution:** No fix needed. The behavioral intent — one additional describe block named "builders reject invalid slugs" — is satisfied. Verified by `grep -n "^describe" slug.test.ts` → 5 lines, with the new block at line 84.

### Pre-existing Untracked Files (out of scope, not plan-caused)

Before this plan started, the working tree had three untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`). These are outside the plan's `files_modified` scope and were left untouched per the scope-boundary rule. `git status --porcelain` is therefore not byte-empty after the commit, but zero *modifications* remain — `git status -s | grep -v '^??'` is empty. The plan's Task 3 verify command `git status --porcelain | wc -l | grep -q '^ *0$'` is imprecise on working trees with pre-existing untracked files; the behavioral intent (no uncommitted changes to *plan-owned* files) is satisfied.

---

**Total deviations:** 0 code-level (plan executed exactly as written). 2 minor plan-AC doc clarifications documented above for future auditors.
**Impact on plan:** None. All 3 tasks shipped the exact diff shape prescribed in RESEARCH §Pattern 3 / CONTEXT §Slug Validation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Threat Register Outcome

All 4 STRIDE entries from the plan's threat_model are mitigated as designed:

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-02-01-01 (Tampering: toBundleDir path traversal) | **mitigated** | Test `toBundleDir("codex", "../x")` throws `/Invalid slug/` (slug.test.ts:100-102) |
| T-02-01-02 (Tampering: toLaunchdLabel / toPlistPath identifier construction) | **mitigated** | Tests `toLaunchdLabel("codex", "Morning-Brief")` and `toPlistPath("codex", "1-bad")` both throw (slug.test.ts:88-89, 97-98) |
| T-02-01-03 (Elevation: toBranchPrefix git-ref) | **mitigated** | Test `toBranchPrefix("gemini", "")` throws; empty / spaced / traversal branches now fail before `simple-git` ever sees them |
| T-02-01-04 (InfoDisclosure: error echoes input) | **accepted** | Error uses `JSON.stringify(slug)` for dev diagnostics; slugs are directory names, not secrets — no PII / credential risk |

## Next Phase Readiness

Wave 1 Plan 02 (`launchd-writer.ts`) can now proceed: its `installPlist(bundle)` will call `toPlistPath(bundle.runtime, bundle.slug)` with the guarantee that path traversal is impossible at construction. Waves 2–3 adapters inherit the same guarantee transitively through every builder they touch.

No blockers. Phase 2 Plan 02 is unblocked on the main tree (no sub-repo / worktree complications since this was sequential execution).

## Self-Check: PASSED

- [x] `dashboard/lib/runtime-adapters/slug.ts` exists and has been modified
- [x] `dashboard/tests/slug.test.ts` exists and has been modified
- [x] `docs/activity_log.md` contains the `2026-04-19 01:27 EST` entry
- [x] Commit `c5922de` exists in `git log --all --oneline` with subject `feat(02-01): enforce slug validation in identifier builders`
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test` exits 0 with 63/63 green (up from 56/56 baseline)
- [x] `grep -c "assertValidSlug(slug);" dashboard/lib/runtime-adapters/slug.ts` = 6
- [x] `grep -c "^export " dashboard/lib/runtime-adapters/slug.ts` = 10 (unchanged from Phase 1)
- [x] Frozen-surface diff: only `dashboard/lib/runtime-adapters/slug.ts` + `dashboard/tests/slug.test.ts` appear in `git log -1 --name-only` (plus `docs/activity_log.md` which is not in the frozen surface)

---
*Phase: 02-adapters*
*Completed: 2026-04-19*
