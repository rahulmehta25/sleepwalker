# Phase 1: Foundation - Research

**Researched:** 2026-04-18
**Domain:** TypeScript interface design + cross-runtime naming convention for Sleepwalker v0.2 adapter layer
**Confidence:** HIGH

---

## Summary

Phase 1 is a pure-contract, zero-behavior phase. It freezes two artifacts: (1) the `RuntimeAdapter` TypeScript interface in `dashboard/lib/runtime-adapters/types.ts`, and (2) the `<runtime>/<slug>` naming convention used across internal keys, launchd labels, audit markers, branch prefixes, and plist file paths. After Phase 1 lands, Phases 2–6 can proceed in parallel with no interface churn.

Upstream research in `.planning/research/ARCHITECTURE.md` and `.planning/research/SUMMARY.md` already proposed the interface shape, directory structure, and naming rules in concrete detail. Phase 1 does not re-research those decisions — it locks them into compilable code plus a small runtime validator for `ADPT-02`, and creates the empty sibling directories (`routines-codex/`, `routines-gemini/`, `templates/`) via `.gitkeep` so the paths exist before any adapter is written.

**Primary recommendation:** Ship six files in Phase 1 — `types.ts` (interface + discriminant types), `slug.ts` (tiny validator + identifier builders, 30-40 lines), `index.ts` (registry skeleton with TODO-stub adapters so `getAdapter()` compiles), and three `.gitkeep` placeholders. Touch zero v0.1 files. No dependency installs. No behavior changes. The entire phase is verifiable by `pnpm typecheck` + `pnpm test` + three `ls` checks.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `RuntimeAdapter` interface definition | Domain Services (dashboard/lib) | — | Type-only, zero runtime surface; lives with the domain modules that consume it |
| `Runtime` discriminant type | Domain Services | Database/Storage (disk bundles) | Written once; consumed by adapters, editor, bundle reader, queue extension |
| Slug validation + identifier builders (`slug.ts`) | Domain Services | — | Pure TS function; no I/O; reused by editor (Phase 3), adapters (Phase 2), queue (Phase 5) |
| Empty directory stubs (`routines-codex/`, `routines-gemini/`, `templates/`) | Database/Storage (repo layout) | — | Filesystem convention; extends v0.1 parallel-siblings pattern |
| Registry skeleton (`index.ts` with stubbed adapters) | Domain Services | — | Compilable placeholder so `getAdapter()` type-checks; Phase 2 fills in real adapters |

---

<user_constraints>
## User Constraints (from CLAUDE.md + Phase 1 scope)

> No `CONTEXT.md` exists for this phase (greenfield phase plan, no prior `/gsd-discuss-phase` run).
> Constraints below are extracted verbatim from `./CLAUDE.md` and the Phase 1 objective block.

### Locked Decisions

1. **Stack is frozen from v0.1 + v0.2 research.** Next.js 15.1.4, React 19, TypeScript 5.7, Tailwind 3.4, Vitest 2.1, pnpm workspace. Phase 1 ships only TypeScript source files — no new dependencies.
2. **Interface shape is pre-decided** in `.planning/research/ARCHITECTURE.md` §Layer 2 "Adapter Interface (Proposed)". Phase 1 locks specifics but does not re-open the design.
3. **Runtime values are exactly four**: `"claude-routines" | "claude-desktop" | "codex" | "gemini"`. Amp + Devin are deferred to v0.3 per `.planning/REQUIREMENTS.md` Out of Scope table.
4. **Slug regex is exactly `^[a-z][a-z0-9-]{0,63}$`** per `.planning/REQUIREMENTS.md` EDIT-04 and CLAUDE.md Conventions block.
5. **All identifiers namespace as `<runtime>/<slug>`** per CLAUDE.md Conventions block:
   - Internal key: `<runtime>/<slug>` (e.g. `codex/morning-brief`)
   - Launchd label: `com.sleepwalker.<runtime>.<slug>` (e.g. `com.sleepwalker.codex.morning-brief`)
   - Marker tag: `[sleepwalker:<runtime>/<slug>]`
   - Cloud branch prefix: `claude/sleepwalker/<runtime>/<slug>/*`
   - Plist path: `~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist`
6. **v0.1 public surface is frozen.** From CLAUDE.md "Frozen backward-compat surface":
   - `install.sh` signature + idempotency
   - Hook script names + paths (`hooks/sleepwalker-*.sh`, `hooks/_detect_fleet.sh`)
   - `~/.sleepwalker/*.jsonl` schemas
   - `~/.claude/settings.json` hook wiring
   - Existing `QueueEntry` field names
   - All 14 v0.1 routine paths (`routines-local/sleepwalker-*`, `routines-cloud/<id>/`)
7. **Additive-only changes.** Phase 1 MUST NOT touch `queue.ts`, `routines.ts`, `cloud.ts`, `cloud-cache.ts`, `queue-aggregator.ts`, `settings.ts`, `approval.ts`, `audit.ts`, `github.ts`, `fire-routine.ts`, or any file under `hooks/`, `routines-local/`, `routines-cloud/`, `bin/`.
8. **TypeScript strict mode** is enforced via `dashboard/tsconfig.json`. Every exported type and function parameter must be typed explicitly.
9. **Commit convention** per global CLAUDE.md: conventional format (`feat:`, `refactor:`, `docs:` etc.), no emojis, no AI attribution, no `Co-Authored-By: Claude`.
10. **Activity log is required.** After any file create/modify/delete, append entry to `docs/activity_log.md` per global CLAUDE.md Activity Log rule.

### Claude's Discretion

1. **Runtime enforcement of ADPT-02 — validator vs pure documentation.** See Open Question #1 below. Recommendation: ship a 30-40 line `slug.ts` with `validateSlug()`, `toLaunchdLabel()`, `toMarkerTag()`, `toBranchPrefix()`, `toPlistPath()` builder functions. Reused by editor + adapters.
2. **Registry skeleton shape.** `ADAPTERS` map must compile. Options: (a) stub adapters that return `{ok: false, error: "not implemented"}`, (b) placeholder export of empty map with `// @ts-expect-error` guards, (c) keep `ADAPTERS` commented out until Phase 2. Recommendation: (a) — real typed objects returning "not-yet-implemented" so downstream type-checks pass from day one.
3. **Type barrel file.** Whether `types.ts` self-re-exports via `index.ts` or consumers import directly from `types.ts`. Recommendation: consumers import from `dashboard/lib/runtime-adapters/types` for types and from `dashboard/lib/runtime-adapters` (index) for the registry. Matches Next.js + v0.1 convention (existing `dashboard/lib/` has no barrels; import from module directly).
4. **Optional vs required fields on `RoutineBundle`.** Research proposes all required except `schedule: string | null`. Recommendation below locks this field-by-field.
5. **Whether to include `cronstrue`-validated schedule type or keep it a raw string.** Recommendation: raw string in Phase 1; Phase 3 editor handles human-readable preview. Cron validation is an editor concern, not an interface concern.
6. **Whether to write any Vitest tests in Phase 1.** Recommendation: yes — one test file `slug.test.ts` with ~8 cases for `validateSlug()` + identifier builders. Costs 15 minutes, locks regex behavior before any editor/adapter code consumes it.

### Deferred Ideas (OUT OF SCOPE)

1. **Actual adapter implementations** — all four adapters are Phase 2.
2. **`launchd-writer.ts`** — Phase 2. Phase 1 only defines the types it will emit (`LaunchdJob`, `LaunchdSchedule`) if and only if they need to be shared across adapters; otherwise they live in `launchd-writer.ts` in Phase 2.
3. **`bundles.ts` read-side API** — Phase 2 or 3 (research says post-Phase 2, pre-editor).
4. **Supervisor script `bin/sleepwalker-run-cli`** — Phase 2.
5. **Editor (`/editor` route, Server Actions)** — Phase 3.
6. **`QueueSource` widening to include `"codex" | "gemini"`** — Phase 5 per roadmap (one-line type change, deliberately scheduled late to minimize merge conflicts).
7. **Migration of v0.1 routines to carry a `runtime:` field** — DEFERRED. v0.1 routines never touch disk in Phase 1. The unified bundle reader (Phase 2/3) will infer `runtime` from directory (`routines-local/` → `"claude-desktop"`, `routines-cloud/` → `"claude-routines"`) when it reads them. See Open Question #3.
8. **Any UI change** — no phase 1 work touches `dashboard/app/`.
9. **Health check infrastructure** — interface defined in Phase 1; implementations Phase 2.
10. **Audit JSONL extension with `runtime` field** — Phase 5. Phase 1 only documents the intended marker tag format.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ADPT-01** | `RuntimeAdapter` TypeScript interface is frozen and exported from `dashboard/lib/runtime-adapters/types.ts` with `deploy`, `undeploy`, `runNow`, `listRuns`, `healthCheck` methods and typed `RoutineBundle`, `DeployResult`, `HealthStatus` shapes | §Interface Signatures (Locked) below — full field-by-field definition derived from `.planning/research/ARCHITECTURE.md` §Layer 2, adapted for v0.1 conventions (`result-object error returns, no throws for control flow`) |
| **ADPT-02** | Slug namespacing convention is enforced everywhere: internal key `<runtime>/<slug>`, launchd label `com.sleepwalker.<runtime>.<slug>`, audit marker `[sleepwalker:<runtime>/<slug>]`, branch prefix `claude/sleepwalker/<runtime>/<slug>/*` | §Naming Convention Rules (Locked) below + §Slug Validator Recommendation — single `slug.ts` file owns regex + builders; any downstream consumer that constructs these identifiers must use the builders, not string templates, so the convention is enforced by code reuse, not discipline |

</phase_requirements>

---

## Standard Stack

### Core (no installs required — all already in v0.1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.7.2 | Strict-mode type checking; `noEmit: true` (Next.js handles compilation) | Already the v0.1 typecheck surface; `pnpm typecheck` runs `tsc --noEmit` [VERIFIED: `dashboard/package.json` scripts.typecheck] |
| Node built-ins | 22.x | `node:path`, `node:fs` (used nowhere in Phase 1 code, but available for future use) | Already the v0.1 import style (`import fs from "node:fs"`) [VERIFIED: `dashboard/lib/queue.ts` line 1] |
| Vitest | 2.1.8 | Unit test runner for `slug.ts` validators | Already wired; `pnpm test` runs `vitest run` [VERIFIED: `dashboard/package.json` scripts.test] |

### Supporting (deferred to Phase 2+)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.25.x | `RoutineBundle` runtime validation | Phase 3 editor only; Phase 1 ships compile-time types only [CITED: `.planning/research/STACK.md` line 108] |
| `execa` | 9.6.1 | Subprocess wrapper | Phase 2 adapters [CITED: `.planning/research/STACK.md` line 39] |
| `yaml` / `gray-matter` | ^2.6.x / ^4.0.x | YAML frontmatter | Phase 2 `bundles.ts` reader [CITED: `.planning/research/STACK.md` line 105-106] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single `types.ts` export file | Split `runtime.ts` + `bundle.ts` + `result.ts` | More files = more imports; Phase 1 surface is small enough that one file is easier to navigate. Matches v0.1 pattern (each lib file owns its types inline). |
| Discriminated union for `Runtime` (current proposal) | Enum (`enum Runtime { Codex = "codex", ... }`) | Enums don't play well with `typeof` narrowing, force consumers to import the enum, and don't serialize to JSON naturally. Discriminated union of string literals is the idiomatic TS 5.7 approach and is what `.planning/research/ARCHITECTURE.md` specifies. |
| `ADAPTERS: Record<Runtime, RuntimeAdapter>` map | `Map<Runtime, RuntimeAdapter>` instance | `Record` is static, type-checked at the site of definition, zero-allocation at lookup. `Map` is runtime-mutable (unneeded for Phase 1's frozen registry) and requires `.get()` which returns `RuntimeAdapter | undefined` (loses the exhaustiveness guarantee). |

**Installation:** None. Phase 1 uses only existing v0.1 dependencies.

**Version verification:** Verified `package.json` dependencies against lockfile on 2026-04-18:
- `typescript@5.7.2` [VERIFIED: `dashboard/package.json` devDependencies]
- `vitest@2.1.8` [VERIFIED: `dashboard/package.json` devDependencies]
- No new packages installed in Phase 1.

---

## Architecture Patterns

### System Architecture Diagram

```
                   Phase 1 deliverable surface (this phase's scope)
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   dashboard/lib/runtime-adapters/                                    │
│   │                                                                  │
│   ├── types.ts    ──── exports ────► Runtime                         │
│   │                                  RoutineBundle                   │
│   │                                  DeployResult                    │
│   │                                  RunNowResult                    │
│   │                                  RunRecord                       │
│   │                                  HealthStatus                    │
│   │                                  RuntimeAdapter                  │
│   │                                                                  │
│   ├── slug.ts    ──── exports ────► validateSlug(s)      (pure fn)   │
│   │                                  parseFleetKey(s)    (pure fn)   │
│   │                                  toLaunchdLabel()    (pure fn)   │
│   │                                  toMarkerTag()       (pure fn)   │
│   │                                  toBranchPrefix()    (pure fn)   │
│   │                                  toPlistPath()       (pure fn)   │
│   │                                  RUNTIMES  (readonly tuple)      │
│   │                                                                  │
│   └── index.ts   ──── exports ────► ADAPTERS             (stub map)  │
│                                     getAdapter(runtime)              │
│                                     healthCheckAll()     (stub fn)   │
│                                                                      │
│   dashboard/tests/                                                   │
│   └── slug.test.ts  ── 8 test cases for slug.ts                      │
│                                                                      │
│   routines-codex/                                                    │
│   └── .gitkeep                                                       │
│                                                                      │
│   routines-gemini/                                                   │
│   └── .gitkeep                                                       │
│                                                                      │
│   templates/                                                         │
│   └── .gitkeep                                                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

                   Phase 2+ consumers (Phase 1 unblocks them)
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Phase 2: launchd-writer.ts ──imports types.RuntimeAdapter etc.      │
│  Phase 2: codex.ts, gemini.ts, claude-*.ts ──implement RuntimeAdapter│
│  Phase 2: bin/sleepwalker-run-cli  ──parses fleet key via shell      │
│           (but builder output is authoritative for TS callers)       │
│  Phase 3: editor.ts ──uses validateSlug() before disk write          │
│  Phase 3: bundles.ts ──uses parseFleetKey() to reconstruct bundles   │
│  Phase 5: queue.ts ──QueueSource widening (one-line type change)     │
│  Phase 5: supervisor ──emits `fleet: <runtime>/<slug>` in audit      │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (existing v0.1 tree + Phase 1 additions only)

```
sleepwalker/
├── dashboard/
│   └── lib/
│       └── runtime-adapters/      # NEW (Phase 1)
│           ├── types.ts           # NEW — interface freeze (ADPT-01)
│           ├── slug.ts            # NEW — naming convention validator/builders (ADPT-02)
│           └── index.ts           # NEW — registry skeleton
├── dashboard/
│   └── tests/
│       └── slug.test.ts           # NEW — unit tests for slug.ts
├── routines-codex/                # NEW — empty sibling
│   └── .gitkeep
├── routines-gemini/               # NEW — empty sibling
│   └── .gitkeep
└── templates/                     # NEW — empty placeholder for Phase 6 templates
    └── .gitkeep
```

**What does NOT change in Phase 1:**
- No change to `dashboard/lib/queue.ts` (QueueSource widening is Phase 5).
- No change to `dashboard/lib/routines.ts` (v0.1 routine listing stays as-is; unified bundle reader is Phase 2/3).
- No change to any other `dashboard/lib/` file.
- No change to `dashboard/package.json` (no new deps).
- No change to any file under `hooks/`, `routines-local/`, `routines-cloud/`, `bin/`, `install.sh`.

### Pattern 1: Interface Signatures (Locked — ADPT-01)

**Source convention:** Pulled from `.planning/research/ARCHITECTURE.md` §Layer 2, adjusted per v0.1 `.planning/codebase/CONVENTIONS.md` rules (result-object error returns, explicit types, consistent field shapes across the adapter layer).

```typescript
// dashboard/lib/runtime-adapters/types.ts

/**
 * Discriminant for the adapter registry. Exact four values — any fifth runtime
 * (Amp, Devin) is explicitly deferred to v0.3 per REQUIREMENTS.md out-of-scope.
 */
export type Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini";

/**
 * Reversibility color; re-exported from queue.ts semantics for adapter use.
 * Phase 1 owns the declaration here because queue.ts cannot depend on
 * runtime-adapters (the dep graph points the other direction).
 */
export type Reversibility = "green" | "yellow" | "red";

/**
 * Canonical representation of a routine on disk. One bundle per deployed
 * agent. The `runtime` field is the discriminant used by `getAdapter()`.
 */
export interface RoutineBundle {
  /** Slug (directory name under routines-<runtime>/); matches ^[a-z][a-z0-9-]{0,63}$ */
  slug: string;
  /** Runtime this bundle targets — the discriminant */
  runtime: Runtime;
  /** Human-readable name from config/frontmatter */
  name: string;
  /** Prompt body (from SKILL.md for claude-desktop; prompt.md for others) */
  prompt: string;
  /** Cron-5 expression (or null for event-triggered cloud routines) */
  schedule: string | null;
  /** Reversibility classification for hook/supervisor gating */
  reversibility: Reversibility;
  /** Approximate char/token budget for budget-cap enforcement */
  budget: number;
  /** Absolute path to the bundle directory on disk */
  bundlePath: string;
}

/** Outcome of deploy() or undeploy(). Never throws for adapter-level failures. */
export interface DeployResult {
  ok: boolean;
  /** Path of the artifact written (plist, symlink, deeplink file) — for debugging */
  artifact?: string;
  /** If the adapter needs a browser handoff (claude-routines), URL to open */
  handoffUrl?: string;
  /** User-facing error message if ok === false */
  error?: string;
}

/** Outcome of runNow(). */
export interface RunNowResult {
  ok: boolean;
  /** Session id (Claude Routines) or local pid (codex/gemini) */
  runId?: string;
  /** Optional URL to watch the run */
  watchUrl?: string;
  error?: string;
}

/** Individual run record returned by listRuns(). */
export interface RunRecord {
  ts: string;
  runId: string;
  status: "running" | "succeeded" | "failed" | "deferred";
  /** First ~500 chars of stdout for queue display */
  preview?: string;
}

/** Output of healthCheck() — drives the landing-page health badges. */
export interface HealthStatus {
  runtime: Runtime;
  /** CLI present on PATH (local) or credentials configured (cloud) */
  available: boolean;
  /** e.g. "codex 0.121.0" */
  version?: string;
  /** User-facing reason if unavailable, e.g. "codex not in PATH" */
  reason?: string;
}

/**
 * Every runtime adapter implements this interface. All methods MUST be async.
 * Methods MUST return result objects on adapter-level failures and MUST NOT
 * throw except for programmer bugs (null deref, bad input from a caller
 * bypassing the builders). The UI renders `{ok: false, error}` gracefully.
 */
export interface RuntimeAdapter {
  readonly runtime: Runtime;

  /** Wire the bundle into its runtime. Idempotent. */
  deploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Remove the bundle from its runtime. Idempotent (missing = success). */
  undeploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Fire the routine now. Optional freeform context (alert body, etc.). */
  runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult>;

  /** Recent runs for this bundle. May be empty. */
  listRuns(bundle: RoutineBundle, limit?: number): Promise<RunRecord[]>;

  /** Probe runtime availability (PATH check, credential probe, etc.). */
  healthCheck(): Promise<HealthStatus>;
}
```

**Rationale for specific field decisions:**

- `slug: string` (not `id: string` as research draft had) — matches CLAUDE.md Conventions wording ("Routine slugs: `<runtime>/<slug>`") and disambiguates from `QueueEntry.id` (which is `q_<ulid>`).
- `runtime: Runtime` (required, not optional) — discriminant must always be present; bundles read from disk infer it from directory (Phase 2 bundles.ts).
- `schedule: string | null` — cloud routines with `type: "api"` or `type: "github"` have no cron; null is the explicit "no schedule" signal.
- `reversibility: Reversibility` (required, not optional as research draft had `"green" | "yellow" | "red"`) — adapters always need a default; editor enforces a user pick in Phase 3.
- `budget: number` (required) — ditto; char/token budget is a core Sleepwalker concept.
- `bundlePath: string` (absolute path) — adapters need this for `codex exec --cd <bundlePath>` and similar; cleaner than reconstructing from slug+runtime.
- `deploy()` returns `Promise<DeployResult>` with `ok`, `artifact?`, `handoffUrl?`, `error?` — keeps `handoffUrl` optional because only `claude-routines` uses it.
- `undeploy()` returns `Promise<DeployResult>` (same shape) — allows `artifact` to report "removed this plist"; no new type needed.
- `listRuns(bundle, limit?)` — `limit` defaults to implementation's choice (research suggests 20 for queue display).
- `healthCheck()` takes no arguments — runtime-level, not bundle-level.
- `readonly runtime: Runtime` on the interface — makes `getAdapter("codex").runtime === "codex"` compile-time verifiable for exhaustiveness checks.

### Pattern 2: Naming Convention Rules (Locked — ADPT-02)

All identifiers derive from a `(runtime, slug)` tuple. The builders in `slug.ts` are the single source of truth; no downstream code writes these strings by hand.

| Identifier | Format | Example (runtime=codex, slug=morning-brief) | Builder |
|------------|--------|---------------------------------------------|---------|
| Slug (atomic) | `^[a-z][a-z0-9-]{0,63}$` | `morning-brief` | `validateSlug(s)` |
| Internal fleet key | `<runtime>/<slug>` | `codex/morning-brief` | `toFleetKey(runtime, slug)` |
| Launchd label | `com.sleepwalker.<runtime>.<slug>` | `com.sleepwalker.codex.morning-brief` | `toLaunchdLabel(runtime, slug)` |
| Marker tag (in prompt) | `[sleepwalker:<runtime>/<slug>]` | `[sleepwalker:codex/morning-brief]` | `toMarkerTag(runtime, slug)` |
| Cloud branch prefix | `claude/sleepwalker/<runtime>/<slug>/` | `claude/sleepwalker/codex/morning-brief/` | `toBranchPrefix(runtime, slug)` |
| Plist absolute path | `$HOME/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist` | `/Users/.../Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist` | `toPlistPath(runtime, slug)` |
| Bundle directory | `routines-<runtime>/<slug>/` | `routines-codex/morning-brief/` | `toBundleDir(runtime, slug)` (relative to repo root) |

**Parse direction:** `parseFleetKey("codex/morning-brief")` returns `{runtime: "codex", slug: "morning-brief"}` or `null` for invalid input. Used by audit-log readers and queue aggregators to split the key back into its parts.

**v0.1 compatibility (critical):**
- Legacy marker tag `[sleepwalker:<slug>]` (e.g. `[sleepwalker:downloads-organizer]`) still appears in the 14 v0.1 routine prompts and in `hooks/_detect_fleet.sh`. These are NOT changed in Phase 1. The legacy form remains valid for v0.1 routines; v0.2 additions use the namespaced form.
- When a unified bundle reader is introduced (Phase 2/3), it infers `runtime` from the parent directory: `routines-local/` → `"claude-desktop"`, `routines-cloud/` → `"claude-routines"`. The `fleet` field in audit entries from v0.1 hooks stays as the bare slug; Phase 5's audit extension is where the widened `fleet: <runtime>/<slug>` shape starts appearing in NEW entries only.
- v0.1 cloud branch prefix is `claude/sleepwalker/<routine>/*` (see `routines-cloud/_test-zen/config.json` line: `"branch_policy": "claude/sleepwalker/test-zen/*"`). v0.2 extends to `claude/sleepwalker/<runtime>/<slug>/*` for NEW cloud routines; v0.1 prefixes stay valid.

**This is the single naming contract the rest of v0.2 compiles against.** Any downstream builder that needs a launchd label, marker tag, or branch prefix MUST import from `slug.ts` — string concatenation at call sites is treated as a bug.

### Pattern 3: Registry Skeleton (Compilable Stub)

```typescript
// dashboard/lib/runtime-adapters/index.ts

import type { RuntimeAdapter, Runtime, HealthStatus, RoutineBundle,
              DeployResult, RunNowResult, RunRecord } from "./types";

/**
 * Phase 1 stub: every method returns {ok: false, error: "not implemented (Phase 2)"}.
 * Phase 2 replaces these with real implementations, no interface changes.
 * Keeping the registry compilable lets downstream callers typecheck from day one.
 */
function notImplemented(runtime: Runtime): RuntimeAdapter {
  return {
    runtime,
    async deploy(_bundle: RoutineBundle): Promise<DeployResult> {
      return { ok: false, error: `adapter ${runtime} not implemented (Phase 2)` };
    },
    async undeploy(_bundle: RoutineBundle): Promise<DeployResult> {
      return { ok: false, error: `adapter ${runtime} not implemented (Phase 2)` };
    },
    async runNow(_bundle: RoutineBundle, _context?: string): Promise<RunNowResult> {
      return { ok: false, error: `adapter ${runtime} not implemented (Phase 2)` };
    },
    async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
      return [];
    },
    async healthCheck(): Promise<HealthStatus> {
      return { runtime, available: false, reason: `adapter ${runtime} not implemented (Phase 2)` };
    },
  };
}

export const ADAPTERS: Record<Runtime, RuntimeAdapter> = {
  "claude-routines": notImplemented("claude-routines"),
  "claude-desktop":  notImplemented("claude-desktop"),
  "codex":           notImplemented("codex"),
  "gemini":          notImplemented("gemini"),
};

export function getAdapter(runtime: Runtime): RuntimeAdapter {
  return ADAPTERS[runtime];
}

export async function healthCheckAll(): Promise<HealthStatus[]> {
  return Promise.all(Object.values(ADAPTERS).map((a) => a.healthCheck()));
}

// Convenience re-exports so `import { Runtime, RoutineBundle } from "@/lib/runtime-adapters"` works.
export type { Runtime, RoutineBundle, RuntimeAdapter, HealthStatus,
              DeployResult, RunNowResult, RunRecord, Reversibility } from "./types";
```

### Anti-Patterns to Avoid

- **String-concatenating launchd labels at call sites.** `` `com.sleepwalker.${runtime}.${slug}` `` scattered across 6 files means the convention drifts the moment one dev misspells it. Always import `toLaunchdLabel()` from `slug.ts`.
- **Making `runtime: Runtime` optional on `RoutineBundle`.** Optional = caller can forget = dispatch breaks silently. Required = compiler enforces the discriminant.
- **Throwing from adapter methods for expected failures.** "CLI not in PATH" is a business outcome, not a bug. Return `{ok: false, error: "..."}`. Reserve throws for programmer errors (null deref, wrong-type input).
- **Using a singleton manager / class (`RuntimeManager.getInstance().deploy(bundle)`).** Hides the registry, adds state, matches neither v0.1's functional module style nor the research's explicit anti-pattern call-out [CITED: `.planning/research/ARCHITECTURE.md` §Anti-Pattern 2].
- **Re-exporting types from the registry without a `type` keyword.** `export { Runtime } from "./types"` leaks into runtime; must use `export type { Runtime } from "./types"` with TypeScript 5.7 + `isolatedModules: true` (set in `dashboard/tsconfig.json` line 13).
- **Enum for `Runtime` instead of string literal union.** Research already rejected this (§Layer 2); worth calling out because JetBrains/VS Code refactor tooling sometimes auto-suggests enums.
- **Creating non-existent `.gitkeep` alternatives.** Some repos use `.keep`, `.placeholder`, or empty `README.md`. Sleepwalker's `.gitignore` (checked) does not exclude `.gitkeep`; it's the canonical choice and what OSS users expect.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug validation | Custom multi-regex with length/char checks | Single `^[a-z][a-z0-9-]{0,63}$` regex | CLAUDE.md + REQUIREMENTS.md already specify the exact regex; one-line `.test(s)` on the string is sufficient. Over-engineering invites drift. |
| Exhaustiveness check for `Runtime` | Manual `if (r === "codex") {...} else if (r === "gemini") {...}` chain | `Record<Runtime, T>` literal + TS switch with `never` exhaustiveness | `Record<Runtime, T>` forces all four keys at compile time. When a fifth runtime is added in v0.3, every consumer using `Record` errors immediately; manual chains silently miss the new case. |
| Interface versioning machinery | `interface RuntimeAdapterV1 { ... }` + "migration" helpers | Just freeze the interface in Phase 1 | The whole point of Phase 1 is to freeze the interface once. If v0.3 needs a different shape, create `RuntimeAdapterV2` then; do not pre-invent versioning. |
| Directory-existence polyfill | Conditional `.gitkeep` detection logic | Plain empty `.gitkeep` file | Git's standard idiom since 2008. Every OSS user on Linux/macOS/Windows handles it. |
| Schedule type (cron abstraction) | `{ kind: "cron", minute, hour, ... }` union | Raw `string \| null` in `RoutineBundle.schedule` | Adapters each parse the cron format they need. Codex/Gemini pass it through to `StartCalendarInterval`; Claude Routines passes it to `/schedule create`. A shared abstraction in Phase 1 would be premature — it would force every adapter author to use the same cron grammar when their runtimes may diverge. |

**Key insight:** Phase 1 is the most over-engineerable phase in v0.2 because it's pure design. The discipline is to ship the *smallest* compilable contract that unblocks Phase 2, not the richest possible abstraction. Every extra type, every helper, every pre-emptive "future-proofing" adds drift surface. Four types, one validator module, one registry skeleton. Done.

---

## Runtime State Inventory

> Phase 1 is **not** a rename/refactor/migration phase. This section is included for completeness with explicit "None" entries because Phase 1 adds net-new identifiers and paths that future phases will touch.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None.** Phase 1 writes zero data to any datastore. No ChromaDB, SQLite, Redis, or similar touched. `~/.sleepwalker/*.jsonl` files are untouched. | None |
| Live service config | **None.** No n8n workflows, no Datadog services, no Tailscale ACLs, no Cloudflare Tunnels. Sleepwalker has no external service integrations beyond GitHub (PR polling) and Anthropic (Claude Routines `/fire`). | None |
| OS-registered state | **None.** No new launchd plists are written in Phase 1. No Task Scheduler tasks, no systemd units, no pm2 processes. (Phase 2 writes plists via `launchctl bootstrap`; Phase 1 only defines the *types* that describe them.) | None |
| Secrets / env vars | **None.** No new secret names introduced. Existing secrets (`~/.sleepwalker/github-token`, `~/.sleepwalker/cloud-credentials.json`) are untouched. No new env var names — `SLEEPWALKER_MODE`, `SLEEPWALKER_FLEET`, `SLEEPWALKER_REEXECUTING` remain as-is. | None |
| Build artifacts / installed packages | **None.** No new npm/pip/cargo/brew packages. `dashboard/package.json` + `pnpm-lock.yaml` are unchanged in Phase 1. No compiled binaries, no egg-info, no image tags. | None |

**The canonical check:** After Phase 1 lands, the only observable state change in the repo is the addition of six new files (three `.ts`, one `.test.ts`, three `.gitkeep`). No user's machine state changes. No `install.sh` rerun needed. An existing v0.1 user could pull Phase 1 and notice nothing at runtime.

---

## Common Pitfalls

### Pitfall 1: Interface thrash after Phase 2 starts

**What goes wrong:** Phase 1 ships a "provisional" interface; a Phase 2 adapter author discovers a missing field (e.g. `deploy()` actually needs a `force?: boolean` flag) and opens a PR to amend `types.ts`. Now every sibling adapter in flight merges stale types.
**Why it happens:** Phase 1 research isn't thorough enough about all four adapters' concrete needs, or adapter authors aren't forced to read the interface before coding.
**How to avoid:** Before writing `types.ts`, walk through `.planning/research/ARCHITECTURE.md` §Layer 8 "End-to-End Data Flow" line-by-line and cross-check each adapter's deploy/undeploy/runNow path against the interface. The research already did this; Phase 1 just codifies it. Also: require Phase 2 adapter plans to explicitly reference the frozen interface and justify any amendment.
**Warning signs:** A Phase 2 plan says "modify `types.ts` to add ..." — if this appears, freeze should be re-negotiated openly, not silently amended.

### Pitfall 2: `.gitkeep` files end up tracked but directories aren't reachable

**What goes wrong:** The dev creates `routines-codex/` with a `.gitkeep` file, commits, then a later phase deletes the `.gitkeep` (thinking it's legacy) and now the empty directory vanishes from fresh clones.
**Why it happens:** `.gitkeep` has no official meaning — it's convention only; developers unfamiliar with the trick delete it.
**How to avoid:** Add a one-line comment in the phase plan that every `.gitkeep` contains a single line: `# Placeholder — do not delete; empty dirs are not tracked by git` (as a comment inside the file; `.gitkeep` is technically free-form content). Any `.gitkeep` encountered in later phases with this comment is preserved.
**Warning signs:** Phase 3 editor plan says "write first routine to `routines-codex/` ..." without addressing the `.gitkeep` file. Editor should co-exist with the placeholder; first real bundle written is first reason to consider removing `.gitkeep`.

### Pitfall 3: Slug regex rejects valid identifiers that v0.1 uses

**What goes wrong:** Regex `^[a-z][a-z0-9-]{0,63}$` correctly rejects `_test-zen` (the leading underscore) and `sleepwalker-inbox-triage` (too long? count: 25 chars, fine). But `sleepwalker-screenshot-reviewer` is 31 chars, also fine. A subtler trap: v0.1 has `_test-zen` as a deliberately-underscored integration-test bundle. The regex rejects it — so if Phase 3 editor validates existing directories, it fails on this path.
**Why it happens:** Validation is applied retroactively to legacy data.
**How to avoid:** Phase 1 `validateSlug()` is for NEW slugs (editor input). It's not a loader validator. The unified bundle reader in Phase 2/3 must NOT re-validate existing paths. Document this separation: "`validateSlug()` is for authoring, not loading."
**Warning signs:** A test case in `slug.test.ts` assumes `_test-zen` is rejected AND that rejection is meaningful for bundle listing. Loading and authoring are different code paths.

### Pitfall 4: Runtime discriminant drift between TypeScript and bash

**What goes wrong:** TypeScript has `Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini"`. The bash supervisor (`bin/sleepwalker-run-cli` — Phase 2) uses `case "$RUNTIME"` with hardcoded strings. Six months in, someone renames `claude-routines` to `claude-cloud` in TS but forgets bash.
**Why it happens:** Two source-of-truth systems.
**How to avoid:** In Phase 1, commit to `Runtime` string values matching exactly what bash uses in path construction. Phase 2 supervisor MUST reference `$RUNTIME` values via the same exact strings. Document in `slug.ts` header: "These Runtime values are duplicated in `bin/sleepwalker-run-cli` (Phase 2+). Changes must update both."
**Warning signs:** Phase 2 plan introduces a bash-side `RUNTIME_ALIAS` map or similar indirection. That's smell — the values must be identical.

### Pitfall 5: Importing types from the registry barrel creates cycles

**What goes wrong:** Phase 2 adapter imports `ADAPTERS` from `./index.ts` for some reason (maybe an adapter introspects its peers for health checks). Because `index.ts` imports every adapter, and each adapter imports types from `index.ts` via the re-export barrel, you get a circular dependency. TypeScript tolerates circular imports at the module level; values come out `undefined` at the import site.
**Why it happens:** Re-exporting types through the registry file looks elegant but creates an import graph `adapter → index → adapter`.
**How to avoid:** Adapters MUST import types from `./types` (not from `./index`). The `index.ts` re-export is purely for external consumers (editor, bundle reader) who want one-stop shopping. Document this rule in the `index.ts` file header: "Internal adapters import from `./types`. External consumers may import from either but `./types` is preferred for types."
**Warning signs:** TypeScript emits a "circular dependency detected" note, or `getAdapter("codex")` returns `undefined` in a debugger.

---

## Code Examples

### `types.ts` — full file

See §Pattern 1 (Interface Signatures Locked). That block IS the full `types.ts` file, ~70 lines including JSDoc.

### `slug.ts` — proposed implementation

```typescript
// dashboard/lib/runtime-adapters/slug.ts
//
// Single source of truth for the <runtime>/<slug> namespacing convention.
// Every downstream consumer constructs identifiers via these builders.
//
// CRITICAL: The Runtime values below are duplicated in bin/sleepwalker-run-cli
// (Phase 2+). Changes to the tuple must update both.

import os from "node:os";
import path from "node:path";
import type { Runtime } from "./types";

/** All four runtimes, authoritative order. Used for exhaustiveness checks. */
export const RUNTIMES: readonly Runtime[] =
  ["claude-routines", "claude-desktop", "codex", "gemini"] as const;

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

/** True if `s` matches the canonical slug regex. */
export function validateSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}

/** True if `r` is one of the four authorized runtimes. */
export function isRuntime(r: string): r is Runtime {
  return (RUNTIMES as readonly string[]).includes(r);
}

/** `<runtime>/<slug>` — internal fleet key. */
export function toFleetKey(runtime: Runtime, slug: string): string {
  return `${runtime}/${slug}`;
}

/** Parse a fleet key back into its parts. Returns null if malformed. */
export function parseFleetKey(
  key: string,
): { runtime: Runtime; slug: string } | null {
  const slashIdx = key.indexOf("/");
  if (slashIdx <= 0) return null;
  const runtime = key.slice(0, slashIdx);
  const slug = key.slice(slashIdx + 1);
  if (!isRuntime(runtime)) return null;
  if (!validateSlug(slug)) return null;
  return { runtime, slug };
}

/** `com.sleepwalker.<runtime>.<slug>` — launchd label. */
export function toLaunchdLabel(runtime: Runtime, slug: string): string {
  return `com.sleepwalker.${runtime}.${slug}`;
}

/** `[sleepwalker:<runtime>/<slug>]` — marker tag embedded in prompts. */
export function toMarkerTag(runtime: Runtime, slug: string): string {
  return `[sleepwalker:${runtime}/${slug}]`;
}

/** `claude/sleepwalker/<runtime>/<slug>/` — cloud branch prefix (no trailing *). */
export function toBranchPrefix(runtime: Runtime, slug: string): string {
  return `claude/sleepwalker/${runtime}/${slug}/`;
}

/** Absolute path to the launchd plist for (runtime, slug). */
export function toPlistPath(runtime: Runtime, slug: string): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, "Library", "LaunchAgents",
    `${toLaunchdLabel(runtime, slug)}.plist`);
}

/** Repo-relative bundle directory: `routines-<runtime>/<slug>/`. */
export function toBundleDir(runtime: Runtime, slug: string): string {
  const dirName = runtime === "claude-desktop" ? "routines-local"
    : runtime === "claude-routines" ? "routines-cloud"
    : `routines-${runtime}`;
  return path.join(dirName, slug);
}
```

**Note on `toBundleDir`:** The claude-desktop and claude-routines branches return `routines-local/<slug>` and `routines-cloud/<slug>` respectively — preserving v0.1 directory names. Only NEW runtimes (codex, gemini) use the `routines-<runtime>/` pattern. This keeps v0.1 paths byte-identical.

### `slug.test.ts` — proposed test cases

```typescript
// dashboard/tests/slug.test.ts
import { describe, it, expect } from "vitest";
import {
  validateSlug,
  isRuntime,
  toFleetKey,
  parseFleetKey,
  toLaunchdLabel,
  toMarkerTag,
  toBranchPrefix,
  toPlistPath,
  toBundleDir,
  RUNTIMES,
} from "@/lib/runtime-adapters/slug";

describe("validateSlug", () => {
  it("accepts canonical kebab-case", () => {
    expect(validateSlug("morning-brief")).toBe(true);
    expect(validateSlug("a")).toBe(true);
    expect(validateSlug("a-b-c-1-2-3")).toBe(true);
  });

  it("rejects leading digits, uppercase, spaces, path segments", () => {
    expect(validateSlug("1-start")).toBe(false);
    expect(validateSlug("Morning-Brief")).toBe(false);
    expect(validateSlug("has spaces")).toBe(false);
    expect(validateSlug("../etc/passwd")).toBe(false);
    expect(validateSlug("_test-zen")).toBe(false); // legacy v0.1 _test-zen is not a NEW slug
  });

  it("rejects slugs over 64 chars", () => {
    expect(validateSlug("a".repeat(64))).toBe(true);
    expect(validateSlug("a".repeat(65))).toBe(false);
  });
});

describe("isRuntime", () => {
  it("accepts all four authorized runtimes", () => {
    for (const r of RUNTIMES) expect(isRuntime(r)).toBe(true);
  });
  it("rejects v0.3 candidates", () => {
    expect(isRuntime("amp")).toBe(false);
    expect(isRuntime("devin")).toBe(false);
    expect(isRuntime("")).toBe(false);
  });
});

describe("identifier builders", () => {
  it("toFleetKey produces <runtime>/<slug>", () => {
    expect(toFleetKey("codex", "morning-brief")).toBe("codex/morning-brief");
  });
  it("toLaunchdLabel produces com.sleepwalker.<runtime>.<slug>", () => {
    expect(toLaunchdLabel("gemini", "repo-scout")).toBe("com.sleepwalker.gemini.repo-scout");
  });
  it("toMarkerTag produces [sleepwalker:<runtime>/<slug>]", () => {
    expect(toMarkerTag("claude-desktop", "inbox-triage"))
      .toBe("[sleepwalker:claude-desktop/inbox-triage]");
  });
  it("toBranchPrefix produces claude/sleepwalker/<runtime>/<slug>/", () => {
    expect(toBranchPrefix("claude-routines", "pr-reviewer"))
      .toBe("claude/sleepwalker/claude-routines/pr-reviewer/");
  });
  it("toPlistPath includes $HOME/Library/LaunchAgents/", () => {
    const p = toPlistPath("codex", "morning-brief");
    expect(p).toContain("Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist");
  });
  it("toBundleDir preserves v0.1 paths for Claude runtimes", () => {
    expect(toBundleDir("claude-desktop", "inbox-triage")).toBe("routines-local/inbox-triage");
    expect(toBundleDir("claude-routines", "pr-reviewer")).toBe("routines-cloud/pr-reviewer");
    expect(toBundleDir("codex", "morning-brief")).toBe("routines-codex/morning-brief");
    expect(toBundleDir("gemini", "daily-brief")).toBe("routines-gemini/daily-brief");
  });
});

describe("parseFleetKey", () => {
  it("parses valid keys", () => {
    expect(parseFleetKey("codex/morning-brief"))
      .toEqual({ runtime: "codex", slug: "morning-brief" });
  });
  it("returns null for bad runtime, bad slug, or no slash", () => {
    expect(parseFleetKey("amp/foo")).toBeNull();
    expect(parseFleetKey("codex/1-bad")).toBeNull();
    expect(parseFleetKey("no-slash-here")).toBeNull();
    expect(parseFleetKey("/leading-slash")).toBeNull();
  });
});
```

This test file uses the `@/*` path alias (mapped to `./*` in `dashboard/tsconfig.json` line 17). Total: ~65 lines, ~25 assertions, 100% coverage of `slug.ts`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `launchctl load -w <plist>` (v0.1 era Apple tooling) | `launchctl bootstrap gui/$UID <plist>` | macOS 10.10 (2014) deprecated load/unload; Apple docs now flag them as legacy | Phase 2 uses `bootstrap/bootout`; Phase 1 only documents via `toPlistPath()` path. [CITED: `.planning/research/STACK.md` lines 54-55] |
| Abandoned `launchd.plist` npm package (v0.0.1, 2013) | Hand-rolled ~30-line XML template + `launchctl` shell-out | 2013 (original package abandoned) | No Phase 1 impact (no Node deps added); Phase 2 implements the writer. [CITED: `.planning/research/STACK.md` line 156] |
| Legacy v0.1 marker tag `[sleepwalker:<slug>]` (bare slug) | Namespaced `[sleepwalker:<runtime>/<slug>]` for NEW routines | v0.2 (this milestone) | Both formats valid; v0.1 prompts unchanged. Phase 1's `toMarkerTag()` produces only the new form. |
| Enums in TypeScript for runtime discriminants | String literal union (`type Runtime = "a" | "b" | "c"`) | TS 4.x+ idiom; reinforced by `isolatedModules: true` which warns on const enums | Phase 1 uses string literal union. [VERIFIED: `dashboard/tsconfig.json` line 13 `"isolatedModules": true`] |

**Deprecated / outdated:**
- **`interface Foo extends RuntimeAdapter`** — class inheritance style. Research explicitly rejects this [CITED: `.planning/research/ARCHITECTURE.md` §Anti-Pattern 1].
- **`RuntimeManager.getInstance()`** — singleton pattern. Explicit anti-pattern [CITED: `.planning/research/ARCHITECTURE.md` §Anti-Pattern 2].
- **Barrel `index.ts` files** — v0.1 codebase avoids them ("Barrel exports (index.ts) not used; import directly from module" per `.planning/codebase/CONVENTIONS.md` line 248). Phase 1 makes ONE exception: `dashboard/lib/runtime-adapters/index.ts` holds the registry. Types are still imported from `./types` by convention.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RoutineBundle.reversibility` should be required (not optional) | Interface Signatures Locked | Low — the editor (Phase 3) forces a user pick; every existing v0.1 routine has a policy default. If this is wrong, changing to `reversibility?: Reversibility` is a backward-compatible amendment. |
| A2 | `RoutineBundle.budget` should be a `number` (char count), not a typed `{ kind: "chars", value: number } \| { kind: "tokens", value: number }` | Interface Signatures Locked | Low — research [CITED: `.planning/research/SUMMARY.md` line 258] confirms char-based approximation is the chosen v0.2 approach; tokenizer is explicit out-of-scope. |
| A3 | `claude-desktop` routines live at `routines-local/<slug>/` (NOT `routines-local/sleepwalker-<slug>/` as v0.1 does) for NEW bundles | `toBundleDir()` builder logic | Medium — v0.1 uses the `sleepwalker-<slug>` prefix on local directories. If the unified bundle reader must handle BOTH naming schemes, Phase 2/3 will need to strip the prefix. Alternative: require NEW claude-desktop routines to live at `routines-local/sleepwalker-<slug>/` too. Current assumption is that v0.2 editor output uses the plain slug (no `sleepwalker-` prefix) because the slug is already scoped by `<runtime>/`; this simplifies the convention. **Needs confirmation in Phase 2 planning.** |
| A4 | Circular dependency between registry `index.ts` and adapter modules won't trigger (because all four adapter modules are stubs in Phase 1 and import only from `./types`) | Pitfall #5 | Low — Phase 1 stubs are all inline in `index.ts` via `notImplemented()`. Phase 2's real adapters must follow the `import from "./types"` rule. |
| A5 | `.gitkeep` is the correct empty-directory idiom; no alternative (`.keep`, empty `README.md`) is preferred in this repo | Project Structure | Very low — universal OSS idiom, not opinionated. |
| A6 | `noEmit: true` in `tsconfig.json` means Next.js (not `tsc`) handles compilation, so `pnpm typecheck` is the correct verification command for Phase 1 | Validation Architecture | Very low — [VERIFIED: `dashboard/tsconfig.json` line 9 `"noEmit": true`, `dashboard/package.json` line 11 `"typecheck": "tsc --noEmit"`]. |
| A7 | Cloud branch prefix change from `claude/sleepwalker/<slug>/` (v0.1) to `claude/sleepwalker/<runtime>/<slug>/` (v0.2) does not retroactively break v0.1 cloud routines | `toBranchPrefix()` builder | Low — v0.1 routines' `config.json` has `branch_policy` stored with the old prefix (e.g. `"claude/sleepwalker/test-zen/*"`). Queue aggregator matches on the prefix literally. No v0.1 file changes. NEW v0.2 cloud routines get the namespaced prefix. |

**If this table contains items flagged Medium or High risk:** User confirmation during `/gsd-plan-phase` discuss step is recommended. A3 is the only Medium item here — surface it to the planner so Phase 1 either resolves the directory-naming question or explicitly defers it to Phase 2 bundle-reader design.

---

## Open Questions (RESOLVED)

1. **Should ADPT-02 (naming convention) ship as a runtime validator, or as types + documentation only?**
   - **RESOLVED:** Ship `slug.ts` in Phase 1 as a standalone validator module. Locked into Plan 01-03 with `validateSlug`, `isRuntime`, five builders (`toFleetKey`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath`, `toBundleDir`), and `parseFleetKey` round-trip utility.
   - **What we know:** The regex and identifier formats are fully specified. TypeScript alone can enforce `Runtime` values. A validator adds ~30 lines of code + one test file.
   - **Rationale:** (a) Phase 2 adapters will construct launchd labels and marker tags — they need the builders; (b) deferring means Phase 2 plan either defines the builders ad hoc (drift risk) or imports from Phase 3 (temporal backward dep); (c) a self-contained validator module with unit tests is ~15 min of work and locks behavior.

2. **Does Phase 1 touch any v0.1 code to honor the new naming convention?**
   - **RESOLVED:** Phase 1 touches zero v0.1 files. Plan 01-04 enforces this with an automated `git diff HEAD~1 HEAD` frozen-surface gate over the enumerated v0.1 file list.
   - **What we know:** v0.1 code uses bare slugs (`inbox-triage`, `pr-reviewer`) in `QueueEntry.fleet`, audit JSONL `fleet` field, marker tags in routine prompts, and `branch_policy` in `routines-cloud/*/config.json`. All 14 routines and `hooks/_detect_fleet.sh` match on the bare slug form.
   - **Rationale:** The ROADMAP and upstream research explicitly say "NO v0.1 changes in Phase 1." Specifically untouched:
     - `dashboard/lib/queue.ts` — untouched (QueueSource widening is Phase 5)
     - `dashboard/lib/routines.ts` — untouched (unified reader is Phase 2/3)
     - `hooks/*.sh` — untouched (forever frozen)
     - `routines-local/*`, `routines-cloud/*` — untouched
     - `install.sh` — untouched
   - **Only additive changes in Phase 1.** Backward-compat verification is Phase 6's integration test job, not Phase 1's concern.

3. **How do existing v0.1 routines get a `runtime` field?**
   - **RESOLVED:** Deferred to Phase 2/3 via the unified bundle reader (`bundles.ts`). Phase 1 ships zero data migrations.
   - **What we know:** v0.1 SKILL.md and prompt.md files do NOT contain a `runtime:` frontmatter field. The unified bundle reader infers `runtime` from the parent directory.
   - **Rationale:** Phase 1 does not touch v0.1 bundle files. The unified reader (`bundles.ts`, Phase 2) is where directory → runtime inference lives:
     - `routines-local/sleepwalker-*/SKILL.md` → `runtime: "claude-desktop"`
     - `routines-cloud/<id>/config.json` → `runtime: "claude-routines"`
     - `routines-codex/<id>/config.json` → `runtime: "codex"`
     - `routines-gemini/<id>/config.json` → `runtime: "gemini"`
   - Keeps Phase 1 pure (zero data touch) and puts the inference alongside the reading logic, where it's easiest to test.

4. **Should `types.ts` and `index.ts` be in the same file, given how small Phase 1 is?**
   - **RESOLVED:** Keep the three-file split under `dashboard/lib/runtime-adapters/`. Plan 01-01 ships `types.ts` + `index.ts` as distinct files; Plan 01-03 adds `slug.ts` alongside them.
   - **What we know:** `types.ts` is ~70 lines; `index.ts` is ~40 lines; `slug.ts` is ~50 lines. Combined: ~160 lines in one file.
   - **Rationale:** (a) Phase 2 adds four more adapter files to the same directory — single-file approach would require a later refactor; (b) `index.ts` naturally becomes the registry entry point for external imports; (c) `types.ts` is the frozen-contract file that other phases treat as the source of truth — distinct-file naming signals its stability intent; (d) Phase 6 OSS-readability goal benefits from "open `types.ts`, see the whole interface."

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript compile, Vitest run | ✓ | 22.x (inferred from v0.1 STACK.md) | — |
| pnpm | Install + run scripts | ✓ | (lockfile present at `dashboard/pnpm-lock.yaml`) | — |
| TypeScript 5.7.2 | `pnpm typecheck` | ✓ | 5.7.2 [VERIFIED: `dashboard/package.json`] | — |
| Vitest 2.1.8 | `pnpm test` | ✓ | 2.1.8 [VERIFIED: `dashboard/package.json`] | — |
| git | Version control only (commits) | ✓ | (v0.1 depends on it) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Phase 1 is the lowest-risk phase possible for environment concerns** — it adds only TypeScript source files and has no external tool requirements beyond what v0.1 already mandates.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `dashboard/vitest.config.ts` |
| Quick run command | `cd dashboard && pnpm test -- slug.test.ts` (specific test file) |
| Full suite command | `cd dashboard && pnpm test` (all 43 existing + 1 new) |
| Typecheck command | `cd dashboard && pnpm typecheck` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADPT-01 | `RuntimeAdapter` interface compiles without errors and can be implemented by a stub | typecheck | `cd dashboard && pnpm typecheck` | ❌ Wave 0 — `types.ts` file must exist |
| ADPT-01 | `ADAPTERS` registry keys all four runtimes exhaustively (compile-time check via `Record<Runtime, RuntimeAdapter>`) | typecheck | `cd dashboard && pnpm typecheck` | ❌ Wave 0 — `index.ts` file must exist |
| ADPT-01 | `getAdapter("codex")` returns a stub that resolves `{ok: false, error: "..."}` for deploy/undeploy/runNow and `{available: false}` for healthCheck | unit | `cd dashboard && pnpm test -- runtime-adapters-stub.test.ts` (OPTIONAL — see note below) | ❌ Wave 0 — test file optional |
| ADPT-02 | `validateSlug("morning-brief")` === `true`; `validateSlug("1-bad")` === `false`; etc. | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ Wave 0 — `slug.test.ts` must be created |
| ADPT-02 | Identifier builders produce the documented exact strings for all four runtimes | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ Wave 0 — same file |
| ADPT-02 | `parseFleetKey("codex/morning-brief")` round-trips; rejects bad runtime or bad slug | unit | `cd dashboard && pnpm test -- slug.test.ts` | ❌ Wave 0 — same file |
| ADPT-01 + backward-compat | Existing 43 dashboard tests still pass unchanged | unit | `cd dashboard && pnpm test` | ✅ v0.1 tests exist and pass |
| Directory structure | `routines-codex/`, `routines-gemini/`, `templates/` exist as directories with at least one tracked file | smoke | `test -d routines-codex && test -d routines-gemini && test -d templates && ls routines-codex/.gitkeep routines-gemini/.gitkeep templates/.gitkeep` | ❌ Wave 0 — directories must be created |
| Frozen surface | v0.1 files untouched (byte-identical) | smoke | `git diff HEAD -- install.sh hooks/ routines-local/ routines-cloud/ dashboard/lib/queue.ts dashboard/lib/routines.ts dashboard/lib/cloud.ts dashboard/lib/cloud-cache.ts dashboard/lib/queue-aggregator.ts dashboard/lib/settings.ts dashboard/lib/approval.ts dashboard/lib/audit.ts dashboard/lib/github.ts dashboard/lib/fire-routine.ts \| wc -l` → must equal `0` | ✅ git available |

**Note on stub test (`runtime-adapters-stub.test.ts`):** Testing that stubs return `{ok: false, error: "not implemented"}` is of limited value — it's verifying implementation details of placeholder code. Recommendation: **skip this test**. The typecheck alone confirms `ADAPTERS` has all four keys and that each adapter satisfies the `RuntimeAdapter` interface. Phase 2 will replace stubs with real implementations and add proper adapter tests. Explicit decision to ship ADPT-01 with only typecheck verification plus the downstream `slug.test.ts` keeps Phase 1 scope minimal.

### Sampling Rate

- **Per task commit:** `cd dashboard && pnpm typecheck && pnpm test -- slug.test.ts` (< 10 seconds)
- **Per wave merge:** `cd dashboard && pnpm typecheck && pnpm test` (full 44-test suite, < 30 seconds)
- **Phase gate:** Full suite green + `git diff` frozen-surface check returns empty + three directory smoke checks pass

### Wave 0 Gaps

- [ ] `dashboard/lib/runtime-adapters/types.ts` — covers ADPT-01 (contract)
- [ ] `dashboard/lib/runtime-adapters/slug.ts` — covers ADPT-02 (validator + builders)
- [ ] `dashboard/lib/runtime-adapters/index.ts` — registry skeleton (ADPT-01 compilation)
- [ ] `dashboard/tests/slug.test.ts` — unit tests for ADPT-02 (8 `it()` blocks, ~25 assertions)
- [ ] `routines-codex/.gitkeep` — empty sibling directory (ADPT-02 artifact)
- [ ] `routines-gemini/.gitkeep` — empty sibling directory (ADPT-02 artifact)
- [ ] `templates/.gitkeep` — empty placeholder for Phase 6

**No framework install needed** — Vitest + TypeScript are already wired in v0.1. No config changes to `vitest.config.ts` or `tsconfig.json`.

### Anti-Requirements (What Phase 1 MUST NOT Touch)

Per CLAUDE.md "Frozen backward-compat surface" and ROADMAP Phase 1 success criterion #3 ("all four v0.1 routine paths remain byte-identical"):

- ❌ `install.sh` — no changes
- ❌ `hooks/*.sh`, `hooks/tests/*.sh` — no changes
- ❌ `routines-local/sleepwalker-*/SKILL.md` (all 6) — no changes
- ❌ `routines-cloud/<id>/{config.json,prompt.md,setup.md}` (all 9 including `_test-zen`) — no changes
- ❌ `bin/sleepwalker-execute` — no changes
- ❌ `dashboard/lib/queue.ts` — no changes (QueueSource widening is Phase 5)
- ❌ `dashboard/lib/routines.ts` — no changes
- ❌ `dashboard/lib/cloud.ts`, `cloud-cache.ts` — no changes
- ❌ `dashboard/lib/queue-aggregator.ts` — no changes
- ❌ `dashboard/lib/settings.ts`, `approval.ts`, `audit.ts`, `github.ts`, `fire-routine.ts` — no changes
- ❌ `dashboard/app/**` — no changes
- ❌ `dashboard/package.json` — no dependency additions (all Phase 1 work uses existing deps)
- ❌ `dashboard/tsconfig.json` — no config changes
- ❌ `dashboard/vitest.config.ts` — no config changes
- ❌ `.planning/**` except this RESEARCH.md and future PLAN.md files — no changes

**Verification command for "no frozen-surface diffs":**
```bash
# After Phase 1 commit, from repo root:
git diff HEAD~1 HEAD -- \
  install.sh \
  hooks/ \
  routines-local/ routines-cloud/ \
  bin/sleepwalker-execute \
  dashboard/lib/queue.ts dashboard/lib/routines.ts dashboard/lib/cloud.ts \
  dashboard/lib/cloud-cache.ts dashboard/lib/queue-aggregator.ts \
  dashboard/lib/settings.ts dashboard/lib/approval.ts dashboard/lib/audit.ts \
  dashboard/lib/github.ts dashboard/lib/fire-routine.ts \
  dashboard/app/ \
  dashboard/package.json dashboard/tsconfig.json dashboard/vitest.config.ts \
  | wc -l
# Expected output: 0
```

---

## Security Domain

> Phase 1 has minimal security surface — it ships type declarations, a pure validator, and empty directories. No user input, no I/O, no secrets. This section is still required per project config (`security_enforcement` absent → enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in Phase 1 |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No access control |
| V5 Input Validation | yes (minimal) | `validateSlug()` enforces `^[a-z][a-z0-9-]{0,63}$` — blocks path traversal (`../`), leading dots, spaces, uppercase. No zod needed at this phase; the regex is the sole defense. |
| V6 Cryptography | no | No crypto |
| V7 Error Handling and Logging | partial | Stub adapters return `{ok: false, error: "..."}` — no stack traces leaked |
| V8 Data Protection | no | No data touched |
| V10 Malicious Code | n/a | Pure TS code; no dynamic evaluation |
| V12 File and Resources | yes (advisory) | `toPlistPath()` and `toBundleDir()` build paths from validated slug + fixed runtime tuple — safe by construction, no path traversal surface |

### Known Threat Patterns for {TypeScript types + slug validator}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via slug (`../etc/passwd`) | Tampering | `validateSlug()` regex rejects any `/` or `.` — verified by `slug.test.ts` case |
| Runtime discriminant injection (non-approved runtime smuggled through user input) | Tampering | `isRuntime(r)` type guard + string literal union — non-matching values fail at compile time for static callers and at runtime for dynamic ones |
| Identifier collision across namespaces | Spoofing | `<runtime>/<slug>` namespacing — Codex `daily-brief` and Gemini `daily-brief` resolve to distinct plist paths, marker tags, branch prefixes. Pitfall #7 from SUMMARY.md mitigated by construction |
| Slug overflow / DoS via long strings | DoS | 64-char regex limit ensures bounded identifier size |

**Explicitly deferred to later phases:**
- Secret scanning on prompt content — Phase 3 editor (`EDIT-02`)
- zod schema validation on bundle loads — Phase 2 `bundles.ts` (`ADPT-01` compile-time contract + Phase 2/3 runtime validation)
- plist XML escaping — Phase 2 `launchd-writer.ts` (`ADPT-03`)
- Shell injection via prompt in ProgramArguments — Phase 2 supervisor design (`ADPT-04`, `SAFE-02`)

---

## Project Constraints (from CLAUDE.md)

Extracted from `./CLAUDE.md` for planner compliance verification:

### From "Technology Stack" block
- Existing stack is frozen: Next.js 15.1.4, React 19, TypeScript 5.7, Tailwind 3.4, Vitest 2.1, pnpm, bash+jq hooks with `set -euo pipefail`.
- Net-new libraries listed (`execa`, `simple-git`, `zod`, `yaml`, `gray-matter`, `cronstrue`) are for Phase 2+ only — Phase 1 does NOT install any.

### From "Conventions" block
- Slug regex: `^[a-z][a-z0-9-]{0,63}$` — MUST match exactly (not `^[a-z][a-z0-9\-_]*$` or other variants).
- Identifier formats (CLAUDE.md verbatim):
  - Routine slugs: `<runtime>/<slug>`
  - Launchd label: `com.sleepwalker.<runtime>.<slug>`
  - Marker tag in prompts: `[sleepwalker:<runtime>/<slug>]`
  - Cloud branch prefix: `claude/sleepwalker/<runtime>/<slug>/*`
  - Plist path: `~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist`
- TypeScript: strict mode, camelCase, **result-object error returns (no throws for control flow)**.
- React components: PascalCase, `-client` suffix for client components.
- Server Actions preferred over API routes for form submission (N/A for Phase 1).

### From "Safety" block
- Secrets mode 0600, never in git, never in logs — N/A for Phase 1 (no secrets touched).
- User-authored prompts NEVER in `ProgramArguments` — N/A for Phase 1 (no plist writes); relevant for Phase 2 adapter design.
- `NO_COLOR=1 TERM=dumb CI=true` + `stripVTControlCharacters()` — Phase 2 supervisor concern.

### From "Architecture" block
- **Frozen backward-compat surface** (quoted verbatim):
  - `install.sh` signature + idempotency
  - Hook script names + paths (`hooks/sleepwalker-*.sh`, `hooks/_detect_fleet.sh`)
  - `~/.sleepwalker/*.jsonl` schemas (`queue.jsonl`, `audit.jsonl`, etc.)
  - `~/.claude/settings.json` hook wiring
  - Existing `QueueEntry` field names
  - All 14 v0.1 routine paths
- **Build-order dependency chain (non-negotiable):**
  `types.ts` → (`launchd-writer.ts` + supervisor) → four adapters in parallel → `bundles.ts` + `routines.ts` extension → editor + deploy → queue widening + audit extension → docs + polish.

### From "GSD Workflow Enforcement" block
- Mode: `yolo` / Granularity: `standard` / Profile: `quality` — Phase 1 plan should honor the `quality` profile (thorough verification) despite the small surface.
- Do not make direct repo edits outside a GSD workflow unless explicitly asked to bypass.

### From global CLAUDE.md
- Conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- No emojis in commit messages.
- No AI attribution (no "Co-Authored-By: Claude", no "Generated with").
- Run typecheck before committing; build must succeed.
- After file changes, append to `docs/activity_log.md` with user prompt + actions taken.
- TypeScript strict mode enforced.

---

## Sources

### Primary (HIGH confidence)

- `.planning/research/ARCHITECTURE.md` §Layer 2 "The Core Question — Adapter Pattern Choice" — interface shape, registry pattern, adapter-pattern-vs-alternatives analysis [VERIFIED: read in full]
- `.planning/research/ARCHITECTURE.md` §Layer 11 "Backward Compatibility — The Frozen Surface" — exhaustive list of v0.1 files that must not change
- `.planning/research/ARCHITECTURE.md` §Anti-Patterns — confirms no-inheritance, no-singleton, no-enum decisions
- `.planning/research/SUMMARY.md` §Key Findings "Architecture Approach" — the four-adapter registry summary
- `.planning/REQUIREMENTS.md` — ADPT-01 and ADPT-02 full text
- `.planning/ROADMAP.md` Phase 1 block — goal, dependencies, requirements, success criteria
- `CLAUDE.md` — project-level conventions, naming, frozen surface
- `.planning/codebase/STRUCTURE.md` — existing directory layout
- `.planning/codebase/CONVENTIONS.md` lines 240-260 — "Barrel exports not used; import directly from module" pattern
- `.planning/codebase/STACK.md` — existing TS strict + Vitest + tsconfig details
- `dashboard/tsconfig.json` [VERIFIED: direct read] — `strict: true`, `isolatedModules: true`, `noEmit: true`, `@/*` path alias
- `dashboard/package.json` [VERIFIED: direct read] — Vitest 2.1.8, TypeScript 5.7.2, scripts
- `dashboard/lib/queue.ts` [VERIFIED: direct read] — existing QueueSource, QueueEntry, Reversibility type definitions (Phase 1 must NOT modify these)
- `dashboard/lib/routines.ts` [VERIFIED: direct read] — existing v0.1 routine listing (must NOT modify)
- `.planning/config.json` [VERIFIED: direct read] — `workflow.nyquist_validation: true`, confirms validation section is required

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — npm-view-verified versions of future Phase 2+ libraries; nothing installed in Phase 1
- `.planning/research/PITFALLS.md` — referenced by SUMMARY.md (not directly re-read in this research; cited claims fall back to SUMMARY.md's paraphrase)

### Tertiary (LOW confidence)

- None. All Phase 1 claims are grounded in directly-read files or verified configuration.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — Zero new dependencies; v0.1 stack is settled and verified via `dashboard/package.json`.
- Architecture: **HIGH** — Interface shape is pre-researched and locked at ARCHITECTURE.md level; Phase 1 codifies specifics.
- Naming convention: **HIGH** — Exact format specified in CLAUDE.md and REQUIREMENTS.md; regex pattern unambiguous.
- Anti-requirements (frozen surface): **HIGH** — v0.1 files enumerated in three places (CLAUDE.md, ARCHITECTURE.md §Layer 11, ROADMAP.md success criterion #3); cross-verified.
- Pitfalls: **MEDIUM** — Pitfalls listed are Phase 1-specific (interface thrash, `.gitkeep` durability, regex-on-legacy). Most heavy-duty pitfalls (launchd PATH, shell injection, auth collision) belong to Phase 2.

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stable because Phase 1 ships only TypeScript types and convention builders; no external API dependency windows)
**Phase status:** Research complete. Planner can proceed with `/gsd-plan-phase 1` immediately.
