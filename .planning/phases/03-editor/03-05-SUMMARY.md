---
phase: 03-editor
plan: 05
subsystem: editor/server-actions
tags: [editor, server-action, secret-scan, collision, atomic-write, EDIT-02, EDIT-04]
requires:
  - "@/lib/bundle-schema :: RoutineBundleInput (Plan 03-01)"
  - "@/lib/secret-scan :: scanForSecrets (Plan 03-02)"
  - "@/lib/bundles :: hasBundleAnyRuntime + RUNTIME_ROOT (Plan 03-03, this plan exported RUNTIME_ROOT)"
  - "@/lib/atomic-write :: atomicWriteBundle (Plan 03-04)"
  - "@/lib/runtime-adapters/types :: Runtime (Phase 1)"
  - "gray-matter (YAML frontmatter stringify for SKILL.md builds)"
provides:
  - dashboard/app/editor/actions.ts :: saveRoutine (Server Action)
  - dashboard/app/editor/actions.ts :: checkSlugAvailability (async probe)
  - dashboard/app/editor/actions.ts :: SaveRoutineState (discriminated union type)
  - dashboard/app/editor/actions.ts :: SlugAvailability (discriminated union type)
  - dashboard/lib/bundles.ts :: RUNTIME_ROOT (now exported for Server Action consumption)
affects:
  - Plan 03-07 SecretScanPanel (consumes fieldErrors.prompt copy shape)
  - Plan 03-08 EditorClient useActionState wiring (consumes SaveRoutineState discriminant)
  - Plan 03-08 EditorClient success UI (reads warning field to display manual-add instruction for claude-desktop)
  - Plan 03-08 EditorClient debounced slug preview (consumes SlugAvailability)
tech-stack-added: []
tech-stack-patterns:
  - "React 19 Server Action signature (prevState, formData) — useActionState-compatible discriminated union return"
  - "FormData coercion via Object.fromEntries + zod z.coerce.number() on budget field"
  - "Authoritative server-side secret scan — client preview may exist but the write gate is server-only (Pitfall #5 defeated by single shared scanner module)"
  - "Order-of-operations guarantee: zod → secret-scan → hasBundleAnyRuntime → atomicWriteBundle; any earlier step's failure short-circuits before disk is touched"
  - "Runtime-specific file-set builder — claude-desktop / claude-routines write SKILL.md with gray-matter frontmatter; codex / gemini write config.json + prompt.md"
  - "Phase-2-smoke-informed warning field: claude-desktop success returns an advisory pointing to Schedule tab paste step (Desktop 1.3109.0 does not watch ~/.claude/scheduled-tasks/)"
  - "TOCTOU backstop: atomic-write errorCode:collision maps to the same UI-SPEC same-runtime message as the hasBundleAnyRuntime pre-flight path"
key-files-created:
  - dashboard/app/editor/actions.ts (242 lines)
  - dashboard/tests/save-routine-action.test.ts (319 lines)
key-files-modified:
  - dashboard/lib/bundles.ts (+1 char — added export keyword to RUNTIME_ROOT)
  - .planning/phases/03-editor/03-VALIDATION.md (6 rows flipped to ✅ green 3-05-02)
  - .planning/STATE.md (phase 3 progress 4/8 → 5/8; metrics row; decisions)
  - .planning/ROADMAP.md (phase 3 plan count 4/8 → 5/8)
  - .planning/REQUIREMENTS.md (EDIT-02 + EDIT-04 now code complete)
  - docs/activity_log.md (appended 03-05 entry)
key-decisions:
  - "saveRoutine signature is (prevState, formData) — matches React 19 useActionState exactly; client wires `const [state, action] = useActionState(saveRoutine, {status: 'idle'})`"
  - "SaveRoutineState is a discriminated union on `status` (idle | ok | error) — client rerenders branch off status, no error-flag-with-success payload ambiguity"
  - "Claude-desktop success adds `warning?: string` — Phase 2 Q1 smoke revealed Desktop does not auto-detect routines; rather than pretend the save deploys the routine, surface the manual-add instruction on the success path. Warning is NON-blocking (status is still 'ok', bundlePath set, file on disk)"
  - "FormData coercion uses Object.fromEntries + zod's z.coerce — no manual string→number parsing; validation errors for budget coercion surface as zod fieldErrors.budget"
  - "RUNTIME_ROOT exported from bundles.ts (single-char diff) — actions.ts computes finalDir via path.join(RUNTIME_ROOT[runtime], slug); toBundleDir in slug.ts is reserved for fleet-key identifiers (marker tags, launchd labels), not filesystem write paths"
  - "Secret message is the first match only (matches[0]) — UI-SPEC shows one message at a time; the full list of matches is used by the client SecretScanPanel (Plan 03-07) which consumes scanForSecrets directly"
  - "Slug regex rejection happens inside zod (step 1), not a separate step — keeps the error surface uniform (fieldErrors.slug)"
  - "checkSlugAvailability is permissive on empty slug — the zod schema will surface slug-required at save time; on-blur preview should not flash an error on first paint"
metrics:
  duration-minutes: 6
  completed: 2026-04-19
  tasks: 2
  commits: 2
  test-count-delta: +16 (205 → 221)
  line-count: 562 insertions (242 src + 319 tests + 1 bundles.ts export)
---

# Phase 3 Plan 03-05: saveRoutine + checkSlugAvailability Server Actions Summary

**One-liner:** Authoritative Server Action that composes Wave 0/1 primitives (zod → secret-scan → cross-runtime collision → atomic directory-swap) in locked order — any secret match BLOCKS the write (disk untouched); claude-desktop success returns a Phase-2-smoke-informed manual-add warning so the editor can direct the user to Desktop's Schedule tab.

## What Shipped

### dashboard/app/editor/actions.ts (242 lines, commit `70cc247`)

Server Action module with `"use server"` directive on line 1.

Public API (4 exports):
- `saveRoutine(prevState, formData): Promise<SaveRoutineState>` — React 19 useActionState-compatible
- `checkSlugAvailability(runtime, slug): Promise<SlugAvailability>` — async on-blur collision preview
- `SaveRoutineState` — discriminated union `{status: "idle"} | {status: "ok", bundlePath, runtime, slug, warning?} | {status: "error", fieldErrors, formError?}`
- `SlugAvailability` — discriminated union `{available: true} | {available: false, existsIn: Runtime, message: string}`

saveRoutine algorithm (4 gated phases):
1. **FormData coercion + zod validation** (`RoutineBundleInput.safeParse(Object.fromEntries(formData))`) — `fieldErrors` returned on failure via `error.flatten()`.
2. **Authoritative secret scan** (`scanForSecrets(input.prompt)`) — non-empty → `fieldErrors.prompt` with the exact UI-SPEC "Prompt appears to contain a secret ({name} at line {n}, column {c}). Replace with ${VAR} and document the env var in AUTHORING.md. Save blocked." string. **atomicWriteBundle is never called; disk is never touched.**
3. **Cross-runtime collision pre-flight** (`hasBundleAnyRuntime(input.slug)`) — same-runtime match returns the "A routine at routines-\<root\>/\<slug\>/ already exists. Choose a different slug." copy; cross-runtime match returns "A \<other-runtime\> routine with slug \<slug\> exists. Slugs must be unique across runtimes.".
4. **Atomic write** (`atomicWriteBundle(finalDir, buildFiles(input))`) — errorCode:collision (TOCTOU race backstop) maps to the same same-runtime message; other errorCode values surface `formError`.

File-set builder branches on runtime:
- `claude-desktop` | `claude-routines` → `{"SKILL.md": matter.stringify(prompt, {name, schedule, reversibility, budget})}`
- `codex` | `gemini` → `{"config.json": JSON.stringify({name, runtime, slug, schedule, reversibility, budget}, null, 2), "prompt.md": prompt}`

Claude-desktop success path adds `warning: "Claude Desktop does not auto-detect routines. Open Desktop → Schedule → Add and paste the generated SKILL.md content."` — non-blocking advisory derived from the Phase 2 Q1 smoke finding that Claude Desktop 1.3109.0 does not watch `~/.claude/scheduled-tasks/`. The Plan 03-08 EditorClient will render this on the save-success UI.

checkSlugAvailability:
- Empty slug → `{available: true}` (permissive; zod is authoritative on save)
- `hasBundleAnyRuntime(slug) === null` → `{available: true}`
- `=== runtime` → `{available: false, existsIn, message: sameRuntime}`
- `!== runtime` → `{available: false, existsIn, message: crossRuntime}`

### dashboard/tests/save-routine-action.test.ts (319 lines, commit `70cc247`)

Vitest test matrix, 16 it() blocks across 2 describe groups (minimum was 12):

**saveRoutine (12 blocks):**
1. codex happy path — config.json + prompt.md exist; bundlePath returned
2. claude-desktop happy path — SKILL.md with YAML frontmatter + body; no config.json
3. claude-desktop warning field (Q1 smoke) — success + warning matches `/Claude Desktop does not auto-detect/` and `/Schedule/`
4. zod failure on empty name — `fieldErrors.name[0] === "Name is required."`, no disk write
5. invalid slug regex — `Bad_Slug` rejected by zod with "lowercase letters" message
6. AWS key secret blocks write — `AKIA...` pattern, `fieldErrors.prompt` starts with "Prompt appears to contain a secret" and ends with "Save blocked.", **routines-codex/morning-brief/ does NOT exist on disk**
7. Stripe key secret blocks write — `sk_live_a{32}`, **disk NEVER touched**
8. same-runtime collision — pre-seeded directory → `fieldErrors.slug` contains "routines-codex/morning-brief/" + "Choose a different slug."
9. cross-runtime collision — seeded codex, attempted gemini → `fieldErrors.slug` contains "codex routine" + "unique across runtimes", **no partial writes in routines-gemini/**
10. gemini happy path — config.json + prompt.md in routines-gemini/
11. claude-routines happy path — SKILL.md in routines-cloud/; no warning field (only claude-desktop triggers warning)
12. FormData budget coercion — string "12345" → numeric 12345 in config.json

**checkSlugAvailability (4 blocks):**
13. available when slug absent
14. available on empty slug (permissive)
15. unavailable same-runtime — message contains "already exists" + "routines-codex/taken/"
16. unavailable cross-runtime — existsIn field names other runtime; message matches UI-SPEC copy

### dashboard/lib/bundles.ts (+1 char, commit `5505e32`)

Added `export` keyword to `const RUNTIME_ROOT: Record<Runtime, string>`. Enables actions.ts to compute `finalDir = path.join(RUNTIME_ROOT[runtime], slug)` without duplicating the table. bundles.test.ts unchanged; 18/18 still green.

## Deviations from Plan

**1. [Rule 3 — Blocking fix] Template-literal-in-JSDoc closed block comment mid-sentence**

- **Found during:** Task 2 typecheck (first run)
- **Issue:** The JSDoc for `checkSlugAvailability` contained the phrase `` `routines-*/` `` inside backticks. The `*/` sequence closed the surrounding JSDoc block comment early, causing `error TS1160: Unterminated template literal` at EOF.
- **Fix:** Rewrote to plain prose: `read-only against the routines-* directories.` No semantic change; only the comment text.
- **Files modified:** `dashboard/app/editor/actions.ts` (line 224)
- **Commit:** folded into `70cc247` (part of the Task 2 atomic commit)

**2. [Rule 2 — Auto-add missing critical functionality] Added 4 extra test blocks beyond the plan's 12-block minimum**

- **Found during:** Test authoring (RED phase)
- **Issue:** Plan listed a 12-block minimum, but the Q1-smoke-informed warning field, slug regex rejection path, FormData coercion path, and the "empty slug is permissive" semantics each warrant a dedicated regression test. Without them, future refactors could silently break any of these without a red test.
- **Fix:** Added:
  - `returns a manual-add warning on claude-desktop success (Q1 smoke)` — locks in the warning string + verifies it's ONLY on claude-desktop (the claude-routines happy-path test asserts `warning` is undefined)
  - `rejects invalid slug regex via zod` — covers EDIT-04 slug-regex requirement path through saveRoutine specifically (bundle-schema.test.ts covers the zod side in isolation)
  - `coerces FormData string budget through zod into numeric config` — regression-guards against someone refactoring zod's `z.coerce.number()` to a manual `Number(raw.budget)` that might silently accept `NaN`
  - `returns available when slug is empty (permissive)` — locks in the permissive-on-empty contract that the debounced client preview depends on
- **Files modified:** `dashboard/tests/save-routine-action.test.ts`
- **Commit:** `70cc247`

**No architectural (Rule 4) deviations. No pre-existing issues touched — `cloud-cache.ts`, `codex.ts`, `gemini.ts`, `cloud-cache.test.ts` from the parallel session remain in working tree untouched (verified via `git status` before commit; staged only the two new Plan 03-05 files plus the bundles.ts export).**

## Validation Matrix — 03-VALIDATION.md rows flipped

| Row | Requirement | Behavior | Task ID | Status |
|-----|-------------|----------|---------|--------|
| 7   | EDIT-02 | Secret in prompt → disk NEVER touched | 3-05-02 | ✅ green |
| 8   | EDIT-02 | Collision on save → no partial write | 3-05-02 | ✅ green |
| 9   | EDIT-02 | claude-desktop writes SKILL.md | 3-05-02 | ✅ green |
| 18  | EDIT-04 | checkSlugAvailability detects same-runtime collision | 3-05-02 | ✅ green |
| 19  | EDIT-04 | checkSlugAvailability detects cross-runtime collision | 3-05-02 | ✅ green |
| 21  | EDIT-04 | Cross-runtime: seeded codex + gemini attempt → rejected | 3-05-02 | ✅ green |

## Verification Evidence

```
$ grep -c "^\"use server\";" dashboard/app/editor/actions.ts
1

$ grep -c "scanForSecrets\|hasBundleAnyRuntime\|atomicWriteBundle\|RoutineBundleInput" dashboard/app/editor/actions.ts
11

$ cd dashboard && pnpm typecheck
> tsc --noEmit
(exit 0)

$ cd dashboard && pnpm test save-routine-action.test.ts
 ✓ tests/save-routine-action.test.ts (16 tests) 67ms
 Test Files  1 passed (1)
      Tests  16 passed (16)

$ cd dashboard && pnpm test
 Test Files  22 passed (22)
      Tests  221 passed (221)
```

## Self-Check: PASSED

- [x] `dashboard/app/editor/actions.ts` exists at the expected path
- [x] `dashboard/tests/save-routine-action.test.ts` exists at the expected path
- [x] `dashboard/lib/bundles.ts` contains `export const RUNTIME_ROOT`
- [x] Commit `5505e32` found (refactor RUNTIME_ROOT export)
- [x] Commit `70cc247` found (feat saveRoutine + tests)
- [x] `pnpm typecheck` exit 0
- [x] `pnpm test` 221/221 green (delta +16 vs 03-04 baseline 205)
- [x] `"use server"` directive confirmed on line 1
- [x] All 4 Wave 0/1 primitives imported + called (RoutineBundleInput, scanForSecrets, hasBundleAnyRuntime, atomicWriteBundle)
- [x] Q1-smoke warning field implemented + tested
- [x] Pre-existing unrelated changes (cloud-cache.ts, codex.ts, gemini.ts, cloud-cache.test.ts) NOT staged — verified via `git status --short` post-commit
