---
phase: 3
slug: editor
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
approved: 2026-04-19
source: derived from 03-RESEARCH.md §Validation Architecture (commit c343cb8)
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Mirrors `03-RESEARCH.md` §Validation Architecture (lines 865–925). All Task IDs filled post-execution by 03-09 exit gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (existing) |
| **Config file** | `dashboard/vitest.config.ts` (extended in Plan 03-01 for jsdom + esbuild jsx=automatic) |
| **Quick run command** | `cd dashboard && pnpm test` |
| **Full suite command** | `cd dashboard && pnpm run typecheck && pnpm test` |
| **Estimated runtime** | ~30s baseline (56 tests) → projected ~60s after Phase 3 adds ~98 blocks |
| **Actual runtime at seal** | ~1s wall-clock; 250 tests across 26 files; typecheck exit 0 |
| **Client-test environment** | jsdom via `environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]]`; dev deps `@testing-library/react@16.3.2` + `@testing-library/user-event@14.6.1` + `jsdom@25.0.1` |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm test`
- **After every plan wave:** Run `cd dashboard && pnpm run typecheck && pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + frozen-surface diff = 0 lines vs PHASE2_BASE across the 14 enumerated v0.1 paths
- **Max feedback latency:** 60 seconds (actual: <2s at seal)

---

## Per-Task Verification Map

> All 25 rows filled post-execution by Plan 03-09 exit gate. Behavior rows fixed by research; Task IDs sourced from per-plan SUMMARY cross-reference.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-08-01 | 03-08 | 2 | EDIT-01 | — | `/editor` route renders form with 7 fields incl. runtime radio, cron preview, reversibility, budget | integration (client) | `cd dashboard && pnpm test editor-client.test.tsx` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-06-02 | 03-06 | 2 | EDIT-01 | — | Unavailable runtimes dimmed with fix-tooltip | integration | `cd dashboard && pnpm test runtime-radio-grid.test.tsx` | ✅ dashboard/tests/runtime-radio-grid.test.tsx | ✅ green 2026-04-19 |
| 3-06-03 | 03-06 | 2 | EDIT-01 | — | Cron input shows cronstrue preview | integration | `cd dashboard && pnpm test cron-preview.test.tsx` | ✅ dashboard/tests/cron-preview.test.tsx | ✅ green 2026-04-19 |
| 3-01-02 | 03-01 | 0 | EDIT-02 | SAFE-02 | `saveRoutine` zod-validates; invalid input returns structured fieldErrors | unit | `cd dashboard && pnpm test bundle-schema.test.ts` | ✅ dashboard/tests/bundle-schema.test.ts | ✅ green 2026-04-19 |
| 3-02-02 | 03-02 | 0 | EDIT-02 | SAFE-02 | `saveRoutine` secret-scans; Stripe / GitHub / AWS / 40-hex / OpenAI / Anthropic / Slack / Google / PEM all detected | unit | `cd dashboard && pnpm test secret-scan.test.ts` | ✅ dashboard/tests/secret-scan.test.ts | ✅ green 2026-04-19 |
| 3-04-01 | 03-04 | 1 | EDIT-02 | SAFE-02 | `saveRoutine` writes `config.json` + `prompt.md` atomically (directory-swap) | unit | `cd dashboard && pnpm test atomic-write.test.ts` | ✅ dashboard/tests/atomic-write.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-02 | SAFE-02 | Secret in prompt → disk NEVER touched | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "secret blocks write"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-02 | — | Collision on save → `renameSync` throws cleanly → no partial | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "collision"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-02 | — | Claude-desktop runtime writes SKILL.md (frontmatter + body) instead of config.json + prompt.md | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "SKILL.md"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-08-01 | 03-08 | 2 | EDIT-03 | — | Autosave hook debounces 500ms and writes `sleepwalker.draft.v1` | integration (jsdom) | `cd dashboard && pnpm test editor-client.test.tsx -t "autosave"` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-08-01 | 03-08 | 2 | EDIT-03 | — | `beforeunload` prompts when dirty | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "beforeunload"` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-08-01 | 03-08 | 2 | EDIT-03 | — | Successful save clears `sleepwalker.draft.v1` | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "save clears draft"` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-07-02 | 03-07 | 2 | EDIT-03 | — | Draft-recovery banner shows when draft from prior session exists | integration | `cd dashboard && pnpm test draft-recovery-banner.test.tsx` | ✅ dashboard/tests/draft-recovery-banner.test.tsx | ✅ green 2026-04-19 |
| 3-01-02 | 03-01 | 0 | EDIT-04 | SAFE-02 | Slug regex `^[a-z][a-z0-9-]{0,63}$` enforced via zod | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "slug regex"` | ✅ dashboard/tests/bundle-schema.test.ts | ✅ green 2026-04-19 |
| 3-01-02 | 03-01 | 0 | EDIT-04 | SAFE-02 | `../../../evil` rejected (regex fail) | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "path traversal rejected"` | ✅ dashboard/tests/bundle-schema.test.ts | ✅ green 2026-04-19 |
| 3-01-02 | 03-01 | 0 | EDIT-04 | — | `Has Spaces` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "spaces rejected"` | ✅ dashboard/tests/bundle-schema.test.ts | ✅ green 2026-04-19 |
| 3-01-02 | 03-01 | 0 | EDIT-04 | — | `UPPERCASE` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "uppercase rejected"` | ✅ dashboard/tests/bundle-schema.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-04 | — | `checkSlugAvailability` detects same-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "same-runtime"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-04 | — | `checkSlugAvailability` detects cross-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "cross-runtime"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-03-01 | 03-03 | 1 | EDIT-04 | — | `bundles.ts::hasBundle` returns true for existing, false for missing | unit | `cd dashboard && pnpm test bundles.test.ts -t "hasBundle"` | ✅ dashboard/tests/bundles.test.ts | ✅ green 2026-04-19 |
| 3-05-02 | 03-05 | 1 | EDIT-04 | — | Cross-runtime: existing `routines-codex/morning-brief/` + user types `morning-brief` on gemini → rejected | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "collision cross-runtime"` | ✅ dashboard/tests/save-routine-action.test.ts | ✅ green 2026-04-19 |
| 3-08-01 | 03-08 | 2 | EDIT-05 | — | Every input has all 8 autofill-opt-out attrs (`autocomplete`, `autocorrect`, `autocapitalize`, `spellcheck`, `data-1p-ignore`, `data-lpignore`, `data-form-type`, `data-bwignore`; textarea also `rows={30}`) — UI-SPEC line 255 locks 8 attrs (not 9); the prior "9" count was a VALIDATION.md drafting typo reconciled during 03-08 implementation | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "autofill opt-out attrs"` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-08-01 | 03-08 | 2 | EDIT-05 | — | Prompt textarea `spellcheck="false"` confirmed | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "rows=30 and spellcheck"` | ✅ dashboard/tests/editor-client.test.tsx | ✅ green 2026-04-19 |
| 3-09-02 | 03-09 | 3 | Phase exit | — | Full suite green after Phase 3 merge | smoke | `cd dashboard && pnpm run typecheck && pnpm test` | ✓ existing | ✅ green 2026-04-19 |
| 3-09-01 | 03-09 | 3 | Phase exit | — | v0.1 frozen surface untouched (PHASE3_BASE vs HEAD diff = 0 across all enumerated v0.1 + Phase 2 paths) | smoke | `git diff --stat PHASE3_BASE HEAD -- <paths>` | ✓ existing pattern | ✅ green 2026-04-19 |

**Total rows:** 25 (EDIT-01 ×3, EDIT-02 ×6, EDIT-03 ×4, EDIT-04 ×7, EDIT-05 ×2, phase-exit ×3)

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `dashboard/lib/bundle-schema.ts` — zod schema for `RoutineBundleInput` (write-side shape; differs from `RoutineBundle` by omitting `bundlePath` which the server computes) — shipped in Plan 03-01 commit `2b7716f`
- [x] `dashboard/lib/secret-patterns.ts` — shared client + server regex list (11 patterns; drift between client preview and server authoritative is a bug per Pitfall #5) — shipped in Plan 03-02 commit `64fb6ec`
- [x] `dashboard/lib/secret-scan.ts` — `scanForSecrets(text): SecretMatch[]` using the shared patterns — shipped in Plan 03-02 commit `891e2f3`
- [x] `dashboard/tests/bundle-schema.test.ts` — zod accept/reject matrix (24 it blocks, exceeded ~12 envelope) — shipped in Plan 03-01 commit `2b7716f`
- [x] `dashboard/tests/secret-scan.test.ts` — pattern match matrix (18 it blocks, exceeded ~14 envelope) — shipped in Plan 03-02 commit `891e2f3`
- [x] Net-new deps: `zod@4.3.6`, `cronstrue@3.14.0`, `yaml@2.8.3`, `gray-matter@4.0.3` — installed in Plan 03-01 commit `104547f`
- [x] Net-new dev deps: `@testing-library/react@16.3.2` + `@testing-library/user-event@14.6.1` + `jsdom@25.0.1` — installed in Plan 03-01 commit `104547f`
- [x] `dashboard/vitest.config.ts` extension — `environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]]` + `esbuild: { jsx: "automatic" }` (added in Plan 03-06 commit `92e8313` for React 19 automatic runtime)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Password manager (1Password / LastPass) does not inject into prompt textarea | EDIT-05 | No automated harness can simulate a real password-manager extension DOM-mutation | Open `http://localhost:4001/editor` in Chrome with 1Password extension active; confirm prompt field is ignored (no lock icon overlay); then repeat with LastPass | ⬜ deferred to user |
| Browser autocorrect / autocapitalize do not modify prompt textarea | EDIT-05 | jsdom does not emulate autocorrect UA behavior | Open editor on macOS Safari + iOS Safari; type lowercase, confirm no auto-capitalization of first letter and no word replacements | ⬜ deferred to user |
| Cron schedule > next fire time computed correctly for user's local tz | EDIT-01 | `cronstrue` output is text; the preview pill's "next fire" derived value cannot be verified without a real clock and tz | On wall-clock date 2026-04-19, type `0 6 * * *` and confirm preview says "At 06:00 AM every day" and next-fire estimates the next 06:00 local | ⬜ deferred to user |
| Visual render at mobile (375px) / tablet (768px) / desktop (1280px) viewports matches UI-SPEC | EDIT-01 | Responsive layout verification is better done by eye than pixel-diff at this phase | Chrome DevTools responsive mode, check two-column collapse at 1024px breakpoint | ⬜ deferred to user |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (8 bullets above)
- [x] No watch-mode flags (`pnpm test` runs once, not `--watch`)
- [x] Feedback latency < 60s (actual <2s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19 by Phase 3 exit gate (Plan 03-09). All 25 Task IDs filled; dashboard suite 250/250 green; bash supervisor harness 24/24; v0.1 frozen surface diff = 0 lines across 20 enumerated paths vs dynamic PHASE3_BASE `104547f` (parent of `2b7716f`, first `bundle-schema.ts` commit per sentinel-file idiom).
