---
phase: 4
slug: deploy
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-19
reviewed_at: 2026-04-19
---

# Phase 4 — UI Design Contract: Deploy, Run-now, Save-to-repo, Drift, Health

> Visual and interaction contract for the five surfaces Phase 4 wires into the dashboard:
> (1) Deploy button + 4-stage state machine, (2) Run-now button, (3) Routine card status (Draft / Deployed / Drift) + enable/disable toggle, (4) Save-to-repo button with diff preview, (5) Landing-page runtime health badges.
>
> **Delta from Phase 3 UI-SPEC.** Every design-system primitive (palette, fonts, spacing, component primitives, motion library, focus rings) is inherited verbatim from `.planning/phases/03-editor/03-UI-SPEC.md`. This document records only the new decisions Phase 4 introduces. Where Phase 3 locked a rule, it is re-stated here ONLY when Phase 4 constrains it further.

---

## Design System

Inherited verbatim from Phase 3 — no changes to tool, preset, component library, icon library, fonts, motion, or color scheme.

| Property | Value |
|----------|-------|
| Tool | none (project uses bespoke Tailwind 3.4 theme — the "lunar/celestial palette") |
| Preset | not applicable |
| Component library | none — hand-rolled primitives via `@layer components` in `app/globals.css` (`panel`, `panel-raised`, `pill-*`, `btn-*`, `label`, `hairline`, `data`, `display`) |
| Icon library | `lucide-react@0.468.0` — Phase 4 adds the following glyphs to the approved set: `Rocket` (Deploy), `Play` (Run-now), `GitCommit` (Save-to-repo), `RefreshCw` (Redeploy / drift), `Power` (enable/disable), `ShieldCheck` (verified), `AlertTriangle` (rollback), `CheckCircle2` (step complete), `Loader2` (spinner, inherited), `ExternalLink` (browser handoff), `FileDiff` (diff preview) |
| Font | Display: **Fraunces** · Body: **Bricolage Grotesque** · Data: **JetBrains Mono** — unchanged |
| Motion | `framer-motion@11.15.0` — Phase 4 adds the `DeployProgressDrawer` slide-in + the step-pill color transition |
| Color scheme | Dark-only (`color-scheme: dark` in globals.css) — unchanged |

No new dependencies enter the tree for Phase 4 UI. Git operations use `simple-git@3.36.0` (already locked in `research/STACK.md`) on the server side; no UI-surface dependency.

**Source of truth:** `dashboard/tailwind.config.js`, `dashboard/app/globals.css`, `dashboard/app/_components/*`. Phase 4 MUST reuse these primitives. It MUST NOT introduce a new component library, new fonts, or new color tokens.

---

## Spacing Scale

Inherited verbatim from Phase 3. Re-stated here because Phase 4 introduces three new composite surfaces (Drawer, Diff panel, Health badge row) that reuse the same scale:

| Token | Tailwind | Value | New Phase 4 usage |
|-------|----------|-------|-------------------|
| xs | `gap-1` / `p-1` | 4px | Icon-to-label inside Deploy button and step pills |
| sm | `gap-2` / `p-2` | 8px | Step-pill row gaps; health-badge internal padding |
| md | `gap-4` / `p-4` | 16px | Routine-card action-bar gap; drawer step-row padding |
| lg | `gap-6` / `p-6` | 24px | Drawer side padding; diff-preview panel padding |
| xl | `gap-8` / `py-8` | 32px | Between sections in Save-to-repo modal body |
| 2xl | `py-10` | 40px | Inherited main content vertical padding (unchanged) |
| 3xl | `px-12` | 48px | Inherited main content horizontal padding (unchanged) |

**Exceptions:** none new. Phase 3's `py-10 = 40px` rhythm inherits to the landing page and routines page bodies.

**Touch targets:** Every action button on a routine card (Deploy / Run-now / Save-to-repo / enable toggle) MUST be ≥ 36px tall. The enable/disable `role="switch"` uses the exact same 44×24 pill pattern already shipped in `routines-client.tsx` (no redesign). The Deploy / Run-now / Save-to-repo buttons use `.btn` (≥ 36px) with icon + label.

---

## Typography

Inherited verbatim from Phase 3 — 4 sizes (11, 12, 14, 48 px), 4 inherited weights. No new sizes or weights introduced. The specific Phase 4 additions below all map onto existing tokens:

| New element | Size / Tailwind | Weight | Font | Role |
|-------------|-----------------|--------|------|------|
| Step-pill label ("WRITING", "LOADING") | 11 / `text-[11px]` | 500 via `font-medium` | JetBrains Mono uppercase tracked (`.label` utility) | 4-stage state machine progress indicator |
| Step-pill elapsed ms ("340ms") | 11 / `text-[11px]` | 400 | JetBrains Mono | Live elapsed timer per step |
| Rollback banner heading | 14 / `text-sm` | 600 `font-semibold` | Bricolage | "Deploy rolled back" |
| Rollback banner body | 12 / `text-xs` | 400 | Bricolage | Specific step + reason |
| Diff file path | 12 / `text-xs` | 400 | JetBrains Mono | `routines-codex/daily-brief/config.json` |
| Diff line stats (`+12 −3`) | 11 / `text-[11px]` | 500 | JetBrains Mono | Per-file row in `git diff --stat` preview |
| Health badge version | 11 / `text-[11px]` | 400 | JetBrains Mono | `codex 0.121.0` inside the pill |
| Drift badge label | 11 / `text-[11px]` | 500 | JetBrains Mono uppercase tracked | `REDEPLOY` |
| Toast success copy | 14 / `text-sm` | 500 | Bricolage | "Deployed `codex/daily-brief`" |

No display-size (48px) text is used in Phase 4 surfaces because none of them are primary pages — every surface is contained within an existing `PageHeader`ed route.

---

## Color

Inherited 60/30/10 split from Phase 3. Phase 4 adds **four specific color decisions** all drawn from the existing palette (no new tokens):

### Step-state color mapping (deploy state machine)

Every step in the 4-stage progress indicator MUST map to exactly one of these states, rendered via the existing pill primitives:

| State | Pill | Hex | Meaning |
|-------|------|-----|---------|
| Pending (not yet reached) | `.pill-muted` | `#5e6378` on `#1a1d2c` | Step hasn't started |
| Running (current step) | `.pill-aurora` + pulsing `Loader2` icon | `#7b9eff` | Step in progress, elapsed timer ticking |
| Succeeded | `.pill-green` + `CheckCircle2` icon | `#76d1a8` | Step finished cleanly |
| Rolled back | `.pill-red` + `AlertTriangle` icon | `#e87a7a` | This step failed OR a later step failed and this step was reverted |

**Rule:** A step transitioning from Succeeded → Rolled back MUST animate the color change (150ms ease-out). Silent color flip is a Pitfall #5 violation ("partial-success deploys").

### Rollback banner

When any step fails, the entire progress row is wrapped in a banner:

- `.panel` with `border-signal-red/50 bg-signal-red/5`
- Heading: `Deploy rolled back — {specific step} failed` (signal-red, 600)
- Body: `All artifacts removed. You can safely retry after fixing {specific cause}.`
- The banner does NOT auto-dismiss. It persists until the user clicks "Dismiss" or clicks "Retry deploy". This is a safety-critical signal — mirrors Phase 3's secret-scan panel pattern (persistent, not a toast).

### Drift badge

- `.pill-amber` (`#f3c282`) with `RefreshCw` icon — same amber as unavailable-runtime warnings in Phase 3. Amber is "needs attention, not dangerous." Pairs with helper row: `Bundle edited {relativeTime}; deployed artifact is older.`
- Drift is PASSIVE: cards render the badge on every server fetch (computed in `listRoutines()` via `mtime(bundle) > mtime(deployed artifact)`). No polling loop on the client. No toast on first detection.

### Health badge states (landing page)

Mirrors Phase 3 runtime-picker pattern verbatim — intentional consistency:

| State | Pill | When | Tooltip |
|-------|------|------|---------|
| Green | `.pill-green` + runtime name + version | `available: true && !warning` | `{runtime}: {version}` |
| Amber | `.pill-amber` + runtime name | `available: true && warning` | `{warning}. See AUTHORING.md → Runtime setup.` |
| Grey | `.pill-muted` + runtime name + `AlertCircle` icon | `available: false` | `{reason}. See AUTHORING.md → Runtime setup.` |
| Loading | `.pill-muted` + `Loader2` spinning | Health check not yet returned for this runtime | — |

### Accent reserved-for — Phase 4 additions

The dawn-400 (`#f3c282`) accent is still reserved per Phase 3. Phase 4 uses it ONLY for:

1. The **Deploy primary button** (`.btn-primary` with `Rocket` icon) when the routine is in Draft state
2. The **Redeploy primary button** (`.btn-primary` with `RefreshCw` icon) when the routine is in Drift state
3. The **"Confirm commit" button** in the Save-to-repo modal (only after the user has reviewed the diff)
4. Inherited focus rings (unchanged)

Accent MUST NOT appear on: Run-now button (that's `.btn-ghost` — secondary affordance), enable/disable toggle on-state (that's dawn-400 per existing Toggle component, inherited unchanged), diff line counts, or any pill.

### Destructive (`signal-red`) — Phase 4 additions

1. Rollback banner + rolled-back step pills (above)
2. Health-unavailable badges (inherited pattern from Phase 3 runtime picker)
3. The "Discard changes" button inside the Save-to-repo modal (if the user opened it and wants to abort)

Run-now is NOT destructive. Save-to-repo is NOT destructive (it never pushes, never touches files outside the staged path). Enable/disable toggle is NOT destructive (bootout is reversible with bootstrap — explicitly per Phase 3 discretion decision).

---

## Copywriting Contract

Every user-facing string in the five Phase 4 surfaces is pre-committed below. Executor MUST use these exact strings.

### Routine card (expanded for Phase 4)

The existing `routines-client.tsx` card structure is preserved; Phase 4 adds an **action bar** row below the existing content row, separated by `hairline`.

| Element | Copy | Notes |
|---------|------|-------|
| Action bar left (Draft state) | `Deploy` (primary, `Rocket` icon) | Never "Install", never "Publish" |
| Action bar left (Deployed state) | `Run now` (ghost, `Play` icon) + `Redeploy` visible only if drift detected | Run-now is primary affordance for a deployed routine |
| Action bar left (Drift state) | `Redeploy` (primary, `RefreshCw` icon) + `Run now` (ghost) | Redeploy takes primary slot when drift exists |
| Action bar right | `Save to repo` (ghost, `GitCommit` icon) + enable/disable toggle | Toggle preserves existing position |
| Status pill (Draft) | `.pill-muted` text `DRAFT` | Routine bundle on disk but never deployed |
| Status pill (Deployed) | `.pill-green` text `DEPLOYED` | `~/.sleepwalker/deploys/<slug>.state.json` says `verified` |
| Status pill (Drift) | `.pill-amber` text `DRIFT` + hover tooltip `Bundle edited {relative}; deployed artifact is older. Redeploy to sync.` | mtime comparison |
| Status pill (Disabled, deployed) | `.pill-muted` text `DISABLED` | Enable toggle off but plist still exists (bootout succeeded) |

### Deploy progress drawer (right-side slide-in)

The 4-stage state machine renders in a right-anchored drawer, triggered by clicking Deploy. Width: 420px on ≥ 1024px, full-width sheet on < 1024px.

| Element | Copy |
|---------|------|
| Drawer eyebrow | `DEPLOYING` |
| Drawer title | `{runtime}/{slug}` (mono, 14px) |
| Drawer subtitle (running) | `Watch each step complete. Failures auto-rollback.` |
| Drawer subtitle (success) | `Deployment verified. All four steps passed.` |
| Drawer subtitle (rolled back) | `Deploy rolled back — every artifact removed.` |
| Step 1 label | `PLANNING` · helper `Read bundle, resolve paths.` |
| Step 2 label | `WRITING` · helper `Write plist to ~/Library/LaunchAgents/` |
| Step 3 label | `LOADING` · helper `launchctl bootstrap gui/$UID` |
| Step 4 label | `VERIFIED` · helper `launchctl print confirms live state.` |
| Elapsed timer format | `{ms}ms` (≤ 999ms), `{s.s}s` (≥ 1s) — mono, moon-400 |
| Success footer CTA | `Close` (ghost) + `Run now` (primary, `Play` icon) — one-click chain from deploy to first run |
| Failure footer CTA | `Dismiss` (ghost) + `Retry deploy` (primary, `Rocket` icon) |
| Close keyboard | `Esc` closes drawer if deploy completed or rolled back; Esc is disabled while running (prevent accidental dismissal of live progress) |

### Run-now button behavior (per-runtime copy)

Run-now is a single button; feedback differs per runtime because two runtimes are browser handoffs and two are local fire-and-forget:

| Runtime | Button copy | On-click behavior | Toast copy |
|---------|-------------|-------------------|------------|
| `claude-routines` | `Run now` | Opens `handoffUrl` in new tab (browser tab opens to `claude.ai/code/routines/.../fire`) | `Opened Claude Routines — complete the fire in browser` (aurora pill, 6s) |
| `claude-desktop` | `Run now` | Server Action invokes `claude -p` via adapter; returns immediately | `Started {slug} on Claude Desktop` (signal-green pill, 4s) |
| `codex` | `Run now` | Server Action spawns supervisor detached; returns immediately | `Started {slug} on Codex — watch the Morning Queue` (signal-green pill, 4s) with link to `/?highlight={runtime}/{slug}` |
| `gemini` | `Run now` | Same as codex | `Started {slug} on Gemini — watch the Morning Queue` (signal-green pill, 4s) with link to `/?highlight={runtime}/{slug}` |

**Decision: toast + stay-put, not redirect.** The user is on `/routines` managing their fleet; redirecting them away to `/` breaks their flow. The toast includes a link to the Morning Queue for users who want immediate verification. The `highlight` query param makes the new run visually flash in the queue if the user does navigate there.

### Save-to-repo modal

Clicking `Save to repo` opens a modal. The modal has two visible stages: **Review** (shows diff) and **Confirm** (user types commit message, clicks confirm).

| Element | Copy |
|---------|------|
| Modal title | `Save to repo` |
| Stage 1 heading | `Review changes` |
| Stage 1 body (above diff) | `These files will be staged and committed. Nothing else in your working tree is touched, and nothing is pushed.` |
| Diff panel empty state | `No staged changes — this bundle is already in sync with HEAD.` |
| Diff panel non-empty heading | `{n} file{s} changed — {added} additions, {removed} deletions` (computed from `git diff --stat`) |
| Diff row format | `{path}   +{added} −{removed}` (mono, green + signal-red counts) |
| Stage 1 CTA | `Continue` (primary) + `Cancel` (ghost) |
| Stage 2 heading | `Commit message` |
| Stage 2 input label | `MESSAGE` |
| Stage 2 input placeholder | `feat(routines): add codex/{slug}` (auto-derived from runtime + slug and verb-inferred from diff — see Interaction Contracts) |
| Stage 2 input helper | `Conventional commit format preferred (feat: / fix: / docs:). No emoji. No AI attribution.` |
| Stage 2 CTA | `Commit` (primary, `GitCommit` icon) + `Back` (ghost) |
| Post-commit toast | `Committed {shortSha} — {message}` (signal-green pill, 6s) |
| Lock-busy state | `Another save-to-repo is in progress. Wait a moment and try again.` (amber, blocks stage 2 CTA) |

**"Never pushes" is reinforced visually** — the stage 2 subtitle reads: `This writes a local commit. Push manually with git push when you're ready.`

### Enable/disable toggle

Reuse the existing `Toggle` component in `routines-client.tsx` verbatim. Phase 4 does NOT redesign it. Change is semantic: where the toggle currently sets an `enabled` flag in `~/.sleepwalker/routines.json`, it now additionally triggers `launchctl bootout` (on disable) or `launchctl bootstrap` (on enable) via a Server Action.

| Element | Copy |
|---------|------|
| Toggle accessible name (on) | `Disable {slug}` (the action it performs) |
| Toggle accessible name (off) | `Enable {slug}` |
| Toggle busy state | Toggle shows reduced opacity + existing disabled cursor; no text change |
| Error toast (bootstrap failed) | `Couldn't enable {slug} — {launchctl reason}` (signal-red pill, 8s, stays until dismissed) |
| Error toast (bootout failed) | `Couldn't disable {slug} — {launchctl reason}` (same treatment) |

**Enable/disable is toggle-only on the card.** No second surface (no detail view in Phase 4 — deferred to a later milestone). Single source of truth eliminates the "which wins" reconciliation question.

### Landing-page health badge row

The landing page (`dashboard/app/page.tsx`, which is the Morning Queue route `/`) gains a row of four runtime badges, placed as an additional `meta` element passed to the existing `PageHeader`. This uses the `PageHeader` `meta` slot mechanism already established in v0.1, so no layout redesign is required.

| Element | Copy |
|---------|------|
| Row position | Inside `PageHeader meta` prop, below the subtitle, above the queue list |
| Badge order | `Claude Routines`, `Claude Desktop`, `Codex`, `Gemini` (frozen — matches `RUNTIMES` tuple in `slug.ts`) |
| Green badge text | `{Runtime name} · {version}` |
| Amber badge text | `{Runtime name}` (hover reveals warning) |
| Grey badge text | `{Runtime name} · not installed` (or specific reason, truncated to 40 chars) |
| Loading badge text | `{Runtime name} · checking…` (aurora spinner) |
| Click behavior (amber/grey) | **Inline tooltip on hover shows reason + fix instructions.** Click opens `AUTHORING.md → Runtime setup` anchor (same anchor the Phase 3 runtime-picker tooltip links to — intentional reuse). |
| Click behavior (green) | No-op (the badge is informational, not a button). |

**Decision: row of 4 pills inline with the existing meta row, not a separate section.** Rationale: landing page is already the Morning Queue — a "health section" would compete with queue content. Inline pills are the established pattern (`cloud queue inactive · configure GitHub in Settings` already lives there). Sidebar placement was rejected because sidebar is navigation, not status.

**Click behavior: tooltip + link, not a dedicated settings route.** Rationale: mirrors Phase 3 runtime-picker exactly. Adding a `/settings/runtime-health` route for Phase 4 would introduce a new surface with no unique content — AUTHORING.md is the canonical fix source.

### Toast / pill placement

Toasts are inline pills rendered in the `PageHeader meta` slot (not bottom-right overlay). This matches the existing `saved {slug} at {time}` pattern in settings and reuses the existing `PageHeader meta` rendering. No new toast library is introduced.

### Confirmation copy for every destructive / semi-destructive action

| Action | Title | Body | Destructive button | Cancel button |
|--------|-------|------|-------------------|---------------|
| Disable a deployed routine | `Disable {slug}?` | `This runs launchctl bootout — the routine will no longer fire on its cron. Your bundle on disk is unchanged. You can re-enable at any time.` | `Disable` (btn-danger) | `Keep enabled` (btn-ghost) |
| Cancel Save-to-repo after diff shown | `Discard this save?` | `The diff preview closes. No changes are staged or committed.` | `Discard` (btn-danger) | `Keep reviewing` (btn-ghost) |
| Retry deploy after rollback | (no confirm — retry is safe; rollback already cleaned state) | — | — | — |

**There is no confirm for Deploy itself.** Deploy is reversible (rollback on failure, undeploy on success). Confirming every click would train users to click-through. Phase 3 established this pattern for Save in the editor — Phase 4 inherits.

**There is no confirm for Run-now.** Run-now is a single invocation; user chose to click it. Hooks still gate external effects at runtime per Phase 2 supervisor contract.

---

## Layout Contract

### Routine card (existing surface, extended)

The existing `routines-client.tsx` card (read at 2026-04-19: single `.panel p-4` with content row + toggle) is EXTENDED with a hairline-separated action bar. No full rewrite — Phase 4 adds two rows and swaps the static `not installed` amber pill for a dynamic state pill.

```
┌──────────────────────────────────────────────────────────────────┐
│ {fleet-key}   {cron pill}   {policy pill}   {status pill}        │   existing row (Phase 4 adds status pill)
│ {description}                                                    │
│ {budget chars}                                                   │
│                                           [ enable toggle ]      │   existing right column (unchanged)
│──────────────────────────────────────────────────────────────────│   hairline (NEW, Phase 4)
│ [Deploy]  [Run now]                           [ Save to repo ]   │   NEW action bar (Phase 4)
└──────────────────────────────────────────────────────────────────┘
```

Action-bar-row layout: `flex items-center justify-between gap-4 pt-3 mt-3 border-t border-ink-600`.

When in Deploy-progress state (drawer open, this card is the target), the primary button is replaced with a disabled pill `.pill-aurora` reading `DEPLOYING {step}` with live elapsed. This is the "card-level progress stub" — the drawer has the full detail; the card echoes the current step so the card itself does not look frozen if the drawer is accidentally dismissed.

### Deploy progress drawer (new surface)

- Right-anchored slide-in drawer (framer-motion `x: 420 → 0`, spring damping 25, stiffness 200)
- Width: 420px on ≥ 1024px; full-width sheet on < 1024px
- Background: `.panel-raised` with `border-l border-ink-600 shadow-2xl`
- Position: `fixed inset-y-0 right-0 z-40`
- Backdrop: `fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-30` (clicking does NOT close while running; closes only after terminal state)
- Internal structure:
  ```
  ┌──────────────────────────────────────┐
  │ [eyebrow] DEPLOYING    [close ×]     │  p-6
  │ codex/daily-brief                    │  mono, 14px
  │ Watch each step complete. …          │  moon-400 12px
  ├──────────────────────────────────────┤  hairline
  │ ⏺ PLANNING    120ms                  │  step row, p-4
  │ ✓ WRITING     340ms                  │
  │ ⧗ LOADING     (running, 0.4s)        │
  │ ○ VERIFIED    —                      │
  ├──────────────────────────────────────┤
  │                                      │
  │ [Dismiss]        [Retry deploy]      │  sticky footer, p-6
  └──────────────────────────────────────┘
  ```
- Each step row: `grid grid-cols-[16px_1fr_auto] items-center gap-3 px-6 py-3`
- Left glyph: state icon (16px lucide) — `Circle` pending, `Loader2` running, `CheckCircle2` succeeded, `AlertTriangle` rolled-back
- Center: `.label` style step name + 12px moon-400 helper text
- Right: elapsed timer (mono 11px moon-400) or rollback reason (signal-red)

### Save-to-repo modal (new surface)

- Centered modal, `max-w-2xl`, `.panel-raised`, `p-0` (internal sections handle padding)
- Backdrop: `fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40`
- Close affordances: `Esc`, backdrop-click, or `×` in top-right corner
- Internal structure (stage 1 — Review):
  ```
  ┌──────────────────────────────────────────────────┐
  │ Save to repo                             [×]     │  p-6 border-b border-ink-600
  ├──────────────────────────────────────────────────┤
  │ Review changes                                   │  p-6 pb-2 (h2 semibold)
  │ These files will be staged …                     │  p-6 pt-0 moon-400 12px
  │                                                  │
  │ ┌──────────────────────────────────────────────┐ │  p-6
  │ │ routines-codex/daily-brief/config.json       │ │  diff panel — .panel mono 12px
  │ │   +12 −3                                     │ │  max-h-64 overflow-auto
  │ │ routines-codex/daily-brief/prompt.md         │ │
  │ │   +40 −0                                     │ │
  │ └──────────────────────────────────────────────┘ │
  │                                                  │
  ├──────────────────────────────────────────────────┤
  │ [Cancel]                    [Continue →]         │  p-6 border-t border-ink-600, flex justify-between
  └──────────────────────────────────────────────────┘
  ```
- Stage 2 (Confirm): same shell, diff collapses to a single-line summary `{n} files · +{a} −{d}`, expose commit-message textarea + submit.

### Landing-page health badge row (extension to existing PageHeader)

- NO new section, NO layout shift. The four badges become additional children of the existing `PageHeader meta` slot.
- Row placement: horizontally on ≥ 640px (flex-wrap), vertical stack on < 640px
- Total badges: up to 4 runtime badges + existing cloud-queue pills (`cloud queue inactive`, `cloud poll failed`)
- `meta` wrapper: `flex flex-wrap items-center gap-2`
- First paint: all four badges render in Loading state (aurora pill with spinner) — SSR cannot block on `healthCheckAll()` because that can take 500–2000ms. The server component fires the call and streams the result via React Suspense, OR the component renders a client-side fetch (`useEffect` + `fetch('/api/health/all')`). **Locked decision: client-side fetch.** Rationale: `dashboard/app/page.tsx` already uses `force-dynamic` and renders the queue server-side; adding a 2s health-check wait to the server render would slow the queue to unusable. Client-side fetch with Loading pills gives instant queue + progressive health resolution.

### Drift detection render (no new surface)

- No toast, no banner, no dedicated row. Drift is rendered ONLY as the `DRIFT` pill on the affected routine card PLUS the `Redeploy` primary button replacing `Deploy`.
- **Rationale for no top-of-page warning row:** drift on one routine shouldn't alert the entire fleet. Per-card display is targeted, non-intrusive, and discoverable. If the user has 10 routines and 3 have drift, they see 3 amber pills — this is proportional.

---

## Interaction Contracts

### Deploy state machine (DEPL-01, DEPL-02)

**Trigger:** Click `Deploy` or `Redeploy` on a routine card.

**Client flow:**
1. Open `DeployProgressDrawer` immediately with step 1 in Running state.
2. POST to `/api/deploy` (or Server Action `deployRoutine`) with `{runtime, slug}`.
3. Poll `GET /api/deploy/{slug}/state` every **500ms** until state is terminal (`verified` or `rolled-back`).
4. On each poll: update step pills in drawer based on state file `~/.sleepwalker/deploys/{slug}.state.json` (shape defined by Phase 2 research — `{step, stepStartedAt, elapsedMs, succeededSteps[], failedStep?, error?}`).
5. On terminal success (`verified`): swap drawer subtitle, footer CTAs become `Close` + `Run now`, close drawer on either. Card status pill flips from `DRAFT` or `DRIFT` to `DEPLOYED`.
6. On terminal failure (`rolled-back`): render rollback banner inside drawer, footer CTAs become `Dismiss` + `Retry deploy`. Card returns to prior state (`DRAFT` if was Draft, `DRIFT` if was Drift).

**Polling interval rationale:** 500ms matches Phase 3 autosave debounce (established cadence). The 4 deploy steps total ~200–800ms in the happy path, so 2–4 polls is sufficient. No SSE, no WebSocket (explicit anti-pattern per research/STACK.md — polling is the rule for overnight-agent cadence).

**Rollback visualization (critical):**
- Running step → animates from aurora spinner to `.pill-red` with `AlertTriangle` (150ms ease-out)
- Any previously-succeeded steps → animate from `.pill-green` to `.pill-red` with the same transition (cascading right-to-left, 80ms stagger) so the user visually parses "these succeeded steps have been undone"
- Rollback banner slides in from top of drawer (framer-motion `y: -8 → 0`, opacity fade, 200ms)
- Screen-reader announcement: `role="alert"` on the rollback banner announces "Deploy rolled back — {step} failed"

**Per-step timing accuracy:** The elapsed timer ticks every 100ms (requestAnimationFrame throttled). When polling updates show a step has succeeded, the timer freezes at the server-reported `elapsedMs`, not the client's local tick count (server is authoritative).

### Run-now (DEPL-04)

**Trigger:** Click `Run now` on a routine card.

**Per-runtime behavior:**
- `claude-routines`: Server Action returns `{ok: true, handoffUrl}`; client opens URL in new tab via `window.open(url, "_blank", "noopener,noreferrer")`. Show aurora toast.
- `claude-desktop`: Server Action invokes `claude -p` via adapter; returns `{ok: true, runId}`. Show green toast.
- `codex` / `gemini`: Server Action spawns supervisor detached; returns `{ok: true, runId}` immediately. Show green toast with `?highlight=` link.

**Error handling:** On any `{ok: false, error}`, show red pill with `{error}`; do NOT auto-retry.

**Anti-double-click:** Button enters busy state (`.btn` disabled + spinner) for 800ms minimum after click. Further clicks during the busy window are ignored (not queued).

### Save-to-repo (REPO-01)

**Trigger:** Click `Save to repo` on a routine card.

**Stage 1 (Review) flow:**
1. Modal opens with Loading state in the diff panel.
2. Server Action `previewSaveToRepo({runtime, slug})` runs:
   - Acquires `~/.sleepwalker/git.lock` via `flock -n` (non-blocking). If lock is held, returns `{ok: false, error: "lock-busy"}` and modal shows amber `Another save-to-repo is in progress…` message + stage 1 CTA disabled.
   - Stages only `routines-{runtime}/{slug}/*` via `git add -- routines-{runtime}/{slug}/`.
   - Runs `git diff --cached --stat` on that path only.
   - Returns `{ok: true, files: [{path, added, removed}], totals: {a, d}}` — does NOT release the lock yet (held until commit or cancel).
3. Modal renders diff panel.
4. User clicks `Cancel`: calls `releaseSaveLock` Server Action which runs `git reset` on the staged path and releases flock.
5. User clicks `Continue`: progresses to Stage 2 (lock still held, staged changes still pending commit).

**Stage 2 (Confirm) flow:**
1. Commit-message input prefilled with `feat(routines): add {runtime}/{slug}` (infers `add` if no prior commit touched the path; `update` otherwise — Server Action computes via `git log --oneline -- routines-{runtime}/{slug}/`).
2. User edits message freely. Input is a `<textarea rows="3">` to allow body lines.
3. User clicks `Commit`: Server Action `commitSaveToRepo({message})` runs `git commit -m "{message}"` on the already-staged changes, releases flock, returns `{ok: true, sha, shortSha}`.
4. Modal closes. Toast appears: `Committed {shortSha} — {message.split('\n')[0]}`.

**Never-push invariants:**
- `git push` is never invoked from any Server Action in Phase 4.
- The modal has no "Push after commit" checkbox. There is no push affordance anywhere in the UI.
- Stage 2 subtitle re-states: `This writes a local commit. Push manually with git push when you're ready.`

**Never-sweep invariant:**
- `git add -- routines-{runtime}/{slug}/` uses the `--` separator and explicit path.
- The preview panel shows every file the commit will include. If the path list contains anything outside `routines-{runtime}/{slug}/`, that is a Phase 2 adapter bug and surfaces as-is to the user.
- The user's unrelated uncommitted work is never staged because `git add -- <path>` only touches that path. Save-to-repo does not run `git add -A` or `git add .`.

### Drift detection (DEPL-03)

**Detection (server-side, every page render):**
- `listRoutines()` extends to compare mtime:
  ```ts
  const bundleMtime = await fs.stat(bundleDir).then(s => s.mtimeMs);
  const deployState = await readDeployState(slug); // null if never deployed
  const driftFlag = deployState?.verifiedAt && bundleMtime > deployState.verifiedAt;
  ```
- Returns `status: "draft" | "deployed" | "drift"` per routine.

**Client render:**
- Card reads `status` and renders the appropriate pill + swaps Deploy/Redeploy button.
- No client-side polling. Drift only updates on navigation / browser refresh / after an editor save (which auto-navigates to `/routines`).
- **Rationale for passive detection:** drift is not time-sensitive. The agent still fires on its old prompt until redeployed; that's not an emergency. A toast-on-load would be noise; a persistent badge is exactly the right urgency level.

### Enable/disable toggle (DEPL-05)

**Trigger:** Click the existing toggle switch on a routine card.

**Flow:**
1. Optimistic UI: toggle flips immediately; card enters busy state (reduced opacity on action bar; toggle disabled during busy window).
2. Server Action `setRoutineEnabled({runtime, slug, enabled})` runs:
   - On `enabled=true`: adapter `.deploy(bundle)` if not deployed (first enable) OR `launchctl bootstrap` on existing plist (re-enable).
   - On `enabled=false`: adapter runs `launchctl bootout` (plist remains on disk, just unloaded).
   - Persists `enabled` flag in `config.json` per runtime convention.
3. On success: clear busy state; toggle stays in new position.
4. On error: revert toggle optimistically; show red toast `{error}`; card exits busy.

**No confirm for enable.** Enable is safe. Disable is confirmed (see Confirmation copy table above) because disabling can cause missed scheduled runs for a period the user might not expect.

**First-enable auto-deploy:** If the routine is in Draft state and user clicks the enable toggle, the Deploy drawer opens first (deploy auto-starts). This keeps the invariant "a routine is not enabled unless it is deployed and verified" — otherwise the toggle would silently call deploy + bootstrap with no progress UI.

### Health badge row (HLTH-01)

**Mount:**
1. Server renders landing page with four Loading pills in the meta slot (no blocking).
2. Client component `<HealthBadgeRow />` mounts, fires `fetch("/api/health/all")`.
3. API route calls `healthCheckAll()` and returns `Promise.allSettled` results — shape: `HealthStatus[]` with `{runtime, available, version?, warning?, reason?}`.
4. Each badge updates independently as the response arrives (the API returns once all four are settled; per-runtime streaming is NOT used — each check is bounded to 2s by Phase 2 adapters).
5. After first response, cache in `sessionStorage` for 60s to avoid re-checking on every navigation back to the landing page. On expiry, re-fetch silently (badges remain in their last-known state with a subtle `opacity-70` dim until the new response arrives).

**Failure modes:**
- API route itself fails (500): badges stay in Loading state for 3s, then flip to grey with text `health check failed · retry` + a `RefreshCw` click-to-retry affordance.
- Individual runtime `healthCheck()` throws: caught by `Promise.allSettled`; that runtime's badge renders grey with reason `healthCheck threw: {message}`.

**Keyboard accessibility:**
- Each badge is a `<button>` (not a `<div>`) when it has a tooltip (amber/grey states). Tab order: after the page title, before the queue list.
- Tooltip appears on `focus` and `hover`, dismissed on `blur` / `Escape`.

### Keyboard shortcuts

Inherited from Phase 3 plus three new Phase 4 shortcuts:

| Key | Action | Context |
|-----|--------|---------|
| `Esc` | Close drawer (if terminal state) / modal / tooltip | Any Phase 4 overlay |
| `Cmd/Ctrl+Enter` | Submit commit (inside Save-to-repo stage 2) | Stage 2 commit message textarea focused |
| `r` then `n` | Focus Run-now on the first deployed routine card | Routines page, no input focused |

(Shortcuts marked `r n` are a stretch goal — optional for phase exit. Not required in success criteria.)

### Animation and motion

- All color transitions on step pills: 150ms ease-out.
- Drawer open/close: framer-motion spring (damping 25, stiffness 200).
- Modal open/close: scale 0.98 → 1 + opacity 0 → 1, 180ms ease-out.
- Toast enter/exit: slide from top + fade, 200ms.
- Rollback cascade: 80ms stagger across reverted steps.
- `prefers-reduced-motion`: all transitions become opacity-only, 120ms (framer-motion `MotionConfig reducedMotion="user"`).

### Focus management

- On drawer open: focus the `×` close button (keyboardable dismiss when terminal state).
- On modal open (Save-to-repo stage 1): focus the `Continue` button after diff panel loads.
- On modal open (Save-to-repo stage 2): focus the commit-message textarea, cursor at end.
- On modal close: restore focus to the button that triggered it.
- On toast with action link: focus is NOT stolen (toasts are informational, not blocking).

### Polling and background work

- Deploy state: 500ms poll, cleared on terminal state.
- Drift detection: per page render (server), no client poll.
- Health badges: one fetch on mount, 60s sessionStorage cache, silent background refresh on expiry.
- Git lock: not polled — acquired once per save-to-repo flow, held until commit or cancel.

---

## Component Inventory

Components the Executor builds this phase (all live under `dashboard/app/` alongside existing routes):

| Component | File | Client/Server | Responsibility |
|-----------|------|---------------|----------------|
| `RoutinesPage` (extended) | `dashboard/app/routines/page.tsx` | Server | Reads all bundles across 4 runtimes (existing `listRoutines` extended to call Phase 3 `bundles.ts::listBundles()` + drift mtime comparison); passes `{bundle, status, deployState}[]` to client |
| `RoutinesClient` (extended) | `dashboard/app/routines/routines-client.tsx` | Client | Owns card layout including new action bar. Delegates per-card interaction to specialized components below |
| `RoutineActionBar` | `dashboard/app/routines/_components/routine-action-bar.tsx` | Client | Renders Deploy/Redeploy/Run-now/Save-to-repo/toggle based on `status` |
| `DeployProgressDrawer` | `dashboard/app/routines/_components/deploy-progress-drawer.tsx` | Client | Right-anchored drawer with 4-step progress + rollback banner + elapsed timers |
| `DeployStepPill` | `dashboard/app/routines/_components/deploy-step-pill.tsx` | Client | Single step row (icon + label + elapsed) with state-driven color transitions |
| `SaveToRepoModal` | `dashboard/app/routines/_components/save-to-repo-modal.tsx` | Client | Two-stage modal (Review → Confirm) with `git diff --stat` preview |
| `DiffStatPanel` | `dashboard/app/routines/_components/diff-stat-panel.tsx` | Client | Renders `{files: [{path, added, removed}]}` as a scrollable table |
| `RunNowButton` | `dashboard/app/routines/_components/run-now-button.tsx` | Client | Per-runtime click handler (opens handoff URL or fires server action) + toast dispatch |
| `StatusPill` | `dashboard/app/routines/_components/status-pill.tsx` | Client | Renders Draft/Deployed/Drift/Disabled with appropriate pill variant |
| `HealthBadgeRow` | `dashboard/app/_components/health-badge-row.tsx` | Client | Four badges, fetches `/api/health/all` on mount, sessionStorage cache |
| `HealthBadge` | `dashboard/app/_components/health-badge.tsx` | Client | Single runtime badge with green/amber/grey/loading state + tooltip |
| `Toast` (reuse if exists, else new) | `dashboard/app/_components/toast.tsx` | Client | Used ONLY for the transient success/error messages; inline-pill style matches existing `saved {slug}` pattern in settings-client |
| `ConfirmDialog` | `dashboard/app/_components/confirm-dialog.tsx` | Client | Shared confirm modal used by disable-toggle and Save-to-repo cancel |

Server Actions (live under `dashboard/app/routines/actions.ts`):

| Action | Purpose |
|--------|---------|
| `deployRoutine({runtime, slug})` | Drives 4-step state machine; writes `~/.sleepwalker/deploys/{slug}.state.json`; auto-rollback on any step failure |
| `getDeployState({slug})` | Read-only state poll (called every 500ms during active deploy) |
| `runNowRoutine({runtime, slug})` | Dispatches to `getAdapter(runtime).runNow(bundle)` |
| `setRoutineEnabled({runtime, slug, enabled})` | bootstrap/bootout + config.json persist |
| `previewSaveToRepo({runtime, slug})` | Acquires flock, stages path, returns `git diff --cached --stat` |
| `commitSaveToRepo({message})` | Commits staged changes, releases flock |
| `releaseSaveLock({runtime, slug})` | `git reset` on the staged path + release flock (cancel path) |

API route (live under `dashboard/app/api/health/all/route.ts`):

| Route | Purpose |
|-------|---------|
| `GET /api/health/all` | Wraps `healthCheckAll()`; returns `{statuses: HealthStatus[], checkedAt: iso}` |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not initialized) | not applicable |
| third-party | none | not applicable |

No third-party component registries are used by this phase. All UI primitives are authored in-repo. The new `simple-git@3.36.0` and `execa@9.6.1` server-side dependencies (already locked in `research/STACK.md`) do not have UI surfaces and require no UI-layer safety gate. `framer-motion@11.15.0` is pre-existing.

---

## Pre-Populated Sources

| Decision | Source |
|----------|--------|
| Design system (palette, fonts, spacing, primitives, motion) | Phase 3 `03-UI-SPEC.md` — inherited verbatim |
| Focus ring + `:focus-visible` dawn-400 outline | `dashboard/app/globals.css` (global) |
| Card structure baseline | `dashboard/app/routines/routines-client.tsx` (existing `.panel p-4`) |
| PageHeader + meta slot pattern | `dashboard/app/_components/page-header.tsx` (inherited) |
| Toggle component (enable/disable) | `dashboard/app/routines/routines-client.tsx` (reused verbatim) |
| Inline-pill toast pattern | `dashboard/app/settings/settings-client.tsx` (reused) |
| 4-step state machine (`planning → writing → loading → verified`) | REQUIREMENTS.md DEPL-01 + Phase 2 CONTEXT.md decision "Deploy is a 4-phase state machine" |
| Auto-rollback contract | REQUIREMENTS.md DEPL-02 + Phase 2 CONTEXT.md Pitfall #5 |
| Drift = mtime(bundle) > mtime(deployed) | REQUIREMENTS.md DEPL-03 |
| `git diff --stat` preview BEFORE confirm | ROADMAP.md Phase 4 Success Criterion #4 |
| Never-auto-push invariant | REQUIREMENTS.md REPO-01 |
| Never-sweep-unrelated-uncommitted invariant | ROADMAP.md Phase 4 SC#4 |
| Health badge brew-doctor pattern (green / grey / link) | REQUIREMENTS.md HLTH-01 |
| Four runtimes frozen set | `slug.ts RUNTIMES` tuple + REQUIREMENTS.md |
| `HealthStatus.warning` field (amber badge trigger) | `dashboard/lib/runtime-adapters/types.ts` (Phase 2 Plan 09) |
| Run-now per-runtime behavior (handoff URL vs local spawn) | Phase 2 adapters `claude-routines.ts`, `claude-desktop.ts`, `codex.ts`, `gemini.ts` |
| Result-object error returns (no throws for UI paths) | Project-wide convention (CLAUDE.md) |
| 500ms polling cadence | Phase 3 `03-UI-SPEC.md` (autosave debounce — cadence reused) |
| Save-to-repo modal (not inline expanding diff or dedicated page) | Discretion — resolved by researcher; rationale: REPO-01 requires diff preview BEFORE confirm, and a dedicated page creates navigation overhead for a per-card action |
| Deploy progress drawer (not modal, not inline pills, not new route) | Discretion — resolved; rationale: state machine has 4 steps + rollback which needs a dedicated surface, but creating a `/deploy/{slug}` route for a 500ms–2s interaction is overkill; right-anchored drawer lets user keep context |
| Rollback visualization (color cascade + persistent banner, not toast) | Discretion — resolved; rationale: safety-critical per Phase 2 CONTEXT.md; silent revert would violate "no surprises" ethos |
| Run-now: toast + stay-put (not redirect to queue) | Discretion — resolved; rationale: redirecting breaks the user's fleet-management flow; toast with `?highlight=` link gives opt-in navigation |
| Drift surface: per-card badge only (no top-of-page warning row) | Discretion — resolved; rationale: drift is per-routine, not fleet-wide; per-card targeting is proportional |
| Health badges: inline pills in existing `PageHeader meta` (not sidebar, not dedicated section) | Discretion — resolved; rationale: established pattern for status in meta slot (`cloud queue inactive` etc.) |
| Health badge "not ready" click: tooltip with fix + link to AUTHORING.md | Discretion — resolved; rationale: mirrors Phase 3 runtime-picker exactly for intentional consistency |
| Enable/disable lives ONLY on the card (no detail view) | Discretion — resolved; rationale: no detail view exists in Phase 4; single source of truth eliminates reconciliation |
| First-enable auto-deploy | Discretion — resolved; rationale: invariant "enabled implies deployed+verified" is simpler than exposing two states the user must reason about |
| Client-side fetch for health (not server-blocking) | Discretion — resolved; rationale: `healthCheckAll()` can take 2s; blocking SSR slows the Morning Queue to unusable |
| 60s sessionStorage cache for health | Discretion — resolved; rationale: avoids re-checking on navigation back; landing page is visited frequently |
| No push affordance anywhere in UI | REPO-01 hard invariant (explicit in REQUIREMENTS.md) |
| `Cmd/Ctrl+Enter` submits commit | Discretion — resolved; rationale: standard multi-line form pattern, Cmd/Ctrl+S already bound to editor Save |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (no new sizes or weights; all mapped onto Phase 3 tokens)
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS (no shadcn, no third-party UI registries)

**Approval:** approved 2026-04-19 by gsd-ui-checker

---

*Phase 4 UI contract authored 2026-04-19 by gsd-ui-researcher. Inherits design-system primitives verbatim from Phase 3. Consumed by gsd-ui-checker, gsd-planner, gsd-executor, and gsd-ui-auditor. Any divergence during execution must be recorded as a CONTEXT.md amendment before implementation.*
