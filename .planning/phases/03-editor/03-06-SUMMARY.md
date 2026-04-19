---
phase: 03-editor
plan: 06
subsystem: editor/shell-presentational
tags: [editor, ui, shell, presentational, jsdom, EDIT-01]
requires:
  - "@/lib/runtime-adapters :: healthCheckAll (Phase 2 Plan 02-09)"
  - "@/lib/runtime-adapters/types :: HealthStatus + HealthStatus.warning + Runtime"
  - "@/lib/bundles :: listBundles (Plan 03-03)"
  - "../_components/page-header :: PageHeader (v0.1)"
  - "cronstrue@3.14.0 (live cron human-preview)"
  - "clsx@2.1.1 (conditional class composition)"
  - "lucide-react (Cloud / Workflow / ScrollText / ListChecks / AlertCircle icons)"
  - "@testing-library/react + @testing-library/user-event + jsdom (first jsdom tests in repo)"
provides:
  - dashboard/app/editor/page.tsx :: EditorPage (async Server Component)
  - dashboard/app/editor/editor-client.tsx :: EditorClient (stub — Plan 03-08 replaces)
  - dashboard/app/editor/_components/runtime-radio-grid.tsx :: RuntimeRadioGrid (2x2 radio-card grid)
  - dashboard/app/editor/_components/cron-preview.tsx :: CronPreview (aurora pill / red error)
affects:
  - Plan 03-07 (secret-scan panel + draft-recovery banner + preview panel — imports the same editor-client stub surface)
  - Plan 03-08 (full EditorClient state machine — replaces editor-client.tsx wholesale; imports RuntimeRadioGrid + CronPreview verbatim)
tech-stack-added:
  - "esbuild jsx=automatic in vitest.config.ts — enables JSX in .test.tsx without manual React import (React 19 automatic runtime)"
tech-stack-patterns:
  - "Server Component as data-fetch shell — page.tsx awaits healthCheckAll() + listBundles() then passes static snapshots into a Client Component"
  - "HealthStatus[] -> Record<Runtime, HealthStatus> reshape at the page boundary — child components index by runtime key, healthCheckAll() returns a positional array"
  - "Presentational client components — runtime-radio-grid + cron-preview are stateless/controlled; all state lives in the Plan 03-08 EditorClient"
  - "user-event over fireEvent for disabled-input assertions — fireEvent.click bypasses the disabled attribute in jsdom; user-event models real browser dispatch"
  - "afterEach(cleanup) in every jsdom test file — @testing-library/react does not auto-cleanup under vitest unless the global setup opts in; explicit cleanup keeps subsequent render() calls from accumulating DOM"
  - "Stub-first shell — editor-client.tsx is a minimal placeholder so /editor renders green through Waves 2a/2b; Plan 03-08 swaps it for the full form state machine"
key-files-created:
  - dashboard/app/editor/page.tsx (29 lines)
  - dashboard/app/editor/editor-client.tsx (26 lines — stub; Plan 03-08 replaces)
  - dashboard/app/editor/_components/runtime-radio-grid.tsx (96 lines)
  - dashboard/app/editor/_components/cron-preview.tsx (31 lines)
  - dashboard/tests/runtime-radio-grid.test.tsx (128 lines)
  - dashboard/tests/cron-preview.test.tsx (43 lines)
key-files-modified:
  - dashboard/vitest.config.ts (+4 lines — esbuild.jsx="automatic")
key-decisions:
  - "page.tsx reshapes HealthStatus[] into Record<Runtime, HealthStatus> at the boundary — healthCheckAll() returns an array (positional), but the RuntimeRadioGrid + future editor components index by runtime string. Reshape lives in the Server Component so every client consumer gets the pre-indexed record."
  - "editor-client.tsx is a stub with a data-testid='editor-client-stub' so /editor renders and typecheck stays clean through Plan 03-06 + 03-07; Plan 03-08 replaces wholesale with the full useActionState form + autosave + draft-recovery."
  - "RuntimeRadioGrid CARDS array is the single source of truth for the four UI-SPEC titles + descriptions + lucide icon picks (Cloud / Workflow / ScrollText / ListChecks). Cards order matches the UI-SPEC line 143-152 table row order."
  - "HealthStatus.warning is rendered as pill-amber inline with AlertCircle icon when available=true && warning is non-empty — matches the UI-SPEC rule that warning is non-blocking and visually distinct from the unavailable 'opacity-40 + reason' state."
  - "Disabled input tooltip uses the 'See AUTHORING.md -> Runtime setup.' suffix from UI-SPEC line 152 — rendered via the native title attribute on the amber pill so hovering the reason surfaces the setup pointer without needing a custom tooltip component."
  - "CronPreview does a pre-split field-count guard before calling cronstrue.toString — '0 6 * *' (4 fields) routes to the exact UI-SPEC error string rather than a cronstrue-internal message, so the UX copy is deterministic across cronstrue versions."
  - "cronstrue is called with use24HourTimeFormat=true and verbose=false — matches the UI-SPEC sample 'Runs at 06:00 AM, Monday through Friday' (24h time) and keeps the pill short enough to fit in the preview column."
  - "vitest.config.ts gets esbuild.jsx='automatic' rather than requiring 'import React' at the top of every .test.tsx — one-line config change scales to every future jsdom test (Plan 03-07 draft-recovery banner, Plan 03-08 editor-client state machine, any Phase 4+ client tests)."
metrics:
  duration-minutes: 8
  completed: 2026-04-19
  tasks: 3
  commits: 3
  test-count-delta: "+10 (221 -> 231)"
  line-count: "363 insertions (29 page + 26 stub + 96 grid + 31 preview + 128 grid-test + 43 preview-test + 4 vitest config + 6 commit-trailer removals)"
---

# Phase 3 Plan 03-06: /editor shell + RuntimeRadioGrid + CronPreview Summary

**One-liner:** Ships the `/editor` Server Component shell (page.tsx + editor-client stub) and the first two presentational sub-components (RuntimeRadioGrid with 2x2 health-aware cards; CronPreview with cronstrue-driven aurora pill + deterministic UI-SPEC error). First jsdom tests in the repo — 10 new `it()` blocks across two `.test.tsx` files; vitest config now uses React 19's automatic JSX runtime so future client tests need no manual React import.

## What Shipped

### dashboard/app/editor/page.tsx (29 lines, commit `f343478`)

Async Server Component with `export const dynamic = "force-dynamic"` (matches the settings/page.tsx precedent for routes that touch process state each request).

```tsx
const healthArray = await healthCheckAll();              // HealthStatus[]
const healthStatuses = healthArray.reduce<Record<Runtime, HealthStatus>>(
  (acc, status) => { acc[status.runtime] = status; return acc; },
  {} as Record<Runtime, HealthStatus>,
);
const existingSlugs = listBundles().map((b) => `${b.runtime}/${b.slug}`);
```

Then renders:
- `<PageHeader eyebrow="AUTHORING" title="Author a routine" subtitle="Write a prompt, pick a runtime, pick a schedule. Save writes a validated bundle to disk." />`
- `<EditorClient healthStatuses={...} existingSlugs={...} />`

All three header strings match UI-SPEC lines 121-123 verbatim.

### dashboard/app/editor/editor-client.tsx (26 lines, commit `f343478`)

Stub Client Component. Accepts the full `{healthStatuses: Record<Runtime, HealthStatus>; existingSlugs: string[]}` prop surface so Plan 03-08 can replace the component body without changing the page.tsx call site. Renders `<div data-testid="editor-client-stub" className="text-xs text-moon-600">editor-client pending plan 03-08</div>` — visually unobtrusive, makes the route legibly "under construction" during Waves 2a/2b.

### dashboard/app/editor/_components/runtime-radio-grid.tsx (96 lines, commit `92e8313`)

Presentational Client Component. Single `CARDS` readonly array is the source of truth for the four UI-SPEC cards (Claude Routines / Claude Desktop / Codex Pro / Gemini CLI Pro) with their one-line descriptions and lucide icon choices (`Cloud` / `Workflow` / `ScrollText` / `ListChecks`).

Per-card render logic:
- Selected → `panel-raised ring-1 ring-dawn-400`
- Unavailable → `opacity-40 cursor-not-allowed` + `disabled` on the radio input + `pill-amber` showing `status.reason` + `title` attribute appending `See AUTHORING.md -> Runtime setup.`
- Available + no warning → `pill-green` with text `Ready`
- Available + warning → `pill-amber` with `AlertCircle` icon + `status.warning` text

Radio inputs are `className="sr-only"` inside `<label>` wrappers — keyboard users tab through the invisible radios while the label surface is the visible hit target. The `<div>` parent is `role="radiogroup" aria-label="Runtime"` for screen-reader grouping.

### dashboard/app/editor/_components/cron-preview.tsx (31 lines, commit `f302d3d`)

Pure function component. Splits the trimmed expression on whitespace; if field count != 5, returns `<span className="text-xs text-signal-red">Invalid cron — 5 fields required (minute hour day month weekday).</span>` (UI-SPEC line 159 verbatim). Otherwise calls `cronstrue.toString(trimmed, { verbose: false, use24HourTimeFormat: true })` inside try/catch — a thrown cronstrue error falls back to the same UI-SPEC error string. Success branch renders `<span className="pill-aurora">Runs {parsed}</span>`.

### dashboard/tests/runtime-radio-grid.test.tsx (128 lines, commit `92e8313`)

6 `it()` blocks (plan minimum was 6):
1. **renders 4 cards with exact UI-SPEC titles** — `getByText` each of "Claude Routines" / "Claude Desktop" / "Codex Pro" / "Gemini CLI Pro"
2. **marks unavailable runtime with opacity-40 and disabled input** — closest `<label>` className contains `opacity-40`; `input[value="codex"]` is `disabled`; reason text "codex not on PATH" renders
3. **adds ring-1 ring-dawn-400 to selected card** — label className matches `/ring-1/` + `/ring-dawn-400/`
4. **renders pill-amber for HealthStatus.warning** — "Auth conflict" text visible
5. **calls onChange with runtime when available card clicked** — `fireEvent.click` on input triggers `onChange("codex")`
6. **does not call onChange when disabled card clicked** — `userEvent.click` on disabled input does NOT trigger handler (user-event respects disabled; fireEvent bypasses it)

### dashboard/tests/cron-preview.test.tsx (43 lines, commit `f302d3d`)

4 `it()` blocks:
1. **renders pill-aurora with 'Runs …' on valid cron** — `0 6 * * 1-5` → `.pill-aurora` element whose textContent starts with `Runs `
2. **renders exact UI-SPEC error on empty expression** — `getByText` the full error literal; `.text-signal-red` class present
3. **renders error on 4-field cron** — `0 6 * *` hits the pre-split guard
4. **renders Runs-prefix on midnight cron** — `0 0 * * *` → `.pill-aurora` with `Runs` prefix

### dashboard/vitest.config.ts (+4 lines, commit `92e8313`)

Added:
```ts
esbuild: {
  jsx: "automatic",
},
```

React 19's automatic JSX runtime means `.test.tsx` files compile without `import React from "react"`. Without this, esbuild defaults to the classic pragma and vitest fails with `ReferenceError: React is not defined` on every JSX expression. One-line config change scales across Plans 03-07, 03-08, and every Phase 4+ client test.

## Deviations from Plan

**1. [Rule 3 — Blocking fix] Vitest esbuild missing React 19 automatic JSX runtime**

- **Found during:** Task 2 GREEN phase (first RuntimeRadioGrid test run)
- **Issue:** With default esbuild settings, `.test.tsx` files compiled to the classic JSX pragma (`React.createElement`), which then failed at runtime with `ReferenceError: React is not defined`. All 6 tests failed identically.
- **Fix:** Added `esbuild: { jsx: "automatic" }` to `vitest.config.ts`. React 19's automatic runtime compiles JSX to `jsx-runtime` imports that the bundler resolves automatically — no manual `import React` needed.
- **Files modified:** `dashboard/vitest.config.ts`
- **Commit:** folded into `92e8313` (Task 2 atomic commit)
- **Why auto-fix (not architectural):** Plan 03-01 established the jsdom + testing-library test harness but Waves 0/1 produced no `.test.tsx` files yet, so the React 19 JSX pragma gap was latent. Plan 03-06 is where it surfaces. A one-line config addition is the minimum fix and scales to every future client test.

**2. [Rule 2 — Auto-add missing critical functionality] `afterEach(cleanup)` in every jsdom test file**

- **Found during:** Task 2 GREEN phase (second test run)
- **Issue:** Without explicit cleanup, two consecutive `render()` calls in the same file left the prior DOM in place, so the third test crashed with `Found multiple elements with the text: Codex Pro`. `@testing-library/react` v16 does not auto-register its afterEach hook under vitest unless `globals: true` is enabled.
- **Fix:** Added `import { afterEach } ... afterEach(cleanup)` to both new test files.
- **Files modified:** `dashboard/tests/runtime-radio-grid.test.tsx`, `dashboard/tests/cron-preview.test.tsx`
- **Commit:** folded into each test's atomic commit (`92e8313`, `f302d3d`)
- **Why auto-fix:** Every jsdom test file needs this; adding it inline is cheaper than a setup file and keeps each test file self-contained.

**3. [Rule 2 — Auto-add missing critical functionality] `userEvent` for disabled-click assertion**

- **Found during:** Task 2 GREEN phase (third test run)
- **Issue:** `fireEvent.click(disabledInput)` still triggered the React synthetic `onChange` in jsdom — `fireEvent` dispatches a synthetic event directly without modeling the browser's "do-not-dispatch-on-disabled" behavior. The "does not call onChange when disabled card clicked" assertion therefore failed with the handler called once.
- **Fix:** Switched that one assertion to `userEvent.setup().click(disabledInput)`. `@testing-library/user-event` models real dispatch semantics and honors `disabled` exactly like Chromium/WebKit.
- **Files modified:** `dashboard/tests/runtime-radio-grid.test.tsx`
- **Commit:** `92e8313`
- **Why auto-fix:** The plan's behavior contract was "clicking a disabled radio does NOT call onChange" — the fix preserves that contract with the correct testing primitive. `fireEvent` remains the right tool for the available-click assertion because it's fast and the disabled short-circuit isn't in play there.

**4. [Rule 2 — Auto-add missing critical functionality] `role="radiogroup" aria-label="Runtime"` on the grid container**

- **Found during:** Component authoring (GREEN)
- **Issue:** The plan's JSX skeleton did not include an ARIA group role, but the UI-SPEC implies a coherent radio group (the radios share `name="runtime"` and visually cluster). WCAG 2.1 AA requires grouped form controls have an accessible name.
- **Fix:** Added `role="radiogroup" aria-label="Runtime"` to the `<div className="grid grid-cols-2 gap-4">` wrapper.
- **Files modified:** `dashboard/app/editor/_components/runtime-radio-grid.tsx`
- **Commit:** `92e8313`
- **Why auto-fix:** Explicit ARIA role adds zero visual weight and makes the grid announce correctly to screen readers; matches the CLAUDE.md UI-dev rule "All interactive elements must be keyboard accessible (WCAG 2.1 AA)."

**5. [Rule 2 — Auto-add missing critical functionality] `title` attribute with UI-SPEC "See AUTHORING.md -> Runtime setup." suffix**

- **Found during:** Component authoring (GREEN)
- **Issue:** UI-SPEC line 152 specifies: `Disabled-runtime tooltip (amber pill + hover): {reason}. See AUTHORING.md → Runtime setup.`. The plan's action block rendered the reason but did not wire up the hover tooltip.
- **Fix:** Added `title={${status?.reason ?? "Unavailable."} See AUTHORING.md → Runtime setup.}` on the amber pill for unavailable cards. Native `title` is the zero-dependency way to meet the UI-SPEC hover contract; Plan 03-07 or later may upgrade to a custom tooltip component.
- **Files modified:** `dashboard/app/editor/_components/runtime-radio-grid.tsx`
- **Commit:** `92e8313`

**No architectural (Rule 4) deviations.** Pre-existing uncommitted changes in `cloud-cache.ts`, `codex.ts`, `gemini.ts`, `cloud-cache.test.ts` from the parallel session remain untouched in the working tree — verified via `git status --short` before every commit; staged only the specific plan 03-06 paths.

## Validation Matrix — 03-VALIDATION.md rows flipped

| Row | Requirement | Behavior | Task ID | Status |
|-----|-------------|----------|---------|--------|
| 2   | EDIT-01 | Unavailable runtimes dimmed with fix-tooltip | 3-06-02 | green |
| 3   | EDIT-01 | Cron input shows cronstrue preview | 3-06-03 | green |

Row 1 (`/editor` renders form with 7 fields) stays `pending` — it depends on Plan 03-08 replacing the editor-client stub with the full form state machine. The page-shell rendering portion is live, but the "7 fields" contract is a Plan 03-08 obligation.

## Verification Evidence

```
$ cd dashboard && pnpm typecheck
> tsc --noEmit
(exit 0)

$ cd dashboard && pnpm test
 Test Files  24 passed (24)
      Tests  231 passed (231)

$ cd dashboard && pnpm build
Route (app)                              Size     First Load JS
├ ƒ /editor                              640 B           141 kB
(exit 0)

$ grep -c "healthCheckAll" dashboard/app/editor/page.tsx
2

$ grep -c "AUTHORING" dashboard/app/editor/page.tsx
1

$ grep -c "Author a routine" dashboard/app/editor/page.tsx
1

$ grep -c "Claude Routines\|Claude Desktop\|Codex Pro\|Gemini CLI Pro" dashboard/app/editor/_components/runtime-radio-grid.tsx
4

$ grep -c "Invalid cron — 5 fields required" dashboard/app/editor/_components/cron-preview.tsx
1
```

## Test-Count Evolution

| Milestone | Dashboard suite |
|-----------|-----------------|
| After Plan 03-05 | 221 passed |
| After Plan 03-06 Task 2 (RuntimeRadioGrid + 6 tests) | 227 passed |
| After Plan 03-06 Task 3 (CronPreview + 4 tests) | **231 passed** |

Net +10 blocks across two `.test.tsx` files — the first jsdom tests in the repository.

## Commits

| Task | Commit | Files | Lines |
|------|--------|-------|-------|
| 1 — page.tsx shell + editor-client stub | `f343478` | 2 | +55 |
| 2 — RuntimeRadioGrid + 6 jsdom tests + vitest.config | `92e8313` | 3 | +234 |
| 3 — CronPreview + 4 jsdom tests | `f302d3d` | 2 | +74 |

All 3 commits use the conventional format `feat(03-06): ...` with no AI attribution (per CLAUDE.md).

## Known Stubs

| File | Stub | Reason | Resolved by |
|------|------|--------|-------------|
| `dashboard/app/editor/editor-client.tsx` | Renders "editor-client pending plan 03-08" placeholder | Plan 03-06 ships the shell + presentational subcomponents only; the full form state machine (useActionState wiring against `saveRoutine`, autosave, draft-recovery banner, secret-scan panel, slug auto-derive) is Plan 03-08's scope. Plan 03-07 lands additional presentational panels on top of this same stub. | Plan 03-08 replaces editor-client.tsx wholesale |

The stub is intentional and documented in the plan frontmatter (`must_haves.artifacts`). The route is already wired to the Plan 03-05 `saveRoutine` Server Action indirectly — page.tsx instantiates EditorClient which Plan 03-08 will upgrade to bind the form. v0.2 scope is not blocked; next-plan dependency is explicit.

## Cross-references

- UI-SPEC §Copywriting Contract lines 121-123 (page header) — matched verbatim
- UI-SPEC §Runtime picker copy lines 143-152 (four-card titles + descriptions + tooltip suffix) — matched verbatim
- UI-SPEC §Runtime radio-card grid lines 245-251 (2x2, panel, selected ring, opacity-40 unavailable, 88x80 touch target) — matched
- UI-SPEC §Live-preview copy line 159 (Cronstrue invalid exact message) — matched verbatim
- PATTERNS §page.tsx lines 277-316 — Server Component shape adopted
- PATTERNS §runtime-radio-grid.tsx lines 417-439 — card composition adopted
- PATTERNS §cron-preview.tsx lines 443-460 — try/catch + field-count guard adopted
- CONTEXT.md — HealthStatus.warning (added Phase 2 Plan 02-09) now has its first UI surface

## Self-Check: PASSED

- [x] `dashboard/app/editor/page.tsx` — FOUND (29 lines)
- [x] `dashboard/app/editor/editor-client.tsx` — FOUND (26 lines, stub)
- [x] `dashboard/app/editor/_components/runtime-radio-grid.tsx` — FOUND (96 lines)
- [x] `dashboard/app/editor/_components/cron-preview.tsx` — FOUND (31 lines)
- [x] `dashboard/tests/runtime-radio-grid.test.tsx` — FOUND (128 lines, 6 it blocks green)
- [x] `dashboard/tests/cron-preview.test.tsx` — FOUND (43 lines, 4 it blocks green)
- [x] Commit `f343478` — in git log
- [x] Commit `92e8313` — in git log
- [x] Commit `f302d3d` — in git log
- [x] `pnpm typecheck` exit 0
- [x] `pnpm test` 231/231 green
- [x] `pnpm build` `/editor` route compiles (640 B / 141 kB first-load)
- [x] Pre-existing uncommitted paths (cloud-cache.ts / codex.ts / gemini.ts / cloud-cache.test.ts) untouched
