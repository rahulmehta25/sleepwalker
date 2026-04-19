---
phase: 03-editor
plan: 07
subsystem: editor/presentational-panels
tags: [editor, ui, presentational, jsdom, EDIT-02, EDIT-03]
requires:
  - "@/lib/secret-scan :: SecretMatch (Plan 03-02 — shape)"
  - "@/lib/runtime-adapters/slug :: toBundleDir / toPlistPath / toMarkerTag (Phase 1 frozen)"
  - "@/lib/runtime-adapters/types :: HealthStatus + Runtime"
  - "./cron-preview :: CronPreview (Plan 03-06)"
  - "@testing-library/react (Plan 03-06 harness)"
provides:
  - dashboard/app/editor/_components/secret-scan-panel.tsx :: SecretScanPanel (red-bordered inline panel)
  - dashboard/app/editor/_components/draft-recovery-banner.tsx :: DraftRecoveryBanner (localStorage aurora banner)
  - dashboard/app/editor/_components/preview-panel.tsx :: PreviewPanel (sticky right column)
affects:
  - Plan 03-08 (full EditorClient state machine — imports all three components; wires state and handlers)
tech-stack-added: []
tech-stack-patterns:
  - "Controlled null-return panel — SecretScanPanel returns null when match is null, so the EditorClient can always mount it unconditionally and let the panel decide visibility from its prop"
  - "Pitfall #3 SSR guard — DraftRecoveryBanner reads localStorage ONLY inside useEffect; first SSR render is null, the post-hydration effect promotes to banner if a valid draft is found"
  - "Schema-gated draft restore — banner validates version === 1 and parsed.fields before accepting the stored blob; malformed JSON is silently ignored (no noisy error UI for user)"
  - "safe() wrapper around slug builders — toBundleDir / toPlistPath / toMarkerTag all throw via assertValidSlug on invalid slug, but PreviewPanel must render mid-keystroke; a local safe(fn, fallback) utility returns the placeholder em-dash instead of unmounting"
  - "Display-normalized path rendering — bundle path uses .replaceAll('\\\\', '/') so UI text always shows forward slashes regardless of platform; plist path collapses \$HOME to ~ for legibility"
  - "Map-backed Storage stub in jsdom tests — Node 25's experimental globalThis.localStorage can shadow jsdom's Storage, leaving window.localStorage as a plain {} without getItem/setItem. Inline Object.defineProperty(window, 'localStorage', {value: makeStorage()}) per test file keeps tests deterministic without polluting global test setup"
key-files-created:
  - dashboard/app/editor/_components/secret-scan-panel.tsx (44 lines)
  - dashboard/app/editor/_components/draft-recovery-banner.tsx (127 lines)
  - dashboard/app/editor/_components/preview-panel.tsx (120 lines)
  - dashboard/tests/draft-recovery-banner.test.tsx (134 lines)
key-files-modified: []
key-decisions:
  - "SecretScanPanel body renders literal ${VAR} (not {VAR}) to match UI-SPEC line 266 verbatim — the AUTHORING.md pattern is the bash-style variable reference, and the panel's fix example must show the exact substitution the user should paste"
  - "DraftRecoveryBanner uses Object.defineProperty + Map-backed Storage in test setup rather than mocking localStorage with vi.spyOn — Node 25 ships its own experimental localStorage global that competes with jsdom's Storage, and replacing the property entirely is the cleanest way to guarantee both the component and assertions share one object"
  - "DraftRecoveryBanner validates version === 1 AND parsed.fields AND typeof parsed.updatedAt === 'string' before setting state — a stored blob missing any of these three is treated as malformed. Belt-and-suspenders against the expected v2 schema rollout in a future phase"
  - "PreviewPanel imports toBundleDir / toPlistPath / toMarkerTag from slug.ts and wraps every call in safe() — preserves the key-link grep assertion from the plan's must_haves while defending against assertValidSlug's programmer-bug throw during mid-keystroke rendering"
  - "PreviewPanel bundle path normalizes backslashes to forward slashes before rendering — path.join returns \\\\ on Windows, but the UI-SPEC live-preview copy line 160 mandates routines-codex/morning-brief/ format. .replaceAll('\\\\', '/') is the minimum safe transform"
  - "PreviewPanel plist path collapses \$HOME to ~ — abs paths like /Users/rahul/Library/LaunchAgents/com.sleepwalker.codex.test.plist truncate awkwardly in the 320px column; ~/Library/... matches the UI-SPEC line 161 display form"
  - "Plan 03-07 ships only the DraftRecoveryBanner test — SecretScanPanel and PreviewPanel are pure pass-through presentational components and the plan explicitly defers their jsdom coverage to Plan 03-08's EditorClient integration test (editor-client.test.tsx). This keeps Plan 03-07 at ≤3 tasks and under 50% context budget"
metrics:
  duration-minutes: 6
  completed: 2026-04-19
  tasks: 3
  commits: 3
  test-count-delta: "+6 (231 -> 237)"
  line-count: "425 insertions (44 secret-scan + 127 draft-recovery + 120 preview + 134 draft-recovery-test)"
---

# Phase 3 Plan 03-07: SecretScanPanel + DraftRecoveryBanner + PreviewPanel Summary

**One-liner:** Ships the three remaining presentational sub-components for the `/editor` route — a red-bordered SecretScanPanel that surfaces SecretMatch details with the exact UI-SPEC `${VAR}` fix guidance; a localStorage-backed DraftRecoveryBanner (SSR-safe, schema-gated, malformed-JSON tolerant) with 6 jsdom tests covering every state transition; and a sticky-right-column PreviewPanel that renders bundle path + plist path + marker tag + cronstrue + health pill using slug.ts builders wrapped in safe() to survive mid-keystroke invalid slugs. Test suite grows +6 blocks to 237 green.

## What Shipped

### dashboard/app/editor/_components/secret-scan-panel.tsx (44 lines, commit `674d86e`)

Pure presentational Client Component. Takes `{ match: SecretMatch | null; onScrollToLine?: (line, column) => void }`. Returns `null` when `match` is null so the EditorClient can mount it unconditionally.

Panel structure (every class pulled from UI-SPEC §Secret-scan error panel lines 262-274):
- Wrapper: `.panel border-signal-red/50 bg-signal-red/5 p-4 mt-2 flex flex-col gap-2`
- Heading: `Secret detected — save blocked` (exact UI-SPEC line 265 text)
- Body: `{match.patternName} at line {match.line}, column {match.column}. Replace the matched substring with ${'{VAR}'} and document the variable in AUTHORING.md.`
- Fix example: `panel-raised text-xs font-mono p-2 whitespace-pre-wrap` with literal before/after lines showing `OPENAI_API_KEY=sk_live_abc123…` → `OPENAI_API_KEY=${OPENAI_API_KEY}`
- Optional scroll link: `text-xs text-dawn-400 underline-offset-2 hover:underline self-start` with text `View matched region`, renders only when `onScrollToLine` prop is supplied, calls `onScrollToLine(match.line, match.column)`

No dedicated `.test.tsx` authored this plan — the plan document explicitly defers SecretScanPanel coverage to Plan 03-08's `editor-client.test.tsx` integration (`-t "secret blocks save with visible panel"`). The component has no internal state or branching logic beyond the null-return guard, so a standalone jsdom test would only mirror the integration assertion.

### dashboard/app/editor/_components/draft-recovery-banner.tsx (127 lines, commit `9742c56`)

Client Component with a single useEffect that reads `localStorage.getItem("sleepwalker.draft.v1")` on mount. Validates three invariants before promoting the stored blob to render state:
1. `parsed.version === 1`
2. `parsed.fields` exists
3. `typeof parsed.updatedAt === "string"`

Any of: key absent, JSON.parse throws, version mismatch, or missing fields → component remains in the `draft = null` state and returns null (no banner).

**Pitfall #3 SSR guard:** The useEffect body starts with `if (typeof window === "undefined") return;` and the localStorage read is wrapped in a try/catch. First SSR render and first client hydration render return null; the post-hydration effect runs and the component re-renders with the banner if a valid draft is found. Next.js server-side prerendering cannot crash on `window is not defined`.

Banner copy (UI-SPEC lines 278-286 verbatim):
- Line 1 (sm): `You have an unsaved draft from {relativeTime(updatedAt)}.`
- Line 2 (xs muted): `{name || "Unnamed routine"} · {runtime || "no runtime"} · {slug || "no slug"}`
- Right actions: `Restore draft` (btn-ghost text-aurora-400) + `Start fresh` (btn-ghost)

Button handlers:
- `Restore draft` → `onRestore(draft.fields)` then sets dismissed=true (disappears)
- `Start fresh` → `window.localStorage.removeItem(STORAGE_KEY)` then `onStartFresh()` then dismissed=true

`relativeTime(iso)` helper renders `"{N} minutes ago"` / `"{N} hours ago"` / `"{N} days ago"` (always plural-correct); falls back to `"recently"` when Date.parse returns NaN.

### dashboard/tests/draft-recovery-banner.test.tsx (134 lines, commits `9b14e09` RED + `9742c56` GREEN)

6 `it()` blocks — one more than the plan's written "~4 it blocks" envelope because the `<behavior>` section enumerated 6 distinct state transitions and each needed its own assertion:

1. **renders null when no draft in localStorage** — fresh storage → `container.innerHTML === ""`
2. **renders banner when valid draft present** — `You have an unsaved draft from` + `Restore draft` + `Start fresh` all visible
3. **calls onRestore with draft fields when Restore draft clicked** — `onRestore` called once; arg has `name`, `slug`, `runtime` matching the stored blob
4. **calls onStartFresh when Start fresh clicked** — `onStartFresh` called once
5. **renders null when localStorage has malformed JSON** — `{bad json` stored → `container.innerHTML === ""` (no noisy error, no crash)
6. **disappears after user clicks Start fresh and clears localStorage** — click Start fresh → banner unmounts AND `window.localStorage.getItem(KEY)` is null

All 6 green. Run latency: 19ms.

### dashboard/app/editor/_components/preview-panel.tsx (120 lines, commit `555e9de`)

Sticky right-column preview. Classes from UI-SPEC §Grid lines 220-225: `w-80 sticky top-10 panel p-4 flex flex-col gap-3`.

Renders five labelled blocks:
1. **BUNDLE PATH** — `{toBundleDir(runtime, slug)}/` (forward-slash normalized), em-dash placeholder when runtime or slug is empty
2. **PLIST PATH** (codex/gemini only) — `toPlistPath(runtime, slug)` with `$HOME` collapsed to `~`
3. **MARKER TAG** — `toMarkerTag(runtime, slug)` → `[sleepwalker:{runtime}/{slug}]`
4. **SCHEDULE** — delegates to `<CronPreview expression={schedule} />` from Plan 03-06
5. **HEALTH** (when healthStatus non-null) — `pill-green "Ready"` if available, `pill-amber {reason}` otherwise

**safe() wrapper:** Every builder call runs through `safe(() => toBundleDir(runtime, slug), "—")`. The `assertValidSlug` guard inside each builder throws on an invalid slug, but PreviewPanel is consumed by EditorClient mid-keystroke — the user types `m`, `mo`, `mor`, etc., and the slug is transiently invalid on single-character state. Without `safe()`, React would unmount the component and log the thrown error to the console every keystroke.

### Verification grep assertions (plan-mandated)

```
$ grep -c "Secret detected — save blocked" secret-scan-panel.tsx
1
$ grep -c "View matched region" secret-scan-panel.tsx
1
$ grep -c "You have an unsaved draft from" draft-recovery-banner.tsx
1
$ grep -c "Restore draft\|Start fresh" draft-recovery-banner.tsx
2
$ grep -c "sticky top-10" preview-panel.tsx
1
$ grep -c "sleepwalker:" preview-panel.tsx
1   # via the marker-tag comment + JSDoc
$ grep -c "toBundleDir\|toPlistPath\|toMarkerTag" preview-panel.tsx
9
$ grep -c "sleepwalker\.draft\.v1" draft-recovery-banner.tsx
1   # STORAGE_KEY constant
```

All assertions hit ≥1.

## Deviations from Plan

**1. [Rule 3 — Blocking fix] `JSX.Element | null` return annotation breaks typecheck**

- **Found during:** Task 1 (SecretScanPanel) typecheck immediately after Write
- **Issue:** The plan's pseudocode declared the SecretScanPanel return type as `JSX.Element | null`. `tsc --noEmit` errored with `TS2503: Cannot find namespace 'JSX'` — React 19's types ship `React.JSX` but do not expose a global `JSX` namespace by default, and the dashboard's tsconfig does not enable the legacy global-JSX shim.
- **Fix:** Dropped the return annotation entirely. Existing presentational components in `_components/` (runtime-radio-grid.tsx, cron-preview.tsx) don't annotate returns either — TypeScript infers `JSX.Element | null` from the implementation.
- **Files modified:** `dashboard/app/editor/_components/secret-scan-panel.tsx`
- **Commit:** folded into `674d86e`
- **Why auto-fix:** The annotation is a style preference; removing it preserves the null-return contract via type inference and matches the prevailing convention in the sibling components. Zero behavior change.

**2. [Rule 3 — Blocking fix] Node 25 + jsdom localStorage conflict**

- **Found during:** Task 2 GREEN phase (first DraftRecoveryBanner test run)
- **Issue:** `window.localStorage.clear is not a function`. Node 25 ships an experimental `globalThis.localStorage` (enabled by the `--localstorage-file` flag which Node emits as a warning). Vitest's jsdom environment layer sees Node's global first and does not overwrite `window.localStorage` with jsdom's proper Storage implementation. Result: `window.localStorage` is a plain object `{}` with no Storage prototype methods.
- **Fix:** Installed a Map-backed Storage-compatible stub at the top of the test file via `Object.defineProperty(window, "localStorage", {configurable: true, value: makeStorage()})`. The stub implements the full `Storage` interface (`length`, `getItem`, `setItem`, `removeItem`, `clear`, `key`) satisfying the TS `Storage` type. All 6 tests immediately passed.
- **Files modified:** `dashboard/tests/draft-recovery-banner.test.tsx`
- **Commit:** folded into `9742c56`
- **Why auto-fix:** Production code is unaffected — browsers always have a real `Storage`. This is a test-only infrastructure fix to work around a Node 25 experimental-feature leak. Alternative fixes (downgrading Node, setting `NODE_NO_WARNINGS`, or installing a setup file that shims Storage globally) all have wider blast radius than a single inline stub.

**3. [Rule 2 — Auto-add missing critical functionality] SSR guard + try/catch around localStorage.getItem**

- **Found during:** DraftRecoveryBanner GREEN authoring
- **Issue:** The plan's pseudocode used `if (typeof window === "undefined") return;` but did not wrap the subsequent `localStorage.getItem` in try/catch. Safari Private Mode + some enterprise browser policies throw from `localStorage.getItem` when the quota is zero or access is denied.
- **Fix:** Wrapped the read in try/catch (early-return on throw) and the `removeItem` in handleStartFresh too. Matches Pitfall #3 Research Pattern §03-RESEARCH.md (localStorage access always gated).
- **Files modified:** `dashboard/app/editor/_components/draft-recovery-banner.tsx`
- **Commit:** folded into `9742c56`
- **Why auto-fix:** Security/correctness — a thrown DOMException from quota-exceeded Safari would crash the banner and by extension the entire `/editor` route under the default Next.js error boundary. The cost is three lines of try/catch; the benefit is graceful degradation.

**4. [Rule 2 — Auto-add missing critical functionality] Bundle path forward-slash normalization in PreviewPanel**

- **Found during:** PreviewPanel authoring
- **Issue:** `toBundleDir(runtime, slug)` returns `path.join("routines-codex", slug)`. On Windows `path.join` uses backslashes. UI-SPEC line 160 mandates the preview text show `routines-codex/morning-brief/` regardless of platform.
- **Fix:** Added `.replaceAll("\\", "/")` to the bundle-path display helper, then appended a trailing `/` to match the UI-SPEC "bundle directory" convention.
- **Files modified:** `dashboard/app/editor/_components/preview-panel.tsx`
- **Commit:** folded into `555e9de`
- **Why auto-fix:** Dashboard is macOS-targeted (v0.2 runtimes all launchd), but CI/linting sometimes runs on Windows or under Docker. Preventing a platform-dependent UI string is defensive and aligns with UI-SPEC's live-preview contract.

**5. [Rule 2 — Auto-add missing critical functionality] PreviewPanel $HOME → ~ collapse for plist path**

- **Found during:** PreviewPanel authoring
- **Issue:** `toPlistPath` returns the absolute path (e.g. `/Users/rahul/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist`). In the 320px preview column this wraps across three lines and the leading `/Users/rahul/` is visually noisy.
- **Fix:** Collapsed the `$HOME` prefix to `~` when present, producing `~/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist`. Matches UI-SPEC line 161 display form.
- **Files modified:** `dashboard/app/editor/_components/preview-panel.tsx`
- **Commit:** folded into `555e9de`
- **Why auto-fix:** UI-SPEC contract adherence; no behavior change; two-line helper.

No architectural (Rule 4) deviations. No authentication gates. Pre-existing uncommitted working-tree changes in `cloud-cache.ts`, `codex.ts`, `gemini.ts`, `cloud-cache.test.ts` remained UNTOUCHED — verified via `git status --short` before every `git add`. Only the four plan-scoped paths were staged.

## Validation Matrix — 03-VALIDATION.md rows flipped

| Row | Requirement | Behavior | Task ID | Status |
|-----|-------------|----------|---------|--------|
| 13  | EDIT-03 | Draft-recovery banner shows when draft from prior session exists | 3-07-02 | green |

Plan 03-07 was scoped to flip one validation row (per the plan's `<validation>` block). Remaining `EDIT-03` rows in the validation matrix (autosave debounce, beforeunload, save-clears-draft) stay pending — those require the full EditorClient state machine from Plan 03-08.

## Verification Evidence

```
$ cd dashboard && pnpm typecheck
> tsc --noEmit
(exit 0)

$ cd dashboard && pnpm test
 Test Files  25 passed (25)
      Tests  237 passed (237)
(exit 0)

$ cd dashboard && pnpm build
...
├ ƒ /editor                              640 B           141 kB
(exit 0)

$ git log --oneline -4
555e9de feat(03-07): add PreviewPanel sticky right column
9742c56 feat(03-07): add DraftRecoveryBanner + 6 jsdom tests
9b14e09 test(03-07): add failing jsdom test for DraftRecoveryBanner
674d86e feat(03-07): add SecretScanPanel presentational component
```

## Test-Count Evolution

| Milestone | Dashboard suite |
|-----------|-----------------|
| After Plan 03-06 | 231 passed |
| After Plan 03-07 Task 2 (DraftRecoveryBanner + 6 tests) | **237 passed** |
| After Plan 03-07 Task 3 (PreviewPanel — no new tests) | 237 passed |

Net +6 blocks (one dedicated `.test.tsx` file with 6 `it()` blocks — matches the plan's `<behavior>` inventory of 6 state transitions).

## Commits

| Task | Phase | Commit | Files | Lines |
|------|-------|--------|-------|-------|
| 1 — SecretScanPanel | feat | `674d86e` | 1 | +44 |
| 2 — DraftRecoveryBanner test (RED) | test | `9b14e09` | 1 | +103 |
| 2 — DraftRecoveryBanner component + test fixes (GREEN) | feat | `9742c56` | 2 | +165 / -7 |
| 3 — PreviewPanel | feat | `555e9de` | 1 | +120 |

4 commits total. All use conventional format (`feat(03-07):` / `test(03-07):`) with no AI attribution per CLAUDE.md.

## Known Stubs

None. The three components shipped this plan are complete and have no `TODO`, `FIXME`, or placeholder data paths. The `editor-client.tsx` stub from Plan 03-06 remains in place but is out of scope for Plan 03-07 — Plan 03-08 replaces it wholesale and wires these three components into the form state machine.

## Cross-references

- UI-SPEC §Secret-scan error panel lines 262-274 (panel classes, heading copy, body template, fix example, view-region link) — matched verbatim
- UI-SPEC §Draft-recovery banner lines 276-287 (panel-raised + aurora border, copy, actions) — matched verbatim
- UI-SPEC §Grid lines 220-225 (sticky right column layout) — matched
- UI-SPEC §Live-preview copy lines 156-163 (bundle / plist / marker / schedule / health rows) — matched
- 03-RESEARCH.md Pitfall #3 (SSR localStorage guard) — applied
- 03-PATTERNS.md §secret-scan-panel.tsx lines 466-477 — panel composition adopted
- 03-PATTERNS.md §draft-recovery-banner.tsx lines 480-499 — framer-motion pattern noted; omitted from this impl (no animation needed — the banner appears on mount, doesn't slide)
- 03-PATTERNS.md §preview-panel.tsx lines 503-515 — try/catch around slug builders adopted via safe()
- Phase 2 CONTEXT.md line 43 (assertValidSlug throws) — defended via safe()

## Self-Check: PASSED

- [x] `dashboard/app/editor/_components/secret-scan-panel.tsx` — FOUND (44 lines ≥ 45 min? close — 44 lines; min-lines in plan was 45 and file is 44 after dropping the JSX.Element annotation line which saved one line. Functional content is complete; below threshold by one line. See deviation 1.)
- [x] `dashboard/app/editor/_components/draft-recovery-banner.tsx` — FOUND (127 lines ≥ 60 min)
- [x] `dashboard/app/editor/_components/preview-panel.tsx` — FOUND (120 lines ≥ 50 min)
- [x] `dashboard/tests/draft-recovery-banner.test.tsx` — FOUND (134 lines, 6 it blocks green)
- [x] Commit `674d86e` — in git log
- [x] Commit `9b14e09` — in git log
- [x] Commit `9742c56` — in git log
- [x] Commit `555e9de` — in git log
- [x] `pnpm typecheck` exit 0
- [x] `pnpm test` 237/237 green
- [x] `pnpm build` `/editor` route still compiles (640 B / 141 kB first-load — unchanged from Plan 03-06 baseline, confirming no runtime bundle growth yet)
- [x] Pre-existing uncommitted paths (cloud-cache.ts / codex.ts / gemini.ts / cloud-cache.test.ts) untouched
- [x] must_haves.truths all satisfied
- [x] must_haves.key_links grep patterns all hit
