---
phase: 05-queue
plan: 03
subsystem: queue reader — readSupervisorRuns + 3-source aggregator merge (QUEU-03 consumer)
tags: [queue, aggregator, supervisor-run, reader, audit, wave-1]
status: complete
requires:
  - QueueSource widen (05-01 — "codex" / "gemini" literals)
  - QueueStatus widen (05-01 — "complete" / "failed" terminal states)
  - Supervisor audit_emit contract (Phase 2, frozen) — ts/fleet/runtime/event + extras
provides:
  - readSupervisorRuns(): QueueEntry[] exported from dashboard/lib/queue-aggregator.ts
  - SupervisorAuditEntry interface (internal; exact mirror of bin/sleepwalker-run-cli::audit_emit contract)
  - supervisorRunToQueueEntry() mapper (internal; mirrors cloud-cache.ts::prToQueueEntry)
  - TERMINAL_EVENTS + SUPERVISOR_RUNTIMES allowlist sets
  - 3-source aggregator merge — aggregateQueue merges local + cloud + supervisor into pending/recent
  - AggregatedQueue.supervisorCount additive field
  - 12 it() blocks in dashboard/tests/supervisor-runs.test.ts (PHASE5_BASE sentinel file)
  - 1 integration it() block in dashboard/tests/queue-aggregator.test.ts (4-source merge)
affects:
  - 05-07 (Wave 3 queue-client.tsx UI source branch — will consume QueueEntry[] with kind:"supervisor-run" from aggregateQueue output)
  - 05-08 (Wave 4 freeze-surface gate — uses dashboard/tests/supervisor-runs.test.ts as its PHASE5_BASE sentinel via `git log --reverse --diff-filter=A` lookup)
tech-stack:
  added: []
  patterns:
    - Reader pattern mirrored from dashboard/lib/audit.ts::readAudit — fs.existsSync guard → [], line-split + per-line JSON.parse try/catch, never throws
    - Mapper pattern mirrored from dashboard/lib/cloud-cache.ts::prToQueueEntry — deterministic id (`q_sup_<runtime>_<fleet-munged>_<ts-compact>_<event>`), eager source tag, kind discriminator, payload carries upstream fields verbatim
    - Defensive-shape allowlist — supervisor entries must carry all 4 discriminator fields (runtime/event/ts/fleet) as strings; v0.1 hook entries (tool/input/output_preview shape) are filtered out at parse boundary
    - No-cache policy — audit.jsonl is local-disk fast; unlike cloud-cache's TTL which exists for GitHub API rate limits
    - 24h cutoff via `Date.now() - 24 * 60 * 60 * 1000` literal (CONTEXT.md locked decision)
    - Event-to-status map via switch (completed→complete, failed|budget_exceeded→failed, deferred→rejected) — four-way map, not two-way, because deferred is policy-blocked (not runtime failure)
key-files:
  created:
    - dashboard/tests/supervisor-runs.test.ts (204 lines, 12 it() blocks covering RESEARCH §6.1 matrix verbatim + one deterministic-id block) — PHASE5_BASE sentinel file for 05-08 frozen-surface gate
  modified:
    - dashboard/lib/queue-aggregator.ts (+165/−2 lines — imports + SupervisorAuditEntry interface + TERMINAL_EVENTS/SUPERVISOR_RUNTIMES sets + supervisorRunToQueueEntry mapper + readSupervisorRuns reader + 3-source aggregateQueue merge + supervisorCount field; total file 208 lines from 49)
    - dashboard/tests/queue-aggregator.test.ts (+81/−0 lines — one new integration it() block asserting 4-source merge: local + cloud + codex + gemini; existing 2 blocks byte-identical)
decisions:
  - "Mapper lives in queue-aggregator.ts directly (not extracted to supervisor-runs.ts) per PLAN.md <interfaces> 3rd bullet. Keeps the 3-source aggregation coherent in one file; if a future phase adds a 4th source, extraction is cheap. The supervisor-runs TEST file exists as a separate unit per plan + per 05-08 sentinel-file requirement — separation is reader-side only."
  - "Payload schema carries every upstream field the supervisor emits (event, preview, chars_consumed, chars_limit, partial_output_bytes, exit_code, reason, hour). Undefined fields are preserved as `undefined` in the payload object (not omitted) — trivial for JSON consumers and keeps the mapper branchless. Plan's shape-table under <interfaces> matched verbatim."
  - "No `tool` / `args` fields set on supervisor-run entries. Per RESEARCH §2.3 line 429, dashboard/lib/approval.ts::enqueueForExecution at line 22 returns null for entries without both fields — so supervisor-run entries correctly cannot be approve-dispatched. This matches CONTEXT.md 'terminal states, no resume semantics' decision. No change to approval.ts required."
  - "Dropped the `.` char (as well as `:`, `-`, `T`, `Z`) from the ts-compact regex in id generation. RESEARCH §2.3 showed the tsCompact replacement only sanitized `:-TZ`, but millisecond timestamps (e.g. `2026-04-21T03:00:00.123Z`) contain a dot. Widening the regex to `[:\\-TZ.]` is a Rule 2 / correctness fix: without it, two runs in the same second with different ms would produce two entries containing `.` in the id, which is still valid but visually noisy. Additive refinement only — plan's id format contract still holds (runtime / fleet-munged / ts-stripped / event)."
  - "Shipped 12 it() blocks in supervisor-runs.test.ts, exceeding the plan's ≥8 target and its 'target 11' guidance. The 12th block is a deterministic-id assertion (id matches `^q_sup_codex_codex__daily-brief_\\d+_completed$`) — guards against regression in the id munging regex. Not a deviation: plan's verification criterion is `grep -cE \"^\\s*it\\(\" >= 8` which 12 satisfies."
  - "Full suite 339 → 352 (+13 = +12 supervisor-runs + 1 aggregator). Matches the verification line `336 → >=338+11+1 = >=350` in PLAN.md (it was off by one because the 339 baseline already included the 05-01 +3 delta; 339 + 12 + 1 = 352, which exceeds the plan's projection by 2)."
metrics:
  duration: "~9m (2026-04-21 03:13Z → 03:22Z)"
  tasks-completed: 3/3
  files-created: 1
  files-modified: 2
  test-delta: "339 → 352 (+13; +12 new tests/supervisor-runs.test.ts it() blocks, +1 new 4-source merge block in tests/queue-aggregator.test.ts)"
  commits: 2
  commit-shas: [3c81b4f, a3e85e5]
  date-completed: 2026-04-21
---

# Phase 5 Plan 03: readSupervisorRuns + 3-Source Aggregator Merge — Summary

**One-liner:** Added `readSupervisorRuns()` to `dashboard/lib/queue-aggregator.ts` as a third reader alongside `readLocalQueue` + `fetchCloudQueue` — parses `~/.sleepwalker/audit.jsonl`, filters Codex/Gemini terminal events within the 24h cutoff, and maps each to a `QueueEntry` with `kind:"supervisor-run"`, `source:<runtime>`, and status per event (completed→complete, failed|budget_exceeded→failed, deferred→rejected). `aggregateQueue()` merges all three sources into the pending/recent split; `AggregatedQueue` gains `supervisorCount`. Phase 2 supervisor source is byte-identical — zero write-side edits. Full suite 339 → 352 (+13 tests); 2 atomic commits.

## Objective (as planned)

Add `readSupervisorRuns()` to `dashboard/lib/queue-aggregator.ts` as a third reader alongside `readLocalQueue` + `fetchCloudQueue`. The reader parses `~/.sleepwalker/audit.jsonl`, filters to Codex/Gemini terminal events within the last 24 hours, and maps each to a `QueueEntry` with `kind: "supervisor-run"` and `source: runtime`. Extend `aggregateQueue()` to merge this third source into the pending/recent split (QUEU-03).

Purpose: Phase 2's supervisor already emits the contract audit events (RESEARCH §2.1 verified every required field is present). Phase 5's QUEU-03 work is purely on the READ side — add a reader that surfaces those events into the Morning Queue the same way v0.1's `cloud-cache` surfaces PR entries. Zero supervisor changes; zero new write paths; zero schema changes to `audit.jsonl`.

## Implementation

### Task 1 — Author `dashboard/tests/supervisor-runs.test.ts` (RED gate)

Authored 12 `it()` blocks (plan required ≥8, target 11) in a new test file using real-tmp-HOME fixtures per TESTING.md (no `fs` mocks). Each block writes a fixture `audit.jsonl` via `fs.writeFileSync` into the temp `.sleepwalker/` dir, then dynamically imports `readSupervisorRuns` and asserts:

| # | Block | What it proves |
|---|-------|----------------|
| 1 | `returns empty when audit.jsonl does not exist` | `fs.existsSync()` guard → `[]` |
| 2 | `returns empty when audit.jsonl is empty` | line-filter handles empty file without throw |
| 3 | `filters out v0.1 hook entries that lack a runtime field` | shape-check allowlist — v0.1 `{tool, input, output_preview}` shape dropped |
| 4 | `filters to codex and gemini runtimes only` | `SUPERVISOR_RUNTIMES` allowlist — hypothetical `claude-desktop` runtime dropped |
| 5 | `filters out 'started' events (paired with terminal events later)` | `TERMINAL_EVENTS` allowlist — `started` dropped, `completed` retained |
| 6 | `maps completed event to status complete with full payload` | `completed → "complete"` + kind/source/fleet/payload assertions |
| 7 | `maps failed event to status failed with reason in payload` | `failed → "failed"` + reason/exit_code in payload |
| 8 | `maps budget_exceeded to status failed with chars_consumed + chars_limit in payload` | `budget_exceeded → "failed"` + all 4 char-budget fields preserved |
| 9 | `maps deferred to status rejected with reason + hour in payload` | `deferred → "rejected"` + reason/hour in payload |
| 10 | `drops entries older than the 24h cutoff` | timestamp 48h ago dropped; fresh entry retained |
| 11 | `skips malformed JSON lines without throwing` | `not-json` + unterminated-string mixed with valid JSON → valid entry survives |
| 12 | `generates deterministic q_sup_* ids from runtime + fleet + ts + event` | id format regex `^q_sup_codex_codex__daily-brief_\d+_completed$` |

Dynamic import idiom `await import("@/lib/queue-aggregator")` per TESTING.md — libs that read HOME must never be top-level imported.

**RED state confirmed:** `pnpm test tests/supervisor-runs.test.ts` before Task 2 → all 12 blocks fail with `TypeError: readSupervisorRuns is not a function`. Implementation gap, not a test author bug. Note the `PostToolUse:Write` hook surfaced 12 typecheck errors (`TS2339: Property 'readSupervisorRuns' does not exist`) — expected RED-state noise, cleared by Task 2.

### Task 2 — Implement `SupervisorAuditEntry` + `readSupervisorRuns` + aggregator merge (GREEN gate)

Rewrote `dashboard/lib/queue-aggregator.ts` (49 lines → 208 lines, +165/−2 net). The new code is APPEND-style, not REWRITE — every v0.1 surface is preserved, the signature of `aggregateQueue` is widened with one additive field, and the existing merge/sort/split logic is byte-identical modulo the `...supervisor` spread.

**1. Imports** — added `fs`, `os`, `path` from Node built-ins (mirrors `cloud-cache.ts:1-3`); extended the `./queue` import to include `QueueStatus` + `QueueSource` alongside `QueueEntry`.

**2. `SupervisorAuditEntry` interface** — internal type; exact mirror of the supervisor write-side contract at `bin/sleepwalker-run-cli:69-82` plus every extras-field present in the 5 event types (per RESEARCH §2.1 exhaustive grep):

```ts
interface SupervisorAuditEntry {
  ts: string;
  fleet: string;
  runtime: "codex" | "gemini";
  event: "started" | "completed" | "failed" | "budget_exceeded" | "deferred";
  chars_consumed?: number;  // completed, failed (variant), budget_exceeded
  chars_limit?: number;     // budget_exceeded only
  partial_output_bytes?: number;  // budget_exceeded only
  preview?: string;         // completed, failed (variant), budget_exceeded
  exit_code?: number;       // completed, failed (variant), budget_exceeded
  reason?: string;          // failed (variant), deferred
  hour?: number;            // deferred only
  cli?: string;             // started only
  budget?: number;          // started only
}
```

**3. Allowlist sets** — `TERMINAL_EVENTS = {completed, failed, budget_exceeded, deferred}` and `SUPERVISOR_RUNTIMES = {codex, gemini}`. Allowlist (not blocklist) per RESEARCH §A2 — future Phase 6+ adapter additions won't accidentally appear in the queue until explicitly whitelisted.

**4. `supervisorRunToQueueEntry()` mapper** — mirrors `cloud-cache.ts::prToQueueEntry` shape: deterministic id, eager `source: e.runtime` tag, `kind: "supervisor-run"` discriminator, payload spreading upstream fields verbatim. Status switch:

```ts
switch (e.event) {
  case "completed":        status = "complete";  break;
  case "failed":
  case "budget_exceeded":  status = "failed";    break;
  case "deferred":         status = "rejected";  break;
  default:                 status = "failed";   // unreachable post-filter
}
```

Id format: `q_sup_${runtime}_${fleetMunged}_${tsCompact}_${event}`. The `tsCompact` regex `[:\-TZ.]` (widened from RESEARCH §2.3's `[:\-TZ]` to include `.` for millisecond timestamps — see decision #4).

**5. `readSupervisorRuns()` reader** — mirrors `audit.ts::readAudit` shape: `fs.existsSync` guard → `[]`, line-split + per-line JSON.parse try/catch, defensive 4-field shape check, 24h cutoff filter, map to QueueEntry[]. Never throws.

**6. `aggregateQueue()` 3-source merge** — calls `readSupervisorRuns()` at the top alongside `readLocalQueue()`, merges into `all = [...local, ...cloud, ...supervisor]`, supervisor entries naturally flow to `recent` because `status !== "pending"` for complete/failed/rejected. Pending/recent sort + slice logic byte-identical.

**7. `AggregatedQueue.supervisorCount`** — additive `number` field. v0.1 consumers that destructure `{pending, recent, cloudFetchedAt, cloudError, localCount, cloudCount}` keep working unchanged.

**GREEN state confirmed:** `pnpm test tests/supervisor-runs.test.ts` → 12/12 passing; `pnpm run typecheck` → exit 0; `pnpm test` full suite → 351/351 (339 baseline + 12 new).

### Task 3 — Extend `dashboard/tests/queue-aggregator.test.ts` with 4-source merge integration block

Appended one new `it()` block after the existing 2 blocks (byte-identical to before). Seeds four fixture files in an isolated temp HOME:
- `queue.jsonl` with one local "approved" entry → goes to `recent`
- `cloud-cache.json` with one cloud "pending" PR entry → goes to `pending`
- `audit.jsonl` with one codex "completed" + one gemini "failed" terminal event (both fresh timestamps) → both go to `recent`

Asserts: `localCount === 1`, `cloudCount === 1`, `supervisorCount === 2`, the union of `{pending, recent}.map(e => e.source)` contains all four literals (`local`, `cloud`, `codex`, `gemini`), and the two supervisor entries carry `kind: "supervisor-run"`.

**GREEN confirmed:** `pnpm test tests/queue-aggregator.test.ts` → 3/3 passing. Full suite 351 → 352. Typecheck exit 0.

## Test Delta

| File | Before | After | Delta |
|---|---|---|---|
| `dashboard/tests/supervisor-runs.test.ts` | — | 12 it() blocks | new file (+12) |
| `dashboard/tests/queue-aggregator.test.ts` | 2 it() blocks | 3 it() blocks | +1 |
| **Dashboard total** | **339** | **352** | **+13** |

Test-file count: 38 → 39 (one new file).

## Acceptance Criteria Replay

Each from `<acceptance_criteria>` per task:

**Task 1:**
- `test -f dashboard/tests/supervisor-runs.test.ts` → present ✓
- `grep -cE "^\s*it\(" dashboard/tests/supervisor-runs.test.ts` = **12** (≥8 required; target 11) ✓
- Contains `makeTempHome` ✓
- Contains `readSupervisorRuns` ✓
- Uses `await import("@/lib/queue-aggregator")` (dynamic) ✓
- Contains `"completed"`, `"failed"`, `"budget_exceeded"`, `"deferred"`, `"started"` — all 5 event types ✓
- RED state: 12/12 fail pre-implementation ✓

**Task 2:**
- `grep -c "export function readSupervisorRuns" dashboard/lib/queue-aggregator.ts` = 1 ✓
- `grep -c "interface SupervisorAuditEntry" dashboard/lib/queue-aggregator.ts` = 1 ✓
- `grep -c "function supervisorRunToQueueEntry" dashboard/lib/queue-aggregator.ts` = 1 ✓
- `grep -c 'kind: "supervisor-run"' dashboard/lib/queue-aggregator.ts` = 1 ✓
- `grep -c "supervisorCount" dashboard/lib/queue-aggregator.ts` = 2 (≥2 required — interface + return) ✓
- `grep -cE "24 \* 60 \* 60 \* 1000" dashboard/lib/queue-aggregator.ts` = 1 ✓
- `grep -c "TERMINAL_EVENTS" dashboard/lib/queue-aggregator.ts` = 3 (declaration + usage in filter + one comment ref) ✓
- `pnpm test tests/supervisor-runs.test.ts` → 12/12 pass ✓
- `pnpm run typecheck` → exit 0 ✓
- `pnpm test` full suite → green ✓
- Single `feat(05-03)` commit with both files staged atomically → `3c81b4f` ✓

**Task 3:**
- `grep -cE "4 sources|all 4 sources" dashboard/tests/queue-aggregator.test.ts` = 1 ✓
- `grep -c "supervisorCount" dashboard/tests/queue-aggregator.test.ts` = 1 ✓
- `pnpm test tests/queue-aggregator.test.ts` → 3/3 pass ✓
- `pnpm run typecheck` → exit 0 ✓
- Single `test(05-03)` commit → `a3e85e5` ✓

## QUEU-03 Contract Verification

**Supervisor source unchanged invariant:** `git diff HEAD~2 HEAD -- bin/sleepwalker-run-cli` → 0 lines. Byte-identical to Phase 2 seal. No write-side edits for QUEU-03 — matches the plan's `<success_criteria>` item 9 and the RESEARCH §2 conclusion that "QUEU-03 contract is already met end-to-end by Phase 2's supervisor. Phase 5's QUEU-03 work reduces to: (a) verify, and (b) add the reader."

**approval.ts unchanged invariant:** not staged, not modified. Per RESEARCH §2.3 line 429, the `enqueueForExecution` guard at `dashboard/lib/approval.ts:22` already returns null for entries without both `tool` + `args` — supervisor-run entries carry neither, so they correctly cannot be approve-dispatched. Zero change needed (would have been a Rule 2 correctness fix if missing; verified present pre-plan).

**Plan 05-08 sentinel invariant:** `git log --reverse --diff-filter=A -- dashboard/tests/supervisor-runs.test.ts | head -1` → **`3c81b4f`** — the PHASE5_BASE SHA for Plan 05-08's frozen-surface gate resolves to this plan's `feat` commit. Plan 05-08 can now resolve `PHASE5_BASE=3c81b4f^` (i.e. `37ab5d9`, the 05-02 seal) when it runs the frozen-surface diff.

## Commits

| SHA | Type | Scope | Subject | Files |
|---|---|---|---|---|
| `3c81b4f` | feat | 05-03 | `add readSupervisorRuns + 3-source aggregator merge` | `dashboard/lib/queue-aggregator.ts` (+165/−2), `dashboard/tests/supervisor-runs.test.ts` (new, 204 lines) |
| `a3e85e5` | test | 05-03 | `assert aggregateQueue merges all 4 sources` | `dashboard/tests/queue-aggregator.test.ts` (+81/−0) |

Both commits on `main`. No force push, no amend, no hook skip. Pre-existing untracked files (`CLAUDE.md`, 2 screenshots in `docs/screenshots/`) preserved untouched via explicit path staging.

## Deviations from Plan

None requiring user decision. Three in-scope refinements documented:

1. **[Additive refinement] Widened `tsCompact` regex to include `.`** — RESEARCH §2.3 showed `[:\-TZ]` but millisecond timestamps contain a dot; widened to `[:\-TZ.]`. Plan's id format contract still holds. Rule 2 correctness-adjacent fix.
2. **[Overshot target] Shipped 12 it() blocks vs plan's target 11** — added a deterministic-id assertion as block 12 to guard against regression in the id munging regex. Plan's verification criterion `>=8` satisfied with room to spare.
3. **[Test-count math note]** — Plan's verification line predicted `336 → >=338+11+1 = >=350`; actual was `339 → 352`. The 336 baseline was pre-05-01; 339 is the correct post-05-01 baseline. 352 = 339 + 12 + 1, meeting the spirit of the projection (+13 net).

Zero Rule 1/2/3 auto-fixes triggered. Zero Rule 4 checkpoints. Zero auth gates. Zero architectural decisions. Plan executed as written.

## Self-Check

**Pattern-mirror verification (PATTERNS.md §QUEU-03):**
- `cloud-cache.ts::prToQueueEntry` (lines 38-62) shape — mirrored: deterministic id prefix (`q_sup_` vs `q_cloud_`), eager `source:` tag at the same position, `kind:` discriminator, payload as object literal. ✓
- `audit.ts::readAudit` (lines 21-37) shape — mirrored: `fs.existsSync(f)` guard → `[]`, `fs.readFileSync + split + trim + filter(Boolean)`, JSON.parse inside try/catch per line, never throws. ✓
- `queue.ts::parseLines` (lines 39-51) try/catch idiom — mirrored in `readSupervisorRuns` inner loop. ✓
- `queue-aggregator.ts::aggregateQueue` original body (lines 13-49) — extended, not rewritten. v0.1 pending/recent sort + slice logic byte-identical modulo the `...supervisor` spread. ✓

**File-existence self-check:**
- `dashboard/lib/queue-aggregator.ts` → FOUND (208 lines) ✓
- `dashboard/tests/supervisor-runs.test.ts` → FOUND (204 lines) ✓
- `dashboard/tests/queue-aggregator.test.ts` → FOUND (173 lines, was 93) ✓
- `.planning/phases/05-queue/05-03-SUMMARY.md` → FOUND (this file) ✓

**Commit-existence self-check:**
- `git log --oneline --all | grep -q 3c81b4f` → FOUND ✓
- `git log --oneline --all | grep -q a3e85e5` → FOUND ✓

**Suite health self-check:**
- `pnpm run typecheck` → exit 0 ✓
- `pnpm test` → 352/352 across 39 files ✓
- `git diff HEAD~2 HEAD -- bin/sleepwalker-run-cli` → 0 lines (supervisor byte-identical) ✓

## Self-Check: PASSED

All claims verified against on-disk state + git history.

## Downstream Unlocked

- **Plan 05-07** (Wave 3 queue-client.tsx UI source branch) — can now consume `aggregateQueue({ fetchCloud: false })` output and expect `kind: "supervisor-run"` entries to appear in `recent` with `source: "codex" | "gemini"`. UI mapping of `source → pill` class is the Wave 3 job.
- **Plan 05-08** (Wave 4 frozen-surface gate) — PHASE5_BASE SHA resolves via `git log --reverse --diff-filter=A -- dashboard/tests/supervisor-runs.test.ts | head -1` → `3c81b4f`, so `PHASE5_BASE=3c81b4f^ = 37ab5d9` (the 05-02 seal). The frozen-surface diff can now run against the expected base.
