---
phase: 06-polish
plan: 01
subsystem: docs
status: complete 2026-04-22
tags: [docs, templates, gray-matter, zod, round-trip, DOCS-02]
requirements: [DOCS-02]
commits:
  - ce78dc9
  - a6c590b
test_delta: "358 -> 363"
dependency_graph:
  requires:
    - "dashboard/lib/bundle-schema.ts (Phase 3 SEALED)"
    - "gray-matter@4.0.3 (installed in Phase 3)"
    - "zod ^3.25 (installed in Phase 3)"
    - "CLAUDE.md §Conventions — v0.2 fleet marker [sleepwalker:<runtime>/<slug>]"
  provides:
    - "4 gray-matter-parseable runtime template fixtures at templates/routine-<runtime>.md"
    - "CI canary: templates round-trip through gray-matter + RoutineBundleInput.safeParse"
    - "DOCS-02 requirement artifact surface for Plan 06-03 (AUTHORING.md §2 deep-link target)"
  affects:
    - "docs/AUTHORING.md §2 + §3 (Plan 06-03) can now deep-link to concrete template paths"
tech_stack:
  added: []
  patterns:
    - "gray-matter round-trip: fs.readFileSync -> matter(raw) -> { data, content } -> {...data, prompt: content.trim()} -> RoutineBundleInput.safeParse"
    - "Commented YAML frontmatter: # prefixed Change-THESE-before-saving checklist sits ABOVE the zod-required keys so YAML parsers skip it"
    - "v0.2 fleet marker [sleepwalker:<runtime>/<slug>] (runtime-prefixed), NOT the v0.1 [sleepwalker:<slug>] shape"
key_files:
  created:
    - "templates/routine-claude-routines.md"
    - "templates/routine-claude-desktop.md"
    - "templates/routine-codex.md"
    - "templates/routine-gemini.md"
    - "dashboard/tests/templates.test.ts"
    - ".planning/phases/06-polish/deferred-items.md"
  modified:
    - "docs/activity_log.md"
  deleted:
    - "templates/.gitkeep (now redundant — 4 real templates keep the dir tracked)"
decisions:
  - "Frontmatter uses the LOWERCASE zod keys (name, slug, runtime, schedule, reversibility, budget) — NOT the v0.1 SKILL.md (name, description) shape. This is the load-bearing shape contract the round-trip test enforces; any regression back to v0.1 casing breaks CI immediately."
  - "Test authored with 5 lexical it() blocks (4 per-runtime + 1 negative invariant) rather than a for-loop around one it() block, to satisfy the plan's grep -cE '^\\s*it\\(' >= 4 acceptance criterion while keeping assertion logic DRY via assertRoundTrip() helper."
  - "Fleet marker uses the v0.2 [sleepwalker:<runtime>/<slug>] runtime-prefixed form. The v0.1 slug-only form [sleepwalker:<slug>] would work for v0.1 routines but the templates exist to seed NEW v0.2 runtimes so the marker MUST carry the runtime prefix from the start."
  - "Removed templates/.gitkeep: 4 real templates satisfy the 'keep dir tracked' purpose; no lingering placeholder file."
  - "Each template carries a per-runtime quirk warning as a YAML comment block: claude-desktop has Q1 manual-add warning (Desktop 1.3109.0 does NOT watch ~/.claude/scheduled-tasks/); gemini has gemini_quota_project note (Pitfall 3 defense from Phase 2 Plan 02-08). These warnings appear BEFORE the zod-required keys so they're visible when a user opens the template but skipped by the YAML parser."
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 6
  files_modified: 1
  files_deleted: 1
  commits: 2
  test_delta_abs: 5
---

# Phase 6 Plan 01: DOCS-02 Runtime Templates Summary

Four gray-matter-parseable runtime templates (claude-routines / claude-desktop / codex / gemini) now live at `templates/routine-<runtime>.md`, each authored with the LOWERCASE `RoutineBundleInput` zod keys + the v0.2 `[sleepwalker:<runtime>/<slug>]` fleet marker; `dashboard/tests/templates.test.ts` round-trips every template through `gray-matter` + `RoutineBundleInput.safeParse` and blocks future template rot on schema evolution.

## Files Changed

### Created (6)

- `templates/routine-claude-routines.md` (59 lines) — Daily Morning Brief: cloud GitHub+Linear+Slack aggregate. Frontmatter: `runtime: "claude-routines"`, `schedule: "0 7 * * *"`, `reversibility: "yellow"`, `budget: 40000`. Fleet marker: `[sleepwalker:claude-routines/morning-brief]`.
- `templates/routine-claude-desktop.md` (65 lines) — Inbox Triage: Mail.app AppleScript drafts, never sends. Prepended with a prominent Q1 manual-add warning comment block. Frontmatter: `runtime: "claude-desktop"`, `schedule: "0 2 * * *"`, `reversibility: "yellow"`, `budget: 30000`. Fleet marker: `[sleepwalker:claude-desktop/inbox-triage]`.
- `templates/routine-codex.md` (71 lines) — Dependency Update Scan: read-only lock-file walker across tracked repos. Frontmatter: `runtime: "codex"`, `schedule: "0 3 * * *"`, `reversibility: "green"`, `budget: 60000`. Fleet marker: `[sleepwalker:codex/dep-update-scan]`. References the Phase 2 Plan 02-12 `--skip-git-repo-check` auto-add.
- `templates/routine-gemini.md` (75 lines) — Design Doc Drift Review: 1M-token-context doc-drift detector. Frontmatter: `runtime: "gemini"`, `schedule: "0 6 * * *"`, `reversibility: "green"`, `budget: 100000`. Fleet marker: `[sleepwalker:gemini/doc-drift-review]`. Comment note on `gemini_quota_project` (Pitfall 3 defense from Phase 2 Plan 02-08).
- `dashboard/tests/templates.test.ts` (91 lines) — 5 lexical `it()` blocks (4 per-runtime parameterized via `assertRoundTrip()` + 1 negative invariant on `description` key). Each runtime test asserts: (1) file exists; (2) `data.runtime === <runtime>`; (3) `data.name` non-empty string; (4) `data.slug` matches `SLUG_REGEX`; (5) `data.schedule` has exactly 5 whitespace-separated fields; (6) `data.reversibility ∈ {green, yellow, red}`; (7) `data.budget` is a finite number; (8) body contains `[sleepwalker:<runtime>/...]` marker; (9) `RoutineBundleInput.safeParse({...data, prompt: content.trim()}).success === true`. Negative invariant asserts no template carries the v0.1 SKILL.md `description` key (guards against regression to v0.1 casing).
- `.planning/phases/06-polish/deferred-items.md` — Out-of-scope workspace audit log: documents the 50 pre-existing test failures from parallel-session commits `cfcf0ab` / `e38ffd4` / `82b9c2f` / others that advanced `main` from `1408625` -> `82b9c2f` during plan execution. None caused by Plan 06-01.

### Modified (1)

- `docs/activity_log.md` — 2026-04-22 EDT entry per CLAUDE.md §Activity Log format.

### Deleted (1)

- `templates/.gitkeep` — placeholder removed; the 4 real templates satisfy the "keep dir tracked" purpose.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `ce78dc9` | `feat(06-01): add 4 runtime templates + gray-matter+zod round-trip test` | 6 files / +361 / -0 (5 adds + 1 delete) |
| `a6c590b` | `docs(06-01): activity log -- 4 runtime templates + round-trip test` | 1 file / +25 |

## Test Delta

**Before:** 358 tests across 40 files (50 failing — pre-existing from parallel session, NOT Plan 06-01)
**After:** 363 tests across 41 files (50 failing + 5 new passing)

Isolated run:
```
cd /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard
pnpm test tests/templates.test.ts
# RUN  v2.1.8
#  ✓ tests/templates.test.ts (5 tests) 4ms
#  Test Files  1 passed (1)
#       Tests  5 passed (5)
```

**Proof of isolation (stash-pop-verify):** Running `pnpm test` with my staged changes temporarily stashed yielded 50 failed / 308 passed (358 total). With my changes applied it yielded 50 failed / 313 passed (363 total). Same 50 failures in both runs, my +5 tests green. My +5 tests do not cause any pre-existing failures to flip, nor do any pre-existing passing tests flip to failing.

## Round-Trip Evidence

For each of the 4 templates, `gray-matter(fs.readFileSync(...))` yields:

| Runtime | data.runtime | data.slug | data.schedule | data.reversibility | data.budget | safeParse |
|---------|-------------|-----------|---------------|-------------------|------------|-----------|
| claude-routines | "claude-routines" | "morning-brief" | "0 7 * * *" | "yellow" | 40000 | `{success: true}` |
| claude-desktop | "claude-desktop" | "inbox-triage" | "0 2 * * *" | "yellow" | 30000 | `{success: true}` |
| codex | "codex" | "dep-update-scan" | "0 3 * * *" | "green" | 60000 | `{success: true}` |
| gemini | "gemini" | "doc-drift-review" | "0 6 * * *" | "green" | 100000 | `{success: true}` |

## Template Quirk Coverage

Verified via `grep`:

- `grep -c -E "manual-add|Q1" templates/routine-claude-desktop.md` = **2** (PASS: expected >=1)
- `grep -c "gemini_quota_project" templates/routine-gemini.md` = **1** (PASS: expected >=1)
- `grep -c "^description:" templates/routine-*.md | awk ...` = **0** (PASS: negative invariant holds across all 4 templates)

## Self-Check: PATTERNS Mirror Verified

- Frontmatter uses LOWERCASE zod keys (`name`, `slug`, `runtime`, `schedule`, `reversibility`, `budget`), NOT v0.1 SKILL.md's `name` + `description` casing. Verified: `grep -c "^description:" templates/routine-*.md` totals 0 across all 4 files.
- Body marker uses runtime-prefixed `[sleepwalker:<runtime>/<slug>]` form, NOT v0.1 `[sleepwalker:<slug>]`. Verified: each template body has exactly 1 marker matching `\[sleepwalker:<its-own-runtime>/`.
- Fleet marker per CLAUDE.md §Conventions, zero v0.1 slug-only markers in the 4 new files.
- Each template has a commented `# Change THESE before saving` checklist listing the 6 placeholder fields (RESEARCH §2.4 mitigation for "user forgets to change slug").

## Deviations from Plan

### Auto-fixed Issues

**None for template content or test logic.** Plan executed exactly as written for all authored files.

### Environmental Complications (Out-of-Scope Observations)

**1. [Observation — not a deviation] Parallel-session workspace volatility**
- **Found during:** Task 2, mid-execution (between initial writes and staging)
- **Issue:** Another session advanced `main` by 7 commits during Plan 06-01 execution, from `1408625` -> `82b9c2f`. Two of those commits (`cfcf0ab refactor(editor): drop existingSlugs prop`, `e38ffd4 fix(drawer): render deploy-progress-drawer through createPortal`) arrived as modifications to files I did NOT touch, and two untracked `routines-*/` directories appeared and disappeared from the working tree mid-session.
- **Impact on Plan 06-01:** Three of my four template files were transiently removed from the working tree between their initial `Write` and the `git add` step. I re-authored them idempotently (identical content) and committed successfully.
- **Proof of zero cross-contamination:** Staged `git diff --cached --name-status` before `feat(06-01)` commit shows exactly 6 paths: `A dashboard/tests/templates.test.ts`, `D templates/.gitkeep`, `A templates/routine-claude-{desktop,routines}.md`, `A templates/routine-codex.md`, `A templates/routine-gemini.md`. No other files staged. Post-commit `git diff --diff-filter=D HEAD~1 HEAD` shows only the expected `.gitkeep` deletion.

**2. [Observation — not a deviation] 50 pre-existing test failures in full suite**
- **Found during:** full-suite gate after Task 2 test authored
- **Issue:** `cd dashboard && pnpm test` reports 50 failing tests across 8 files (`bundles.test.ts`, `deploy-routine-action.test.ts`, `routines-page.test.ts`, `run-now-action.test.ts`, `save-routine-action.test.ts`, `save-to-repo-action.test.ts`, `save-to-repo.test.ts`, `set-enabled-action.test.ts`).
- **Cause:** Pre-existing in-flight modifications from parallel sessions — specifically `dashboard/lib/bundles.ts` changes and new untracked `routines-*/` directories that shift `listBundles()` / `listCloudRoutines()` expected counts.
- **Scope:** All 50 are out-of-scope for Plan 06-01 per the executor SCOPE BOUNDARY rule. None of the 8 failing test files intersect with `templates/` or `dashboard/tests/templates.test.ts`.
- **Proof:** Stash-pop-verify before commit: `pnpm test` with my changes stashed yielded 50 failed / 308 passed (358); with my changes applied 50 failed / 313 passed (363). Same 50 failures in both runs.
- **Handling:** Documented fully in `.planning/phases/06-polish/deferred-items.md` with per-file failure counts and the parallel-session commit refs. No auto-fix attempted (would violate scope boundary).

## Authentication Gates

None.

## Known Stubs

None — templates are user-editable by design, and the placeholder fields are marked via the `Change THESE before saving` checklist, which is the intended UX, not a stub.

## Threat Flags

None — templates are static fixtures parsed only through the existing gray-matter + zod pipeline; zero new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED

**Files verified to exist:**
- `templates/routine-claude-routines.md` FOUND
- `templates/routine-claude-desktop.md` FOUND
- `templates/routine-codex.md` FOUND
- `templates/routine-gemini.md` FOUND
- `dashboard/tests/templates.test.ts` FOUND

**Commits verified:**
- `ce78dc9` FOUND in git log
- `a6c590b` FOUND in git log

**Acceptance criteria verified:**
- `grep -c '^runtime: "claude-routines"$' templates/routine-claude-routines.md` = 1 PASS
- `grep -c '^runtime: "claude-desktop"$' templates/routine-claude-desktop.md` = 1 PASS
- `grep -c '^runtime: "codex"$' templates/routine-codex.md` = 1 PASS
- `grep -c '^runtime: "gemini"$' templates/routine-gemini.md` = 1 PASS
- Each template has exactly one `[sleepwalker:<runtime>/<slug>]` marker
- Each template has all 6 zod-required keys
- claude-desktop contains `manual-add` + `Q1` warning text
- gemini contains `gemini_quota_project` note
- No template uses v0.1 `description:` key
- `grep -cE "^\\s*it\\(" dashboard/tests/templates.test.ts` = 5 PASS (>=4 required)
- `grep -c "RoutineBundleInput.safeParse" dashboard/tests/templates.test.ts` = 2 PASS (>=1 required)
- `grep -c "import matter" dashboard/tests/templates.test.ts` = 1 PASS (>=1 required)
- `pnpm test tests/templates.test.ts` = 5/5 green
- `pnpm run typecheck` = exit 0

**Downstream plans unlocked:** 06-03 (AUTHORING.md §2 can reference concrete template paths; §3 per-runtime subsections can deep-link to the matching template).
