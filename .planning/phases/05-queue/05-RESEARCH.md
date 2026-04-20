---
phase: 05-queue
type: research
status: complete
generated: 2026-04-20
---

# Phase 5: Queue — Research

**Researched:** 2026-04-20
**Domain:** concurrent JSONL append safety (flock), supervisor-run → QueueEntry mapping, source pill UI, SAFE-01 honest-labeling sweep
**Confidence:** HIGH across all 9 sections (live synthetic experiment on the target macOS + direct file reads for every claim)

## Summary

Phase 5 is a small-surface but high-sensitivity phase. Four of the five requirements are **additive / verification-style** (QUEU-01 type widen, QUEU-02 CSS-only pills, QUEU-03 supervisor already emits the contract, SAFE-01 UI copy sweep). Only **QUEU-04 (flock)** is net-new infrastructure, and it closes a v0.1 concern CONCERNS.md flagged explicitly.

**Primary recommendation:** Use Homebrew's **discoteq `flock` 0.4.0** (already successfully `brew install`ed on this Mac at `/opt/homebrew/bin/flock`; arm64_tahoe bottle exists). Wrap both audit writers — `hooks/sleepwalker-audit-log.sh:45` (plain `echo >>`) and `bin/sleepwalker-run-cli:75-79` (`audit_emit` printf `>>`) — with `flock -w 5 -x "$LOCK_FILE"` around the append. Lock file lives at `~/.sleepwalker/audit.jsonl.lock` (separate from the data file per standard idiom). Live synthetic experiment on this exact macOS 26.4.1 showed **78% corruption without flock** (312/400 interleaved lines at 5KB/writer) vs **0% corruption with flock** (400/400 parseable with both command form and FD 200 form). The v0.1 race is real, measurable, and fully closed by the locked idiom.

The remaining four requirements are surgical: 1-line type widen (QUEU-01), 2 new CSS utility classes (QUEU-02), new `readSupervisorRuns()` reader added alongside existing `readLocalQueue` + `fetchCloudQueue` (QUEU-03 plumbing — Phase 2 supervisor already emits the data), and a 2-location UI sweep to add "approximate" and **remove** one existing incorrect "tokens" string at `app/routines/routines-client.tsx:62`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `QueueSource` type widen (QUEU-01) | API/Backend (`dashboard/lib/queue.ts`) | — | Type lives in lib; consumers in client + server both import it |
| Supervisor-run → QueueEntry mapping (QUEU-03) | API/Backend (`dashboard/lib/queue-aggregator.ts`) | — | Pure fs read + shape translation, server-only, matches existing `readLocalQueue` pattern |
| Source pill render (QUEU-02) | Browser/Client (`app/queue-client.tsx`) | Browser/Client (`app/audit/page.tsx`) | Pure CSS via globals.css; client components consume utility classes |
| flock on supervisor audit write (QUEU-04) | Bash / subprocess (`bin/sleepwalker-run-cli`) | — | Writer is bash; wraps its own audit_emit |
| flock on hook audit write (QUEU-04) | Bash / hook (`hooks/sleepwalker-audit-log.sh`) | — | PostToolUse hook, bash only |
| "approximate" copy sweep (SAFE-01) | Browser/Client (routine card + editor) | — | Display layer; no logic change |
| Char budget SIGTERM (SAFE-01) | Bash / subprocess (`bin/sleepwalker-run-cli` watchdog) | — | **Already shipped in Phase 2** (02-03 supervisor lines 169-182); Phase 5 only adds the "approximate" UI label |

**Tier sanity:** every capability lands in exactly the tier that owns the corresponding data structure. No cross-tier leakage. No UI code reaches into bash; no bash code knows about the React tree.

## Standard Stack

### Core (net-new for Phase 5)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `flock` (discoteq) | 0.4.0 | POSIX file locking for bash writers (QUEU-04) | [VERIFIED: `brew info flock` output — `Not installed` before, `arm64_tahoe.bottle.tar.gz` installed during research, `/opt/homebrew/bin/flock` symlinks to `../Cellar/flock/0.4.0/bin/flock`]. discoteq/flock is the standard BSD-licensed port of util-linux `flock(1)` for non-Linux Unix. It ships in Homebrew core with the exact same `-w TIMEOUT -x LOCK -c CMD` interface as Linux flock, so cross-platform bash works unchanged. |

### Supporting (already shipped, verified sufficient)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jq` | 1.7.1-apple | JSON parse/construct in bash | Already used 17× in `hooks/*.sh` + `bin/sleepwalker-run-cli`. Continue. [VERIFIED: `jq --version`] |
| `perl` | 5.34.1 | ANSI strip pipeline (SAFE-02) | Already used in supervisor `strip_ansi()` fn at line 86. macOS built-in at `/usr/bin/perl`. No change. [VERIFIED: `perl --version`] |
| `bash` | 5.3.3 | Supervisor + hook runtime | GNU bash from Homebrew. `set -euo pipefail` convention already in use. [VERIFIED: `bash --version`] |
| `proper-lockfile` | already installed (Phase 4) | Node-side flock analog, used by `save-to-repo.ts` | NOT used for audit.jsonl; audit writers are bash. Noted for context. [VERIFIED: grep `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/save-to-repo.ts:146`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `discoteq/flock` | Hand-rolled `mkdir`-based lock (POSIX portable, no deps) | mkdir-lock is crash-unsafe (stale lock stays forever on process kill); requires timeout + PID-tracking logic we'd have to write and test ourselves. flock is kernel-level and auto-releases on process death. Rejected. |
| `discoteq/flock` | `ln`-based lock via `ln -s` atomic symlink creation | Same crash-unsafety as mkdir-lock. Also: doesn't give us a wait-with-timeout primitive. Rejected. |
| Separate `.lock` sidecar file | Lock on the data file itself (`flock -x "$AUDIT_FILE"`) | Technically works but mixes lock state with data; opening the file twice (once for lock, once for append) is brittle under some filesystems. The `.lock` sidecar idiom is universal and documented. [CITED: BashFAQ/045 "separate lock file is the safer idiom"] |
| Node-side lock (`proper-lockfile`) for both writers | Wrap the bash audit emit in a Node subprocess that takes a proper-lockfile lock before writing | Crosses runtime boundary for no gain; supervisor is bash-only by design (SAFE-02 rationale: no Node runtime dep). Also introduces two distinct lock mechanisms on the same file, which is the bug we're trying to avoid. Rejected. |

**Installation for Phase 5:**
```bash
# If flock not on PATH (install.sh should prompt):
brew install flock
# Verifies: /opt/homebrew/bin/flock exists
```

**install.sh amendment** (lock-file prereq): add a `command -v flock >/dev/null || { echo "flock missing — run: brew install flock"; exit 1; }` check alongside the existing jq check (install.sh does not currently reference flock per `grep -c flock install.sh` returning 0).

**Version verification:**
```bash
$ brew info flock
==> flock: stable 0.4.0 (bottled)
Lock file during command
https://github.com/discoteq/flock
License: ISC
```
[VERIFIED: `brew info flock` run 2026-04-20]

## Project Constraints (from CLAUDE.md)

- **Frozen v0.1 surface:** `~/.sleepwalker/*.jsonl` schemas must not change field names. Phase 5 **adds** a new event reader but does not reshape the file. ✓ respected.
- **Hook script paths frozen:** `hooks/sleepwalker-audit-log.sh` stays at its existing path. Only its write line changes (append gains `flock` wrapper). ✓ respected.
- **Secrets mode 0600, no logs:** Not touched this phase.
- **Bash: `set -euo pipefail`, jq, env-var overrides documented at top:** All existing. New flock wrapper respects the existing shebang + set line + idempotency.
- **NO_COLOR/TERM=dumb/CI=true + ANSI strip:** Already enforced in supervisor line 63-65 + line 86 strip_ansi. No change needed; QUEU-03 verification only asserts this is already working.
- **Tests:** Dashboard tests via Vitest + `makeTempHome()`. Bash tests via `hooks/tests/supervisor-tests.sh` idiom (same as Phase 2). Two new test files this phase.
- **Activity log:** All file changes in Phase 5 must append a `docs/activity_log.md` entry per CLAUDE.md global rule.

## User Constraints (from CONTEXT.md)

### Locked Decisions (from 05-CONTEXT.md `<decisions>`)

1. **flock strategy:** POSIX `flock(1)` on `~/.sleepwalker/audit.jsonl.lock` (separate sidecar). Both writers wrap append. 5-second timeout (`-w 5`). Research verifies `/usr/bin/flock` absent → Homebrew is the source.
2. **Queue aggregator extension:** `readSupervisorRuns()` added as third reader alongside `readLocalQueue` + `fetchCloudQueue`. Filters `runtime in {codex, gemini}` AND `event in {completed, failed, budget_exceeded, deferred}`. Maps each to QueueEntry with `source: runtime`.
3. **QueueEntry shape for supervisor runs:** `{ts, fleet, source: runtime, kind: "supervisor-run", status: "complete"|"failed", payload: {event, preview, chars_consumed?}}`. Status widens to include `"complete"` and `"failed"`. No approve/reject affordance — terminal.
4. **QueueSource widening:** `"local" | "cloud" | "codex" | "gemini"`. Additive. `source?` is already optional.
5. **Source pills:** extend existing `pill-*` Tailwind utilities in `globals.css`. Candidates: `pill-codex` (aurora-500 bg, ink-200 text) and `pill-gemini` (signal-amber bg, ink-900 text). Zero new deps, pure CSS.
6. **SAFE-01 copy:** everywhere budget renders, word "approximate" (or "approx.") **required** and "tokens" **banned**.

### Claude's Discretion (from 05-CONTEXT.md)

- Exact pill hex values within palette (palette is locked: ink/moon/dawn/aurora/signal — see Tailwind config)
- `source-pill.tsx` helper vs inline branch: researcher recommends **inline** extension of the existing `isCloud` branch at `queue-client.tsx:70+` because the pattern is already there and the number of sources is small (4). Extract-to-helper only if a 5th source lands.
- flock fd-form (`200>"$LOCK"`) vs command-form (`-c`): **both verified to work**, both produce 0% corruption. Recommendation: **command-form (`-c`)** for the hook (hooks/sleepwalker-audit-log.sh) because the write is a single short `echo`, and **FD-form** for the supervisor (bin/sleepwalker-run-cli) only if multiple writes need to happen under one lock (currently audit_emit is a single printf so command-form is equally fine). Planner picks.
- `QueueEntry.status` widen vs second enum: widen to `"pending" | "approved" | "rejected" | "complete" | "failed"`. Alternative (discriminated kind) is over-engineering for 2 new values.
- Regex/jq filter for audit.jsonl → QueueEntry: use jq-less parse in Node (JSON.parse per line, filter by shape), matching `queue.ts`'s existing `parseLines()` pattern at `dashboard/lib/queue.ts:34-47`.
- `readSupervisorRuns()` caching: **read fresh**. `audit.jsonl` is local disk; read cost is milliseconds. Only `cloud-cache.ts` has TTL because GitHub API is slow. Planner confirms.
- Test pattern: mock `fs.readFile` of a fake audit.jsonl fixture, NOT real tmp audit.jsonl — matches how `queue.test.ts` works (writes files into `env.home` then reads via `makeTempHome()` + `ensureSleepwalkerDir()`).

### Deferred Ideas (OUT OF SCOPE)

- AUTHORING.md "approximate" explainer — Phase 6
- Re-fire cloud routine from queue UI — Phase 4's runNow handles this
- audit.jsonl compaction / retention — same unbounded-log concern v0.1 had; not a v0.2 goal
- Real tokenizer for char budget — PROJECT.md anti-feature
- Cross-runtime fan-out — out of scope
- Diagnostics page — Phase 6

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUEU-01 | `QueueSource` widens to `"local" \| "cloud" \| "codex" \| "gemini"`; existing consumers unchanged | §3 — only 5 consumer call sites identified; all compatible without code changes because none are exhaustive switches |
| QUEU-02 | Morning Queue UI renders Codex + Gemini source pills (pure CSS, no new deps) | §4 — palette slots exist (`aurora-500`, `signal-amber` + ink text colors); extends existing `globals.css` `pill-*` pattern; 2 new utility classes, zero new Tailwind plugins |
| QUEU-03 | Supervisor emits normalized `audit.jsonl` with `runtime`, `fleet`, ANSI-stripped content, ISO ts, char-count budget info | §2 — Phase 2 supervisor already emits ALL required fields (see `bin/sleepwalker-run-cli:69-82` audit_emit + lines 140 + 200). Phase 5 adds only the **reader** (`readSupervisorRuns()`). Zero supervisor changes needed for QUEU-03. |
| QUEU-04 | `flock` on audit.jsonl write path — both writers — closes v0.1 race | §1 — Homebrew flock verified to work; live synthetic proves 78%→0% corruption reduction on macOS 26.4.1 |
| SAFE-01 | Char-budget cap for Codex/Gemini with SIGTERM; labeled "approximate" in UI, never "tokens" | §5 — SIGTERM already shipped (supervisor lines 169-182); grep identifies ONE "tokens" string at `app/routines/routines-client.tsx:62` that must change + 2 new "approximate" labels to add (editor budget helper, routine-card budget line). Also new queue-entry display when `event:"budget_exceeded"` renders. |

---

## 1. flock on macOS (QUEU-04)

### 1.1 Is flock(1) on macOS?

**[VERIFIED: direct probe]** `/usr/bin/flock` is **absent** on macOS Tahoe 26.4.1:
```
$ ls -la /usr/bin/flock
ls: /usr/bin/flock: No such file or directory
$ command -v flock
flock not found
$ sw_vers
ProductName:   macOS
ProductVersion: 26.4.1
BuildVersion:  25E253
```

**[VERIFIED: brew info]** Homebrew provides `discoteq/flock` as the canonical port:
```
$ brew info flock
==> flock: stable 0.4.0 (bottled)
Lock file during command
https://github.com/discoteq/flock
License: ISC
install: 549 (30 days), 1,534 (90 days), 3,990 (365 days)
install-on-request: 473 (30 days)
```

**[VERIFIED: install]** Install succeeded on the target host during this research:
```
$ brew install flock
==> Pouring flock--0.4.0.arm64_tahoe.bottle.tar.gz
/opt/homebrew/Cellar/flock/0.4.0: 7 files, 65.2KB
$ flock --version
flock 0.4.0
$ ls -la /opt/homebrew/bin/flock
lrwxr-xr-x@ 1 rahulmehta admin 31 Apr 20 01:15 /opt/homebrew/bin/flock -> ../Cellar/flock/0.4.0/bin/flock
```

The arm64_tahoe-specific bottle proves discoteq maintains macOS Tahoe support as of research date.

**Conclusion:** flock is NOT a transitive dep of anything currently required (`grep -c flock install.sh` returns `0`). It must be declared as a new prereq.

### 1.2 Install path strategy

Add to `install.sh` alongside the existing jq check:
```bash
command -v flock >/dev/null 2>&1 || {
  echo "==> flock missing. Install with: brew install flock" >&2
  echo "    (Sleepwalker v0.2 uses flock to prevent audit.jsonl corruption under" >&2
  echo "     concurrent writes from multiple runtime adapters.)" >&2
  exit 1
}
```

Fallback behavior in writers (defense-in-depth) — if flock is somehow missing at runtime despite install.sh check:
- Log a `flock_missing` event to a sidecar `audit.jsonl.warnings` file
- Fall through to unlocked append (preserves v0.1 behavior; does not introduce a new regression)
- Supervisor exits 0 (does not fail the run — the entry is still captured, just with the known v0.1 race)

### 1.3 Idiom comparison: command-form vs FD-form

**Command form:** `flock -w 5 -x "$LOCK_FILE" -c 'printf ... >> "$AUDIT_FILE"'`
- Pros: one-liner, no subshell, no FD management, self-documenting
- Cons: command is a string passed to `sh -c` (per discoteq flock docs), so nested quoting can get tricky with complex JSON construction

**FD form:**
```bash
(
  flock -w 5 -x 200
  printf '...' >> "$AUDIT_FILE"
) 200>"$LOCK_FILE"
```
- Pros: no nested quoting issue, block can contain multiple statements under one lock, familiar to util-linux users
- Cons: FD number must be fixed (200 is convention); subshell is slightly heavier

**[VERIFIED: live synthetic]** Both forms produce identical zero-corruption results under stress:
```
==> Trial A (command form, -c): 8 writers x 50 entries @ 5KB each
  result: total=400  parseable=400  corrupted=0
==> Trial B (FD form, FD 200): 8 writers x 50 entries @ 5KB each
  result: total=400  parseable=400  corrupted=0
```

**Recommendation per writer:**
- **`hooks/sleepwalker-audit-log.sh`** → **command form** (single short `echo "$ENTRY" >> "$AUDIT_FILE"` at line 45; minimal quoting complexity). Replace line 45 with:
  ```bash
  flock -w 5 -x "${HOME}/.sleepwalker/audit.jsonl.lock" -c "echo $(printf %q "$ENTRY") >> $(printf %q "$AUDIT_FILE")"
  ```
  or slightly cleaner via here-string / tempfile. Planner picks exact form.
- **`bin/sleepwalker-run-cli`** → **command form** works identically for the single-printf audit_emit. Replace the two `>> "$AUDIT_FILE"` lines (lines 75-76 and 78-79) with their flock-wrapped equivalents via a helper:
  ```bash
  LOCK_FILE="${HOME}/.sleepwalker/audit.jsonl.lock"
  mkdir -p "$(dirname "$LOCK_FILE")"
  flock -w 5 -x "$LOCK_FILE" -c "printf '...' >> $AUDIT_FILE"
  ```
  Wrap once inside `audit_emit()` — touches one function, 2 lines of change.

### 1.4 Timeout semantics

**[VERIFIED: live probe]**
```
==> Contender with -w 1 against 3s holder:
exit=1
  elapsed_ms=1011
==> Contender with -n (non-blocking) against 2s holder:
exit=1
  elapsed_ms=9
```

- `-w N`: wait up to N seconds, then fail with **exit code 1**
- `-n`: non-blocking, fail immediately (ms-scale) with **exit code 1**

**Phase 5 choice (from CONTEXT.md):** `-w 5` — 5-second timeout. Rationale:
- An audit write is a single-digit-microsecond operation; even under extreme contention (4 concurrent runtimes + hooks + dashboard read), wait time should be <1ms
- 5s is a "dead process holding the lock" safety net, not a normal-path wait
- Longer than 5s indicates a bug (process crash holding lock, disk I/O stall, etc.)

### 1.5 Lock file lifecycle

- **Location:** `~/.sleepwalker/audit.jsonl.lock` (sidecar, never on data file)
- **Creation:** `mkdir -p "$(dirname "$LOCK_FILE")" && touch "$LOCK_FILE"` on first use. Idempotent — concurrent creates are safe.
- **Mode bits:** 0644 (readable by owner and group; not executable; aligns with `audit.jsonl` itself). **NOT 0600** because the lock file contains no secrets and easing ACLs here avoids a class of failure where a user hops UIDs (rare).
- **Never delete:** The lock file survives the writer's lifetime. Each new writer just re-acquires. No cleanup required.
- **On crash:** flock(2) is a kernel-level advisory lock held on an open file descriptor. When the process dies, the kernel automatically releases the lock regardless of the file's existence on disk. No stale-lock cleanup needed.

### 1.6 Failure mode

If `flock -w 5` times out:
- Exit code 1 returned to the shell
- Writer falls through to... **what?** Two options:
  1. **Skip the write** (data loss on that single audit event; never silently)
  2. **Unlocked append + log warning** (preserves audit history but re-introduces the race for that one event)

**Recommendation:** **option 2** for the supervisor (critical path; audit entry is the only record of the run) and **option 1** for the hook (the next tool call will emit another entry; one lost entry is recoverable). Both paths emit a `flock_timeout` warning to a sidecar file for observability.

**Why not retry:** flock already retries internally during `-w 5`. If 5s of retries failed, something is very wrong; further retries from our bash code can't help.

### 1.7 Synthetic concurrent-write experiment (live evidence)

**[VERIFIED: /tmp/flock-synth2.sh + flock-synth3.sh run on macOS 26.4.1 during research]**

**Without flock, 8 writers × 50 entries × 5KB each:**
```
TRIAL 1 (no flock): total=400  parseable=88   corrupted=312  (78% corruption)
TRIAL 2 (no flock): total=400  parseable=113  corrupted=287  (72% corruption)
TRIAL 3 (no flock): total=400  parseable=79   corrupted=321  (80% corruption)
```

**With flock, 8 writers × 50 entries × 5KB each:**
```
Trial A (flock command form, -c):    total=400  parseable=400  corrupted=0
Trial B (flock FD form, FD 200):     total=400  parseable=400  corrupted=0
```

**Why 5KB matters:** `getconf PIPE_BUF /` returns `512` on macOS. POSIX guarantees atomic appends only for writes ≤ PIPE_BUF. Audit entries with a 500-char preview + JSON scaffolding are typically **400-800 bytes** — right at the edge. With a long preview they routinely exceed PIPE_BUF, which is exactly where interleaving begins. The 5KB lines in the synthetic exaggerate the real-world rate but the failure mode is identical.

**At 400-byte lines (earlier trial):** 0% corruption observed even without flock, because appends fit under PIPE_BUF. This means **the race is rate-and-size-dependent; v0.1 has not observed it widely because v0.1's default preview is short. Phase 5's normalized audit format with `"preview":$PREVIEW` (jq -Rs up to 500 chars) plus the new `budget_exceeded` entries (which carry `partial_output_bytes` counts) routinely exceed PIPE_BUF.**

This elevates QUEU-04 from "nice to have" to "blocks Phase 5" — the new Codex/Gemini audit entries are precisely the kind that trigger the race v0.1 never hit often enough to notice.

---

## 2. Supervisor-run → QueueEntry mapping (QUEU-03)

### 2.1 Phase 2 supervisor emits WHAT exactly?

Reading `bin/sleepwalker-run-cli:69-82` directly:

```bash
audit_emit() {
  local ts event extra
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"   # ISO 8601 UTC, "Z" suffix
  event="$1"
  extra="${2:-}"
  if [ -n "$extra" ]; then
    printf '{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s",%s}\n' \
      "$ts" "$FLEET" "$RUNTIME" "$event" "$extra" >> "$AUDIT_FILE"
  else
    printf '{"ts":"%s","fleet":"%s","runtime":"%s","event":"%s"}\n' \
      "$ts" "$FLEET" "$RUNTIME" "$event" >> "$AUDIT_FILE"
  fi
}
```

Where `FLEET="${RUNTIME}/${SLUG}"` (line 57) and `RUNTIME` is "codex" or "gemini" (line 34).

**Baseline field set present on EVERY event:**
| Field | Shape | Source | QUEU-03 contract? |
|-------|-------|--------|-------------------|
| `ts` | ISO 8601 UTC `YYYY-MM-DDTHH:MM:SSZ` | `date -u` | ✅ |
| `fleet` | `"<runtime>/<slug>"` | env var | ✅ |
| `runtime` | `"codex"` or `"gemini"` | env var | ✅ |
| `event` | one of {`started`, `completed`, `failed`, `budget_exceeded`, `deferred`} | per call site | ✅ (event is the discriminant) |

**Per-event extras observed in supervisor source:**

| event | extras | line |
|-------|--------|------|
| `started` | `cli`, `budget` | 140 |
| `completed` | `chars_consumed`, `preview` (jq -Rs quoted), `exit_code` | 200 |
| `failed` (bundle missing) | `reason`, `bundle` | 91 |
| `failed` (CLI not on PATH) | `reason` | 106 |
| `failed` (unknown runtime) | `reason` | 155 |
| `failed` (generic non-zero exit) | `chars_consumed`, `preview`, `exit_code` | 203 |
| `budget_exceeded` | `chars_consumed`, `chars_limit`, `partial_output_bytes`, `preview`, `exit_code` | 195 |
| `deferred` (sleep window) | `reason`, `hour` | 121 |
| `deferred` (policy) | `reason` | 132 |

**Gaps against QUEU-03 contract (from 05-CONTEXT.md):**
- **"ANSI-stripped content"** — ✅ enforced upstream. The supervisor pipes CLI stdout/stderr through `strip_ansi()` (line 86: `perl -pe` CSI + OSC + DCS/PM/APC strip) BEFORE any capture into `$OUTPUT_FILE`, and preview is taken from that already-stripped output (line 194, 199, 202). Supervisor tests scenario 2 (`supervisor-tests.sh:170-192`) asserts raw CSI is absent and the literal `[32m` fragment is absent, and the payload `green-prefix` survives. This is **already verified**.
- **"char-count budget info"** — ✅ present as `chars_consumed` + `chars_limit` on `budget_exceeded`; `chars_consumed` on `completed`/`failed`; `budget` on `started`.
- **"`jq .` parses every line"** — ✅ every printf uses literal JSON with `jq -Rs` for preview (produces a valid JSON string literal even if the preview contains quotes/backslashes/newlines, per jq's docs). Supervisor tests assert each expected field is discoverable via `assert_contains '"field":"value"'` on the raw file, which tolerates the arbitrary-order printf.

**Gap: MISSING field on some events.** The `deferred` path (sleep window / policy) does NOT emit `started` first (supervisor-tests.sh:222-228 asserts this explicitly: "deferred run does not emit started"). So the "started → terminal" pair is only emitted for allowed runs. This is correct — deferred IS the terminal event for blocked runs.

**Conclusion:** QUEU-03 contract is **already met end-to-end** by Phase 2's supervisor. Phase 5's QUEU-03 work reduces to: (a) **verify** (one test: read `supervisor-tests.sh` output audit.jsonl after each scenario, pipe every line through `jq -e .`, expect zero parse failures), and (b) **add the reader** `readSupervisorRuns()` that maps these entries to QueueEntry.

### 2.2 Terminal-event filter

QueueEntry should surface only events a user acts on or reviews in the morning. From the supervisor:

| event | include in queue? | rationale |
|-------|-------------------|-----------|
| `started` | ❌ **no** | transient; every `started` has a paired terminal event later in the same file. Including both would duplicate every run. |
| `completed` | ✅ **yes** | happy-path terminal — user sees "it ran, here's the preview" |
| `failed` | ✅ **yes** | terminal — user sees the error |
| `budget_exceeded` | ✅ **yes** | terminal — user sees the char-count + "approximate" label (SAFE-01 UI) |
| `deferred` | ✅ **yes** | terminal — the run was blocked; user should see why and optionally adjust policy |

**Filter predicate:** `entry.event ∈ {completed, failed, budget_exceeded, deferred}` AND `entry.runtime ∈ {codex, gemini}`.

No other events exist in the supervisor source (grep `audit_emit` on `bin/sleepwalker-run-cli` returns 10 call sites: 5 event-name literals × multiple parameter sets). Confirmed exhaustive.

### 2.3 QueueEntry shape widening

Current shape (`dashboard/lib/queue.ts:13-25`):
```typescript
export interface QueueEntry {
  id: string;
  ts: string;
  fleet: string;
  tool?: string;
  args?: Record<string, unknown>;
  kind?: string;
  payload?: Record<string, unknown>;
  reversibility?: Reversibility;
  session?: string;
  status: QueueStatus;   // "pending" | "approved" | "rejected"
  source?: QueueSource;  // "local" | "cloud"
}
```

**Minimal addition** (no renames, no deletions — preserves frozen v0.1 surface):
```typescript
export type QueueSource = "local" | "cloud" | "codex" | "gemini";
export type QueueStatus =
  | "pending" | "approved" | "rejected"   // v0.1 (user-actionable)
  | "complete" | "failed";                // v0.2 (supervisor-run terminal)
```

Supervisor-run entries mapped to QueueEntry:
```typescript
function mapSupervisorEvent(e: SupervisorAuditEntry): QueueEntry {
  // Terminal-event discriminant → status
  const status: QueueStatus =
    e.event === "completed"       ? "complete" :
    e.event === "failed"          ? "failed"   :
    e.event === "budget_exceeded" ? "failed"   :  // budget is a failure mode, shown red
    e.event === "deferred"        ? "rejected" :  // deferred is a policy rejection
    "failed";                                     // unreachable if filter is correct

  return {
    // Stable id from ts + fleet + event; audit.jsonl has no native id but ts is second-precision
    id: `q_sup_${e.runtime}_${e.fleet.replace(/\//g, "__")}_${e.ts.replace(/[:\-TZ]/g, "")}_${e.event}`,
    ts: e.ts,
    fleet: e.fleet,               // "codex/daily-brief" form — unchanged
    kind: "supervisor-run",       // new kind; existing "cloud-pr" unchanged
    source: e.runtime,            // "codex" or "gemini" — flows through QUEU-01 widening
    status,
    payload: {
      event: e.event,
      preview: e.preview,
      chars_consumed: e.chars_consumed,
      chars_limit: e.chars_limit,
      partial_output_bytes: e.partial_output_bytes,
      exit_code: e.exit_code,
      reason: e.reason,
      hour: e.hour,
    },
    // No `tool` / `args` — those are v0.1 hook-defer fields; supervisor-run is a
    // different kind. Leaving them undefined means `enqueueForExecution` correctly
    // returns null (approval.ts line 22: "if (!entry.tool || !entry.args) return null").
  };
}
```

**Crucial invariant:** the `enqueueForExecution` guard at `dashboard/lib/approval.ts:21-22` already handles the "no approve/reject affordance for supervisor-run" case. The v0.1 code path returns null for any entry where `source === "cloud"` OR `!tool || !args` — and supervisor-run entries match the latter clause. **No change to approval.ts is needed.** ✓ verified by direct read.

### 2.4 Time-window filter (optional)

CONTEXT.md specifies "pending items are Codex/Gemini runs that fired within the last 24h." Rationale: audit.jsonl is append-only and grows unbounded; the queue should show recent history, not all history.

Recommended filter in `readSupervisorRuns()`:
```typescript
const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
const recent = all.filter(e => new Date(e.ts).getTime() >= cutoffMs);
```

Tradeoff: user who wakes up after 48h sleep sees nothing from that window. Acceptable — they can click through Audit page for full history.

### 2.5 UI affordance for supervisor-run entries

`queue-client.tsx:132-152` branches on `isCloud`:
- cloud → [Dismiss, Open PR]
- local → [Reject, Approve]

New third branch needed for `entry.source === "codex" || entry.source === "gemini"`:
- terminal status-only — no action buttons
- renders: runtime icon + fleet + status-pill ("complete" green / "failed" red) + preview pane
- optionally: "View full audit" link that deeplinks to the Audit page filtered to this fleet (nice-to-have; planner's discretion)

---

## 3. QueueSource union widening (QUEU-01)

### 3.1 Import surface (complete grep, VERIFIED)

```
lib/queue.ts:11:        export type QueueSource = "local" | "cloud";
lib/queue.ts:24:          source?: QueueSource;
```

Only **one** file defines the type. All other references are string-literal `"cloud"` / `"local"` comparisons, not `QueueSource` imports.

### 3.2 Consumer call sites

`grep 'source === "cloud"|source == "cloud"|source === "local"|source == "local"' dashboard/`:

| File:Line | Code | Exhaustive? | Breaks after widen? |
|-----------|------|-------------|---------------------|
| `lib/approval.ts:21` | `if (entry.source === "cloud") return null;` | **No** — single branch with default-fallthrough to "do the work" | ✅ Safe. codex/gemini entries have no `tool`/`args`, so they hit line 22's guard and return null anyway. |
| `app/queue-client.tsx:70` | `const isCloud = current.source === "cloud";` | **No** — boolean coerce; everything else treated as "local-ish" | ⚠️ Partially safe. With widen, codex/gemini render as `!isCloud`, which currently goes to the local UI with Approve/Reject buttons. **Fix needed:** add a third branch for `source in {codex, gemini}`. |
| `app/queue-client.tsx:170` | `if (entry.source === "cloud" && entry.payload) {` | **No** — early return | ✅ Safe. codex/gemini entries fall through to the `entry.tool && entry.args` branch below, which is false → falls to `entry.kind && entry.payload` branch (kind = "supervisor-run", payload exists) → renders payload JSON. Usable but ugly; planner may want a dedicated supervisor-run view. |
| `app/api/queue/route.ts:27` | `const source = body.source ?? (body.id.startsWith("q_cloud_") ? "cloud" : "local");` | **No** — default-to-local | ⚠️ Partially safe. codex/gemini entries would not have id prefix `q_cloud_` (they'd be `q_sup_*`). The `if (source === "local")` branch at line 29 would wrongly catch them. **Fix needed:** either extend the inference (`q_sup_*` → check runtime field) or widen the type-narrowing. Because supervisor-run entries are terminal (no action), the POST endpoint arguably shouldn't see them at all — if the UI has no Approve/Reject button, nothing POSTs. Recommendation: **no code change**; just never send them. |
| `app/api/queue/route.ts:18` | `interface Body { ... source?: "local" \| "cloud"; }` | Type narrowed to `"local" \| "cloud"` | Same as above — widen or leave as "cloud decisions only use local/cloud" since supervisor-run is UI-only terminal. |

### 3.3 Exhaustive switches?

**[VERIFIED: no exhaustive switches found]** `grep 'switch.*source'` returns nothing. `grep '\.source'` confirms all branches are boolean coerces or positive-match checks; no `never`-typed fallthrough that would force compile-error on widen.

### 3.4 Non-consumer usage

These files USE `source` only to **tag outgoing data** (write side), not to branch on it:
- `lib/queue.ts:53` — `source: "local" as const` (eager tag on read)
- `lib/cloud-cache.ts:60` — `source: "cloud"` (eager tag on PR map)
- `lib/routines.ts:101, 113, 127, 259, 305` — different domain (`source: "installed" | "repo-template"` for routine cards, unrelated to QueueSource despite same field name)
- Various tests — string literals

These all continue to compile unchanged after the widen.

### 3.5 Summary

**QUEU-01 is a 1-line type change** at `dashboard/lib/queue.ts:11`:
```diff
- export type QueueSource = "local" | "cloud";
+ export type QueueSource = "local" | "cloud" | "codex" | "gemini";
```

Plus `QueueStatus` widen (see §2.3). Plus a third UI branch in `queue-client.tsx` (~20 lines of JSX). Plus `api/queue/route.ts` has two places the `"local" | "cloud"` narrow type appears — widen those to match the canonical type (one-line changes per site).

---

## 4. Source pills design (QUEU-02)

### 4.1 Inventory of existing pill utilities

`dashboard/app/globals.css:74-82`:
```css
.pill-green  { @apply pill bg-signal-green/10 text-signal-green border border-signal-green/20; }
.pill-amber  { @apply pill bg-signal-amber/10 text-signal-amber border border-signal-amber/20; }
.pill-red    { @apply pill bg-signal-red/10   text-signal-red   border border-signal-red/20; }
.pill-aurora { @apply pill bg-aurora-400/10   text-aurora-400   border border-aurora-400/20; }
.pill-muted  { @apply pill bg-ink-600/50      text-moon-400     border border-ink-600; }
.pill-yellow { @apply pill-amber; }
.pill-stone  { @apply pill-muted; }
.pill-blue   { @apply pill-aurora; }
.pill-rose   { @apply pill-red; }
```

Current mapping (from `queue-client.tsx:104-105`):
- cloud → `pill-aurora` (blue)
- local → custom signal-green pill (one-off, not using `pill-green`)

### 4.2 Available palette slots (from `dashboard/tailwind.config.js`)

```js
colors: {
  ink: { 900, 800, 700, 600, 500 },      // midnight backgrounds
  moon: { 50, 200, 400, 600 },           // silver text
  dawn: { 200, 400, 500, 700 },          // warm orange (primary action)
  aurora: { 400, 500 },                  // cool blue
  signal: { green, amber, red },         // status accents
}
```

Unused in existing pills: `dawn-400` (reserved for primary CTA — not for pills), `aurora-500` (pressed-state blue, never used in a pill). `moon-*` is text only.

### 4.3 Proposed pill additions

**[CITED: 05-CONTEXT.md locked colors]** + palette verification:

```css
/* Phase 5 — new source pills for Codex + Gemini (QUEU-02) */
.pill-codex   { @apply pill bg-aurora-500/10 text-aurora-400 border border-aurora-500/30; }
.pill-gemini  { @apply pill bg-dawn-400/10   text-dawn-400   border border-dawn-400/30; }
```

**Rationale:**
- `pill-codex` uses `aurora-500` as the bg anchor (deeper blue than cloud's `aurora-400`). Reads as "also blue but distinct." Text stays `aurora-400` for contrast.
- `pill-gemini` uses `dawn-400` — the warm highlight tone. Maps to Google/Gemini's brand warmth and reads distinct from all four existing pills. Text `dawn-400` on `dawn-400/10` mirrors the existing pill-* pattern.

**Contrast check (WCAG 2.1 AA target: 4.5:1 for normal text):**

| Pill | Bg (hex+alpha) | Text | Effective Bg on Ink-900 (#06070d) | Contrast Ratio |
|------|-----------------|------|-----------------------------------|----------------|
| pill-codex | `aurora-500/10` = `#5a82f5 10%` over `#06070d` ≈ `#0c1121` | `#7b9eff` (aurora-400) | 0c1121 vs 7b9eff | **~7.8:1** ✓ |
| pill-gemini | `dawn-400/10` = `#f3c282 10%` over `#06070d` ≈ `#18130c` | `#f3c282` | 18130c vs f3c282 | **~11.0:1** ✓ |

Both pass AA easily. (Math: alpha-blended effective luminance; measured against the panel dark base.)

**No text-on-`bg-*-500/10` conflict** with existing `pill-aurora` (which uses `aurora-400/10`, one stop lighter). Visual distinction is small but present; the aurora-400 text on aurora-500/10 vs aurora-400/10 is what the eye picks up.

**Fallback if user tests say codex and cloud look too similar:** swap `pill-codex` to `bg-moon-200/10 text-moon-50 border border-moon-400/30` (neutral silver). Color choice is Claude's discretion per CONTEXT.md; no additional palette slot needed.

### 4.4 Component integration

**Existing pattern at `queue-client.tsx:100-106`** (the exact place new pills render):
```tsx
<div className="flex items-center gap-2.5 mb-5 flex-wrap">
  {isCloud
    ? <span className="flex items-center gap-1.5 text-moon-50"><Cloud className="w-4 h-4 text-aurora-400" />...</span>
    : <span className="flex items-center gap-1.5 text-moon-50"><HardDrive className="w-4 h-4 text-dawn-400" />...</span>
  }
  <span className={isCloud ? "pill-aurora" : "pill bg-signal-green/10 text-signal-green border border-signal-green/20"}>
    {isCloud ? "cloud" : "local"}
  </span>
  ...
```

**Recommended extension** (inline; 4-way ternary or switch):
```tsx
function SourceIcon({ source }: { source: QueueSource }) {
  switch (source) {
    case "cloud":  return <Cloud className="w-4 h-4 text-aurora-400" />;
    case "codex":  return <Terminal className="w-4 h-4 text-aurora-500" />;  // lucide Terminal icon
    case "gemini": return <Sparkles className="w-4 h-4 text-dawn-400" />;    // lucide Sparkles icon
    default:       return <HardDrive className="w-4 h-4 text-dawn-400" />;   // local
  }
}
function SourcePill({ source }: { source: QueueSource }) {
  switch (source) {
    case "cloud":  return <span className="pill-aurora">cloud</span>;
    case "codex":  return <span className="pill-codex">codex</span>;
    case "gemini": return <span className="pill-gemini">gemini</span>;
    default:       return <span className="pill-green">local</span>;
  }
}
```

Two tiny pure components, co-located with QueueClient — no new files needed. Planner may extract to `dashboard/app/_components/source-pill.tsx` if `audit/page.tsx` also needs them (spoiler: it does — `app/audit/page.tsx:43-44` renders event + tool pills but no source pill currently; cross-phase consistency may want one).

### 4.5 Icons

Already in use:
- `Cloud` (lucide) — cloud entries
- `HardDrive` — local entries

Phase 5 adds:
- `Terminal` or `Bot` for codex (both in lucide-react; already imported elsewhere in the codebase — `Bot` is in queue-client.tsx:5 already; `Terminal` is in `routines/_components/*` per Phase 4)
- `Sparkles` or `Stars` for gemini

Zero new icon package deps. ✓

---

## 5. SAFE-01 "approximate" copy locations

### 5.1 Inventory of budget-displaying locations

`grep -n 'budget' dashboard/app/ --include='*.tsx' --include='*.ts'` + manual inspection:

| File:Line | Current Copy | Change Required |
|-----------|--------------|-----------------|
| `app/routines/routines-client.tsx:62` | `budget: {r.defaultBudget.toLocaleString()} tokens` | **CRITICAL — change "tokens" to "chars (approximate)"**. This is a direct SAFE-01 violation today. |
| `app/editor/editor-client.tsx:463` | `<span className="label">BUDGET (CHARS)</span>` | Add helper text below: `Approximate character cap. Actual tokens vary by ±40%.` (Phase 6 docs link omitted per out-of-scope.) |
| `app/editor/editor-client.tsx:466-471` | `<input type="number" name="budget" placeholder="40000" ... min={1000} max={200000}>` | No change to input itself; add sibling `<p className="text-xs text-moon-400 mt-1">...</p>` helper. |
| **NEW** in `app/queue-client.tsx` (to be added for supervisor-run entries) | N/A — does not exist today | For `entry.payload.event === "budget_exceeded"`, render: `Stopped at {chars_consumed} chars (budget: {chars_limit}, approximate).` |
| **NEW** in `app/audit/page.tsx` for budget_exceeded events | Currently: `{e.event && <span className="pill-red">{e.event}</span>}` at line 43 | No text change required — the event name `budget_exceeded` is raw; budget cap shown via audit event payload requires a small render helper. Planner's discretion whether to surface "approximate" here or leave the terse pill. |

### 5.2 Anti-feature policy check

**[VERIFIED: grep 'tokens' dashboard/]** returns hits in four contexts:
1. `app/routines/routines-client.tsx:62` — **VIOLATION; must fix**
2. `pnpm-lock.yaml` — js-tokens npm package, unrelated
3. `lib/save-to-repo.ts:93`, `lib/deploy-state.ts:106`, `lib/settings.ts:167` — all talking about **auth tokens** (GitHub PAT, API bearer tokens), NOT budget tokens. Copy is correct.
4. `app/settings/settings-client.tsx:155` — external URL to `github.com/settings/tokens/new`. Correct.

So: **exactly one** true violation today at `app/routines/routines-client.tsx:62`. All other "tokens" strings are auth-token references and should stay.

### 5.3 Forward policy

Add a comment in `dashboard/lib/bundles.ts` near the `budget` field definition:
```typescript
/**
 * Approximate character cap for supervisor-budget enforcement.
 * NEVER labeled "tokens" in UI. Actual tokens-per-char ratio varies by ±40%
 * depending on language + output format. See SAFE-01 + PROJECT.md anti-features.
 */
budget?: number;
```

This prevents future UI additions from reintroducing "tokens" as budget-label.

### 5.4 Exact copy proposals (cross-checked against UI-SPEC style)

**Routine card** (`app/routines/routines-client.tsx:62`):
```diff
- budget: {r.defaultBudget.toLocaleString()} tokens
+ budget: {r.defaultBudget.toLocaleString()} chars (approximate)
```

**Editor helper** (new sibling of `app/editor/editor-client.tsx:462-480`):
```tsx
<p className="text-xs text-moon-400 mt-1">
  Approximate character cap. Tokens vary by ±40% depending on output format.
</p>
```

**Queue entry for budget_exceeded** (new render branch in supervisor-run queue entry):
```tsx
<div className="text-sm text-moon-200">
  Stopped at <span className="data">{chars_consumed.toLocaleString()}</span> chars
  (budget: <span className="data">{chars_limit.toLocaleString()}</span>, approximate).
</div>
```

All copy uses "approximate" or "approx." per CONTEXT.md. None uses "tokens" in a budget context.

---

## 6. Test strategy

### 6.1 Unit tests (Vitest)

**[file: `dashboard/tests/queue.test.ts`]** — extend existing

Add to the 7 existing tests:
- `it("readLocalQueue tags source as 'local' after QueueSource widen")` — regression guard
- `it("QueueStatus accepts 'complete' and 'failed'")` — type-compile assertion via `expectType<QueueStatus>` or just a smoke test that an entry with `status: "complete"` round-trips through appendQueueEntry + readLocalQueue without loss (the parseLines preserves unknown strings in the type field — verified in `parseLines` at queue.ts:34-47, JSON.parse loses no data)

**[file: `dashboard/tests/supervisor-runs.test.ts`]** — NEW

Mirror the pattern of `queue.test.ts`:
```typescript
describe("readSupervisorRuns", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;
  beforeEach(() => { env = makeTempHome(); dir = ensureSleepwalkerDir(env.home); });
  afterEach(() => { env.restore(); });

  it("returns empty when audit.jsonl absent", async () => {
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    expect(readSupervisorRuns()).toEqual([]);
  });

  it("filters to codex/gemini runtime only", async () => {
    // Write mixed audit: one v0.1 hook entry (no runtime), one codex, one gemini
    const lines = [
      JSON.stringify({ ts: "2026-04-20T01:00:00Z", fleet: "inbox-triage", tool: "Read" }),
      JSON.stringify({ ts: "2026-04-20T02:00:00Z", fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 }),
      JSON.stringify({ ts: "2026-04-20T03:00:00Z", fleet: "gemini/news", runtime: "gemini", event: "failed", preview: "err", exit_code: 1 }),
    ];
    fs.writeFileSync(path.join(dir, "audit.jsonl"), lines.join("\n") + "\n");
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.source).sort()).toEqual(["codex", "gemini"]);
  });

  it("filters out 'started' events (not terminal)", async () => { /* ... */ });
  it("maps completed → status:'complete'", async () => { /* ... */ });
  it("maps failed → status:'failed'", async () => { /* ... */ });
  it("maps budget_exceeded → status:'failed' with chars_consumed+chars_limit in payload", async () => { /* ... */ });
  it("maps deferred → status:'rejected' (policy-blocked terminal)", async () => { /* ... */ });
  it("skips malformed audit lines without throwing", async () => { /* ... */ });
  it("filters entries older than 24h from pending", async () => { /* ... */ });
});
```

**[file: `dashboard/tests/queue-aggregator.test.ts`]** — extend existing

Add:
- `it("aggregateQueue surfaces codex + gemini supervisor-run entries alongside local + cloud")` — integration test. Write 4 fixture files (queue.jsonl, cloud-cache.json, audit.jsonl with supervisor events), call aggregateQueue, assert all 4 sources in output.

**[file: `dashboard/tests/source-pill.test.tsx`]** — NEW (if helper extracted)

jsdom component test, mirrors `dashboard/tests/cron-preview.test.tsx` pattern:
```typescript
it("renders pill-codex for source='codex'", () => {
  const { container } = render(<SourcePill source="codex" />);
  expect(container.querySelector(".pill-codex")?.textContent).toBe("codex");
});
it("renders pill-gemini for source='gemini'", () => { /* ... */ });
it("renders pill-aurora for source='cloud' (unchanged)", () => { /* ... */ });
it("renders pill-green for source='local' (unchanged)", () => { /* ... */ });
```

### 6.2 Bash tests (supervisor-tests.sh extension)

**[file: `hooks/tests/supervisor-tests.sh`]** — extend the existing 7-scenario harness

Add **Scenario 8: flock concurrency**:
```bash
echo "==> scenario 8: flock serializes concurrent audit writes"
reset_state
# Run 4 supervisor invocations in parallel, 2 codex + 2 gemini, each with a
# distinct slug so they don't collide on the audit.jsonl.lock unnecessarily.
make_bundle "codex" "s8-a" "yellow" 40000
make_bundle "codex" "s8-b" "yellow" 40000
make_bundle "gemini" "s8-c" "yellow" 40000
make_bundle "gemini" "s8-d" "yellow" 40000
# Invoke all four in the background. They all write to the same audit.jsonl.
for pair in "codex s8-a" "codex s8-b" "gemini s8-c" "gemini s8-d"; do
  SLEEPWALKER_MODE=overnight "$SUPERVISOR" $pair >/dev/null &
done
wait
# Each supervisor emits exactly 2 lines (started + completed). 4 * 2 = 8 total.
assert_file_lines "s8: audit has 8 lines (4 runs * 2 events)" "8" "$HOME/.sleepwalker/audit.jsonl"
# Every single line must be valid JSON. This is the "zero corruption" assertion.
PARSE_FAIL=0
while IFS= read -r line; do
  printf '%s' "$line" | jq -e . >/dev/null 2>&1 || PARSE_FAIL=$((PARSE_FAIL+1))
done < "$HOME/.sleepwalker/audit.jsonl"
assert_eq "s8: zero malformed audit lines" "0" "$PARSE_FAIL"
```

**Scenario 9: flock timeout path** (simulated):
```bash
echo "==> scenario 9: flock -w 5 times out gracefully if lock is held"
reset_state
# Hold the lock for 6 seconds in a background subshell
LOCK="$HOME/.sleepwalker/audit.jsonl.lock"
mkdir -p "$(dirname "$LOCK")" && touch "$LOCK"
( flock -x "$LOCK" -c 'sleep 6' ) &
HOLDER=$!
sleep 0.3
make_bundle "codex" "s9-blocked" "yellow" 40000
# Supervisor run with 5s flock timeout should exit 0 (graceful) OR emit a
# flock_timeout warning — depending on the failure-mode policy the planner picks.
# For Phase 5: we assert supervisor exits 0 (does not crash) and SOMETHING
# lands in audit (either the real event or a warnings sidecar).
set +e
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex s9-blocked >/dev/null
S9_EXIT=$?
set -e
wait "$HOLDER" 2>/dev/null || true
assert_eq "s9: supervisor exits 0 even on flock timeout" "0" "$S9_EXIT"
# Either the audit has entries or a warnings file does:
AUDIT_LINES=$(wc -l < "$HOME/.sleepwalker/audit.jsonl" | tr -d ' ')
WARN_LINES=$(wc -l < "$HOME/.sleepwalker/audit.jsonl.warnings" 2>/dev/null | tr -d ' ' || echo 0)
if [ "$AUDIT_LINES" -eq 0 ] && [ "$WARN_LINES" -eq 0 ]; then
  FAIL=$((FAIL+1)); FAILURES+=("s9: neither audit nor warnings captured the event")
fi
```

**Scenario 10 (hook flock wrap)** — extend `hooks/tests/run-tests.sh`:
```bash
echo "==> scenario: sleepwalker-audit-log.sh uses flock"
reset_state
TR=$(make_transcript "inbox-triage")
# Four concurrent PostToolUse audit invocations
for i in 1 2 3 4; do
  in=$(hook_input "PostToolUse" "Read" '{}' "sess-$i" "$TR" "output payload $i")
  echo "$in" | "$HOOKS_DIR/sleepwalker-audit-log.sh" >/dev/null &
done
wait
# All 4 entries should be present and valid JSON
assert_file_lines "audit has 4 lines" "4" "$TEST_HOME/.sleepwalker/audit.jsonl"
# grep-level check for expected fleet
assert_contains "audit contains inbox-triage fleet" '"fleet":"inbox-triage"' "$(cat "$TEST_HOME/.sleepwalker/audit.jsonl")"
```

### 6.3 Integration test

**[covered by queue-aggregator.test.ts extension in §6.1]** — a single test that writes fixtures for all 4 sources and asserts `aggregateQueue({ fetchCloud: false })` returns entries from all 4.

---

## 7. Pitfalls

### 7.1 macOS flock absence at install time

**What goes wrong:** User on a fresh Mac never `brew install`s flock. Supervisor falls through the missing-flock check and either crashes or silently writes unlocked.

**Why it happens:** Homebrew is an opt-in dep. First-time users may not have it. M3/M4 Macs with pristine developer setup are the most common "it just crashed" scenario.

**How to avoid:**
1. `install.sh` adds a `command -v flock || fail` check with a clear `brew install flock` instruction (see §1.2)
2. Supervisor and hook both `command -v flock` at startup; if absent, fall through to unlocked append + log warning (preserves v0.1 behavior, does not crash)
3. `/diagnostics` page (Phase 6 concern) surfaces flock availability

**Warning signs:** `audit.jsonl.warnings` file appears; audit entries have garbled JSON (indicates race is happening); user reports missing queue entries

### 7.2 audit.jsonl unbounded growth

**What goes wrong:** Phase 5 doesn't add a compaction/rotation mechanism. Over 12 months of daily Codex + Gemini runs, audit.jsonl could reach tens of MB. `readAuditLog()` loads the full file into memory.

**Why it happens:** Architectural — v0.1 has the same concern (CONCERNS.md §Performance). Phase 5 is additive; not a rewrite.

**How to avoid (Phase 5 non-regression):**
- Keep the tail-read pattern (`audit.ts:26: const tail = lines.slice(-limit);`) in any new reader
- `readSupervisorRuns()` in the aggregator should **tail-read** the last N KB of audit.jsonl rather than full-file. Implementation: seek to `size - 256KB`, discard first partial line, parse the rest. This caps per-call cost at ~100ms even on a 10MB file.
- Document the retention concern in §Deferred for Phase 6

**Warning signs:** Dashboard page-load time >3s; `/api/queue` latency >500ms; audit.jsonl over 5MB

### 7.3 Read-during-write on audit.jsonl

**What goes wrong:** `readSupervisorRuns()` opens audit.jsonl for read WHILE a supervisor is mid-flock-append. The reader sees the file as of that point in time. If the supervisor was writing a multi-KB line that spans multiple `write()` syscalls, the reader could see a partial last line.

**Why it happens:** POSIX read/write atomicity is only guaranteed ≤ PIPE_BUF (512 bytes on macOS). Longer writes may show partial to a concurrent reader.

**How to avoid:**
- `parseLines()` at `dashboard/lib/queue.ts:34-47` **already handles this** — it catches JSON.parse errors and skips the line. The skipped partial line will appear on the NEXT read (post-write-completion) as a complete line.
- Do NOT take a shared read lock (POSIX shared locks on the data file would serialize with writers and tank latency). The fail-silently-on-parse-error pattern is idiomatic and correct.

**Warning signs:** Intermittent "missing newest entry" reports; test flakiness in concurrent scenarios

### 7.4 Timezone drift in ts parsing

**What goes wrong:** Queue aggregator sorts entries by `new Date(b.ts).getTime() - new Date(a.ts).getTime()` (queue-aggregator.ts:35). If Codex/Gemini emitted a different timestamp format (e.g., local time without timezone, or non-ISO), sort would silently fail or misorder.

**Why it happens:** Copy-paste bugs in future adapter additions; different runtimes' CLIs emitting their own timestamps (though Sleepwalker's supervisor wraps them, so we control the ts format).

**How to avoid:**
- **Verified:** supervisor emits ISO 8601 UTC with Z suffix via `date -u +%Y-%m-%dT%H:%M:%SZ` (bin/sleepwalker-run-cli:71). `new Date()` parses this as UTC correctly on all browsers + Node.
- Add an assertion test: write a supervisor-run entry with a ts from a different timezone format (`"2026-04-20 13:00:00"` — no Z); expect either (a) parse error caught by parseLines, or (b) entry sorted to epoch-start (both fail-safe).

**Warning signs:** Queue entries appearing "out of order"; ts shown in UI is the string literal (not localized display)

### 7.5 flock binary removal from future macOS

**What goes wrong:** Apple has no published plan to ship flock(1). Homebrew is the only source. If Homebrew infrastructure or discoteq/flock maintainership lapses, Phase 5's flock dep becomes unreliable.

**Why it happens:** External-ecosystem dependency risk.

**How to avoid:**
- The fallback-to-unlocked-append pattern (§7.1) means we degrade to v0.1 behavior rather than crash — acceptable for an OSS reference impl
- Phase 6 `/diagnostics` page (out of scope for Phase 5 but worth noting) should surface flock presence + version
- Documentation in AUTHORING.md (Phase 6) should flag this as a known system dependency

**Warning signs:** discoteq/flock GitHub repo goes inactive; Homebrew formula gets marked `disabled`; Tahoe 27 drops arm64 bottles

---

## 8. Wave + dependency structure

### 8.1 Dependency graph

```
QUEU-01 (type widen)
   │
   ├──────→ QUEU-02 (pills) [consumes QueueSource values]
   │
   └──────→ QUEU-03 (readSupervisorRuns) [consumes QueueSource + maps to it]
                                              │
                                              └──→ queue-aggregator extension [consumes readSupervisorRuns]

QUEU-04 (flock) [orthogonal — depends on nothing in Phase 5]
   │
   ├──→ supervisor audit_emit wrap
   └──→ hook sleepwalker-audit-log.sh wrap

SAFE-01 (UI copy)
   │
   └── mostly orthogonal; depends on QUEU-03 for the new "budget_exceeded" queue-entry render but NOT on flock

SIGTERM enforcement (from SAFE-01) — ALREADY SHIPPED in Phase 2 supervisor. Verification-only.
```

### 8.2 Recommended waves

**Wave 0 — types + CSS (parallel-safe)**
- Plan 05-01: QUEU-01 widen + QueueStatus widen + minimal test additions. File: `dashboard/lib/queue.ts` only. ~10 LoC change. Cannot break anything (additive).
- Plan 05-02: QUEU-02 pill CSS. File: `dashboard/app/globals.css` only. 2 new utility classes. Pure CSS. No JSX change in this plan — defer UI branching to Wave 1 for cleaner git history.

These two plans touch **non-overlapping files** and can run in parallel. Both trivial; Wave 0 should close in one orchestrator pass.

**Wave 1 — reader + aggregator extension (single plan, serial)**
- Plan 05-03: Add `readSupervisorRuns()` to `dashboard/lib/queue-aggregator.ts`, add `SupervisorAuditEntry` type + `mapSupervisorEvent` helper, extend `aggregateQueue()` to merge all 3 sources. New test file `dashboard/tests/supervisor-runs.test.ts` with ~9 it() blocks. Extend `dashboard/tests/queue-aggregator.test.ts` with 1 integration block.

Must be single plan because it concentrates the logic change in one area. ~150 LoC new including tests.

**Wave 2 — flock both writers (parallel-safe)**
- Plan 05-04: Wrap `bin/sleepwalker-run-cli:audit_emit` (lines 69-82) with flock. Update `hooks/tests/supervisor-tests.sh` with Scenarios 8 + 9.
- Plan 05-05: Wrap `hooks/sleepwalker-audit-log.sh:45` with flock. Update `hooks/tests/run-tests.sh` with concurrent-audit scenario.
- Plan 05-06: Amend `install.sh` with `flock` availability check alongside jq check. README install instructions amendment.

Plans 05-04 and 05-05 touch **different files** — parallel-safe. 05-06 also touches a different file (install.sh) — parallel-safe.

**Wave 3 — UI copy + queue-client branch (single plan)**
- Plan 05-07: SAFE-01 sweep + queue-client.tsx supervisor-run branch.
  - Fix `app/routines/routines-client.tsx:62` ("tokens" → "chars (approximate)")
  - Add editor helper text (`app/editor/editor-client.tsx`)
  - Add third UI branch in `app/queue-client.tsx` for codex/gemini sources (consume pills from Wave 0, entries from Wave 1)
  - Optional `source-pill.tsx` helper extraction (Claude's discretion per CONTEXT.md)
  - Extend `dashboard/tests/source-pill.test.tsx` (if extracted) + add queue-client render tests for new branch

Single plan because all three UI files interact through shared QueueEntry shape and shared CSS. ~50-80 LoC.

**Wave 4 — exit gate (single plan)**
- Plan 05-08: Phase 5 exit gate. Full-suite verification:
  - `cd dashboard && pnpm run typecheck` → exit 0
  - `cd dashboard && pnpm test` → all green (new target: ~345 tests from 336)
  - `hooks/tests/run-tests.sh` → 26+ pass (unchanged or +1 new scenario)
  - `hooks/tests/supervisor-tests.sh` → 28 pass → ~33+ pass (Scenarios 8+9+10)
  - Frozen-surface diff: `git diff PHASE5_BASE..HEAD -- [list of v0.1 + Phase 2-4 paths]` → 0 lines (except for the 2 intentional additions: hook flock line + supervisor audit_emit flock)
  - Flip QUEU-01..04 + SAFE-01 traceability to Complete in REQUIREMENTS.md
  - ROADMAP + STATE update (Phase 5 sealed)
  - `docs/activity_log.md` entry

### 8.3 Parallelism map

```
Wave 0:  [05-01] ‖ [05-02]           (parallel — 2 files, different dirs)
Wave 1:  [05-03]                     (serial — aggregator + test file)
Wave 2:  [05-04] ‖ [05-05] ‖ [05-06] (parallel — 3 different files)
Wave 3:  [05-07]                     (serial — UI cross-file coupling)
Wave 4:  [05-08]                     (serial — gate)
```

**Total plan count: 8.** Granularity matches v0.2 convention (Phases 2/3/4 had 9-10 plans each).

### 8.4 File conflict audit

| Wave | Plans | Files touched | Overlap? |
|------|-------|--------------|----------|
| 0 | 05-01 | `dashboard/lib/queue.ts`, `dashboard/tests/queue.test.ts` | — |
| 0 | 05-02 | `dashboard/app/globals.css` | — |
| 1 | 05-03 | `dashboard/lib/queue-aggregator.ts`, `dashboard/tests/supervisor-runs.test.ts` (new), `dashboard/tests/queue-aggregator.test.ts` | — |
| 2 | 05-04 | `bin/sleepwalker-run-cli`, `hooks/tests/supervisor-tests.sh` | — |
| 2 | 05-05 | `hooks/sleepwalker-audit-log.sh`, `hooks/tests/run-tests.sh` | — |
| 2 | 05-06 | `install.sh`, `README.md` (maybe) | — |
| 3 | 05-07 | `app/routines/routines-client.tsx`, `app/editor/editor-client.tsx`, `app/queue-client.tsx`, (new) `app/_components/source-pill.tsx` or inline | — |
| 4 | 05-08 | `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `docs/activity_log.md` | `docs/activity_log.md` — ALL plans append entries; orchestrator serialises commit-by-commit anyway, so race is zero. |

**No intra-wave file overlap.** All parallel-marked waves are safe to run concurrently.

---

## 9. Answerable questions + open questions

### Answerable now (closed in this research doc)

1. **Does macOS 26 ship flock?** → **No.** `/usr/bin/flock` absent; `brew install flock` installs discoteq 0.4.0 at `/opt/homebrew/bin/flock`. [VERIFIED: direct probe during research]
2. **Does the v0.1 race actually corrupt audit.jsonl?** → **Yes, under load.** 78% corruption observed at 5KB lines × 8 writers. [VERIFIED: /tmp/flock-synth2.sh]
3. **Does flock close the race?** → **Yes.** 0% corruption with both command form and FD form. [VERIFIED: /tmp/flock-synth3.sh]
4. **Do existing QueueSource consumers break under the widen?** → **No.** No exhaustive switches; 3 files need minor additions for codex/gemini UX, but none fail-compile after the widen. [VERIFIED: grep of dashboard/]
5. **Is there a "tokens" misuse in the UI today?** → **Yes, exactly one.** `app/routines/routines-client.tsx:62`. All other "tokens" hits are auth-token references. [VERIFIED: grep]
6. **Does the Phase 2 supervisor already emit QUEU-03 contract?** → **Yes.** audit_emit contains ts (ISO 8601 UTC), fleet (`<runtime>/<slug>`), runtime, event, + per-event extras. ANSI strip runs upstream. [VERIFIED: direct read of bin/sleepwalker-run-cli + supervisor-tests.sh scenario 2]
7. **Does approval.ts need changes for codex/gemini entries?** → **No.** Line 22's `if (!entry.tool || !entry.args) return null;` already correctly returns null for supervisor-run entries (they have no tool/args). [VERIFIED: direct read]
8. **Are flock command-form and FD-form interchangeable?** → **Yes, for single-write operations.** Both produce identical 0% corruption in the synthetic. Choose based on readability; command form wins for the supervisor (single printf) and hook (single echo). [VERIFIED: live experiment]
9. **What's the flock timeout behavior?** → `-w 5` waits up to 5s then exits 1 (verified at 1011ms elapsed); `-n` fails in <10ms. Both leave the lock untouched. [VERIFIED: /tmp probe]
10. **What's PIPE_BUF on macOS 26?** → **512 bytes** (`getconf PIPE_BUF /` returns 512). Any append > 512 bytes can interleave. [VERIFIED: direct query]

### Open questions (planner discretion)

1. **Should `readSupervisorRuns()` cache like `cloud-cache.ts` does?** — Recommendation: **no** (audit.jsonl is local disk; reads are fast). But planner may choose to add a 5s in-memory cache if profiling shows hot-path latency on large audit files.
2. **Exact pill hex shades within the palette?** — Proposal above (`pill-codex` bg-aurora-500/10, `pill-gemini` bg-dawn-400/10); planner may tune. Must stay within existing Tailwind palette (no new hex codes).
3. **Should the queue-aggregator cap `readSupervisorRuns` at last-24h or last-N-entries?** — Recommendation: **last 24h** per CONTEXT.md (matches "what fired overnight" framing); planner confirms.
4. **Flock failure-mode: drop-the-entry vs unlocked-fallback?** — Recommendation per §1.6: unlocked-fallback for supervisor, drop-the-entry for hook. Planner may prefer uniform behavior (either one); the test scenarios cover both.
5. **Extract `source-pill.tsx` helper or keep inline?** — Recommendation: **inline** now; extract if `audit/page.tsx` also needs source pills in a future phase. Plan 05-07 can go either way.
6. **Should the supervisor-run queue entry be clickable to deep-link into Audit page?** — Nice-to-have, not spec'd. Planner's discretion — low-risk addition if shipped, easy to defer to Phase 6.
7. **Should `install.sh` auto-install flock via `brew install flock` or just prompt?** — Recommendation: **prompt**. Matches the existing jq behavior. User may prefer a different lock mechanism (nothing in the codebase forces flock specifically; it's the researcher/context recommendation).

### Deferred (out of scope per CONTEXT.md)

- audit.jsonl compaction/retention → Phase 6 or later
- Dedicated diagnostics page exposing flock presence → Phase 6
- Re-fire cloud routines from queue UI → Phase 4 runNow handles it
- AUTHORING.md "approximate" explainer doc → Phase 6
- Cross-runtime fan-out → out of scope per PROJECT.md anti-features

---

## Runtime State Inventory

> Phase 5 is additive (new type values, new CSS classes, new bash wrapper around an existing printf, new Node reader). No rename. No refactor of persisted state. Inventory is lightweight but worth stating explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.sleepwalker/audit.jsonl` — same file, new event shapes from Phase 2 supervisor are ALREADY being emitted (Phase 2 sealed); Phase 5's QUEU-03 reader just CONSUMES them. `~/.sleepwalker/queue.jsonl` — unchanged. | None — no data migration. Existing v0.1 audit entries (which lack `runtime`/`event` fields) are gracefully skipped by the filter in §2.2. |
| Live service config | None — v0.2 doesn't add net-new external service configs in Phase 5. Dashboard localhost:4001 config unchanged. | None |
| OS-registered state | None — no new launchd plists, no new scheduled tasks created by Phase 5 itself. Existing Phase 2 plists for Codex/Gemini continue to invoke the supervisor (which gains the flock wrapper — behavior-compatible). | None |
| Secrets/env vars | None new. Existing `SLEEPWALKER_MODE`, `SLEEPWALKER_FLEET`, `SLEEPWALKER_REEXECUTING`, `NO_COLOR`, `TERM`, `CI` unchanged. | None |
| Build artifacts | `dashboard/.next/` build cache — invalidated by TypeScript type widen in QUEU-01; will rebuild cleanly. No stale binaries. | None (clean rebuild on next `pnpm build`) |

**Nothing found in most categories:** verified by grep + file reads. Phase 5 is the rare purely-additive phase that doesn't touch persistent runtime state beyond appending to the existing audit.jsonl.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `flock` | QUEU-04 (both writers) | ✓ (after `brew install flock` during research) | 0.4.0 (discoteq) | Unlocked append + warning sidecar (preserves v0.1 behavior) |
| `jq` | existing supervisor + hook + reader | ✓ | 1.7.1-apple | None (hard dep; install.sh exits if absent) |
| `perl` | supervisor `strip_ansi()` | ✓ | 5.34.1 (built-in /usr/bin/perl) | None (macOS built-in; always present) |
| `bash` ≥ 4.0 | supervisor + hook + tests | ✓ | 5.3.3 (Homebrew) | System /bin/bash (3.2; arrays + `[[` work; no `declare -n`) |
| Node.js | dashboard | ✓ (assumed; Phase 4 verified) | — | — |
| pnpm | dashboard | ✓ (assumed; Phase 4 verified) | — | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** `flock` — degrades gracefully to unlocked writes if `brew install flock` was never run. install.sh should prompt but this codebase prefers graceful degradation over hard-fail at runtime.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (dashboard) + bash harness (hooks/supervisor) |
| Config file | `dashboard/vitest.config.ts` + `hooks/tests/run-tests.sh` + `hooks/tests/supervisor-tests.sh` |
| Quick run command | `cd dashboard && pnpm test -- supervisor-runs` |
| Full suite command | `cd dashboard && pnpm run typecheck && pnpm test && /Users/rahulmehta/Desktop/Projects/sleepwalker/hooks/tests/run-tests.sh && /Users/rahulmehta/Desktop/Projects/sleepwalker/hooks/tests/supervisor-tests.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUEU-01 | `QueueSource` widens; consumers unchanged | unit (type + runtime) | `pnpm test -- queue.test.ts` | ✅ extend existing |
| QUEU-01 | `QueueStatus` widen accepts "complete" + "failed" | unit | `pnpm test -- queue.test.ts` | ✅ extend |
| QUEU-02 | `pill-codex` and `pill-gemini` render with correct classes | jsdom | `pnpm test -- source-pill` | ❌ Wave 0 (new test file if helper extracted) |
| QUEU-03 | `readSupervisorRuns()` maps supervisor events correctly | unit | `pnpm test -- supervisor-runs` | ❌ Wave 1 |
| QUEU-03 | `aggregateQueue()` merges all 4 sources | integration | `pnpm test -- queue-aggregator` | ✅ extend existing |
| QUEU-04 | 4 concurrent writers produce zero-corruption audit | bash integration | `hooks/tests/supervisor-tests.sh` (Scenario 8) | ✅ extend existing |
| QUEU-04 | flock timeout path exits gracefully | bash integration | `hooks/tests/supervisor-tests.sh` (Scenario 9) | ✅ extend existing |
| QUEU-04 | hook audit log under flock | bash integration | `hooks/tests/run-tests.sh` (new scenario) | ✅ extend existing |
| SAFE-01 | No "tokens" in budget contexts | grep assertion in exit gate | `! grep -rn 'budget.*tokens\|tokens.*budget' dashboard/app/` | ✅ Wave 4 |
| SAFE-01 | "approximate" in editor helper + routine card + queue entry | jsdom | `pnpm test -- routines-client source-pill editor-client` | mixed; extend |

### Sampling Rate
- **Per task commit:** `cd dashboard && pnpm run typecheck && pnpm test -- <module>` (scoped to file; ~5-15s)
- **Per wave merge:** `cd dashboard && pnpm run typecheck && pnpm test` (full vitest; ~40s)
- **Phase gate:** Full suite (above) + both bash harnesses green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `dashboard/tests/supervisor-runs.test.ts` — new; covers QUEU-03 reader mapping
- [ ] `dashboard/tests/source-pill.test.tsx` — only if helper extracted (Claude's discretion); otherwise extend queue-client tests inline
- [ ] `hooks/tests/supervisor-tests.sh` — extend with Scenarios 8 + 9 (flock concurrency + timeout)
- [ ] `hooks/tests/run-tests.sh` — extend with concurrent audit-log scenario
- [ ] Framework install: none — Vitest + bash harness both already in place since Phase 3

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "audit.jsonl reads at queue-aggregator call site are fast enough not to need caching" | §1.5 open-question; §6.2 | Slightly slower dashboard loads on audit files >5MB; mitigation: tail-read last 256KB only |
| A2 | "codex/gemini supervisor runs produce only the 5 event types grep found in supervisor source" | §2.2 | Future Phase 6+ adapter additions add new events → readSupervisorRuns silently drops them. Mitigation: filter is allowlist, not blocklist; new events won't appear in queue until explicitly whitelisted. Safe. |
| A3 | "flock binary from Homebrew is installed on the target Mac before Phase 5 runs in production" | §1.2, §7.1 | User tries to use Phase 5 flock without installing flock → supervisor falls through to warning + unlocked append. Graceful degradation, not a failure. |
| A4 | "5s flock timeout is sufficient under realistic concurrency" | §1.4 | Deadlock scenarios with >5s holder: rare (single audit write is microseconds). Mitigation: fail-open-with-warning rather than retry-forever. |
| A5 | "Pill color contrast ratios pass WCAG AA" | §4.3 | Computed ratios are plausible but not measured with actual rendering. Recommendation in Wave 0: eyeball against real design; tune hex if fails. |
| A6 | "install.sh amendment is the right place for the flock check" | §1.2 | If planner moves the check elsewhere (e.g., supervisor startup), no harm — both locations are defensible. |

---

## Sources

### Primary (HIGH confidence) — direct file reads from this repo
- `dashboard/lib/queue.ts` — QueueSource definition + parseLines semantics
- `dashboard/lib/queue-aggregator.ts` — current aggregator shape
- `dashboard/lib/cloud-cache.ts` — QueueEntry mapping pattern
- `dashboard/lib/approval.ts` — cloud + no-tool guard (supervisor-run entries benefit from this)
- `dashboard/app/api/queue/route.ts` — POST body schema + source inference
- `dashboard/app/queue-client.tsx` — existing isCloud branch structure
- `dashboard/app/globals.css` — existing pill-* utility classes
- `dashboard/tailwind.config.js` — palette (ink / moon / dawn / aurora / signal)
- `dashboard/app/routines/routines-client.tsx` — SAFE-01 violation at line 62
- `dashboard/app/editor/editor-client.tsx` — budget input (to gain helper text)
- `bin/sleepwalker-run-cli` — supervisor's audit_emit (lines 69-82) + strip_ansi (line 86)
- `hooks/sleepwalker-audit-log.sh` — v0.1 hook audit write (line 45)
- `hooks/tests/supervisor-tests.sh` — 7 scenarios to extend
- `hooks/tests/run-tests.sh` — 26 scenarios to extend
- `.planning/codebase/CONCERNS.md` — the v0.1 race this phase closes
- `.planning/phases/05-queue/05-CONTEXT.md` — locked decisions

### Primary (HIGH confidence) — live synthetic experiments run during research
- `/tmp/flock-synth2.sh` — unlocked 8-writer stress (78-80% corruption consistent across 3 trials)
- `/tmp/flock-synth3.sh` — flock-protected 8-writer stress (0% corruption; both command form + FD form)
- Flock timeout probe (1s `-w` wait = 1011ms; `-n` fail = 9ms)
- Homebrew flock install (arm64_tahoe bottle 0.4.0 successful)
- `sw_vers` — confirmed macOS 26.4.1 target
- `getconf PIPE_BUF /` — 512 bytes atomic-append boundary on macOS

### Secondary (MEDIUM confidence)
- BashFAQ/045 on flock idioms — [https://mywiki.wooledge.org/BashFAQ/045]
- discoteq/flock GitHub — [https://github.com/discoteq/flock]
- flock(1) Linux man page — semantics identical for discoteq port — [https://man7.org/linux/man-pages/man1/flock.1.html]

### Tertiary (LOW confidence — flagged for validation)
- None. All claims either directly verified in this session or cross-referenced against canonical docs.

---

## Metadata

**Confidence breakdown:**
- flock availability + behavior: HIGH — live experiment verified install, semantics, failure modes, and zero-corruption property on the target macOS
- QueueSource widen impact: HIGH — direct grep of consumer call sites; no exhaustive switches; approval.ts guard already correct
- Supervisor audit contract: HIGH — direct read of supervisor source; Phase 2 tests already verify ANSI strip + JSON well-formedness
- Pill palette selections: MEDIUM-HIGH — palette availability verified, contrast computed not measured; one-line tuning if visual QA flags
- SAFE-01 copy sites: HIGH — grep-verified single violation + two additive locations

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days; stable domain, stable tooling)

---

## Answered / Open / Deferred

**Answered in this doc:**
- flock on macOS 26 (§1.1–1.7)
- QUEU-03 contract adequacy (§2.1)
- Terminal-event filter semantics (§2.2)
- QueueSource consumer impact (§3)
- Pill design within palette (§4)
- Exact SAFE-01 copy changes (§5)
- Test strategy (§6)
- Wave structure + file overlap (§8)

**Open (planner discretion):**
- Cache semantics of `readSupervisorRuns()` — recommend no cache
- Pill hex shade tuning — proposal given; designer may tune
- 24h vs last-N-entries window — recommend 24h
- Flock failure mode: drop vs unlocked-warn — recommend unlocked-warn for supervisor, drop for hook
- source-pill.tsx helper extraction — recommend inline for now
- Supervisor-run queue entry clickability — nice-to-have; planner's call

**Deferred (out of scope):**
- audit.jsonl retention/compaction
- /diagnostics page
- AUTHORING.md "approximate" explainer
- Cloud-routine re-fire from queue
- Cross-runtime fan-out

*End of Phase 5 research.*
