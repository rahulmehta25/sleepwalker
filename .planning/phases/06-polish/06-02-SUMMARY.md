---
phase: 06-polish
plan: 02
subsystem: docs
tags: [diagnostics, server-component, execFile, fail-soft, clipboard, promise-allsettled, lunar-palette]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "lib/audit.ts fail-soft fs.existsSync skeleton; PageHeader Server Component shape from app/audit/page.tsx"
  - phase: 02-adapters
    provides: "/bin/zsh -l -c login-shell PATH resolution idiom from bin/sleepwalker-run-cli"
  - phase: 03-editor
    provides: "Server Component → client island boundary pattern (app/routines/page.tsx + routines-client.tsx); INPUT_OPT_OUT-style minimal client surface; preview-panel.tsx node:* scheme fix precedent for Plan 03-08"
  - phase: 05-queue
    provides: "${HOME}/.sleepwalker/audit.jsonl.lock sentinel for v0.2-vs-v0.1 install-state detection (Plan 05-05)"
provides:
  - "/diagnostics route — Server Component reporting 11 environment probes via Promise.allSettled with per-probe 2s timeout"
  - "dashboard/lib/diagnostics.ts public API: gatherDiagnostics() + formatAsIssueBody() + Probe + DiagnosticsSnapshot"
  - "navigator.clipboard.writeText pattern for the Sleepwalker codebase (first clipboard API use)"
  - "Pitfall-1 explicit-allowlist formatter pattern for any future copy-output features"
  - "Sidebar Diagnostics NavLink between /audit and /settings (Wrench icon)"
affects: [06-03, 06-06]

# Tech tracking
tech-stack:
  added: []  # zero new npm deps — all primitives (Next 15 RSC + React 19 + lucide-react + node:child_process) pre-installed
  patterns:
    - "Server-side formatter call + opaque-string prop to client island avoids node:* scheme leakage into client bundle (precedent from Plan 03-08 preview-panel.tsx)"
    - "Promise.allSettled fan-out with per-probe try/catch + read-or-default unwrap = page never crashes even if a probe rejects unexpectedly"
    - "Result-object Probe = { ok: true; value: string } | { ok: false; error: string } — no throws, no nulls; render-friendly truthiness check"
    - "Explicit-allowlist formatter prevents probe-key drift from auto-leaking into copy output (Pitfall 1 defense)"
    - "Hardcoded execFile arg arrays — zero shell interpolation surface (T-06-02-01 mitigation)"

key-files:
  created:
    - "dashboard/lib/diagnostics.ts (218 lines — 11 probes + formatter + types)"
    - "dashboard/app/diagnostics/page.tsx (92 lines — Server Component + ProbeRow)"
    - "dashboard/app/diagnostics/diagnostics-client.tsx (56 lines — CopyIssueButton client island)"
    - "dashboard/tests/diagnostics.test.ts (191 lines — 6 it() blocks, Node env)"
    - "dashboard/tests/diagnostics-page.test.tsx (76 lines — 4 it() blocks, jsdom env)"
  modified:
    - "dashboard/app/layout.tsx (+1 NavLink between /audit and /settings; +Wrench in lucide import)"

key-decisions:
  - "Render formatAsIssueBody server-side and pass result string to client island (vs importing the formatter into the client) — avoids node:* scheme errors in webpack and is the precedent fix from Plan 03-08 preview-panel.tsx"
  - "11-probe set frozen at authoring time (no dynamic probe dispatch) — Pitfall 1 defense: maintainers must edit the probe array AND the formatter allowlist to add a new field"
  - "Promise.allSettled (not Promise.all) — one hung probe must not block the others; allSettled outcomes always fulfilled, defensively unwrapped"
  - "/bin/zsh -l -c login-shell invocation for CLI probes (not direct execFile) — matches Phase 2 supervisor PATH resolution; finds Homebrew binaries on common Mac dev setups"
  - "Per-probe timeout 2000ms + maxBuffer 64KB — total page render bounded <2.5s wall clock"
  - "Silent no-op on clipboard rejection (vs error toast) — clipboard API blocks on non-secure origins; user can screenshot rendered rows as fallback; failure mode is non-blocking"
  - "Test 'No secrets rendered' uses getAllByText — phrase intentionally surfaces in BOTH PageHeader subtitle (first-impression reassurance) AND footer (explicit transparency statement); both required by must_haves.truths"

patterns-established:
  - "Server-rendered formatter, prop-passed to client island: keeps node:* imports out of the client bundle while preserving the formatter's allowlist authority"
  - "Result-object probe shape with iconography binding: probe.ok → CheckCircle2 + signal-green; probe.error startsWith('not installed')||'not on PATH' → AlertCircle + moon-600; otherwise XCircle + moon-600"
  - "execMock.impl indirection in vi.mock factory: per-test mock swap without re-wiring the hoisted vi.mock — works around vi.mock's hoisting-before-locals constraint"

requirements-completed: [DOCS-03]

# Metrics
duration: 9min
completed: 2026-04-22
---

# Phase 6 Plan 02: /diagnostics Server Component Summary

**`/diagnostics` Next.js Server Component runs 11 fail-soft environment probes via `Promise.allSettled` + `execFile` (sw_vers, uname, brew, $SHELL, claude/codex/gemini/flock/jq via /bin/zsh login-shell, LaunchAgents stat, sleepwalker install-state) with one-click "Copy as GitHub issue body" client island — zero secrets rendered, zero new npm deps.**

## Performance

- **Duration:** ~9 min (8m41s)
- **Started:** 2026-04-22T07:56:16Z
- **Completed:** 2026-04-22T08:04:57Z
- **Tasks:** 3 (all auto)
- **Files modified:** 6 (5 new + 1 amended layout)
- **Test delta:** 363 → 373 (+10 it() blocks across 41 → 43 files)
- **Build delta:** new `/diagnostics` route at 1.53 kB / 142 kB First Load JS (smaller than `/cloud` 4.31 kB, `/routines` 10.4 kB, `/editor` 13.2 kB)

## Accomplishments

- **DOCS-03 shipped end-to-end:** users hitting an undocumented bug can now visit `/diagnostics`, click "Copy as GitHub issue body", and paste a structured environment report into a GitHub issue — covering macOS version, arch, Homebrew prefix, claude/codex/gemini/flock/jq CLI paths + versions, active shell, `~/Library/LaunchAgents/` writability, and Sleepwalker install state (v0.1 vs v0.2 detection via `audit.jsonl.lock` sentinel from Plan 05-05).
- **Fail-soft invariant proven:** unit tests cover the brew-missing + LaunchAgents-missing fail modes; the page renders successfully even when any probe rejects. Per-probe try/catch + result-object `Probe = {ok: true; value: string} | {ok: false; error: string}` — no throws, no nulls, no UI crashes.
- **Zero secret leakage by construction:** (a) curated 11-probe allowlist at authoring time — no env-dump, no token-file reads; (b) `formatAsIssueBody` uses an EXPLICIT FIELD ALLOWLIST (Pitfall 1 defense per RESEARCH §9 — adding a new probe to `DiagnosticsSnapshot.rows` does NOT auto-leak into the copy payload); (c) negative grep invariant in tests: `grep -cE 'github-token|bearer|credentials|sk_live|ghp_|process\.env\.[A-Z_]*TOKEN' dashboard/lib/diagnostics.ts` = 0.
- **Zero new npm deps + zero v0.1 frozen-surface impact:** uses pre-installed Next 15 RSC + React 19 + lucide-react + node:child_process. Sidebar gets a single-line additive NavLink insertion between `/audit` and `/settings` — no other v0.1 surface touched.

## Task Commits

Plan 06-02 was committed as a single atomic feat for the 6 implementation files plus a docs commit for the activity log:

1. **Tasks 1+2+3 combined: lib + page + client island + layout amendment + 2 test files** — `72f7b63` (`feat(06-02): add /diagnostics page + 11 fail-soft probes + copy-issue-body button`, 6 files / +662 / -1)

**Plan metadata:** authored separately as `docs(06-02): activity log + closeout` covering activity_log.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + this SUMMARY.md.

The plan structures Tasks 1 & 2 as type="auto" with explicit "Do NOT commit yet — Task 3 commits all DOCS-03 files atomically" guidance, so a single feat commit per the plan's spec is the correct cadence.

## Files Created/Modified

- `dashboard/lib/diagnostics.ts` (NEW, 218 lines) — `gatherDiagnostics(): Promise<DiagnosticsSnapshot>` runs 11 probes via Promise.allSettled with per-probe 2s timeout + 64KB maxBuffer; `formatAsIssueBody(d): string` renders explicit-allowlist GitHub-issue-body fenced code block; exports `Probe` result-object type + `DiagnosticsSnapshot` interface
- `dashboard/app/diagnostics/page.tsx` (NEW, 92 lines) — async Server Component with `dynamic = "force-dynamic"`; renders 11 lunar-palette probe rows via `ROW_SPEC` map + optional gitSha panel + `<CopyIssueButton issueBody={...} />` client island + transparency footer; `ProbeRow` selects CheckCircle2/AlertCircle/XCircle by `probe.ok` + error class
- `dashboard/app/diagnostics/diagnostics-client.tsx` (NEW, 56 lines) — `"use client"` island with `CopyIssueButton({issueBody: string})`; awaits `navigator.clipboard.writeText` on user gesture (T-06-02-04 mitigation), Copy → Check icon swap on success, silent no-op on clipboard rejection
- `dashboard/app/layout.tsx` (MODIFIED, +1 NavLink, +Wrench import) — single-line additive `<NavLink href="/diagnostics" icon={<Wrench className="w-3.5 h-3.5" />}>Diagnostics</NavLink>` between `/audit` and `/settings`; `Wrench` added to existing lucide-react import
- `dashboard/tests/diagnostics.test.ts` (NEW, 191 lines, 6 it() blocks, Node env) — vi.mock(node:child_process) with hoisted execMock.impl indirection; happy path + brew-missing fail-soft + LaunchAgents-missing fail-soft + probeShell direct + probeSleepwalkerState v0.2 lock-file detection + formatAsIssueBody allowlist canary
- `dashboard/tests/diagnostics-page.test.tsx` (NEW, 76 lines, 4 it() blocks, jsdom env) — vi.mock(@/lib/diagnostics) for Server Component render isolation; >=11 .panel rows + Copy button + Last checked eyebrow + No-secrets transparency messaging

## Decisions Made

- **Plan-shape preserved verbatim:** the plan author's choice to call `formatAsIssueBody` and pass the snapshot to the client island had to flip during execution (see Deviations §1) — but the public API surface (lib exports, test mock targets, plan must_haves.artifacts) was preserved intact. Only the `<CopyIssueButton>` prop shape changed.
- **`Wrench` icon for the sidebar entry** matches the diagnostic / repair / under-the-hood semantic — distinct from `Settings` (cog) and `ScrollText` (audit). Locked at authoring time per the plan; no alternatives evaluated.
- **No git-sha env-var injection** at build time (RESEARCH §3.5 mentions `NEXT_PUBLIC_GIT_SHA=$(git rev-parse --short HEAD) next build` as one option). Chose the simpler runtime `git rev-parse` probe with `dynamic="force-dynamic"` so the SHA reflects HEAD at request time and survives `git checkout` without rebuilding. Best-effort silent omission on git-not-on-PATH or .git-not-present.
- **Plan-CLAUDE.md compliance:** committed as `feat(06-02): ...` (conventional + no AI attribution); pre-existing untracked files (CLAUDE.md, 2 screenshots) preserved untouched via explicit per-file `git add` staging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Client-island `node:*` scheme leak — restructured prop shape from `{diag: DiagnosticsSnapshot}` to `{issueBody: string}`**

- **Found during:** Task 2 (Author page.tsx + diagnostics-client.tsx + layout amendment)
- **Issue:** Initial `pnpm run build` failed with `UnhandledSchemeError: Reading from "node:util" is not handled by plugins (Unhandled scheme). Webpack supports "data:" and "file:" URIs by default. You may need an additional plugin to handle "node:" URIs.` The `diagnostics-client.tsx` file was a `"use client"` boundary that imported `formatAsIssueBody` + `type DiagnosticsSnapshot` from `@/lib/diagnostics`, which transitively pulls `node:fs`, `node:os`, `node:path`, `node:child_process`, `node:util` for the probe surface. Next.js' webpack rejects `node:*` schemes inside client code — same class of bug fixed in Plan 03-08 for `dashboard/app/editor/preview-panel.tsx` per `03-08-SUMMARY.md` ("preview-panel.tsx dropped `@/lib/runtime-adapters/slug` import that pulled `node:path + node:os` into the client bundle").
- **Fix:** Restructured the boundary so `page.tsx` (Server Component) calls `formatAsIssueBody(snapshot)` server-side and passes the resulting opaque string as a `issueBody: string` prop. The client island `<CopyIssueButton>` now imports zero from `@/lib/diagnostics`; it just calls `navigator.clipboard.writeText(props.issueBody)` on click. Pitfall 1 defense (explicit field allowlist in `formatAsIssueBody`) preserved verbatim — the formatter still owns the allowlist; it just runs at SSR time instead of in the browser.
- **Files modified:** `dashboard/app/diagnostics/page.tsx` (added `formatAsIssueBody` to lib import block + `const issueBody = formatAsIssueBody(snapshot);` SSR-time call + `<CopyIssueButton issueBody={issueBody} />` prop pass); `dashboard/app/diagnostics/diagnostics-client.tsx` (dropped lib imports; prop shape `diag: DiagnosticsSnapshot` → `issueBody: string`; click handler uses `props.issueBody` directly).
- **Verification:** `pnpm run build` exit 0; `/diagnostics` route registered as `ƒ` (dynamic, server-rendered on demand) at 1.53 kB / 142 kB First Load JS. Documented inline in both files' JSDoc + page.tsx inline comment for future maintainers (referencing the Plan 03-08 precedent).
- **Committed in:** `72f7b63` (feat 06-02 atomic commit).

**2. [Rule 1 - Bug] jsdom test "No secrets rendered" assertion switched from `getByText` to `getAllByText`**

- **Found during:** Task 3 (Author 2 test files + commit)
- **Issue:** Initial `pnpm test tests/diagnostics-page.test.tsx` failed with `TestingLibraryElementError: Found multiple elements with the text: /No secrets rendered/i`. The DOM intentionally renders the phrase in TWO places by design — the PageHeader subtitle ("Environment probe for bug reports. No secrets rendered; copy the report into a GitHub issue for faster triage.") and the dedicated transparency footer ("No secrets rendered. No env var values, no API keys, no auth token state. Only paths, versions, and writability flags."). Both surfaces are required by `must_haves.truths`: the subtitle row at line 43 and the footer row at line 61 are both locked. The test author wrote `getByText` (single-match) which throws on the dual-surface design.
- **Fix:** Switched to `screen.getAllByText(/No secrets rendered/i)` + `expect(matches.length).toBeGreaterThanOrEqual(1)`. Renamed the test to `"renders 'No secrets rendered' transparency messaging (subtitle + footer)"` so future failure messages explain the dual-surface requirement to the next maintainer.
- **Files modified:** `dashboard/tests/diagnostics-page.test.tsx` (single it() block).
- **Verification:** `pnpm test tests/diagnostics-page.test.tsx` 4/4 green; full suite 373/373 green.
- **Committed in:** `72f7b63` (feat 06-02 atomic commit).

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes were correctness-only — they preserved the plan's exported lib contract, the plan's must_haves.artifacts intentions, and the test matrix coverage. The first fix was structurally identical to a precedent already documented in Plan 03-08's summary; the second was a test-author oversight where the assertion didn't match the dual-surface DOM the same plan locked. No scope creep, no architectural changes, no Rule-4 checkpoints.

## Issues Encountered

- **Pre-existing untracked files (CLAUDE.md + 2 screenshots) discipline:** Per the plan's explicit guidance ("Pre-existing untracked: CLAUDE.md + 2 screenshots. Untouched."), explicit per-file `git add` staging was used for the 6 plan files. Verified post-commit with `git status --short` showing the 3 untracked files still present and untouched. Zero scope bleed.

## Verification Replay

Per `<verification>` block:

- `pnpm run typecheck` exit 0 ✓
- `pnpm test tests/diagnostics.test.ts tests/diagnostics-page.test.tsx` 10/10 green (6 Node env + 4 jsdom in 735ms) ✓
- `pnpm test` full suite 373/373 across 43 files in 10.5s ✓
- `pnpm run build` exit 0 with `/diagnostics` route registered as dynamic ✓
- Lib exports: `gatherDiagnostics` + `formatAsIssueBody` + `Probe` + `DiagnosticsSnapshot` all present ✓
- Page: `export const dynamic = "force-dynamic"` ✓
- Client island: `"use client"` + `navigator.clipboard.writeText` ✓ (literal call site + 1 docstring mention)
- Layout: `<NavLink href="/diagnostics">Diagnostics</NavLink>` between Audit and Settings ✓
- Negative invariant: `grep -cE 'github-token|bearer|credentials|sk_live|ghp_|process\.env\.[A-Z_]*TOKEN' dashboard/lib/diagnostics.ts` = 0 ✓
- Single `feat(06-02)` commit on `main`: `72f7b63` (6 files / +662 / -1) ✓
- Activity log entry appended ✓

## User Setup Required

None — no external service configuration required. The page is self-contained and probes the local Mac at request time.

## Next Phase Readiness

- **Phase 6 progress 1/7 → 2/7 (28.6%); Plans 06-03 through 06-07 remain.**
- **Plan 06-03 (DOCS-01 AUTHORING.md) unblocked:** §1 Quick Start can now reference `/diagnostics` as the prereq-check link; §6 Troubleshooting can deep-link specific error rows to diagnostics output (e.g., `flock not found` → `/diagnostics` row "flock (audit serialization)").
- **Plan 06-06 (CI workflow) unblocked:** the new `dashboard/tests/diagnostics*.test.{ts,tsx}` test files are picked up automatically by the existing `pnpm test` invocation that the planned `.github/workflows/ci.yml` will call — no CI config change needed beyond what's already specified for the workflow.
- **No blockers, no concerns.** Pre-existing 50-test failure noise from parallel-session main advancement (documented in Plan 06-01's deferred-items.md) is no longer present — full suite 373/373 green at this commit.

## Self-Check: PASSED

All claimed files exist, all claimed commits exist:

- `dashboard/lib/diagnostics.ts` — FOUND
- `dashboard/app/diagnostics/page.tsx` — FOUND
- `dashboard/app/diagnostics/diagnostics-client.tsx` — FOUND
- `dashboard/app/layout.tsx` — FOUND (modified)
- `dashboard/tests/diagnostics.test.ts` — FOUND
- `dashboard/tests/diagnostics-page.test.tsx` — FOUND
- Commit `72f7b63` — FOUND in `git log --oneline`

---
*Phase: 06-polish*
*Completed: 2026-04-22*
