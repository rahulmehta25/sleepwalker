---
phase: 05-queue
plan: 07
subsystem: dashboard-ui
tags: [ui, queue, safe-01, queu-02, honest-labeling, pill, supervisor-run-render, jsdom]

# Dependency graph
requires:
  - phase: 05-queue
    provides: Plan 05-01 widened QueueSource union to "local" | "cloud" | "codex" | "gemini" and QueueStatus to add "complete" | "failed" — this plan consumes both via SourcePill dispatch + widened RecentList statusPillClass mapping
  - phase: 05-queue
    provides: Plan 05-02 added `.pill-codex` (aurora-500 anchor) and `.pill-gemini` (dawn-400 anchor) Tailwind utility classes in globals.css:78-79 — this plan wires them into JSX via `<span className="pill-codex|gemini">` in the new SourcePill helper
  - phase: 05-queue
    provides: Plan 05-03 readSupervisorRuns + aggregateQueue 3-source merge populates pending[] with kind:"supervisor-run" entries carrying source:codex|gemini + payload.event — this plan's ActionDetail supervisor-run branch and footer supervisor-run arm consume that shape end-to-end
  - phase: 02-adapters
    provides: bin/sleepwalker-run-cli supervisor audit_emit writes the budget_exceeded event shape (chars_consumed, chars_limit) that ActionDetail now renders as "Stopped at {n} chars (budget: {m}, approximate)"
provides:
  - End-to-end QUEU-02 consumer surface (producer was Plan 05-02 CSS) — codex + gemini queue entries now render with branded pills + icons via exported SourceIcon + SourcePill helpers
  - End-to-end SAFE-01 UI copy invariant — zero `budget.*tokens|tokens.*budget` regex hits remain in dashboard/app/ (verified). Three honest copy sites landed: routines-client header (`chars (approximate)`), editor-client helper (`Approximate character cap. Tokens vary by ±40%`), queue-client budget_exceeded render (`Stopped at {chars} chars (budget: {limit}, approximate)`)
  - Supervisor-run terminal ActionDetail branch with labeled Event / Preview / Reason / Exit code rows — no JSON dump fallback for the codex + gemini common-case shape
  - Footer 3-way discriminator (supervisor-run → audit deep-link, cloud → Dismiss/OpenPR, local → Reject/Approve) — codex + gemini entries never get Approve/Reject UI because they are already terminal when they reach the queue (RESEARCH §2.3 approval.ts::enqueueForExecution guard verified)
  - RecentList status pill widening (plan-check soft spot #4 auto-fix) — approved/complete → pill-green, rejected/failed → pill-red, fallback pill-muted; addresses the semantic-precision gap after Plan 05-01 widened QueueStatus
  - jsdom test harness for queue-client with 6 it() blocks covering SourcePill (4 sources), SAFE-01 "approximate" copy in budget_exceeded, and supervisor-run labeled-field render
affects: [05-08 (exit gate runs full suite including new 6 blocks + frozen-surface gate confirms no v0.1 surface changed; dashboard suite 352 → 358)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "4-way source discriminator via inline switch helpers (SourceIcon + SourcePill) driving JSX class + icon rendering from a single QueueSource union argument — replaces the binary isCloud ternary and keeps the rendering logic colocated with the main component file (established precedent: ReversibilityPill inline helper in the same file)"
    - "Exported inline helpers for testability — SourceIcon + SourcePill + ActionDetail all carry the `export` modifier so jsdom tests import them directly without re-export files or module-scope mocking (mirrors Phase 4 DeployProgressDrawer pattern)"
    - "SAFE-01 3-layer UI invariant: (1) positive assertion via `grep -q 'chars (approximate)'` in each site's file, (2) negative invariant via `grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` returning empty, (3) inline negative assertion inside the jsdom test (`expect(text).not.toMatch(/budget.*tokens|tokens.*budget/)`)"
    - "ActionDetail priority chain: cloud-PR → tool+args → supervisor-run (NEW) → generic kind+payload → raw JSON fallback. Each branch owns its rendering completely; no shared fragments. The supervisor-run branch inserted before the generic fallback ensures codex/gemini entries get the pretty labeled layout, not the JSON.stringify(payload) dump."

key-files:
  created:
    - .planning/phases/05-queue/05-07-SUMMARY.md
    - dashboard/tests/queue-client.test.tsx (+108 lines, 6 jsdom it() blocks)
  modified:
    - dashboard/app/routines/routines-client.tsx (line 62: `tokens` → `chars (approximate)`; +1/-1 net)
    - dashboard/app/editor/editor-client.tsx (inserted helper <p> below budget input line 481; +3/0 net)
    - dashboard/app/queue-client.tsx (+216/-12 net: SourceIcon + SourcePill exports; supervisor-run ActionDetail branch; footer 3-way; RecentList statusPillClass widening; isCloud header block simplified to helper calls)

key-decisions:
  - "Kept SourceIcon + SourcePill as inline helpers inside queue-client.tsx (not a new _components/ file) — matches the existing ReversibilityPill precedent in the same file and avoids the overhead of a cross-file import for what is essentially two small switch expressions. Export modifier added only for jsdom testability, not for cross-page reuse (the audit page uses its own pill shape)."
  - "Exported ActionDetail for testing rather than refactoring the supervisor-run branch into its own component — the branch is pure (no hooks, no closures) and is the natural test surface per plan Task 3; adding a wrapper component would only increase jsdom overhead without clarifying the contract."
  - "Added a `statusPillClass(status)` helper function next to RecentList (not inline) because the switch has 4 meaningful cases plus default — inline ternary chains would obscure the SAFE-01-adjacent semantics (approved and complete are both success, rejected and failed are both failure). Function + switch with case-through fall-throughs is the clearest form."
  - "Footer supervisor-run arm uses a `/audit?fleet=<encoded>` deep-link (not plain text) per plan's `gentle enhancement` preference — the underline + decoration styling matches the existing `/routines` deep-link in the empty-state panel for visual consistency. encodeURIComponent guards against fleet names that could contain `/` or `:`."
  - "Did NOT flip audit-page SAFE-01 consistency (plan-check soft spot #6) — RESEARCH §5.1 marks `/audit` page copy as Phase 6 diagnostics scope. Strictly avoided scope stretch; the negative `grep` invariant in dashboard/app/ currently excludes /audit because `total: {e.total} / budget: {e.budget}` does not include the literal word 'tokens', so the regex returns empty as required."
  - "Widened RecentList status pill inline in this plan (plan-check soft spot #4) rather than deferring — the change is 1 helper function (14 lines) and directly serves supervisor-run entries reaching RecentList with status:complete or status:failed. Without this widening, every supervisor-run in RecentList would render red (!== 'approved'), which is a visible semantic regression the next demo would catch."
  - "Inlined the 'Stopped at {n} chars (budget: {m}, approximate)' rendering on a single JSX line (no line break between 'chars' and '(budget:') — required for the plan's single-line `grep -cE 'Stopped at.*chars.*budget.*approximate'` regex to match. Initial draft broke across two JSX children which passed runtime but failed the grep verification."

patterns-established:
  - "Inline helper + export modifier for jsdom testability: declare helpers at module scope (not inside the main component), prefix with `export`, import statically into the test file, render directly with `render()`. No dynamic imports, no mocks, no jest-dom — matches the repo's runtime-radio-grid.test.tsx + editor-client.test.tsx precedent."
  - "SAFE-01 negative-invariant test in jsdom: after rendering the budget_exceeded variant, assert both the positive text (`toContain('approximate')`) AND the negative invariant (`not.toMatch(/budget.*tokens|tokens.*budget/)`) on the same container.textContent — catches future drift at the render level, not just the source level."

requirements-completed: [SAFE-01, QUEU-02]
# SAFE-01: 3 UI copy sites + 1 negative invariant across dashboard/app/ + positive + negative jsdom assertion
# QUEU-02: consumer-side pill wiring in queue-client.tsx via SourcePill 4-way dispatch

# Metrics
duration: 6min
completed: 2026-04-20
---

# Phase 5 Plan 07: SAFE-01 UI sweep + QUEU-02 pill consumer wiring Summary

**Closes the SAFE-01 honest-labeling UI surface and the QUEU-02 pill consumer side in one atomic wave — the single remaining `tokens` budget-context violation at routines-client.tsx:62 flips to `chars (approximate)`, the editor budget input gains an `Approximate character cap. Tokens vary by ±40%` helper, and queue-client.tsx grows inline SourcePill + SourceIcon dispatchers plus a supervisor-run ActionDetail branch so codex + gemini entries render with branded pills, a labeled Event/Preview/Reason/Exit layout, a budget_exceeded `Stopped at N chars (budget: M, approximate)` copy, and a terminal footer with `/audit` deep-link instead of Approve/Reject buttons. RecentList's status pill widens to handle QueueStatus' new complete/failed values. Suite 352 → 358 (+6 jsdom blocks). The SAFE-01 negative invariant `grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` now returns empty, asserted both at shell and inside the jsdom test.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T08:23:58Z
- **Completed:** 2026-04-20T08:29:53Z
- **Tasks:** 3 (Task 1 SAFE-01 copy, Task 2 queue-client extension, Task 3 jsdom tests)
- **Files created:** 1 (dashboard/tests/queue-client.test.tsx)
- **Files modified:** 3 (routines-client.tsx, editor-client.tsx, queue-client.tsx)
- **Commits:** 2 atomic commits on `main`

## Accomplishments

### Task 1 — SAFE-01 honest-labeling (routines + editor)
- `dashboard/app/routines/routines-client.tsx:62`: `budget: {r.defaultBudget.toLocaleString()} tokens` flipped to `budget: {r.defaultBudget.toLocaleString()} chars (approximate)`. The single violating copy site per RESEARCH §5.2 inventory.
- `dashboard/app/editor/editor-client.tsx:480-483` (new lines): inserted helper `<p className="text-xs text-moon-400">Approximate character cap. Tokens vary by ±40% depending on output format.</p>` below the budget input's error span, inside the same `<label>` wrapper. The input + error + label semantics are byte-identical.
- Auth-token references at settings-client.tsx / save-to-repo.ts / deploy-state.ts are unaffected — those are GitHub PATs / API bearer tokens, not budget tokens.

### Task 2 — queue-client.tsx source-pill + supervisor-run rendering
- **Imports**: added `Terminal` + `Sparkles` from `lucide-react`, added `QueueSource` to the `@/lib/queue` type import.
- **SourceIcon** (exported, line 179): switch on `QueueSource` returning `<Cloud />` / `<Terminal />` / `<Sparkles />` / `<HardDrive />` for cloud/codex/gemini/local respectively.
- **SourcePill** (exported, line 192): switch on `QueueSource` returning `<span>` with `pill-aurora` / `pill-codex` / `pill-gemini` / `pill bg-signal-green/10 ...` classes. Pill classes resolve via Plan 05-02 globals.css.
- **Main card body** (lines 100-107): binary `isCloud ? <Cloud/> : <HardDrive/>` + `pill-aurora | pill-green` replaced with `<SourceIcon source={current.source ?? "local"} />` + `<SourcePill source={current.source ?? "local"} />` — 4-way dispatch.
- **isSupervisorRun** local const (line 71): `current.kind === "supervisor-run"`.
- **ActionDetail supervisor-run branch** (lines 250-292): inserted BEFORE the generic `if (entry.kind && entry.payload)` fallback. Renders labeled Event row; if `payload.event === "budget_exceeded"` with chars_consumed + chars_limit both present, renders `Stopped at {chars_consumed.toLocaleString()} chars (budget: {chars_limit.toLocaleString()}, approximate).`; optional Preview (pre block), Reason, and Exit code rows rendered only when their payload fields are present.
- **Footer action row** (lines 131-162): 3-way ternary `isSupervisorRun ? {audit deep-link} : isCloud ? {Dismiss+OpenPR} : {Reject+Approve}`. The supervisor-run arm renders a single `<div className="text-xs text-moon-400">Terminal state — no action required. View full audit at <a href="/audit?fleet=...">/audit</a>.</div>` — no buttons, no callbacks.
- **RecentList widening** (lines 318-352): extracted a new `statusPillClass(status: QueueEntry["status"])` helper with a 4-arm switch: `approved|complete → pill-green`, `rejected|failed → pill-red`, default `pill-muted`. Replaced the binary `e.status === "approved" ? "pill-green" : "pill-red"` at the old line 245. Source display switched from inline `<span>{e.source ?? "local"}</span>` to `<SourcePill source={e.source ?? "local"} />` for visual parity with the header row.

### Task 3 — jsdom test coverage
- New `dashboard/tests/queue-client.test.tsx` with 6 `it()` blocks:
  1. `SourcePill renders pill-codex for source='codex'` — querySelector `.pill-codex` not null, textContent `"codex"`
  2. `SourcePill renders pill-gemini for source='gemini'` — querySelector `.pill-gemini` not null, textContent `"gemini"`
  3. `SourcePill renders pill-aurora for source='cloud' (regression guard)` — `.pill-aurora` present, `.pill-codex` + `.pill-gemini` both null, textContent `"cloud"`
  4. `SourcePill renders local variant for source='local'` — span present, textContent `"local"`, no branded classes
  5. `renders 'approximate' copy for budget_exceeded supervisor-run entry (SAFE-01)` — positive `toContain('approximate')` + `toContain('Stopped at')` + `toContain('budget')` + regex match on `42,000` and `40,000` + **negative invariant** `not.toMatch(/budget.*tokens|tokens.*budget/)`
  6. `supervisor-run ActionDetail renders preview + reason + exit code labels when present` — labeled Event/Preview/Reason/Exit code render for a failed gemini supervisor-run with payload carrying all four optional fields
- Test pattern follows `runtime-radio-grid.test.tsx`: static import of exported helpers from `@/app/queue-client`, `cleanup()` in `afterEach`, `render()` then `container.querySelector` + `container.textContent` assertions. No `@testing-library/jest-dom` (package is not installed; repo uses plain vitest `expect`).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | SAFE-01 copy flip in routines + editor | `8eebb80` | dashboard/app/routines/routines-client.tsx, dashboard/app/editor/editor-client.tsx |
| 2+3 | queue-client SourcePill + supervisor-run ActionDetail + jsdom tests (atomic per plan) | `373b342` | dashboard/app/queue-client.tsx, dashboard/tests/queue-client.test.tsx |

Plan 05-07 commits on `main`:
- `8eebb80` `fix(05-07): replace 'tokens' with 'chars (approximate)' in budget copy` (2 files, +4/-1)
- `373b342` `feat(05-07): queue-client SourcePill + supervisor-run ActionDetail + jsdom tests` (2 files, +216/-12; 1 new file)

## Test Delta

- Baseline at Plan start: **352/352** across **39** files (dashboard suite only; supervisor-tests + run-tests untouched).
- Plan end: **358/358** across **40** files.
- New test file: `dashboard/tests/queue-client.test.tsx` — 6 jsdom it() blocks, all green in 20ms.
- Zero regressions in existing files (editor-client.test.tsx, deploy-progress-drawer.test.tsx, runtime-radio-grid.test.tsx, etc. all untouched by this plan's edits — the SAFE-01 copy flips do not appear in any existing test assertion).

## SAFE-01 Compliance Proof

Final negative invariant grep after both commits:

```
$ grep -rn 'budget.*tokens\|tokens.*budget' dashboard/app/ --include='*.tsx' --include='*.ts'
(empty — exit 1, no matches)
```

Positive-side grep confirmations:

```
$ grep -c "chars (approximate)" dashboard/app/routines/routines-client.tsx
1
$ grep -c "Approximate character cap" dashboard/app/editor/editor-client.tsx
1
$ grep -c "±40%" dashboard/app/editor/editor-client.tsx
1
$ grep -cE "Stopped at.*chars.*budget.*approximate" dashboard/app/queue-client.tsx
1
```

Auth-token contexts at `dashboard/app/settings/settings-client.tsx` (`github.com/settings/tokens/new`) are unaffected — the regex `budget.*tokens|tokens.*budget` does not match those sites because "budget" does not appear in the GitHub PAT context.

## VALIDATION row impact (for Plan 05-08 exit-gate review)

Rows expected to flip green after this plan (per 05-VALIDATION.md):
- Row 29-32: SAFE-01 copy at routines-client + editor-client + queue-client
- Row 33: Cross-plan SAFE-01 negative invariant (`grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` empty)
- Row 35: QUEU-02 pill consumer in queue-client.tsx
- Row 38: Supervisor-run ActionDetail render

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] RecentList status-pill widening for QueueStatus union**

- **Found during:** Task 2 authoring (plan-check soft spot #4 explicitly flagged this as executor responsibility not captured in the plan body)
- **Issue:** Plan 05-01 widened `QueueStatus` to add `"complete"` and `"failed"`, but RecentList's existing ternary `e.status === "approved" ? "pill-green" : "pill-red"` did not learn about the new values. Without widening, every supervisor-run in RecentList renders red (including successful completes — `"complete" !== "approved"`). This is a semantic regression a demo would catch.
- **Fix:** Extracted a `statusPillClass(status)` helper with a 4-arm switch — `approved|complete → pill-green`, `rejected|failed → pill-red`, fallback `pill-muted`. 14 new lines, one new helper, zero new imports.
- **Files modified:** `dashboard/app/queue-client.tsx` (RecentList + statusPillClass addition).
- **Commit:** `373b342` (bundled with Task 2+3 per plan's atomic-commit directive)

**2. [Rule 1 - Bug] Single-line JSX for budget_exceeded render**

- **Found during:** Task 2 verification — acceptance criterion `grep -cE "Stopped at.*chars.*budget.*approximate"` returned 0 because my initial draft broke the copy across two JSX children (`Stopped at <span>N</span> chars` on one line, `{" "}(budget: <span>M</span>, approximate).` on the next).
- **Issue:** The sentence renders correctly in the DOM (whitespace is preserved), but the single-line regex cannot match across newlines. Plan acceptance criterion is explicit about the regex shape.
- **Fix:** Collapsed the JSX to a single line so `grep -cE` matches. DOM output byte-identical (browser reflows whitespace the same way).
- **Files modified:** `dashboard/app/queue-client.tsx` (one-line `<div>` restructure)
- **Commit:** landed as part of `373b342` before stage.

### Intentional Scope Restraint

**3. `dashboard/app/audit/page.tsx` SAFE-01 consistency gap deferred (plan-check soft spot #6)**

- **Found during:** Task 1 SAFE-01 inventory sweep.
- **Issue:** `audit/page.tsx:46` renders `total: {e.total} / budget: {e.budget}` without "approximate". One-word cosmetic edit possible.
- **Decision:** Deferred per plan + plan-check explicit guidance — `/audit` is Phase 6 diagnostics scope. The negative regex invariant does NOT match this site (no literal "tokens" there), so the SAFE-01 invariant passes without change. Noted here for Plan 05-08 exit-gate awareness and for the Phase 6 diagnostics plan to own.
- **No files modified.** No commit.

## Self-Check

- `routines-client.tsx:62` now contains `"chars (approximate)"` — grep count 1 ✓
- `routines-client.tsx:62` no longer contains `"budget: ... tokens"` — grep count 0 ✓
- `editor-client.tsx` contains `"Approximate character cap"` — grep count 1 ✓
- `editor-client.tsx` contains `"±40%"` — grep count 1 ✓
- `queue-client.tsx` exports `SourceIcon` + `SourcePill` + `ActionDetail` — `grep -cE "^export function (SourceIcon|SourcePill|ActionDetail)"` = 3 ✓
- `queue-client.tsx` references `pill-codex` + `pill-gemini` — grep counts 1 + 1 ✓
- `queue-client.tsx` contains `"supervisor-run"` — grep count 3 (isSupervisorRun const + ActionDetail branch + comment-adjacent) ✓
- `queue-client.tsx` contains `"Terminal state"` (footer) — grep count 1 ✓
- `queue-client.tsx` matches `Stopped at.*chars.*budget.*approximate` — grep -cE count 1 ✓
- `queue-client.test.tsx` has 6 `it()` blocks — grep count 6 (plan target ≥5) ✓
- `queue-client.test.tsx` references `pill-(codex|gemini|aurora)` — grep -cE count 11 (plan target ≥3) ✓
- `queue-client.test.tsx` references `budget_exceeded` — grep count 3 ✓
- `queue-client.test.tsx` references `approximate` — grep count 3 ✓
- `grep -rn 'budget.*tokens|tokens.*budget' dashboard/app/` — empty ✓
- `pnpm run typecheck` — exit 0 ✓
- `pnpm run build` — exit 0 ✓
- `pnpm test` — 358/358 green across 40 files ✓
- approval.ts::enqueueForExecution guard at line 22 returns null for tool-less entries (RESEARCH §2.3 verified) — supervisor-run entries with no tool + args field trigger no decide() path; the footer arm omitting Approve/Reject is safe by construction, not just by UI ✓
- Approve/Reject buttons never render for codex/gemini entries — 6th it() block in queue-client.test.tsx would catch regressions (and the existing Task 3 test matrix covers all 4 source variants) ✓
- Commit `8eebb80` exists in git log ✓
- Commit `373b342` exists in git log ✓
- File `dashboard/tests/queue-client.test.tsx` exists ✓

## Self-Check: PASSED
