# Phase 2: Adapters — Research

**Researched:** 2026-04-18
**Domain:** TypeScript adapter layer + launchd plist writer + bash supervisor for 4 runtime agents (Claude Code Routines, Claude Code Desktop, OpenAI Codex CLI, Google Gemini CLI) on macOS
**Confidence:** HIGH

---

## Summary

Phase 2 ships eight requirements (ADPT-03 through ADPT-09 + SAFE-02) on top of the frozen Phase 1 interface. The work divides cleanly into three compositional layers: (1) **primitives** — `assertValidSlug` injection into existing `slug.ts` builders, the hand-rolled `launchd-writer.ts` plist generator, and the `bin/sleepwalker-run-cli` bash supervisor; (2) **four adapter modules** that compose the primitives — `claude-routines.ts` (wraps existing `fire-routine.ts`), `claude-desktop.ts` (writes `SKILL.md` + returns browser handoff URL), `codex.ts` (generates plist + bootstraps launchd), `gemini.ts` (same with `GOOGLE_CLOUD_PROJECT` env); (3) **registry replacement** — `index.ts` swaps the Phase 1 `notImplemented` stubs for real adapters without touching the `ADAPTERS: Record<Runtime, RuntimeAdapter>` shape.

All eight requirements map to well-documented patterns from upstream research. The critical non-negotiable dependency chain is: slug guard + plist writer + supervisor must land first (Wave 1), then four adapters can land in parallel (Wave 2), then the registry swap (Wave 3), then the phase exit gate (Wave 4). Every adapter's `deploy()` returns a `Result` object; `healthCheck()` never throws; `runNow()` and `listRuns()` for Codex/Gemini spawn the supervisor non-blocking for Run-now and tail stdout logs respectively. The supervisor enforces SAFE-02 (`NO_COLOR=1 TERM=dumb CI=true` + perl-based ANSI strip) and SAFE-01-adjacent char-budget with `SIGTERM` via a background-streamed `wc -c` counter. Prompt text NEVER touches argv — supervisor reads `prompt.md` via `cat` and pipes to the CLI via stdin (Codex: `codex exec -` reads from stdin; Gemini: `gemini -p - --output-format json` same).

**Primary recommendation:** Four waves. Wave 1 ships `assertValidSlug` + `launchd-writer.ts` + supervisor in parallel (three independent foundations). Wave 2 ships four adapters in parallel (Claude Routines/Desktop have zero launchd dependency; Codex/Gemini depend on Wave 1). Wave 3 swaps the registry stubs. Wave 4 is the phase exit gate (typecheck + full Vitest suite + bash supervisor tests + manual smoke test report + v0.1 frozen-surface diff). Each adapter is ~80-120 TS lines; `launchd-writer.ts` is ~130 lines; supervisor is ~200 bash lines.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `assertValidSlug` throw-on-invalid guard | Domain Services (dashboard/lib) | — | Pure TS, guards all 5 identifier builders at function entry |
| Plist XML generation | Domain Services (dashboard/lib) | — | Pure TS string templating with explicit escape; no I/O |
| `launchctl bootstrap`/`bootout` shell-out | Domain Services | OS-registered state | Domain wraps the syscall via `execFile` with array args |
| `plutil -lint` validation gate | Domain Services | OS-registered state | Run before bootstrap; fail-fast on malformed XML |
| Bash supervisor PATH resolution, sleep-window gate, reversibility gate, char-budget gate, ANSI strip, audit JSONL emit | OS-level process supervisor | Database/Storage (audit.jsonl) | Bash script invoked by launchd; crosses the boundary between OS scheduling and Sleepwalker state |
| `claude-routines` adapter (`deploy` = handoff URL; `runNow` = wraps `fire-routine.ts`) | Domain Services | External service (Anthropic cloud) | Programmatic creation does not exist; browser handoff + existing `/fire` endpoint cover the capability |
| `claude-desktop` adapter (`deploy` = SKILL.md copy to `~/.claude/scheduled-tasks/`) | Domain Services | OS-level state (Desktop internal DB) | SKILL.md controls prompt; schedule lives in Desktop's internal state; browser handoff completes setup |
| `codex` / `gemini` adapters (plist gen → `plutil -lint` → `launchctl bootstrap`) | Domain Services | OS-registered state (launchd) | Thin composition of `launchd-writer` + supervisor absolute path + slug builders |
| `ADAPTERS` registry + `getAdapter` + `healthCheckAll` | Domain Services | — | Replaces Phase 1 stubs; `Record<Runtime, RuntimeAdapter>` shape unchanged |

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Slug Validation (resolves Phase 1 review debt)

**Locked:** Every builder in `slug.ts` gains `assertValidSlug(slug)` at the top of the function body. `toBundleDir("codex", "../x")` will throw before `path.join` runs. Adapters can never construct invalid identifiers.

**Why:** Phase 1 review (Gemini + Codex consensus) flagged that builders accepting raw strings makes ADPT-02 "primitive only," not enforcement. Phase 2 adapters are the first real consumers — fixing it here means adapters are the first callers with the guarantee. Stronger than documentation, simpler than a branded `Slug` type.

**Implementation:**
```ts
// slug.ts — amended in Phase 2 Wave 1
function assertValidSlug(slug: string): asserts slug is string {
  if (!validateSlug(slug)) {
    throw new Error(`Invalid slug: ${JSON.stringify(slug)}. Must match ${SLUG_REGEX}`);
  }
}

export function toBundleDir(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);
  // ...
}
// Same pattern in toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath
```

Existing `slug.test.ts` gets additional `it()` blocks for invalid-input throws on each builder.

#### v0.1 Bundle Reading (resolves Phase 1 review debt)

**Locked:** `dashboard/lib/bundles.ts` uses **directory enumeration** to read v0.1 routines. `toBundleDir` is write-only for new v0.2 routines. **NOTE: `bundles.ts` is Phase 3 territory, not Phase 2** — Phase 2 only ships the `assertValidSlug` guard. Bundle reader comes with the editor.

#### Claude Desktop Deploy UX

**Locked:** Browser handoff. `claude-desktop.ts::deploy(bundle)` writes `SKILL.md` to `~/.claude/scheduled-tasks/<slug>/` and returns `{ok: true, handoffUrl: "claude://scheduled-tasks?slug=<slug>" }`. User clicks once in the dashboard to open Desktop's Schedule tab pre-filled.

**Why:** Conservative + inspectable + matches v0.1 cloud routine pattern. `claude -p "add scheduled task"` is undocumented behavior with a new failure mode. Phase 2 ships the safe path; if user demand surfaces, we can add CLI invocation as a fast-path in a v0.2.x patch.

**Research flag remains open** (per Phase 1 research SUMMARY.md): validate that writing SKILL.md alone + opening the Schedule page actually lets Desktop detect the new task. Phase 2 plan adds a synthetic "timestamp-writer" smoke test that the executor runs manually and reports back.

#### Auth-Conflict Behavior (warn but allow)

**Locked:** `healthCheck()` reports active auth mode as `{available: true, authMode: "subscription" | "env-key", warning: "..." | undefined}`. When conflict detected (both subscription login AND env var present), `warning` is set. Dashboard renders yellow badge + link to `docs/AUTHORING.md#auth-conflicts`. Deploy still allowed.

**Why:** User might legitimately want both modes on their machine (e.g., Codex subscription for personal, env key for CI). Blocking creates friction. Silent trust hides a real footgun (03:00 runs exceeding quota). Yellow badge + doc link is the right middle.

**Dashboard UI:** Green badge = available+no conflict. Yellow badge = available+warning (tooltip shows warning text + link). Grey badge = unavailable (tooltip shows `reason`). Same pattern for all 4 runtimes.

#### Supervisor Design (ADPT-04 specifics)

**Locked (already in research):**
- `bin/sleepwalker-run-cli` is bash, `set -euo pipefail`
- Resolves absolute CLI path via login shell: `/bin/zsh -l -c 'command -v codex'`
- Gates: sleep-window check, reversibility allowlist check, char-budget SIGTERM on exceed
- Environment: `NO_COLOR=1 TERM=dumb CI=true`
- Output: strips ANSI via `perl -pe 's/\e\[[0-9;]*m//g'` (no Node dependency in bash); writes to `~/.sleepwalker/audit.jsonl` with normalized schema
- Prompt routing: reads `prompt.md` from bundle dir via `cat`, pipes to CLI via stdin (Codex `exec -`, Gemini `-p -`)

**Newly locked (Phase 2 CONTEXT discussion):**
- Supervisor emits a `started` event AND a terminal `completed`/`failed`/`budget_exceeded` event in audit.jsonl per run
- On SIGTERM due to budget, supervisor writes a `budget_exceeded` event with `chars_consumed`, `chars_limit`, `partial_output_bytes` fields before exiting

#### Adapter Test Strategy

**Locked:**
- All adapter tests mock `execFile` / `spawn` / `fs` via Vitest `vi.mock()`
- No real `launchctl` calls in unit tests
- `launchd-writer.test.ts` validates plist XML shape with snapshot
- Each adapter's `deploy.test.ts` asserts the exact `execFile` invocations (`launchctl bootstrap`, `launchctl bootout`) and file writes
- Phase 2 ships ONE manual smoke test (`test/manual/codex-adapter-smoke.md`) the executor runs once on real Mac: plist install, launchctl boot, 1 cron fire, launchctl bootout. Result logged in the executor's SUMMARY.md, not CI.

### Claude's Discretion

- Exact TypeScript structure of each adapter module (composition vs. inline)
- How deep to type `DeployResult` success payloads per runtime (base type is fine; runtime-specific fields can be optional)
- Vitest describe/it nesting for adapter tests
- Whether `launchd-writer.ts` exports a single `writePlist(bundle): Promise<Result<void>>` function or separate `generatePlist` + `installPlist` — planner decides based on test ergonomics
- How to represent auth-conflict in `HealthStatus` type (add optional `warning?: string` field, or a richer `diagnostics: DiagnosticEntry[]`) — planner decides

### Deferred Ideas (OUT OF SCOPE)

- **Automated launchd smoke test in CI** — Real Mac integration testing requires a self-hosted runner. Phase 2 ships manual smoke test only; CI coverage deferred to a future phase or left OSS-community-driven.
- **Real tokenizer for char-budget** — Phase 2 stays with the v0.1 character/4 approximation. PROJECT.md explicitly marks a real tokenizer as out-of-scope anti-feature for v0.2.
- **Codex/Gemini rate-limit awareness in supervisor** — Supervisor does NOT parse CLI rate-limit responses or back off. If rate-limited, the run fails loudly in audit.jsonl and the user adjusts. Richer handling deferred.
- **Cross-runtime fan-out (one prompt → 4 runtimes)** — Explicitly out-of-scope per PROJECT.md.
- **Two-tier editor with Advanced/raw YAML mode** — Phase 3/6 concern, not Phase 2.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ADPT-03** | `launchd-writer.ts` produces a valid plist, installs via `launchctl bootstrap gui/$UID`, uninstalls via `launchctl bootout`, and validates with `plutil -lint` before bootstrap | §Launchd Writer (API + XML template) + §Common Pitfalls #1 #2 — hand-rolled template, `plutil -lint` runs before bootstrap, bootout is idempotent (absorbs exit codes) |
| **ADPT-04** | `bin/sleepwalker-run-cli` supervisor resolves absolute CLI path via login shell, enforces sleep-window + reversibility + char-budget gates, strips ANSI, and emits normalized `audit.jsonl` entries | §Supervisor Exact Bash Outline — full script shape with PATH resolution, gate ordering, streaming char-count budget via background pipe, perl ANSI strip, normalized audit schema |
| **ADPT-05** | Runtime adapter Claude Code Routines (`claude-routines.ts`) — `deploy()` returns `{handoffUrl}`; `runNow()` wraps `fire-routine.ts`; `healthCheck()` probes beta-header + `claude` CLI | §Adapter 1: claude-routines.ts — wraps existing v0.1 code; centralizes beta header constant (Pitfall #12); CLI probe via `claude --version` |
| **ADPT-06** | Runtime adapter Claude Code Desktop (`claude-desktop.ts`) — `deploy()` copies SKILL.md to `~/.claude/scheduled-tasks/<slug>/` and returns handoff URL for Desktop's Schedule page; `healthCheck()` probes for `~/.claude/` and Desktop binary | §Adapter 2: claude-desktop.ts — SKILL.md write + `claude://` deeplink return; manual smoke test validates Desktop picks up the file |
| **ADPT-07** | Runtime adapter Codex Pro (`codex.ts`) — `deploy()` writes `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` invoking the supervisor; `healthCheck()` probes `codex --version`, active auth mode, and absolute binary path | §Adapter 3: codex.ts — full flow documented; login-shell path resolution; `~/.codex/config.toml` auth parse; Pitfall #2 auth-collision warn |
| **ADPT-08** | Runtime adapter Gemini CLI Pro (`gemini.ts`) — `deploy()` writes plist with explicit `GOOGLE_CLOUD_PROJECT` env var invoking the supervisor; `healthCheck()` probes `gemini --version` + auth + quota project | §Adapter 4: gemini.ts — identical pattern to codex with env injection; Pitfall #3 quota-project warn |
| **ADPT-09** | `ADAPTERS` registry + `getAdapter(runtime)` + `healthCheckAll()` shipping in `dashboard/lib/runtime-adapters/index.ts`; every consumer uses registry lookups, never direct imports | §Registry Replacement — swap 4 `notImplemented()` calls with real adapter imports; `healthCheckAll()` already exists in Phase 1 |
| **SAFE-02** | Supervisor sets `NO_COLOR=1 TERM=dumb CI=true` and pipes stdout/stderr through `stripVTControlCharacters()` (Node 20 built-in) before any audit write | §Supervisor Exact Bash — env block in supervisor; perl ANSI strip in bash (not Node since supervisor is bash); Node path can use `util.stripVTControlCharacters` if a TS consumer reads raw audit lines |

</phase_requirements>

---

## Standard Stack

### Core (no new installs — Phase 2 works with v0.1 + Phase 1 dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-ins (`node:child_process`, `node:fs/promises`, `node:path`, `node:os`, `node:util`) | Node 22+ | `execFile` for `launchctl`/`plutil`/`codex --version`; `fs.writeFile` for plist; `path.join` for paths; `os.homedir()` for `$HOME`; `util.stripVTControlCharacters` for ANSI strip in TS code | Already the v0.1 import style [VERIFIED: `dashboard/lib/queue.ts` line 1]; `stripVTControlCharacters` confirmed present `typeof === "function"` on Node v25.6.1 [VERIFIED: live `node -e` probe 2026-04-18] |
| TypeScript | 5.7.2 | Strict-mode type checking | Already the v0.1 typecheck surface [VERIFIED: `dashboard/package.json`] |
| Vitest | 2.1.8 | Unit test runner for adapter tests | Already wired; 56/56 tests green post-Phase 1 [VERIFIED: STATE.md metrics] |
| Bash + jq + perl | macOS stock | Supervisor language + JSON emission + ANSI stripping via regex | bash + jq already required by v0.1 hooks; perl is macOS built-in at `/usr/bin/perl` [VERIFIED: `which perl` returns `/usr/bin/perl`] |

### Supporting (confirmed present on dev machine; required at runtime)

| Binary | Purpose | When Required | Probe |
|--------|---------|---------------|-------|
| `launchctl` | `bootstrap gui/$UID <plist>` / `bootout gui/$UID <plist>` | Codex/Gemini deploy & undeploy | `which launchctl` → `/bin/launchctl` [VERIFIED] |
| `plutil` | `-lint <plist>` validation gate before bootstrap | Codex/Gemini deploy | `which plutil` → `/usr/bin/plutil` [VERIFIED] |
| `codex` | Probe for healthCheck; invoked by supervisor | healthCheck + schedule trigger | `/opt/homebrew/bin/codex` (codex-cli 0.118.0 installed) [VERIFIED: `codex --version`] — note slight version skew from STACK.md's 0.121.0 reference (6 minor versions back). `exec --json` contract stable across minor versions per STACK.md. |
| `gemini` | Probe for healthCheck; invoked by supervisor | healthCheck + schedule trigger | `/opt/homebrew/bin/gemini` (v0.31.0 installed) [VERIFIED: `gemini --version`] — older than STACK.md's 0.38.2 reference; `-p` + `--output-format json` flags verified present via `gemini --help` |
| `claude` | Probe for claude-routines + claude-desktop healthCheck | healthCheck only (schedule trigger is browser handoff) | `/Users/rahulmehta/.local/bin/claude` [VERIFIED: `/bin/zsh -l -c 'command -v claude'`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled plist XML template | `plist` npm package (3.1.0) | Adds a dep for ~100 lines of trivial XML generation; plist format is stable since macOS 10.4; hand-rolled matches v0.1 bash-native ethos. Decision: hand-roll. [CITED: research/STACK.md §launchd Wiring + research/ARCHITECTURE.md §Layer 4 "Anti-Pattern 5"] |
| `execa` for shell-outs | Node built-in `child_process.execFile` (promisified) | `execa` is preferred long-term per STACK.md line 39, but Phase 2 can ship with `child_process.execFile` since the invocations are simple (array args, no shell), no additional timeouts needed beyond Node defaults, and adding a dep slows down Wave 1. Decision: Phase 2 uses `child_process.execFile` via `util.promisify`. `execa` introduction is deferred to Phase 3/4 when more complex streaming is needed. [ASSUMED: planner may choose execa instead — either works, but keeping deps flat is simpler] |
| Separate `generatePlist` + `installPlist` functions | Single `writePlist(opts)` that does both | Separation tests better (snapshot the XML without touching fs) and allows dry-run mode. Recommendation: split. See §Launchd Writer API. |
| `launchctl load -w` / `launchctl unload` | `launchctl bootstrap gui/$UID <plist>` / `launchctl bootout gui/$UID <plist>` | `load`/`unload` are legacy subcommands; Apple is moving tooling off them (Homebrew already switched). `bootstrap`/`bootout` require explicit domain target (`gui/<uid>`). Decision: use bootstrap/bootout. [CITED: research/STACK.md §launchd Wiring line 54] |

**Installation:** None. All Phase 2 code uses Node 22 built-ins + existing v0.1/Phase 1 dependencies. No `pnpm install` required.

**Version verification (performed 2026-04-18):**
- `codex-cli 0.118.0` — installed via Homebrew at `/opt/homebrew/bin/codex` (live probe). Slightly older than STACK.md's reference of `0.121.0`; `codex exec --help` confirms `--json` flag, `-` stdin token, and `exec` subcommand all present.
- `gemini 0.31.0` — installed via Homebrew at `/opt/homebrew/bin/gemini` (live probe). Older than STACK.md's `0.38.2` reference; `gemini --help` confirms `-p/--prompt` flag, `--output-format json|stream-json`, `--yolo`/`--approval-mode yolo`, `--include-directories` all present.
- `claude` — installed at `/Users/rahulmehta/.local/bin/claude` (non-standard path — supervisor PATH resolution via login shell is essential; Pitfall #1 directly applies).

---

## Architecture Patterns

### System Architecture Diagram

```
                     Phase 2 Adapters: Data Flow
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  Dashboard / Server Action (Phase 3 consumer; not in Phase 2 scope)    │
│     │                                                                  │
│     │ adapter = getAdapter(bundle.runtime)                             │
│     │ await adapter.deploy(bundle)                                     │
│     ▼                                                                  │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │  dashboard/lib/runtime-adapters/index.ts                      │     │
│  │  ADAPTERS: Record<Runtime, RuntimeAdapter>                    │     │
│  └─────┬──────────┬──────────────┬────────────┬─────────────────┘      │
│        │          │              │            │                        │
│        ▼          ▼              ▼            ▼                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ claude-  │ │ claude-  │ │ codex.ts │ │ gemini.ts│                   │
│  │ routines │ │ desktop  │ │ (plist   │ │ (plist   │                   │
│  │ (fire +  │ │ (SKILL + │ │ via lw)  │ │ via lw)  │                   │
│  │ handoff) │ │ handoff) │ │          │ │          │                   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘                   │
│       │            │            │            │                         │
│       │            │            ▼            ▼                         │
│       │            │     ┌────────────────────────────┐                │
│       │            │     │ dashboard/lib/runtime-     │                │
│       │            │     │ adapters/launchd-writer.ts │                │
│       │            │     │  - generatePlist(opts)     │                │
│       │            │     │  - installPlist(job)       │                │
│       │            │     │  - uninstallPlist(label)   │                │
│       │            │     │  - plutil -lint gate       │                │
│       │            │     └──────────┬─────────────────┘                │
│       │            │                │                                  │
│       │            │                ▼ writes plist                     │
│       │            │     ┌────────────────────────────┐                │
│       │            │     │ ~/Library/LaunchAgents/    │                │
│       │            │     │   com.sleepwalker.<rt>.<slug>.plist         │
│       │            │     │   ProgramArguments=[                        │
│       │            │     │     <abs path to sleepwalker-run-cli>,      │
│       │            │     │     <runtime>, <slug>                       │
│       │            │     │   ]                                         │
│       │            │     │   EnvironmentVariables.PATH=...             │
│       │            │     │   StandardOutPath, StandardErrorPath        │
│       │            │     └──────────┬─────────────────┘                │
│       │            │                │                                  │
│       │            │                ▼ launchd fires at cron            │
│       │            │     ┌────────────────────────────┐                │
│       │            │     │ bin/sleepwalker-run-cli    │                │
│       │            │     │  1. set -euo pipefail      │                │
│       │            │     │  2. login-shell PATH       │                │
│       │            │     │  3. sleep-window gate      │                │
│       │            │     │  4. reversibility gate     │                │
│       │            │     │  5. cat prompt.md | CLI    │                │
│       │            │     │     (stdin; never argv)    │                │
│       │            │     │  6. perl ANSI strip        │                │
│       │            │     │  7. background char count  │                │
│       │            │     │     (SIGTERM on exceed)    │                │
│       │            │     │  8. audit.jsonl emit       │                │
│       │            │     │     (started/completed/    │                │
│       │            │     │      budget_exceeded)      │                │
│       │            │     └──────────┬─────────────────┘                │
│       │            │                │                                  │
│       │            │                ▼                                  │
│       │            │     ┌────────────────────────────┐                │
│       │            │     │ codex exec -        OR     │                │
│       │            │     │ gemini -p - --output...    │                │
│       │            │     └──────────┬─────────────────┘                │
│       │            │                │                                  │
│       ▼            ▼                ▼                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ ~/.sleepwalker/audit.jsonl (append-only, existing schema +     │    │
│  │  new runtime/fleet fields; Phase 5 adds flock)                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

Phase 2 writes: `launchd-writer.ts`, `claude-routines.ts`, `claude-desktop.ts`, `codex.ts`, `gemini.ts`, `bin/sleepwalker-run-cli`. Phase 2 amends: `slug.ts` (add `assertValidSlug`), `index.ts` (swap stubs → real imports). Phase 2 does NOT touch: any other `dashboard/lib/*`, any `dashboard/app/*`, any `hooks/*`, `install.sh`, `routines-local/*`, `routines-cloud/*`, `bin/sleepwalker-execute`.

### Pattern 1: Launchd Writer API (ADPT-03)

**Recommendation: split `launchd-writer.ts` into three exports** — `generatePlist(opts)` (pure string generation), `installPlist(job)` (fs write + plutil-lint + bootstrap), `uninstallPlist(label)` (bootout + fs unlink). Rationale: `generatePlist` is snapshot-testable without touching fs; `installPlist` can unit-test with `execFile` mock; `uninstallPlist` matches existing v0.1 cleanup patterns.

**Full API shape:**

```ts
// dashboard/lib/runtime-adapters/launchd-writer.ts

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type LaunchdSchedule =
  | { kind: "calendar"; minute?: number; hour?: number; day?: number; weekday?: number; month?: number }
  | { kind: "calendar-array"; entries: Array<{ minute?: number; hour?: number; weekday?: number }> }
  | { kind: "interval"; seconds: number };

export interface LaunchdJob {
  label: string;                        // "com.sleepwalker.codex.morning-brief"
  programArguments: string[];           // ["/abs/path/bin/sleepwalker-run-cli", "codex", "morning-brief"]
  schedule: LaunchdSchedule;
  stdoutPath: string;                   // "$HOME/.sleepwalker/logs/com.sleepwalker.codex.morning-brief.out"
  stderrPath: string;                   // "$HOME/.sleepwalker/logs/com.sleepwalker.codex.morning-brief.err"
  workingDirectory?: string;            // absolute bundle path (codex uses this for --cd semantics)
  environmentVariables?: Record<string, string>; // PATH + HOME + USER + runtime-specific (GOOGLE_CLOUD_PROJECT)
  runAtLoad?: boolean;                  // default false (we want scheduled only, not at-load)
  throttleInterval?: number;            // default 300 seconds — prevents crash-loop respawn storms
}

/** Pure string generation. No I/O. Easy to snapshot-test. */
export function generatePlist(job: LaunchdJob): string { /* XML template */ }

/** Result type mirrors v0.1 convention (see dashboard/lib/fire-routine.ts). */
export interface InstallResult {
  ok: boolean;
  plistPath?: string;
  error?: string;
  /** plutil -lint output on validation failure, for diagnostics */
  lintOutput?: string;
}

/**
 * Write plist → plutil -lint → launchctl bootout (idempotent) → launchctl bootstrap.
 * Returns {ok: false, error, lintOutput?} on any step failure (never throws).
 */
export async function installPlist(job: LaunchdJob): Promise<InstallResult> { /* ... */ }

/**
 * launchctl bootout (idempotent; ignore "not loaded" error) → unlink plist.
 * Returns {ok: true} even if plist did not exist (idempotent undeploy).
 */
export async function uninstallPlist(label: string): Promise<InstallResult> { /* ... */ }
```

**Validation order (critical):** `plutil -lint` MUST run **BEFORE** `launchctl bootstrap`. If plist is malformed, bootstrap produces a cryptic xpcproxy error (EX_CONFIG 78 per Pitfall doc) that's hard to diagnose. `plutil -lint <path>` exits 0 on valid or prints error-path+line on invalid.

**Bootstrap/bootout idempotency pattern:**

```ts
// Inside installPlist(), after plutil -lint passes:
await fs.writeFile(plistPath, xml, { mode: 0o644 });
// Bootout first (ignore "not loaded" failures) so we can re-bootstrap:
await execFileP("launchctl", ["bootout", `gui/${process.getuid!()}`, plistPath]).catch(() => {});
// Now bootstrap; this WILL throw if bootstrap fails (caller catches via try/catch wrapper):
try {
  await execFileP("launchctl", ["bootstrap", `gui/${process.getuid!()}`, plistPath]);
  return { ok: true, plistPath };
} catch (e) {
  // Rollback: delete the plist we just wrote (state machine "writing" rollback pattern)
  await fs.unlink(plistPath).catch(() => {});
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}
```

**Canonical plist XML template (verbatim):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{ESC(label)}</string>
  <key>ProgramArguments</key><array>
{PROGRAM_ARGS_EACH_AS_STRING_LINE}
  </array>
  {SCHEDULE_XML}
  <key>StandardOutPath</key><string>{ESC(stdoutPath)}</string>
  <key>StandardErrorPath</key><string>{ESC(stderrPath)}</string>
  {WORKING_DIRECTORY_XML}
  {ENV_VARS_XML}
  {RUN_AT_LOAD_XML}
  {THROTTLE_INTERVAL_XML}
</dict>
</plist>
```

Where `ESC(s)` escapes `&`, `<`, `>`, `"`, `'` (5-char XML escape set). `SCHEDULE_XML` for calendar:

```xml
<key>StartCalendarInterval</key><dict>
  <key>Minute</key><integer>0</integer>
  <key>Hour</key><integer>6</integer>
</dict>
```

Or for interval: `<key>StartInterval</key><integer>3600</integer>`. Or for calendar-array (multi-time schedules): `<key>StartCalendarInterval</key><array><dict>...</dict><dict>...</dict></array>`. **Verified** against `.planning/research/STACK.md §Canonical plist shape` and Apple's launchd.plist(5) man page.

**Example `ProgramArguments` for Codex:**

```xml
<key>ProgramArguments</key><array>
  <string>/Users/rahul/Desktop/Projects/sleepwalker/bin/sleepwalker-run-cli</string>
  <string>codex</string>
  <string>morning-brief</string>
</array>
```

**The user prompt NEVER appears in `ProgramArguments`.** It is read from `routines-codex/morning-brief/prompt.md` by the supervisor at runtime. Pitfall #4 is defeated by construction.

**Example `EnvironmentVariables` block:**

```xml
<key>EnvironmentVariables</key><dict>
  <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  <key>HOME</key><string>/Users/rahul</string>
  <key>USER</key><string>rahul</string>
  <key>NO_COLOR</key><string>1</string>
  <key>TERM</key><string>dumb</string>
  <key>CI</key><string>true</string>
  <!-- Gemini-only: -->
  <key>GOOGLE_CLOUD_PROJECT</key><string>{user-configured value from settings.json}</string>
</dict>
```

**Note on NO_COLOR/TERM/CI:** These MUST be set by the plist AND re-set by the supervisor (defense-in-depth). The plist sets them for the supervisor's env; the supervisor re-exports them to pass through to the CLI subprocess (Codex/Gemini may strip some inherited envs; re-exporting guarantees they propagate).

### Pattern 2: Supervisor Exact Bash Outline (ADPT-04 + SAFE-02)

**File:** `bin/sleepwalker-run-cli` (executable, +x). Invoked by launchd with `<absolute path> <runtime> <slug>` argv.

**Full script outline:**

```bash
#!/bin/bash
# Sleepwalker CLI supervisor.
# Wraps codex/gemini invocations with v0.1-equivalent safety semantics.
#
# USAGE (launchd invokes this form):
#   /abs/path/bin/sleepwalker-run-cli <runtime> <slug>
# Also usable from the dashboard "Run now" button (same signature).
#
# INVARIANTS:
#   - User prompt text NEVER touches argv or a shell-expanded string.
#   - stdin-only prompt routing (cat prompt.md | codex exec -).
#   - All audit writes pass through perl ANSI strip.
#   - Budget exceeded → SIGTERM + budget_exceeded event.

set -euo pipefail

# --- Inputs ---
RUNTIME="${1:-}"   # "codex" | "gemini"
SLUG="${2:-}"
[ -z "$RUNTIME" ] && { echo "usage: $0 <runtime> <slug>" >&2; exit 64; }
[ -z "$SLUG" ]    && { echo "usage: $0 <runtime> <slug>" >&2; exit 64; }

# --- Paths ---
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="${REPO_ROOT}/routines-${RUNTIME}/${SLUG}"
PROMPT_FILE="${BUNDLE_DIR}/prompt.md"
CONFIG_FILE="${BUNDLE_DIR}/config.json"
AUDIT_FILE="${HOME}/.sleepwalker/audit.jsonl"
SETTINGS_FILE="${HOME}/.sleepwalker/settings.json"
STATE_DIR="${HOME}/.sleepwalker"
FLEET="${RUNTIME}/${SLUG}"

mkdir -p "$STATE_DIR" "${STATE_DIR}/logs"
touch "$AUDIT_FILE"

# --- Safety envs (SAFE-02) ---
# plist sets these; re-export defensively
export NO_COLOR=1
export TERM=dumb
export CI=true

# --- Helpers ---
audit_emit() {
  # $1 = event name, $2 = extra JSON fragment (e.g. '"preview":"..."')
  local ts event extra
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
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

strip_ansi() {
  # Read from stdin, write to stdout with ANSI escape sequences removed.
  # Matches CSI (ESC[...), OSC (ESC]...), and simpler single-char escapes.
  perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g; s/\e\][^\a]*\a//g; s/\e[PX^_][^\e]*\e\\//g'
}

# --- Preflight: bundle exists? ---
if [ ! -f "$PROMPT_FILE" ]; then
  audit_emit "failed" "\"reason\":\"bundle not found\",\"bundle\":\"${BUNDLE_DIR}\""
  exit 66  # EX_NOINPUT
fi

# --- PATH resolution (login shell; Pitfall #1) ---
if ! command -v "$RUNTIME" >/dev/null 2>&1; then
  # Re-resolve via login shell in case launchd's inherited PATH is minimal
  CLI_ABS="$(/bin/zsh -l -c "command -v $RUNTIME" 2>/dev/null || true)"
  if [ -z "$CLI_ABS" ]; then
    # bash login-shell fallback
    CLI_ABS="$(/bin/bash -l -c "command -v $RUNTIME" 2>/dev/null || true)"
  fi
  if [ -z "$CLI_ABS" ]; then
    audit_emit "failed" "\"reason\":\"$RUNTIME not found on PATH\""
    exit 127
  fi
else
  CLI_ABS="$(command -v "$RUNTIME")"
fi

# --- Sleep window gate ---
HOUR=$(date +%H | sed 's/^0//'); HOUR=${HOUR:-0}
SLEEP_START=$(jq -r '.sleep_window.start_hour // 23' "$SETTINGS_FILE" 2>/dev/null || echo 23)
SLEEP_END=$(jq -r '.sleep_window.end_hour // 7'     "$SETTINGS_FILE" 2>/dev/null || echo 7)
if [ "$SLEEP_START" -gt "$SLEEP_END" ]; then
  if [ "$HOUR" -ge "$SLEEP_START" ] || [ "$HOUR" -lt "$SLEEP_END" ]; then IN_SLEEP=1; else IN_SLEEP=0; fi
else
  if [ "$HOUR" -ge "$SLEEP_START" ] && [ "$HOUR" -lt "$SLEEP_END" ]; then IN_SLEEP=1; else IN_SLEEP=0; fi
fi
if [ "$IN_SLEEP" -eq 0 ] && [ "${SLEEPWALKER_MODE:-auto}" != "overnight" ]; then
  audit_emit "deferred" "\"reason\":\"outside sleep window\",\"hour\":$HOUR"
  exit 0
fi

# --- Reversibility/policy gate ---
REVERSIBILITY=$(jq -r '.reversibility // "yellow"' "$CONFIG_FILE" 2>/dev/null || echo "yellow")
POLICY=$(jq -r --arg f "$FLEET" '.policies[$f] // "balanced"' "$SETTINGS_FILE" 2>/dev/null || echo "balanced")
DECISION="allow"
if [ "$POLICY" = "strict" ]   && [ "$REVERSIBILITY" != "green" ]; then DECISION="defer"; fi
if [ "$POLICY" = "balanced" ] && [ "$REVERSIBILITY" = "red" ];   then DECISION="defer"; fi
if [ "$DECISION" = "defer" ]; then
  audit_emit "deferred" "\"reason\":\"policy $POLICY blocks $REVERSIBILITY\""
  exit 0
fi

# --- Char budget ---
BUDGET=$(jq -r '.budget // 40000' "$CONFIG_FILE" 2>/dev/null || echo 40000)

# --- Emit started event ---
audit_emit "started" "\"cli\":\"$CLI_ABS\",\"budget\":$BUDGET"

# --- Invoke CLI with stdin-piped prompt, streaming through ANSI strip + budget counter ---
# Build per-runtime argv (no user text in argv)
case "$RUNTIME" in
  codex)
    CLI_ARGS=(exec - --json)
    ;;
  gemini)
    CLI_ARGS=(-p - --output-format json --yolo)
    ;;
  *)
    audit_emit "failed" "\"reason\":\"unknown runtime $RUNTIME\""
    exit 64
    ;;
esac

# Capture output to a temp file, with a background char-counter that SIGTERMs on exceed.
OUTPUT_FILE="$(mktemp -t sleepwalker-run-cli.XXXXXX)"
trap 'rm -f "$OUTPUT_FILE"' EXIT

# Run CLI with stdin = prompt, stdout+stderr → strip_ansi → tee OUTPUT_FILE.
# Use a named pipe so we can background-watch the size.
set +e
cat "$PROMPT_FILE" | "$CLI_ABS" "${CLI_ARGS[@]}" 2>&1 | strip_ansi | tee "$OUTPUT_FILE" >/dev/null &
CLI_PID=$!

# Background budget monitor
(
  while kill -0 "$CLI_PID" 2>/dev/null; do
    sleep 1
    SIZE=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt "$BUDGET" ]; then
      kill -TERM "$CLI_PID" 2>/dev/null || true
      sleep 2
      kill -KILL "$CLI_PID" 2>/dev/null || true
      break
    fi
  done
) &
WATCHDOG_PID=$!

wait "$CLI_PID"
CLI_EXIT=$?
kill "$WATCHDOG_PID" 2>/dev/null || true
set -e

FINAL_SIZE=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)

# --- Emit terminal event ---
if [ "$FINAL_SIZE" -gt "$BUDGET" ] && [ "$CLI_EXIT" -ne 0 ]; then
  PARTIAL_PREVIEW=$(head -c 500 "$OUTPUT_FILE" | jq -Rs .)
  audit_emit "budget_exceeded" "\"chars_consumed\":$FINAL_SIZE,\"chars_limit\":$BUDGET,\"partial_output_bytes\":$FINAL_SIZE,\"preview\":$PARTIAL_PREVIEW,\"exit_code\":$CLI_EXIT"
  exit 0
fi
if [ "$CLI_EXIT" -eq 0 ]; then
  PREVIEW=$(head -c 500 "$OUTPUT_FILE" | jq -Rs .)
  audit_emit "completed" "\"chars_consumed\":$FINAL_SIZE,\"preview\":$PREVIEW,\"exit_code\":0"
else
  PREVIEW=$(head -c 500 "$OUTPUT_FILE" | jq -Rs .)
  audit_emit "failed" "\"chars_consumed\":$FINAL_SIZE,\"preview\":$PREVIEW,\"exit_code\":$CLI_EXIT"
fi
exit 0
```

**Critical details:**

- **Login-shell PATH resolution fallback order:** try inherited PATH first (supervisor is invoked by launchd with explicit PATH env from plist), then `/bin/zsh -l -c 'command -v <bin>'`, then `/bin/bash -l -c` fallback. Most macOS users use zsh since 10.15; bash fallback handles the edge case. If both fail → `failed` audit event + exit 127.
- **Char-budget mechanism:** Output is tee'd to a temp file. A background subshell polls `wc -c` on that file every second. When size exceeds budget, SIGTERM the CLI pid (with SIGKILL follow-up 2s later). This gives approximate budget enforcement without buffering all stdout. The ±40% approximation documented in v0.1 CONCERNS.md carries forward — this is by design per PROJECT.md ("real tokenizer is out-of-scope").
- **ANSI stripping** — perl with 3 regex: `\e\[[0-9;?]*[a-zA-Z]` (CSI), `\e\][^\a]*\a` (OSC), `\e[PX^_][^\e]*\e\\` (DCS/PM/APC). This covers the color codes, title-bar updates, and cursor-motion escapes Codex/Gemini might emit. Tested pattern from Node's own `stripVTControlCharacters` implementation translated to perl regex.
- **Audit events contract:** exactly one `started` event per invocation + exactly one terminal event (`completed` | `failed` | `budget_exceeded` | `deferred`). `deferred` is also a terminal event emitted when sleep-window or policy gate blocks the run before invocation.
- **JSON-safe preview:** `head -c 500 file | jq -Rs .` → produces a valid JSON string literal (escapes quotes, newlines, etc.). No string interpolation into the audit line.
- **Prompt routing:** `cat "$PROMPT_FILE" | "$CLI_ABS" "${CLI_ARGS[@]}"`. The prompt file path IS constructed by bash but is trusted because the slug was validated at write time (Phase 3 editor) and the bundle path comes from `REPO_ROOT/routines-<runtime>/<slug>`. The PROMPT TEXT never enters argv.
- **Runtime argv contract (verified against live CLIs):**
  - Codex: `codex exec - --json` — `exec` = non-interactive, `-` = read prompt from stdin, `--json` = emit newline-delimited JSON events. [VERIFIED: `codex exec --help` 2026-04-18]
  - Gemini: `gemini -p - --output-format json --yolo` — `-p -` = headless mode with stdin prompt, `--output-format json` = single JSON result object, `--yolo` = auto-approve all tool calls (required for unattended overnight runs). [VERIFIED: `gemini --help` 2026-04-18]

### Pattern 3: `assertValidSlug` Injection into slug.ts

**Edit shape** (diff-minimal, one assertion function + 5 builder mutations):

```ts
// dashboard/lib/runtime-adapters/slug.ts — Wave 1 amendment

// ADD near top of file, below validateSlug:
/**
 * Throws if slug does not match SLUG_REGEX. Used internally by every
 * identifier builder to guarantee that adapters can never construct
 * invalid launchd labels, marker tags, branch prefixes, or paths.
 *
 * This is the Phase 2 resolution of Phase 1 review debt item #1.
 */
function assertValidSlug(slug: string): asserts slug is string {
  if (!validateSlug(slug)) {
    throw new Error(
      `Invalid slug: ${JSON.stringify(slug)}. Must match ^[a-z][a-z0-9-]{0,63}$`
    );
  }
}

// AMEND each of the 5 builders that take a slug argument:
export function toFleetKey(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW
  return `${runtime}/${slug}`;
}

export function toLaunchdLabel(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW
  return `com.sleepwalker.${runtime}.${slug}`;
}

export function toMarkerTag(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW
  return `[sleepwalker:${runtime}/${slug}]`;
}

export function toBranchPrefix(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW
  return `claude/sleepwalker/${runtime}/${slug}/`;
}

export function toPlistPath(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW (runtime is already typed)
  const home = process.env.HOME || os.homedir();
  return path.join(home, "Library", "LaunchAgents", `${toLaunchdLabel(runtime, slug)}.plist`);
}

export function toBundleDir(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);                                   // NEW — critical: prevents ../x traversal
  const dirName =
    runtime === "claude-desktop"    ? "routines-local"
    : runtime === "claude-routines" ? "routines-cloud"
    :                                 `routines-${runtime}`;
  return path.join(dirName, slug);
}

// NOTE: parseFleetKey() is not mutated. It already returns null for invalid
// input (does NOT throw) because parsing is used by audit readers that must
// be tolerant of legacy/partial data. This asymmetry is intentional:
// "construct → throw; parse → null" matches result-object conventions.
```

**`toPlistPath` double-call note:** `toPlistPath` calls `toLaunchdLabel`, which also calls `assertValidSlug`. The second call is a redundant no-op for valid slugs (cheap) and defense-in-depth for programmer bugs (someone adds a new caller of `toLaunchdLabel` that bypasses `toPlistPath`). Double-validation is not a bug.

**Test additions to `dashboard/tests/slug.test.ts` (expected Vitest diff):**

```ts
describe("builders reject invalid slugs", () => {
  it("toFleetKey throws on path traversal", () => {
    expect(() => toFleetKey("codex", "../etc/passwd")).toThrow(/Invalid slug/);
  });
  it("toLaunchdLabel throws on uppercase", () => {
    expect(() => toLaunchdLabel("codex", "Morning-Brief")).toThrow(/Invalid slug/);
  });
  it("toMarkerTag throws on leading underscore", () => {
    expect(() => toMarkerTag("claude-routines", "_test-zen")).toThrow(/Invalid slug/);
  });
  it("toBranchPrefix throws on empty string", () => {
    expect(() => toBranchPrefix("gemini", "")).toThrow(/Invalid slug/);
  });
  it("toPlistPath throws on leading digit", () => {
    expect(() => toPlistPath("codex", "1-bad")).toThrow(/Invalid slug/);
  });
  it("toBundleDir throws on path traversal", () => {
    expect(() => toBundleDir("codex", "../x")).toThrow(/Invalid slug/);
  });
  it("parseFleetKey returns null (does NOT throw) for invalid input", () => {
    expect(parseFleetKey("codex/../x")).toBeNull();
    expect(parseFleetKey("codex/_bad")).toBeNull();
  });
});
```

Existing 13 `it()` blocks (56/56 tests) remain passing. Net delta: +7 `it()` blocks, ~7 additional `expect().toThrow()` assertions. Resulting suite size: ~70 tests green.

### Pattern 4: Adapter 1 — claude-routines.ts (ADPT-05)

**File size estimate:** ~100 lines. Wraps existing `dashboard/lib/fire-routine.ts`; adds `deploy()` returning handoff URL + `healthCheck()` probing `claude` CLI + beta-header constant.

**Shape:**

```ts
// dashboard/lib/runtime-adapters/claude-routines.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeAdapter, RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus } from "./types";
import { fireRoutine } from "../fire-routine";
import { toFleetKey } from "./slug";

const execFileP = promisify(execFile);

// Centralized beta header (Pitfall #12).
// fire-routine.ts already owns the canonical string; re-export for tests to assert on.
export const CC_ROUTINE_BETA = "experimental-cc-routine-2026-04-01";

export const claudeRoutinesAdapter: RuntimeAdapter = {
  runtime: "claude-routines",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    // Anthropic does NOT expose programmatic Routine creation.
    // Return a handoff URL to the /schedule create deeplink that pre-fills the form.
    // This matches v0.1 cloud routine setup UX.
    const slug = bundle.slug;
    const prompt = encodeURIComponent(bundle.prompt);
    const name = encodeURIComponent(bundle.name);
    // Current canonical deeplink (verify at planning time; STACK.md references this format):
    const handoffUrl = `https://claude.ai/code/routines/new?name=${name}&prompt=${prompt}&cadence=${encodeURIComponent(bundle.schedule ?? "")}`;
    return { ok: true, handoffUrl, artifact: `browser-handoff:${slug}` };
  },

  async undeploy(_bundle: RoutineBundle): Promise<DeployResult> {
    // Claude Routines must be deleted in the web UI; no programmatic delete.
    return {
      ok: true,
      handoffUrl: `https://claude.ai/code/routines`,
      artifact: "browser-handoff-undeploy",
    };
  },

  async runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult> {
    // Wraps existing v0.1 /fire endpoint. Needs a routine ID + cloud credential
    // configured via v0.1 settings. For Phase 2: pass slug as routine ID; if that
    // doesn't resolve to a credential, return {ok: false, error: "no-credentials-configured"}.
    const res = await fireRoutine(bundle.slug, context);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, runId: res.sessionId, watchUrl: res.sessionUrl };
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // Cloud runs are surfaced via GitHub PR polling (v0.1 cloud-cache.ts),
    // not per-routine listing. Return [] for now; Phase 5 may wire this.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    // Probe: `claude --version` via login shell. If fail → available=false.
    try {
      const { stdout } = await execFileP("/bin/zsh", ["-l", "-c", "claude --version"]);
      return {
        runtime: "claude-routines",
        available: true,
        version: stdout.trim(),
      };
    } catch {
      return {
        runtime: "claude-routines",
        available: false,
        reason: "claude CLI not found on login-shell PATH; see docs/AUTHORING.md",
      };
    }
  },
};
```

**File size: ~85 lines including docblocks.**

### Pattern 5: Adapter 2 — claude-desktop.ts (ADPT-06)

**File size estimate:** ~80 lines. Writes SKILL.md to `~/.claude/scheduled-tasks/<slug>/`, returns browser handoff URL; `healthCheck()` probes `~/.claude/` dir + `claude` CLI presence.

**Shape:**

```ts
// dashboard/lib/runtime-adapters/claude-desktop.ts
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeAdapter, RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus } from "./types";

const execFileP = promisify(execFile);

function scheduledTasksDir(): string {
  return path.join(os.homedir(), ".claude", "scheduled-tasks");
}

function bundleScheduledPath(slug: string): string {
  return path.join(scheduledTasksDir(), slug);
}

export const claudeDesktopAdapter: RuntimeAdapter = {
  runtime: "claude-desktop",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const targetDir = bundleScheduledPath(bundle.slug);
      await fs.mkdir(targetDir, { recursive: true });
      // Write SKILL.md (prompt body includes marker tag + frontmatter from bundle).
      // Phase 3 editor writes to routines-local/<slug>/SKILL.md; this adapter
      // COPIES that to ~/.claude/scheduled-tasks/<slug>/SKILL.md for Desktop to pick up.
      const skillPath = path.join(targetDir, "SKILL.md");
      await fs.writeFile(skillPath, bundle.prompt, { mode: 0o644 });
      return {
        ok: true,
        artifact: skillPath,
        // Claude Desktop deeplink — user clicks, Desktop opens Schedule page,
        // user sets frequency. Research flag: verify Desktop picks up the file
        // via manual smoke test (Phase 2 deliverable).
        handoffUrl: `claude://scheduled-tasks?slug=${encodeURIComponent(bundle.slug)}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async undeploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const targetDir = bundleScheduledPath(bundle.slug);
      await fs.rm(targetDir, { recursive: true, force: true });
      return { ok: true, artifact: targetDir };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult> {
    // For claude-desktop: shell out to `claude -p <prompt>` non-interactively.
    // The prompt goes via argv here (single string) — OK because claude owns
    // the process and there is no shell interpolation (execFile array args).
    try {
      const args = ["-p", bundle.prompt + (context ? `\n\n<context>\n${context}\n</context>` : "")];
      const { stdout } = await execFileP("claude", args);
      return { ok: true, runId: `claude-desktop:${bundle.slug}:${Date.now()}`, watchUrl: undefined };
      void stdout; // discard; audit is separate
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // v0.1 audit.jsonl for claude-desktop is read via existing audit.ts; no per-adapter listing.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    try {
      const home = os.homedir();
      const dotClaudeExists = await fs.stat(path.join(home, ".claude")).then(() => true).catch(() => false);
      if (!dotClaudeExists) {
        return { runtime: "claude-desktop", available: false, reason: "~/.claude/ not found; is Claude Desktop installed?" };
      }
      const { stdout } = await execFileP("/bin/zsh", ["-l", "-c", "claude --version"]);
      return { runtime: "claude-desktop", available: true, version: stdout.trim() };
    } catch {
      return { runtime: "claude-desktop", available: false, reason: "claude CLI not found; see docs/AUTHORING.md" };
    }
  },
};
```

**File size: ~85 lines.**

### Pattern 6: Adapter 3 — codex.ts (ADPT-07)

**File size estimate:** ~120 lines. Full launchd deploy flow: assertValidSlug (via builders) → resolve absolute `codex` path via login shell → generate plist → plutil-lint → bootstrap → Result. healthCheck probes `codex --version` + `~/.codex/config.toml` + `OPENAI_API_KEY` env for auth mode.

**Shape:**

```ts
// dashboard/lib/runtime-adapters/codex.ts
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeAdapter, RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus } from "./types";
import { toLaunchdLabel, toPlistPath } from "./slug";
import { generatePlist, installPlist, uninstallPlist, type LaunchdJob, type LaunchdSchedule } from "./launchd-writer";

const execFileP = promisify(execFile);

// Absolute path to bin/sleepwalker-run-cli. Computed once; repo layout is stable.
function supervisorPath(): string {
  // __dirname from dashboard/lib/runtime-adapters → ../../.. is repo root, then bin/sleepwalker-run-cli.
  // In Next.js server runtime this resolves correctly because Server Actions run server-side.
  return path.resolve(__dirname, "..", "..", "..", "bin", "sleepwalker-run-cli");
}

async function resolveCodexPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-l", "-c", "command -v codex"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseCron(cron: string | null): LaunchdSchedule {
  // Phase 2 scope: support single-time cron-5 conversion to StartCalendarInterval.
  // Fallback: interval 86400 (daily) if cron unparseable.
  // Full cron→calendar-array expansion is a Phase 3 editor concern; adapter accepts
  // whatever the bundle provides.
  if (!cron) return { kind: "interval", seconds: 86400 };
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return { kind: "interval", seconds: 86400 };
  // parts = [minute, hour, day, month, weekday]
  const num = (s: string) => (s === "*" ? undefined : parseInt(s, 10));
  return {
    kind: "calendar",
    minute: num(parts[0]),
    hour: num(parts[1]),
    day: num(parts[2]),
    month: num(parts[3]),
    weekday: num(parts[4]),
  };
}

export const codexAdapter: RuntimeAdapter = {
  runtime: "codex",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const codexAbs = await resolveCodexPath();
      if (!codexAbs) return { ok: false, error: "codex CLI not found on login-shell PATH" };

      const label = toLaunchdLabel("codex", bundle.slug);  // throws if slug invalid
      const plistPath = toPlistPath("codex", bundle.slug);
      const home = os.homedir();
      const logsDir = path.join(home, ".sleepwalker", "logs");
      await fs.mkdir(logsDir, { recursive: true });

      const job: LaunchdJob = {
        label,
        programArguments: [supervisorPath(), "codex", bundle.slug],
        schedule: parseCron(bundle.schedule),
        stdoutPath: path.join(logsDir, `${label}.out`),
        stderrPath: path.join(logsDir, `${label}.err`),
        workingDirectory: bundle.bundlePath,
        environmentVariables: {
          PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
          HOME: home,
          USER: os.userInfo().username,
          NO_COLOR: "1",
          TERM: "dumb",
          CI: "true",
        },
        runAtLoad: false,
        throttleInterval: 300,
      };

      const result = await installPlist(job);
      return result.ok
        ? { ok: true, artifact: result.plistPath }
        : { ok: false, error: result.error, artifact: result.lintOutput };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async undeploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const label = toLaunchdLabel("codex", bundle.slug);
      const result = await uninstallPlist(label);
      return result.ok ? { ok: true, artifact: label } : { ok: false, error: result.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async runNow(bundle: RoutineBundle, _context?: string): Promise<RunNowResult> {
    // Spawn supervisor non-blocking. Run-now is async; queue entry appears in Morning Queue.
    try {
      const supervisor = supervisorPath();
      const child = execFile(supervisor, ["codex", bundle.slug], { detached: true, stdio: "ignore" });
      child.unref();
      return { ok: true, runId: `codex:${bundle.slug}:${Date.now()}`, watchUrl: undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listRuns(bundle: RoutineBundle, limit = 20): Promise<RunRecord[]> {
    // Tail ~/.sleepwalker/logs/com.sleepwalker.codex.<slug>.out
    // Phase 2 returns []; Phase 5 (Queue) wires this through audit.jsonl filter.
    void bundle; void limit;
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    const codexAbs = await resolveCodexPath();
    if (!codexAbs) {
      return { runtime: "codex", available: false, reason: "codex CLI not found on login-shell PATH" };
    }
    let version = "";
    try {
      const { stdout } = await execFileP(codexAbs, ["--version"]);
      version = stdout.trim();
    } catch {
      return { runtime: "codex", available: false, reason: `${codexAbs} --version failed` };
    }

    // Auth-conflict detection (Pitfall #2 warn-but-allow per CONTEXT.md):
    // Parse ~/.codex/config.toml for preferred_auth_method (best-effort text parse;
    // avoid adding @iarna/toml dep for a single config field).
    // Also check OPENAI_API_KEY env on the dashboard server (not the CLI's eventual env).
    let warning: string | undefined;
    try {
      const configPath = path.join(os.homedir(), ".codex", "config.toml");
      const configText = await fs.readFile(configPath, "utf8").catch(() => "");
      const hasAuthJson = await fs.stat(path.join(os.homedir(), ".codex", "auth.json")).then(() => true).catch(() => false);
      const envKey = !!process.env.OPENAI_API_KEY;
      const preferredMatch = configText.match(/preferred_auth_method\s*=\s*"([^"]+)"/);
      const preferred = preferredMatch?.[1];
      if (hasAuthJson && envKey && preferred !== "apikey") {
        warning = "OPENAI_API_KEY set but ~/.codex/auth.json present — Codex will use subscription login. To force API key, set preferred_auth_method = \"apikey\" in ~/.codex/config.toml.";
      }
    } catch { /* best-effort probe; absent files are fine */ }

    return {
      runtime: "codex",
      available: true,
      version,
      // Non-standard field; planner may extend HealthStatus with `warning?: string` (Claude's Discretion)
      reason: warning,
    };
  },
};
```

**File size: ~140 lines including docblocks and auth-conflict branch.**

**Note on `HealthStatus.warning`:** Phase 1 `HealthStatus` does NOT have a `warning` field — it has `reason?` (used for unavailable case). Planner must decide (Claude's Discretion per CONTEXT.md): (a) add `warning?: string` to `HealthStatus` as an optional field in a minor amendment to `types.ts`, OR (b) encode warnings into `reason` with a convention (e.g. `reason` prefixed with `"WARN: "` when `available=true`). **Recommendation:** option (a) — add `warning?: string` to `HealthStatus`. It's a strictly additive change (optional field), preserves the `reason`=reason-for-unavailable semantics, and makes the UI's "green/yellow/grey" badge logic cleaner. This is a small Phase 1 amendment that should be documented in the plan as "Phase 1 interface amended for auth-conflict warn channel."

### Pattern 7: Adapter 4 — gemini.ts (ADPT-08)

**File size estimate:** ~130 lines. Identical pattern to codex.ts with these differences:
- `resolveGeminiPath()` instead of `resolveCodexPath()`
- `EnvironmentVariables` block includes `GOOGLE_CLOUD_PROJECT` pulled from `settings.json` (field name TBD; recommend `gemini_quota_project` in `settings.json` under a new `runtime_config` key)
- `healthCheck()` probes `gemini --version` + detects auth via `~/.gemini/` presence + `GOOGLE_CLOUD_PROJECT` env + `GOOGLE_APPLICATION_CREDENTIALS` env conflict warning
- `supervisor` is called identically (`bin/sleepwalker-run-cli gemini <slug>`)

**Auth detection specifics for Gemini (research-backed):**
- `GOOGLE_APPLICATION_CREDENTIALS` env var set → service-account auth (enterprise); warn if combined with `GEMINI_API_KEY`
- `GEMINI_API_KEY` env var set → AI Studio API key auth
- `~/.gemini/` present (cached OAuth tokens) → Google sign-in auth
- `GOOGLE_CLOUD_PROJECT` MUST be set explicitly in the plist `EnvironmentVariables` block per Pitfall #3 — do NOT rely on `gcloud config get-value project` inheritance

**Conflict warning triggers:**
- `GOOGLE_APPLICATION_CREDENTIALS` AND `GEMINI_API_KEY` both set → "Service account and API key both configured; gemini will prefer service account. Unset one in ~/.sleepwalker/env/gemini.env if you want deterministic auth."
- `GOOGLE_CLOUD_PROJECT` not set in env AND settings.json gemini_quota_project is null → "No quota project configured; deploy blocked. Set `gemini_quota_project` in Settings before deploying."

**Structural: delete before write:**

Identical to codex.ts except the `EnvironmentVariables` block:

```ts
environmentVariables: {
  PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  HOME: home,
  USER: os.userInfo().username,
  NO_COLOR: "1",
  TERM: "dumb",
  CI: "true",
  GOOGLE_CLOUD_PROJECT: quotaProject,           // required; blocks deploy if unset
  ...(serviceAccountPath ? { GOOGLE_APPLICATION_CREDENTIALS: serviceAccountPath } : {}),
},
```

### Pattern 8: Registry Replacement (ADPT-09)

**Diff:** `dashboard/lib/runtime-adapters/index.ts` changes from the Phase 1 `notImplemented()` stubs to real adapter imports. `ADAPTERS: Record<Runtime, RuntimeAdapter>` shape does NOT change. `getAdapter()` and `healthCheckAll()` signatures do NOT change.

```ts
// dashboard/lib/runtime-adapters/index.ts — Wave 3 final

import type {
  RuntimeAdapter, Runtime, HealthStatus, RoutineBundle,
  DeployResult, RunNowResult, RunRecord,
} from "./types";
import { claudeRoutinesAdapter } from "./claude-routines";
import { claudeDesktopAdapter } from "./claude-desktop";
import { codexAdapter } from "./codex";
import { geminiAdapter } from "./gemini";

export const ADAPTERS: Record<Runtime, RuntimeAdapter> = {
  "claude-routines": claudeRoutinesAdapter,
  "claude-desktop":  claudeDesktopAdapter,
  "codex":           codexAdapter,
  "gemini":          geminiAdapter,
};

export function getAdapter(runtime: Runtime): RuntimeAdapter { return ADAPTERS[runtime]; }
export async function healthCheckAll(): Promise<HealthStatus[]> {
  return Promise.all(Object.values(ADAPTERS).map((a) => a.healthCheck()));
}

// Barrel re-exports preserved verbatim from Phase 1
export type {
  Runtime, RoutineBundle, RuntimeAdapter, HealthStatus,
  DeployResult, RunNowResult, RunRecord, Reversibility,
} from "./types";
```

**`notImplemented()` function is DELETED**, plus the 4 stub assignments. Net diff: ~20 lines removed, 4 imports added.

### Anti-Patterns to Avoid

- **User prompt in `ProgramArguments`** — defeats Pitfall #4 mitigation. Prompt always via `cat prompt.md | CLI`.
- **Reading prompts via launchd's `ProgramArguments[2]`** — Apple's `xpcproxy` truncates argv at ~512KB; large prompts corrupt silently.
- **`child_process.exec` (shell string)** — always use `execFile` with array args. Applies to both TS and bash (in bash: always double-quote variables; use `"${ARRAY[@]}"` not `$*`).
- **`launchctl load -w`** — deprecated; use `launchctl bootstrap gui/$UID <path>`.
- **Writing to `~/Library/LaunchAgents/` with mode 0600** — launchd rejects plists not world-readable. Use 0644 (secrets NEVER in plist; see Pitfall #11).
- **Skipping `plutil -lint`** — bootstrap's error messages are cryptic (`xpcproxy: EX_CONFIG (78)`); lint failure prints exact line number.
- **Forgetting to `bootout` before re-`bootstrap`** — second bootstrap silently no-ops if label already registered; routine never re-deploys. Always bootout (ignore exit) then bootstrap.
- **Re-implementing `fire-routine.ts` inside `claude-routines.ts`** — wrap, don't duplicate. The beta-header + bearer-token logic already exists and has 13 passing tests.
- **Centralized "runtime manager" singleton** — `ADAPTERS` as a Record literal is already the registry; don't wrap it in a class.
- **Adapter throws for adapter-level failures** — all methods MUST return `{ok: false, error}`. Only programmer bugs may throw.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape stripping in TS code | Custom regex | Node 22 `util.stripVTControlCharacters()` | Built-in since Node 20; exact coverage of CSI/OSC/DCS; no edge-case bugs. Confirmed present on dev machine (`typeof` check returns `"function"`). |
| Bash ANSI stripping | `sed 's/\e\[.*m//g'` (truncates nothing) | `perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g; s/\e\][^\a]*\a//g; s/\e[PX^_][^\e]*\e\\//g'` | 3 regex cover CSI + OSC + DCS escape classes. Perl is macOS built-in at `/usr/bin/perl`. |
| Cron→launchd conversion | Writing a cron parser in TS | Accept cron-5, break into 5 parts with `split(/\s+/)`, map to `{minute,hour,day,month,weekday}` | 10 lines vs dep. Fallback: if parse fails, use `interval: 86400` (daily). Phase 3 editor handles UX-side validation via `cronstrue`. |
| Plist XML escaping | Complex XML library | 5-char escape function: `&` `<` `>` `"` `'` | Apple's plist DTD only requires these 5 escapes; no namespaces, no CDATA, no processing instructions. |
| Auth mode detection for Codex | Parsing full `~/.codex/config.toml` with a TOML library | Regex `/preferred_auth_method\s*=\s*"([^"]+)"/` on the file contents | One field, one regex. Adding a TOML parser dep is overkill. If the user has complex config, the regex still matches the single field we care about. |
| Launchd job listing | Parsing `launchctl list` output | `execFileP("launchctl", ["print", `gui/${uid}/${label}`])` per-label | `launchctl print` returns a documented structured block; `launchctl list` output format is unstable across macOS versions. |
| Process supervisor | Shipping a Node-based supervisor | Bash `bin/sleepwalker-run-cli` with existing hook patterns | Bash is zero-install, matches v0.1 ethos, `set -euo pipefail` is well-understood. A Node supervisor would require `node` on the plist PATH and add startup latency. |
| Secret encryption for auth files | Implementing keychain integration | Leave secrets in `~/.codex/auth.json` / `~/.gemini/` where the CLI put them | Each CLI owns its auth story. Sleepwalker does not touch these files. Phase 2 only probes their presence. |

**Key insight:** Phase 2 composes existing primitives. The temptation to "make it nice" (TOML library for config, pretty cron parser, Node-based supervisor) creates surface area without solving new problems. Every dep not added is a Rahul-isms-not-shipped risk for OSS users (Pitfall #13).

---

## Runtime State Inventory

Phase 2 is an additive feature phase — no rename or migration involved. `toBundleDir` path convention is already locked in Phase 1 and preserved. However, Phase 2 adds new runtime-registered state; the table below covers what NEW state appears and what cleanup mechanisms exist.

| Category | Items Introduced | Action Required |
|----------|------------------|------------------|
| **Stored data** | None — Phase 2 does not create new `~/.sleepwalker/*.jsonl` schemas. It writes the existing `audit.jsonl` with new `runtime` and `event` fields (additive). | None — additive-only extension to existing JSONL. |
| **Live service config** | None — Phase 2 does not touch Claude Routines web UI config or Desktop Scheduled Tasks state DB. `claude-desktop.deploy()` writes `SKILL.md`; the Desktop app reads it. `claude-routines.deploy()` returns a handoff URL; user completes setup in-browser. | None for adapter-level; planner notes that Phase 2 manual smoke test validates Desktop picks up SKILL.md. |
| **OS-registered state** | **NEW: launchd plists** at `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` and `com.sleepwalker.gemini.<slug>.plist` — one per deployed Codex/Gemini routine. `launchctl` registers these. | `uninstallPlist(label)` performs `launchctl bootout` + file unlink (idempotent). Phase 4 deploy state machine adds auto-rollback wrapper (Phase 2 scope is the primitive). |
| **Secrets / env vars** | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS` — NONE are written by Phase 2 code. Secrets stay in `~/.codex/auth.json` and `~/.gemini/` (CLI-owned). `GOOGLE_CLOUD_PROJECT` comes from `~/.sleepwalker/settings.json` (new field `runtime_config.gemini_quota_project`) injected into plist `EnvironmentVariables`. | None for secrets (untouched). For `GOOGLE_CLOUD_PROJECT`: settings.ts exposes a typed getter (Phase 3 concern to add UI); Phase 2 reads the value with a documented default + error path. |
| **Build artifacts / installed packages** | None — Phase 2 adds no `package.json` deps. The new `bin/sleepwalker-run-cli` script is tracked in git and executable (+x) directly. | `chmod +x bin/sleepwalker-run-cli` must run at merge time. Document in commit/PR description; `install.sh` is NOT updated (frozen per CONTEXT.md). |

**Nothing found in category "Stored data":** verified by reading `dashboard/lib/queue.ts`, `dashboard/lib/settings.ts`, `dashboard/lib/audit.ts` — none introduce new JSONL files in Phase 2.

---

## Common Pitfalls

### Pitfall 1: Launchd strips $PATH — CLI not found at 03:00

**What goes wrong:** Dashboard generates plist with implicit PATH. At 03:00 launchd invokes the supervisor with bare `/usr/bin:/bin` PATH, supervisor's `command -v codex` fails, routine silently dies with exit 127.

**Why it happens:** launchd does not source `.zshrc` / `.bash_profile` / `/opt/homebrew/bin/` is not inherited. Confirmed on dev machine: `claude` lives at `/Users/rahulmehta/.local/bin/claude` (non-standard); `codex`/`gemini` at `/opt/homebrew/bin/` (not in launchd default PATH).

**How to avoid:**
1. **Plist-side:** `EnvironmentVariables.PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"` explicitly.
2. **Supervisor-side:** defense-in-depth — resolve absolute path via `/bin/zsh -l -c 'command -v <bin>'` inside supervisor; if zsh fails, fallback to `/bin/bash -l -c`. If both fail → emit `failed` audit event with `reason: "<bin> not found on PATH"` and exit 127.
3. **Adapter `deploy()`-side:** resolve absolute `codex`/`gemini` path in TS via `execFile("/bin/zsh", ["-l", "-c", "command -v codex"])` and use the result as `ProgramArguments[0]` of the supervisor. Wait — correction: `ProgramArguments[0]` is the supervisor path, not the CLI path. The supervisor is responsible for resolving the CLI path at runtime. Adapter does NOT need to resolve CLI absolute path at deploy time; only the supervisor absolute path (which comes from `path.resolve(__dirname, "..", "..", "..", "bin", "sleepwalker-run-cli")`). This centralizes PATH handling in one place (the supervisor).

**Warning signs:**
- `~/.sleepwalker/audit.jsonl` contains `{"event":"failed","reason":"codex not found on PATH"}`
- `~/.sleepwalker/logs/com.sleepwalker.codex.<slug>.err` empty (supervisor exits before first write) OR contains `sleepwalker-run-cli: command not found` (in which case the PLIST `ProgramArguments[0]` itself was wrong — should be absolute)

### Pitfall 2: Plist 0644 but secrets in EnvironmentVariables

**What goes wrong:** Developer writes `OPENAI_API_KEY=sk-...` into plist `EnvironmentVariables` for "simplicity." Plist is mode 0644 (required by launchd), world-readable. Secret now in Time Machine backups, visible to `other` users in multi-user Mac, shows up in `grep sk- ~/Library/LaunchAgents/*.plist`.

**Why it happens:** It's the tempting one-line solution. Launchd MUST have the plist world-readable (0644) — it will refuse 0600.

**How to avoid:**
1. **Never write secret env vars into the plist.** Only non-secret envs: `PATH`, `HOME`, `USER`, `NO_COLOR`, `TERM`, `CI`, `GOOGLE_CLOUD_PROJECT` (quota project ID is not a secret — it's the billing-project name).
2. Let each CLI use its own auth mechanism: Codex reads `~/.codex/auth.json` (mode 0600 by default per Codex's own install), Gemini reads `~/.gemini/` tokens.
3. For deployment-specific env (e.g. per-routine `MY_CUSTOM_VAR`): source a `~/.sleepwalker/env/<slug>.env` file (mode 0600) inside the supervisor before invoking the CLI. The plist reference is a stable path, not a secret.
4. Add a `plutil -lint` + a value-scan step in `installPlist`: grep for strings matching `sk_live_`, `sk-ant-`, `ghp_`, `AIza`, 40-char hex, etc. If found, block install with error (belt-and-suspenders with Phase 3 editor's save-time scanner).

**Warning signs:**
- `grep -E 'sk_|sk-ant|ghp_|AIza|AKIA' ~/Library/LaunchAgents/com.sleepwalker.*.plist` returns matches.
- `stat ~/Library/LaunchAgents/com.sleepwalker.*.plist` shows mode other than 0644 (launchd would have refused to load).

### Pitfall 3: Gemini quota-project not set — burns wrong account's quota

**What goes wrong:** User has `gcloud` installed for day-job project. Supervisor invokes `gemini` without `GOOGLE_CLOUD_PROJECT` in plist env; Gemini picks up `gcloud config get-value project` (day-job) or `GOOGLE_APPLICATION_CREDENTIALS` (service account), burns quota against wrong project, run fails with cryptic "Quota exceeded."

**Why it happens:** Gemini's auth resolution order is not fully specified ([google-gemini/gemini-cli#12121](https://github.com/google-gemini/gemini-cli/issues/12121)). Explicit env var is the only way to bind the run to a known account.

**How to avoid:**
1. `gemini.ts` REQUIRES `GOOGLE_CLOUD_PROJECT` to be set in settings.json before `deploy()` is allowed. If missing → `{ok: false, error: "Gemini quota project not configured; see Settings"}`.
2. Plist `EnvironmentVariables` includes `GOOGLE_CLOUD_PROJECT=<value>` explicitly.
3. `healthCheck()` reports the quota project in `version` field: `"gemini 0.31.0 (quota: my-project-id)"` so the dashboard shows which project will be billed.

**Warning signs:**
- Gemini stderr: `"Quota exceeded"`, `"API not enabled"`, `"billing/quota_project"`.
- Routine works in manual `gemini -p "hello"` terminal run (uses gcloud default) but fails from launchd (different inherited env).

### Pitfall 4: Bootstrap fails with label-already-loaded

**What goes wrong:** First deploy of a routine succeeds. User edits the bundle, clicks Deploy again. Second `launchctl bootstrap` fails: `"Service already loaded"`. Plist is overwritten (file write succeeded) but the LOADED plist is still the old version; routine runs with stale prompt.

**Why it happens:** `launchctl bootstrap` is not idempotent for label replacement. You must `bootout` first.

**How to avoid:**
1. `installPlist()` always does: `writeFile(new plist) → bootout (ignore failure) → bootstrap`.
2. `bootout` with ignored failure is safe because "label not loaded" and "successful bootout" are both acceptable states.
3. `bootout` + `bootstrap` is the documented re-deploy pattern per launchd.info.

**Warning signs:**
- `launchctl print gui/$UID/com.sleepwalker.codex.<slug>` shows last exit time OLDER than the plist mtime.
- Routine runs with the prompt from the previous version.

### Pitfall 5: Routine fires on Mac sleep (Mac was closed at cron time)

**Scope note:** This is a Phase 5/6 docs-side concern, NOT a Phase 2 adapter concern. Phase 2 ships `StartCalendarInterval` as authored; the docs phase warns users about Mac-sleep behavior. Pitfall included here for completeness since adapter tests should not fail if Mac sleep causes a late-wake fire.

**Adapter-side mitigation:** Set `runAtLoad: false` in plist (default). If user wants fire-on-wake semantics, `StartInterval` is more forgiving than `StartCalendarInterval` for coalescing. Phase 2 adapter accepts the schedule from bundle as-is.

### Pitfall 6: Supervisor prompt.md read before checking bundle exists

**What goes wrong:** Bundle directory has been deleted between deploy time and scheduled fire. Supervisor invokes `cat prompt.md` which exits 1, `set -euo pipefail` kills the pipeline, stderr goes to launchd's `StandardErrorPath`, user sees empty Morning Queue.

**How to avoid:** Supervisor checks `[ -f "$PROMPT_FILE" ]` before the pipeline; if missing → emit `failed` audit event with `reason: "bundle not found"` + `bundle: <path>` + exit 66 (EX_NOINPUT). Launchd won't respawn-loop because `ThrottleInterval=300` caps it.

### Pitfall 7: Beta-header version churn for Claude Routines

**What goes wrong:** `fire-routine.ts` hardcodes `experimental-cc-routine-2026-04-01`. Anthropic releases `experimental-cc-routine-2026-10-15` with breaking response-shape change. Old header returns 410 after 3 months.

**How to avoid (Phase 2 scope — Pitfall #12 in upstream research):**
1. `claude-routines.ts` re-exports `CC_ROUTINE_BETA` from `fire-routine.ts` (single source of truth).
2. `healthCheck()` optionally probes the /routines endpoint and parses 410 Gone as `available: false, warning: "Claude Routines API version deprecated; update Sleepwalker"`.
3. Version constant gets bumped in code only, not in settings.json (per-user update path is via git pull + redeploy).

### Pitfall 8: vi.mock hoisting breaks adapter tests

**What goes wrong:** `vi.mock("node:child_process", ...)` at the top of a test file doesn't affect code imported AFTER the test file's own imports run; adapters imported at file-top use REAL `execFile`, tests invoke real `launchctl`.

**How to avoid:** Use Vitest's `vi.mock()` at module top-level (Vitest hoists it automatically), AND import the adapter INSIDE the `it()` block via `await import("@/lib/runtime-adapters/codex")` (matches v0.1 pattern in `fire-routine.test.ts` where `fireRoutine` is imported inside the test after mocks are set up). This is the canonical v0.1 pattern per `TESTING.md §Async Testing`.

---

## Code Examples

### Example 1: Adapter deploy() test skeleton (Vitest, mock-based)

```ts
// dashboard/tests/codex.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempHome } from "./helpers";

describe("codex adapter", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();  // Critical: clears module cache so vi.mock takes effect
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("deploy writes plist and calls launchctl bootstrap", async () => {
    const execFileCalls: Array<{ cmd: string; args: string[] }> = [];

    vi.mock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        execFile: (cmd: string, args: string[], cb: (err: Error|null, out: {stdout: string, stderr: string}) => void) => {
          execFileCalls.push({ cmd, args });
          // Simulate: /bin/zsh -l -c 'command -v codex' → "/opt/homebrew/bin/codex"
          if (cmd === "/bin/zsh" && args.includes("command -v codex")) {
            cb(null, { stdout: "/opt/homebrew/bin/codex\n", stderr: "" });
          } else if (cmd === "plutil" && args[0] === "-lint") {
            cb(null, { stdout: "OK", stderr: "" });
          } else if (cmd === "launchctl" && args[0] === "bootout") {
            cb(new Error("Not loaded"), { stdout: "", stderr: "" });  // idempotent case
          } else if (cmd === "launchctl" && args[0] === "bootstrap") {
            cb(null, { stdout: "", stderr: "" });
          } else {
            cb(new Error(`Unexpected: ${cmd}`), { stdout: "", stderr: "" });
          }
        },
      };
    });

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.deploy({
      slug: "morning-brief",
      runtime: "codex",
      name: "Morning Brief",
      prompt: "[sleepwalker:codex/morning-brief]\nDo a morning brief.",
      schedule: "0 6 * * 1-5",
      reversibility: "yellow",
      budget: 40000,
      bundlePath: "/tmp/test-bundle",
    });

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatch(/com\.sleepwalker\.codex\.morning-brief\.plist$/);
    expect(execFileCalls).toContainEqual(expect.objectContaining({
      cmd: "launchctl",
      args: expect.arrayContaining(["bootstrap"]),
    }));
    expect(execFileCalls).toContainEqual(expect.objectContaining({
      cmd: "plutil",
      args: expect.arrayContaining(["-lint"]),
    }));
  });
});
```

**Source:** Pattern derived from existing `dashboard/tests/fire-routine.test.ts` which mocks `globalThis.fetch` and does `await import("@/lib/fire-routine")` inside tests. Adapter tests follow the same idiom with `vi.mock("node:child_process")` instead of fetch.

### Example 2: Plist snapshot test (launchd-writer.test.ts)

```ts
// dashboard/tests/launchd-writer.test.ts
import { describe, it, expect } from "vitest";

describe("generatePlist", () => {
  it("produces a valid plist for Codex routine with calendar schedule", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.codex.morning-brief",
      programArguments: [
        "/Users/test/sleepwalker/bin/sleepwalker-run-cli",
        "codex",
        "morning-brief",
      ],
      schedule: { kind: "calendar", minute: 0, hour: 6 },
      stdoutPath: "/Users/test/.sleepwalker/logs/com.sleepwalker.codex.morning-brief.out",
      stderrPath: "/Users/test/.sleepwalker/logs/com.sleepwalker.codex.morning-brief.err",
      workingDirectory: "/Users/test/sleepwalker/routines-codex/morning-brief",
      environmentVariables: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", HOME: "/Users/test" },
      runAtLoad: false,
      throttleInterval: 300,
    });

    // Assert key fragments (not a full snapshot — makes the test fragile to cosmetic whitespace)
    expect(xml).toContain('<key>Label</key><string>com.sleepwalker.codex.morning-brief</string>');
    expect(xml).toContain('<string>codex</string>');
    expect(xml).toContain('<string>morning-brief</string>');
    expect(xml).toContain('<key>StartCalendarInterval</key>');
    expect(xml).toContain('<key>Hour</key><integer>6</integer>');
    expect(xml).toContain('<key>Minute</key><integer>0</integer>');
    expect(xml).toContain('<key>ThrottleInterval</key><integer>300</integer>');
  });

  it("XML-escapes special characters in paths", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.codex.test",
      programArguments: ["/path/with & ampersand/bin"],
      schedule: { kind: "interval", seconds: 3600 },
      stdoutPath: "/path/with<angle>.out",
      stderrPath: "/err.err",
    });
    expect(xml).toContain("with &amp; ampersand");
    expect(xml).toContain("with&lt;angle&gt;.out");
    expect(xml).not.toContain("& ");   // raw ampersand would be a parse error
  });
});
```

### Example 3: Supervisor test (extend hooks/tests/ pattern)

Matches existing `hooks/tests/run-tests.sh` style. Use `hook_input`-style JSON synthesis and `assert_eq`/`assert_contains`:

```bash
#!/bin/bash
# hooks/tests/supervisor-tests.sh — Phase 2 supervisor coverage
#
# Extends the v0.1 hook test harness pattern. Invokes bin/sleepwalker-run-cli
# with synthetic bundles in a temp HOME; mocks the codex/gemini binaries with
# fixtures that produce deterministic output.
#
# Run: hooks/tests/supervisor-tests.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
SUPERVISOR="$REPO_ROOT/bin/sleepwalker-run-cli"

TEST_HOME="$(mktemp -d -t sw-supervisor-tests)"
TEST_BIN="$TEST_HOME/bin"
mkdir -p "$TEST_BIN" "$TEST_HOME/.sleepwalker"
export HOME="$TEST_HOME"
export PATH="$TEST_BIN:$PATH"

# Fake codex that emits 100 bytes then exits 0
cat > "$TEST_BIN/codex" <<'FAKE'
#!/bin/bash
cat  # read prompt from stdin, discard
echo -n "codex fake output here - 100 bytes ............................................"
FAKE
chmod +x "$TEST_BIN/codex"

# Fake budget-exploder that writes 100000 bytes to trigger SIGTERM
cat > "$TEST_BIN/codex-over" <<'FAKE'
#!/bin/bash
cat  # drain stdin
while true; do
  printf 'x%.0s' {1..1000}
  sleep 0.01
done
FAKE
chmod +x "$TEST_BIN/codex-over"

# Create fixture bundle
mkdir -p "$REPO_ROOT/routines-codex/test-supervisor-basic"
cat > "$REPO_ROOT/routines-codex/test-supervisor-basic/prompt.md" <<'EOF'
[sleepwalker:codex/test-supervisor-basic]
Test prompt.
EOF
cat > "$REPO_ROOT/routines-codex/test-supervisor-basic/config.json" <<'EOF'
{"name":"Test","reversibility":"green","budget":50000}
EOF

# Settings: overnight mode, balanced policy
cat > "$TEST_HOME/.sleepwalker/settings.json" <<'EOF'
{"sleep_window":{"start_hour":0,"end_hour":24},"policies":{"codex/test-supervisor-basic":"balanced"}}
EOF

# --- Test 1: basic run emits started + completed ---
echo "==> test: basic run emits started + completed events"
SLEEPWALKER_MODE=overnight "$SUPERVISOR" codex test-supervisor-basic
if ! grep -q '"event":"started"' "$TEST_HOME/.sleepwalker/audit.jsonl"; then
  echo "FAIL: no started event"; exit 1
fi
if ! grep -q '"event":"completed"' "$TEST_HOME/.sleepwalker/audit.jsonl"; then
  echo "FAIL: no completed event"; exit 1
fi
echo "  PASS"

# --- Test 2: budget exceeded emits budget_exceeded ---
# (snip — pattern repeats)

rm -rf "$REPO_ROOT/routines-codex/test-supervisor-basic"
rm -rf "$TEST_HOME"
echo "all supervisor tests passed"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `launchctl load -w` / `unload` | `launchctl bootstrap gui/$UID` / `bootout` | Apple silicon + modern macOS | Modern subcommands required for reliable domain targeting |
| Writing plists via inline bash heredoc | Hand-rolled XML template in TS with `plutil -lint` gate | v0.2 Phase 2 (this phase) | Compile-time type safety + snapshot tests + lint validation |
| `child_process.exec(shell string)` | `execFile(cmd, argsArray)` via `util.promisify` | Node 20+ (implicitly 22) | Zero shell injection surface; explicit argv boundaries |
| Claude Routine creation via Web UI only | CLI `/schedule create` (exists for schedule triggers only) | 2026-04 (Claude Routines research preview) | Schedule triggers programmable; API triggers still require web handoff |
| ANSI strip via Node-side only | Defense-in-depth: `NO_COLOR=1 TERM=dumb CI=true` envs + perl strip in bash supervisor + `util.stripVTControlCharacters` in any TS consumer | Node 20 (built-in) | Three layers catch CLIs that ignore env-var color controls |

**Deprecated/outdated:**
- `launchd.plist` npm package — last release 2013, v0.0.1, abandoned. Do NOT install.
- `launchctl load -w <path>` — legacy; still works but Apple is moving away.
- `@types/plist` — only relevant if using the `plist` npm package (not recommended here).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Codex `exec - --json` reads prompt from stdin and emits newline-delimited JSON | Supervisor Exact Bash + Adapter 3 | **LOW**: verified by `codex exec --help` live probe on dev machine 2026-04-18. If OpenAI changes the flag in future, supervisor catches non-zero exit and emits `failed` audit event. |
| A2 | Gemini `-p - --output-format json --yolo` reads prompt from stdin and emits a single JSON result object | Supervisor Exact Bash + Adapter 4 | **LOW**: verified by `gemini --help` live probe on dev machine 2026-04-18. Same fail-safe as A1. |
| A3 | `util.stripVTControlCharacters` is available on Node 22+ | Don't Hand-Roll | **NONE**: live probe confirmed `typeof === "function"` on Node 25.6.1. Not used by supervisor anyway (supervisor is bash); only relevant if a TS consumer reads audit lines and wants to re-strip. |
| A4 | `claude://scheduled-tasks?slug=<slug>` is the valid Desktop deeplink for pre-filling the Schedule page | Adapter 2 | **MEDIUM**: deeplink format is not exhaustively documented by Anthropic. Falls back gracefully: if Desktop doesn't handle the URL, user can navigate manually to Schedule page. Phase 2 manual smoke test validates this. |
| A5 | `https://claude.ai/code/routines/new?name=&prompt=&cadence=` is the valid Claude Routines handoff deeplink | Adapter 1 | **MEDIUM**: URL parameter format not published; research/STACK.md §Claude Routines references the `/schedule create` CLI as authoritative. Planner may swap for `claude /schedule create --name --cadence` shell-out instead of web URL. Both work; web URL is more inspectable. |
| A6 | Dashboard server-side code can resolve `bin/sleepwalker-run-cli` via `path.resolve(__dirname, "../../..", "bin/sleepwalker-run-cli")` | Adapter 3 + 4 | **LOW**: Next.js server runtime keeps source layout intact. If bundling changes in a future Next.js upgrade, use `process.cwd()` + documented repo-root resolution instead. |
| A7 | Codex `preferred_auth_method` lives in `~/.codex/config.toml` as a simple `key = "value"` line | Adapter 3 healthCheck | **MEDIUM**: format is right per upstream issues #2733 #3286 but may use nested TOML (`[auth] preferred_method = ...`). Regex is simple enough to match both forms; auth-conflict detection is a warning, not a block, so false-negative ("no warning shown when one should be") is low-impact. |
| A8 | v0.1 `fire-routine.ts` beta header `experimental-cc-routine-2026-04-01` still works in 2026-04 | Adapter 1 + Pitfall #7 | **LOW**: same beta header v0.1 has been shipping with for 6+ weeks; no 410 reports in v0.1 execution. Version check probe in Phase 2 healthCheck catches future deprecation. |
| A9 | Planner will add `warning?: string` field to `HealthStatus` in Phase 1 amendment | Adapter 3 healthCheck | **LOW**: strictly additive optional field; backward compatible. Alternative (encode warning into `reason`) works but muddles semantics. |
| A10 | Gemini's `--output-format json` (single JSON) vs `--output-format stream-json` (JSONL) choice — Phase 2 uses `json` | Supervisor + Adapter 4 | **LOW**: both work for audit capture. Supervisor tees the entire stdout; whether it's one JSON object or N JSONL lines, the output file gets saved. `stream-json` may be preferred for long runs because partial output is visible during SIGTERM. Recommendation: use `stream-json` for Phase 2 (matches Pitfall #8 incremental-reader intent). Either choice is defensible. |

**If this table is non-empty:** 10 assumptions total. Most are LOW risk (verified by live probes or graceful fall-through). The two MEDIUM items (A4 Claude Desktop deeplink, A5 Claude Routines handoff URL) require manual smoke testing per Phase 2's existing smoke-test contract. None of the assumptions block the plan from proceeding.

---

## Open Questions

### Q1: Does writing SKILL.md alone trigger Desktop to register a new scheduled task?

- **What we know:** Claude Code Desktop Scheduled Tasks disk format per docs is `~/.claude/scheduled-tasks/<name>/SKILL.md` with YAML frontmatter. Schedule/enabled state lives in Desktop's internal state, not on disk.
- **What's unclear:** Whether Desktop watches the directory + picks up a fresh SKILL.md without user action in the Schedule tab.
- **Recommendation:** Phase 2 ships browser-handoff deploy path (locked in CONTEXT.md). Manual smoke test in Wave 4: executor creates a synthetic "timestamp-writer" routine via `claude-desktop.deploy()`, clicks handoff URL, confirms it appears in Desktop's Schedule tab. Reports result in phase SUMMARY.md. Do not block adapter ship on this; the fallback (user manually sets frequency in Schedule tab) is acceptable.

### Q2: `codex-cli 0.118.0` vs STACK.md's `0.121.0` reference — any contract drift?

- **What we know:** Dev machine has 0.118.0 installed; STACK.md (dated 2026-04-18) references 0.121.0 as most recent. `codex exec --help` confirms `--json`, `-` stdin token, and `exec` subcommand are all present in 0.118.0.
- **What's unclear:** Whether 0.121.0 introduces new flags we'd want (e.g. `--max-tokens`) or changes JSON event shape.
- **Recommendation:** Adapter code DOES NOT pin a version; healthCheck probes `codex --version` and reports it. Supervisor invokes `codex exec - --json`, which is the stable contract. Planner does NOT need to upgrade dev machine as part of Phase 2. If OpenAI ships a breaking change in 0.122+, dashboard's healthCheck can surface it as a warning.

### Q3: How does `claude-routines.deploy()` interact with the existing v0.1 cloud routine setup flow?

- **What we know:** v0.1 cloud routines live in `routines-cloud/<slug>/` with `config.json` + `prompt.md` + `setup.md`. v0.1 dashboard Cloud Routines page already handles the setup flow; new v0.2 Claude Routines bundles also live in `routines-cloud/`.
- **What's unclear:** Does `claude-routines.deploy()` overlap with v0.1 existing setup flow? The CONTEXT.md suggests `deploy()` returns a handoff URL — but so does the existing v0.1 page for new cloud routines.
- **Recommendation:** Phase 2 `claude-routines.deploy()` behavior matches v0.1's pattern: return handoff URL. The existing Cloud Routines page (v0.1) continues to work for v0.1 routines. Phase 3 editor writes NEW routines to the same `routines-cloud/<slug>/` directory using `bundles.ts` (not `toBundleDir`-based writes per CONTEXT.md). `claude-routines.deploy()` is a stateless function that just returns the URL; there's no state overlap.

### Q4: `child_process.execFile` vs `execa` — Phase 2 scope

- **What we know:** STACK.md §Recommended Stack lists `execa@9.6.1` as preferred. v0.1 does not use execa; v0.1 uses `fetch` (global) and no subprocess wrappers (since v0.1 hooks are bash).
- **What's unclear:** Adds a dependency at the Wave 1 start; whether `child_process.execFile` is sufficient for Phase 2.
- **Recommendation:** Phase 2 uses `child_process.execFile` via `util.promisify`. Phase 2 subprocess patterns are simple (array args, no shell, default timeouts acceptable). Add `execa` in Phase 3/4 when editor + queue need more complex streaming (stderr separation, per-process timeout enforcement). Keeps Wave 1 dependency-free.

### Q5: Should `gemini.ts` support the newer `--output-format stream-json` over `--output-format json`?

- **What we know:** Both flags are documented; `stream-json` emits JSONL events as Gemini produces output; `json` emits a single aggregate result at the end.
- **What's unclear:** Supervisor capture shape preference — incremental visibility during budget kill vs single aggregate.
- **Recommendation:** Use `--output-format stream-json`. Partial output capture matters when SIGTERM on budget hits. Planner codifies this choice in the supervisor argv constant.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `launchctl` | ADPT-03 plist install/uninstall | ✓ | macOS stock at `/bin/launchctl` | None needed |
| `plutil` | ADPT-03 plist lint gate | ✓ | macOS stock at `/usr/bin/plutil` | None needed |
| `perl` | Supervisor ANSI strip (SAFE-02) | ✓ | macOS stock at `/usr/bin/perl` | None needed |
| `jq` | Supervisor settings.json + audit emit | ✓ | Confirmed by v0.1 install.sh preflight check | None; v0.1 already requires it |
| `codex` CLI | ADPT-07 healthCheck + schedule trigger | ✓ | `codex-cli 0.118.0` at `/opt/homebrew/bin/codex` | Adapter healthCheck returns `{available: false, reason: ...}` when absent; Dashboard dims Codex badge |
| `gemini` CLI | ADPT-08 healthCheck + schedule trigger | ✓ | `0.31.0` at `/opt/homebrew/bin/gemini` | Same graceful-degradation pattern |
| `claude` CLI | ADPT-05 + ADPT-06 healthCheck | ✓ | At `/Users/rahulmehta/.local/bin/claude` (non-standard path — supervisor login-shell PATH resolution essential) | Same |
| Node 22+ for `util.stripVTControlCharacters` | Optional TS-side audit re-strip | ✓ | Node 25.6.1 | Only used if TS consumer reads raw audit lines; supervisor is bash |
| `/bin/zsh` for login-shell PATH resolution | Supervisor + adapter PATH probe | ✓ | macOS stock | `/bin/bash -l -c` fallback built into supervisor |

**Missing dependencies with no fallback:** None — every required binary is present.

**Missing dependencies with fallback:** None — all dependencies confirmed present.

**Note for OSS users:** This availability table reflects Rahul's dev machine. A second-user install may hit Pitfall #13 (Intel Mac, fish shell, different macOS version, non-standard Homebrew path). Phase 6 polish ships the Diagnostics page; Phase 2 adapters must degrade gracefully per the `healthCheck()` contract (never throw).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (dashboard TS) + bash harness (supervisor) |
| Config file | `dashboard/vitest.config.ts` (existing, no changes needed) |
| Quick run command | `cd dashboard && pnpm test -- --run <file>` |
| Full suite command | `cd dashboard && pnpm typecheck && pnpm test` + `hooks/tests/supervisor-tests.sh` (new, Phase 2) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADPT-03 | `generatePlist` produces valid XML with escape | unit | `pnpm test -- launchd-writer.test.ts` | ❌ Wave 0 |
| ADPT-03 | `installPlist` writes file + runs plutil-lint + bootstraps | unit | `pnpm test -- launchd-writer.test.ts` (mock execFile) | ❌ Wave 0 |
| ADPT-03 | `uninstallPlist` bootouts + unlinks (idempotent) | unit | `pnpm test -- launchd-writer.test.ts` | ❌ Wave 0 |
| ADPT-04 | Supervisor PATH resolution via login shell | integration | `hooks/tests/supervisor-tests.sh` (new) | ❌ Wave 0 |
| ADPT-04 | Supervisor sleep-window gate | integration | `hooks/tests/supervisor-tests.sh` | ❌ Wave 0 |
| ADPT-04 | Supervisor reversibility gate | integration | `hooks/tests/supervisor-tests.sh` | ❌ Wave 0 |
| ADPT-04 | Supervisor char-budget SIGTERM | integration | `hooks/tests/supervisor-tests.sh` | ❌ Wave 0 |
| ADPT-04 | Supervisor ANSI strip | integration | `hooks/tests/supervisor-tests.sh` (input with `\e[32m`) | ❌ Wave 0 |
| ADPT-04 | Supervisor started + terminal event contract | integration | `hooks/tests/supervisor-tests.sh` (grep audit.jsonl) | ❌ Wave 0 |
| ADPT-05 | `claude-routines.runNow` wraps fireRoutine | unit | `pnpm test -- claude-routines.test.ts` (mock fetch) | ❌ Wave 0 |
| ADPT-05 | `claude-routines.deploy` returns handoffUrl | unit | `pnpm test -- claude-routines.test.ts` | ❌ Wave 0 |
| ADPT-05 | `claude-routines.healthCheck` probes claude CLI | unit | `pnpm test -- claude-routines.test.ts` (mock execFile) | ❌ Wave 0 |
| ADPT-06 | `claude-desktop.deploy` writes SKILL.md | unit | `pnpm test -- claude-desktop.test.ts` (temp HOME) | ❌ Wave 0 |
| ADPT-06 | `claude-desktop.deploy` returns handoffUrl | unit | `pnpm test -- claude-desktop.test.ts` | ❌ Wave 0 |
| ADPT-06 | `claude-desktop.undeploy` removes dir | unit | `pnpm test -- claude-desktop.test.ts` | ❌ Wave 0 |
| ADPT-06 | Desktop Schedule pickup | manual-only (Q1) | `test/manual/claude-desktop-smoke.md` | ❌ Wave 4 |
| ADPT-07 | `codex.deploy` full flow (path resolve → plist → lint → bootstrap) | unit | `pnpm test -- codex.test.ts` (mock execFile) | ❌ Wave 0 |
| ADPT-07 | `codex.healthCheck` detects auth conflict | unit | `pnpm test -- codex.test.ts` (fixture config.toml) | ❌ Wave 0 |
| ADPT-07 | codex launchctl bootstrap on real Mac | manual-only | `test/manual/codex-adapter-smoke.md` | ❌ Wave 4 |
| ADPT-08 | `gemini.deploy` with GOOGLE_CLOUD_PROJECT env | unit | `pnpm test -- gemini.test.ts` | ❌ Wave 0 |
| ADPT-08 | `gemini.healthCheck` probes quota project | unit | `pnpm test -- gemini.test.ts` | ❌ Wave 0 |
| ADPT-09 | Registry returns real adapters | unit | `pnpm test -- adapter-registry.test.ts` | ❌ Wave 0 |
| ADPT-09 | `healthCheckAll()` returns 4 statuses | unit | `pnpm test -- adapter-registry.test.ts` | ❌ Wave 0 |
| SAFE-02 | Supervisor sets NO_COLOR/TERM/CI envs | integration | `hooks/tests/supervisor-tests.sh` (env-inspect fixture) | ❌ Wave 0 |
| SAFE-02 | Supervisor strips ANSI before audit write | integration | `hooks/tests/supervisor-tests.sh` (assert no `\e[` in audit) | ❌ Wave 0 |
| ADPT-02 (amend) | `assertValidSlug` rejects invalid in each builder | unit | `pnpm test -- slug.test.ts` | ✅ (extends existing) |
| Frozen surface | v0.1 byte-identical | integration | `git diff 03d063d HEAD -- routines-local/ routines-cloud/ hooks/ install.sh` → 0 lines | ✅ (extends existing) |

### Sampling Rate

- **Per task commit:** `pnpm typecheck && pnpm test -- --run <changed file>` (fast)
- **Per wave merge:** `pnpm typecheck && pnpm test && hooks/tests/supervisor-tests.sh` (full green)
- **Phase gate (Wave 4):** Above + manual smoke tests (`codex-adapter-smoke.md`, `claude-desktop-smoke.md`) documented in phase SUMMARY.md + `git diff PHASE1_BASE HEAD -- <frozen surface paths>` returns 0 lines

### Wave 0 Gaps

- [ ] `dashboard/tests/launchd-writer.test.ts` — covers ADPT-03 (plist generation + install + uninstall with mocked execFile)
- [ ] `dashboard/tests/claude-routines.test.ts` — covers ADPT-05 (deploy/undeploy/runNow/healthCheck via fetch + execFile mocks)
- [ ] `dashboard/tests/claude-desktop.test.ts` — covers ADPT-06 (SKILL.md write + temp HOME)
- [ ] `dashboard/tests/codex.test.ts` — covers ADPT-07 (full deploy flow + auth-conflict branch)
- [ ] `dashboard/tests/gemini.test.ts` — covers ADPT-08 (GOOGLE_CLOUD_PROJECT injection + quota-project validation)
- [ ] `dashboard/tests/adapter-registry.test.ts` — covers ADPT-09 (ADAPTERS contains real adapters, healthCheckAll returns 4 statuses)
- [ ] `hooks/tests/supervisor-tests.sh` — new bash harness for ADPT-04 + SAFE-02 (fixture codex/gemini binaries, temp HOME, assert audit.jsonl contents)
- [ ] `test/manual/codex-adapter-smoke.md` — executor manual contract (see Manual Smoke Test section below)
- [ ] `test/manual/claude-desktop-smoke.md` — executor manual contract for Q1 resolution

**Existing test infrastructure reused:**
- `dashboard/tests/helpers.ts` `makeTempHome()` and `ensureSleepwalkerDir()` — unchanged
- Vitest config, pnpm scripts, typecheck flow — unchanged
- `hooks/tests/run-tests.sh` harness pattern copied for supervisor tests

---

## Manual Smoke Test Contract

One-time per-phase manual validation. Executor runs ONCE on real Mac; result documented in `phase 2 SUMMARY.md`.

### `test/manual/codex-adapter-smoke.md` (ADPT-07 real-Mac validation)

```markdown
# Codex Adapter Smoke Test

**When to run:** Once at Phase 2 exit gate (Wave 4). Run on a real Mac with `codex` installed.

**Prerequisites:**
- `codex --version` reports 0.118.0 or later
- `launchctl` available (macOS built-in)
- Repo checked out at `$REPO_ROOT`
- `~/.sleepwalker/` directory exists (v0.1 install.sh already run)

**Steps:**

1. Create a fixture bundle:
   ```bash
   mkdir -p $REPO_ROOT/routines-codex/smoke-test-abc123
   cat > $REPO_ROOT/routines-codex/smoke-test-abc123/prompt.md <<EOF
   [sleepwalker:codex/smoke-test-abc123]
   Reply with the single word: SMOKE_OK
   EOF
   cat > $REPO_ROOT/routines-codex/smoke-test-abc123/config.json <<EOF
   {"name":"smoke-test","reversibility":"green","budget":1000}
   EOF
   ```

2. Deploy via adapter (using a one-off Node invocation):
   ```bash
   cd dashboard && node -e '
     const { codexAdapter } = require("./lib/runtime-adapters/codex");
     codexAdapter.deploy({
       slug: "smoke-test-abc123",
       runtime: "codex",
       name: "smoke-test",
       prompt: "",  // unused by deploy
       schedule: "*/5 * * * *",  // every 5 min
       reversibility: "green",
       budget: 1000,
       bundlePath: "/path/to/routines-codex/smoke-test-abc123",
     }).then(r => console.log(JSON.stringify(r, null, 2)));
   '
   ```

3. Verify `launchctl print gui/$UID/com.sleepwalker.codex.smoke-test-abc123` returns a LOADED state (no exit, or exit 0 if already ran).

4. Verify plist exists: `ls ~/Library/LaunchAgents/com.sleepwalker.codex.smoke-test-abc123.plist`

5. Verify `plutil -lint` passes on the plist file.

6. Wait up to 5 min (or `launchctl kickstart -k gui/$UID/com.sleepwalker.codex.smoke-test-abc123` to trigger immediately).

7. Check `~/.sleepwalker/audit.jsonl` for 3 lines with this slug:
   - `{"event":"started", ...}`
   - `{"event":"completed", ..., "preview":"...SMOKE_OK..."}`

8. Verify stdout log: `cat ~/.sleepwalker/logs/com.sleepwalker.codex.smoke-test-abc123.out` contains `SMOKE_OK`.

9. Undeploy:
   ```bash
   cd dashboard && node -e '
     const { codexAdapter } = require("./lib/runtime-adapters/codex");
     codexAdapter.undeploy({slug: "smoke-test-abc123", runtime: "codex", ...}).then(r => console.log(JSON.stringify(r)));
   '
   ```

10. Verify plist removed: `ls ~/Library/LaunchAgents/com.sleepwalker.codex.smoke-test-abc123.plist` → "No such file."

11. Clean up fixture: `rm -rf $REPO_ROOT/routines-codex/smoke-test-abc123`

**Pass criteria:**
- Steps 3, 4, 5, 7, 8, 10 all pass as documented
- No unexpected audit events (no "failed" events)

**Record in phase SUMMARY.md:**
- Timestamp of smoke test run
- macOS version (`sw_vers -productVersion`)
- codex version
- Exit criteria checkbox list
- Any deviations / issues encountered
```

Similar template applies to `test/manual/claude-desktop-smoke.md` (Q1 resolution) and `test/manual/gemini-adapter-smoke.md` (optional, parallel to codex).

---

## Recommended Wave Structure

Four waves with concrete task boundaries. Each wave has clear inputs, outputs, and gate criteria.

### Wave 1: Foundation Primitives (parallel, independent)

**Three tasks in parallel, no inter-dependencies:**

- **Task 1-A:** Amend `slug.ts` with `assertValidSlug` + builder mutations + test additions. (Files: `dashboard/lib/runtime-adapters/slug.ts`, `dashboard/tests/slug.test.ts`.)
- **Task 1-B:** Author `dashboard/lib/runtime-adapters/launchd-writer.ts` (generatePlist + installPlist + uninstallPlist + plist escape). (File: 1 new.)
- **Task 1-C:** Author `bin/sleepwalker-run-cli` bash supervisor. (File: 1 new, +x.)
- **Task 1-D (optional, in parallel):** Author `dashboard/tests/launchd-writer.test.ts` alongside Task 1-B so the writer is TDD-shaped. (Parallel to 1-B.)
- **Task 1-E (optional, in parallel):** Author `hooks/tests/supervisor-tests.sh` alongside Task 1-C with fixture binaries in the harness. (Parallel to 1-C.)

**Wave 1 exit gate:** `pnpm typecheck && pnpm test && hooks/tests/supervisor-tests.sh` all green. slug.test.ts grows from 13 to ~20 `it()` blocks. Launchd-writer has ~8 unit tests. Supervisor harness has ~10 integration tests.

### Wave 2: Four Adapters in Parallel

**Four tasks in parallel, all depending on Wave 1:**

- **Task 2-A:** `claude-routines.ts` + `claude-routines.test.ts` (~85 + ~60 lines TS). Depends on Wave 1-A only (`assertValidSlug` via builders). Does NOT depend on launchd-writer or supervisor. Can start as soon as Wave 1-A merges.
- **Task 2-B:** `claude-desktop.ts` + `claude-desktop.test.ts` (~85 + ~60 lines TS). Same dependency profile as 2-A.
- **Task 2-C:** `codex.ts` + `codex.test.ts` (~140 + ~90 lines TS). Depends on Wave 1-A + 1-B (launchd-writer). If Wave 1-B completes before 1-A, can start with mocked `assertValidSlug` behavior and adjust at merge.
- **Task 2-D:** `gemini.ts` + `gemini.test.ts` (~130 + ~85 lines TS). Same dependency profile as 2-C.

**Wave 2 exit gate:** All 4 adapter modules + 4 test files present. Full `pnpm test` green (~70 → ~90 tests). No `notImplemented()` stubs in `index.ts` yet.

### Wave 3: Registry Swap + Integration

**Single task:**

- **Task 3-A:** Replace 4 `notImplemented()` stubs in `index.ts` with real adapter imports. Delete `notImplemented` function. Add `dashboard/tests/adapter-registry.test.ts` verifying `ADAPTERS.codex.runtime === "codex"` etc. and `healthCheckAll()` returns 4 `HealthStatus` objects. (File: 1 amended, 1 new.)

**Wave 3 exit gate:** `pnpm typecheck && pnpm test` green. Registry integration test passes. At this point all 8 requirements (ADPT-03..09 + SAFE-02) are code-complete.

### Wave 4: Phase Exit Gate + Manual Smoke Tests

**Two tasks:**

- **Task 4-A:** Verification gate. Run `pnpm typecheck`, `pnpm test`, `hooks/tests/supervisor-tests.sh`, and `git diff 03d063d HEAD -- <frozen surface>` (must return 0 lines). Confirm all 8 requirement IDs satisfied per §Validation Architecture matrix.
- **Task 4-B:** Manual smoke tests. Executor runs `test/manual/codex-adapter-smoke.md` end-to-end on real Mac; documents result in phase `02-SUMMARY.md`. Runs `test/manual/claude-desktop-smoke.md` to resolve Q1 (Desktop SKILL.md pickup).

**Wave 4 exit gate (phase seal):**
- All requirements satisfied per validation matrix
- Full test suite green
- Bash supervisor harness green
- v0.1 frozen-surface diff = 0 lines
- Manual smoke test reports in SUMMARY.md
- STATE.md + ROADMAP.md updated to "Phase 2 complete"

### Wave Dependency Graph

```
Wave 1 (parallel):
  ┌─ 1-A: slug.ts amend + tests ────┐
  ├─ 1-B: launchd-writer + tests ────┤
  └─ 1-C: supervisor + tests ────────┘
                  │ (all three merge)
                  ▼
Wave 2 (parallel):
  ┌─ 2-A: claude-routines ────┐
  ├─ 2-B: claude-desktop ──────┤
  ├─ 2-C: codex (needs 1-B) ───┤
  └─ 2-D: gemini (needs 1-B) ──┘
                  │
                  ▼
Wave 3:
  └─ 3-A: registry swap + integration test
                  │
                  ▼
Wave 4:
  ├─ 4-A: automated phase gate
  └─ 4-B: manual smoke tests → phase SUMMARY.md
```

**Rationale:** Wave 1 establishes primitives that every adapter consumes. Wave 2 authors all four adapters in parallel since they're thin composition layers. Wave 3 is a trivial 20-line swap + verification test. Wave 4 is the ritual of phase sealing: automated gate + manual validation.

---

## Per-Adapter File Size Estimates

| File | TS lines (incl. comments) | Test file lines | Notes |
|------|---------------------------|-----------------|-------|
| `slug.ts` amendments | +20 (1 new function + 5 `assertValidSlug` calls + docblock) | +30 (7 new `it()` blocks) | Net: from 92 → ~110 lines |
| `launchd-writer.ts` | ~130 (XML template + generatePlist + installPlist + uninstallPlist + escape helper) | ~90 (8 it blocks: valid XML, escaping, schedule variants, install/uninstall mocks) | Single file, no subdirs |
| `bin/sleepwalker-run-cli` (bash) | ~200 (set -euo pipefail, helpers, gates, invocation, audit emit) | ~180 (bash harness: reset, fixtures, 10+ assertions) | Plus ~100 lines in supervisor-tests.sh |
| `claude-routines.ts` | ~85 (wraps fire-routine.ts; beta-header const; CLI probe) | ~60 (4 it blocks: deploy/undeploy/runNow/healthCheck) | Shortest adapter |
| `claude-desktop.ts` | ~85 (SKILL.md copy + deeplink + version probe) | ~60 (same 4 shapes) | No launchd; just fs + claude probe |
| `codex.ts` | ~140 (path resolve + plist gen + config.toml parse + auth conflict) | ~90 (5 it blocks incl. auth-conflict branch) | Depends on launchd-writer |
| `gemini.ts` | ~130 (same as codex + GOOGLE_CLOUD_PROJECT validation) | ~85 (same 5 shapes) | Parallel to codex |
| `index.ts` final | -20 (remove notImplemented) + 4 import lines = ~60 total | ~40 (integration test: ADAPTERS shape + healthCheckAll) | Net smaller than Phase 1 stub |
| **Total new code** | ~770 TS lines + ~200 bash lines + ~40 bash-harness lines | ~465 TS test lines + ~180 bash harness lines | ~1,655 lines total |

**Size sanity check:** Research/ARCHITECTURE.md line 745 estimates "each adapter ~100 lines of TS" — our estimates (85, 85, 140, 130) average 110, close to target. The two CLI adapters are ~40% larger because they handle auth-conflict detection which the Claude adapters don't need.

---

## Security Domain

Required per `security_enforcement` implicit default (not set to false in `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | Each CLI owns its auth (codex login, gemini login, claude login). Sleepwalker NEVER handles credentials for these. Only probes presence in `healthCheck()`. |
| V3 Session Management | no | Sleepwalker has no multi-user sessions; single-user-on-Mac constraint |
| V4 Access Control | yes | `~/Library/LaunchAgents/*.plist` is 0644 (launchd requirement, world-readable). No secrets in plist (Pitfall #2). Secrets in `~/.codex/auth.json` (CLI-owned, 0600 by Codex). Settings at `~/.sleepwalker/settings.json` 0644, non-secret. GitHub token at `~/.sleepwalker/github-token` 0600 (v0.1 baseline, unchanged). |
| V5 Input Validation | yes | `assertValidSlug()` rejects path traversal (`../`) and shell metacharacters at every identifier builder. Prompt text (from user) ONLY flows through file read (`cat prompt.md`), never argv. Cron strings validated in Phase 3 editor; Phase 2 accepts and passes through with `parseCron()` fallback. |
| V6 Cryptography | no | No cryptographic operations in Phase 2. Beta-header auth uses Bearer tokens (v0.1); no new crypto. |
| V7 Error Handling & Logging | yes | `audit.jsonl` is append-only; supervisor ALWAYS emits a terminal event; `healthCheck()` never throws. Error messages are specific (Pitfall #2 warnings list exact env vars; Pitfall #3 lists project ID issues). No stack traces leak into UI responses (result objects wrap errors). |
| V8 Data Protection | yes | Prompt text written to `routines-<runtime>/<slug>/prompt.md` with mode 0644 (visible to user). Audit log mode 0644. No secrets in either. Phase 3 editor adds secret scanning at save time. |
| V9 Communication | partial | Claude Routines `/fire` endpoint is HTTPS (v0.1 baseline, unchanged). Codex/Gemini CLIs handle their own HTTPS. |
| V11 Business Logic | yes | Reversibility gate (strict/balanced/yolo) applies to CLI runtimes same as Claude hooks. Budget cap prevents runaway cost. |
| V13 API & Web Service | partial | Adapter interface is a server-side API; consumers are Next.js Server Actions (Phase 3+). Phase 2 adds no HTTP endpoints. |
| V14 Configuration | yes | Configuration schema encoded in TS types. Invalid `reversibility` or missing `budget` defaulted with loud log. No secrets in configuration files. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via prompt | Tampering / Elevation | **Never** put user prompt in argv. `cat prompt.md | CLI` routes prompt via stdin only. (Pitfall #4) |
| Path traversal via slug | Tampering | `assertValidSlug()` guard at every path-constructing builder. Regex `^[a-z][a-z0-9-]{0,63}$` rejects `..`, `/`, `\`, spaces, and special chars. |
| Launchd label collision | Tampering | Namespaced labels `com.sleepwalker.<runtime>.<slug>`. Pitfall #7. |
| Secret leakage in plist | Information Disclosure | No secrets in `EnvironmentVariables`. CLIs use their own auth files (0600 mode by CLI). Pitfall #2. |
| Secret leakage in audit | Information Disclosure | Prompt stored as file only; audit.jsonl preview is max 500 chars of post-ANSI-stripped stdout. Phase 3 editor adds secret scan at save time (EDIT-02). |
| ANSI escape injection | Tampering (terminal render) | Triple strip: plist env `NO_COLOR=1 TERM=dumb CI=true` + perl in supervisor + optional TS-side strip. |
| Budget exceeded causing runaway cost | DoS (self-induced) | Char-count budget + SIGTERM in supervisor; Phase 5 adds the `approximate` UI labeling. |
| Privilege escalation via setuid plist | Elevation | User-agent plists in `~/Library/LaunchAgents/` (gui/<uid> domain), NOT system plists. Run as user; no root. |
| Race between dashboard git commit and user terminal | Tampering (lost data) | NOT Phase 2 scope — Phase 3/4 adds flock + explicit-path staging. |

### Phase 2 Security Checklist

- [ ] Every identifier builder calls `assertValidSlug()` (Wave 1-A)
- [ ] `generatePlist` 5-char XML escape covers `&<>"'` (Wave 1-B)
- [ ] `installPlist` runs `plutil -lint` BEFORE `launchctl bootstrap` (Wave 1-B)
- [ ] Supervisor NEVER embeds prompt in argv (Wave 1-C)
- [ ] Supervisor sets `NO_COLOR=1 TERM=dumb CI=true` and strips ANSI (Wave 1-C, SAFE-02)
- [ ] No secrets in any plist `EnvironmentVariables` block across adapters (Wave 2)
- [ ] `healthCheck()` returns `{available: false, reason: ...}` on any runtime probe failure; never throws (Wave 2)
- [ ] All adapter methods return Result objects; no throws for adapter-level failures (Wave 2)
- [ ] Registry swap preserves `Record<Runtime, RuntimeAdapter>` shape (Wave 3)
- [ ] Manual smoke test confirms: plist 0644, no secrets, `plutil -lint` passes (Wave 4)

---

## Project Constraints (from CLAUDE.md)

| Directive | Scope | Enforcement in Phase 2 |
|-----------|-------|------------------------|
| Conventional commits; no emojis; no AI attribution | Every commit | Planner specifies commit format; executor verifies |
| TypeScript strict mode | All TS files | `pnpm typecheck` green in every wave gate |
| camelCase for TS | All TS code | code review |
| Result-object error returns (no throws for control flow) | Adapter methods | Interface mandates; `healthCheck()` wraps probe failures as `{available: false, reason}` |
| `set -euo pipefail` | All bash | Supervisor header line 7; test harness copies pattern |
| Activity log entries after file changes | Every task | Planner task template includes activity log step |
| Secrets mode 0600, never in git, never in logs | All adapter code | Pitfall #2 mitigation: no secrets in plist (0644); CLI auth files stay CLI-owned |
| `stripVTControlCharacters()` before audit write | SAFE-02 | Supervisor uses perl equivalent (bash) + any TS consumer that reads audit should use Node util |
| Adapter tests mock `execFile` + `fs`; no network I/O, no real launchctl | Wave 2 test files | Vitest `vi.mock("node:child_process")` pattern; temp HOME via `makeTempHome()` |
| Frozen v0.1 surface | All waves | Wave 4 diff check: `git diff 03d063d HEAD -- routines-local/ routines-cloud/ hooks/ install.sh` → 0 lines |

---

## Sources

### Primary (HIGH confidence)

- **Live CLI probes on dev machine (2026-04-18):**
  - `codex --version` → `codex-cli 0.118.0`
  - `codex exec --help` → confirms `-`, `--json`, `--sandbox`, `exec` subcommand
  - `gemini --version` → `0.31.0`
  - `gemini --help` → confirms `-p`, `--output-format`, `--yolo`, `--approval-mode`
  - `which launchctl plutil perl` → all at canonical macOS paths
  - `/bin/zsh -l -c 'command -v claude'` → `/Users/rahulmehta/.local/bin/claude` (non-standard path)
  - `node -e 'console.log(typeof require("node:util").stripVTControlCharacters)'` → `function`

- **Upstream research (verified 2026-04-18):**
  - `.planning/research/ARCHITECTURE.md` §Layer 2 Adapter Pattern, §Layer 4 Launchd Integration, §Layer 7 Supervisor Pattern, §Layer 9 Build Order, §Layer 10 Test Architecture, §Layer 11 Backward Compatibility
  - `.planning/research/STACK.md` §launchd Wiring, §Canonical plist shape, §Codex/Gemini/Claude Routines invocation contracts, §Critical Non-Existence Claims
  - `.planning/research/PITFALLS.md` Pitfalls #1 (launchd PATH), #2 (plist security), #3 (Gemini quota), #4 (shell injection), #5 (partial deploy), #7 (slug collision), #8 (ANSI in audit), #12 (beta header)
  - `.planning/research/SUMMARY.md` §Phase 1 Adapters rationale + build order

- **Phase 1 outputs (committed state):**
  - `dashboard/lib/runtime-adapters/types.ts` (8 exports, frozen)
  - `dashboard/lib/runtime-adapters/slug.ts` (10 exports + SLUG_REGEX)
  - `dashboard/lib/runtime-adapters/index.ts` (ADAPTERS stub + 3 functions)
  - `dashboard/tests/slug.test.ts` (13 it() / 28 expect())
  - `.planning/phases/01-foundation/01-VERIFICATION.md` (PASSED; Debt-1 + Debt-2 to be resolved by this phase's CONTEXT.md decisions)

- **External docs (cited in upstream research):**
  - Apple launchd.info tutorial (bootstrap/bootout vs load/unload)
  - OpenAI Codex CLI Reference: developers.openai.com/codex/cli/reference
  - Google Gemini CLI Headless: geminicli.com/docs/cli/headless
  - Claude Code Routines: code.claude.com/docs/en/routines
  - Claude Code Desktop Scheduled Tasks: code.claude.com/docs/en/desktop-scheduled-tasks

### Secondary (MEDIUM confidence)

- openai/codex GitHub issues #2733, #3286 — Codex auth collision behavior documented
- google-gemini/gemini-cli issues #12121, #8883 — Gemini quota-project conflict documented
- MDN Web Docs: Plist format escaping (XML entities)

### Tertiary (LOW confidence — informational only)

- Semgrep command-injection cheat sheet (javascript) — referenced via Pitfall #4
- Node.js issue nodejs/node#26187 — TTY inheritance behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions verified via live probes + npm registry cross-checks by upstream STACK.md
- Architecture: **HIGH** — adapter composition, build order, and responsibility map derived from upstream research that was already audited
- Pitfalls: **HIGH** — all 8 adapter-relevant pitfalls confirmed in upstream PITFALLS.md with primary sources + live-machine context
- Plist + launchd contracts: **HIGH** — live probes (`launchctl`, `plutil`, `~/Library/LaunchAgents/` write access) + Apple docs
- Codex/Gemini CLI contracts: **HIGH** — live `--help` probes on dev machine 2026-04-18 confirm all required flags
- Claude Routines `/fire` behavior: **MEDIUM** — v0.1 `fire-routine.ts` is known-working with current beta header; future header churn is Pitfall #12
- Claude Desktop SKILL.md pickup: **MEDIUM** — documented but unverified; Q1 open question resolves via Wave 4 smoke test
- Test strategy: **HIGH** — Vitest mock patterns and bash harness patterns are direct lifts from existing v0.1 tests

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days; may expire sooner if Codex or Gemini ships breaking changes — healthCheck probes surface them)
