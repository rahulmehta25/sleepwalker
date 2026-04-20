---
phase: 05-queue
plan: 02
subsystem: queue ui — pill-codex + pill-gemini Tailwind utility classes (QUEU-02 producer)
tags: [queue, ui, pill, css, tailwind, additive, wave-0]
status: complete
requires: []
provides:
  - .pill-codex utility class in dashboard/app/globals.css @layer components (bg-aurora-500/10 text-aurora-400 border border-aurora-500/30)
  - .pill-gemini utility class in dashboard/app/globals.css @layer components (bg-dawn-400/10 text-dawn-400 border border-dawn-400/30)
  - Canonical pill names (not legacy aliases) — consumer branches in Wave 3 key off "codex" / "gemini" source literals
affects:
  - 05-07 (Wave 3 queue-client.tsx UI source branch — maps source === "codex" / "gemini" → the respective pill classes; jsdom render assertion lives there per plan objective)
tech-stack:
  added: []
  patterns:
    - Tailwind @apply-over-palette-token pattern — byte-for-byte mirror of the existing .pill-green/.pill-amber/.pill-red/.pill-aurora macro shape (bg-<color>/10 text-<color> border border-<color>/<opacity>)
    - Canonical-name vs legacy-alias discipline — new pills placed immediately after .pill-aurora and before the legacy alias block (.pill-yellow / .pill-stone / .pill-blue / .pill-rose) so the 4 canonical color pills stay contiguous
    - Zero-test-file CSS utility plan — PLAN.md objective explicitly states "No test file change in this plan — CSS utility classes don't need unit tests; Wave 3's jsdom render test covers the class attachment"
key-files:
  created: []
  modified:
    - dashboard/app/globals.css (+2/-0 lines — two new .pill-* utility declarations inserted at lines 78-79 inside @layer components)
decisions:
  - "Followed PLAN.md must_haves frontmatter verbatim for token selection, NOT the earlier hint in PATTERNS.md §QUEU-02 (which suggested bg-signal-amber for pill-gemini). PLAN.md is the authoritative source — it was authored later, explicitly references RESEARCH §4.3 contrast math, and locks aurora-500 (pill-codex) + dawn-400 (pill-gemini) as the palette anchors. CONTEXT.md §Source-pills-UI block also originally suggested a different combination (aurora-500 bg with ink-200 text for codex; signal-amber bg with ink-900 text for gemini); RESEARCH §4.3 supersedes both earlier references with measured contrast math on the final token pair. PATTERNS.md retains its earlier draft for historical traceability but is not authoritative for this plan's execution."
  - "No new palette tokens added to tailwind.config.js — both `aurora.500` (#5a82f5, line 29) and `dawn.400` (#f3c282, line 23) pre-exist as part of the lunar/celestial palette. Palette audit confirmed via `grep '500:|400:' dashboard/tailwind.config.js`. RESEARCH §4.2 claim validated."
  - "Insertion point is after .pill-aurora (line 77) and before .pill-muted (line 80), NOT at the end of the @layer components block. Rationale: the 4 canonical color pills (green/amber/red/aurora) are contiguous in the v0.1 source; adding codex + gemini IMMEDIATELY after aurora keeps the 6 canonical color pills contiguous before the muted + legacy-alias block begins. awk ordering guard validates `aurora=77 < codex=78 < gemini=79 < muted=80` — ORDER_OK."
  - "Zero new test files landed. PLAN.md objective explicitly states CSS utility classes don't need unit tests and Wave 3 Plan 05-07 owns the jsdom class-attachment assertion via queue-client render tests. This is NOT a deviation — it is the plan's stated design. Dashboard suite stays 339/339 green across 38 files (no delta from 05-01 seal)."
metrics:
  duration: "~5m (2026-04-20 07:04Z → 07:09Z)"
  tasks-completed: 1/1
  files-created: 0
  files-modified: 1
  test-delta: "339 → 339 (pure CSS plan; no new tests by design per PLAN.md objective)"
  commits: 1
  commit-shas: [548d432]
  date-completed: 2026-04-20
---

# Phase 5 Plan 02: pill-codex + pill-gemini Utility Classes — Summary

**One-liner:** Added two new Tailwind utility classes `.pill-codex` (bg-aurora-500/10, deeper blue than cloud's aurora-400, ~7.8:1 WCAG AA on ink-900) and `.pill-gemini` (bg-dawn-400/10, warm highlight, ~11.0:1 WCAG AA on ink-900) to `dashboard/app/globals.css` inside `@layer components`, placed between `.pill-aurora` and `.pill-muted` so the 6 canonical color pills stay contiguous before the legacy alias block. Pure CSS — zero new palette tokens, zero new deps, zero JSX changes, zero new test files. Wave 3 Plan 05-07 wires them into `queue-client.tsx` and owns the jsdom render assertion.

## Objective (as planned)

Add two new Tailwind utility classes `.pill-codex` and `.pill-gemini` to `dashboard/app/globals.css` inside the existing `@layer components` block (QUEU-02). Pure CSS — zero new dependencies, zero new palette tokens, zero JSX changes in this plan. The classes follow the canonical `.pill-green / .pill-aurora` shape byte-for-byte so the visual language stays consistent.

Purpose: The Morning Queue needs distinct visual treatment for Codex and Gemini supervisor-run entries in Wave 3 (Plan 05-07 consumes these classes). Landing them in Wave 0 in isolation means the pill palette is git-reviewable on its own and downstream plans can reference stable class names.

## Implementation

### Task 1 — Insert `.pill-codex` + `.pill-gemini` utility classes into `dashboard/app/globals.css`

Replaced `dashboard/app/globals.css` lines 77-78 (before-state) with lines 77-80 (after-state):

```css
/* Before (v0.1): */
.pill-aurora { @apply pill bg-aurora-400/10   text-aurora-400   border border-aurora-400/20; }
.pill-muted  { @apply pill bg-ink-600/50      text-moon-400     border border-ink-600; }

/* After (this plan): */
.pill-aurora { @apply pill bg-aurora-400/10   text-aurora-400   border border-aurora-400/20; }
.pill-codex  { @apply pill bg-aurora-500/10   text-aurora-400   border border-aurora-500/30; }
.pill-gemini { @apply pill bg-dawn-400/10     text-dawn-400     border border-dawn-400/30; }
.pill-muted  { @apply pill bg-ink-600/50      text-moon-400     border border-ink-600; }
```

Column-aligned to match the existing `.pill-*` rules byte-for-byte. Indentation is 2 spaces (consistent with the surrounding `@layer components` block). No inline comments added — the CSS is self-documenting and the file has no inline-comment precedent in this block (CLAUDE.md §Code Style: prefer self-documenting code over comments).

### Palette audit (zero `tailwind.config.js` edits)

`grep '500:|400:' dashboard/tailwind.config.js`:
```
13:          500: "#262a3d",   // hover state
18:          400: "#9aa0b6",   // muted text
23:          400: "#f3c282",   // dawn warm primary     ← .pill-gemini anchor
24:          500: "#e8a35a",   // dawn warm pressed
28:          400: "#7b9eff",   // cool blue accent      ← .pill-aurora anchor (unchanged)
29:          500: "#5a82f5",   // pressed               ← .pill-codex anchor
```

Both `aurora.500` (#5a82f5) and `dawn.400` (#f3c282) pre-exist in the Tailwind palette. RESEARCH §4.2 claim validated. `grep -c "pill-codex\|pill-gemini" dashboard/tailwind.config.js` returns 0 post-commit — palette file byte-identical vs HEAD~1.

## Token Choice Rationale (RESEARCH §4.3)

**`.pill-codex` uses `aurora-500`** as the bg anchor:
- Deeper blue than cloud's `aurora-400` (`#5a82f5` vs `#7b9eff`) — reads as "also blue but distinct from cloud."
- Text stays `aurora-400` for legibility; border uses `aurora-500/30` (slightly more opaque than the `aurora-400/20` pattern because the deeper bg needs the extra border weight to avoid looking washed out).
- Effective contrast: `aurora-500/10` over ink-900 ≈ `#0c1121`; text `aurora-400` = `#7b9eff` → **~7.8:1 WCAG AA pass**.

**`.pill-gemini` uses `dawn-400`** as the bg anchor:
- Warm highlight tone — maps visually to Google/Gemini's brand warmth while staying inside the existing lunar/celestial palette vocabulary.
- Text `dawn-400` on `dawn-400/10` mirrors the existing `.pill-*` pattern (same token for bg + text, different opacity).
- Effective contrast: `dawn-400/10` over ink-900 ≈ `#18130c`; text `dawn-400` = `#f3c282` → **~11.0:1 WCAG AA pass** (exceeds AAA 7:1 threshold).

**Fallback on file for future user tests:** if codex + cloud look too similar on a real screen, RESEARCH §4.3 proposes swapping `.pill-codex` to `bg-moon-200/10 text-moon-50 border border-moon-400/30` (neutral silver) — no palette change, one-line CSS edit. Deferred until M1 visual-contrast verification (see 05-VALIDATION.md §Manual-Only).

## Verification Gate (all green)

| Gate | Command | Result |
| --- | --- | --- |
| Grep producer (codex) | `grep -c "\.pill-codex" dashboard/app/globals.css` | **1** (required = 1) |
| Grep producer (gemini) | `grep -c "\.pill-gemini" dashboard/app/globals.css` | **1** (required = 1) |
| Grep bg (codex) | `grep -q "bg-aurora-500/10" dashboard/app/globals.css` | exit 0 |
| Grep bg (gemini) | `grep -q "bg-dawn-400/10" dashboard/app/globals.css` | exit 0 |
| Palette untouched | `grep -c "pill-codex\|pill-gemini" dashboard/tailwind.config.js` | **0** (required = 0) |
| Ordering (awk) | `aurora < codex < gemini < muted` | **77 < 78 < 79 < 80** → ORDER_OK |
| Typecheck | `cd dashboard && pnpm run typecheck` | exit 0 |
| Build | `cd dashboard && pnpm run build` | exit 0 (no unknown-utility warnings; Tailwind JIT compiles cleanly) |
| Full suite | `cd dashboard && pnpm test` | **339/339 green across 38 files** |
| Commit format | `git log -1 --oneline` | `548d432 feat(05-02): add pill-codex + pill-gemini utility classes` |

## Bundle Delta (expected ~0 bytes)

| Route | Before (post-05-01) | After (post-05-02) | Delta |
| --- | --- | --- | --- |
| `/` | 6.91 kB / 148 kB | 6.91 kB / 148 kB | 0 |
| `/editor` | 13.2 kB / 154 kB | 13.2 kB / 154 kB | 0 |
| `/routines` | 10.2 kB / 151 kB | 10.2 kB / 151 kB | 0 |

Pure Tailwind `@apply` directives generate utility classes only when consumed. No current file in `dashboard/app/` references `.pill-codex` or `.pill-gemini` yet — Wave 3 Plan 05-07 wires them into `queue-client.tsx`, bundle delta surfaces there (expected single-digit bytes for the two utility class rules).

## Suite Count Delta

| Metric        | Before | After | Delta |
| ------------- | ------ | ----- | ----- |
| Test files    | 38     | 38    | 0     |
| Passing tests | 339    | 339   | 0     |
| Failing tests | 0      | 0     | 0     |
| Typecheck     | pass   | pass  | —     |
| Build         | pass   | pass  | —     |

Pure CSS plan with zero new test files by plan design. PLAN.md `<objective>` explicitly states: "No test file change in this plan — CSS utility classes don't need unit tests; Wave 3's jsdom render test covers the class attachment." This is the plan's stated design, NOT a deviation.

## Commits

| Task | Commit | Message |
| --- | --- | --- |
| 1 | `548d432` | `feat(05-02): add pill-codex + pill-gemini utility classes` |

Single atomic commit covers the entire plan (1 task / 1 file / 2 insertions).

## VALIDATION.md Rows Delta

Plan 05-02 is covered by 05-VALIDATION.md rows 5, 6, 7 (§Per-Task Verification Map). All three flipped green with this commit:

- **Row 5** `5-02-01 | 05-02 | QUEU-02 | grep (producer) | grep -q ".pill-codex" && grep -q "bg-aurora-500/10"` — exit 0.
- **Row 6** `5-02-01 | 05-02 | QUEU-02 | grep (producer) | grep -q ".pill-gemini" && grep -q "bg-dawn-400/10"` — exit 0.
- **Row 7** `5-02-01 | 05-02 | QUEU-02 | build | cd dashboard && pnpm run build exits 0` — exit 0.

Pending manual verification: M1 (`Pill colors pass visual contrast on a real screen`) — lives in 05-VALIDATION.md §Manual-Only. RESEARCH §4.3 computed ratios analytically; physical-device measurement deferred to Plan 05-08 phase exit gate smoke per the VALIDATION.md matrix.

## Deviations from Plan

None — plan executed exactly as written.

- Zero Rule 1/2/3 auto-fixes.
- Zero architectural deviations (Rule 4).
- Zero auth gates.
- Zero checkpoints.
- Zero new test files — this is the plan's stated design (PLAN.md `<objective>` + Task 1 `<done>` both explicitly carve out the test-file exclusion).
- Pre-existing untracked files (`CLAUDE.md`, `docs/screenshots/cloud-expanded.png`, `docs/screenshots/cloud-test-zen-expanded.png`) preserved untouched via explicit single-file staging of `dashboard/app/globals.css` only — zero scope bleed.

### Note on source-of-truth disambiguation (not a deviation)

Earlier planning artifacts (`05-PATTERNS.md` §QUEU-02, `05-CONTEXT.md` §Source-pills-UI) proposed a slightly different token combination for `.pill-gemini` (`bg-signal-amber/10 text-signal-amber`) before RESEARCH §4.3 finalized the palette math. PLAN.md `must_haves.truths` locks the final token pair (`bg-dawn-400/10 text-dawn-400` for gemini, `bg-aurora-500/10 text-aurora-400` for codex) and is the authoritative source for execution. The earlier references are preserved for historical traceability but were not followed. This is NOT a deviation — PLAN.md supersedes PATTERNS.md and CONTEXT.md per the planning pipeline's waterfall (CONTEXT → RESEARCH → PATTERNS → PLAN).

## Downstream Plans Unlocked

- **05-07** — Wave 3 UI branch in `queue-client.tsx` can consume `.pill-codex` / `.pill-gemini` via `source === "codex"` / `source === "gemini"` branches. The jsdom render assertion lives in `dashboard/tests/queue-client.test.tsx` (Plan 05-07), not here.
- **05-08** — Phase exit gate M1 (visual-contrast manual smoke) references these class names verbatim.

## Known Stubs

None. The producer surface is complete; the consumer surface is intentionally deferred to Wave 3 per plan boundaries.

## Self-Check: PASSED

- `dashboard/app/globals.css` contains `.pill-codex` at line 78 and `.pill-gemini` at line 79 (verified via `grep -n "\.pill-codex\|\.pill-gemini" dashboard/app/globals.css`).
- Both classes reference tokens that exist in `dashboard/tailwind.config.js` (`aurora.500` at line 29, `dawn.400` at line 23 — `grep '500:\|400:' dashboard/tailwind.config.js` confirms).
- `grep -c "pill-codex\|pill-gemini" dashboard/tailwind.config.js` = 0 (palette file byte-identical vs HEAD~1).
- Commit `548d432` exists in `git log` with the expected `feat(05-02): add pill-codex + pill-gemini utility classes` subject line (verified via `git log --oneline -1`).
- Single-commit scope: `git diff --stat HEAD~1 HEAD` shows `1 file changed, 2 insertions(+)` — `dashboard/app/globals.css` only.
- Zero deletions: `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty.
- Full dashboard test suite: 339/339 passing across 38 files (Vitest 2.1); typecheck exit 0; build exit 0.
- Pre-existing untracked files preserved: `git status --short` shows `?? CLAUDE.md`, `?? docs/screenshots/cloud-expanded.png`, `?? docs/screenshots/cloud-test-zen-expanded.png` — byte-identical to pre-plan state.
