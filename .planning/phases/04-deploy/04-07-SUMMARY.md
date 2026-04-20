---
phase: 04-deploy
plan: 07
subsystem: ui
tags: [react, framer-motion, deploy-state, rollback, polling, jsdom, client-component]

# Dependency graph
requires:
  - phase: 04-deploy
    provides: deployRoutine + getDeployState + runNowRoutine Server Actions (Plan 04-04)
  - phase: 04-deploy
    provides: DeployState + DeployPhase + DeployStep + RoutineStatus types (Plan 04-01)
  - phase: 01-foundation
    provides: Runtime type (types.ts Plan 01-01)
provides:
  - DeployStepPill presentational component (4 state variants driven by phase + steps shape)
  - StatusPill presentational component (DRAFT / DEPLOYED / DRIFT / DISABLED)
  - RunNowButton dispatch component with 800ms busy window + per-runtime toast copy
  - DeployProgressDrawer client component (framer-motion slide-in + 500ms polling + rollback banner + Q1 warning surface)
  - jsdom test matrix (5 it() blocks covering VALIDATION row 4 + rollback + success/failure footers + warning surface)
affects: [04-08, 04-09, DEPL-01, DEPL-02, DEPL-03, DEPL-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AnimatePresence + motion.aside right-anchored slide-in drawer with spring damping 25, stiffness 200 — matches UI-SPEC motion token"
    - "useRef<ReturnType<typeof setInterval>> + invokedRef guard pattern for React 19 Strict Mode double-mount + double-unmount in dev"
    - "setInterval polling loop that clears itself on terminal state observation (phase.kind ∈ {succeeded, rolled-back}) — no leaked timers, no over-polling"
    - "Esc-only-when-terminal keyboard handler — prevents accidental mid-deploy dismissal per UI-SPEC line 180"
    - "vi.mock of Server Actions module + dynamic component import after mock registration — isolates jsdom from Node fs + runtime-adapters registry"
    - "Per-runtime toast copy dispatch table (TOAST_COPY: Record<Runtime, {kind, template, ttl}>) — lookup-driven instead of switch per UI-SPEC line 183-193"

key-files:
  created:
    - dashboard/app/routines/_components/deploy-step-pill.tsx (159 lines)
    - dashboard/app/routines/_components/status-pill.tsx (64 lines)
    - dashboard/app/routines/_components/run-now-button.tsx (130 lines)
    - dashboard/app/routines/_components/deploy-progress-drawer.tsx (272 lines)
    - dashboard/tests/deploy-progress-drawer.test.tsx (215 lines)
  modified: []

key-decisions:
  - "Split Task 1 into 3 files (pill + status + button) rather than 4 — DeployStepPill sits with the drawer because it's internal machinery, StatusPill + RunNowButton sit adjacent because 04-09 will consume them from the action bar"
  - "DeployStepPill accepts optional label/helper props — the drawer passes UI-SPEC-locked copy, but a standalone render still works via the DEFAULT_COPY map (forward-compat with 04-09 card-level mini-progress indicator)"
  - "Retry deploy resets invokedRef and re-invokes startDeploy rather than remounting the drawer — preserves onClose handle + drawer animation state; poll counter restarts clean"
  - "RunNowButton 800ms busy window uses Math.max(0, 800 - elapsed) clamp + setTimeout(setBusy false) — a fast Server Action still holds the button disabled for the full window per UI-SPEC line 394"
  - "Component isolation: DeployProgressDrawer owns the deploy/poll lifecycle entirely — the parent (future routine-action-bar in 04-09) just toggles open/false; no state leaks upward"

patterns-established:
  - "500ms polling + terminal-state teardown pattern for any future Server Action state machine the dashboard drives"
  - "Right-anchored framer-motion drawer template consumable by future phases (approvals, audit detail view, etc.)"
  - "Toast dispatch via callback (onToast?: (t: Toast) => void) — 04-09 routine-action-bar hosts the actual toast renderer; components remain portable"

requirements-completed: []

# Metrics
duration: ~8min
completed: 2026-04-20
tasks: 3
files-created: 5
tests-added: 5
test-suite: 327 → 332 green (+5)
---

# Phase 04 Plan 07: Deploy/Run-now/Status client components Summary

**Four client components (DeployStepPill + StatusPill + RunNowButton + DeployProgressDrawer) + a jsdom polling matrix land the user-facing surface for Phase 4's deploy state machine. 327 → 332 green across 37 files; Wave 2 third ship seals the component prerequisites for the Plan 04-09 exit gate.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-20
- **Tasks:** 3 (all auto, no checkpoints)

## Implementation Summary

### Task 1 — DeployStepPill + StatusPill + RunNowButton (commit `69836bc`)

Three co-located presentational/dispatch components under `dashboard/app/routines/_components/`:

**`deploy-step-pill.tsx`** (159 lines). Single step row (icon + label + elapsed) with state derivation from `phase` + `steps`:

| phase.kind | steps[step].completedAt | Result |
| ---------- | ----------------------- | ------ |
| rolled-back with failedStep match | — | `rolled-back` |
| rolled-back with completedAt | set | `rolled-back` (visually reverted) |
| running with phase.step match | — | `running` |
| any | set | `succeeded` |
| otherwise | — | `pending` |

Layout follows 04-UI-SPEC §Layout Contract lines 299-316 verbatim: `grid grid-cols-[16px_1fr_auto] items-center gap-3 px-6 py-3`. Icons map to `Circle` / `Loader2.animate-spin` / `CheckCircle2` / `AlertTriangle`. Right cell renders elapsed (ms < 1s, s.s else), `(running, {s}s)` live tick, `—`, or rollback reason depending on status. Optional `label` / `helper` props accept UI-SPEC copy overrides from the drawer; a `DEFAULT_COPY` map keeps standalone rendering working so 04-09 can reuse the component in card-level mini-progress indicators.

**`status-pill.tsx`** (64 lines). Switch on `status: "draft" | "deployed" | "drift" | "disabled"`:
- draft → `pill-muted DRAFT`
- deployed → `pill-green DEPLOYED`
- drift → `pill-amber inline-flex + RefreshCw + DRIFT` with `title="Bundle edited {relative}; deployed artifact is older. Redeploy to sync."`
- disabled → `pill-muted DISABLED`

`driftRelativeTime` is optional — when omitted the tooltip falls back to `"recently"` so the component never renders a broken tooltip.

**`run-now-button.tsx`** (130 lines). Per-runtime Run-now dispatcher with 800ms anti-double-click window. Locked per-runtime toast copy table matching UI-SPEC lines 183-193:

| Runtime | Kind | TTL | Template |
| --- | --- | --- | --- |
| claude-routines | aurora | 6000 | `Opened Claude Routines — complete the fire in browser` |
| claude-desktop | green | 4000 | `Started {slug} on Claude Desktop` |
| codex | green | 4000 | `Started {slug} on Codex — watch the Morning Queue` |
| gemini | green | 4000 | `Started {slug} on Gemini — watch the Morning Queue` |

`claude-routines` branch: when `result.handoffUrl` is present and `typeof window !== "undefined"`, opens via `window.open(url, "_blank", "noopener,noreferrer")` before firing the aurora toast. Busy window implementation: `Math.max(0, 800 - elapsed)` clamp on `setTimeout(setBusy(false))` so a cached-URL-fast ok response still holds the button disabled for the full 800ms per UI-SPEC line 394.

### Task 2 — DeployProgressDrawer (commit `c585448`)

**`deploy-progress-drawer.tsx`** (272 lines). Right-anchored framer-motion slide-in drawer driving the 4-stage state machine.

**Lifecycle (single useEffect keyed on `[open, startDeploy, clearPoll]`):**
1. `open` flips true and `invokedRef.current === false` → invoke `startDeploy()`
2. `startDeploy`: set `invokedRef.current = true`, fire `deployRoutine({runtime, slug})` (ignored promise — state file lands via poll observation), start `setInterval(500ms)` that calls `getDeployState` and updates local state
3. Each poll observes terminal kind (`succeeded` / `rolled-back`): clears interval, fires optional `onComplete(state)`
4. `open` flips false → resets `invokedRef`, clears state, clears interval
5. Cleanup returns `clearPoll()` to defeat React 19 Strict Mode double-mount leaks

**Interaction guarantees:**
- Close button is focused on open (UI-SPEC §Focus management)
- Esc closes drawer ONLY when state is terminal (UI-SPEC line 180 — prevents accidental mid-deploy dismissal)
- Retry deploy resets `invokedRef` + re-runs `startDeploy` without remounting — preserves drawer animation state and onClose handle
- Rollback banner renders `role="alert"` inside a `panel border-signal-red/50 bg-signal-red/5` with heading `Deploy rolled back — {failedStep} failed` + body `All artifacts removed. You can safely retry after fixing {error}.`
- Success footer: `[Close (ghost)] + <RunNowButton />` for instant deploy→run chain
- Rollback footer: `[Dismiss (ghost)] + [Retry deploy (primary, Rocket icon)]`
- Q1 warning surface: `state.warning` renders as `pill-amber` row between step list and footer on `succeeded` state (covers claude-desktop's manual-add instruction from Plan 02-06 Q1 smoke finding)

Framer-motion spring values (`damping: 25, stiffness: 200`) match UI-SPEC line 292 verbatim. Polling cadence (500ms) matches UI-SPEC line 368 verbatim.

### Task 3 — deploy-progress-drawer.test.tsx (commit `b22444c`)

**`tests/deploy-progress-drawer.test.tsx`** (215 lines, 5 `it()` blocks).

Mocks `@/app/routines/actions` via `vi.mock` so Node fs + runtime-adapters don't try to load under jsdom. Dynamic `import` inside `beforeEach` ensures the mock is applied before the module graph resolves. Fixture builders for succeeded/rolled-back/running state shapes.

| # | Name | Coverage |
| - | ---- | -------- |
| 1 | `stops polling on terminal state (VALIDATION row 4)` | Fake timers; 550ms advance × 3; getDeployState resolves running→succeeded; assert call count stays at 2 after the third advance — proves interval was cleared |
| 2 | `renders rollback banner with role=alert on rolled-back state` | `screen.getByRole("alert")` contains `Deploy rolled back — writing failed` + the error string |
| 3 | `renders Close + Run now footer on succeeded state` | Close button + RunNowButton both present; Close button textContent is exactly `"Close"` |
| 4 | `renders Dismiss + Retry deploy footer on rolled-back state` | Close button textContent flips to `"Dismiss"`; Retry deploy button present |
| 5 | `surfaces state.warning as pill-amber on succeeded claude-desktop deploy` | warning pill renders with the SKILL.md manual-add copy |

Block #1 matches the VALIDATION.md row 4 anchor filter `-t "stops polling"` verbatim so the Plan 04-09 exit gate resolves to exactly one passing test.

## Verification

```bash
cd dashboard && pnpm run typecheck   # exit 0
cd dashboard && pnpm run build       # exit 0, /routines route stays at 2.14 kB (not wired into routines-client yet)
cd dashboard && pnpm test            # 332 passed (37 files) — +5 new in deploy-progress-drawer.test.tsx
cd dashboard && pnpm test tests/deploy-progress-drawer.test.tsx -t "stops polling"  # 1 passed (VALIDATION row 4)
```

**Client-bundle safety (03-08 lesson):** `grep "node:|fs|os|path" dashboard/app/routines/_components/*.tsx` returns 0 hits. Neither the drawer nor any of its siblings imports a node builtin transitively — `deploy-state` types are pure type-only imports that compile away; `runtime-adapters/types` is also pure-type; the `actions.ts` import happens through `"use server"` boundary. `/routines` route bundle size stayed flat at 2.14 kB / 143 kB first-load because 04-09 is what finally imports these components into the live client tree.

## Commits

| Task | Commit | Message | Files |
| ---- | ------ | ------- | ----- |
| 1 | `69836bc` | feat(04-07): DeployStepPill + StatusPill + RunNowButton with UI-SPEC-locked copy | 3 files / +386 lines |
| 2 | `c585448` | feat(04-07): DeployProgressDrawer with framer-motion slide-in + 500ms polling + rollback banner | 1 file / +272 lines |
| 3 | `b22444c` | test(04-07): deploy-progress-drawer jsdom matrix (5 it blocks) | 1 file / +215 lines |

## VALIDATION.md Delta

- Row 4 (`4-07-03 Polling stops on terminal state`, DEPL-01) flips to `✅ green 2026-04-20`
- Plan 04-07's component surfaces are now code-complete for consumers Plan 04-08 (SaveToRepoModal may reuse RunNowButton's toast shape) and Plan 04-09 (routine-action-bar + drawer mount)

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's `<action>` scaffolds compiled cleanly on first typecheck. The only minor adjustment was a TypeScript error in the initial test helper where a conditional `infer T` over `DeployState["phase"]` resolved to `never`; replaced with direct `DeployStep` type import — semantic-preserving, no runtime impact. No Rule 1/2/3 auto-fixes. No architectural deviations. No auth gates.

Pre-existing parallel-session uncommitted paths (`cloud-cache.ts`, `cloud-cache.test.ts`, untracked `CLAUDE.md` + 2 screenshot PNGs) preserved untouched via explicit `git add <paths>` — zero scope bleed across all three commits.

## Self-Check: PASSED

- [x] All 5 created files exist on disk
  - `dashboard/app/routines/_components/deploy-step-pill.tsx`
  - `dashboard/app/routines/_components/status-pill.tsx`
  - `dashboard/app/routines/_components/run-now-button.tsx`
  - `dashboard/app/routines/_components/deploy-progress-drawer.tsx`
  - `dashboard/tests/deploy-progress-drawer.test.tsx`
- [x] All 3 commits present in `git log`
  - `69836bc` Task 1
  - `c585448` Task 2
  - `b22444c` Task 3
- [x] Full suite 332/332 green
- [x] Typecheck + build both exit 0
