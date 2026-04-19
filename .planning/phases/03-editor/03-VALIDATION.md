---
phase: 3
slug: editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
source: derived from 03-RESEARCH.md §Validation Architecture (commit c343cb8)
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Mirrors `03-RESEARCH.md` §Validation Architecture (lines 865–925). Planner expands `Task ID` column per plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (existing) |
| **Config file** | `dashboard/vitest.config.ts` (exists — Wave 0 may extend `test.environmentMatchGlobs` for jsdom) |
| **Quick run command** | `cd dashboard && pnpm test` |
| **Full suite command** | `cd dashboard && pnpm run typecheck && pnpm test` |
| **Estimated runtime** | ~30s baseline (56 tests) → projected ~60s after Phase 3 adds ~98 blocks |
| **Client-test environment** | jsdom (per-file `// @vitest-environment jsdom` OR `environmentMatchGlobs`) — net-new dev dep `@testing-library/react@^16` |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm test`
- **After every plan wave:** Run `cd dashboard && pnpm run typecheck && pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + frozen-surface diff = 0 lines vs PHASE2_BASE across the 14 enumerated v0.1 paths
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Planner fills in `Task ID` (`3-NN-MM`) and `Plan` columns when authoring `03-NN-PLAN.md` files. Behavior rows below are fixed by research.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 2 | EDIT-01 | — | `/editor` route renders form with 7 fields incl. runtime radio, cron preview, reversibility, budget | integration (client) | `cd dashboard && pnpm test editor-client.test.tsx` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-01 | — | Unavailable runtimes dimmed with fix-tooltip | integration | `cd dashboard && pnpm test runtime-radio-grid.test.tsx` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-01 | — | Cron input shows cronstrue preview | integration | `cd dashboard && pnpm test cron-preview.test.tsx` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 0 | EDIT-02 | SAFE-02 | `saveRoutine` zod-validates; invalid input returns structured fieldErrors | unit | `cd dashboard && pnpm test bundle-schema.test.ts` | ❌ Wave 0 | ⬜ pending |
| 3-02-02 | 03-02 | 0 | EDIT-02 | SAFE-02 | `saveRoutine` secret-scans; Stripe / GitHub / AWS / 40-hex / OpenAI / Anthropic / Slack / Google / PEM all detected | unit | `cd dashboard && pnpm test secret-scan.test.ts` | ✅ dashboard/tests/secret-scan.test.ts | ✅ green 2026-04-19 |
| TBD | TBD | 1 | EDIT-02 | SAFE-02 | `saveRoutine` writes `config.json` + `prompt.md` atomically (directory-swap) | unit | `cd dashboard && pnpm test atomic-write.test.ts` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 1 | EDIT-02 | SAFE-02 | Secret in prompt → disk NEVER touched | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "secret blocks write"` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 1 | EDIT-02 | — | Collision on save → `renameSync` throws cleanly → no partial | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "collision returns error"` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 1 | EDIT-02 | — | Claude-desktop runtime writes SKILL.md (frontmatter + body) instead of config.json + prompt.md | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "claude-desktop writes SKILL.md"` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 2 | EDIT-03 | — | Autosave hook debounces 500ms and writes `sleepwalker.draft.v1` | integration (jsdom) | `cd dashboard && pnpm test editor-client.test.tsx -t "autosave"` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-03 | — | `beforeunload` prompts when dirty | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "beforeunload"` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-03 | — | Successful save clears `sleepwalker.draft.v1` | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "save clears draft"` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-03 | — | Draft-recovery banner shows when draft from prior session exists | integration | `cd dashboard && pnpm test draft-recovery-banner.test.tsx` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 0 | EDIT-04 | SAFE-02 | Slug regex `^[a-z][a-z0-9-]{0,63}$` enforced via zod | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "slug regex"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | EDIT-04 | SAFE-02 | `../../../evil` rejected (regex fail) | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "path traversal rejected"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | EDIT-04 | — | `Has Spaces` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "spaces rejected"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 0 | EDIT-04 | — | `UPPERCASE` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "uppercase rejected"` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 1 | EDIT-04 | — | `checkSlugAvailability` detects same-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "slug collision same runtime"` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 1 | EDIT-04 | — | `checkSlugAvailability` detects cross-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "slug collision cross-runtime"` | ❌ Wave 1 | ⬜ pending |
| 3-03-01 | 03-03 | 1 | EDIT-04 | — | `bundles.ts::hasBundle` returns true for existing, false for missing | unit | `cd dashboard && pnpm test bundles.test.ts -t "hasBundle"` | ✅ dashboard/tests/bundles.test.ts | ✅ green 2026-04-19 |
| TBD | TBD | 1 | EDIT-04 | — | Cross-runtime: existing `routines-codex/morning-brief/` + user types `morning-brief` on gemini → rejected | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "cross-runtime collision"` | ❌ Wave 1 | ⬜ pending |
| TBD | TBD | 2 | EDIT-05 | — | Every input has all 9 autofill-opt-out attrs (`autocomplete`, `autocorrect`, `autocapitalize`, `spellcheck`, `data-1p-ignore`, `data-lpignore`, `data-form-type`, `data-bwignore`; textarea also `rows={30}`) | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "autofill opt-out attrs"` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 2 | EDIT-05 | — | Prompt textarea `spellcheck="false"` confirmed | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "spellcheck false"` | ❌ Wave 2 | ⬜ pending |
| TBD | TBD | 3 | Phase exit | — | Full suite green after Phase 3 merge | smoke | `cd dashboard && pnpm run typecheck && pnpm test` | ✓ existing | ⬜ pending |
| TBD | TBD | 3 | Phase exit | — | v0.1 frozen surface untouched (PHASE2_BASE vs HEAD diff = 0 across 14 v0.1 paths) | smoke | `git diff --stat PHASE2_BASE HEAD -- <14 paths>` | ✓ existing pattern | ⬜ pending |

**Total rows:** 25 (EDIT-01 ×3, EDIT-02 ×6, EDIT-03 ×4, EDIT-04 ×7, EDIT-05 ×2, phase-exit ×3)

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `dashboard/lib/bundle-schema.ts` — zod schema for `RoutineBundleInput` (write-side shape; differs from `RoutineBundle` by omitting `bundlePath` which the server computes)
- [ ] `dashboard/lib/secret-patterns.ts` — shared client + server regex list (11 patterns; drift between client preview and server authoritative is a bug per Pitfall #5)
- [ ] `dashboard/lib/secret-scan.ts` — `scanForSecrets(text): SecretMatch[]` using the shared patterns
- [ ] `dashboard/tests/bundle-schema.test.ts` — zod accept/reject matrix (~12 it blocks)
- [ ] `dashboard/tests/secret-scan.test.ts` — pattern match matrix (~14 it blocks)
- [ ] Net-new deps: `zod@4.3.6`, `cronstrue@3.14.0`, `yaml@2.8.3`, `gray-matter@4.0.3` (pnpm add)
- [ ] Net-new dev deps: `@testing-library/react@^16` + `jsdom` (for Wave 2 client-component tests)
- [ ] `dashboard/vitest.config.ts` extension — either `test.environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]` OR per-file `// @vitest-environment jsdom` directive (planner decides)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Password manager (1Password / LastPass) does not inject into prompt textarea | EDIT-05 | No automated harness can simulate a real password-manager extension DOM-mutation | Open `http://localhost:4001/editor` in Chrome with 1Password extension active; confirm prompt field is ignored (no lock icon overlay); then repeat with LastPass |
| Browser autocorrect / autocapitalize do not modify prompt textarea | EDIT-05 | jsdom does not emulate autocorrect UA behavior | Open editor on macOS Safari + iOS Safari; type lowercase, confirm no auto-capitalization of first letter and no word replacements |
| Cron schedule > next fire time computed correctly for user's local tz | EDIT-01 | `cronstrue` output is text; the preview pill's "next fire" derived value cannot be verified without a real clock and tz | On wall-clock date 2026-04-19, type `0 6 * * *` and confirm preview says "At 06:00 AM every day" and next-fire estimates the next 06:00 local |
| Visual render at mobile (375px) / tablet (768px) / desktop (1280px) viewports matches UI-SPEC | EDIT-01 | Responsive layout verification is better done by eye than pixel-diff at this phase | Chrome DevTools responsive mode, check two-column collapse at 1024px breakpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 bullets above)
- [ ] No watch-mode flags (`pnpm test` runs once, not `--watch`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — set to `approved YYYY-MM-DD` by planner after plans are authored and each Task ID is filled in the verification map.
