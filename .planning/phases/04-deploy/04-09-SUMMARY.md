---
phase: 04-deploy
plan: 09
subsystem: routes+integration+exit-gate
tags: [deploy, routes, exit-gate, wiring, phase-seal]
requires:
  - 04-01 (deploy-state.ts primitives)
  - 04-02 (save-to-repo.ts library)
  - 04-03 (/api/health/all Route Handler)
  - 04-04 (routines/actions.ts 4 Server Actions)
  - 04-05 (save-to-repo Server Action wrappers)
  - 04-06 (HealthBadgeRow + HealthBadge client components)
  - 04-07 (DeployProgressDrawer + DeployStepPill + StatusPill + RunNowButton)
  - 04-08 (DiffStatPanel + ConfirmDialog + SaveToRepoModal)
provides:
  - "listRoutinesAsync() widening enumeration to all 4 runtimes with drift-aware status"
  - "RoutineActionBar composing Deploy / Redeploy / RunNow / Save-to-repo / enable-disable Toggle"
  - "/routines cards render hairline-separated action bar + StatusPill replacing static amber pill"
  - "Landing page PageHeader meta array mounts HealthBadgeRow as first entry"
  - "Phase 4 exit gate: typecheck + 336/336 suite + 28/0 supervisor + 0-line frozen-surface diff"
affects:
  - dashboard/app/routines/page.tsx (async)
  - dashboard/app/routines/routines-client.tsx
  - dashboard/app/page.tsx
  - dashboard/lib/routines.ts
  - dashboard/app/routines/_components/routine-action-bar.tsx (new)
  - dashboard/tests/routines-page.test.ts (new)
tech-stack:
  added: []
  patterns:
    - "widened-async-listing (sync v0.1 listRoutines preserved alongside new async variant)"
    - "action-bar composition (hairline-separated row with conditional left-side dispatch)"
    - "server-component await-list + pass-to-client (App Router async server components)"
key-files:
  created:
    - dashboard/app/routines/_components/routine-action-bar.tsx
    - dashboard/tests/routines-page.test.ts
    - .planning/phases/04-deploy/04-09-SUMMARY.md
  modified:
    - dashboard/lib/routines.ts
    - dashboard/app/routines/page.tsx
    - dashboard/app/routines/routines-client.tsx
    - dashboard/app/page.tsx
    - .planning/phases/04-deploy/04-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "listRoutinesAsync additive — v0.1 sync listRoutines preserved (avoids rippling async through settings/page + api/routines which don't need Phase 4 shape)"
  - "RoutineActionBar local ActionBarToggle duplicates v0.1 visual (avoids circular import with routines-client.tsx)"
  - "Server-component page.tsx flipped to `async` — only caller that needs the widened shape"
metrics:
  duration_min: 8
  completed: 2026-04-20
---

# Phase 04 Plan 09: Phase Exit Gate + Integration Wiring Summary

Wire every Phase 4 primitive (deploy-state lib, save-to-repo lib, Route Handler, 11 client components, 7 Server Actions) into the live dashboard surface and seal Phase 4 with the 4-step automated exit gate. Two atomic feat commits (`1f1feb6`, `71f920d`) + one docs-only metadata commit land the remaining wiring, the last integration test, and the approval flip across 4 planning artifacts. Dashboard suite 332 → 336 green (+4 new blocks in tests/routines-page.test.ts), supervisor harness 28/0 passing, frozen-surface diff 0 lines across 24 enumerated v0.1 + Phase 2/3 paths vs PHASE4_BASE `8707433^`. All 7 Phase 4 requirements (DEPL-01 + DEPL-02 + DEPL-03 + DEPL-04 + DEPL-05 + REPO-01 + HLTH-01) flipped from Partial/Pending to Complete.

## What Shipped

### dashboard/lib/routines.ts — widened enumeration

v0.1 `listRoutines()` returns sync `Routine[]` for local-only claude-desktop repo templates + installed scheduled tasks; preserved byte-compatible for settings/page.tsx + api/routines/route.ts.

Net-new async variant `listRoutinesAsync(): Promise<ListedRoutine[]>` composes:
1. v0.1 local routines verbatim + drift-aware `status` attached via `computeStatus({runtime: "claude-desktop", slug, bundleDir, enabled})` (defaults to "draft" when no deploy-state file exists).
2. v0.2 codex + gemini + claude-routines bundles enumerated via `listBundles()` from dashboard/lib/bundles.ts. Each bundle carries a computed `RoutineStatus` + optional `DeployState`.

Two private helpers parse per-runtime enabled-flag storage:
- `readBundleEnabled(runtime, bundleDir)`: codex/gemini read `config.json.enabled` (default true); claude-routines reads `~/.sleepwalker/routines.json archived_fleets` with INVERSE semantics (presence = disabled); claude-desktop delegates to `readSettings().enabled_routines` with the v0.1 `sleepwalker-` prefix convention.
- `readBundleCron(runtime, bundleDir)`: codex/gemini from `config.json.schedule`; claude-routines/claude-desktop parse SKILL.md `schedule:` frontmatter line; both fall back to `0 9 * * *` matching the v0.1 STARTER_DEFAULTS fallback.

The widened `ListedRoutine` interface carries `{id, fleet, runtime, slug, name, description, enabled, installed, defaultCron, defaultPolicy, defaultBudget, source, status, deployState, bundleDir}` — all v0.1 Routine fields preserved + 4 new fields (`fleet`, `runtime`, `slug`, `status`, `deployState`, `bundleDir`) + widened `source` to include `"bundle"` for v0.2 codex/gemini/claude-routines entries.

### dashboard/app/routines/_components/routine-action-bar.tsx (NEW)

The per-card hairline row consumers for every Phase 4 UI piece. Props: `{routine: ListedRoutine, onChange?: () => void}`. Internal state: `{deployOpen, saveOpen, confirmDisableOpen, optimisticEnabled, busy}`.

Left-side dispatch (primary affordance):
- `status === "draft"` → `[Deploy (btn-primary, Rocket)]` → opens DeployProgressDrawer
- `status === "drift"` → `[Redeploy (btn-primary, RefreshCw)]` + `<RunNowButton />`
- `status === "deployed"` OR `"disabled"` → `<RunNowButton disabled={status==="disabled"} />`

Right-side (secondary):
- `[Save to repo (btn-ghost, GitCommit)]` → opens SaveToRepoModal
- `<ActionBarToggle>` (local Toggle variant matching v0.1 visual byte-for-byte) → routes through `handleToggle(nextEnabled)`:
  - `nextEnabled && status === "draft"` → opens DeployProgressDrawer (first-enable auto-deploy)
  - `!nextEnabled && (deployed || drift)` → opens ConfirmDialog with UI-SPEC line 259 copy
  - Otherwise → calls `setRoutineEnabled` directly with optimistic state

`ActionBarToggle` is a local component (not imported from routines-client) to avoid a circular import; visual contract matches the v0.1 Toggle byte-for-byte.

### dashboard/app/routines/routines-client.tsx — extended

Input prop flipped from `Routine[]` to `ListedRoutine[]`. Upper metadata row preserved visually EXCEPT the static amber `not installed` pill is replaced by a dynamic `<StatusPill status={r.status} />` (Plan 04-07 component). For claude-desktop-only cards (where v0.1 `installed` semantics still apply) the `not installed` pill is kept as a secondary cue alongside the StatusPill. Description renders only when non-empty so v0.2 bundles without metadata don't show a blank line.

Appended below the upper row:
```tsx
<RoutineActionBar routine={r} onChange={() => setNonce((n) => n + 1)} />
```

`nonce` + `key={nonce}` forces a client-side re-render after any action-bar state change. `force-dynamic` on the page guarantees a fresh server read on next navigation.

The v0.1 fetch-to-/api/routines POST path is REMOVED — Server Actions replace it. `setEnabled` + `api/routines/route.ts` remain intact for any other v0.1 consumer.

### dashboard/app/routines/page.tsx — async server component

Flipped to `export default async function RoutinesPage()` with `await listRoutinesAsync()`. PageHeader eyebrow updated from "Tier B / Desktop" to "Fleet / Multi-runtime" + title from "Local Routines" to "Routines" to reflect that all 4 runtimes render here now. `force-dynamic` preserved.

### dashboard/app/page.tsx — landing page mount

HealthBadgeRow prepended to PageHeader meta array as the first entry:
```tsx
const meta: React.ReactNode[] = [
  <HealthBadgeRow key="health" />,
];
```

`<HealthBadgeRow>` is a `"use client"` component that owns its own fetch lifecycle (60s sessionStorage cache + window-focus refetch + per-badge manual refresh). No server-side `healthCheckAll` call — the client fetches `/api/health/all` on mount. Server-side request path: zero changes to `aggregateQueue` / `hasGithubConfig` flow.

### dashboard/tests/routines-page.test.ts (NEW — 4 it() blocks)

VALIDATION row 11 "status per bundle" covered across 3 flows:
1. `drift when bundle mtime is newer than verifiedAt` — seed bundle + write deploy-state with old verifiedAt + touch prompt.md → assert `routine.status === "drift"`
2. `deployed when verifiedAt is newer than bundle mtime` — seed bundle + write deploy-state with future verifiedAt → assert `"deployed"`
3. `draft when no deploy state exists` — seed bundle only → assert `"draft"`

Plus a 4-runtime fan-out block that seeds one bundle per runtime and asserts `runtimes.size >= 3` (claude-desktop is cwd-sensitive to the repo-local scan; the other three are deterministic).

Pattern mirrors `tests/bundles.test.ts`: fresh `mkdtempSync` repo as `cwd` per test + `makeTempHome()` + `ensureSleepwalkerDir(env.home)` to isolate every state file touch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Architectural simplification] Kept v0.1 listRoutines() sync; added listRoutinesAsync() instead of converting in-place**

- **Found during:** Task 1 plan review
- **Issue:** The plan's primary suggestion was to convert `listRoutines()` to `async` and update all callers. Callers include `app/settings/page.tsx` (server component — easy), `app/api/routines/route.ts` (Route Handler — easy), but both consume only the v0.1 `Routine` shape; neither needs Phase 4's widened `ListedRoutine` type. Converting the shared export to async would ripple type changes through 2 files that derive zero value from the widening.
- **Fix:** Added `listRoutinesAsync()` as a siblings export. v0.1 consumers continue importing `listRoutines`, `Routine`, `setEnabled`. `app/routines/page.tsx` is the sole caller of the async variant.
- **Rationale:** Plan 04-09 §Task 1 `<action>` step 1 explicitly blessed this fallback: *"If this ripples too far, keep listRoutines sync and add a new listRoutinesAsync() used only by the page.tsx server component."*
- **Files modified:** dashboard/lib/routines.ts (added ListedRoutine type + async variant); dashboard/app/routines/page.tsx (awaits async variant)

### No other deviations

Zero Rule 1 bugs. Zero Rule 2 missing-critical auto-fixes. Zero Rule 4 architectural decisions. Zero auth gates. Plan executed exactly as written outside the Rule 3 documented above.

## Phase 4 Exit Gate Results

All 4 automated gate steps green:

### 1. Typecheck

```
> sleepwalker-dashboard@0.1.0 typecheck
> tsc --noEmit
(no output = exit 0)
```

### 2. Full dashboard suite

```
 Test Files  38 passed (38)
      Tests  336 passed (336)
   Duration  10.54s
```

+4 blocks from tests/routines-page.test.ts (332 → 336).

### 3. Supervisor harness (Phase 2 no regression)

```
──────────────────────────────────────
  Results: 28 pass / 0 fail
──────────────────────────────────────
all supervisor tests passed
```

### 4. Frozen-surface diff

```
PHASE4_BASE=$(git log --reverse --diff-filter=A --format="%H" -- dashboard/lib/deploy-state.ts | head -1)^
# resolves to 8707433^
git diff --stat "$PHASE4_BASE" HEAD -- <24 enumerated v0.1 + Phase 2/3 paths>
# exit with no output = 0 lines changed
```

24 paths checked:
- install.sh
- hooks/sleepwalker-{defer-run,budget-spent,audit-write}.sh + hooks/_detect_fleet.sh
- hooks/tests/{supervisor,defer,budget,audit}-tests.sh
- dashboard/lib/runtime-adapters/{types,index,slug,launchd-writer,claude-routines,claude-desktop,codex,gemini}.ts
- dashboard/lib/{bundles,atomic-write,secret-scan,secret-patterns,bundle-schema}.ts
- dashboard/app/editor/actions.ts
- bin/sleepwalker-run-cli

All zero-line diff — Phase 4 is strictly additive. Phase 2 frozen surface untouched (no supervisor/hook/adapter/launchd-writer modifications). Phase 3 frozen surface untouched (no editor/bundle/atomic-write/secret-scan modifications).

## Requirements Flipped

All 7 Phase 4 requirements moved to Complete:

| Requirement | From | To | Evidence |
|-------------|------|-----|----------|
| DEPL-01 | Partial | Complete | 04-01 + 04-04 + 04-07 + 04-09 wired; deploy-progress-drawer stops polling on terminal (`b22444c`) |
| DEPL-02 | Partial | Complete | 04-04 rollback orchestrator + 04-07 role=alert banner + 04-09 wired |
| DEPL-03 | Pending | Complete | 04-01 drift math + 04-07 StatusPill + 04-09 listRoutinesAsync + status-per-bundle test (`71f920d`) |
| DEPL-04 | Partial | Complete | 04-04 runNowRoutine + 04-07 RunNowButton + 04-09 wired into RoutineActionBar |
| DEPL-05 | Partial | Complete | 04-04 setRoutineEnabled + 04-08 ConfirmDialog + 04-09 routes Draft-enable to Deploy drawer |
| REPO-01 | Partial | Complete | 04-02 lib + 04-05 actions + 04-08 modal + 04-09 wired into RoutineActionBar |
| HLTH-01 | Partial | Complete | 04-03 route + 04-06 client components + 04-09 mounted on landing PageHeader meta |

Coverage: 15/32 (Phase 1-3) + 7/32 (Phase 4) = 22/32 v1 requirements Complete. Remaining 10: Phase 5 Queue (QUEU-01..04 + SAFE-01) + Phase 6 Polish (DOCS-01..03 + COMP-01 + COMP-02).

## Commits Landed

| Commit | Subject | Files | Insertions / Deletions |
|--------|---------|-------|-----------------------|
| 1f1feb6 | feat(04-09): wire RoutineActionBar + StatusPill + drift-aware listRoutines into /routines surface | 4 | +483 / -67 |
| 71f920d | feat(04-09): mount HealthBadgeRow on landing + routines-page integration test | 2 | +203 / -1 |
| *(pending)* | docs(04-09): seal Phase 4 Deploy — 9/9 plans complete; VALIDATION + ROADMAP + STATE + REQUIREMENTS flipped | 4 | docs-only |

## Pre-existing Scope Respect

Pre-existing parallel-session uncommitted paths (`dashboard/lib/cloud-cache.ts`, `dashboard/tests/cloud-cache.test.ts`, untracked `CLAUDE.md` + 2 screenshot PNGs) preserved untouched. Both feat commits used explicit per-file `git add` so zero scope bleed.

## Self-Check

Files created check:
- `dashboard/app/routines/_components/routine-action-bar.tsx` — FOUND
- `dashboard/tests/routines-page.test.ts` — FOUND
- `.planning/phases/04-deploy/04-09-SUMMARY.md` — FOUND (this file)

Commits check:
- `1f1feb6` — FOUND in git log
- `71f920d` — FOUND in git log

## Self-Check: PASSED
