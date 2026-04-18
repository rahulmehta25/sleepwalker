# Architecture Research — Sleepwalker v0.2 Multi-Runtime

**Domain:** Local-first multi-runtime agent orchestration (macOS + launchd + 4 CLI/cloud agent runtimes)
**Researched:** 2026-04-18
**Confidence:** HIGH (existing codebase fully mapped; adapter patterns well-established in prior art; launchd + CLI contracts verified via vendor docs)

---

## Executive Stance (TL;DR)

1. **Adapter pattern with a thin discriminated-union registry** — not plugins, not strategy-at-instance. Four modules implementing one TS interface, keyed by `runtime` field on each routine bundle. This is what Terraform providers, Airflow executors, and Prefect workers all collapse to in practice.
2. **Keep `routines-local/` + `routines-cloud/` as-is**. Add `routines-codex/` and `routines-gemini/`. Parallel sibling directories map 1:1 to runtime adapters and preserve all v0.1 paths — zero install.sh changes required.
3. **Bundles carry a `runtime:` field** in frontmatter so adapters can self-identify when loaded through a generic list function. This is the single source of truth; directory name is convention, not contract.
4. **Launchd integration writes plists directly** (no library). Plist format is stable XML; dependency-free stays closer to the v0.1 bash-native ethos. Plists live at `~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist`.
5. **Editor is server-rendered forms** (Next.js Server Actions) + a vanilla `<textarea>` for the prompt. Monaco is overkill; server actions hit `fs.writeFile` with zero client-side state.
6. **Queue schema extension by widening `QueueSource`** to `"local" | "cloud" | "codex" | "gemini"`. All existing consumers already switch on `source` field; new values flow through unchanged because `QueueEntry` is a structural type, not a union. No migration needed.
7. **Cross-runtime hooks parity is NOT replicated** — it's moved up a layer. Wrap CLI invocations in a `bin/sleepwalker-run-cli` supervisor script that streams stdout through the same audit/budget logic bash-side, so Codex/Gemini get equivalent safety without requiring their CLIs to support hook schemas.

---

## Layer 1: Component Architecture

### System Overview (v0.2)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Layer 4: Dashboard UI (Next.js — localhost:4001)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ Morning     │  │ Routine      │  │ Runtime     │  │ Audit         │   │
│  │ Queue       │  │ Editor (NEW) │  │ Health (NEW)│  │ (unified)     │   │
│  └─────┬───────┘  └──────┬───────┘  └──────┬──────┘  └───────┬───────┘   │
│        │                 │                 │                 │           │
├────────┴─────────────────┴─────────────────┴─────────────────┴───────────┤
│  Layer 3: Domain Services (dashboard/lib/)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  queue-aggregator.ts  │  editor.ts (NEW)  │  audit.ts               │ │
│  │  routines.ts          │  save-to-repo.ts  │  runtime-detect.ts (NEW)│ │
│  └──────────────────────────────┬──────────────────────────────────────┘ │
├─────────────────────────────────┼────────────────────────────────────────┤
│  Layer 2: Runtime Adapters (dashboard/lib/runtime-adapters/) — NEW       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ claude-     │  │ claude-     │  │ codex       │  │ gemini      │      │
│  │ routines.ts │  │ desktop.ts  │  │ adapter.ts  │  │ adapter.ts  │      │
│  │ (cloud)     │  │ (local)     │  │ (launchd)   │  │ (launchd)   │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │                │             │
│         ▼                ▼                ▼                ▼             │
├─────────────────────────────────────────────────────────────────────────┤
│  Layer 1: External Runtimes                                             │
│  ┌──────────────┐ ┌──────────────────┐ ┌─────────┐ ┌──────────┐         │
│  │ Anthropic    │ │ Claude Code      │ │ Codex   │ │ Gemini   │         │
│  │ Routines API │ │ Desktop (local)  │ │ CLI     │ │ CLI      │         │
│  │ + GitHub     │ │ + Hooks          │ │ (launchd│ │ (launchd │         │
│  │ PR polling   │ │ + Scheduler      │ │  cron)  │ │  cron)   │         │
│  └──────────────┘ └──────────────────┘ └─────────┘ └──────────┘         │
├─────────────────────────────────────────────────────────────────────────┤
│  Layer 0: Unified State (~/.sleepwalker/)                               │
│  queue.jsonl  │  audit.jsonl  │  settings.json  │  cloud-credentials.json│
│  budgets.json │  sessions/    │  approved/       │  executed/            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Owns | Implementation |
|-----------|------|----------------|
| **Runtime Adapter** (x4) | `deploy/undeploy/runNow/listRuns/healthCheck` for one runtime | Pure TS module, no shared state |
| **Editor Service** | Form → bundle on disk (`routines-<runtime>/<slug>/`) | Next.js Server Action + `fs.writeFile` |
| **Queue Aggregator** | Merge JSONL + GitHub PRs + Codex/Gemini JSONL entries | Extend existing `aggregateQueue()` |
| **CLI Supervisor** (`bin/sleepwalker-run-cli`) | Wraps codex/gemini invocation; audits stdout; enforces budget | Bash, mirrors hook conventions |
| **Launchd Writer** | Serialize plist XML; call `launchctl bootstrap/bootout` | TS, uses built-in `plist` npm lib or hand-rolled XML |
| **Runtime Detector** | Check PATH for claude/codex/gemini; dim unavailable runtimes in UI | TS, `which <bin>` + cache in memory |
| **Save-to-repo Service** | `git add routines-*/<slug>/ && git commit` (no push) | `child_process.execFile("git", ...)` |

---

## Layer 2: The Core Question — Adapter Pattern Choice

### Prior Art Survey

| System | Pattern | How they extend |
|--------|---------|-----------------|
| **Terraform Providers** | RPC plugins (separate processes implementing `Provider` interface with Schema+Configure+CRUD) | Each provider is a Go binary Terraform Core shells out to. Heavy for our case. |
| **Airflow Executors** | Abstract base class (`BaseExecutor` → `CeleryExecutor`, `KubernetesExecutor`, `LocalExecutor`). Single process, runtime chosen by config. | In-process plugin with discriminator on the task's queue — this is what we want. |
| **Prefect Workers** | Agent + infra-block fusion, polls work pool. Worker type determined by work pool config. | Same shape: one abstract contract, multiple infra backends, selected per-deployment. |
| **shadcn/ui registry pattern** | Files live in your repo; you own them. No abstract plugin bus. | Directory-driven, not class-driven — also useful inspiration for OSS readability. |

### Recommendation: **Adapter Interface + Registry Map**

**Why not plugin (Terraform-style):**
- RPC/subprocess plugins are overkill for 4 in-tree adapters in a single Node process.
- Defeats OSS readability goal — you'd be reading binary boundaries instead of reading code.

**Why not pure strategy (instance-per-routine):**
- Strategies instantiate per-object; we want stateless module functions keyed by `runtime` string.
- No need for per-instance state — each routine already owns its config on disk.

**Why adapter + registry:**
- One TS interface, four modules implementing it, one lookup map.
- Matches Airflow/Prefect mental model most users already know.
- Supports "probably more later" (Amp, Devin) by adding one file + one registry entry. No core refactor.
- Type-safe via discriminated unions on routine bundles (see §4).

### Adapter Interface (Proposed)

```typescript
// dashboard/lib/runtime-adapters/types.ts

export type Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini";

export interface RoutineBundle {
  /** Slug = directory name under routines-<runtime>/ */
  id: string;
  /** Runtime this bundle targets (the discriminant) */
  runtime: Runtime;
  /** Human name from frontmatter */
  name: string;
  /** Prompt body (SKILL.md for Claude, prompt.md for others) */
  prompt: string;
  /** Cron expression in launchd format (or Claude-native schedule for cloud) */
  schedule: string | null;
  /** Reversibility default ("green" | "yellow" | "red") */
  reversibility: "green" | "yellow" | "red";
  /** Approximate token/char budget per run */
  budget: number;
  /** Absolute path to the bundle directory on disk */
  bundlePath: string;
}

export interface DeployResult {
  ok: boolean;
  /** Path of the artifact written (plist, symlink, deeplink) — for debugging */
  artifact?: string;
  /** If the adapter needs a browser handoff (claude-routines only), URL to open */
  handoffUrl?: string;
  error?: string;
}

export interface RunNowResult {
  ok: boolean;
  /** Remote session id (Claude Routines) or local pid (codex/gemini) */
  runId?: string;
  /** Optional URL to watch the run (Routines → /code/<id>) */
  watchUrl?: string;
  error?: string;
}

export interface RunRecord {
  ts: string;
  runId: string;
  status: "running" | "succeeded" | "failed" | "deferred";
  /** First 500 chars of stdout, for queue display */
  preview?: string;
}

export interface HealthStatus {
  runtime: Runtime;
  /** CLI present on PATH (for local) or credentials configured (for cloud) */
  available: boolean;
  version?: string;
  /** User-facing error if not available, e.g. "codex not in PATH" */
  reason?: string;
}

/**
 * Every runtime adapter implements this. Imported once in the registry.
 * All methods must be async and throw only on bugs — adapter-level failures
 * are returned as `{ok: false, error}` so the UI can render gracefully.
 */
export interface RuntimeAdapter {
  readonly runtime: Runtime;

  /** Wire the bundle into its runtime (write plist, copy SKILL.md, etc.). Idempotent. */
  deploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Remove the bundle from its runtime. Idempotent (missing = success). */
  undeploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Fire the routine now. Optional freeform context (alert body etc.). */
  runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult>;

  /** List recent runs for this bundle. May be empty for cloud runtimes without logs. */
  listRuns(bundle: RoutineBundle, limit?: number): Promise<RunRecord[]>;

  /** Probe runtime availability (PATH check, credential check, etc.). */
  healthCheck(): Promise<HealthStatus>;
}
```

### Registry Map

```typescript
// dashboard/lib/runtime-adapters/index.ts

import { claudeRoutinesAdapter } from "./claude-routines";
import { claudeDesktopAdapter } from "./claude-desktop";
import { codexAdapter } from "./codex";
import { geminiAdapter } from "./gemini";
import type { RuntimeAdapter, Runtime } from "./types";

export const ADAPTERS: Record<Runtime, RuntimeAdapter> = {
  "claude-routines": claudeRoutinesAdapter,
  "claude-desktop": claudeDesktopAdapter,
  "codex": codexAdapter,
  "gemini": geminiAdapter,
};

export function getAdapter(runtime: Runtime): RuntimeAdapter {
  return ADAPTERS[runtime];
}

export async function healthCheckAll(): Promise<HealthStatus[]> {
  return Promise.all(Object.values(ADAPTERS).map((a) => a.healthCheck()));
}
```

**Consumer usage:**
```typescript
// A dashboard API route — one call regardless of runtime
const adapter = getAdapter(bundle.runtime);
const result = await adapter.deploy(bundle);
```

**This is the entire adapter layer contract.** Every feature in v0.2 (editor, run-now, queue, health) goes through this interface.

---

## Layer 3: Directory Layout — Parallel Siblings (Not a Unified Folder)

### Decision: Keep `routines-local/`, `routines-cloud/`, add `routines-codex/` + `routines-gemini/`

**Tradeoffs considered:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. Parallel sibling dirs** (my pick) | Zero v0.1 install.sh changes; glob-by-directory is simple; matches current convention; OSS users see "one folder per runtime" instantly | Slight duplication in listing code (but trivially abstracted) | ✓ |
| B. Single `routines/` with `runtime:` frontmatter | Elegant unification; easier global operations | Forces install.sh rewrite (breaks v0.1 promise); mixes SKILL.md and prompt.md conventions in one folder | ✗ Breaks backward compat |
| C. `routines/` with `{runtime}/{slug}/` subdirs | Unifies AND keeps separation | Still changes install.sh hardcoded path `$REPO_ROOT/routines-local/` | ✗ Worse than A with no benefit |

### Proposed v0.2 Tree (diff vs v0.1)

```diff
  sleepwalker/
  ├── routines-local/                       # v0.1 — Tier B (Claude Desktop)
  │   └── sleepwalker-<slug>/SKILL.md
  ├── routines-cloud/                       # v0.1 — Tier C (Claude Routines)
  │   └── <slug>/{config.json,prompt.md,setup.md}
+ ├── routines-codex/                       # NEW — Codex CLI
+ │   └── <slug>/{config.json,prompt.md,setup.md}
+ ├── routines-gemini/                      # NEW — Gemini CLI
+ │   └── <slug>/{config.json,prompt.md,setup.md}
+ ├── templates/                            # NEW — empty routine templates
+ │   ├── routine-claude-desktop.md
+ │   ├── routine-claude-routines.md
+ │   ├── routine-codex.md
+ │   └── routine-gemini.md
  ├── hooks/                                # v0.1 — unchanged
  ├── bin/
  │   ├── sleepwalker-execute               # v0.1 — unchanged
+ │   └── sleepwalker-run-cli               # NEW — CLI wrapper (codex/gemini)
  ├── dashboard/
  │   ├── app/
+ │   │   ├── editor/                       # NEW — /editor page
+ │   │   │   ├── page.tsx                  # Form UI
+ │   │   │   └── actions.ts                # Server Actions (save, deploy)
  │   │   ├── routines/                     # v0.1 — now shows all 4 runtimes
  │   │   └── ...
  │   ├── lib/
+ │   │   ├── runtime-adapters/             # NEW
+ │   │   │   ├── types.ts                  # RuntimeAdapter interface
+ │   │   │   ├── index.ts                  # ADAPTERS registry
+ │   │   │   ├── claude-routines.ts
+ │   │   │   ├── claude-desktop.ts
+ │   │   │   ├── codex.ts
+ │   │   │   ├── gemini.ts
+ │   │   │   └── launchd-writer.ts         # Shared plist util (used by codex + gemini)
+ │   │   ├── bundles.ts                    # NEW — readBundle(runtime, slug)
+ │   │   ├── editor.ts                     # NEW — form validation + persist
+ │   │   └── save-to-repo.ts               # NEW — git add + commit
  │   ├── routines.ts                       # EXTEND — include all 4 runtimes
  │   └── ...
  └── install.sh                            # v0.1 — UNCHANGED (critical)
```

### Bundle Frontmatter Convention

Each bundle's `SKILL.md` (for claude-desktop) or `prompt.md` (for others) gets a frontmatter block:

```markdown
---
name: sleepwalker-codex-repo-scout
runtime: codex
schedule: "0 4 * * *"
reversibility: yellow
budget: 40000
---

[sleepwalker:codex-repo-scout]

# Sleepwalker · Codex Repo Scout
...
```

The `runtime:` field is authoritative. Directory is convention; the field prevents disasters like moving a file and forgetting the scheduler target.

---

## Layer 4: Launchd Integration — Direct Plist Writes

### Decision: Write plists directly, no library dependency

**Options:**

| Option | Verdict |
|--------|---------|
| `launchd-api` npm package | ✗ Dormant, last release 2018, 8 downloads/week |
| `@lddubeau/launchd` | ✗ Wrapper around `launchctl` shell-outs, adds no real value |
| **Direct XML write + `launchctl bootstrap` shell-out** | ✓ Plist format stable since 10.4; XML is trivial; shell-out is what every library does anyway |

### Plist Path Convention

```
~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist
```

Example: `com.sleepwalker.codex.morning-brief.plist`

**Why this naming:**
- Reverse-DNS prefix (`com.sleepwalker.*`) — Apple convention, easy to grep/audit
- Runtime segment — lets user see "which adapter owns this agent" at a glance
- Slug suffix — human-readable one-liner

### Plist Writer (Proposed)

```typescript
// dashboard/lib/runtime-adapters/launchd-writer.ts

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface LaunchdJob {
  label: string;              // com.sleepwalker.codex.<slug>
  programArguments: string[]; // ["/absolute/path/bin/sleepwalker-run-cli", "codex", "<slug>"]
  schedule: LaunchdSchedule;
  stdoutPath: string;         // ~/.sleepwalker/logs/<label>.out
  stderrPath: string;         // ~/.sleepwalker/logs/<label>.err
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
}

export type LaunchdSchedule =
  | { kind: "calendar"; minute?: number; hour?: number; day?: number; weekday?: number; month?: number }
  | { kind: "interval"; seconds: number };

function launchAgentsDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function renderPlist(job: LaunchdJob): string {
  const schedXml = job.schedule.kind === "calendar"
    ? renderCalendarSchedule(job.schedule)
    : `<key>StartInterval</key><integer>${job.schedule.seconds}</integer>`;

  const envXml = job.environmentVariables
    ? renderEnvVars(job.environmentVariables)
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(job.label)}</string>
  <key>ProgramArguments</key><array>
${job.programArguments.map((a) => `    <string>${esc(a)}</string>`).join("\n")}
  </array>
  ${schedXml}
  <key>StandardOutPath</key><string>${esc(job.stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${esc(job.stderrPath)}</string>
  ${job.workingDirectory ? `<key>WorkingDirectory</key><string>${esc(job.workingDirectory)}</string>` : ""}
  ${envXml}
</dict>
</plist>
`;
}

export async function installJob(job: LaunchdJob): Promise<void> {
  const dir = launchAgentsDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.label}.plist`);
  await fs.writeFile(file, renderPlist(job), { mode: 0o644 });
  // bootout (ignore errors — may not be loaded), then bootstrap
  await execFileP("launchctl", ["bootout", `gui/${process.getuid?.()}`, file]).catch(() => {});
  await execFileP("launchctl", ["bootstrap", `gui/${process.getuid?.()}`, file]);
}

export async function uninstallJob(label: string): Promise<void> {
  const file = path.join(launchAgentsDir(), `${label}.plist`);
  await execFileP("launchctl", ["bootout", `gui/${process.getuid?.()}`, file]).catch(() => {});
  await fs.unlink(file).catch(() => {});
}
```

**Footprint:** Writes/removes one file in `~/Library/LaunchAgents/`. Does not touch any other user files. No always-on daemon beyond launchd (which is always running anyway).

**Security:** Plist mode 0644 (launchd requires this). Plist contains no secrets — any auth lives in the user's `codex login` / `gemini auth` keychain. Logs at mode 0644 under `~/.sleepwalker/logs/` so user can `tail -f` them.

---

## Layer 5: Editor Architecture — Server-Rendered Forms

### Decision: Next.js Server Action + vanilla `<textarea>` + server-side file write

**Options evaluated:**

| Option | Tradeoffs | Verdict |
|--------|-----------|---------|
| **A. Server-rendered form + Server Action** | Matches existing dashboard style (RSC everywhere); no client-side state; simplest testable surface (just file writes) | ✓ Chosen |
| B. Monaco editor + live-save on debounce | Pretty; overkill for prompt editing; adds ~2MB JS; complicates state; "live-save" creates partial bundles if user closes tab mid-edit | ✗ Scope creep |
| C. React Hook Form + RTK Query | Enterprise-grade; total overkill; violates "OSS readable" constraint | ✗ |

### Flow

```
User at /editor
    ↓
Form: <select runtime> <input name> <textarea prompt> <input schedule> <select reversibility> <input budget>
    ↓ (submit, no JS required — progressive enhancement)
Server Action `saveRoutine(formData)`
    ↓
  1. Validate (zod schema)
  2. Compute bundle path: routines-<runtime>/<slug>/
  3. Write prompt.md (or SKILL.md for claude-desktop) with frontmatter
  4. Write config.json (for non-claude-desktop)
  5. Return { ok: true, bundlePath }
    ↓
Redirect to /routines?highlight=<slug>
```

### Optional "Save to repo" button

```
[Save to repo] button on /routines/<slug>
    ↓
Server Action `saveToRepo(slug)`
    ↓
  1. git add routines-<runtime>/<slug>/
  2. git commit -m "add <slug>" (conventional format)
  3. Do NOT push (matches v0.1 policy)
    ↓
Toast: "Committed abc1234"
```

### Optional "Deploy" button

```
[Deploy to <runtime>] button on /routines/<slug>
    ↓
Server Action `deployRoutine(slug)`
    ↓
  1. const bundle = readBundle(slug)
  2. const adapter = getAdapter(bundle.runtime)
  3. const result = await adapter.deploy(bundle)
    ↓
Toast: "Deployed" or "Opened handoff: <url>"
```

**Every action is a form POST with a Server Action handler.** No client state, no hooks, no API route indirection — Server Actions already return structured results. This keeps the dashboard legible by anyone who can read `async function`.

---

## Layer 6: Queue Schema Extension

### Current shape (v0.1 — `dashboard/lib/queue.ts`)

```typescript
export type QueueSource = "local" | "cloud";

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
  status: QueueStatus;
  source?: QueueSource;
}
```

### v0.2 extension

```diff
- export type QueueSource = "local" | "cloud";
+ export type QueueSource = "local" | "cloud" | "codex" | "gemini";
```

**That's the entire schema change.** `QueueEntry` is a structural (open) type — new `source` values flow through every existing aggregator, filter, and UI consumer because they already switch on `source` with a default fallback.

### Why no migration needed

- `queue.jsonl` is append-only; old entries keep working.
- `aggregateQueue()` filters by `status === "pending"` and sorts by `ts` — runtime-agnostic.
- Morning Queue UI displays `source` as a pill badge — adding two more badges ("Codex", "Gemini") is pure CSS.
- `audit.jsonl` has `fleet` + optional `runtime`; new entries include `runtime` but old ones without it still parse.

### Runtime attribution in audit entries

Codex/Gemini stdout lines are wrapped by `bin/sleepwalker-run-cli` into the same audit shape:

```json
{"ts":"2026-04-19T04:00:03Z","fleet":"morning-brief","runtime":"codex","event":"tool","tool":"stdout","output_preview":"...","output_length":1240}
```

The existing audit UI already renders unknown fields gracefully (it picks a whitelist). The only UI change is adding a "Runtime" column filter.

---

## Layer 7: Cross-Runtime Hooks Parity — The Supervisor Pattern

### Problem

v0.1 hooks (`defer-irreversible`, `budget-cap`, `audit-log`) live inside Claude Code's `PreToolUse`/`PostToolUse` contract. Codex and Gemini CLIs have **no equivalent hook schema**. They just produce stdout.

### Options evaluated

| Option | Verdict |
|--------|---------|
| A. Wait for Codex/Gemini to add hooks | ✗ Vendor-dependent, unknown timeline |
| B. Stdout-parsing "fake hooks" | ✗ Fragile; CLIs change output formats |
| C. **Process supervisor wrapper** (`bin/sleepwalker-run-cli`) | ✓ Cleanest |
| D. Skip safety for Codex/Gemini | ✗ Breaks Sleepwalker's core value prop |

### Recommendation: `bin/sleepwalker-run-cli` supervisor

Launchd invokes `sleepwalker-run-cli <runtime> <slug>` (not `codex` or `gemini` directly). The supervisor:

1. **Sleep window check** — bail if outside window unless `SLEEPWALKER_MODE=overnight`.
2. **Pre-run reversibility gate** — bundle's reversibility + policy → defer entire run (append "pending" queue entry for approve-to-execute later) OR allow.
3. **Budget envelope** — tail `stdout` char count; SIGTERM the CLI when budget exceeded.
4. **Audit stream** — pipe stdout/stderr through `tee >> ~/.sleepwalker/audit.jsonl` with runtime-attributed envelope.
5. **Artifact capture** — if CLI exits 0 with >0 bytes, write queue entry with `source: "codex" | "gemini"` and `kind: "cli-output"` for Morning Queue review.

### Supervisor skeleton

```bash
#!/bin/bash
# bin/sleepwalker-run-cli
# Wraps codex/gemini invocations with sleepwalker safety.

set -euo pipefail
RUNTIME="$1"   # "codex" | "gemini"
SLUG="$2"

BUNDLE_DIR="$HOME/.sleepwalker/bundles/$RUNTIME/$SLUG"
PROMPT_FILE="$BUNDLE_DIR/prompt.md"
BUDGET=$(jq -r '.budget // 40000' "$BUNDLE_DIR/config.json")
REV=$(jq -r '.reversibility // "yellow"' "$BUNDLE_DIR/config.json")

# 1. Sleep window + policy gate (reuses settings.json from v0.1)
# ... (same logic as hooks/sleepwalker-defer-irreversible.sh)

# 2. Pre-run defer if policy says so
if [ "$DECISION" = "defer" ]; then
  # Write pending queue entry, exit 0 (run will be re-scheduled from approved/)
  jq -nc --arg slug "$SLUG" --arg rt "$RUNTIME" \
    '{id:("q_" + $rt + "_" + $slug + "_" + (now|tostring)),
      ts:(now|todate), fleet:$slug, kind:"cli-pending",
      source:$rt, status:"pending", reversibility:"'"$REV"'"}' \
    >> "$HOME/.sleepwalker/queue.jsonl"
  exit 0
fi

# 3. Invoke the CLI, stream output through budget + audit
case "$RUNTIME" in
  codex)  CMD=(codex exec --json -) ;;
  gemini) CMD=(gemini -p - --output-format json --non-interactive) ;;
esac

"${CMD[@]}" < "$PROMPT_FILE" 2>&1 | \
  tee >(audit_stream "$SLUG" "$RUNTIME") | \
  budget_cap "$BUDGET"
```

**Why this works:**
- Same `~/.sleepwalker/settings.json` sleep window + policy → zero new config surface.
- Same `~/.sleepwalker/queue.jsonl` output → zero UI changes.
- Same `~/.sleepwalker/audit.jsonl` stream → zero audit page changes.
- Failure isolation: supervisor dies cleanly if CLI hangs (can add `timeout 30m`).

**The safety layer is moved up one level** (from inside Claude's process to a wrapper around any process). This is strictly more general — any future runtime (Amp, Devin) gets the same treatment by adding a case to `$RUNTIME`.

---

## Layer 8: End-to-End Data Flow

### Authoring flow (NEW in v0.2)

```
User opens localhost:4001/editor
    ↓
Fills form: runtime=codex, name="morning-brief", prompt="...", schedule="0 6 * * 1-5", reversibility=yellow
    ↓
POST (Server Action) → editor.ts::saveRoutine(formData)
    ↓
  editor.ts validates (zod) → writes:
    routines-codex/morning-brief/prompt.md (with frontmatter)
    routines-codex/morning-brief/config.json
    ↓
Redirect → /routines?highlight=morning-brief
    ↓
User clicks [Deploy]
    ↓
POST (Server Action) → deployRoutine(slug)
    ↓
  bundle = readBundle("codex", "morning-brief")
  adapter = getAdapter("codex") → codex-adapter.ts
  adapter.deploy(bundle)
    ↓
  codex-adapter.deploy:
    1. launchd-writer.installJob({
         label: "com.sleepwalker.codex.morning-brief",
         programArguments: ["/path/bin/sleepwalker-run-cli", "codex", "morning-brief"],
         schedule: { kind: "calendar", minute: 0, hour: 6, weekday: 1..5 },
         stdoutPath: "~/.sleepwalker/logs/codex.morning-brief.out"
       })
    2. launchctl bootstrap gui/<uid> <plist>
    3. return { ok: true, artifact: "<plist path>" }
    ↓
Toast: "Deployed to codex — next run 06:00"
```

### Scheduled run flow (NEW in v0.2)

```
06:00 weekday — launchd fires com.sleepwalker.codex.morning-brief
    ↓
Executes: /path/bin/sleepwalker-run-cli codex morning-brief
    ↓
Supervisor:
  1. Sleep window check → in overnight mode, proceed
  2. Policy gate: reversibility=yellow, policy=balanced → allow
  3. Budget check: 0 chars counted so far → allow
  4. codex exec --json - < prompt.md
     (stdout streamed through tee → audit.jsonl + budget_cap)
  5. Exit 0 → write queue entry:
     {source:"codex", kind:"cli-output", payload:{preview:"...", artifact_path:"~/.sleepwalker/outputs/..."}}
    ↓
(Morning)
    ↓
User opens localhost:4001
    ↓
Morning Queue aggregator:
  - local JSONL entries (v0.1)
  - cloud PR entries (v0.1, via GitHub API)
  - codex entries (NEW — just reads same queue.jsonl)
  - gemini entries (NEW — same)
    ↓
Renders unified list with source pills: [LOCAL] [CLOUD] [CODEX] [GEMINI]
    ↓
User approves → entry moves to approved/ → next `bin/sleepwalker-execute` run picks it up
    (For codex/gemini re-runs: bin/sleepwalker-run-cli is re-invoked in approve mode)
```

### Run-now flow (extended from v0.1)

```
User clicks [Run now] on any routine card
    ↓
POST /api/runtime/fire { runtime, slug, context? }
    ↓
  adapter = getAdapter(runtime)
  result = await adapter.runNow(bundle, context)
    ↓
  — For claude-routines: POST /fire (v0.1 code, unchanged)
  — For claude-desktop: shell out to `claude -p` (rare, but supported)
  — For codex: spawn `bin/sleepwalker-run-cli codex <slug>` (non-blocking)
  — For gemini: spawn `bin/sleepwalker-run-cli gemini <slug>` (non-blocking)
    ↓
Return { ok: true, runId, watchUrl? }
    ↓
Toast: "Running..." with link
```

---

## Layer 9: Build Order — Hard Dependencies First

| Order | Component | Depends on | Rationale |
|-------|-----------|------------|-----------|
| **1** | `runtime-adapters/types.ts` + registry skeleton | (nothing) | Interface freeze unblocks everything else; without this, all 4 adapter authors are blocked on the shape |
| **2** | `runtime-adapters/launchd-writer.ts` | types | Pure util; unit-testable with fs + exec mock; blocks codex+gemini adapters |
| **3** | `bin/sleepwalker-run-cli` (supervisor) | (nothing) | Independently testable with mock CLIs; blocks codex+gemini adapters because launchd calls it |
| **4** | `codex-adapter.ts` + `gemini-adapter.ts` | 1, 2, 3 | Thin — they just compose launchd-writer + supervisor path |
| **5** | `claude-routines-adapter.ts` | 1 | Wraps existing `fire-routine.ts`; fastest adapter to ship because code exists |
| **6** | `claude-desktop-adapter.ts` | 1 | Wraps install.sh copy logic; also near-zero new code |
| **7** | `bundles.ts` (readBundle abstraction) | 1 | Needed by editor + routines page |
| **8** | `routines.ts` extension (list all 4 runtimes) | 7 | Unifies the /routines page |
| **9** | `editor.ts` + `/editor` page | 7, 8 | Editor writes bundles — needs read side first for validation |
| **10** | `save-to-repo.ts` | 7 | Nice-to-have; gated on bundles existing |
| **11** | Queue schema extension (QueueSource widen) | (nothing — just a type change) | Can ship anytime; schedule late to minimize merge conflicts |
| **12** | Audit runtime column + UI pills | 11 | Cosmetic; ship last |

### Critical path

**Weeks 1–2:** 1 → 2 → 3 (interface + plumbing) — **parallelizable across authors**
**Weeks 2–3:** 4 + 5 + 6 (four adapters in parallel — each dev owns one)
**Week 3:** 7 → 8 → 9 (editor)
**Week 4:** 10 + 11 + 12 (polish)

### What unblocks what

```
types.ts ──┬── launchd-writer ─┐
           │                   │
           ├── supervisor ─────┼──→ codex-adapter  ──┐
           │                   │                     │
           │                   └──→ gemini-adapter ──┤
           │                                         ├──→ routines page
           ├──→ claude-routines-adapter ─────────────┤
           │                                         │
           └──→ claude-desktop-adapter ──────────────┘
                                                     │
                                                     ▼
                                            bundles.ts
                                                     │
                                                     ▼
                                            editor + save-to-repo
```

---

## Layer 10: Test Architecture

### Unit tests (Vitest — new files in `dashboard/tests/`)

| Test file | What it mocks | What it verifies |
|-----------|---------------|------------------|
| `runtime-adapters/claude-routines.test.ts` | `global.fetch` (already mocked in v0.1 `fire-routine.test.ts`) | deploy/undeploy/runNow/healthCheck wire through correctly |
| `runtime-adapters/claude-desktop.test.ts` | `fs` (tmpdir) | deploy copies SKILL.md to test `~/.claude/scheduled-tasks/` equivalent |
| `runtime-adapters/codex.test.ts` | `child_process.execFile` (mock launchctl) + `fs` | deploy writes correct plist, calls bootstrap; undeploy removes file |
| `runtime-adapters/gemini.test.ts` | same as codex | parallel coverage |
| `runtime-adapters/launchd-writer.test.ts` | fs + execFile | plist XML round-trip + launchctl arg shape |
| `editor.test.ts` | fs (tmpdir) | form → files written correctly; invalid input rejected |
| `bundles.test.ts` | fs (tmpdir) | readBundle finds right runtime based on directory or frontmatter |

### Integration tests (extend `hooks/tests/`)

| Test | What it runs | Confidence |
|------|--------------|------------|
| `run-cli-codex.sh` | Real `codex exec --json` against a fixture prompt that returns `"ok"` | Validates supervisor + audit format |
| `run-cli-gemini.sh` | Real `gemini -p` against fixture | Parallel |
| `run-cli-budget.sh` | Fixture that emits >budget chars; expect SIGTERM | Validates budget envelope |
| `run-cli-defer.sh` | Fixture with `reversibility: red` + `policy: strict`; expect deferred entry in queue.jsonl | Validates pre-run gate |

### Mock pattern for CLI shell-outs (parallel to v0.1's fetch mocking)

```typescript
// dashboard/tests/helpers.ts — extend existing helpers
import { vi } from "vitest";

export function mockExecFile(behavior: Record<string, { stdout: string; stderr?: string; code?: number }>) {
  vi.mock("node:child_process", async () => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    return {
      ...actual,
      execFile: (cmd: string, args: string[], cb: (err: Error|null, out: {stdout: string, stderr: string}) => void) => {
        const key = [cmd, ...args].join(" ");
        const resp = behavior[key] ?? { stdout: "", code: 0 };
        if ((resp.code ?? 0) !== 0) cb(new Error(`exit ${resp.code}`), { stdout: "", stderr: resp.stderr ?? "" });
        else cb(null, { stdout: resp.stdout, stderr: resp.stderr ?? "" });
      },
    };
  });
}
```

### E2E (extend `hooks/tests/e2e.sh`)

Add phases:
- `e2e.sh` already runs `claude -p` with sleepwalker marker tags → unchanged
- `e2e-cli.sh` (NEW) — invokes real `codex exec` and `gemini -p` with fixture prompts, validates audit + queue output
- Skip if codex/gemini not in PATH (print "SKIP" and exit 0 — matches v0.1 pattern for optional deps)

---

## Layer 11: Backward Compatibility — The Frozen Surface

These v0.1 artifacts are **public contracts** that v0.2 MUST NOT change. Any change here breaks existing users who already installed.

### Files and paths that must not change

| Surface | Why frozen |
|---------|------------|
| `install.sh` behavior: copy `routines-local/` → `~/.claude/scheduled-tasks/`, copy `hooks/` → `~/.claude/hooks/`, merge into `~/.claude/settings.json` | Re-running install.sh after v0.2 on a v0.1 machine must be a no-op upgrade |
| `~/.claude/settings.json` hook wiring (PreToolUse + 2 PostToolUse entries with specific matcher shape) | If we change this, users who manually customized their settings.json get clobbered or double-entries |
| `hooks/sleepwalker-{defer-irreversible,budget-cap,audit-log}.sh` script names + stdin/stdout schemas | These are wired into user's settings.json by absolute path — renaming breaks existing installs |
| `hooks/_detect_fleet.sh` location (relative to other hooks) | Called by absolute path from the three main hooks |
| `[sleepwalker:<fleet>]` marker tag format in prompt text | Encoded in every existing routine + the fleet detector regex |
| `routines-local/sleepwalker-<slug>/SKILL.md` directory convention | Referenced by install.sh glob + `dashboard/lib/routines.ts` |
| `routines-cloud/<slug>/{config.json,prompt.md,setup.md}` directory convention | Same |
| `~/.sleepwalker/` directory + all its files: `queue.jsonl`, `audit.jsonl`, `settings.json`, `budgets.json`, `github-token`, `cloud-credentials.json`, `cloud-cache.json`, `tracked-projects.json`, `sessions/`, `approved/`, `executed/` | Any shipping code (dashboard + hooks + bin/sleepwalker-execute) reads these; must keep reading |
| `bin/sleepwalker-execute` script name + behavior (reads `approved/*.task`, writes `executed/*.task` + audit entry) | v0.1 users may have scheduled this via cron or SKILL.md |
| `SLEEPWALKER_REEXECUTING=1` env bypass | Used by executor; hook must keep respecting it |
| `SLEEPWALKER_FLEET` env override | Used by tests + manual invocation |
| `SLEEPWALKER_MODE=overnight` env | Used to force sleep-window behavior |
| `QueueEntry` field names (even after widening `source`) | Dashboard reads existing jsonl entries |
| `/fire` endpoint request shape (`{"text": "..."}` + bearer token + beta headers) | Claude Routines contract, vendor-owned |
| Dashboard URL `localhost:4001` + page paths (`/`, `/routines`, `/cloud`, `/audit`, `/settings`) | User bookmarks |
| Reversibility classification categories (green/yellow/red) + their tool-name mappings in `defer-irreversible.sh` | Existing settings.json entries use these colors |
| Policy names (strict/balanced/yolo) | Same |

### v0.2 extensions that are additive-only (don't modify anything above)

- NEW directories: `routines-codex/`, `routines-gemini/`, `templates/`
- NEW files: `bin/sleepwalker-run-cli`, `dashboard/lib/runtime-adapters/*`, `dashboard/lib/editor.ts`, `dashboard/app/editor/*`
- NEW `~/Library/LaunchAgents/com.sleepwalker.*.plist` files — user directory, user-owned
- NEW optional fields on `QueueEntry`: `runtime?`, `cli_exit_code?`
- NEW `QueueSource` values: `"codex"`, `"gemini"` — additive, unions are open
- NEW audit event types: `"cli-run-started"`, `"cli-run-completed"`, `"cli-budget-exceeded"` — additive
- NEW `~/.sleepwalker/logs/` directory for CLI stdout capture — additive

### Specific install.sh audit

`install.sh` MUST stay byte-identical in its v0.1-covered lines. v0.2 additions to install.sh (if any) should be a trailing block like:

```bash
# v0.2 additions — safe to skip on first run
if [ -d "$REPO_ROOT/routines-codex" ] || [ -d "$REPO_ROOT/routines-gemini" ]; then
  mkdir -p "$STATE_DIR/logs"
  echo "==> v0.2: codex/gemini routine dirs detected (configure via dashboard)"
fi
```

No modification of existing lines. No change to hook wiring. No change to routine copy loop.

---

## Diff vs `.planning/codebase/ARCHITECTURE.md` — What Changes, What Stays

### Stays identical

- Two-tier **hybrid execution model + unified approval queue** — the core mental model is preserved; we're adding two more tiers that slot into the same queue.
- `~/.sleepwalker/` state directory with all current files + schemas.
- Hook chain (PreToolUse → PostToolUse → PostToolUse) for Claude Code Desktop.
- `QueueEntry` structural shape + aggregator logic.
- Reversibility classification (green/yellow/red) + policy names (strict/balanced/yolo).
- Fleet detection via `[sleepwalker:<name>]` marker tag.
- `bin/sleepwalker-execute` re-execution protocol.
- Dashboard page paths + URL.
- GitHub PR polling for cloud queue entries.

### Changes (additively)

| v0.1 statement | v0.2 statement |
|----------------|----------------|
| "Two-tier hybrid execution model" | "**Four-tier** hybrid execution model: Local Tier B, Cloud Tier C, **CLI Tier D (Codex), CLI Tier E (Gemini)**" |
| "Both tiers feed into a single Morning Queue UI" | "**All four** tiers feed into a single Morning Queue UI" |
| "Three hook scripts enforce safety on local tier" | "Three hook scripts enforce safety on **Claude** runtimes; **one supervisor script** (`bin/sleepwalker-run-cli`) enforces equivalent safety on Codex + Gemini runtimes" |
| "Local routine execution: Claude Code Desktop runs SKILL.md" | "Routine execution: runtime adapter deploys bundle to its runtime; scheduled/fired via launchd (local/CLI) or vendor scheduler (cloud)" |
| `QueueSource = "local" \| "cloud"` | `QueueSource = "local" \| "cloud" \| "codex" \| "gemini"` |
| No editor — routines defined by hand | **Routine editor at /editor** writes bundles to disk via Server Actions |
| Install via `install.sh` only | `install.sh` for core + **dashboard "Deploy" button** for runtime-specific wiring |

### New sections to add to ARCHITECTURE.md on v0.2 ship

- **Layer 2b extension:** Launchd scheduler as cron surface for Tier D/E
- **Layer 2c:** Runtime adapter layer (new abstraction between queue and external runtimes)
- **New flow:** Authoring flow (editor → bundle → deploy)
- **New flow:** Supervised CLI run flow (launchd → sleepwalker-run-cli → audit + queue)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Deep class hierarchy for adapters

**What people do:** `abstract class BaseAdapter` with protected helper methods, 4 subclasses extending.
**Why wrong:** Forces subclasses to import the base's dependencies even when they don't need them; obscures the interface contract; conflicts with functional style of rest of codebase.
**Do instead:** Plain modules exporting const objects matching `RuntimeAdapter` interface. No inheritance.

### Anti-Pattern 2: Centralized "runtime manager" singleton

**What people do:** `class RuntimeManager { private adapters; register(); deploy(bundle); ... }` stored in a singleton.
**Why wrong:** Hides the registry; adds state; makes testing harder; violates "code flows visibly through the dashboard" OSS readability goal.
**Do instead:** Export plain `ADAPTERS` const and `getAdapter(runtime)` function. Call sites import directly.

### Anti-Pattern 3: Mixing schedule formats across runtimes

**What people do:** Let each runtime accept its own native schedule format — cron for launchd, ISO-8601 for Claude Routines, free-text for "every morning".
**Why wrong:** Editor becomes unlearnable; users can't switch runtimes without re-learning.
**Do instead:** Accept cron-5 as canonical input in the editor. Each adapter translates to its runtime's native format internally. Claude Routines adapter can surface "can't match this cron exactly" as a warning.

### Anti-Pattern 4: Treating Claude Routines like just another adapter

**What people do:** Force `deploy()` for claude-routines to actually create the routine via API.
**Why wrong:** Anthropic has not shipped a "create routine via API" endpoint yet. Pretending we can do it will fail silently or drive users into "why is it broken" tickets.
**Do instead:** `claude-routines.deploy()` returns `{ok: true, handoffUrl: "<deeplink>"}` and the UI opens the browser to complete setup. Be honest about the handoff.

### Anti-Pattern 5: Writing plists via a "rich" XML library

**What people do:** Depend on `plist` npm package or similar with parse/serialize API.
**Why wrong:** Adds dependency; XML we generate is simple; libraries often drift behind Apple's format.
**Do instead:** Hand-rolled template string with explicit escape function (`esc()`). 30 lines of code, zero deps.

### Anti-Pattern 6: Using Monaco/CodeMirror for the prompt editor

**What people do:** "Users want syntax highlighting for markdown."
**Why wrong:** Prompts are plain text; 2MB JS cost; breaks no-JS progressive enhancement; users paste from external editors anyway.
**Do instead:** `<textarea>` with `rows={30}`, `font-family: monospace`. Done.

---

## Scaling Considerations

Sleepwalker is intentionally single-user-on-Mac. "Scale" here means "does it handle the realistic ceiling of routines one user might author?"

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **1-20 routines across 4 runtimes** (realistic target) | Current design fine. Queue.jsonl and audit.jsonl linear scan is O(n) but n is small. |
| **50+ routines** (power user) | queue.jsonl scan becomes noticeable (~100 ms). Mitigation: SQLite cache on top of JSONL (cache invalidated by file mtime). Not needed for v0.2. |
| **Concurrent runs of same routine** (race) | launchd prevents double-scheduling of same label; CLI supervisor acquires file lock on `~/.sleepwalker/locks/<slug>.lock`. Document but don't over-engineer. |
| **Multi-user on same Mac** (out of scope) | Would require `~/.sleepwalker/` isolation per uid. Not in v0.2. |

### First bottleneck

If someone actually hits 50+ routines: **GitHub PR polling** (v0.1 code) rate-limits before anything else. Already handles this with 60s cache in `cloud-cache.ts`.

---

## Sources

- [Terraform Plugin Framework — HashiCorp Developer](https://developer.hashicorp.com/terraform/plugin/framework/providers)
- [Terraform and its Extensible Provider Architecture — HashiCorp](https://www.hashicorp.com/en/resources/terraform-extensible-provider-architecture)
- [Airflow Executor — Apache Airflow 3.2.0](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/index.html)
- [CeleryKubernetes Executor — Apache Airflow](https://airflow.apache.org/docs/apache-airflow/stable/executor/celery_kubernetes.html)
- [Apache Airflow Executors — Astronomer](https://www.astronomer.io/docs/learn/airflow-executors-explained)
- [Learn about workers — Prefect](https://docs.prefect.io/v3/deploy/infrastructure-concepts/workers)
- [How to upgrade from agents to workers — Prefect](https://docs.prefect.io/v3/how-to-guides/migrate/upgrade-agents-to-workers)
- [Creating Launch Daemons and Agents — Apple Developer Archive](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [A launchd Tutorial — launchd.info](https://www.launchd.info/)
- [launchd.plist(5) man page](https://leopard-adc.pepas.com/documentation/Darwin/Reference/ManPages/man5/launchd.plist.5.html)
- [Non-interactive mode — Codex | OpenAI Developers](https://developers.openai.com/codex/noninteractive)
- [Command line options — Codex CLI | OpenAI Developers](https://developers.openai.com/codex/cli/reference)
- [Headless mode reference | Gemini CLI](https://geminicli.com/docs/cli/headless.html)
- [Automate tasks with headless mode | Gemini CLI](https://geminicli.com/docs/cli/tutorials/automation/)
- [TypeScript Discriminated Unions — OneUptime (2026-01-24)](https://oneuptime.com/blog/post/2026-01-24-typescript-discriminated-unions/view)
- [Adapter in TypeScript / Design Patterns — Refactoring Guru](https://refactoring.guru/design-patterns/adapter/typescript/example)

### Confidence notes

- **HIGH** on existing codebase shape (read 10+ files end-to-end including `queue.ts`, `fire-routine.ts`, `install.sh`, both bash hooks, `queue-aggregator.ts`, `routines.ts`, `approval.ts`, `settings.ts`).
- **HIGH** on CLI contracts for Codex (`codex exec --json -`) and Gemini (`gemini -p -`) — verified via official docs cited above.
- **HIGH** on launchd plist format — Apple-owned XML contract, stable since 10.4.
- **MEDIUM** on adapter pattern choice — prior art is consistent but "best" is always judgment. Documented rationale against alternatives.
- **MEDIUM** on whether Claude Routines has a future "create via API" endpoint — if yes, `claude-routines.deploy()` can return `{ok: true, artifact}` without handoffUrl. Design accommodates both futures.

---

*Architecture research for: Sleepwalker v0.2 multi-runtime*
*Researched: 2026-04-18*
