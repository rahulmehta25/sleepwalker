---
phase: 03-editor
plan: 01
subsystem: editor
tags: [editor, validation, zod, schema, test-infra]
requires:
  - phase-1-slug-regex-contract
provides:
  - dashboard/lib/bundle-schema.ts::RoutineBundleInput
  - vitest jsdom test environment for .test.tsx files
affects:
  - dashboard/package.json (additive deps only)
  - dashboard/vitest.config.ts (additive config only)
tech-stack:
  added:
    - zod@4.3.6
    - cronstrue@3.14.0
    - yaml@2.8.3
    - gray-matter@4.0.3
    - "@testing-library/react@16.3.2"
    - "@testing-library/user-event@14.6.1"
    - jsdom@25.0.1
  patterns:
    - zod schema with literal UI-SPEC error-message overrides (no zod defaults leak to UI)
    - duplicate SLUG_REGEX locally to keep bundle-schema.ts free of Phase-2 coupling
    - z.coerce.number for FormData string-to-number carrying
    - vitest environmentMatchGlobs pattern for per-file-extension env routing
key-files:
  created:
    - dashboard/lib/bundle-schema.ts
    - dashboard/tests/bundle-schema.test.ts
  modified:
    - dashboard/package.json
    - dashboard/pnpm-lock.yaml
    - dashboard/vitest.config.ts
decisions:
  - Duplicate SLUG_REGEX in bundle-schema.ts instead of importing from runtime-adapters/slug — zero Phase-2 coupling preserves Wave-0-parallel-to-Phase-2 execution property
  - Reuse identical "Invalid cron — 5 fields required ..." string for both z.string().min(1) and the 5-field .refine() so message order doesn't leak into UI (UI-SPEC has exactly one cron-invalid message)
  - Do not rename exported symbol "RoutineBundleInput" to avoid conflicting with future RoutineBundle type from @/lib/runtime-adapters/types; zod schema + TS inferred type share the name via typeof
  - Use pnpm add (not npm / yarn / bun) per CLAUDE.md lock-file detection and v0.1 convention
metrics:
  duration: ~3 min
  completed: 2026-04-19
  tasks: 2
  files_created: 2
  files_modified: 3
  test_count_before: 137
  test_count_after: 161
  tests_added: 24
---

# Phase 3 Plan 01: Wave 0 Foundations — zod schema + jsdom test env Summary

Net-new deps (zod + cronstrue + yaml + gray-matter + RTL + jsdom) are now installed
and the `RoutineBundleInput` zod schema is the canonical write-shape validator, with
every error message matching the UI-SPEC §Validation copy verbatim.

## What Shipped

### Task 1 — Install deps + extend vitest config
**Commit:** `104547f` — `chore(03-01): install zod/cronstrue/yaml/gray-matter deps + jsdom testing stack`

- `pnpm add zod@4.3.6 cronstrue@3.14.0 yaml@2.8.3 gray-matter@4.0.3`
  - zod is the only one in use today (Plan 03-01); cronstrue lands in Plan 03-06 (CronPreview), yaml + gray-matter in Plan 03-05 (claude-desktop SKILL.md write branch)
- `pnpm add -D @testing-library/react@^16 @testing-library/user-event@^14 jsdom@^25`
  - Resolved: RTL `16.3.2`, user-event `14.6.1`, jsdom `25.0.1`
  - Wave 2 client-component tests (Plans 03-06 / 03-07 / 03-08) can now use `.test.tsx` and automatically get the jsdom env
- `dashboard/vitest.config.ts` extended with TWO minimal changes:
  - `include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`
  - `environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]]`
  - `environment: "node"` default preserved, so all 137 existing `.test.ts` tests keep running on node with zero behavior change

Post-Task-1 baseline: **137/137 green** (unchanged from pre-plan baseline).

### Task 2 — RoutineBundleInput schema + accept/reject test matrix
**Commit:** `feat(03-01): add RoutineBundleInput zod schema + 12 accept/reject tests` (amended with SUMMARY + ROADMAP + STATE + activity_log per v0.1 convention; final hash resolvable via `git log --grep "feat(03-01): add RoutineBundleInput"`)

- `dashboard/lib/bundle-schema.ts` (68 lines) exports `RoutineBundleInput` — both the zod schema and the inferred TS type share the name via `typeof`. Seven fields: name / slug / runtime / prompt / schedule / reversibility / budget.
- `dashboard/tests/bundle-schema.test.ts` (193 lines, 17 `it()` blocks expanded to 24 via `it.each` on 4 runtimes + 3 reversibilities). Coverage per `03-VALIDATION.md`:
  - Row 4 (EDIT-02): `RoutineBundleInput.safeParse` accepts valid and rejects invalid shape with structured `fieldErrors`
  - Row 14 (EDIT-04): Slug regex `^[a-z][a-z0-9-]{0,63}$` enforced via zod
  - Row 15 (EDIT-04): `../../../evil` rejected
  - Row 16 (EDIT-04): `Has Spaces` rejected
  - Row 17 (EDIT-04): `UPPERCASE` rejected
  - Bonus: `1-start` (leading digit) rejected; `sleepwalker-inbox-triage` (v0.1 prefix) accepted; runtime `amp` rejected with "Pick a runtime.".

TDD flow: test file authored first, `pnpm test bundle-schema` FAILED with "Cannot find module '@/lib/bundle-schema'" (expected RED), then schema file added and the same command went 24/24 green.

Post-Task-2 full suite: **161/161 green** (137 → 161, delta +24 from bundle-schema.test.ts).

## UI-SPEC Message Fidelity

Every zod `message:` override is the LITERAL UI-SPEC string. Grep-verified:

```
grep -cF 'Slug must match ^[a-z][a-z0-9-]{0,63}$' dashboard/lib/bundle-schema.ts  # → 1
grep -cF 'Pick a runtime.' dashboard/lib/bundle-schema.ts                          # → 1
```

Full message list (all matched verbatim against `03-UI-SPEC.md` §Validation messages lines 164-180):

| Field | Condition | Message |
|-------|-----------|---------|
| name | empty | `Name is required.` |
| name | > 60 chars | `Name must be 60 characters or fewer.` |
| slug | regex fail | `Slug must match ^[a-z][a-z0-9-]{0,63}$ — lowercase letters, digits, and hyphens, starting with a letter.` |
| runtime | invalid enum | `Pick a runtime.` |
| prompt | empty | `Prompt is required.` |
| prompt | > 16,000 chars | `Prompt exceeds 16,000 characters. Split into multiple routines or reduce scope.` |
| schedule | empty OR ≠ 5 fields | `Invalid cron — 5 fields required (minute hour day month weekday).` |
| reversibility | invalid enum | `Pick a reversibility level.` |
| budget | < 1000 | `Budget must be at least 1,000 characters.` |
| budget | > 200000 | `Budget above 200,000 characters — consider splitting into multiple routines.` |

## 03-VALIDATION.md Status After This Plan

Rows now satisfied (Task ID → `3-01-02`):

| Row | Requirement | Status |
|-----|-------------|--------|
| 4   | EDIT-02 | ✅ green (bundle-schema.test.ts) |
| 14  | EDIT-04 | ✅ green |
| 15  | EDIT-04 | ✅ green |
| 16  | EDIT-04 | ✅ green |
| 17  | EDIT-04 | ✅ green |

## Dependency Install Resolution Output

```
$ pnpm list zod cronstrue yaml gray-matter @testing-library/react @testing-library/user-event jsdom --depth=0

sleepwalker-dashboard@0.1.0
│   dependencies:
├── cronstrue@3.14.0
├── gray-matter@4.0.3
├── yaml@2.8.3
├── zod@4.3.6
│   devDependencies:
├── @testing-library/react@16.3.2
├── @testing-library/user-event@14.6.1
└── jsdom@25.0.1

7 packages
```

No duplicate zod versions; all single-version installs.

## Frozen v0.1 Surface Check

```
$ git diff --stat 104547f~1 HEAD -- install.sh hooks/ routines-local/ routines-cloud/ \
    dashboard/lib/settings.ts dashboard/lib/queue.ts dashboard/lib/routines.ts \
    dashboard/app/layout.tsx dashboard/app/page.tsx dashboard/app/_components/ \
    bin/sleepwalker-execute
```
Returns 0 lines — frozen v0.1 contract intact.

## Deviations from Plan

None — plan executed exactly as written with one minor note for the summary record:

- Baseline test count was **137** (not 72 as in the plan's success criteria). The plan's 72→84 projection was written when Phase 2 was mid-flight; Phase 2 has since sealed (104 tests at 02-10) and additional Phase 2 tests landed (137 today). The proportional invariant held: 137 + 24 new = 161 green, zero regressions, consistent with the plan's "suite grows by ≥ 12 blocks" requirement (actual growth +24).

No Rule 1-4 auto-fixes were required.

## Self-Check: PASSED

- [x] `dashboard/lib/bundle-schema.ts` exists and exports `RoutineBundleInput` (verified via `test $(grep -c 'export const RoutineBundleInput' dashboard/lib/bundle-schema.ts) = 1`)
- [x] `dashboard/tests/bundle-schema.test.ts` exists and has 24 tests green
- [x] `dashboard/package.json` lists all 4 runtime deps + 3 dev deps at correct versions
- [x] `dashboard/vitest.config.ts` has `environmentMatchGlobs` (verified via `grep -c environmentMatchGlobs dashboard/vitest.config.ts = 1`)
- [x] Commit `104547f` exists in `git log`
- [x] Commit `326581a` exists in `git log`
- [x] Full suite 161/161 green, typecheck exit 0
- [x] UI-SPEC §Validation strings present verbatim in bundle-schema.ts (grep -cF confirmed)
- [x] v0.1 frozen surface diff = 0 lines

## Next

Plan 03-01 is complete. The write-path typed-schema foundation is in place.

Next unlockable plans in Phase 3:
- **03-02** — `secret-patterns.ts` + `scanForSecrets` utility (Wave 0, parallel-safe with 03-01; no dep on this plan's exports but shares the `dashboard/tests/*.test.ts` pattern)
- **03-03** — `bundles.ts` read-side enumeration (Wave 1; depends on Phase 2 which is sealed)
- **03-04** — `atomic-write.ts` directory-swap writer (Wave 1; no dep on this plan)
- **03-05** — Server Action `saveRoutine` (Wave 2; DEPENDS on `RoutineBundleInput` schema from this plan + 03-02 secret-scan + 03-03 bundles + 03-04 atomic-write)
