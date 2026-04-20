# Phase 5: Queue — Context

**Gathered:** 2026-04-20
**Status:** Ready for research + planning
**Source:** Direct authoring from ROADMAP + REQUIREMENTS (rich pre-context; no discuss-phase round needed)

<domain>
## Phase Boundary

Extend the Morning Queue + audit surface so Codex and Gemini runs produce normalized, ANSI-stripped, flock-protected JSONL that flows through every v0.1 consumer unchanged, and dashboard UI labels character budgets honestly.

**Requirements (5):** QUEU-01, QUEU-02, QUEU-03, QUEU-04, SAFE-01

**Deliverables:**
- `dashboard/lib/queue.ts` — `QueueSource` union widened to `"local" | "cloud" | "codex" | "gemini"` (additive, non-breaking for existing consumers)
- `dashboard/lib/queue-aggregator.ts` — extended to read Codex/Gemini runs from `~/.sleepwalker/audit.jsonl` filtered by runtime + fleet, mapped into `QueueEntry` shape alongside local + cloud
- `dashboard/app/_components/queue-source-pill.tsx` (or extension of existing pill component) — two new source-pill variants (codex + gemini) matching the lunar/celestial palette; pure CSS, zero new dependencies
- Supervisor (`bin/sleepwalker-run-cli`) — audit_emit schema verification pass; any normalization gaps closed so every Codex/Gemini event has `{ts, fleet: "<runtime>/<slug>", runtime, event, …}` shape that `jq .` parses cleanly
- **flock wrapper around every audit.jsonl append** — applies to both writers (`hooks/sleepwalker-audit-log.sh` PostToolUse hook AND `bin/sleepwalker-run-cli` supervisor); uses POSIX `flock(1)` on `~/.sleepwalker/audit.jsonl.lock` with brief hold + timeout; closes the v0.1 CONCERNS.md concurrent-write race
- SAFE-01 surface: UI renders char-budget cap with "approximate" label (never "tokens") on the routine card + in the editor budget input helper text; `±40%` approximation explainer in AUTHORING.md (Phase 6 will own the doc; Phase 5 wires the UI copy)

**Out of scope (belongs to later phases):**
- AUTHORING.md / docs / diagnostics page → Phase 6
- Approve/reject affordances for Codex/Gemini deferred entries → terminal states, no resume semantics in v0.2
- Per-run prompt re-firing from the queue UI → Phase 4 runNow already covers fresh fires; queue displays history, not re-fire controls
- A real tokenizer for the char budget → explicitly out-of-scope per PROJECT.md anti-features
</domain>

<decisions>
## Implementation Decisions

### flock strategy (QUEU-04)

**Locked:** POSIX `flock(1)` exclusive lock on `~/.sleepwalker/audit.jsonl.lock` (separate lock file, never on the data file itself). Both writers wrap their append in `flock -x "$LOCK_FILE" -c 'echo "$ENTRY" >> "$AUDIT_FILE"'` OR use the `flock -x FD` file-descriptor form. Brief hold (single write). 5-second timeout.

**Why:**
- POSIX `flock(1)` ships on macOS (part of util-linux backport available via Homebrew OR `/usr/bin/flock` on recent macOS). Fallback: `brew install flock` documented in install.sh prereqs if not already handled.
- Separate lock file (`.lock`) is the standard idiom — locking the data file itself risks edge cases with `>>` append truncation semantics on some filesystems.
- Both writers are bash, so a single idiom covers both.
- 5s timeout prevents deadlock if a writer crashes holding the lock.

**Alternative considered:** Node-side lockfile via `proper-lockfile` (already installed for Plan 04-01). Rejected because the hook is bash-only and we want one mechanism, not two.

**macOS flock availability check:** `command -v flock` in install.sh; prompt user to `brew install flock` if missing. Research should verify if macOS 26.x ships it natively or still requires Homebrew.

### Queue aggregator extension (QUEU-01 + QUEU-02 + partial QUEU-03)

**Locked:** `queue-aggregator.ts` gains a third reader alongside `readLocalQueue` + `fetchCloudQueue`: `readSupervisorRuns()` that reads `~/.sleepwalker/audit.jsonl`, filters entries by `runtime in {codex, gemini}` AND `event in {completed, failed, budget_exceeded, deferred}` (terminal events only), maps each to a `QueueEntry` with `source: runtime` (i.e. `source: "codex"` or `source: "gemini"`). Pending items are Codex/Gemini runs that fired within the last 24h.

**Why:**
- Reads from the audit log Phase 2 already emits — no new write path.
- Terminal-event filter keeps the queue focused on "here's what fired overnight" (the core Morning Queue value).
- `source: runtime` naturally extends QUEU-01's widened union.
- Existing local + cloud aggregation code untouched — satisfies QUEU-01's "existing consumers work unchanged" clause.

**QueueEntry shape for Codex/Gemini:** `{ ts, fleet: "<runtime>/<slug>", source: runtime, kind: "supervisor-run", status: "complete" | "failed", payload: { event, preview, chars_consumed? } }`. No approve/reject affordance because supervisor runs are terminal — UI renders status-only.

**Consequence for `status` field:** Existing `status: "pending" | "approved" | "rejected"` widens to include `"complete" | "failed"` (or we introduce a new status enum for supervisor-run entries). Planner decides; type widening preferred over a second enum.

### QueueSource widening (QUEU-01)

**Locked:** `QueueSource = "local" | "cloud" | "codex" | "gemini"`. Additive, no existing code changes needed — `source?: QueueSource` is already optional. The refactor(queue) commit `80db14e` today pre-positioned the eager-tag pattern.

### Source pills UI (QUEU-02)

**Locked:** Extend the existing `pill-*` Tailwind utility classes in `globals.css` (or equivalent) with `pill-codex` (aurora-500 bg, ink-200 text) and `pill-gemini` (signal-amber bg, ink-900 text). Pick colors that read distinctly from existing `pill-green` (local) / `pill-aurora` (cloud) per the project's lunar/celestial palette. Zero new dependencies; pure CSS. The pill component itself either already takes `source` as a prop and extends its switch statement, or we add a small `source-pill.tsx` helper.

**Why those colors:** Aurora for Codex gives Codex a distinct color in the palette; signal-amber for Gemini aligns with Google's brand warmth while staying within the existing palette vocabulary. Research should confirm palette availability.

### SAFE-01 "approximate" labeling (cross-cutting)

**Locked:** Every place the dashboard renders character-budget info renders the word "approximate" (or "approx.") and NEVER uses "tokens". Specifically:
- Routine card budget display: `Budget: {n} chars (approx. ±40%)`
- Editor budget input helper text: `Approximate character count. Tokens vary by ±40%. See AUTHORING.md.`
- Morning Queue entry for budget_exceeded events: `Stopped at {chars} chars (budget: {cap}, approx.)`

**Why:** PROJECT.md anti-features require this honest labeling. No real tokenizer; the approximation must be explicit in UI.

### Claude's Discretion

- Exact pill color hex values (within the palette)
- Whether to extract a `source-pill.tsx` helper or inline pill rendering in existing components
- flock fd-form vs command-form (`flock -x FD` vs `flock -x -c`) — planner picks based on the two writer shapes
- Whether `QueueEntry.status` widens to include `"complete" | "failed"` or a new type variant discriminates supervisor-runs from user-actionable entries
- Exact regex or jq filter for the audit.jsonl → QueueEntry mapping
- Whether `readSupervisorRuns` caches (like cloud-cache) or reads fresh each request (audit.jsonl is local, reads are fast)
- Test pattern: unit tests mocking fs vs real tmp audit.jsonl fixtures
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions and surface
- `CLAUDE.md` — project rules, frozen v0.1 surface, naming convention
- `.planning/PROJECT.md` — v0.2 active requirements, out of scope, key decisions
- `.planning/REQUIREMENTS.md` — QUEU-01 through QUEU-04 + SAFE-01 full text

### v0.1 baseline (what Phase 5 must NOT break)
- `dashboard/lib/queue.ts` — `QueueSource` + `QueueEntry` + `readLocalQueue` (existing; `source: "local"` tagged eagerly)
- `dashboard/lib/queue-aggregator.ts` — existing local + cloud aggregation (extend, do not rewrite)
- `dashboard/lib/cloud-cache.ts` — existing cloud PR → QueueEntry mapping (as of `80db14e`, tags `source: "cloud"` eagerly; pattern reference)
- `hooks/sleepwalker-audit-log.sh` — v0.1 PostToolUse audit writer (needs flock wrapping for QUEU-04)
- `bin/sleepwalker-run-cli` — Phase 2 supervisor (already emits normalized audit for codex/gemini; needs flock wrapping for QUEU-04)
- `.planning/codebase/CONCERNS.md` §concurrent JSONL race — the v0.1 concern QUEU-04 closes

### Phase 2 + Phase 4 outputs (Phase 5 consumes these)
- `dashboard/lib/runtime-adapters/` — adapter registry + types (Phase 2 sealed)
- `dashboard/app/routines/_components/` — existing pill/component shapes (Phase 4 sealed; queue pills should match visual language)
- `dashboard/app/_components/health-badge.tsx` — pill/badge pattern reference from Phase 4

### External runtime docs (researcher will re-read)
- `flock(1)` man page — POSIX locking semantics on macOS
- Any macOS-specific flock quirks (Homebrew vs system)

### Related v0.1 artifacts
- `hooks/tests/run-tests.sh` — existing bash harness pattern (supervisor-tests.sh uses same idiom; flock tests will extend)
</canonical_refs>

<specifics>
## Specific Ideas

- Supervisor's `audit_emit` function at `bin/sleepwalker-run-cli:69-82` is the single write point for Codex/Gemini — wrapping it with flock touches one place.
- Hook `hooks/sleepwalker-audit-log.sh:45` writes via plain `echo "$ENTRY" >> "$AUDIT_FILE"` — wrap in flock there.
- Morning Queue UI lives at `dashboard/app/page.tsx` + related components — check what's there before deciding where the new source-pill styles land.
- Queue-aggregator's terminal-event filter for supervisor runs should use `event in ("completed", "failed", "budget_exceeded", "deferred")` — `started` events are transient and shouldn't appear in the queue.
- For the aggregator's `pending` classification of supervisor runs: `kind: "supervisor-run"` is a new queue kind; existing `kind: "cloud-pr"` + (implicit) `"local"` stay unchanged.
- Concurrency test for QUEU-04: bash harness spawns 4 background subprocesses, each writing 100 lines to audit.jsonl under flock; verify no interleaved/corrupted lines via `jq .` round-trip.
</specifics>

<deferred>
## Deferred Ideas

- **AUTHORING.md "approximate" explainer** — Phase 6 docs phase. Phase 5 ships the UI copy only.
- **Per-run re-fire from the queue** — Phase 4's runNow already handles fresh fires; queue is read-only history.
- **audit.jsonl compaction / retention** — v0.1 has the same unbounded-log concern (CONCERNS.md flags it). Not a v0.2 milestone goal.
- **Real tokenizer for char budget** — explicit PROJECT.md anti-feature.
- **Cross-runtime fan-out (1 prompt → 4 runtimes)** — out of scope per PROJECT.md.
- **Diagnostics page surfacing audit.jsonl directly** — Phase 6 concern.
</deferred>

---

*Phase: 05-queue*
*Context authored: 2026-04-20 direct-from-ROADMAP (rich pre-context; discuss-phase skipped per user preference)*
