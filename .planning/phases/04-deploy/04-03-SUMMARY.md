---
phase: 04-deploy
plan: 03
subsystem: deploy
tags: [deploy, health, route-handler, hlth-01, wave-0, promise-allsettled, timeout, next-app-router]
requires:
  - Phase 1 Foundation (Runtime discriminant type + HealthStatus interface)
  - Phase 2 Adapters (ADAPTERS registry map + every adapter's healthCheck())
  - Phase 2 Plan 09 (HealthStatus.warning field amendment — not consumed by this module but present in the shape)
provides:
  - GET /api/health/all Route Handler returning {statuses: HealthStatus[] (length 4), checkedAt: ISO 8601}
  - 2000ms per-adapter timeout via Promise.race resolving (never rejecting) to {available:false, reason:'healthCheck timed out after 2000ms'}
  - Promise.allSettled over the adapter array so a single throwing adapter maps to {available:false, reason:'healthCheck threw: <message>'} without crashing peers
  - Never-cache invariant: exports dynamic='force-dynamic' + revalidate=0; client-side 60s TTL lives in HealthBadgeRow (Plan 04-06), not here
  - 6 green it() blocks (≥5 required) covering 04-VALIDATION rows 28, 29, 30 plus runtime-set coverage, pass-through invariant, and caching invariant
affects:
  - None (strictly additive — new directory dashboard/app/api/health/all/ + new test file; zero edits to v0.1, Phase 2, or Phase 3 surface)
tech-stack:
  added: []
  patterns:
    - "Two-layer health probe: library healthCheckAll() uses Promise.all (rejects on any throw); Route Handler adds a per-adapter Promise.race timeout + Promise.allSettled boundary so the client always gets a length-4 array — the wrapper lives in the route, not the lib, because Server Actions can't be called from a useEffect-style client fetch without a POST boundary"
    - "withTimeout(p, runtime): Promise.race([p, setTimeout-resolve-never-reject]) — the timeout branch resolves with a HealthStatus, never rejects, so allSettled's rejected branch is reserved for adapter-thrown errors (clean semantic split)"
    - "Route Handler test matrix mocks the @/lib/runtime-adapters barrel via vi.doMock + vi.resetModules per beforeEach — the route is a pure function of ADAPTERS + time, no real child_process probes, no HTTP boundary, direct GET() invocation"
    - "Fake-timer timeout test uses vi.advanceTimersByTimeAsync(2100) to fast-forward past the 2000ms race without wall-clock blocking; hung adapter is new Promise(() => undefined) (never resolves)"
key-files:
  created:
    - dashboard/app/api/health/all/route.ts (67 lines) — GET + dynamic + revalidate + TIMEOUT_MS + timeoutStatus + withTimeout helpers
    - dashboard/tests/health-route.test.ts (164 lines, 6 it() blocks) — shape / runtime-set / timeout / adapter-throws / pass-through / caching-invariant
  modified: []
decisions:
  - "Doc comment rephrased pre-commit: initial header said `Promise.allSettled` inline in prose, which would make the AC grep `grep -c 'Promise.allSettled' == 1` fail (2 hits). Rewrote to 'settled-array mapper' — same meaning, single grep match preserves the hard invariant. This mirrors Plan 04-02's similar Rule-1 auto-fix around the `git push` doc-comment false positive. Fix applied before the Task-1 commit so no separate fix-commit needed."
  - "Test strategy prefers direct GET() invocation over Next.js test-server spin-up. Rationale: the route is a 67-line pure function of the ADAPTERS registry (no request body, no headers, no middleware). Spinning up a real Next.js dev server per test would add ~2s of boot latency and bring zero additional coverage. Full suite latency stays at ~2.0s total (the 1.7s save-to-repo.test.ts real-git-repo overhead dominates)."
  - "Fake-timer timeout test kept scoped to one it() block. vi.useFakeTimers is brittle around Promise microtasks and third-party setTimeout usage; scoping it to the single block that needs it (via afterEach vi.useRealTimers) isolates any flakiness. The other 5 blocks run on real timers."
  - "Exported `revalidate = 0` alongside `dynamic = 'force-dynamic'` per 04-RESEARCH.md §Route Handler recommendation. Next.js 15 technically treats 'force-dynamic' alone as sufficient, but exporting both is defense-in-depth against a future Next version changing default cache semantics. The grep invariant `export const revalidate = 0 == 1` locks this in."
  - "Test block 6 (caching invariant) asserts module exports directly — `expect(mod.dynamic).toBe('force-dynamic')` and `expect(mod.revalidate).toBe(0)`. The plan's <behavior> marked this as optional because runtime cache behavior is not testable in jsdom without a real Next.js request-response cycle. Module-level assertion is the cheapest code-complete proxy: if either export changes, the test fails."
metrics:
  duration: ~4 min
  completed: 2026-04-20
---

# Phase 4 Plan 03: /api/health/all Route Handler Summary

Landed `dashboard/app/api/health/all/route.ts` — the single Route Handler that serves the landing-page `HealthBadgeRow` client component (Plan 04-06). Wraps `Object.values(ADAPTERS).map(a => a.healthCheck())` in a 2000ms per-adapter `withTimeout` race + `Promise.allSettled` boundary so no hung, throwing, or mis-authored adapter can delay or crash the aggregate response. Two atomic commits (feat route + test matrix). Wave 0's third (and final) parallel-safe brick — Wave 0 now complete.

## Files

| Path | Change | Lines |
|------|--------|------:|
| `dashboard/app/api/health/all/route.ts` | new Route Handler | 0 → 67 |
| `dashboard/tests/health-route.test.ts` | new test matrix | 0 → 164 |

Total: **2 files changed, +231 lines.**

## Commits

- `22b3740` — `feat(04-03): /api/health/all Route Handler with 2s per-adapter timeout + Promise.allSettled` (1 file, +67)
- `de000a6` — `test(04-03): /api/health/all route handler test matrix (6 it() blocks)` (1 file, +164)

## Test Count Delta

- Before: **291/291 green** (post Plan 04-02 seal).
- After: **297/297 green** (+6).
- All 6 new `it()` blocks live in `dashboard/tests/health-route.test.ts`:

1. `shape — returns {statuses, checkedAt} with 4 entries` — VALIDATION row 28 anchor; asserts 4-length statuses + ISO-8601 checkedAt + parseable via Date.parse
2. `each runtime appears exactly once in statuses` — runtime-set coverage; asserts sorted runtime set == `["claude-desktop","claude-routines","codex","gemini"]`
3. `timeout — hung adapter times out at 2000ms` — VALIDATION row 29 anchor; fake-timer + `new Promise(() => undefined)` hung adapter; `advanceTimersByTimeAsync(2100)`; asserts `{available:false, reason: /timed out/ + /2000ms/}`
4. `adapter throws — Promise.allSettled captures throw without crashing` — VALIDATION row 30 anchor; throwing adapter produces `{available:false, reason: /healthCheck threw: boom/}`; peers still resolved
5. `successful adapter preserves available:true and version verbatim` — pass-through invariant; asserts fulfilled HealthStatus fields flow through unchanged
6. `Route Handler module exports force-dynamic + revalidate=0 (no caching)` — caching invariant; module-level export assertion

Every plan-specified VALIDATION anchor query (`-t "shape"` / `-t "timeout"` / `-t "adapter throws"`) resolves to exactly **1 passing test**.

## 04-VALIDATION.md Rows Flipped

| Row | Secure Behavior | Anchor Query | Status |
|-----|-----------------|--------------|--------|
| 28 | `/api/health/all` returns `{statuses, checkedAt}` | `-t "shape"` | 4-03-02 green 2026-04-20 |
| 29 | Timeout per adapter is 2000ms, never hangs response | `-t "timeout"` | 4-03-02 green 2026-04-20 |
| 30 | Promise.allSettled catches throwing adapter | `-t "adapter throws"` | 4-03-02 green 2026-04-20 |

**16 of 36 total rows green** (6 from Plan 04-01 + 7 from Plan 04-02 + 3 from this plan). 20 remain pending Waves 1-4 (HLTH-01 rows 31-35 gate on Plan 04-06 client component; DEPL-01..05 + phase-exit rows gate on Waves 1-4).

## Plan Success Criteria Check

1. ✅ `dashboard/app/api/health/all/route.ts` exists, exports `GET` + `dynamic = "force-dynamic"` + `revalidate = 0`.
2. ✅ 2000ms per-adapter timeout via `Promise.race`; `Promise.allSettled` catches throwing adapters.
3. ✅ `dashboard/tests/health-route.test.ts` has 6 green `it()` blocks (≥5 required) whose names match VALIDATION rows 28-30 + 3 additional coverage blocks.
4. ✅ Full pnpm test suite green: **297/297**.
5. ✅ Two atomic commits landed (`22b3740` feat + `de000a6` test).

## Verification Commands Run

```
pnpm run typecheck                                                             # exit 0
pnpm run build                                                                 # /api/health/all compiled (152 B / 105 kB)
pnpm test tests/health-route.test.ts                                           # 6/6 green
pnpm test                                                                      # 297/297 green across 31 files
grep -c "export const dynamic = \"force-dynamic\"" app/api/health/all/route.ts # 1 (AC: ==1)
grep -c "export const revalidate = 0" app/api/health/all/route.ts              # 1 (AC: ==1)
grep -c "Promise.allSettled" app/api/health/all/route.ts                       # 1 (AC: ==1) — doc comment rephrased pre-commit to preserve this invariant
grep -c "timed out after" app/api/health/all/route.ts                          # 1 (AC: ≥1)
grep -c "healthCheck threw" app/api/health/all/route.ts                        # 1 (AC: ≥1)
grep -c "TIMEOUT_MS = 2000" app/api/health/all/route.ts                        # 1 (AC: ==1)
grep -c "export async function GET" app/api/health/all/route.ts                # 1 (AC: ==1)
grep -cE "^\s*it\(" dashboard/tests/health-route.test.ts                       # 6 (AC: ≥5)
```

Per-anchor pnpm filter results (all resolve to exactly 1 passing test):

```
pnpm test tests/health-route.test.ts -t "shape"            # 1 passed | 5 skipped
pnpm test tests/health-route.test.ts -t "timeout"          # 1 passed | 5 skipped
pnpm test tests/health-route.test.ts -t "adapter throws"   # 1 passed | 5 skipped
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-comment wording tripped the `Promise.allSettled` grep invariant**

- **Found during:** Task 1 verify step (AC grep `grep -c "Promise.allSettled" == 1`).
- **Issue:** Initial module-level doc comment wrote "`Promise.race` timeout and \`Promise.allSettled\` so no single hung..." — the backticked `Promise.allSettled` in the prose + the literal usage on line 50 gave the grep two matches, failing the hard `== 1` AC. This mirrors Plan 04-02's analogous Rule-1 auto-fix around the `git push` doc-comment false positive.
- **Fix:** Rephrased the doc comment to "Promise.race timeout and a settled-array mapper" — same semantic meaning, different words; the single code-level `Promise.allSettled` call on line 50 stays authoritative.
- **Files modified:** `dashboard/app/api/health/all/route.ts` (1-line comment edit, applied before the single Task-1 commit so no separate fix-commit needed).
- **Commit:** `22b3740` (pre-commit edit).

No Rule 2 / Rule 3 / Rule 4 auto-fixes triggered during this plan.

## Deployment / Dependency Notes

- **Plan 04-06 (HealthBadgeRow + HealthBadge client components)** is now fully dep-cleared on the server side. It will `fetch('/api/health/all', {cache: 'no-store'})` from a `useEffect` + client-side 60s sessionStorage cache + window-focus refetch. The client cache is intentionally separate from this route's no-cache posture — the client throttles fetches, the server always reflects live adapter state.
- **Plan 04-09 (exit gate)** will re-run the 3 VALIDATION anchor queries above to confirm all HLTH-01 server rows stay green through the phase seal. Rows 31-35 (client component behaviors) gate on Plan 04-06.

## Architectural Notes

- **Two-layer probe design:** `healthCheckAll()` in `@/lib/runtime-adapters` is kept as `Promise.all` (rejects on any throw) because library consumers other than this route may want the strict all-or-nothing semantic. The timeout + `Promise.allSettled` fault-tolerance lives in the Route Handler, not the lib. If a future caller needs the same fault-tolerance, they can import `withTimeout` from a shared helper or re-implement the 12-line pattern.
- **Adapter iteration order is stable** via `Object.values(ADAPTERS)`. Object property enumeration order in V8 for string keys is insertion order (ECMA-262 §7.3.22), and the `ADAPTERS` literal in `dashboard/lib/runtime-adapters/index.ts` inserts `"claude-routines" → "claude-desktop" → "codex" → "gemini"` in that order. Tests assert the sorted set, not positional order, because ordering the sorted set is friendlier to future refactors — but the statuses array is still in insertion order on-wire.
- **Never-cache invariant:** both `dynamic = "force-dynamic"` and `revalidate = 0` are exported. Next.js 15 treats either as sufficient on its own; exporting both is defense-in-depth against future Next version changes. The 60s client-side cache in Plan 04-06's HealthBadgeRow is intentional and lives at the client layer, not the server.
- **Timeout semantics split:** the timeout branch of `Promise.race` RESOLVES (does not reject) with a HealthStatus, which means `Promise.allSettled`'s `rejected` branch is reserved exclusively for adapter-thrown errors. This gives the settled-array mapper two clean semantic cases: `fulfilled` (either real result or timeout) and `rejected` (throw). Simpler than trying to distinguish timeout-reject from throw-reject inside a single rejection handler.
- **TIMEOUT_MS locked at 2000ms** per 04-RESEARCH.md §Health Badge Implementation §Route Handler (lines 670-711). If an adapter's real probe genuinely needs >2s (e.g. cold-boot gcloud ADC refresh), the probe should return early with `{available: false, reason: "probe slow"}` rather than ask this handler to wait longer. UI responsiveness is the hard constraint.

## Known Stubs

None. Plan 04-03 ships a complete HLTH-01 server surface. The Route Handler has a concrete body; test matrix exercises every behavioral branch (fulfilled / rejected-throw / timeout / pass-through / caching invariant).

## Threat Flags

None. This Route Handler does NOT introduce net-new network surface beyond the existing `/api/routines`, `/api/cloud`, etc. pattern. No auth boundary (healthCheck methods already have their own PATH probe + credential semantics). No file access beyond what the adapters already do. Read-only response; no POST, PUT, or DELETE handlers exported.

## Dependencies for Downstream Plans

- **04-06 (HealthBadgeRow + HealthBadge client components)** — unblocked. Can fetch `/api/health/all` and render the 4 pills per UI-SPEC §Health badge states.
- **04-09 (Exit gate)** — will re-verify rows 28-30 green via the 3 anchor queries above.

## Self-Check: PASSED

- [x] `dashboard/app/api/health/all/route.ts` exists (67 lines, GET + dynamic + revalidate + 2 helpers)
- [x] `dashboard/tests/health-route.test.ts` exists (164 lines, 6 it() blocks, all green)
- [x] Commit `22b3740` present in `git log` (Task 1: feat Route Handler)
- [x] Commit `de000a6` present in `git log` (Task 2: test matrix)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm build` compiles `/api/health/all` at 152 B / 105 kB first-load
- [x] `pnpm test` exits 0 with 297/297 green across 31 files
- [x] All 3 VALIDATION anchor queries (rows 28, 29, 30) resolve to exactly 1 passing test each
- [x] `grep -c "Promise.allSettled" dashboard/app/api/health/all/route.ts` returns 1 (hard invariant)
- [x] `grep -c "TIMEOUT_MS = 2000" dashboard/app/api/health/all/route.ts` returns 1
- [x] `grep -c "export async function GET" dashboard/app/api/health/all/route.ts` returns 1
- [x] Pre-existing uncommitted paths (`cloud-cache.ts`, `cloud-cache.test.ts`) untouched
- [x] Untracked paths (`CLAUDE.md`, 2 screenshot PNGs) untouched
- [x] No accidental deletions between HEAD~2 and HEAD
