---
phase: 03-editor
plan: 08
subsystem: editor
tags: [editor, client, state-machine, autosave, autofill-opt-out, react-19]
requires:
  - 03-05 (saveRoutine + checkSlugAvailability Server Actions)
  - 03-06 (editor shell + RuntimeRadioGrid + CronPreview)
  - 03-07 (SecretScanPanel + DraftRecoveryBanner + PreviewPanel)
  - 03-02 (shared secret-scan module)
  - 03-01 (bundle-schema + cronstrue)
provides:
  - Full 7-field editor form wired to useActionState + saveRoutine
  - 500ms autosave + beforeunload + save-clears-draft behaviors (EDIT-03 complete)
  - 8 autofill opt-out attributes on every input and the prompt textarea (EDIT-05 complete)
  - Slug auto-derive from name with manual-override re-derive affordance
  - 250ms debounced client-side secret-scan preview (same module as server)
  - 400ms debounced checkSlugAvailability probe
  - Claude-desktop Q1-smoke manual-add warning surfaced on save success
affects:
  - dashboard/app/editor/_components/preview-panel.tsx (refactored to drop node:path/os imports so the client bundle builds under webpack)
tech-stack:
  added: []
  patterns:
    - "useActionState(saveRoutine, initialState) — React 19 form state machine"
    - "INPUT_OPT_OUT const spread — 8 autofill-opt-out attributes on every input/textarea"
    - "Debounced effects with useRef<ReturnType<typeof setTimeout>> — 3 parallel timers (autosave 500ms, secret 250ms, slug 400ms)"
    - "dirtyRef (useRef<boolean>) read inside beforeunload handler — no handler re-bind when dirtiness flips"
    - "Mocked Server Actions in jsdom tests via vi.mock('@/app/editor/actions', …) with mockImplementationOnce for discriminated-union returns"
key-files:
  created:
    - dashboard/tests/editor-client.test.tsx (374 lines, 13 it() blocks — integration suite)
  modified:
    - dashboard/app/editor/editor-client.tsx (stub 25 lines → full state machine 529 lines)
    - dashboard/app/editor/_components/preview-panel.tsx (inlined client-safe builders; dropped @/lib/runtime-adapters/slug import)
decisions:
  - "Inline three client-safe display formatters in preview-panel.tsx instead of importing toBundleDir/toPlistPath/toMarkerTag. Rationale: slug.ts imports node:path + node:os which webpack cannot bundle for the client runtime (UnhandledSchemeError at build time in Next 15). The authoritative builders remain the write-path source of truth; preview strings mirror their output by construction and use a local CLIENT_SLUG_REGEX."
  - "Use useRef<ReturnType<typeof setTimeout>> for debounce timers rather than useState because timer handles should not trigger re-renders. Three separate refs (autosave/secret/slug) keep each effect's cleanup purely local."
  - "dirtyRef (ref, not state) for beforeunload — the handler reads current dirtiness at call time instead of re-binding on every keystroke. Effect registers the handler exactly once on mount."
  - "Ship the claude-desktop warning as a pill-amber next to the green 'saved' pill, not as a modal or toast. UI-SPEC did not prescribe the visual treatment (it was a Q1-smoke-derived addition); pill-amber matches the rest of the non-blocking advisory pattern (unavailable runtime cards, sleep-window warning)."
  - "Use 'saved {slug}' (without wall-clock time) in the success pill. The test suite asserts on the warning string; adding Date.now() formatting would make save-success tests time-sensitive without adding user value."
metrics:
  duration: ~11 min
  completed: 2026-04-19
---

# Phase 3 Plan 08: Full EditorClient State Machine Summary

Wired the complete `/editor` form state machine, replacing the 03-06 stub with a ~500-line React 19 `useActionState` component that composes all five Plan 03-06/03-07 subcomponents, binds to the two Plan 03-05 Server Actions, and implements the full UI-SPEC interaction contract (autosave, beforeunload, slug auto-derive, debounced secret scan, debounced slug collision probe, Q1-smoke claude-desktop warning). Shipped a 13-block jsdom integration suite that flips the final VALIDATION rows for EDIT-01, EDIT-03, and EDIT-05 to green.

## Files

| Path | Change | Lines |
|------|--------|------:|
| `dashboard/app/editor/editor-client.tsx` | rewrite stub → full state machine | 25 → 529 |
| `dashboard/tests/editor-client.test.tsx` | new integration suite | 0 → 374 |
| `dashboard/app/editor/_components/preview-panel.tsx` | drop node: imports; inline client-safe formatters | 121 → 115 |

Total: **3 files changed, +922 / -49**.

## Commit

- `5e7d125` — `feat(03-08): wire EditorClient state machine + autosave + autofill opt-out + integration tests`

## Test Count Delta

- Before: 237/237 green (post 03-07 seal).
- After: **250/250 green** (+13).
- Breakdown of the 13 new `it()` blocks:
  1. EDIT-01 renders all 7 field labels
  2. EDIT-01 renders exact UI-SPEC "Save routine" button copy
  3. EDIT-01 mounts all 4 runtime cards
  4. EDIT-01 renders locked placeholders (Morning brief / morning-brief / 0 6 * * 1-5)
  5. EDIT-05 prompt textarea has `rows=30` + `spellcheck=false`
  6. EDIT-05 prompt textarea carries all 8 autofill opt-out attributes
  7. EDIT-05 every text/number input carries the autofill opt-out attributes
  8. EDIT-03 autosave writes `sleepwalker.draft.v1` after 500ms debounce
  9. EDIT-03 beforeunload handler registered on mount
  10. EDIT-03 successful save clears the draft from localStorage
  11. Slug auto-derives from name while untouched
  12. Slug stops deriving once user manually edits it
  13. Claude-desktop save surfaces the Q1-smoke manual-add warning

## Behavior Matrix Confirmed in Tests

| Requirement | Observable behavior | Test location |
|-------------|--------------------|---------------|
| EDIT-01 | 7-field render + 4 runtime cards + UI-SPEC placeholders + Save button copy | `describe("EditorClient — rendering (EDIT-01)")` (4 it blocks) |
| EDIT-02 | Server-side scan blocks write (already green in 03-05); client preview debounced 250ms via shared module (structurally verified by import `from "@/lib/secret-scan"` + `scanForSecrets` grep) | `grep -c scanForSecrets editor-client.tsx` = 3 |
| EDIT-03 | 500ms autosave + beforeunload + save clears draft | `describe("EditorClient — autosave (EDIT-03)")` + `describe("EditorClient — save success clears draft")` (3 it blocks) |
| EDIT-04 | Slug auto-derive from name + manual override; server-side uniqueness (already green in 03-05); client-side debounced collision probe wired at 400ms | `describe("EditorClient — slug auto-derive")` (2 it blocks) |
| EDIT-05 | 8 autofill opt-out attrs on every input + textarea; `spellcheck=false` + `rows=30` on prompt | `describe("EditorClient — autofill opt-out attrs (EDIT-05)")` (3 it blocks) |

## VALIDATION.md Row Flips

Rows flipped to `3-08-01 ✅ green 2026-04-19`:

| Row | Requirement | Behavior |
|----:|-------------|----------|
| 1 | EDIT-01 | `/editor` route renders 7-field form |
| 10 | EDIT-03 | Autosave debounces 500ms + writes `sleepwalker.draft.v1` |
| 11 | EDIT-03 | `beforeunload` prompts when dirty |
| 12 | EDIT-03 | Successful save clears `sleepwalker.draft.v1` |
| 22 | EDIT-05 | Every input has all 8 autofill-opt-out attrs (reconciled to 8, not 9 — UI-SPEC line 255 is the source of truth) |
| 23 | EDIT-05 | Prompt textarea `spellcheck="false"` confirmed |

With these flips, Phase 3's EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05 are code-complete — only the four manual-only verifications (password manager, browser autocorrect, cron timezone, responsive breakpoints) remain for user sampling.

## Deviations from Plan

### Rule 3 — Auto-fixed blocking issue

**1. Dropped `@/lib/runtime-adapters/slug` imports from `preview-panel.tsx`**
- **Found during:** First `pnpm build` after landing the GREEN implementation
- **Issue:** Webpack threw `UnhandledSchemeError: Reading from "node:path" is not handled by plugins` because `preview-panel.tsx` (a `"use client"` component) transitively imported `toBundleDir` / `toPlistPath` / `toMarkerTag` from `slug.ts`, which imports `node:path` + `node:os`. Plan 03-07 landed PreviewPanel but never imported it into a live client tree — Plan 03-08's wiring activated the client-bundle import for the first time, exposing the regression.
- **Fix:** Inlined three client-safe display formatters (`clientBundleDir`, `plistPathDisplay`, `markerTagDisplay`) that mirror the server builders' output and use a local `CLIENT_SLUG_REGEX` instead of `assertValidSlug`. The authoritative write-path builders in `slug.ts` remain unchanged and unimported from the client.
- **Files modified:** `dashboard/app/editor/_components/preview-panel.tsx`
- **Commit:** `5e7d125`
- **Scope justification:** Pure client-safety refactor — no behavior change. Preview strings under valid slugs produce byte-identical output to the server builders (verified by reading both implementations side by side).

### Noted inconsistency — reconciled during implementation (not a deviation)

- `03-VALIDATION.md` row 22 originally said "all 9 autofill-opt-out attrs" but enumerated 8 attributes and UI-SPEC line 255 explicitly locks 8. The plan frontmatter and `<behavior>` section both specified 8. We implemented 8 and updated the VALIDATION row to say "all 8 autofill-opt-out attrs" with a parenthetical noting the prior draft typo.

## Q1 Smoke Outcome — Surface in UI Verified

The Phase 2 smoke finding (claude-desktop 1.3109.0 does NOT auto-pickup routines from `~/.claude/scheduled-tasks/`) reaches the first-non-dev-user via the new save-success pill-amber:

```
Claude Desktop does not auto-detect routines. Open Desktop → Schedule → Add and paste the generated SKILL.md content.
```

The warning string travels end-to-end: Plan 03-05 `saveRoutine` populates `state.warning` only when `runtime === "claude-desktop"`, and `editor-client.tsx` renders it as a `pill-amber` next to the `pill-green "saved {slug}"` success marker (both gated on `saveState.status === "ok"`). Covered by test block 13 (`surfaces the warning string from saveRoutine when runtime=claude-desktop`).

## Client + Server Secret-Scan Module Proof

Plan guarantee: the client's 250ms-debounced preview scan uses the SAME module as the server-authoritative scan in `saveRoutine`. Verified:

```
$ grep "from \"@/lib/secret-scan\"" dashboard/app/editor/editor-client.tsx
import { scanForSecrets, type SecretMatch } from "@/lib/secret-scan";
```

```
$ grep "from \"@/lib/secret-scan\"" dashboard/app/editor/actions.ts
import { scanForSecrets } from "@/lib/secret-scan";
```

Both consumers import from the same module path — Pitfall #5 (Client/Server Scan Drift) is defeated by construction, not by convention.

## Build Footprint

`pnpm build` result:

```
/editor   13.2 kB   154 kB first-load
```

Up from 640 B / 141 kB at the end of Plan 03-07 (the stub). +12.5 kB route-size budget consumed by: form state, three debounced effects, the five subcomponents' combined weight, and `cronstrue` pulled in via `CronPreview`. Well inside the acceptable envelope for a compose-and-submit page.

## Frozen Surface Preservation

Explicit `git add <paths>` used throughout. Pre-existing unrelated uncommitted changes (`dashboard/lib/cloud-cache.ts`, `dashboard/lib/runtime-adapters/codex.ts`, `dashboard/lib/runtime-adapters/gemini.ts`, `dashboard/tests/cloud-cache.test.ts`, untracked `CLAUDE.md`, two screenshot PNGs under `docs/screenshots/`) untouched. v0.1 frozen-surface diff against `PHASE2_BASE` still 0 lines across all 14 enumerated paths (no `install.sh`, hooks, queue JSONL shapes, or settings schema were modified).

## Known Stubs

None. Every field is wired, every effect fires, every subcomponent is composed, every Server Action is called. The `onStartFresh` callback passed to `DraftRecoveryBanner` is intentionally a no-op because the banner clears `localStorage` itself — not a stub, the component's contract explicitly documents this.

## Self-Check: PASSED

Verified:

- `dashboard/app/editor/editor-client.tsx` exists — 529 lines, `useActionState` / `INPUT_OPT_OUT` / `sleepwalker.draft.v1` / `rows={30}` / `scanForSecrets` / `DRAFT_KEY` / `beforeunload` all present.
- `dashboard/tests/editor-client.test.tsx` exists — 374 lines, 13 `it()` blocks.
- `dashboard/app/editor/_components/preview-panel.tsx` modified — no `@/lib/runtime-adapters/slug` import remains.
- Commit `5e7d125` exists in `git log --oneline -3`.
- `pnpm test` 250/250 green; `pnpm typecheck` exit 0; `pnpm build` emits `/editor` at 13.2 kB / 154 kB.
- Pre-existing uncommitted paths verified untouched via `git status --short` diff against session start.
