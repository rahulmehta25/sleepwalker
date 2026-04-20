---
phase: 05-queue
type: patterns
generated: 2026-04-20
---

# Phase 5 Pattern Map

Each row maps a Phase 5 deliverable to its closest existing analog. Mirror naming, error
handling, test idioms, and shape from the analog. Caveats call out what NOT to copy.

Phase 5 is mostly amend-in-place (no new route handlers, no new adapters). The "new
file" candidates are limited to: an optional `supervisor-runs.ts` extraction, its test,
and a flock concurrency test inside the existing supervisor harness. Everything else is
edits to files that already exist.

---

## QUEU-01 — Widen `QueueSource` union

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/lib/queue.ts` (amend type alias only; no new file) |
| Closest analog | `dashboard/lib/queue.ts:11` (current `QueueSource = "local" \| "cloud"`) |
| Mirror | Single-line `export type` extension to `"local" \| "cloud" \| "codex" \| "gemini"`. Leave `source?: QueueSource` optional on `QueueEntry` — eager-tagging happens at the producer (Plan ref `cloud-cache.ts:60`, `queue.ts:53`). |
| Caveats | Do NOT widen `QueueStatus` here. Status widening (if any) is decided by QUEU-03 — keep the type changes additive and reviewable in isolation. Do NOT touch the `parseLines`, `appendQueueEntry`, `updateLocalStatus`, or `pendingCount` bodies — they treat `source` as opaque. |

---

## QUEU-02 — `pill-codex` + `pill-gemini` Tailwind utilities

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/app/globals.css` (amend `@layer components`; no new file) |
| Closest analog | `dashboard/app/globals.css:74-82` (the existing `.pill-green / .pill-amber / .pill-red / .pill-aurora / .pill-muted` block + legacy aliases) |
| Mirror | Add two lines that follow the exact macro shape: `.pill-codex { @apply pill bg-aurora-400/10 text-aurora-400 border border-aurora-400/20; }` and `.pill-gemini { @apply pill bg-signal-amber/10 text-signal-amber border border-signal-amber/20; }`. Reuse palette tokens from `tailwind.config.js:6-36` (`aurora-400`, `signal-amber`, `signal-green`) — do not introduce new hex values. Insert directly after `.pill-aurora` so visually-grouped variants stay contiguous. |
| Caveats | Do NOT register a new `extend.colors` entry in `tailwind.config.js`; the palette is intentionally fixed (lunar/celestial). Do NOT add `.pill-codex` to the legacy alias block (lines 79-82) — those aliases exist for historical compat, new pills should be canonical names. Do NOT use semitransparent palette colors not already in the config (e.g., no `aurora-400/15`); stick to the `/10` bg + `/20` border pattern the four existing variants use. |

---

## QUEU-02 (consumer) — Render new pills in queue UI

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/app/queue-client.tsx` (amend; small switch on `current.source`) |
| Closest analog | `dashboard/app/queue-client.tsx:99-108` (the `isCloud ? <Cloud/> : <HardDrive/>` icon block + the inline pill decision on line 104) |
| Mirror | Replace the binary `isCloud` boolean with a `source = current.source ?? "local"` discriminator. Use the same `lucide-react` icon idiom — pick `Sparkles` for codex, `Stars` for gemini (or any icon already imported elsewhere in the dashboard; check `dashboard/app/_components/health-badge.tsx:20` for the established `lucide-react` import style). Render `<span className="pill-codex">codex</span>` / `<span className="pill-gemini">gemini</span>` parallel to the existing `pill-aurora` line. Update `RecentList` (line 246) the same way — it currently shows `e.source ?? "local"` as plain text; promote it to a tiny pill switch for visual parity. |
| Caveats | Do NOT extract a `<SourcePill>` component yet unless the planner sees a third call site — current usage is queue-only. (Per CONTEXT.md `Claude's Discretion`, planner picks inline vs helper. Default to inline; the existing reversibility pill at line 232-236 is a tiny helper inside the same file — copy that shape if extracting.) Do NOT change the `ActionDetail` block (line 169) — its branching is `entry.source === "cloud"`-specific because cloud has PR payload semantics; codex/gemini will fall through to the existing `entry.kind && entry.payload` arm at line 214 cleanly once `kind: "supervisor-run"` is set. |

---

## QUEU-03 — `readSupervisorRuns()` (audit.jsonl → QueueEntry)

| Field | Value |
|---|---|
| Phase 5 target | Recommend amending `dashboard/lib/queue-aggregator.ts` directly, OR extracting a new `dashboard/lib/supervisor-runs.ts` if planner prefers separation. Both are acceptable per CONTEXT.md. |
| Closest analog | **Producer shape:** `dashboard/lib/cloud-cache.ts:38-62` (`prToQueueEntry()` — pure mapper from upstream record to `QueueEntry` with eager `source: "cloud"` tag). **Reader shape:** `dashboard/lib/audit.ts:21-37` (`readAudit()` — gracefully handles missing file, JSON.parse with try/catch per line, slice tail). **Aggregator wiring:** `dashboard/lib/queue-aggregator.ts:13-49` (`aggregateQueue()` — the `[...local, ...cloud]` merge, the pending/recent split, the `localCount`/`cloudCount` shape). |
| Mirror | (1) Read with `audit.ts` idioms — `if (!fs.existsSync(f)) return []`, line-split + try/catch JSON.parse, never throw. (2) Filter `event in {completed, failed, budget_exceeded, deferred}` AND `runtime in {codex, gemini}` (skip `started` events; they're transient). (3) Map each surviving `AuditEntry` to `QueueEntry` via a `supervisorRunToQueueEntry()` mapper styled exactly like `prToQueueEntry`: deterministic id (`q_sup_<runtime>_<slug>_<ts-millis>`), `kind: "supervisor-run"`, `source: runtime` (eager-tag — same idiom as `cloud-cache.ts:60`), `status: e.event === "completed" ? "complete" : "failed"` (or whatever discriminator planner picks per the QueueStatus widening note below), `payload: { event, preview, chars_consumed, chars_limit }`. (4) Wire into aggregator as a third reader alongside `local` + `cloud`; `aggregateQueue` accumulates a fourth count `supervisorCount` and the existing pending/recent sort still works because `ts` is uniform ISO 8601. |
| Caveats | Do NOT add an HTTP fetch / network dep — supervisor runs are local-only. Do NOT add caching à la `cloud-cache.ts` (audit.jsonl reads are cheap; the cache is justified for cloud only because GitHub API is rate-limited). Do NOT widen `AuditEntry` in `dashboard/lib/audit.ts:9-19` — it already has `event`, `total`, `budget` optional fields plus extension via index signature isn't there but the supervisor mapper can cast/`as`. If planner decides QueueStatus needs to widen, do it in `queue.ts` alongside QUEU-01 and update `queue-client.tsx:34` (`newStatus = action === "approve" ? "approved"` literal) to be exhaustive — but per CONTEXT.md `Claude's Discretion` the alternative is leaving `QueueStatus` alone and using string literal type `"complete" \| "failed"` only inside the supervisor-run mapper, dropping into `status` as `as QueueStatus` at the boundary. Either way: supervisor-run entries never go through the `decide()` flow at line 23 (no approve/reject buttons), so the strict type isn't safety-critical at runtime — readability matters more. |

### Test analog for QUEU-03

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/tests/supervisor-runs.test.ts` (new file) OR extend `dashboard/tests/queue-aggregator.test.ts` (existing, line 1-93). |
| Closest analog | `dashboard/tests/cloud-cache.test.ts:1-87` (best fit — it tests a producer that maps an upstream JSON shape to `QueueEntry` and asserts on the resulting fields). Also reference `dashboard/tests/queue-aggregator.test.ts:20-57` for the `aggregateQueue({ fetchCloud: false })` integration shape and the `fs.writeFileSync(path.join(dir, "audit.jsonl"), ...)` fixture pattern. |
| Mirror | (1) `import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"` + `import { makeTempHome, ensureSleepwalkerDir } from "./helpers"` — every dashboard test starts this way. (2) `beforeEach: env = makeTempHome(); dir = ensureSleepwalkerDir(env.home);` and `afterEach: env.restore(); vi.restoreAllMocks();`. (3) Write fixture `audit.jsonl` lines via `fs.writeFileSync` (see `queue-aggregator.test.ts:21-27` for the exact JSON-stringify-and-join pattern). (4) Dynamic import: `const { readSupervisorRuns } = await import("@/lib/queue-aggregator")` — never top-level import lib code that touches HOME. (5) Assert on `entries[0].source === "codex"`, `kind === "supervisor-run"`, that `started` events are filtered out, that malformed lines don't throw. |
| Caveats | Do NOT mock `fs` — use real temp HOME (TESTING.md §"What NOT to Mock"). Do NOT mock `globalThis.fetch` — there's no network here (unlike `cloud-cache.test.ts:25-68` which had to). Do NOT add a separate fixtures directory — fixtures inline in the test file per `queue-aggregator.test.ts:21-45`. |

---

## QUEU-04 — `flock` wrapper around audit.jsonl appends

### Writer 1: `hooks/sleepwalker-audit-log.sh`

| Field | Value |
|---|---|
| Phase 5 target | `hooks/sleepwalker-audit-log.sh:45` (current `echo "$ENTRY" >> "$AUDIT_FILE"` — wrap with flock) |
| Closest analog | None inside the repo today (no existing flock usage). Closest *style* analog is `hooks/sleepwalker-audit-log.sh:7` (`set -euo pipefail`) and the early-bail-out pattern at lines 19-27 — i.e., terse, defensive bash with explicit error-mode and silent no-op exit. |
| Mirror | Define `LOCK_FILE="${AUDIT_FILE}.lock"` (separate file per CONTEXT.md decision, never lock the data file). Replace the bare `echo >> "$AUDIT_FILE"` with `flock -x -w 5 "$LOCK_FILE" -c "echo '$ENTRY' >> '$AUDIT_FILE'"` OR the FD form: `( flock -x -w 5 200; echo "$ENTRY" >> "$AUDIT_FILE" ) 200>"$LOCK_FILE"`. Quoting: `$ENTRY` is jq-emitted compact JSON — contains double quotes, must be passed through carefully. The FD form sidesteps the `-c` quoting hazard entirely; prefer it. Touch `$LOCK_FILE` once at the top alongside `touch "$AUDIT_FILE"` (line 13) so the FD redirect succeeds on first run. Add a comment block referencing `.planning/codebase/CONCERNS.md` §concurrent JSONL race so future readers know why it's there (CONVENTIONS.md §Comments — "explain WHY"). |
| Caveats | Do NOT use `flock --no-fork` flags — macOS `flock(1)` is the util-linux port via Homebrew; only use POSIX-portable flags. Do NOT swallow the lock-acquisition timeout silently — if `flock -w 5` returns nonzero (timeout), the audit entry is lost, which is a worse failure than the line we're protecting against. Acceptable handling: `flock` returns nonzero, hook exits nonzero, Claude Code surfaces the failure. Do NOT remove or alter the existing `printf '{}\n'` exit on line 47 — that's the hook's stdout contract and Claude Code parses it. |

### Writer 2: `bin/sleepwalker-run-cli` (`audit_emit` function)

| Field | Value |
|---|---|
| Phase 5 target | `bin/sleepwalker-run-cli:69-81` (`audit_emit()` — both `printf … >> "$AUDIT_FILE"` branches need wrapping) |
| Closest analog | The same flock idiom from Writer 1 above. Internal style analog: `bin/sleepwalker-run-cli:85-87` (`strip_ansi()` — short single-purpose helper above the call site) is the right shape for a `_with_lock()` wrapper if the planner extracts one. |
| Mirror | Two clean options: (A) Inline-wrap each `printf … >> "$AUDIT_FILE"` with the FD-form flock, identical idiom to Writer 1 — duplicates four lines but keeps `audit_emit` self-contained. (B) Extract a `_locked_append() { local entry="$1"; ( flock -x -w 5 200; printf '%s\n' "$entry" >> "$AUDIT_FILE" ) 200>"$LOCK_FILE"; }` helper above `audit_emit` and have both branches build the JSON string then call `_locked_append "$json"`. The supervisor already uses this small-helper-above-caller pattern (see `strip_ansi()` at line 85 immediately above its call site at line 166). Pick (B). Define `LOCK_FILE="${AUDIT_FILE}.lock"` near the existing `AUDIT_FILE=` declaration on line 54. |
| Caveats | Do NOT use a different lock path here than Writer 1 — both writers MUST share `${HOME}/.sleepwalker/audit.jsonl.lock` exactly, otherwise the lock is effectively two unrelated mutexes. Do NOT lose the existing JSON shape — `audit_emit` carefully constructs `{"ts":...,"fleet":...,"runtime":...,"event":...}` with a conditional comma for the `extra` fragment (lines 74-80); preserve that. Do NOT wrap the `audit_emit` callers (lines 91, 106, 121, 132, 140, 155, 195, 200, 203) — wrap inside `audit_emit` only, single point of change. Do NOT add a `flock` availability check at the top of the supervisor — that belongs in `install.sh` per CONTEXT.md decision; just assume it's on PATH and let it fail loudly if not (matching the existing PATH-resolution pattern at lines 96-109). |

### Test analog for QUEU-04 (concurrency)

| Field | Value |
|---|---|
| Phase 5 target | `hooks/tests/supervisor-tests.sh` (extend with new scenario), OR a new `hooks/tests/audit-concurrency.sh` if the planner prefers isolation. |
| Closest analog | `hooks/tests/supervisor-tests.sh:151-167` (Scenario 1 happy path — full structure: `echo "==> scenario N: …"`, `reset_state`, `make_bundle`, `set +e` / `"$SUPERVISOR" …` / `set -e`, then `assert_*` rolls). Also `hooks/tests/run-tests.sh:188-218` (the audit-log test block — shows how to invoke the hook script in a loop and `assert_file_lines` on the resulting `audit.jsonl`). |
| Mirror | (1) Extend the existing supervisor-tests.sh harness — it already has isolated `$HOME`, `$TEST_BIN`, `reset_state`, all three `assert_*` helpers, and the `==> scenario N: description` echo banner. New scenario at the bottom (before the Summary block at line 297-313). (2) Spawn 4 background subprocesses (`for i in 1 2 3 4; do ( ... ) & done; wait`) each calling `audit_emit`-equivalent or invoking the audit-log hook 100 times in a loop. (3) Assert: line count matches expected total exactly (`assert_file_lines` line 73-78), every line round-trips through `jq -c .` cleanly (loop with `jq` exit code check — see Scenario 2 lines 178-189 for the pattern of asserting on file contents with grep), no truncated lines (no line is shorter than the minimum valid JSON envelope length). (4) Run scenario WITHOUT flock first as a control to demonstrate the race exists, then with flock to demonstrate it's fixed — but that's overkill for a regression test; one scenario asserting the post-flock behavior is sufficient. |
| Caveats | Do NOT introduce a new test framework — use the same bash-only harness pattern (no bats, no shunit). Do NOT add this to `hooks/tests/run-tests.sh` (the v0.1 main suite, 26 tests) — Phase 5's flock work is tested in `supervisor-tests.sh` because both writers (hook + supervisor) are exercised by the same lock mechanism, and `supervisor-tests.sh` already isolates `$HOME` more aggressively. Do NOT use `sleep N` for synchronization between the racing subprocesses — `wait` with no args waits for all background jobs. Do NOT skip the test on systems lacking `flock` — fail loudly per the install.sh prereq decision in CONTEXT.md. |

---

## SAFE-01 — "Approximate" labeling (cross-cutting UI)

### Site 1: Routine card budget display

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/app/routines/routines-client.tsx:62` (current `budget: {r.defaultBudget.toLocaleString()} tokens` — replace "tokens" with the approximate-chars copy) |
| Closest analog | `dashboard/app/routines/routines-client.tsx:46-50` (the inline pill+text label idiom — concise, font-mono, single-line). For wording structure, see `dashboard/app/_components/health-badge.tsx:87` (`{label} · {status.version ?? "ready"}`) — the "·" separator is the established separator-of-facts in this codebase. |
| Mirror | Replace `budget: {r.defaultBudget.toLocaleString()} tokens` with `budget: {r.defaultBudget.toLocaleString()} chars (approx. ±40%)`. Keep the surrounding `<div className="text-xs text-moon-400 mt-2 font-mono">` wrapper unchanged. Per CONTEXT.md: NEVER use the word "tokens" anywhere in the rendered string. |
| Caveats | Do NOT add a tooltip explaining the approximation here — that lives in AUTHORING.md (Phase 6, deferred). Do NOT change `r.defaultBudget` or the lib-side type — this is a UI string change only. |

### Site 2: Editor budget input helper text

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/app/editor/editor-client.tsx:462-480` (the BUDGET (CHARS) `<label>` block + `<input>` — the label already says "CHARS" which is correct, but there's no helper text explaining the approximation) |
| Closest analog | `dashboard/app/editor/editor-client.tsx:475-479` (the existing `fieldErr.budget?.[0]` error rendering directly under the input) is the right anchor for additional helper copy. Tone-and-style analog: `dashboard/app/_components/health-badge.tsx:101` (the `title={...}` tooltip wording — informative single-sentence with terminating period). |
| Mirror | Add a sibling `<span className="text-xs text-moon-400">Approximate character count. Tokens vary by ±40%. See AUTHORING.md.</span>` directly inside the same `<label>` element (line 462), positioned BELOW the `<input>` and BELOW the existing field-error span at lines 475-479. The `text-xs text-moon-400` class is the established helper-text token (see `routines-client.tsx:59`, `audit/page.tsx:36`). Do not link to AUTHORING.md as an anchor href — Phase 6 owns that doc; the bare reference is fine. |
| Caveats | Do NOT introduce a tooltip component — the existing dashboard relies on native `title=` for hover hints (see `health-badge.tsx:101`, `status-pill.tsx:57`). Do NOT change the `name="budget"` form field, the validation `min={1000}` / `max={200000}`, or the submit shape — Phase 3 owns the form contract. Do NOT relabel the `<span className="label">BUDGET (CHARS)</span>` — it already says CHARS, the violation is the absence of explanation, not the label itself. |

### Site 3: Queue entry for `budget_exceeded` events

| Field | Value |
|---|---|
| Phase 5 target | `dashboard/app/queue-client.tsx::ActionDetail` (line 169-230) — extend the `entry.kind && entry.payload` arm (line 214) to render budget_exceeded specially when `entry.payload.event === "budget_exceeded"`. |
| Closest analog | `dashboard/app/queue-client.tsx:170-197` (the cloud-PR `ActionDetail` arm — shows how to pull typed fields from `entry.payload as Record<string, …>` and render labeled rows with `.label` + `.data` classes). Also `dashboard/app/audit/page.tsx:46` (`total: {e.total} / budget: {e.budget}` — the existing audit-page rendering for the same event, also missing "approx" today). |
| Mirror | Inside the existing `entry.kind && entry.payload` arm, branch on `payload.event === "budget_exceeded"`: render `Stopped at {chars_consumed} chars (budget: {chars_limit}, approx.)`. Use the `.label` / `.data` classes that already wrap field values (see line 175-176). For the catch-all "all other supervisor-run kinds" case, fall through to the existing JSON.stringify panel at line 222-224. |
| Caveats | Do NOT modify `dashboard/app/audit/page.tsx:46` in Phase 5 — that's the raw audit log view, separate concern; if the planner wants to fix it for SAFE-01 consistency, that's a one-word edit ("budget" → "budget (approx.)") but is technically scope-stretching. CONTEXT.md `<deferred>` puts the diagnostics page in Phase 6 — leave audit page alone. Do NOT introduce a new `<BudgetExceededDetail>` component — single inline branch matches the existing `ActionDetail` style (no sub-components per concern). |

---

## Cross-cutting style references

These apply to every Phase 5 file. Pulled from `.planning/codebase/CONVENTIONS.md` and reinforced by the analogs above:

- **TS imports**: built-in node first (`import fs from "node:fs"`), then external (`vitest`), then `@/lib/...` aliases, then types last (`import type { QueueEntry } from "@/lib/queue"`). Examples: `cloud-cache.ts:1-5`, `queue-aggregator.ts:1-2`.
- **Error handling**: graceful fallbacks for file/JSON parsing — return `[]` or `null`, never throw inside readers. See `parseLines` (`queue.ts:34-47`) and `readAudit` (`audit.ts:21-37`).
- **Eager source tagging**: source is set at the producer, not the consumer. See `cloud-cache.ts:60` (`source: "cloud"`) and `queue.ts:53` (`source: "local" as const`). Phase 5's supervisor-run mapper MUST do the same.
- **No barrel exports**: import directly from module path. No `index.ts` exists in `dashboard/lib/`.
- **Bash hooks**: `set -euo pipefail` always (line 1 of every hook). All `$VAR` expansions double-quoted. JSON via `jq`, never via string concat.
- **Bash tests**: harness sets isolated `HOME`, defines `assert_eq` / `assert_contains` / `assert_file_lines`, organizes scenarios with `==> scenario N:` headers, and ends with a Pass/Fail summary block. See `supervisor-tests.sh:299-313`.
- **No emojis** in code, comments, or commit messages (per global CLAUDE.md). The existing dashboard uses `lucide-react` icons exclusively for visual affordances.

---

## What Phase 5 must NOT touch (frozen surface)

- `dashboard/lib/queue.ts` body of `readLocalQueue`, `appendQueueEntry`, `updateLocalStatus`, `pendingCount` (only widen the `QueueSource` type alias)
- `dashboard/lib/cloud-cache.ts` (Phase 1 froze the cloud reader; supervisor-runs is a sibling, not a replacement)
- `~/.sleepwalker/queue.jsonl`, `~/.sleepwalker/audit.jsonl` schemas (CLAUDE.md frozen surface — Phase 5 only adds the lock file `~/.sleepwalker/audit.jsonl.lock` alongside)
- `bin/sleepwalker-run-cli` audit JSON shape — wrap the writer with flock, do not change the JSON keys or values it emits
- `hooks/sleepwalker-audit-log.sh` JSON shape (line 35-43) — wrap the writer with flock, do not change the jq-built entry
