---
phase: 06-polish
type: patterns
generated: 2026-04-22
analog_search_scope: docs/ routines-local/ routines-cloud/ dashboard/app/ dashboard/lib/ dashboard/tests/ hooks/tests/ .planning/phases/05-queue/
files_mapped: 9
analogs_found: 9
---

# Phase 6 Polish — Pattern Map

Each new/amended Phase 6 file → closest existing analog with exact path + line refs + specific things to mirror. Caveats call out divergences where copying verbatim would regress (zod casing, queue schema, frozen v0.1 surface).

## File Classification

| Phase 6 target | Role | Data flow | Closest analog | Match quality |
|----------------|------|-----------|----------------|---------------|
| `docs/AUTHORING.md` | doc-walkthrough | static | `docs/QUICKSTART.md` | exact |
| `templates/routine-claude-routines.md` | doc-template | static (frontmatter+body) | `routines-local/sleepwalker-downloads-organizer/SKILL.md` | role-match |
| `templates/routine-claude-desktop.md` | doc-template | static (frontmatter+body) | `routines-local/sleepwalker-downloads-organizer/SKILL.md` | exact |
| `templates/routine-codex.md` | doc-template | static (frontmatter+body) | composite: SKILL.md frontmatter + `routines-cloud/pr-reviewer/prompt.md` body | composite |
| `templates/routine-gemini.md` | doc-template | static (frontmatter+body) | composite: SKILL.md frontmatter + cloud `prompt.md` body | composite |
| `dashboard/app/diagnostics/page.tsx` | page (Server Component) | request-response (one-shot SSR) | `dashboard/app/audit/page.tsx` | exact |
| `dashboard/lib/diagnostics.ts` | service lib | file-I/O + subprocess probes | `dashboard/lib/audit.ts` (file-I/O) + adapter `healthCheck()` (probe shape) | role-match |
| `dashboard/tests/diagnostics.test.ts` | unit test | file-I/O + mock exec | `dashboard/tests/audit.test.ts` + `queue-aggregator.test.ts` | exact |
| `tests/compat/v01-routines.sh` | integration test (bash) | file-I/O assertions | `hooks/tests/install-idempotency.sh` + `hooks/tests/run-tests.sh` | exact |
| `tests/compat/frozen-surface.sh` | CI gate (bash) | git-diff numstat | `.planning/phases/05-queue/05-08-PLAN.md` §Task 1 steps 6-7 | exact (pattern adaptation) |
| `dashboard/tests/v01-queue-integration.test.ts` | integration test (TS) | file-I/O round-trip | `dashboard/tests/queue-aggregator.test.ts` | exact |
| `.github/workflows/ci.yml` | CI config | n/a | none in repo — standard Node+pnpm+macOS runner from OSS | no-analog |

---

## Pattern Assignments

### `docs/AUTHORING.md`

**Analog:** `/Users/rahulmehta/Desktop/Projects/sleepwalker/docs/QUICKSTART.md`

**Mirror:**
- **H1 + one-line hook:** `# Sleepwalker — Quickstart` + `You're 5 minutes from your first overnight routine.` (line 1-3). AUTHORING.md opens identically: `# Sleepwalker — Authoring Guide` + `Ship a custom routine to any of 4 runtimes in under 10 minutes.`
- **Numbered top-level sections** with `## 1. Install the local fleet`, `## 2. Start the dashboard` (line 14, 30). Phase 6 §1-7 use the same `## N. <Title>` scheme.
- **Fenced `bash` blocks** for commands (line 16-19, 32-36). No language-less fences. Copy-paste friendly.
- **`---` hr separators** between major sections (line 12, 72, 103, 125, 162).
- **Troubleshooting anchor at bottom** (line 164 — `## Troubleshooting` with `**"jq: command not found"**` bolded-question / plain-answer pairs). AUTHORING.md §6 upgrades this to a grep-friendly table per CONTEXT §specifics.
- **Inline `Option A / B / C` blocks** (line 44-60) for branching flows. Use for "Runtime choice" in §2.
- **"Nothing runs automatically yet"** scare-stop callout (line 28) — mirror this for the Mac-sleep caveat in §4.

**Tone + voice:** Second-person, short sentences, no marketing. "This. This. This." style not "Our platform enables...".

**Caveats:**
- QUICKSTART.md still references v0.1 `/schedule create` CLI only (line 54). AUTHORING.md §3 must describe all 4 runtimes including Claude Routines' `/schedule create` + browser handoff for API triggers (per Phase 2 Q1 finding).
- QUICKSTART.md says "6 `sleepwalker-*` skills" (line 48) — a v0.1 count. AUTHORING.md must cite the combined count dynamically or say "14 v0.1 routines + however many you've authored".
- Do NOT duplicate QUICKSTART §1-2. Link to it. AUTHORING.md picks up at "now make your own".

**Length target:** 600-1000 lines per CONTEXT. QUICKSTART is 178 lines — AUTHORING.md is 3-5× denser.

---

### `templates/routine-claude-routines.md` + `-claude-desktop.md` + `-codex.md` + `-gemini.md`

**Analog (frontmatter):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/routines-local/sleepwalker-downloads-organizer/SKILL.md` lines 1-4
**Analog (body sections):** same file lines 6-57 (H1-less body + `## What you do` / `## What you do NOT do` / `## Constraints` / `## Success criteria`)
**Analog (runtime-specific top-of-prompt):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/routines-cloud/pr-reviewer/prompt.md` lines 1-9 (role + imperative)

**Mirror (frontmatter shape — SKILL.md lines 1-4):**
```
---
name: sleepwalker-downloads-organizer
description: Organize ~/Downloads into categorized folders. Files from last 30 days get filed; older than 30 days are queued for deletion review.
---
```

**Mirror (fleet marker — SKILL.md line 6):** `[sleepwalker:downloads-organizer]` on its own line, blank line above and below. Every template must include this marker tag using the runtime-prefixed slug per CLAUDE.md conventions: `[sleepwalker:<runtime>/<slug>]`.

**Mirror (section structure — SKILL.md lines 10-57):**
- `## What you do` — numbered list, inline fenced code blocks for exact commands
- `## What you do NOT do` — bullet list of negatives
- `## Constraints` — budget, scope limits, error handling rules
- `## Success criteria` — bullet list of observable outcomes

**Divergences per runtime:**
| Template | `runtime` value | Example schedule | Example prompt flavor |
|----------|-----------------|------------------|-----------------------|
| claude-routines | `claude-routines` | `0 7 * * *` (daily morning) | GitHub-repo-read-only (mirror pr-reviewer/prompt.md lines 1-9 imperative) |
| claude-desktop | `claude-desktop` | `0 2 * * *` (local nighttime) | Full-Mac-access (mirror downloads-organizer body) |
| codex | `codex` | `0 3 * * *` | Codebase analysis or one-shot transform |
| gemini | `gemini` | `0 6 * * *` | Long-context doc analysis |

**Caveats:**
- **LOAD-BEARING:** `RoutineBundleInput` zod schema at `dashboard/lib/bundle-schema.ts:21-60` expects **lowercase frontmatter keys**: `name`, `slug`, `runtime`, `prompt`, `schedule`, `reversibility`, `budget`. The v0.1 SKILL.md frontmatter uses `name` + `description` only (SKILL.md:1-4). Do NOT copy SKILL.md's `description` key verbatim — the Phase 3 editor's `saveRoutine` parses `gray-matter` output and feeds it to zod, which rejects unknown keys. Templates MUST use the Phase 3 `RoutineBundleInput` key set per CONTEXT §decisions DOCS-02 (line 56-65). Include a commented pointer at the top: `# See docs/AUTHORING.md §2 for field reference`.
- **Schedule field naming:** v0.1 SKILL.md does not include `schedule` in frontmatter (cron lives in Desktop state per CLAUDE.md §Non-existence facts). Phase 3 templates DO include it — it is the authored source of truth at write time.
- **Slug validation:** regex `^[a-z][a-z0-9-]{0,63}$` per `bundle-schema.ts:19`. Placeholder slug `morning-brief` (per CONTEXT line 59) conforms; don't ship a placeholder with uppercase or starting-digit.
- **Budget typing:** zod coerces FormData string → number at `bundle-schema.ts:56-60`. Write the YAML value as unquoted integer (`budget: 40000`) so gray-matter parses it as a number on disk read too.
- **`[sleepwalker:<runtime>/<slug>]` marker:** v0.1 uses `[sleepwalker:<slug>]` only (no runtime prefix, e.g. SKILL.md:6). v0.2 extends to `<runtime>/<slug>` per CLAUDE.md §Conventions. Use the extended form in templates.

---

### `dashboard/app/diagnostics/page.tsx`

**Analog:** `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/app/audit/page.tsx` (entire file, 57 lines)

**Mirror (exact shape):**
- Line 1: `import` statement from local lib: `import { gatherDiagnostics } from "@/lib/diagnostics";`
- Line 2: `import { PageHeader } from "../_components/page-header";`
- Line 4: `export const dynamic = "force-dynamic";` — REQUIRED; diagnostics page is not cacheable (CONTEXT §specifics: "Last checked: <ISO timestamp>").
- Line 6: `export default async function DiagnosticsPage() {` — async Server Component (diagnostics probes are async — CONTEXT §DOCS-03 specifies `gatherDiagnostics()` returns `Promise`).
- Line 7: `const snapshot = await gatherDiagnostics();`
- Lines 14-20: `<PageHeader eyebrow="..." title="..." subtitle="..." />` with all three props (use `eyebrow="Last checked: <iso>"`, `title="Diagnostics"`, `subtitle="..."`).
- Lines 33-54: `<div className="space-y-1 data text-xs">` + panel/pill primitives. Reuse `panel p-3`, `text-moon-200`, `text-moon-600`, `pill-muted` from the existing lunar palette (CLAUDE.md: "v0.2 preserves the lunar/celestial palette as-is").
- Lines 34-37: `{entries.length === 0 ? <empty-state> : entries.map(...)}` ternary pattern for graceful empty state.

**Key layout spec (from CONTEXT §DOCS-03):** two-column grid, label + value, copy-to-clipboard button. The copy button is the ONE client-component boundary — mirror the `RoutinesClient` pattern from `dashboard/app/routines/page.tsx` lines 1-25 (Server Component passes `initial={routines}` to a `-client.tsx` child). Author a `diagnostics-client.tsx` sibling that receives the snapshot and renders the copy UI.

**Caveats:**
- Do NOT re-probe on client render. The snapshot is server-rendered once; copy-button is client-only for `navigator.clipboard.writeText()`.
- `audit/page.tsx` renders 200 rows; diagnostics renders ~10-15 rows — don't bother with pagination.
- No secrets rendered. CLAUDE.md §Safety and CONTEXT §DOCS-03 both explicit: "Zero secrets rendered. No env var values, no API keys, no auth token state."

---

### `dashboard/lib/diagnostics.ts`

**Analog (file-I/O skeleton):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/audit.ts` (entire file, 37 lines)
**Analog (subprocess probe shape):** `dashboard/lib/runtime-adapters/codex.ts` `healthCheck()` — probe pattern via `execa` / `execFile`

**Mirror (from audit.ts):**
- Lines 1-3: node module imports (`import fs from "node:fs"; import os from "node:os"; import path from "node:path";`). Diagnostics uses `node:child_process` instead of `node:fs`.
- Lines 9-19: exported typed interface (`export interface AuditEntry { ts: string; fleet: string; ... }`). Diagnostics exports `DiagnosticsSnapshot` with each probe's result shape.
- Lines 21-37: single named export function returning an array/object of results. Diagnostics exports `async function gatherDiagnostics(): Promise<DiagnosticsSnapshot>`.
- Line 22: `const f = auditFile(); if (!fs.existsSync(f)) return [];` — **fail-soft pattern**. Mirror this verbatim: every probe returns a default shape on error. Per CONTEXT §DOCS-03: "Server-side `execFile` probes must fail soft — Intel Macs running fish with macOS 14 may lack `flock`... Every probe wraps in try/catch; on failure, the UI renders the row with `(not found)` or `(error: ...)` instead of crashing the page."
- Lines 28-35: `try/catch` per-entry with `catch { return null; }` (line 31-32) — mirror at probe granularity. Each probe is its own try/catch so one failure doesn't blank the whole page.

**Probe list (from CONTEXT §DOCS-03):**
```typescript
// Parallel via Promise.allSettled per probe:
sw_vers -productVersion        → macOS version
uname -m                        → arch (detect Rosetta)
brew --prefix                   → Homebrew prefix
command -v claude / codex / gemini (via /bin/zsh -l -c)
echo $SHELL                     → active shell
stat -f "%Mp%Lp" ~/Library/LaunchAgents/
flock --version                 → Phase 5 QUEU-04 dep
jq --version                    → v0.1 dep
```

**Caveats:**
- Use `execFile` (not `exec` / `execSync`) to avoid shell injection, matching adapters' convention (`dashboard/lib/runtime-adapters/codex.ts` uses execFile throughout).
- Per CLAUDE.md §Conventions "result-object error returns (no throws for control flow)": each probe returns `{ok: true, value: "15.3"} | {ok: false, error: "not found"}` — not throws. Mirror the `FireResult` pattern at `dashboard/lib/fire-routine.ts` lines 116-133 (from CONVENTIONS.md §Error Handling §Result Objects).
- **No secrets emitted.** Do NOT probe env vars (no `printenv`, no `env` dump). CLAUDE.md §Safety: "never display sensitive values in output".
- `Promise.allSettled` (not `Promise.all`) — so one hung probe doesn't block the others. Probes are I/O-bound; run in parallel.

---

### `dashboard/tests/diagnostics.test.ts`

**Analog (temp-HOME + file-I/O skeleton):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/queue-aggregator.test.ts` lines 1-19

**Mirror (verbatim):**
- Line 1: `import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";`
- Lines 2-4: `import fs from "node:fs"; import path from "node:path"; import { makeTempHome, ensureSleepwalkerDir } from "./helpers";`
- Lines 6-8: `describe("<lib>", () => { let env: ReturnType<typeof makeTempHome>; let dir: string; ... })`
- Lines 10-13: `beforeEach(() => { env = makeTempHome(); dir = ensureSleepwalkerDir(env.home); });`
- Lines 15-18: `afterEach(() => { env.restore(); vi.restoreAllMocks(); });`
- Dynamic imports inside each `it()` block: `const { gatherDiagnostics } = await import("@/lib/diagnostics");` (TESTING.md §Common Patterns: "Dynamic imports to ensure env setup").

**Mock pattern:**
- Mock `node:child_process.execFile` via `vi.mock()` to return fixture stdout for each command.
- Verify: valid response → probe returns `{ok: true, value: "..."}`, thrown error → probe returns `{ok: false, error: "..."}`, unknown binary → returns "(not found)" row.

**Caveats:**
- TESTING.md §What NOT to Mock: "Built-in Node modules (`fs`, `path`, `os`) — instead use real temp dirs". Diagnostics tests should mock `child_process.execFile` (external program invocation) but NOT `fs`/`os`/`path`. Use `makeTempHome()`.
- 3 happy-path + 2 fail-soft tests sufficient; do not exhaustively enumerate every probe. Coverage is not enforced (TESTING.md §Coverage).

---

### `tests/compat/v01-routines.sh`

**Analog (install-twice + diff):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/hooks/tests/install-idempotency.sh` (entire file, 60 lines)
**Analog (assertion harness + isolated HOME):** `/Users/rahulmehta/Desktop/Projects/sleepwalker/hooks/tests/run-tests.sh` lines 1-87

**Mirror from `install-idempotency.sh`:**
- Lines 1-5: shebang + header comment + `set -euo pipefail`
- Line 7: `REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"` — anchors paths via script location. Phase 6 uses `"$(dirname "$0")/../.."` because `tests/compat/` is 2 levels deep.
- Lines 9-11: `TEST_HOME=$(mktemp -d -t sleepwalker-<name>-XXXXXX); export HOME="$TEST_HOME"; mkdir -p "$TEST_HOME"`
- Lines 13-16: `cleanup() { rm -rf "$TEST_HOME"; }; trap cleanup EXIT`
- Lines 18-34: snapshot-then-diff pattern (two install.sh runs + `find | sort` + `diff -q`). Reuse verbatim for Part 1.
- Lines 45-58: `diff -q ... >/dev/null; then echo PASS else echo FAIL; diff; exit 1; fi` — PASS/FAIL exit-code discipline.

**Mirror from `run-tests.sh`:**
- Lines 13-15: `PASS=0; FAIL=0; FAILURES=()` counters
- Lines 62-87: `assert_eq`, `assert_contains`, `assert_file_lines` helper functions — copy verbatim.

**Contents (per CONTEXT §COMP-01 Part 1):**
```bash
# Part 1: install.sh idempotency (mirror install-idempotency.sh)
# Part 2: enumerate 14 v0.1 routines, assert file layout
for dir in "$REPO_ROOT"/routines-local/sleepwalker-*; do
  assert [ -f "$dir/SKILL.md" ]
done
for dir in "$REPO_ROOT"/routines-cloud/*/; do
  [[ "$dir" == *"/_"* ]] && continue  # skip _test-zen
  assert [ -f "$dir/prompt.md" ]
  assert [ -f "$dir/config.json" ]
done
# Part 3: assert ROUTINES.md catalog count matches filesystem
```

**Caveats:**
- `routines-cloud/` contains a `_test-zen/` fixture directory (per `ls` output). Filter with `[[ "$dir" == *"/_"* ]] && continue` — don't assert it as a v0.1 routine.
- Do NOT require `codex` or `gemini` binaries (per CONTEXT §specifics line 196: "COMP-01 test shouldn't require `codex`/`gemini` binaries to be installed — the 14 v0.1 routines are all Claude").
- Script runs `./install.sh` twice with isolated `$HOME`. install.sh is v0.1-frozen per CLAUDE.md §Frozen surface — do NOT modify install.sh from this test.
- Reuse `assert_file_lines` for line-count assertions on generated state files (settings.json hook count, etc.).

---

### `tests/compat/frozen-surface.sh`

**Analog:** `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/05-queue/05-08-PLAN.md` §Task 1 steps 6-7 (lines 282-332) — the exit-gate frozen-surface diff pattern

**Mirror (core idiom from 05-08 §Task 1 step 6):**
```bash
git diff --numstat "$BASELINE_SHA" HEAD -- \
  install.sh \
  hooks/sleepwalker-*.sh \
  hooks/_detect_fleet.sh \
  bin/sleepwalker-execute \
  routines-local/sleepwalker-*/SKILL.md \
  routines-cloud/*/prompt.md \
  routines-cloud/*/config.json \
  dashboard/lib/queue.ts \
  dashboard/lib/cloud.ts dashboard/lib/cloud-cache.ts \
  dashboard/lib/queue-aggregator.ts dashboard/lib/settings.ts \
  dashboard/lib/approval.ts dashboard/lib/audit.ts \
  dashboard/lib/github.ts dashboard/lib/fire-routine.ts \
  dashboard/lib/routines.ts
# Expected output: empty (0 lines). Non-zero = regression.
```

**Key divergence from phase-gate version:** CONTEXT §COMP-02 line 120-131 is explicit — BASELINE_SHA is hardcoded to `998455b` (v0.1 seal commit) **NOT** dynamically resolved via `git log --reverse --diff-filter=A --format="%H" -- <sentinel>^` (which the phase-exit gates use at 05-08 step 1 line 246-247). Permanent gate vs one-time gate.

**Documented-exception handling (mirror 05-08 step 7):** the script must allow specific v0.2 amendments:
- install.sh: Phase 5 QUEU-04 flock preflight (additive)
- hooks/sleepwalker-audit-log.sh: Phase 5 QUEU-04 flock wrap (additive)
- dashboard/lib/queue.ts: Phase 5 QUEU-01 type widen (additive)
- dashboard/lib/cloud-cache.ts: Phase 5 eager-source amendment
- dashboard/lib/routines.ts: Phase 4 DEPL additions
- dashboard/package.json: dep additions (non-removal of v0.1 deps)

Implement as a `ALLOWED_AMENDMENTS` associative array or case-statement; for each amended file, either byte-identical OR `grep`-verified to contain ONLY the documented amendment (per 05-08 step 8 lines 334-351 — JSON-shape + shebang + `set -euo pipefail` invariants).

**Invariant grep checks (verbatim from 05-08 step 8):**
```bash
grep -c '^set -euo pipefail' install.sh          # expect 1
grep -c 'jq -nc' hooks/sleepwalker-audit-log.sh  # expect 1
head -2 install.sh                                # expect "#!/bin/bash"
```

**Caveats:**
- Script path is `tests/compat/frozen-surface.sh` — Plan 05-08's gate lives in the plan itself (inline commands). Phase 6 externalizes it as a permanent, runnable CI artifact.
- CI exits non-zero on drift — the workflow must fail the PR. Exit code 0 only when diff is empty across frozen paths AND documented-exception files grep-verify clean.
- Hardcoded BASELINE_SHA `998455b` (per CONTEXT §specifics line 197: `git log --oneline | grep 'feat: Sleepwalker v0.1'` → `998455b`) — document at top of script so future contributors see why.

---

### `dashboard/tests/v01-queue-integration.test.ts`

**Analog:** `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/queue-aggregator.test.ts` (entire file, 173 lines) — specifically the multi-source integration test at lines 93-172

**Mirror (exact):**
- Lines 1-19: test-file skeleton (vitest imports + makeTempHome + describe + beforeEach + afterEach). Copy verbatim; change only the `describe` label.
- Lines 20-57: first `it()` block pattern — `fs.writeFileSync(path.join(dir, "queue.jsonl"), [JSON.stringify({...}), JSON.stringify({...})].join("\n") + "\n")` for seeding local queue entries.
- Lines 29-45: `fs.writeFileSync(path.join(dir, "cloud-cache.json"), JSON.stringify({fetchedAt: ..., entries: [...]}))` for seeding cloud cache.
- Lines 47-48: `const { aggregateQueue } = await import("@/lib/queue-aggregator"); const q = await aggregateQueue({ fetchCloud: false });` — always set `fetchCloud: false` to avoid network I/O in unit tests.
- Lines 49-57: assertions on `q.pending.length`, `q.pending[0].id`, `q.recent.length`, `q.localCount`, `q.cloudCount` — copy assertion shape.

**Per CONTEXT §COMP-01 Part 2 (lines 111-115):**
- Seed `$HOME/.sleepwalker/queue.jsonl` with 14 mock v0.1 entries (6 local + 8 cloud-shape)
- Call `aggregateQueue({fetchCloud: false})`
- Assert all 14 surface in `pending ∪ recent`, all have correct `source` + `kind` discriminants, no entries dropped

**Mock fixture shape — use v0.1 shape NOT v0.2 supervisor-run shape:**
```typescript
// Local entry (v0.1):
{id: "q_local_X", ts: "...", fleet: "inbox-triage", tool: "Read", reversibility: "green", session: "...", status: "pending"}

// Cloud cache entry (v0.1):
{id: "q_cloud_X", ts: "...", fleet: "cloud/pr-review", kind: "cloud-pr", status: "pending"}
```

**Caveats:**
- **LOAD-BEARING:** Do NOT include Phase 5 supervisor-run entries (kind: "supervisor-run", runtime: "codex"/"gemini"). This test is specifically COMP-01: "v0.1 behavior continuity". Phase 5's multi-source test at `queue-aggregator.test.ts` lines 93-172 already covers v0.2. Phase 6's test asserts the v0.1-only subset still round-trips unchanged.
- Match `QueueEntry` field names exactly per CLAUDE.md §Frozen backward-compat: "Existing `QueueEntry` field names" frozen. Reference `dashboard/lib/queue.ts` for the authoritative shape; do not invent field names.
- 14 entries = 6 local-fleet slugs (inbox-triage, downloads-organizer, calendar-prep, standup-writer, screenshot-reviewer, disk-cleanup) + 8 cloud-fleet slugs (pr-reviewer, dependency-upgrader, doc-drift-fixer, test-coverage-filler, dead-code-pruner, morning-brief, library-port, alert-triage). Reference `docs/ROUTINES.md` for canonical slug list.
- Test runs with `fetchCloud: false` — cloud entries come from the seeded `cloud-cache.json` file, not a network fetch. Mirrors `queue-aggregator.test.ts:47` and avoids TESTING.md §What NOT to Mock violations.

---

### `.github/workflows/ci.yml`

**Analog:** None in repo (`.github/workflows/` does not exist per `ls` verification — no-analog row in classification table).

**Pattern source (external, standard OSS):** Node.js matrix with pnpm + macOS runner. Per CONTEXT §CI scope decision (line 137): `pnpm typecheck + pnpm test + bash hooks/tests/run-tests.sh + bash hooks/tests/supervisor-tests.sh + bash tests/compat/v01-routines.sh + bash tests/compat/frozen-surface.sh` on every push to main + every PR. macOS runner (for `launchctl`/`flock` availability).

**Prescribed steps (per CONTEXT line 137):**
1. `actions/checkout@v4` with `fetch-depth: 0` (frozen-surface.sh needs full history back to `998455b` v0.1 seal).
2. `actions/setup-node@v4` with `node-version: '20'` (CLAUDE.md §Technology Stack: "Next.js 15.1.4 + React 19" → Node 20 required).
3. `pnpm/action-setup@v4` with `version: 9` (per `pnpm-lock.yaml` root lock file).
4. `pnpm install --frozen-lockfile` in `dashboard/` workspace.
5. `pnpm run typecheck` (CLAUDE.md §Code Style: "Run typecheck before committing").
6. `pnpm test` (43 dashboard tests + Phase 5/6 additions).
7. `bash hooks/tests/run-tests.sh` (26+ hook tests).
8. `bash hooks/tests/supervisor-tests.sh` (30+ supervisor scenarios).
9. `bash tests/compat/v01-routines.sh` (new in this phase).
10. `bash tests/compat/frozen-surface.sh` (new in this phase — permanent regression gate).

**Caveats:**
- `runs-on: macos-14` or `macos-latest` — NOT ubuntu. `launchctl` + `flock` (via Homebrew `discoteq/flock`) only on macOS. Per CONTEXT §CI scope: "macOS runner (for launchd/flock availability)."
- Install `flock` first: `brew install discoteq/flock/flock` (Phase 5 QUEU-04 dep per CLAUDE.md).
- No self-hosted runner — CONTEXT §CI scope: "No self-hosted runner needed because COMP-01 doesn't require real `launchctl bootstrap`".
- No secrets needed for default runs. GitHub PAT only required if COMP-01 added real cloud-cache fetch tests (currently it doesn't — `fetchCloud: false`).
- Single job, no matrix per CONTEXT §Claude's Discretion (line 147) — matrix across shell/OS variants is discretionary; simplest = single job.

---

## Shared Patterns

### File-I/O + fail-soft (applies to `diagnostics.ts`)

**Source:** `dashboard/lib/audit.ts:22-36`

```typescript
const f = auditFile();
if (!fs.existsSync(f)) return [];   // fail-soft default
// ...
.map((line) => {
  try { return JSON.parse(line) as AuditEntry; }
  catch { return null; }             // skip malformed, don't throw
})
.filter((x): x is AuditEntry => x !== null)
```

Every Phase 6 TS function that touches the filesystem or runs a subprocess wraps the risky op in try/catch + returns a default (empty array, null, or `{ok: false, error: ...}`). No throws for control flow (CLAUDE.md §Conventions).

---

### Isolated `$HOME` for all file-touching tests (applies to `diagnostics.test.ts`, `v01-queue-integration.test.ts`, `v01-routines.sh`)

**Source (TS):** `dashboard/tests/queue-aggregator.test.ts:10-18`
```typescript
beforeEach(() => { env = makeTempHome(); dir = ensureSleepwalkerDir(env.home); });
afterEach(() => { env.restore(); vi.restoreAllMocks(); });
```

**Source (bash):** `hooks/tests/install-idempotency.sh:9-16`
```bash
TEST_HOME=$(mktemp -d -t <prefix>-XXXXXX)
export HOME="$TEST_HOME"
cleanup() { rm -rf "$TEST_HOME"; }
trap cleanup EXIT
```

Every test in Phase 6 runs in an isolated `$HOME` — never touches the real user state. TESTING.md §What to Mock: "File I/O via temporary HOME directory (all tests do this)".

---

### Lunar palette + panel primitives (applies to `diagnostics/page.tsx`, `diagnostics-client.tsx`)

**Source:** `dashboard/app/audit/page.tsx:32-54`

Tailwind primitives in use: `panel`, `panel p-3`, `panel p-4 mb-6`, `text-moon-200`, `text-moon-400`, `text-moon-600`, `text-dawn-400`, `pill-muted`, `pill-red`, `data text-xs`, `tabular-nums`, `space-y-1`, `truncate`, `whitespace-nowrap`.

These are defined in `dashboard/app/globals.css` (v0.1 palette). CLAUDE.md §Out of scope: "Dashboard UI refresh or redesign" + PROJECT.md: "v0.2 preserves the lunar/celestial palette as-is". Do NOT introduce new color classes or Tailwind config changes.

---

### Conventional commits (applies to all Phase 6 commits)

**Source:** user's global CLAUDE.md §Commit Rules + recent `git log` (e.g., `feat(02-12): stage bundle + pin WorkingDirectory out of TCC zone`)

Prefix: `feat(06-NN):` / `docs(06-NN):` / `test(06-NN):` / `fix(06-NN):` / `chore(06-NN):`. No emojis, no AI attribution, imperative mood, WHAT + WHY.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `.github/workflows/ci.yml` | CI config | `.github/workflows/` is empty — no existing GitHub Actions file in repo. Planner uses standard Node+pnpm+macOS runner pattern from public OSS projects; see Pattern Assignments §`.github/workflows/ci.yml` above for exact step list. |

---

## Metadata

**Analog search scope:** `docs/`, `routines-local/`, `routines-cloud/`, `dashboard/app/`, `dashboard/lib/`, `dashboard/tests/`, `hooks/tests/`, `.planning/phases/05-queue/`
**Files scanned:** ~18 primary + ~8 spot-checked
**Pattern extraction date:** 2026-04-22
**Consumer:** `gsd-planner` for Phase 6 plan authoring
