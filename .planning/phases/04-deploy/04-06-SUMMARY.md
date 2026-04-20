---
phase: 04-deploy
plan: 06
subsystem: ui
tags: [react, health-check, sessionstorage, jsdom, client-component]

# Dependency graph
requires:
  - phase: 04-deploy
    provides: /api/health/all Route Handler (Plan 04-03) — {statuses, checkedAt} shape
  - phase: 01-foundation
    provides: HealthStatus + Runtime types (types.ts Plan 01-01)
provides:
  - HealthBadge presentational component (4 states: green/amber/grey/loading)
  - HealthBadgeRow client component (60s sessionStorage cache + window focus refetch + per-badge manual refresh)
  - jsdom test matrix (5 it() blocks covering VALIDATION rows 31-35)
affects: [04-09, landing-page-integration, HLTH-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sessionStorage-backed 60s TTL cache with SSR + Safari Private Mode guards (typeof-window + try/catch around every access)"
    - "Window focus event listener as cache-invalidation trigger — user returns to tab -> stale cache refetches"
    - "refreshKey useState bump pattern — both focus refetch and manual refresh route through a single useEffect dep"
    - "React 19 act() + waitFor() paired with jsdom fireEvent.focus(window) + fireEvent.click() for async state flush assertions"

key-files:
  created:
    - dashboard/app/_components/health-badge.tsx (131 lines)
    - dashboard/app/_components/health-badge-row.tsx (163 lines)
    - dashboard/tests/health-badge-row.test.tsx (155 lines)
  modified: []

key-decisions:
  - "Pass `runtime` prop to HealthBadge rather than deriving from status.runtime — lets the loading state (status === null) still render the correct runtime label"
  - "Manual refresh affordance only on amber/grey badges (not green/loading) per UI-SPEC line 243 — refresh stopPropagation so it doesn't trigger the pill's AUTHORING redirect"
  - "Single useEffect with refreshKey dep for fetch + two separate effects (fetch vs focus-listener) — focus handler bumps refreshKey rather than running the fetch itself, so there's exactly one fetch code path"
  - "Fetch failure fallback flips all badges to grey with 'health check failed · retry' reason rather than leaving loading pills stuck — UI-SPEC §Failure modes"

patterns-established:
  - "Three-layer cache strategy for client-side health polling: 60s TTL + focus refetch + manual refresh icon"
  - "Map-backed Storage stub reused from draft-recovery-banner.test.tsx — same Node 25 + jsdom sessionStorage leak defeated by same pattern"

requirements-completed: [HLTH-01]

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 04 Plan 06: Health badge client components Summary

**HealthBadge + HealthBadgeRow shipping HLTH-01 landing-page runtime health row — 4 states x 4 runtimes with 60s sessionStorage cache, window-focus stale refetch, and per-badge manual refresh.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T01:41:32Z
- **Completed:** 2026-04-20T01:44:44Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- Shipped `HealthBadge` presentational component with 4 locked UI-SPEC state variants (green available+no-warning / amber available+warning / grey unavailable / loading null-status)
- Shipped `HealthBadgeRow` client component with three-layer cache strategy: 60s sessionStorage TTL + window-focus stale refetch + per-badge manual refresh icon
- Authored `tests/health-badge-row.test.tsx` jsdom matrix with 5 `it()` blocks covering VALIDATION rows 31-35 (render states / cache hit / cache expiry / focus refetch / manual refresh)
- Suite 322 → 327 green (+5); 35 → 36 test files; typecheck exit 0; `pnpm build` clean (`/` route stays at 5.66 kB / 147 kB first-load — component not mounted yet; Plan 04-09 wires it into the landing page)

## Task Commits

1. **Task 1: HealthBadge presentational component** — `e3492ea` (feat)
2. **Task 2: HealthBadgeRow client component** — `df2c279` (feat)
3. **Task 3: HealthBadgeRow jsdom test matrix** — `d016d98` (test)

## Files Created/Modified

- `dashboard/app/_components/health-badge.tsx` (NEW, 131 lines) — presentational pill; four state variants mapped from `HealthStatus | null`; RefreshCw affordance only on amber/grey; `typeof window` guard around `window.open` call; lucide icons (Loader2 animate-spin, AlertCircle, RefreshCw); `RUNTIME_LABEL` locked from UI-SPEC copy; `truncate(reason, 40)` helper for grey state
- `dashboard/app/_components/health-badge-row.tsx` (NEW, 163 lines) — `"use client"` component; sessionStorage key `sleepwalker:health:v1`, TTL 60_000 ms, locked `RUNTIME_ORDER` const, `readCache/writeCache/clearCache` helpers each guarded with `typeof window === "undefined"` early return + try/catch body for Safari Private Mode; `useCallback` `manualRefresh` clears cache + bumps `refreshKey`; single fetch useEffect keyed on `refreshKey` + separate focus-listener useEffect with `[]` deps that bumps `refreshKey` when cache stale
- `dashboard/tests/health-badge-row.test.tsx` (NEW, 155 lines) — `// @vitest-environment jsdom` header; Map-backed Storage stub installed via `Object.defineProperty(window, "sessionStorage", ...)` in `beforeEach`; `vi.fn` fetch mock returning mixed 4-runtime response in `beforeEach`; 5 `it()` blocks with names matching VALIDATION anchors verbatim (render states / cache hit / cache expiry / focus refetch / manual refresh); `act(async)` wraps `fireEvent.focus(window)` + `fireEvent.click(refreshBtn)` for React 19 state-flush compliance

## Decisions Made

- **Pass `runtime` prop explicitly to HealthBadge.** The plan's interface accepts `status: HealthStatus | null`, but a null status doesn't carry a runtime field — the component still needs to render the correct label during the loading state. Passing `runtime` as a separate prop (rather than deriving from `status.runtime`) keeps the loading-pill runtime label accurate.
- **Manual refresh stopPropagation.** The refresh button is a nested `<button>` inside the grey/amber badge (which is itself a button opening AUTHORING.md on click). `e.stopPropagation()` ensures clicking the refresh icon refreshes rather than navigating.
- **Fetch failure grey-with-retry fallback.** Per 04-UI-SPEC §Failure modes, a stuck loading pill is worse than a clear error. On fetch catch, flip every badge to `{available: false, reason: "health check failed · retry"}` so the grey state renders with an actionable message; the user's manual refresh icon click will re-fetch.
- **Focus handler bumps `refreshKey` rather than calling fetch directly.** This keeps the single fetch code path in one useEffect — both manual refresh and focus refetch route through the same dep-bump mechanism, so there's one place for error handling and cancellation.

## Deviations from Plan

None - plan executed exactly as written.

Zero Rule 1/2/3 auto-fixes. Zero architectural changes. No auth gates. The plan's `<action>` code scaffolds compiled clean on first typecheck, the test matrix passed first run, and `pnpm build` surfaced no Rule-3 client-bundle regressions (Plan 03-08's preview-panel trap did not recur — HealthBadgeRow imports only `@/lib/runtime-adapters/types` which is pure type-only and compiles away).

## Issues Encountered

None.

## VALIDATION.md Row Flips

Rows 31, 32, 33, 34, 35 → `4-06-03 ✅ green 2026-04-20` (test commit `d016d98` implements all five; anchor filters `-t "render states"` / `-t "cache hit"` / `-t "cache expiry"` / `-t "focus refetch"` / `-t "manual refresh"` each resolve to exactly 1 passing test).

29 + 5 = **34/36 VALIDATION rows green** after this plan. Remaining 2 rows: the phase-exit smokes (full suite green + supervisor harness + frozen-surface diff) gated on Plan 04-09.

## Route Bundle Size Delta

- `/` (landing page): **5.66 kB / 147 kB first-load** — unchanged from post-04-05 baseline. HealthBadgeRow is authored but not yet imported into any live route tree; Plan 04-09 mounts it and will surface the delta then.
- No other routes touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-07 (DeployProgressDrawer) remains parallel-safe with this plan — no shared file touches.
- Plan 04-09 (landing page integration + exit gate) is now dep-cleared to import `HealthBadgeRow` from `@/app/_components/health-badge-row`.
- HLTH-01 code-complete: Route Handler (04-03) + client components (04-06) both shipped; Phase 4 exit gate verification in 04-09.

## Self-Check: PASSED

**Files created (verified present):**
- `dashboard/app/_components/health-badge.tsx` — FOUND
- `dashboard/app/_components/health-badge-row.tsx` — FOUND
- `dashboard/tests/health-badge-row.test.tsx` — FOUND

**Commits (verified in git log):**
- `e3492ea` feat(04-06): HealthBadge presentational component — FOUND
- `df2c279` feat(04-06): HealthBadgeRow — 4 badges + 60s cache... — FOUND
- `d016d98` test(04-06): HealthBadgeRow jsdom matrix... — FOUND

**Automated checks:**
- `pnpm run typecheck` exit 0 — PASS
- `pnpm run build` exit 0 (`/` route 5.66 kB / 147 kB) — PASS
- `pnpm test tests/health-badge-row.test.tsx` — 5/5 passed — PASS
- Full suite `pnpm test` — 327/327 passed across 36 files — PASS
- All 5 VALIDATION anchor filters resolve to exactly 1 passing test — PASS

---
*Phase: 04-deploy*
*Completed: 2026-04-20*
