---
phase: 04-deploy
plan: 08
subsystem: ui
tags: [react, framer-motion, save-to-repo, flock, two-stage-modal, input-opt-out, client-component, shared-dialog]

# Dependency graph
requires:
  - phase: 04-deploy
    provides: previewSaveToRepoAction / commitSaveToRepoAction / releaseSaveLockAction + PreviewActionResult (Plan 04-05)
  - phase: 04-deploy
    provides: save-to-repo.ts library with PreviewResult + SaveToRepoError + CommitResult shapes (Plan 04-02)
  - phase: 01-foundation
    provides: Runtime type (types.ts Plan 01-01)
provides:
  - DiffStatPanel presentational component (files[] + totals rendering with UI-SPEC-locked empty-state copy)
  - SaveToRepoModal client component (two-stage Review -> Confirm flow with flock lifecycle, INPUT_OPT_OUT textarea, Cmd/Ctrl+Enter submit, never-push subtitle, ConfirmDialog-driven Discard confirm, post-commit toast)
  - ConfirmDialog shared role=dialog aria-modal component consumed by SaveToRepoModal (Discard) + 04-09 RoutineActionBar (Disable)
affects: [04-09, REPO-01, DEPL-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-stage modal with owned flock lifecycle — preview fetch on mount acquires lockToken; Discard/unmount/external-close releases via releaseSaveLockAction; commit success flag suppresses duplicate unmount release"
    - "ConfirmDialog extracted to app/_components/ as reusable role=dialog aria-modal with focus-on-cancel + Esc close + backdrop click close — consumed by both Save-to-repo Discard (04-08) and disable-routine toggle (04-09)"
    - "INPUT_OPT_OUT const spread applied to commit-message textarea identical to editor-client.tsx bag — password managers + browser autofill cannot mutate the commit message"
    - "Cmd/Ctrl+Enter submit via onKeyDown checking (e.metaKey || e.ctrlKey) && e.key === 'Enter' + e.preventDefault()"
    - "Discriminated-union UI branch: preview === null (loading) / preview.ok (diff panel) / preview.kind === 'lock-busy' (amber role=alert) / preview.kind === 'no-changes' (empty DiffStatPanel) / preview.kind === 'git-error' (red role=alert)"
    - "Focus management across stages: loading/error -> close button; Stage 1 ok -> Continue CTA; Stage 2 -> textarea with cursor at end of message"
    - "invokedRef guard against React 19 Strict Mode double-effect preview fetch (which would acquire flock twice and return lock-busy on the second call)"

key-files:
  created:
    - dashboard/app/routines/_components/diff-stat-panel.tsx (80 lines)
    - dashboard/app/_components/confirm-dialog.tsx (114 lines)
    - dashboard/app/routines/_components/save-to-repo-modal.tsx (555 lines — includes 3 sub-components: SaveToRepoModal shell, ReviewStage, ConfirmStage)
  modified: []

key-decisions:
  - "ConfirmDialog lives at dashboard/app/_components/ (not routines/_components/) because Plan 04-09 DisableToggle will import it from outside the /routines route segment — the _components directory at app root is the established v0.2 shared-component location (page-header.tsx, health-badge.tsx live there)"
  - "Stage 1 Cancel branches on preview state: when diff has been shown (preview.ok) it opens the ConfirmDialog Discard prompt; when still loading or in an error state (lock-busy / no-changes / git-error) it closes directly — there is nothing to discard from a failed preview, and confirming a no-op is friction"
  - "Safe-unmount lock release uses a committed flag, not a dedicated unmount counter — the lib already releases the flock on successful commit; setting committed=true suppresses the unmount-effect release that would otherwise double-release a freed lock (idempotent on the lib side but wasteful)"
  - "Stage 2 collapses diff to one-line summary '{n} files · +{a} −{d}' per UI-SPEC line 342 rather than re-rendering the full DiffStatPanel — keeps Stage 2 focused on the message textarea and avoids vertical scroll competing with the commit area"
  - "Tests intentionally not added in this plan — the <output> section of 04-08-PLAN.md explicitly justifies this: the flock runtime state is module-scoped in save-to-repo.ts and mocking it for jsdom would require heavy scaffolding; integration coverage is owned by Plan 04-05's real-git matrix (4 blocks) plus VALIDATION.md §Manual-Only row 4 (two-tab lock-busy UI verification)"

patterns-established:
  - "Reusable ConfirmDialog component template consumable by any future destructive / semi-destructive action (schema: {open, title, body, destructiveLabel, cancelLabel, onConfirm, onCancel})"
  - "Two-stage modal flow template — Stage A (Preview/Review) -> Stage B (Confirm/Commit) with backstage resource lifecycle (here: flock; future: uploads, migrations)"
  - "Toast callback contract (onToast?: (t: {kind, message, ttl}) => void) propagated from RunNowButton (Plan 04-07) into SaveToRepoModal — components remain portable; 04-09 RoutineActionBar hosts the toast renderer"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-04-20
tasks: 2
files-created: 3
tests-added: 0
test-suite: 332 → 332 green (unchanged — no new tests by plan design)
---

# Phase 04 Plan 08: Save-to-repo UI (DiffStatPanel + SaveToRepoModal + ConfirmDialog) Summary

**Three client components (DiffStatPanel + ConfirmDialog + SaveToRepoModal) land the REPO-01 UI surface for the save-to-repo two-stage flow. Wave 3 ship seals the SaveToRepoModal Server Action consumers (Plan 04-05) and the ConfirmDialog is extracted for 04-09 DisableToggle reuse. Suite stays 332/332 green — no new tests per plan design (Plan 04-05's real-git integration matrix + VALIDATION.md §Manual-Only row 4 cover the flock runtime behaviour).**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-04-20
- **Tasks:** 2 (both auto, no checkpoints)

## Implementation Summary

### Task 1 — DiffStatPanel + ConfirmDialog (commit `b09ab93`)

Two co-located presentational components across two directories:

**`dashboard/app/routines/_components/diff-stat-panel.tsx`** (80 lines). Pure presentational diff renderer consuming the `{files, totals}` shape returned by `previewSaveToRepoAction`. Two branches:

| `totals.filesChanged` | Layout | Copy |
| --- | --- | --- |
| `=== 0` | `.panel p-4 text-sm text-moon-400 text-center` | `No staged changes — this bundle is already in sync with HEAD.` |
| `>= 1` | `.panel max-h-64 overflow-auto p-4 font-mono text-xs` | Heading `{n} file{s?} changed — {added} additions, {removed} deletions` + per-file rows `grid grid-cols-[1fr_auto] gap-4 py-0.5` with `<span className="text-signal-green">+{added}</span> <span className="text-signal-red">−{removed}</span>` |

The minus glyph is the Unicode MINUS SIGN (U+2212, `−`) to match UI-SPEC line 206 verbatim — not an ASCII hyphen. Rows carry `data-testid="diff-stat-row"` and the container `data-testid="diff-stat-panel"` / empty-state `data-testid="diff-stat-panel-empty"` for future integration-test hooks.

**`dashboard/app/_components/confirm-dialog.tsx`** (114 lines). Shared confirm modal. Props: `{open, title, body, destructiveLabel, cancelLabel, onConfirm, onCancel}`. Uses `AnimatePresence` + two `motion.div` children:

- Backdrop: `fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40` — opacity fade 150ms — `onClick={onCancel}` closes
- Dialog: `.panel-raised max-w-md w-full` centered via a `fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none` overlay where the inner panel opts back in with `pointer-events-auto` — scale 0.98 → 1 + opacity fade 180ms easeOut

Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="confirm-dialog-title"`. On open, focus lands on the **cancel button** (the safe, less-destructive default) via a `useRef<HTMLButtonElement>` + effect. Esc closes (fires `onCancel`). Restoring focus to the trigger stays the caller's responsibility — the component does not touch external DOM refs.

CTAs use the globals.css `btn btn-ghost` + `btn btn-danger` utilities so the destructive action visually mirrors the `/settings` destructive patterns.

### Task 2 — SaveToRepoModal (commit `feadcd6`)

**`dashboard/app/routines/_components/save-to-repo-modal.tsx`** (555 lines across 3 sub-components). The two-stage client component that drives the REPO-01 flow end-to-end.

**State machine:**

```
open=false                   open=true, preview===null         preview.ok
    │                               │                              │
    ▼                               ▼                              ▼
  reset                       Stage 1: Loading             Stage 1: DiffStatPanel
                                    │                              │
                                    ▼                              │
                             preview.kind='lock-busy'               │
                             preview.kind='no-changes'              │
                             preview.kind='git-error'               │
                                    │                              │
                                    ▼                              ▼
                             Stage 1: error pane              Stage 2: Confirm
                                                                   │
                                                                   ▼
                                                      commit ok => toast + close
                                                      commit fail => toast + stay
```

**Flock lifecycle (the invariant this component owns):**

| Event | Action | Notes |
| --- | --- | --- |
| `open` flips true + `invokedRef.current === false` | `previewSaveToRepoAction({runtime, slug})` | Acquires flock, returns `lockToken` |
| `preview.ok` + setState | `setMessage(preview.suggestedMessage)` | Stage 1 diff panel activates; Continue enabled |
| Click `Cancel` with `preview.ok` | Open ConfirmDialog "Discard this save?" | Confirm -> `releaseSaveLockAction` + onClose |
| Click `Cancel` with `!preview.ok` | `onClose()` | No discard confirm — nothing to discard |
| Click `Continue` | `setStage("confirm")` | Lock still held |
| Click `Back` (Stage 2) | `setStage("review")` | Lock still held |
| Click `Commit` + !message.trim() | noop | Commit button disabled |
| Click `Commit` + ok | Green toast `Committed {shortSha} — {message.split('\n')[0]}` + `setCommitted(true)` + onClose | Lib already released flock |
| Click `Commit` + !ok | Red toast + stay in Stage 2 | Lock still held; user can retry |
| Unmount while `preview.ok && !committed` | `releaseSaveLockAction({lockToken})` | Cleanup effect |
| Esc in Stage 2 | `setStage("review")` | Lock still held |
| Esc in Stage 1 | Cancel flow (Discard confirm if preview.ok) | |
| Backdrop click | Same as Cancel flow | |
| ConfirmDialog open | Esc handler on modal suspends (ConfirmDialog owns Esc) | Prevents double-close |

**INPUT_OPT_OUT on commit-message textarea** — the exact same 8-attribute bag used in `editor-client.tsx` lines 88-97: `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `data-1p-ignore=""`, `data-lpignore="true"`, `data-form-type="other"`, `data-bwignore=""`. Password managers, LastPass/1Password/Bitwarden, and browser autofill cannot mutate the commit text.

**Cmd/Ctrl+Enter submit:**

```tsx
onKeyDown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void handleCommit();
  }
}}
```

**Focus management:**

- Stage 1 + preview === null or preview !ok → focus close `×` button
- Stage 1 + preview.ok → focus Continue CTA
- Stage 2 → focus textarea with `setSelectionRange(value.length, value.length)` so cursor lands at end of the suggestedMessage (user can type the body immediately without moving the caret)

**Verbatim-locked UI-SPEC copy (all observable via grep):**

| Anchor | Copy |
| --- | --- |
| Modal title | `Save to repo` |
| Stage 1 heading | `Review changes` |
| Stage 1 body | `These files will be staged and committed. Nothing else in your working tree is touched, and nothing is pushed.` |
| Lock-busy | `Another save-to-repo is in progress. Wait a moment and try again.` |
| Stage 1 CTAs | `Cancel` + `Continue` |
| Stage 2 heading | `Commit message` |
| Stage 2 label | `MESSAGE` |
| Stage 2 helper | `Conventional commit format preferred (feat: / fix: / docs:). No emoji. No AI attribution.` |
| Never-push subtitle | `This writes a local commit. Push manually with \`git push\` when you're ready.` |
| Stage 2 CTAs | `Back` + `Commit` (GitCommit icon) |
| Discard dialog title | `Discard this save?` |
| Discard dialog body | `The diff preview closes. No changes are staged or committed.` |
| Discard CTAs | `Keep reviewing` + `Discard` |
| Post-commit toast | `Committed {shortSha} — {message.split('\n')[0]}` (green, 6s) |

## Verification

```bash
cd dashboard && pnpm run typecheck   # exit 0
cd dashboard && pnpm run build       # exit 0, /routines route stays at 2.14 kB / 143 kB (not wired into routines-client yet — Plan 04-09 mounts the modal)
cd dashboard && pnpm test            # 332 passed (37 files) — unchanged; plan adds no new test files by design
```

**Frontmatter must-haves — all 9 truths grep-verifiable:**

```bash
grep -c "previewSaveToRepoAction\|commitSaveToRepoAction\|releaseSaveLockAction" dashboard/app/routines/_components/save-to-repo-modal.tsx   # 11
grep -c "DiffStatPanel"                                      dashboard/app/routines/_components/save-to-repo-modal.tsx   # 4
grep -c "INPUT_OPT_OUT"                                      dashboard/app/routines/_components/save-to-repo-modal.tsx   # 3
grep -c "metaKey || e.ctrlKey"                               dashboard/app/routines/_components/save-to-repo-modal.tsx   # 1
grep -c "Review changes"                                     dashboard/app/routines/_components/save-to-repo-modal.tsx   # 2
grep -c "Commit message"                                     dashboard/app/routines/_components/save-to-repo-modal.tsx   # 2
grep -c "Push manually with"                                 dashboard/app/routines/_components/save-to-repo-modal.tsx   # 1
grep -c "Another save-to-repo is in progress"                dashboard/app/routines/_components/save-to-repo-modal.tsx   # 1
grep -c "Discard this save"                                  dashboard/app/routines/_components/save-to-repo-modal.tsx   # 1
grep -c 'role="dialog"'                                      dashboard/app/_components/confirm-dialog.tsx                # 2 (attr + docstring)
grep -c "btn btn-danger"                                     dashboard/app/_components/confirm-dialog.tsx                # 2 (impl + docstring)
grep -c "No staged changes"                                  dashboard/app/routines/_components/diff-stat-panel.tsx      # 2 (impl + docstring)
```

**Client-bundle safety (03-08 preview-panel lesson):** `grep "node:\|from \"fs\"\|from \"os\"\|from \"path\"" dashboard/app/routines/_components/save-to-repo-modal.tsx dashboard/app/routines/_components/diff-stat-panel.tsx dashboard/app/_components/confirm-dialog.tsx` returns 0 matches. The only imports are React hooks, lucide-react icons, framer-motion, and the `@/app/routines/actions` Server Action module which crosses the `"use server"` boundary. `/routines` route bundle stayed flat at 2.14 kB / 143 kB first-load; `/editor` at 13.2 kB / 154 kB — all routes unchanged. Plan 04-09 is what finally imports these components into the live client tree.

## Commits

| Task | Commit | Message | Files |
| ---- | ------ | ------- | ----- |
| 1 | `b09ab93` | feat(04-08): DiffStatPanel + ConfirmDialog presentational components | 2 files / +203 lines |
| 2 | `feadcd6` | feat(04-08): SaveToRepoModal two-stage Review->Confirm with flock lifecycle + Cmd/Ctrl+Enter submit | 1 file / +555 lines |

## VALIDATION.md Delta

**No new rows flip.** Plan 04-08 delivers the UI surface that the Plan 04-05 real-git integration matrix already probes end-to-end. Manual verification for the runtime lock-busy visual (two-tab scenario) remains owned by VALIDATION.md §Manual-Only row 4 — this plan wires the UI copy verbatim (`Another save-to-repo is in progress. Wait a moment and try again.`) so the manual check resolves by inspection. The Plan 04-09 exit gate will re-run the REPO-01 anchor filters.

## Deviations from Plan

**None — plan executed exactly as written.**

Both `<action>` scaffolds compiled cleanly on the first typecheck. No Rule 1/2/3 auto-fixes. No architectural deviations. No auth gates.

Two minor enrichments made inside plan scope:

1. `ConfirmStage` was factored into a local sub-component alongside `ReviewStage` inside the same file to keep the main `SaveToRepoModal` function focused on lifecycle + state rather than layout — purely a readability refinement; the file still exports only `SaveToRepoModal`, `SaveToast`, and `SaveToastKind` per the plan's output contract.
2. Added `committed` boolean state flag to suppress the duplicate unmount release (lib's `commitSaveToRepo` already releases the flock on success, so the unmount-effect release would be a wasted no-op call). Documented inline; behavior-neutral.

Pre-existing parallel-session uncommitted paths (`cloud-cache.ts`, `cloud-cache.test.ts`, untracked `CLAUDE.md` + 2 screenshot PNGs) preserved untouched via explicit `git add <paths>` across both commits — zero scope bleed.

## Self-Check: PASSED

- [x] All 3 created files exist on disk
  - `dashboard/app/routines/_components/diff-stat-panel.tsx`
  - `dashboard/app/_components/confirm-dialog.tsx`
  - `dashboard/app/routines/_components/save-to-repo-modal.tsx`
- [x] All 2 commits present in `git log`
  - `b09ab93` Task 1 (DiffStatPanel + ConfirmDialog)
  - `feadcd6` Task 2 (SaveToRepoModal)
- [x] Full suite 332/332 green
- [x] Typecheck + build both exit 0
- [x] All 9 frontmatter must_have truths grep-verifiable
- [x] Client bundle size unchanged (plan is strictly additive and not yet wired into the live client tree)
