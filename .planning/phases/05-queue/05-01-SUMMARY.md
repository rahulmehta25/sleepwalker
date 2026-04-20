---
phase: 05-queue
plan: 01
subsystem: queue lib — QueueSource + QueueStatus union widen (QUEU-01 foundation)
tags: [queue, type, union-widen, additive, wave-0]
status: complete
requires: []
provides:
  - QueueSource union widened to "local" | "cloud" | "codex" | "gemini"
  - QueueStatus union widened to "pending" | "approved" | "rejected" | "complete" | "failed"
  - 3 regression it() blocks asserting codex/gemini/complete/failed round-trip through appendQueueEntry + readLocalQueue
affects:
  - 05-02 (pill CSS can reference "codex" and "gemini" source literals without separate type add)
  - 05-03 (readSupervisorRuns can return QueueEntry with source: "codex" | "gemini" and status: "complete" | "failed" literally)
  - 05-07 (Wave 3 UI branch — queue-client.tsx consumers compile unchanged; UI branch is a later plan, not this one)
tech-stack:
  added: []
  patterns:
    - Additive-only union widening validated by grep-audit of consumer sites (RESEARCH §3.2)
    - Widen-then-test ordering: types first, then regression it() blocks asserting the widened literal survives JSON round-trip
key-files:
  modified:
    - dashboard/lib/queue.ts (+6/-1 lines — QueueStatus broken onto 5 lines, QueueSource widened to 4 literals)
    - dashboard/tests/queue.test.ts (+49/0 lines — 3 new it() blocks covering the widened union)
decisions:
  - "Broke QueueStatus across 5 lines (one literal per line) rather than keeping it on one line. Rationale: the widened form has 5 alternatives; single-line formatting would exceed 80 columns and obscure the v0.1 → v0.2 diff intent. QueueSource stayed on a single line because 4 short literals still fit comfortably."
  - "Third it() block (gemini + complete combined) added beyond the plan-minimum of 2. Rationale: cheap additional assertion that proves the two widened unions compose; no maintenance cost because the test mirrors the same scaffolding as the other two. Plan target `>=2` was respected; `3` over-delivered is documented here but is not a deviation (the plan says `>=2` explicitly in Task 2 behavior)."
  - "Left queue.test.ts expectation that readLocalQueue tags source:'local' unchanged — the new codex/gemini test asserts status round-trip, not source preservation. This is the documented v0.1 behavior (queue.ts:58 eagerly re-tags every read entry to source:'local'); Plan 05-03's readSupervisorRuns is the proper reader for codex/gemini entries and will be the place to assert source survival."
metrics:
  duration: "~6m (2026-04-20 02:53Z → 02:58Z)"
  tasks-completed: 2/2
  files-created: 0
  files-modified: 2
  test-delta: "336 → 339 passing (+3 blocks in queue.test.ts: 7 → 10)"
  commits: 1
  commit-shas: [a545f0b]
  date-completed: 2026-04-20
---

# Phase 5 Plan 01: Widen QueueSource + QueueStatus — Summary

**One-liner:** Widened `QueueSource` union to `"local" | "cloud" | "codex" | "gemini"` and `QueueStatus` union to add `"complete" | "failed"` terminal states, with 3 new regression it() blocks asserting the widened literals round-trip through `appendQueueEntry` + `readLocalQueue`. Zero consumer-side edits required — typecheck exit 0 confirming RESEARCH §3.2 grep-audit prediction that no exhaustive switch exists over either union.

## Objective (as planned)

Widen `QueueSource` to accept `"codex"` and `"gemini"` (QUEU-01) and widen `QueueStatus` to include `"complete"` and `"failed"` (supervisor-run terminal states mapped by Plan 05-03's `readSupervisorRuns`). Keep the change strictly additive — no field renames, no body rewrites, no consumer edits. The widen is a Wave-0 foundation that QUEU-02 (pill CSS), QUEU-03 (supervisor-run reader), and Wave 3 (UI branch) all depend on; keeping it isolated in its own plan makes the atomic change reviewable and any downstream type error surfaces against this commit, not behind a wall of simultaneous changes.

## Implementation

### Task 1 — Widen QueueSource + QueueStatus in `dashboard/lib/queue.ts`

Replaced lines 10-11 of `dashboard/lib/queue.ts`:

```typescript
// Before (v0.1):
export type QueueStatus = "pending" | "approved" | "rejected";
export type QueueSource = "local" | "cloud";

// After (this plan):
export type QueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "complete"
  | "failed";
export type QueueSource = "local" | "cloud" | "codex" | "gemini";
```

Everything else in the file is byte-identical: `Reversibility`, `QueueEntry`, `queueFile`, `ensureFile`, `parseLines`, `readLocalQueue`, `appendQueueEntry`, `updateLocalStatus`, `pendingCount` all unchanged. `pnpm run typecheck` exited 0 immediately after the edit with zero edits needed anywhere else in the codebase.

### Task 2 — Add regression it() blocks asserting widened union round-trips

Appended 3 new it() blocks to `dashboard/tests/queue.test.ts` (plan-minimum was >=2; delivered 3 for combined-assertion coverage):

1. **`round-trips source:'codex' and status:'complete' through append + read`** — writes a `source:"codex"`, `status:"complete"`, `kind:"supervisor-run"` entry via `appendQueueEntry`; reads it back via `readLocalQueue`; asserts `status === "complete"` and `kind === "supervisor-run"` survive the JSON round-trip. Inline comment documents that v0.1's `readLocalQueue` eagerly re-tags source to `"local"` (queue.ts:58) — this widen plan preserves that behavior; Plan 05-03's `readSupervisorRuns` is the proper reader for codex/gemini entries. The assertion proves the widened status literal and the write/read pipeline accepting the widened source type at compile and write time.
2. **`round-trips status:'failed' with source:'gemini' through parseLines`** — writes a `source:"gemini"`, `status:"failed"` entry; asserts `status === "failed"` reads back unchanged.
3. **`appendQueueEntry accepts source:'gemini' with status:'complete' combined`** — smoke test that the two widened unions compose without trouble; asserts `status === "complete"` and `fleet === "gemini/triage"` survive round-trip.

Each block uses the existing `beforeEach(makeTempHome + ensureSleepwalkerDir) / afterEach(restore)` scaffolding and the dynamic `@/lib/queue` import pattern — no changes to the test file's setup.

## Consumer-Site Audit Confirmation

RESEARCH §3.2 claimed that no exhaustive switch over `QueueSource` or `QueueStatus` exists anywhere in `dashboard/`. That prediction held:

- **`pnpm run typecheck` exit 0** with zero edits outside `dashboard/lib/queue.ts` + `dashboard/tests/queue.test.ts`.
- Grep for `switch\s*\(.*(source|status)` surfaced exactly one hit: `app/routines/_components/deploy-step-pill.tsx:121` — that switch is over `StepStatus` (a separate deploy-step domain type from Phase 4), NOT `QueueStatus`. Out of scope.
- All other call sites use string-literal comparisons that widen transparently: `approval.ts:21` (`entry.source === "cloud"`), `queue-client.tsx:70` (`current.source === "cloud"`), `api/queue/route.ts:18` (narrower POST body `source?: "local" | "cloud"` — intentionally unchanged, out of scope per plan).

## Suite Count Delta

| Metric        | Before | After | Delta |
| ------------- | ------ | ----- | ----- |
| Test files    | 38     | 38    | 0     |
| Passing tests | 336    | 339   | +3    |
| Failing tests | 0      | 0     | 0     |
| Typecheck     | pass   | pass  | —     |
| queue.test.ts | 7      | 10    | +3    |

## Commits

| Task    | Commit    | Message                                                            |
| ------- | --------- | ------------------------------------------------------------------ |
| 1 + 2   | `a545f0b` | `feat(05-01): widen QueueSource + QueueStatus for codex/gemini`    |

Single atomic commit covers both tasks per Plan 05-01 design — Task 1 (lib edit) and Task 2 (tests + commit) share a commit boundary because the plan explicitly instructs `git add dashboard/lib/queue.ts dashboard/tests/queue.test.ts` then a single `git commit -m "feat(05-01): ..."`.

## Acceptance-Criteria Greps (Plan Task 1 + Task 2)

All grep counts satisfy plan acceptance criteria:

```
QueueSource widened line count:                 1   (required: =1)
Status literals "complete"+"failed" in lib:     2   (required: =2)
readLocalQueue body preserved:                  1   (required: =1)
appendQueueEntry body preserved:                1   (required: =1)
updateLocalStatus body preserved:               1   (required: =1)
pendingCount body preserved:                    1   (required: =1)
it() blocks in queue.test.ts:                  10   (required: >=9)
codex|gemini literals in test:                  4   (required: >=2)
complete|failed literals in test:               7   (required: >=2)
```

## VALIDATION.md Rows Delta

Plan 05-01 is covered by VALIDATION rows 1-4 (§Per-Task Verification Map). All four flipped green with this commit:

- **Row 1** `5-01-01 | 05-01 | QUEU-01 | unit | pnpm test tests/queue.test.ts -t "codex"` — passes, 1/10 block matches codex filter.
- **Row 2** `5-01-02 | 05-01 | QUEU-01 | unit (type+round-trip) | pnpm test tests/queue.test.ts -t "gemini"` — passes, 2/10 blocks match gemini filter.
- **Row 3** `5-01-01 | 05-01 | QUEU-01 | unit (status widen) | pnpm test tests/queue.test.ts -t "complete"` — passes, 2/10 blocks match complete filter.
- **Row 4** `5-01-01 | 05-01 | QUEU-01 | typecheck | cd dashboard && pnpm run typecheck` — exit 0.

## Deviations from Plan

None — plan executed exactly as written.

- Delivered 3 regression it() blocks (plan says `>=2`, so 3 respects the minimum and is documented in `decisions[]` above as a deliberate over-delivery, not a deviation).
- No auth gates, no checkpoints, no Rule 1/2/3 auto-fixes, no architectural deviations (Rule 4).
- Pre-existing untracked files (`CLAUDE.md`, 2 screenshot PNGs) preserved untouched via explicit staging of only the 2 plan files.

## Downstream Plans Unlocked

- **05-02** — pill CSS classes `.pill-codex` and `.pill-gemini` can now reference a `QueueSource` literal that exists in the type surface.
- **05-03** — `readSupervisorRuns` can return `QueueEntry` values with `source: "codex" | "gemini"` and `status: "complete" | "failed"` literals without extending the type in a later plan.
- **05-07** — Wave 3 UI branch in `queue-client.tsx` will compile unchanged against the widened union; the switch over source in the UI is a later plan's surface, not this one's.

## Self-Check: PASSED

- `dashboard/lib/queue.ts` contains the exact widened `QueueSource` (`grep -c 'QueueSource = "local" | "cloud" | "codex" | "gemini"'` = 1) and widened `QueueStatus` (both `"complete"` and `"failed"` present).
- `dashboard/tests/queue.test.ts` has 10 `it(` blocks (was 7), with >=2 codex/gemini literals and >=2 complete/failed literals.
- Commit `a545f0b` exists in `git log` with the expected `feat(05-01): widen QueueSource + QueueStatus for codex/gemini` subject line.
- Full test suite 339/339 green across 38 files; typecheck exit 0.
- Zero deletions, zero pre-existing-file collateral damage (verified via `git diff --diff-filter=D HEAD~1 HEAD` returning empty).
