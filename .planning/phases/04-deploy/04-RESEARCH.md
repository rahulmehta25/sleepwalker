# Phase 4: Deploy — Research

**Researched:** 2026-04-19
**Domain:** Deploy state-machine orchestration, per-runtime rollback, drift detection, run-now dispatch, server-side git operations, landing-page runtime health badges
**Confidence:** HIGH (live-probe-verified adapter contracts + npm registry + macOS lock-primitive verification; small number of [ASSUMED] items surfaced in Assumptions Log)

## Summary

Phase 4 wires Phase 2 adapters (sealed) + Phase 3 editor bundles (sealed) into five one-click dashboard surfaces: Deploy, Run-now, enable/disable, Save-to-repo, and landing-page health badges. Every adapter primitive this phase consumes already exists: `getAdapter(runtime).deploy() / undeploy() / runNow() / healthCheck()` are live in `dashboard/lib/runtime-adapters/index.ts` and return result objects (never throw for adapter-level failures). Phase 3 established the Server Action + `useActionState` pattern (`dashboard/app/editor/actions.ts`), the atomic directory-swap pattern (`dashboard/lib/atomic-write.ts`), and the read-side bundle enumerator (`dashboard/lib/bundles.ts`). Phase 4 is strictly composition — no new primitives required.

Three net-new concerns this phase introduces: (1) a 4-stage deploy state file at `~/.sleepwalker/deploys/<slug>.state.json` that must survive process death, (2) a server-side git-lock primitive that macOS does NOT ship `flock(1)` for (live-probe verified — `/usr/bin/flock` absent on Darwin 25.4), and (3) a client-side health-badge polling surface that must not block the Morning Queue server render. All three are resolvable with existing stack patterns: atomic state writes (reuse `atomic-write.ts`), `proper-lockfile` (mkdir-based cross-filesystem locking — simple-git docs confirm it ships its own git-index locking, so our app-level lock protects against two Server Action invocations racing on our staged path, not against `git` itself), and client `fetch` + `sessionStorage` cache.

**Primary recommendation:** Model every Phase 4 Server Action on the Phase 3 `saveRoutine` template (discriminated-union result + zod validation + result-object error surface). Use `proper-lockfile@4.1.2` — NOT shell `flock` — for the `~/.sleepwalker/git.lock` mutex. Add a thin `dashboard/lib/deploy-state.ts` module that owns state-file reads/writes through the atomic-write primitive. Add `dashboard/app/api/health/all/route.ts` as the only new Route Handler; all other new surfaces are Server Actions.

## User Constraints (from CONTEXT.md)

> **Note:** Phase 4 has no dedicated CONTEXT.md — the `/gsd-plan-phase` invocation supplies the 3 inherited open questions and additional context directly from the orchestrator. Those are resolved in the "Resolved Open Questions" section below. The 04-UI-SPEC.md (APPROVED 2026-04-19) is the locked visual/interaction contract.

### Locked Decisions (from Phase 4 UI-SPEC + upstream)

- **4-stage state machine:** `planning → writing → loading → verified` (ROADMAP §Phase 4 SC#1; DEPL-01; UI-SPEC §Deploy state machine)
- **State-file path:** `~/.sleepwalker/deploys/<slug>.state.json` (DEPL-01 verbatim)
- **Polling cadence:** 500ms (UI-SPEC §Polling and background work)
- **Rollback scope:** on any step failure — `launchctl bootout` + delete plist + delete state-file + surface error (DEPL-02 verbatim)
- **Drift detection:** `mtime(bundle) > mtime(deployed artifact)` (DEPL-03 verbatim)
- **Drift rendering:** passive per-card pill + Deploy→Redeploy swap; NO top-of-page warning (UI-SPEC Discretion decision)
- **Run-now dispatch:** Claude Routines → `fire-routine.ts` (browser handoff URL from Phase 2 adapter); Claude Desktop → `claude -p` via adapter; Codex/Gemini → supervisor in run-now mode (DEPL-04 verbatim)
- **Enable/disable:** `bootout` on disable, `bootstrap` on enable, persisted in `config.json` (DEPL-05 verbatim)
- **First-enable auto-deploy:** enabling a Draft routine opens the Deploy drawer first (UI-SPEC invariant: `enabled ⇒ deployed+verified`)
- **Save-to-repo:** explicit-path `git add`, flock on `~/.sleepwalker/git.lock`, `git diff --stat` BEFORE confirm, never auto-pushes, never sweeps unrelated uncommitted (REPO-01 verbatim)
- **Save-to-repo two-stage modal:** Review diff → Confirm commit message; flock held across both stages (UI-SPEC §Save-to-repo)
- **Health badges:** 4 runtime badges in existing `PageHeader meta` slot on `/`; client-side `fetch('/api/health/all')`; 60s sessionStorage cache (UI-SPEC §Landing-page health badge row)
- **No push affordance anywhere in UI** (REPO-01 hard invariant)
- **No SSE/WebSocket** — polling only (research/STACK.md carryover, UI-SPEC §Polling)
- **Result-object error returns** (CLAUDE.md + project convention)

### Claude's Discretion (resolved in this research)

- Whether `~/.sleepwalker/deploys/<slug>.state.json` is written by a new module or inline in the Server Action → **new `dashboard/lib/deploy-state.ts`** module (composability, testability; mirrors Phase 3 `bundles.ts` + `atomic-write.ts`)
- Whether to use a shell `flock` or a Node lock library → **`proper-lockfile`** (macOS ships no `flock(1)`; live-probe confirms)
- Polling mechanism: Route Handler vs Server Action → **Server Action `getDeployState`** (type-safe, no new route; UI-SPEC already names this Server Action)
- Health check API endpoint: Route Handler or Server Action → **Route Handler** `GET /api/health/all` (UI-SPEC explicitly names this — client `fetch()` requires an HTTP endpoint, cannot call Server Actions from a `useEffect` without a POST boundary)
- Rollback orchestration — async vs blocking → **blocking with visible progress** (see Resolved Question #1)
- Save-to-repo flock UX → **non-blocking `flock -n` (immediate failure)** with amber "Another save-to-repo is in progress" message (see Resolved Question #2)
- Health cache invalidation → **60s TTL + window-focus invalidation + manual refresh icon on each badge** (see Resolved Question #3)
- Rollback step-ordering on codex/gemini failure → plist delete AFTER bootout (see §Rollback Orchestration)

### Deferred Ideas (OUT OF SCOPE)

- Live log streaming (explicit anti-feature per research/STACK.md)
- Manual `git push` from UI (REPO-01 excludes)
- A dedicated `/deploy/{slug}` route (UI-SPEC rejected — drawer wins)
- A "Test run" synchronous mode (deferred to v2 requirements — TEST-01)
- Cross-runtime fan-out (OUT OF SCOPE per PROJECT.md)
- Streaming per-runtime health (bounded 2s Promise.allSettled suffices)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPL-01 | Deploy button + 4-stage state machine tracked in `~/.sleepwalker/deploys/<slug>.state.json`; UI polls until terminal | §Deploy State Machine Design; §Server Action API |
| DEPL-02 | Auto-rollback on any step failure — `launchctl bootout` + delete plist + delete state + error; zero orphaned artifacts | §Rollback Orchestration; Resolved Q#1 |
| DEPL-03 | Routine card Draft/Deployed/Drift states via `mtime(bundle) > mtime(deployed artifact)`; "Redeploy" pill on drift | §Drift Detection |
| DEPL-04 | Run-now per runtime — Claude Routines `/fire`, Claude Desktop `claude -p`, Codex/Gemini supervisor in run-now mode | §Run-Now Dispatch |
| DEPL-05 | Per-routine enable/disable toggle — `bootout` on disable, `bootstrap` on enable; persisted in `config.json` | §Enable/Disable Toggle |
| REPO-01 | Save-to-repo — explicit-path `git add`, flock, `git diff --stat` preview, never auto-pushes | §Save-to-Repo Flow; Resolved Q#2 |
| HLTH-01 | Four runtime health badges (brew-doctor pattern) — green/amber/grey with tooltip | §Health Badge Implementation; Resolved Q#3 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deploy state machine orchestration | Next.js server (Server Action) | Browser (polls) | State-file writes are filesystem ops — must run on the server; browser polls via a read-only Server Action |
| `launchctl bootstrap/bootout` invocation | Next.js server | — | `execFile` into macOS system binary — server-only |
| Deploy state file persistence | OS filesystem (`~/.sleepwalker/deploys/`) | — | Survives process death; read by both server (future reboots) and poll endpoint |
| Rollback cleanup | Next.js server | — | Must run on same host that did the install |
| Drift detection (mtime compare) | Next.js server | — | `fs.stat` on server during `listRoutines()`; pure read |
| Run-now dispatch (Codex/Gemini) | Next.js server → detached supervisor subprocess | OS launchd (NOT involved for run-now) | Supervisor is invoked directly via `spawn(detached)`, not through launchd — matches Phase 2 adapter pattern |
| Run-now dispatch (Claude Routines) | Browser | Next.js server (generates URL) | Adapter returns `handoffUrl` (no programmatic route); browser opens in new tab |
| Run-now dispatch (Claude Desktop) | Next.js server | — | `claude -p` via `execFile` — fire-and-forget |
| Save-to-repo git operations | Next.js server | OS filesystem (repo root) | `simple-git` + lock file — server-only |
| `~/.sleepwalker/git.lock` mutex | OS filesystem (lock file) | Next.js server (acquire/release) | Cross-process lock via `proper-lockfile` mkdir primitive |
| Health badge data fetch | Browser → Next.js server (Route Handler) | — | Server runs `healthCheckAll()`; browser caches in sessionStorage |
| Health badge UI state | Browser (sessionStorage + React state) | — | Cached per-tab; survives navigation |

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.1.4 | App Router + Server Actions + Route Handlers | Already shipped v0.1/v0.2 [VERIFIED: dashboard/package.json] |
| react | 19.0.0 | useActionState + useOptimistic + Suspense | Phase 3 uses all three [VERIFIED: dashboard/package.json] |
| zod | 4.3.6 | Server Action input validation | Phase 3 pattern — reuse [VERIFIED: dashboard/package.json] |
| framer-motion | 11.15.0 | Drawer slide-in + step pill color cascade | Phase 3 UI-SPEC / Phase 4 UI-SPEC inherit [VERIFIED: dashboard/package.json] |
| lucide-react | 0.468.0 | Rocket/Play/RefreshCw/GitCommit/Power/etc icons | Phase 4 UI-SPEC glyph list [VERIFIED: dashboard/package.json] |
| vitest | 2.1.8 | Test runner | v0.1/Phase 2/Phase 3 pattern [VERIFIED: dashboard/package.json] |
| gray-matter | 4.0.3 | SKILL.md frontmatter parsing (bundles.ts already uses) | Phase 3 pattern [VERIFIED: dashboard/package.json] |

### Net-new for Phase 4

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-git | 3.36.0 | Save-to-repo git add/diff/commit | Locked in research/STACK.md [VERIFIED: npm view — `3.36.0` modified 2026-04-12]; 11M+ weekly downloads; shells out to user's git binary (already a v0.1 dep); TypeScript types included |
| proper-lockfile | 4.1.2 | macOS-portable file-lock for `~/.sleepwalker/git.lock` | macOS does NOT ship `flock(1)` — live-probe confirmed [VERIFIED: `command -v flock` returns empty on Darwin 25.4]. Uses `mkdir` atomicity (works on any filesystem, including APFS, NFS, SMB). 30M+ weekly downloads. Moxystudio-maintained; stable API since 2018 |

**Version verification (live-probed 2026-04-19):**

```bash
$ npm view simple-git version
3.36.0
$ npm view simple-git time.modified
2026-04-12T05:33:06.112Z
$ command -v flock
# (empty — macOS does NOT ship flock)
$ ls /usr/bin/shlock
/usr/bin/shlock    # macOS DOES ship shlock — but API is awkward and non-portable
```

**Installation (single pnpm add):**

```bash
cd dashboard
pnpm add simple-git@3.36.0 proper-lockfile@4.1.2
pnpm add -D @types/proper-lockfile
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| proper-lockfile | shell out to `flock` | macOS does NOT ship `flock(1)`. Using it via Homebrew (`util-linux`) would add a non-portable install step that violates the "clone → first routine in 10 min" POLISH requirement |
| proper-lockfile | `shlock` (macOS built-in) | Available but PID-file-based with no stale-lock detection; `proper-lockfile`'s mtime refresh handles crash recovery |
| proper-lockfile | `npm/lockfile` | `proper-lockfile` uses mkdir (works on NFS); `npm/lockfile` uses `O_EXCL` which has NFS problems — not a concern for us but proper-lockfile also auto-refreshes mtime which recovers from crashed holders |
| simple-git | shell out to `git` via `execFile` | Works for 4 commands, but `simple-git` gives us typed errors, commit-hash parsing, `.diffSummary()` as a structured object, and makes mocking cleaner in vitest |
| simple-git | `isomorphic-git` | Browser-targeted; we're server-side — simple-git's 11M vs isomorphic-git's 1.1M weekly downloads reflects server-side preference |
| Server Action for `getDeployState` | Route Handler `GET /api/deploy/:slug/state` | Server Action is type-safe; UI-SPEC-named; 500ms polling of a Server Action from a `useEffect` setInterval works fine (React 19 supports this) |
| Client `setInterval` polling | Server-Sent Events | Explicit anti-pattern per research/STACK.md; polling is the project convention |
| `fetch('/api/health/all')` cached in sessionStorage | Server-render with Suspense boundary | UI-SPEC §Layout Contract resolved this: `healthCheckAll()` can take 2s and would block Morning Queue render |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `~/.sleepwalker/deploys/` directory is NEW in Phase 4 [VERIFIED: `ls ~/.sleepwalker/deploys/` returns "DOES NOT EXIST"]. `~/.sleepwalker/audit.jsonl`, `queue.jsonl`, `settings.json` already exist from v0.1 — Phase 4 does not modify schema [VERIFIED: `ls ~/.sleepwalker/` shows 8 existing files] | Create `~/.sleepwalker/deploys/` on first deploy-state write (recursive `fs.mkdir`) |
| **Live service config** | None for Phase 4. Run-now for claude-routines uses existing v0.1 cloud-credentials.json via `getCloudCredential()` | None |
| **OS-registered state** | `launchctl bootstrap/bootout` are the Phase 2-established operations — Phase 4 calls them from Server Actions. Plist labels follow `com.sleepwalker.<runtime>.<slug>` (ADPT-02 frozen convention) | Verify rollback nests bootout BEFORE plist unlink (order matters — see §Rollback Orchestration) |
| **Secrets / env vars** | None introduced. Phase 4 does not read/write secrets; auth paths all stay inside adapters that already handle them. `~/.sleepwalker/git.lock` is a lockfile (no payload) | None |
| **Build artifacts / installed packages** | `simple-git` + `proper-lockfile` added to `dashboard/package.json`. Next build output includes new Server Actions under `dashboard/app/routines/actions.ts` + new Route Handler under `dashboard/app/api/health/all/route.ts` | Re-run `pnpm install` after merge; `pnpm build` to ensure Server Action bundling works |

**Nothing found in categories marked "None":** State explicitly verified against `ls ~/.sleepwalker/`, `grep -r 'deploys' dashboard/lib/`, and Phase 2 CONTEXT.md + 03-SUMMARY.md review.

## Deploy State Machine Design

### State File Shape

```ts
// dashboard/lib/deploy-state.ts

export type DeployStep = "planning" | "writing" | "loading" | "verified";

export type DeployPhase =
  | { kind: "running"; step: DeployStep; stepStartedAt: number }
  | { kind: "succeeded" }
  | {
      kind: "rolled-back";
      failedStep: DeployStep;
      error: string;
      rollbackActions: Array<{ action: string; ok: boolean; error?: string }>;
    };

export interface DeployState {
  /** "<runtime>/<slug>" — the canonical fleet key from slug.ts::toFleetKey */
  fleet: string;
  runtime: Runtime;
  slug: string;
  /** ISO 8601 when deploy was initiated */
  startedAt: string;
  /** ms epoch per-step completion (or rollback time) */
  steps: Partial<Record<DeployStep, { startedAt: number; completedAt?: number; elapsedMs?: number }>>;
  phase: DeployPhase;
  /** Artifact path (plist for codex/gemini, SKILL.md path for claude-desktop, handoff URL for claude-routines) — written by step "writing" */
  artifact?: string;
  /**
   * Used by drift detection: `mtime(bundle) > verifiedAt` ⇒ drift.
   * ms epoch. Set when phase transitions to succeeded.
   */
  verifiedAt?: number;
}
```

**Naming convention:** state-file is `~/.sleepwalker/deploys/<runtime>-<slug>.state.json` (slash-free to avoid nested-dir semantics; label-like for grep-ability). The filename mirrors `toLaunchdLabel("codex", "daily-brief") = com.sleepwalker.codex.daily-brief` — strip the `com.sleepwalker.` prefix.

### State Transitions

```
[enter]             ← Server Action deployRoutine invoked
   │
   ▼
  planning          ← Resolve bundle, validate paths, check adapter.healthCheck()
   │  ok
   ▼
  writing           ← adapter.deploy(bundle) returns {ok, artifact}
   │  ok
   ▼
  loading           ← launchctl bootstrap (already inside adapter.deploy for codex/gemini;
   │               this step verifies via launchctl print)
   │  ok
   ▼
  verified          ← Terminal success: phase.kind = "succeeded", verifiedAt set
   │
   └── any failure → rolled-back (phase.kind = "rolled-back", rollback sequence runs)
```

**Critical detail: step names are FIXED by DEPL-01 (`planning → writing → loading → verified`) but the work attributed to each step is a Phase 4 decision.** The mapping I recommend:

| Step | Server-side work |
|------|------------------|
| **planning** | (1) Read bundle via `readBundle(runtime, slug)`; (2) Call `adapter.healthCheck()` and fail-fast if `available: false`; (3) for gemini, confirm quota project via `readQuotaProject()` (adapter already enforces but planning step lets UI surface the error earlier); (4) Create `~/.sleepwalker/deploys/` if absent |
| **writing** | Call `adapter.deploy(bundle)`. For codex/gemini this writes the plist to disk AND runs `launchctl bootstrap`. For claude-desktop it writes SKILL.md. For claude-routines it builds the handoff URL (no disk write). Capture `result.artifact` into state. |
| **loading** | (codex/gemini only) Verify the job is registered: `launchctl print gui/<uid>/<label>` returns 0. For claude-desktop: verify SKILL.md exists at target path. For claude-routines: no-op (handoff URL is informational). |
| **verified** | Mark state `succeeded`, set `verifiedAt = Date.now()`, write state file one last time |

**Note on codex/gemini conflation:** Phase 2's `codex.ts::deploy()` already does the bootstrap internally. So from the state machine's POV, "writing" and "loading" are both work the adapter does on its own. To give the UI a real visible distinction, the Server Action runs a separate `launchctl print` verification after the adapter's deploy returns — that's the "loading" step. This is a transparent enhancement (no adapter changes).

### State Writes: Atomic Pattern

Reuse `dashboard/lib/atomic-write.ts` (Phase 3). State writes follow the same directory-swap idiom:

```ts
// deploy-state.ts
export async function writeDeployState(state: DeployState): Promise<void> {
  const dir = path.join(os.homedir(), ".sleepwalker", "deploys");
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${state.runtime}-${state.slug}.state.json`;
  const finalPath = path.join(dir, filename);
  // For a single-file write we don't need atomicWriteBundle's directory swap;
  // fs.writeFile + fs.rename is sufficient. Use .tmp-<rand> then rename.
  const tmpPath = `${finalPath}.tmp-${crypto.randomBytes(6).toString("hex")}`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(state, null, 2), { mode: 0o644 });
  await fs.promises.rename(tmpPath, finalPath);
}

export async function readDeployState(runtime: Runtime, slug: string): Promise<DeployState | null> {
  const p = path.join(os.homedir(), ".sleepwalker", "deploys", `${runtime}-${slug}.state.json`);
  try {
    return JSON.parse(await fs.promises.readFile(p, "utf8")) as DeployState;
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e; // unexpected IO error — surface to caller
  }
}

export async function deleteDeployState(runtime: Runtime, slug: string): Promise<void> {
  const p = path.join(os.homedir(), ".sleepwalker", "deploys", `${runtime}-${slug}.state.json`);
  await fs.promises.rm(p, { force: true }); // force:true = idempotent on ENOENT
}
```

**Why `fs.writeFile + rename` instead of `atomicWriteBundle`:** the state file is a single file, not a directory. Directory-swap is overkill. A `tmp-<rand> + rename` gives the same POSIX-atomic guarantee for single files (same filesystem, APFS-safe).

### Polling Mechanism

Client-side: `useEffect` with `setInterval(500ms)` invoking a Server Action `getDeployState({runtime, slug})`. Return on terminal state (`phase.kind ∈ {"succeeded", "rolled-back"}`). Teardown: `clearInterval` in effect cleanup.

Server Action signature:

```ts
// dashboard/app/routines/actions.ts
"use server";
export async function getDeployState(args: { runtime: Runtime; slug: string }):
  Promise<DeployState | null> {
  // Thin pass-through to deploy-state.ts::readDeployState. No mutation.
  return readDeployState(args.runtime, args.slug);
}
```

**Why Server Action over Route Handler:** Server Actions are typed end-to-end (no JSON hand-parse on the client), don't require a route-file, and Phase 3's `checkSlugAvailability` is the established precedent for polling-style Server Actions.

**Polling rate 500ms matches UI-SPEC.** 4-step happy path ≈ 200–800ms total, so 2–4 polls suffice.

## Rollback Orchestration

### Rollback Contract (DEPL-02)

On ANY step failure, the Server Action runs a rollback sequence and writes a terminal `rolled-back` state. **Zero orphaned artifacts** is the hard invariant.

### Per-Runtime Rollback Order

**Codex / Gemini (launchd-backed):**

```
1. adapter.undeploy(bundle)   # Phase 2 uninstallPlist — runs launchctl bootout + fs.unlink(plistPath). Idempotent.
2. deleteDeployState(runtime, slug)  # force:true = idempotent
3. Return { ok: false, error: failedStep.error }
```

**Claude Desktop:**

```
1. adapter.undeploy(bundle)   # Phase 2 — recursive rm of ~/.claude/scheduled-tasks/<slug>/. force:true = idempotent
2. deleteDeployState(runtime, slug)
3. Return { ok: false, error }
```

**Claude Routines:**

```
1. adapter.undeploy(bundle)   # Returns browser-handoff URL; no actual cleanup needed (user never completed the handoff)
2. deleteDeployState(runtime, slug)
3. Return { ok: false, error }
```

### Ordering Invariant

`launchctl bootout` **before** plist file unlink. Rationale: if we unlink the plist first, launchd still holds the registered job in memory; a later `bootout` can fail with "Operation not found." The Phase 2 `uninstallPlist` in launchd-writer.ts already enforces this order — we just have to call `adapter.undeploy()`, not hand-roll cleanup.

### Nested Error Handling

**If rollback itself fails** (e.g., `launchctl bootout` returns non-zero because the job wasn't actually loaded), we MUST still:
1. Write the `rolled-back` state with `rollbackActions` array capturing each attempted step's result
2. Return `{ ok: false, error }` to the UI
3. **Never throw** — UI surface is result-object

```ts
// inside deployRoutine:
async function rollback(runtime: Runtime, bundle: RoutineBundle, failedStep: DeployStep, error: string) {
  const rollbackActions: Array<{action: string; ok: boolean; error?: string}> = [];
  try {
    const undeployRes = await getAdapter(runtime).undeploy(bundle);
    rollbackActions.push({ action: "adapter.undeploy", ok: undeployRes.ok, error: undeployRes.error });
  } catch (e: any) {
    rollbackActions.push({ action: "adapter.undeploy", ok: false, error: String(e?.message ?? e) });
  }
  try {
    await deleteDeployState(runtime, bundle.slug);
    rollbackActions.push({ action: "deleteDeployState", ok: true });
  } catch (e: any) {
    rollbackActions.push({ action: "deleteDeployState", ok: false, error: String(e?.message ?? e) });
  }
  await writeDeployState({ ...baseState, phase: { kind: "rolled-back", failedStep, error, rollbackActions } });
}
```

### Blocking vs Async Rollback

**See Resolved Question #1 below.** Decision: **blocking with visible progress** — the rollback runs synchronously inside the Server Action; UI polls show step pills transitioning red; drawer shows rollback banner when terminal state lands.

## Drift Detection (DEPL-03)

### Algorithm

For each bundle in `listBundles()`:

```ts
async function computeStatus(desc: BundleDescriptor): Promise<"draft" | "deployed" | "drift" | "disabled"> {
  const state = await readDeployState(desc.runtime, desc.slug);
  if (!state || state.phase.kind !== "succeeded") return "draft";
  const bundleMtime = (await fs.promises.stat(desc.bundleDir)).mtimeMs;
  if (state.verifiedAt && bundleMtime > state.verifiedAt) return "drift";
  const enabled = await readRoutineEnabledFlag(desc.runtime, desc.slug);
  if (!enabled) return "disabled";
  return "deployed";
}
```

### Execution Site

**Server-side only** — runs inside `listRoutines()` on every `/routines` page render. `page.tsx` is `export const dynamic = "force-dynamic"` (already set — verified in file). No client polling for drift.

### Performance

`fs.stat` is a single syscall per bundle. With 14 v0.1 + expected <50 v0.2 routines (~60 total), that's 60 stats + 60 state-file reads on a page render — well under 100ms on SSD. Non-issue. [VERIFIED: fs.stat benchmark on APFS typically <0.5ms per call]

### `mtime(bundle)` subtlety

`fs.stat` on the **directory** (`routines-codex/daily-brief/`) returns mtime of the directory itself, which changes ONLY when files are added/removed (not when file contents change). **We need the max mtime across the directory's contents.**

```ts
async function bundleMtime(dir: string): Promise<number> {
  const entries = await fs.promises.readdir(dir);
  const stats = await Promise.all(entries.map(e => fs.promises.stat(path.join(dir, e))));
  return Math.max(...stats.map(s => s.mtimeMs), (await fs.promises.stat(dir)).mtimeMs);
}
```

This picks up SKILL.md, config.json, prompt.md edits — the actual authoring surface.

## Run-Now Dispatch (DEPL-04)

### Per-Runtime Implementation

All four are already implemented in Phase 2 adapters (verified by reading `claude-routines.ts`, `claude-desktop.ts`, `codex.ts`, `gemini.ts`). Phase 4's job is to wrap them in a single Server Action.

```ts
// dashboard/app/routines/actions.ts
"use server";
export async function runNowRoutine(args: { runtime: Runtime; slug: string }):
  Promise<{ ok: true; runId?: string; handoffUrl?: string } | { ok: false; error: string }> {
  const bundle = readBundle(args.runtime, args.slug);
  if (!bundle) return { ok: false, error: `Bundle not found: ${args.runtime}/${args.slug}` };
  const adapter = getAdapter(args.runtime);
  const result = await adapter.runNow(toRoutineBundle(bundle));  // adapt RoutineBundleRead → RoutineBundle
  return result.ok
    ? { ok: true, runId: result.runId, handoffUrl: result.watchUrl }
    : { ok: false, error: result.error ?? "unknown" };
}
```

**Key finding from code-read:**

| Runtime | runNow implementation (from Phase 2 adapter) |
|---------|-----|
| `claude-routines` | Wraps `fire-routine.ts::fireRoutine()` — returns `{sessionId, sessionUrl}` from Anthropic `/fire` endpoint |
| `claude-desktop` | `execFile("claude", ["-p", promptArg])` with prompt concatenated + optional `<context>` block. **No stdin** — prompt is in argv. Safe because `execFile` doesn't invoke a shell |
| `codex` | `spawn(supervisor, ["codex", slug], { detached: true, stdio: "ignore" }); child.unref()` — fire-and-forget |
| `gemini` | Same as codex, with `gemini` as first supervisor arg |

### Supervisor run-now vs scheduled discrimination

The supervisor already handles run-now transparently. Reading `bin/sleepwalker-run-cli` lines 1–100:
- Supervisor accepts `<runtime> <slug>` argv
- It does NOT differentiate "scheduled" vs "run-now" — it just runs
- The sleep-window gate (lines 95–100) applies either way (run-now during sleep still gets deferred)
- Audit emission (lines 51–63) produces the SAME shape regardless of invocation source

**This matches DEPL-04's "same audit shape as scheduled runs" requirement perfectly.** No supervisor changes needed.

**Decision for the planner:** Codex/Gemini run-now calls the adapter's `runNow()` which spawns the supervisor `detached + unref`. Audit entry appears in `~/.sleepwalker/audit.jsonl` a few hundred ms later. The UI's toast copy (from UI-SPEC) says "watch the Morning Queue" — that's accurate: Phase 5 will wire these audit entries into the queue.

### UI state after run-now

- `claude-routines`: UI opens handoff URL in new tab (`window.open(url, "_blank", "noopener,noreferrer")`). Toast: aurora pill.
- `claude-desktop` / `codex` / `gemini`: Toast shows `Started {slug} on {runtime}`. Green pill. Optional `?highlight=` link.

**Button anti-double-click:** ≥800ms busy window (UI-SPEC §Run-now).

## Save-to-Repo Flow (REPO-01)

### Architecture

Two Server Actions, one lock, two stages:

```
previewSaveToRepo → holds lock → returns diff
                                          │
                                          │ user reviews
                                          ▼
                                    commitSaveToRepo → uses held lock → commits → releases lock
                                          │
                                          │ or user cancels
                                          ▼
                                    releaseSaveLock → git reset + release lock
```

### simple-git Usage

```ts
// dashboard/lib/save-to-repo.ts
import { simpleGit, type SimpleGit } from "simple-git";
import * as lockfile from "proper-lockfile";
import path from "node:path";
import os from "node:os";

function gitLockPath(): string {
  const dir = path.join(os.homedir(), ".sleepwalker");
  // proper-lockfile creates <target>.lock — we point at a sentinel file
  return path.join(dir, "git.lock.sentinel");
}

export interface PreviewResult {
  ok: true;
  files: Array<{ path: string; added: number; removed: number }>;
  totals: { filesChanged: number; added: number; removed: number };
  suggestedMessage: string;
  lockToken: string;  // opaque handle the client passes back to commitSaveToRepo
}

export type SaveToRepoError =
  | { ok: false; kind: "lock-busy"; error: string }
  | { ok: false; kind: "no-changes"; error: string }
  | { ok: false; kind: "git-error"; error: string };

export async function previewSaveToRepo(
  runtime: Runtime,
  slug: string,
): Promise<PreviewResult | SaveToRepoError> {
  // Sentinel file must exist — proper-lockfile needs a target to lock against
  await fs.promises.mkdir(path.join(os.homedir(), ".sleepwalker"), { recursive: true });
  await fs.promises.writeFile(gitLockPath(), "", { flag: "a" }); // idempotent touch

  let release: () => Promise<void>;
  try {
    // retries: 0 = non-blocking — immediate failure if held (Resolved Q#2)
    release = await lockfile.lock(gitLockPath(), { retries: 0, stale: 30_000 });
  } catch (e: any) {
    if (e.code === "ELOCKED") {
      return { ok: false, kind: "lock-busy", error: "Another save-to-repo is in progress. Wait a moment and try again." };
    }
    return { ok: false, kind: "git-error", error: e.message };
  }

  try {
    const repoRoot = path.resolve(process.cwd(), "..");  // dashboard/ cwd → parent = repo root
    const git: SimpleGit = simpleGit(repoRoot);
    const subpath = `${RUNTIME_ROOT[runtime]}/${slug}/`;

    // Explicit-path git add. The -- separator prevents path-vs-flag ambiguity.
    // Add . inside the subpath directory — stages only that subtree.
    await git.add([`--`, subpath]);

    // git diff --cached --stat --numstat gives both human summary and parseable columns.
    const diff = await git.diffSummary(["--cached", "--", subpath]);

    if (diff.files.length === 0) {
      await git.raw(["reset", "--", subpath]);  // clean up (no-op if nothing staged)
      await release();
      return { ok: false, kind: "no-changes", error: "No changes to commit — bundle is in sync with HEAD." };
    }

    // Determine commit verb: if any prior commit touched this subpath → "update", else "add"
    const logForPath = await git.log({ "--": null, file: subpath, maxCount: 1 }).catch(() => ({ all: [] }));
    const verb = logForPath.all.length > 0 ? "update" : "add";
    const suggestedMessage = `feat(routines): ${verb} ${runtime}/${slug}`;

    // Generate a lock token the client can pass to commitSaveToRepo. Since Server Actions
    // don't share process state across requests in general, we actually store the release
    // callback in a module-scoped Map keyed by a random token.
    const lockToken = crypto.randomBytes(16).toString("hex");
    LOCK_REGISTRY.set(lockToken, { release, runtime, slug, startedAt: Date.now() });

    return {
      ok: true,
      files: diff.files.map(f => ({ path: f.file, added: f.insertions, removed: f.deletions })),
      totals: { filesChanged: diff.files.length, added: diff.insertions, removed: diff.deletions },
      suggestedMessage,
      lockToken,
    };
  } catch (e: any) {
    await release().catch(() => {});  // best-effort
    return { ok: false, kind: "git-error", error: e.message };
  }
}

// Module-scope map. Next.js Server Actions share a Node process — this works.
// [ASSUMED] validates in Phase 4 dev smoke: Server Actions within one dev/prod server instance
//          share module-scope state. In multi-process deployments this would NOT work, but
//          Sleepwalker is localhost:4001 single-process per CLAUDE.md.
const LOCK_REGISTRY = new Map<string, { release: () => Promise<void>; runtime: Runtime; slug: string; startedAt: number }>();

export async function commitSaveToRepo(args: { lockToken: string; message: string }) {
  const entry = LOCK_REGISTRY.get(args.lockToken);
  if (!entry) return { ok: false, error: "Lock expired. Reopen Save to repo." };
  try {
    const git = simpleGit(path.resolve(process.cwd(), ".."));
    const commit = await git.commit(args.message);
    LOCK_REGISTRY.delete(args.lockToken);
    await entry.release();
    return { ok: true, sha: commit.commit, shortSha: commit.commit.slice(0, 7) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function releaseSaveLock(args: { lockToken: string }) {
  const entry = LOCK_REGISTRY.get(args.lockToken);
  if (!entry) return { ok: true };  // idempotent
  try {
    const git = simpleGit(path.resolve(process.cwd(), ".."));
    const subpath = `${RUNTIME_ROOT[entry.runtime]}/${entry.slug}/`;
    await git.raw(["reset", "--", subpath]);
  } catch {
    /* best-effort reset */
  }
  LOCK_REGISTRY.delete(args.lockToken);
  await entry.release();
  return { ok: true };
}
```

### Never-sweep invariant

The `git.add(["--", subpath])` call stages ONLY files under `routines-<runtime>/<slug>/`. It **does not** use `git add .` or `git add -A`. Even if the user has uncommitted changes in other files (say, `dashboard/lib/foo.ts`), they stay unstaged.

### Never-push invariant

`git.push` is NEVER called in any code path. The Server Actions only invoke `git.add`, `git.diffSummary`, `git.commit`, `git.raw(["reset", ...])`, `git.log`. This is grep-verifiable: `grep 'git.push\|--force-with-lease' dashboard/` should return empty after Phase 4.

### Stale-lock recovery

`proper-lockfile` automatically refreshes the lock's mtime while held. If a Server Action process crashes while holding the lock, `proper-lockfile` considers the lock stale after `stale: 30_000ms` (30s). The next save-to-repo attempt will reclaim it.

## Enable/Disable Toggle (DEPL-05)

### Storage

Enable flag is persisted in the bundle's `config.json` (codex/gemini) or in `~/.sleepwalker/settings.json::enabled_routines` set (claude-desktop/claude-routines — matches existing v0.1 `setEnabled` in `dashboard/lib/routines.ts`).

**Recommendation for the planner:** For consistency across the 4 runtimes, unify on a new `~/.sleepwalker/routines.json` that has `enabled: {runtime, slug, enabled}[]`. **BUT** — this breaks COMP-02 (v0.1 settings.json is frozen). Keep v0.1 behavior for claude-desktop; add a new field in codex/gemini `config.json`:

```json
{
  "name": "Daily Brief",
  "runtime": "codex",
  "slug": "daily-brief",
  "schedule": "0 3 * * *",
  "reversibility": "green",
  "budget": 50000,
  "enabled": true   // <-- new field, defaults to true on save
}
```

**Claude Desktop:** continue using `settings.json::enabled_routines` (existing v0.1 pattern; `routines.ts::setEnabled` already shipped).

**Claude Routines:** does not have a local enable/disable — the routine is a cloud resource. Toggle is still shown for symmetry but maps to a different operation: disabling a claude-routines routine "archives" the local handoff-URL so the user can't accidentally re-open it. No launchctl involvement.

### Server Action

```ts
export async function setRoutineEnabled(args: { runtime: Runtime; slug: string; enabled: boolean }) {
  const bundle = readBundle(args.runtime, args.slug);
  if (!bundle) return { ok: false, error: "Bundle not found" };

  const adapter = getAdapter(args.runtime);

  if (args.enabled) {
    // First-enable path: check if deployed. If not, user should have already triggered
    // deploy via the drawer (UI-SPEC: "enabled ⇒ deployed+verified" invariant means
    // the Deploy drawer is opened first by the client). Here we just run bootstrap.
    const state = await readDeployState(args.runtime, args.slug);
    if (!state || state.phase.kind !== "succeeded") {
      return { ok: false, error: "Not deployed yet. Click Deploy first." };
    }
    if (args.runtime === "codex" || args.runtime === "gemini") {
      // Plist file still on disk; re-bootstrap
      const label = toLaunchdLabel(args.runtime, args.slug);
      const plistPath = toPlistPath(args.runtime, args.slug);
      const uid = process.getuid!();
      try {
        await execFileP("launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
      } catch (e: any) {
        return { ok: false, error: `launchctl bootstrap failed: ${e.message}` };
      }
    }
    await persistEnabledFlag(args.runtime, args.slug, true);
    return { ok: true };
  } else {
    // Disable: bootout only; keep plist file on disk so re-enable is fast
    if (args.runtime === "codex" || args.runtime === "gemini") {
      const label = toLaunchdLabel(args.runtime, args.slug);
      const uid = process.getuid!();
      try {
        await execFileP("launchctl", ["bootout", `gui/${uid}/${label}`]);
      } catch (e: any) {
        return { ok: false, error: `launchctl bootout failed: ${e.message}` };
      }
    }
    await persistEnabledFlag(args.runtime, args.slug, false);
    return { ok: true };
  }
}
```

### First-enable invariant

The UI-SPEC says "enable toggle on Draft card triggers Deploy drawer first." Implementation: the client intercepts the toggle click, checks `status === "draft"`, and if so opens the Deploy drawer instead of calling `setRoutineEnabled`. On successful deploy completion (status → "verified"), client then calls `setRoutineEnabled({enabled: true})` to flip the flag. This keeps `setRoutineEnabled` itself narrow — it's bootstrap/bootout + flag persistence, not a deploy pathway.

## Health Badge Implementation (HLTH-01)

### Route Handler

```ts
// dashboard/app/api/health/all/route.ts
import { NextResponse } from "next/server";
import { ADAPTERS } from "@/lib/runtime-adapters";
import type { HealthStatus } from "@/lib/runtime-adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const checkedAt = new Date().toISOString();
  const timeout = 2000;  // 2s per adapter per Phase 2 research/STACK.md bounds

  const withTimeout = (p: Promise<HealthStatus>, runtime: string): Promise<HealthStatus> =>
    Promise.race([
      p,
      new Promise<HealthStatus>(r => setTimeout(() => r({
        runtime: runtime as any,
        available: false,
        reason: `healthCheck timed out after ${timeout}ms`,
      }), timeout))
    ]);

  const settled = await Promise.allSettled(
    Object.values(ADAPTERS).map(a => withTimeout(a.healthCheck(), a.runtime))
  );

  const statuses: HealthStatus[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const runtime = Object.values(ADAPTERS)[i].runtime;
    return {
      runtime,
      available: false,
      reason: `healthCheck threw: ${s.reason?.message ?? String(s.reason)}`,
    };
  });

  return NextResponse.json({ statuses, checkedAt });
}
```

### Client Component

```tsx
// dashboard/app/_components/health-badge-row.tsx
"use client";

import { useEffect, useState } from "react";
import type { HealthStatus } from "@/lib/runtime-adapters";

const CACHE_KEY = "sleepwalker:health:v1";
const TTL_MS = 60_000;

export function HealthBadgeRow() {
  const [statuses, setStatuses] = useState<HealthStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Cache-first
      const cached = readCache();
      if (cached && Date.now() - cached.checkedAt < TTL_MS) {
        setStatuses(cached.statuses);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/health/all");
        const data = await res.json();
        if (cancelled) return;
        setStatuses(data.statuses);
        writeCache({ statuses: data.statuses, checkedAt: Date.now() });
      } catch (e) {
        if (!cancelled) setStatuses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Window-focus invalidation (Resolved Q#3)
  useEffect(() => {
    const onFocus = () => {
      const cached = readCache();
      if (!cached || Date.now() - cached.checkedAt >= TTL_MS) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Per-badge manual refresh button (Resolved Q#3)
  const manualRefresh = () => {
    sessionStorage.removeItem(CACHE_KEY);
    setRefreshKey(k => k + 1);
  };

  if (loading && !statuses) {
    return <LoadingPills />;
  }
  return <Pills statuses={statuses ?? []} onManualRefresh={manualRefresh} />;
}

function readCache(): { statuses: HealthStatus[]; checkedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(v: { statuses: HealthStatus[]; checkedAt: number }) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch {}
}
```

### Mount Point

Landing page (`dashboard/app/page.tsx`) adds the row to its `meta` array:

```tsx
meta.push(<HealthBadgeRow key="health" />);
```

This reuses the existing `PageHeader meta` mechanism — no layout redesign.

## Server Action API Summary

All live under `dashboard/app/routines/actions.ts`:

| Action | Input | Return | Notes |
|--------|-------|--------|-------|
| `deployRoutine` | `{runtime, slug}` | `{ok: true, deployState} \| {ok: false, error}` | Drives 4-step state machine; writes state file; auto-rollback |
| `getDeployState` | `{runtime, slug}` | `DeployState \| null` | Read-only; called every 500ms during active deploy |
| `runNowRoutine` | `{runtime, slug}` | `{ok: true, runId?, handoffUrl?} \| {ok: false, error}` | Dispatches per-runtime |
| `setRoutineEnabled` | `{runtime, slug, enabled}` | `{ok: true} \| {ok: false, error}` | bootstrap/bootout + persist flag |
| `previewSaveToRepo` | `{runtime, slug}` | `{ok: true, files, totals, suggestedMessage, lockToken} \| {ok: false, kind, error}` | Acquires flock; stages path; returns diff |
| `commitSaveToRepo` | `{lockToken, message}` | `{ok: true, sha, shortSha} \| {ok: false, error}` | Commits staged; releases flock |
| `releaseSaveLock` | `{lockToken}` | `{ok: true}` | `git reset` + release (cancel path) |

Route Handler (single, under `dashboard/app/api/health/all/route.ts`):

| Route | Return |
|-------|--------|
| `GET /api/health/all` | `{statuses: HealthStatus[], checkedAt: ISO}` |

## Resolved Open Questions

### Q1: DEPL-02 rollback — async vs blocking? RESOLVED → BLOCKING

**Question:** Should rollback run asynchronously (UI shows "rolling back..." while cleanup runs in background) or blocking (UI spinner until rollback completes, then final error)?

**Research findings:**

- `launchctl bootout` typically completes in 50–300ms on modern macOS; it CAN return "Operation now in progress" under load (surfaced in Apple forum threads [CITED: ss64.com/mac/launchctl.html]), but blocking timing stays well under 3s in practice [ASSUMED: based on Phase 2 supervisor-tests timing and general launchd behavior — no official SLA]
- File ops (`fs.unlink` on plist, `fs.rm` on state file) are <10ms on APFS
- Total rollback time budget: 50–500ms typical, 3s worst case
- UI-SPEC §Deploy state machine §Rollback visualization explicitly specifies "150ms ease-out color transitions" and a "persistent banner" — this language is only consistent with blocking-with-visible-progress (you can't animate a cascade if the cleanup is still running in the background)

**Decision: BLOCKING inside the Server Action.**

Implementation:
- The Server Action `deployRoutine` runs the rollback sequence inline before returning
- UI polls `getDeployState` at 500ms; the moment the state file shows `phase.kind === "rolled-back"`, UI stops polling and renders the rollback UI
- For 50–500ms rollbacks, the user sees: running step pulses red (pending poll) → poll arrives showing `rolled-back` → cascade animation + banner appear (150ms)
- For 3s rollbacks, the user sees 6 polls of the same running-step state, then terminal `rolled-back` state → cascade

**Why not async:**
- Async rollback would need a "rollback-in-progress" intermediate state (`{phase: "rolling-back"}`). Adds a non-terminal state to an already-complex machine.
- UI would have to handle "rolled-back but some cleanup still running" — ambiguous about whether the failure is safe to retry
- Makes "zero orphaned artifacts ever" verification harder: the UI could say "rolled back" while `fs.rm` is still running

**Edge case: rollback taking >10s.** If `launchctl bootout` hangs beyond 10s, wrap it in `Promise.race` with a 10s timeout. On timeout, write the `rolled-back` state with a `rollbackActions` entry `{action: "launchctl bootout", ok: false, error: "timed out after 10s — check launchctl manually"}`. UI surfaces this explicitly. User still sees a terminal state.

### Q2: REPO-01 flock contention UX? RESOLVED → IMMEDIATE FAILURE (`retries: 0`)

**Question:** Two tabs hit Save-to-repo simultaneously, second tab waits. Options: (a) immediate failure, (b) indefinite wait, (c) bounded wait then failure.

**Research findings:**

- `proper-lockfile` supports both: `retries: 0` is non-blocking (throws `ELOCKED` immediately if held); `retries: {retries, minTimeout, maxTimeout}` retries with backoff
- The save-to-repo flow holds the lock across two modal stages — the user could leave the Review modal open for 10+ minutes while they read a long diff. Stale-lock detection (`stale: 30_000`) recovers from crashes, but a user who just walks away holds the lock legitimately
- UI-SPEC §Save-to-repo §Lock-busy state spec copy ("Another save-to-repo is in progress. Wait a moment and try again.") already implies immediate failure feedback — not a spinner
- Indefinite wait is hostile UX (user clicks, nothing happens, no signal why)
- Bounded wait (e.g. 5s) is a hidden magic number that the user has to guess

**Decision: Non-blocking `{retries: 0}`. Immediate `lock-busy` response.** The UI renders the amber "Another save-to-repo is in progress" message and disables the Continue CTA. User can retry. If the other tab finishes (commit or cancel) within seconds, the lock is released and the next attempt succeeds. If the other session crashed, `proper-lockfile`'s 30s stale check recovers.

**User workflow if they hit a stale lock:**
1. Click Save-to-repo → amber message
2. Wait 30s (stale timeout)
3. Click again → succeeds

**Why 30s stale, not 60s:** Matches health-badge cache TTL (consistent mental model); long enough to cover a legitimate slow git operation; short enough to not block the user forever on a crashed session.

### Q3: HLTH-01 health badge cache invalidation? RESOLVED → 60s TTL + WINDOW FOCUS + MANUAL REFRESH

**Question:** User runs `brew install gemini-cli` mid-session; cache would show grey for 60s after install. Options: (a) accept staleness, (b) manual refresh, (c) invalidate on focus, (d) shorter TTL.

**Research findings:**

- 60s cache is a defensible choice for a localhost tool visited multiple times per session (navigation to `/` should be instant after first load)
- Shorter TTL (e.g. 15s) doubles/quadruples the health-check traffic with little benefit; `healthCheckAll()` is bounded to 8s (4 runtimes × 2s timeout) so it's not cheap
- Window-focus is the standard pattern for "user came back from somewhere else" in SPA UX (React Query, SWR, Mantine all default to this)
- A per-badge manual refresh icon handles the "I just installed a CLI in a terminal and want to check NOW" case without forcing users to close/reopen the tab

**Decision: All three, layered.**

1. **60s TTL** — sessionStorage cache, acts as the happy-path fast-hit mechanism
2. **Window-focus invalidation** — `window.addEventListener("focus", ...)` checks if cache is older than TTL; if so, triggers refetch. Handles the "alt-tab from terminal" case
3. **Per-badge refresh icon** — clickable `RefreshCw` glyph inside each badge (grey or amber states only — green doesn't need it). Clears cache + refetches immediately

**Accessibility:** The refresh icon is keyboard-focusable, announces "Refresh {runtime} health" to screen readers, and doesn't steal focus on success.

**Cache invalidation UX:** While a refresh is in-flight, the existing badges render at `opacity-70` so the user knows something is happening but the content isn't gone (no Loading pills on refresh — that would be jarring).

## Build-Order Dependencies

```
Phase 1 types.ts (SEALED)
  └── RuntimeAdapter, DeployResult, HealthStatus
       │
Phase 2 adapters (SEALED)
  └── ADAPTERS registry, getAdapter(), healthCheckAll(), 4 adapters with deploy/undeploy/runNow/healthCheck
       │
Phase 3 bundles.ts + atomic-write.ts + editor/actions.ts (SEALED)
  └── listBundles(), readBundle(), atomicWriteBundle(), Server Action template
       │
       ├── Phase 4 Wave 0: install simple-git + proper-lockfile, scaffold tests
       │
       ├── Phase 4 Wave 1 (parallel):
       │     ├── dashboard/lib/deploy-state.ts (pure state file I/O)
       │     ├── dashboard/lib/save-to-repo.ts (simple-git + proper-lockfile wrapper)
       │     └── dashboard/app/api/health/all/route.ts (pure wrap of healthCheckAll)
       │
       ├── Phase 4 Wave 2 (depends on Wave 1):
       │     ├── dashboard/app/routines/actions.ts (7 Server Actions composing the libs)
       │     └── dashboard/app/_components/health-badge-row.tsx + health-badge.tsx
       │
       ├── Phase 4 Wave 3 (depends on Wave 2):
       │     ├── dashboard/app/routines/_components/deploy-progress-drawer.tsx + deploy-step-pill.tsx
       │     ├── dashboard/app/routines/_components/save-to-repo-modal.tsx + diff-stat-panel.tsx
       │     ├── dashboard/app/routines/_components/run-now-button.tsx + status-pill.tsx
       │     ├── dashboard/app/routines/_components/routine-action-bar.tsx
       │     └── routines-client.tsx extension (compose the action bar)
       │
       └── Phase 4 Wave 4 (depends on Wave 3):
             ├── dashboard/app/routines/page.tsx extension (listRoutines + drift compute)
             ├── dashboard/app/page.tsx extension (add HealthBadgeRow to meta)
             └── Integration test across full flow
```

**No blocking gates.** All upstream phases are SEALED (Phase 1, 2, 3 per STATE.md). Phase 4 can start immediately.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `dashboard/vitest.config.ts` (node + jsdom environmentMatchGlobs) |
| Quick run command | `cd dashboard && pnpm test tests/<file>.test.ts` |
| Full suite command | `cd dashboard && pnpm test` |
| Test helper | `dashboard/tests/helpers.ts::makeTempHome()` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPL-01 | Deploy advances state machine `planning → writing → loading → verified` writing state file each transition | unit | `pytest` → `pnpm test tests/deploy-state.test.ts -t "state machine transitions"` | ❌ Wave 0 |
| DEPL-01 | `getDeployState` Server Action returns parsed state-file object | unit | `pnpm test tests/deploy-state.test.ts -t "readDeployState parses JSON"` | ❌ Wave 0 |
| DEPL-01 | State file is atomic (crash mid-write leaves no partial JSON) | unit | `pnpm test tests/deploy-state.test.ts -t "atomic write"` | ❌ Wave 0 |
| DEPL-01 | Polling stops on terminal state | integration (jsdom) | `pnpm test tests/deploy-progress-drawer.test.tsx -t "stops polling"` | ❌ Wave 0 |
| DEPL-02 | Rollback runs adapter.undeploy + deleteDeployState on ANY step failure | unit | `pnpm test tests/deploy-routine-action.test.ts -t "rollback on writing failure"` | ❌ Wave 0 |
| DEPL-02 | Rollback captures nested errors in rollbackActions array | unit | `pnpm test tests/deploy-routine-action.test.ts -t "nested error captured"` | ❌ Wave 0 |
| DEPL-02 | Zero orphaned state files after rollback (integration: verify fs after failed deploy) | integration | `pnpm test tests/deploy-routine-action.test.ts -t "no orphaned state"` | ❌ Wave 0 |
| DEPL-02 | 10s bootout timeout surfaces as `rolled-back` state with timeout reason | unit | `pnpm test tests/deploy-routine-action.test.ts -t "bootout timeout"` | ❌ Wave 0 |
| DEPL-03 | `mtime(bundle) > verifiedAt` returns status=drift | unit | `pnpm test tests/deploy-state.test.ts -t "drift detection"` | ❌ Wave 0 |
| DEPL-03 | `mtime(bundle) < verifiedAt` returns status=deployed | unit | `pnpm test tests/deploy-state.test.ts -t "deployed — no drift"` | ❌ Wave 0 |
| DEPL-03 | `listRoutines` attaches `status` per bundle | integration | `pnpm test tests/routines-page.test.ts -t "status per bundle"` | ❌ Wave 0 |
| DEPL-03 | bundleMtime picks max across dir contents (not dir mtime alone) | unit | `pnpm test tests/deploy-state.test.ts -t "bundleMtime across files"` | ❌ Wave 0 |
| DEPL-04 | claude-routines runNow returns handoffUrl | unit | `pnpm test tests/run-now-action.test.ts -t "claude-routines"` | ❌ Wave 0 |
| DEPL-04 | claude-desktop runNow invokes `claude -p` | unit | `pnpm test tests/run-now-action.test.ts -t "claude-desktop"` | ❌ Wave 0 |
| DEPL-04 | codex runNow spawns supervisor detached+unref | unit | `pnpm test tests/run-now-action.test.ts -t "codex detached"` | ❌ Wave 0 |
| DEPL-04 | gemini runNow same shape as codex | unit | `pnpm test tests/run-now-action.test.ts -t "gemini detached"` | ❌ Wave 0 |
| DEPL-05 | setRoutineEnabled(enabled=false) calls launchctl bootout | unit | `pnpm test tests/set-enabled-action.test.ts -t "disable bootout"` | ❌ Wave 0 |
| DEPL-05 | setRoutineEnabled(enabled=true) calls launchctl bootstrap | unit | `pnpm test tests/set-enabled-action.test.ts -t "enable bootstrap"` | ❌ Wave 0 |
| DEPL-05 | enabled flag persists in config.json | unit | `pnpm test tests/set-enabled-action.test.ts -t "persist flag"` | ❌ Wave 0 |
| DEPL-05 | Enable on Draft returns error ("Not deployed yet") | unit | `pnpm test tests/set-enabled-action.test.ts -t "enable draft error"` | ❌ Wave 0 |
| REPO-01 | `previewSaveToRepo` stages only `routines-<runtime>/<slug>/*` | unit (real tmp git repo) | `pnpm test tests/save-to-repo.test.ts -t "stages only subpath"` | ❌ Wave 0 |
| REPO-01 | `previewSaveToRepo` returns `git diff --stat`-shaped `DiffSummary` | unit | `pnpm test tests/save-to-repo.test.ts -t "diff shape"` | ❌ Wave 0 |
| REPO-01 | Second concurrent `previewSaveToRepo` returns `lock-busy` immediately | unit | `pnpm test tests/save-to-repo.test.ts -t "lock-busy"` | ❌ Wave 0 |
| REPO-01 | `commitSaveToRepo` NEVER calls `git.push` | unit | `pnpm test tests/save-to-repo.test.ts -t "never pushes"` | ❌ Wave 0 |
| REPO-01 | `releaseSaveLock` runs `git reset` on subpath + releases lock | unit | `pnpm test tests/save-to-repo.test.ts -t "release resets"` | ❌ Wave 0 |
| REPO-01 | Stale lock (>30s) is reclaimable | unit | `pnpm test tests/save-to-repo.test.ts -t "stale lock reclaim"` | ❌ Wave 0 |
| REPO-01 | Never-sweep invariant: uncommitted file outside subpath stays unstaged | unit | `pnpm test tests/save-to-repo.test.ts -t "never sweeps"` | ❌ Wave 0 |
| HLTH-01 | `/api/health/all` returns `{statuses, checkedAt}` | integration | `pnpm test tests/health-route.test.ts -t "shape"` | ❌ Wave 0 |
| HLTH-01 | Timeout per adapter is 2000ms, never hangs response | unit | `pnpm test tests/health-route.test.ts -t "timeout"` | ❌ Wave 0 |
| HLTH-01 | Promise.allSettled catches throwing adapter | unit | `pnpm test tests/health-route.test.ts -t "adapter throws"` | ❌ Wave 0 |
| HLTH-01 | Client component renders green/amber/grey/loading pills | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "render states"` | ❌ Wave 0 |
| HLTH-01 | sessionStorage cache hit on second mount within 60s | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "cache hit"` | ❌ Wave 0 |
| HLTH-01 | Cache expires after 60s | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "cache expiry"` | ❌ Wave 0 |
| HLTH-01 | Window-focus triggers refetch after TTL | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "focus refetch"` | ❌ Wave 0 |
| HLTH-01 | Manual refresh icon clears cache | integration (jsdom) | `pnpm test tests/health-badge-row.test.tsx -t "manual refresh"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd dashboard && pnpm test tests/<touched-file>.test.ts` (< 5s quick feedback)
- **Per wave merge:** `cd dashboard && pnpm typecheck && pnpm test` (full vitest suite + TS)
- **Phase gate:** Full suite green + `bash hooks/tests/supervisor-tests.sh` (Phase 2 regression check) + frozen-surface diff 0 lines vs PHASE4_BASE

### Wave 0 Gaps

All Phase 4 test files are new. Wave 0 must create:

- [ ] `tests/deploy-state.test.ts` — state-machine I/O + drift math (covers DEPL-01, DEPL-03)
- [ ] `tests/deploy-routine-action.test.ts` — deployRoutine Server Action with mocked adapters (covers DEPL-01, DEPL-02)
- [ ] `tests/deploy-progress-drawer.test.tsx` — jsdom drawer component (covers DEPL-01 polling)
- [ ] `tests/run-now-action.test.ts` — per-runtime runNow dispatch (covers DEPL-04)
- [ ] `tests/set-enabled-action.test.ts` — bootstrap/bootout + persist (covers DEPL-05)
- [ ] `tests/save-to-repo.test.ts` — real tmp git repo + simple-git ops + proper-lockfile (covers REPO-01)
- [ ] `tests/health-route.test.ts` — Route Handler with mocked adapters (covers HLTH-01 server side)
- [ ] `tests/health-badge-row.test.tsx` — jsdom client component (covers HLTH-01 client side)
- [ ] `tests/routines-page.test.ts` — server-component listRoutines + drift attach (covers DEPL-03 integration)
- [ ] `tests/deploy-rollback.test.ts` (optional, split from deploy-routine-action for clarity)

**Framework install:** none needed (Vitest + jsdom already in devDependencies).

**Dep install:** `cd dashboard && pnpm add simple-git@3.36.0 proper-lockfile@4.1.2 && pnpm add -D @types/proper-lockfile`

## Testing Strategy Detail

### Mocking Pattern (execFile, fs, simple-git)

Phase 2 established the `execFile` mocking pattern (see `tests/codex.test.ts`, `tests/gemini.test.ts`). Phase 4 reuses it:

```ts
// tests/set-enabled-action.test.ts
import { vi } from "vitest";
vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, cb) => cb(null, { stdout: "", stderr: "" }))
}));
```

For `simple-git`, use an in-repo mock pattern plus real-tmp-dir tests for the critical paths:

```ts
// tests/save-to-repo.test.ts
// For unit tests: mock simple-git's SimpleGit class
vi.mock("simple-git", () => ({
  simpleGit: () => ({
    add: vi.fn().mockResolvedValue(undefined),
    diffSummary: vi.fn().mockResolvedValue({ files: [...], insertions: 12, deletions: 3 }),
    commit: vi.fn().mockResolvedValue({ commit: "abc1234..." }),
    raw: vi.fn(),
    log: vi.fn().mockResolvedValue({ all: [] }),
  })
}));

// For the "never-sweep" integration test: use a REAL tmp git repo
import { simpleGit } from "simple-git";
beforeEach(async () => {
  const tmpRepo = fs.mkdtempSync("/tmp/save-repo-test-");
  const git = simpleGit(tmpRepo);
  await git.init();
  // seed with files, test behavior against REAL git
});
```

Mixing mocked + real-repo tests gives us confidence that our API contract is correct AND that simple-git actually does what we think on a real repo.

### `proper-lockfile` Testing

```ts
import * as lockfile from "proper-lockfile";

it("second concurrent lock attempt fails immediately", async () => {
  const env = makeTempHome();
  const sentinel = path.join(env.home, "test.lock.sentinel");
  fs.writeFileSync(sentinel, "");
  const release = await lockfile.lock(sentinel, { retries: 0, stale: 30_000 });
  await expect(lockfile.lock(sentinel, { retries: 0, stale: 30_000 }))
    .rejects.toMatchObject({ code: "ELOCKED" });
  await release();
  env.restore();
});
```

### Drift Detection Testing

```ts
it("drift: bundle mtime > verifiedAt returns drift", async () => {
  const env = makeTempHome();
  const bundleDir = path.join(env.home, "routines-codex/test");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, "prompt.md"), "old");
  const oldMtime = Date.now() - 100;
  await writeDeployState({ ..., phase: { kind: "succeeded" }, verifiedAt: oldMtime });
  // Edit the bundle
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(path.join(bundleDir, "prompt.md"), "new");
  expect(await computeStatus({ runtime: "codex", slug: "test", bundleDir })).toBe("drift");
  env.restore();
});
```

### Deploy State Machine Testing

```ts
it("state machine: failure at writing step triggers rollback", async () => {
  const env = makeTempHome();
  const mockAdapter = {
    deploy: vi.fn().mockResolvedValue({ ok: false, error: "plist write failed" }),
    undeploy: vi.fn().mockResolvedValue({ ok: true }),
    healthCheck: vi.fn().mockResolvedValue({ runtime: "codex", available: true }),
  };
  vi.mocked(getAdapter).mockReturnValue(mockAdapter as any);

  const result = await deployRoutine({ runtime: "codex", slug: "test" });

  expect(result.ok).toBe(false);
  expect(mockAdapter.undeploy).toHaveBeenCalledTimes(1);
  const state = await readDeployState("codex", "test");
  expect(state?.phase.kind).toBe("rolled-back");
  expect((state?.phase as any).failedStep).toBe("writing");
  env.restore();
});
```

## Common Pitfalls

### Pitfall 1: State file race between UI poll and Server Action write

**What goes wrong:** UI polls `getDeployState` while `deployRoutine` is mid-rename of the state file. Poll reads a partial/absent file.

**Why it happens:** `fs.writeFile + fs.rename` is atomic, but the window between "unlink old → rename new" is non-zero. A concurrent `fs.readFile` during that window returns ENOENT.

**How to avoid:** `readDeployState` already treats ENOENT as `null` (not an error). The UI poll treats `null` as "state not yet written" and keeps polling. This is self-recovering — no bug unless the initial state write is ITSELF ENOENT-racy, which it is not (we write the `planning` state immediately at the top of `deployRoutine`).

**Warning signs:** Intermittent test failures with ENOENT on reads.

### Pitfall 2: `launchctl print` exit code non-zero on slow launchd

**What goes wrong:** "loading" step calls `launchctl print gui/$UID/<label>` to verify the job is registered. On a loaded system, this can take 100–500ms and sometimes returns non-zero even when the job is registered (race against launchd's internal registration commit).

**Why it happens:** `bootstrap` returns before launchd commits the job to its registry. `print` queries the registry.

**How to avoid:** Retry `launchctl print` up to 3 times with 100ms backoff before declaring the "loading" step failed. [ASSUMED — based on general launchd behavior; verify in manual smoke]

**Warning signs:** "loading" step transitions to `rolled-back` even though `launchctl list` shows the job present.

### Pitfall 3: proper-lockfile stale detection vs legitimate long holds

**What goes wrong:** User opens Save-to-repo Review modal, walks away for 45s. `proper-lockfile` marks the lock stale (>30s since last mtime refresh) and allows a competing process to acquire it.

**Why it happens:** `proper-lockfile` refreshes mtime periodically (default every 10s). If the Server Action that acquired the lock is still alive, the refresh happens. If the Next.js worker serving the original action is idle, it STILL refreshes — `proper-lockfile` uses a `setInterval` internally for as long as the `release` function is in scope.

**How to avoid:** The LOCK_REGISTRY pattern above holds the release closure in module scope. As long as the Next.js process is alive, the refresh interval runs. Walking away is fine.

**Warning signs:** `commit` fails with "Lock was stolen" error. Check that LOCK_REGISTRY Map isn't being GC'd (it isn't — module scope).

### Pitfall 4: Running Next.js in a multi-process deployment breaks LOCK_REGISTRY

**What goes wrong:** If a user runs Sleepwalker behind a load balancer or under pm2 cluster mode, two Next.js workers don't share module memory. Tab A's `previewSaveToRepo` lands on worker 1; tab A's `commitSaveToRepo` lands on worker 2; LOCK_REGISTRY on worker 2 is empty → "Lock expired."

**How to avoid:** Sleepwalker is documented as localhost:4001, single-process (CLAUDE.md confirms). Don't add cluster support. Add a guard: if `process.env.NODE_OPTIONS` contains `--cluster` or similar, log a warning at startup.

**Warning signs:** Intermittent "Lock expired" errors in user reports.

### Pitfall 5: Run-now subprocess orphaned on dashboard restart

**What goes wrong:** User clicks Run-now on a Codex routine. Server Action spawns supervisor detached+unref. User restarts `pnpm dev`. Supervisor keeps running; writes to audit.jsonl.

**Why it happens:** Unref means the subprocess outlives its parent. This is DESIRED for cron-style cadence (you don't want the agent to die when you restart the dashboard), but may confuse the user who thinks killing the dashboard kills everything.

**How to avoid:** Document in AUTHORING.md. No code fix needed; this is by design.

**Warning signs:** Audit entries appearing after the user thinks they stopped everything.

### Pitfall 6: mtime on network filesystem / iCloud-synced repo

**What goes wrong:** User stores the sleepwalker repo inside ~/Library/Mobile Documents/ (iCloud-synced). iCloud updates mtimes on sync events, causing false-positive drift.

**How to avoid:** Document "don't put the repo in iCloud" in AUTHORING.md. Check `statfs` type at startup; warn if the repo is on an iCloud or NFS mount. [ASSUMED — low priority; most users won't hit this]

**Warning signs:** User reports drift on routines they haven't edited.

### Pitfall 7: `git reset -- <subpath>` when subpath is newly-added

**What goes wrong:** A brand-new bundle directory that's never been committed. User clicks Save-to-repo, previews the diff, clicks Cancel. Our cleanup runs `git reset -- subpath/` — this works for tracked files but for newly-added-but-never-tracked paths, `git reset` leaves them in the index.

**How to avoid:** Use `git rm --cached --ignore-unmatch -- subpath/` instead of `git reset` for the release path. Handles both cases. [CITED: git-reset(1) man page]

**Warning signs:** After canceling Save-to-repo, `git status` still shows new files under `routines-codex/<slug>/` as staged.

## Code Examples (verified from Phase 2 adapters)

### Pattern 1: Adapter deploy composition (from Phase 2 codex.ts)

```ts
// Phase 2 codex.ts::deploy() already does this:
// Source: /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/codex.ts:75-115

async deploy(bundle: RoutineBundle): Promise<DeployResult> {
  try {
    const codexAbs = await resolveCodexPath();
    if (!codexAbs) return { ok: false, error: "codex CLI not found on login-shell PATH" };
    const label = toLaunchdLabel("codex", bundle.slug);
    // ... build job, call installPlist (which internally does write + bootstrap)
    const result = await installPlist(job);
    return result.ok
      ? { ok: true, artifact: result.plistPath }
      : { ok: false, error: result.error, artifact: result.lintOutput };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

Phase 4 does NOT re-implement this — it just composes `deployRoutine` on top.

### Pattern 2: Server Action result-object (from Phase 3 editor/actions.ts)

```ts
// Source: /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/app/editor/actions.ts:43-63
export type SaveRoutineState =
  | { status: "idle" }
  | { status: "ok"; bundlePath: string; runtime: Runtime; slug: string; warning?: string }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError?: string };
```

Phase 4 Server Actions follow this exact discriminated-union shape. Every error path has a specific kind tag so the UI can branch.

### Pattern 3: Atomic write (from Phase 3 atomic-write.ts)

```ts
// Source: /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/atomic-write.ts
// Directory-swap pattern; Phase 4 state-file write uses the simpler fs.writeFile+rename variant.
```

### Pattern 4: makeTempHome test isolation (from Phase 3 tests/helpers.ts)

```ts
// Source: /Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/helpers.ts
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";
beforeEach(() => { env = makeTempHome(); dir = ensureSleepwalkerDir(env.home); });
afterEach(() => { env.restore(); });
```

Every Phase 4 test that touches `~/.sleepwalker/` MUST use this pattern.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `launchctl load/unload` | `launchctl bootstrap gui/<uid>` / `bootout gui/<uid>/<label>` | macOS 10.11+ (2015) | Phase 2 already uses modern; Phase 4 inherits |
| Shell `flock` for cross-process locking | `proper-lockfile` (mkdir-based) | Always preferred on macOS (flock never shipped) | Phase 4 uses proper-lockfile |
| Polling with `setInterval` + manual cleanup | Still current (no broadly-adopted SSE replacement for 500ms polls) | n/a | Phase 4 uses setInterval |
| `git add .` then filter | `git add -- <subpath>/` | Always | Phase 4 uses explicit paths |
| Next.js API Routes | Next.js Server Actions (for mutations) + Route Handlers (for client `fetch`) | Next 14+ (2023) | Phase 4 uses Server Actions for 6 of 7 ops; Route Handler only for `/api/health/all` which client fetches |

**Deprecated/outdated:**
- `launchd.plist` npm package — abandoned since 2013 (already avoided by Phase 2)
- `child_process.exec` (raw) — replaced by `execFile` + `promisify` or `execa`; already avoided project-wide
- `npm/lockfile` — in-process only, no NFS safety; use `proper-lockfile`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime | ✓ | v22+ (v0.1 dep) | — |
| pnpm | Dashboard install | ✓ | (v0.1 dep) | — |
| git CLI | simple-git | ✓ | system git | simple-git shells out; required |
| `launchctl` | codex/gemini deploy + enable/disable | ✓ | macOS built-in | — |
| `plutil` | plist lint (Phase 2 launchd-writer already uses) | ✓ | macOS built-in | — |
| `flock` | (NOT USED) | ✗ | — | proper-lockfile |
| `claude` CLI | claude-routines + claude-desktop | ✗ (optional) | — | Runtime gracefully degrades via healthCheck — deploy blocked with clear error |
| `codex` CLI | codex runtime | ✗ (optional) | — | Same; healthCheck returns `{available: false}` |
| `gemini` CLI | gemini runtime | ✗ (optional) | — | Same |

**Missing dependencies with no fallback:** None — Phase 4 does not require any new OS-level dependencies. The CLIs are user-opt-in per runtime (v0.2 pattern established in Phase 2).

**Missing dependencies with fallback:** N/A — the optional CLIs are exactly the thing the health badges SURFACE. Not having them is the expected state for some users.

## Live-Probe Findings

Performed during this research session on 2026-04-19:

1. **`dashboard/package.json` does NOT already include simple-git** [VERIFIED — file read confirms only clsx, cronstrue, framer-motion, gray-matter, lucide-react, next, react, yaml, zod as deps]
2. **No existing `/api/health/*` Route Handler** [VERIFIED — `find dashboard/app/api -name "*.ts"` shows only `settings`, `routines`, `audit`, `cloud/fire`, `cloud`, `queue` routes; health is net-new]
3. **`~/.sleepwalker/deploys/` does not exist** [VERIFIED — `ls ~/.sleepwalker/` shows `audit.jsonl cloud-credentials.json logs queue.jsonl sessions settings.json tracked-projects.json approved budgets.json executed`; no `deploys/`]
4. **`fire-routine.ts` exports `fireRoutine(routineId, text?)`** returning `{ok, status, sessionId?, sessionUrl?, body?, error?}` [VERIFIED — read file directly]
5. **`claude-routines.ts` adapter's `runNow()` wraps `fireRoutine`** [VERIFIED — adapter lines 68-74]
6. **macOS does NOT ship `flock(1)`** [VERIFIED — `command -v flock` returns empty on Darwin 25.4]
7. **macOS DOES ship `shlock`** at `/usr/bin/shlock` [VERIFIED — but API is PID-file-only with awkward semantics; `proper-lockfile` is superior]
8. **`simple-git@3.36.0` is current** [VERIFIED — `npm view simple-git version` returns `3.36.0`, modified 2026-04-12]
9. **`~/.sleepwalker/git.lock` does not exist** — net-new in Phase 4
10. **Phase 2 codex.ts + gemini.ts runNow both use `spawn(supervisor, [...], { detached: true, stdio: "ignore" }); child.unref()`** [VERIFIED — lines 129-143 codex.ts; 178-193 gemini.ts]
11. **Phase 2 claude-desktop.ts runNow uses `execFile("claude", ["-p", promptArg])`** [VERIFIED — lines 72-89]
12. **`listBundles()` exists in `dashboard/lib/bundles.ts`** returning `BundleDescriptor[]` [VERIFIED]
13. **`readBundle()` exists and parses SKILL.md (via gray-matter) or config.json+prompt.md** [VERIFIED]
14. **`atomicWriteBundle()` exists and uses directory-swap pattern with `ENOENT` → `errorCode: "collision"` mapping** [VERIFIED]
15. **`routines-client.tsx` is 113 lines with an inline `Toggle` component (44×24 pill)** [VERIFIED — Phase 4 extends; no rewrite]
16. **`dashboard/app/page.tsx` is `force-dynamic` and uses `PageHeader meta` slot** [VERIFIED]
17. **Existing test count: 250/250 green across 26 files** [VERIFIED via 03-09-SUMMARY.md]
18. **Vitest config: node env + jsdom environmentMatchGlobs for `.test.tsx`** [VERIFIED — read vitest.config.ts]

## Project Constraints (from CLAUDE.md)

- **Conventional commits** — no emojis, no AI attribution, imperative mood
- **Auto-commit after successful changes** — Phase 4 plans should sequence commits per task
- **TypeScript strict mode** — no `any` leaks (existing pattern in adapters)
- **pnpm** (lock file `pnpm-lock.yaml` confirms)
- **Never claim E2E completion based on HTTP 200** — Phase 4 requires manual smoke verification (at minimum a real codex deploy + launchctl print + bootout cycle) per CLAUDE.md quote
- **DESIGN.md / UI-SPEC required** before UI changes — Phase 4 UI-SPEC APPROVED 2026-04-19
- **Activity log** — append to `docs/activity_log.md` after file changes (per CLAUDE.md)
- **Result-object error returns** (CLAUDE.md + project convention)
- **Frozen v0.1 surface** — `install.sh`, hook script names/paths, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` wiring, `QueueEntry` fields — Phase 4 touches NONE of these
- **Strictly additive** — new files only; no modifications to Phase 1/2/3 SEALED files except the three explicitly-named extension points (`routines/page.tsx`, `routines-client.tsx`, `app/page.tsx`)
- **GSD workflow enforcement** — no direct edits outside GSD; Phase 4 executes via `/gsd-plan-phase 4` → plans → `/gsd-execute-phase 4`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `launchctl bootout` completes in 50–500ms typically, 3s worst case | §Rollback Orchestration / Resolved Q#1 | If slower, 10s timeout catches it; user sees explicit timeout message instead of spinner — acceptable fallback |
| A2 | `launchctl print` may exit non-zero transiently after successful bootstrap | Pitfall #2 | Could cause spurious "loading step failed" rollbacks. Mitigation: 3 retries with 100ms backoff. Manual smoke MUST verify. |
| A3 | Next.js 15.1.4 Server Actions share module-scope `Map` within single process | §Save-to-Repo Flow LOCK_REGISTRY | If actions are serialized across workers, `commitSaveToRepo` always returns "Lock expired." Sleepwalker is single-process (CLAUDE.md) so this holds — but planner should add a `pnpm dev` smoke test for save-to-repo end-to-end. |
| A4 | iCloud-synced repos update file mtimes on sync | Pitfall #6 | Low impact — documented workaround (don't put repo in iCloud) |
| A5 | `proper-lockfile`'s 30s stale TTL is appropriate for interactive save-to-repo | Resolved Q#2 | If a user legitimately holds Review modal >30s reading a diff, lock goes stale. Next attempt reclaims. Ergonomics acceptable; document the behavior in AUTHORING.md. |
| A6 | `fs.stat` on a bundle directory + its files totals <5ms per bundle on APFS | §Drift Detection Performance | If much slower, `listRoutines()` page render slows. Mitigation: cap `listBundles()` output; we control the upper bound. |
| A7 | Health-check timeouts of 2s per adapter are sufficient | §Health Route Handler | Phase 2 adapters' healthCheck already shells out to CLI binaries — if those hang >2s consistently, users see badges flip to "timed out." That IS the correct UX — indicates a real health problem. |

**Validation pathway:** Assumptions A1, A2, A3 MUST be verified in the Phase 4 manual smoke pass (planner should include `test/manual/phase-4-smoke.md` contract file). A4–A7 are low-risk and can ride along.

## Open Questions (not blocking — for executor clarity during plans)

1. **Should `deployRoutine` acquire a per-slug lock to prevent double-click spawning two state machines?**
   - What we know: UI-SPEC has an 800ms anti-double-click busy window on the Deploy button, but server-side nothing prevents a second `deployRoutine` invocation
   - What's unclear: Whether to add a second `proper-lockfile` on the state-file path
   - Recommendation: Add a defensive check: if state-file exists AND `phase.kind === "running"` AND `startedAt < 60s ago` → return `{ok: false, error: "deploy already in progress"}`. Don't add full file-locking — too heavy.

2. **Where should enable-flag go for Claude Routines?** Cloud routines have no local enabled state — the "toggle" would be semantic only (hide/show from local list).
   - Recommendation: `~/.sleepwalker/routines.json::archived_fleets: string[]` where fleet = `<runtime>/<slug>`. Planner decides.

3. **Should the drift banner on a card include "last edited X ago" helper copy?**
   - UI-SPEC §Interaction Contracts includes `relativeTime` in the tooltip
   - What's unclear: Where `relativeTime` is computed — server-rendered (SSR-friendly) or client-computed (auto-updates)
   - Recommendation: server-rendered via `Intl.RelativeTimeFormat`; "5m ago" is stale-enough that the user would navigate away before it matters

## Sources

### Primary (HIGH confidence)

- Phase 2 adapters read directly at `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/{claude-routines,claude-desktop,codex,gemini,launchd-writer,index,types}.ts` — contract authoritative
- Phase 3 Server Action template at `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/app/editor/actions.ts` — pattern authoritative
- Phase 3 atomic-write at `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/atomic-write.ts` — pattern authoritative
- Phase 3 bundles at `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/bundles.ts` — read-side authoritative
- Phase 2 supervisor at `/Users/rahulmehta/Desktop/Projects/sleepwalker/bin/sleepwalker-run-cli` — run-now shape authoritative
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/REQUIREMENTS.md` — DEPL-01..05 + REPO-01 + HLTH-01 text
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/ROADMAP.md` — Phase 4 SC#1..5
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/04-deploy/04-UI-SPEC.md` — APPROVED 2026-04-19
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/research/STACK.md` — simple-git@3.36.0 locked, launchd modern idiom
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/CLAUDE.md` — conventions, frozen surface
- npm registry (live): `simple-git@3.36.0` confirmed 2026-04-12 modified

### Secondary (MEDIUM confidence)

- [proper-lockfile README (moxystudio)](https://github.com/moxystudio/node-proper-lockfile) — mkdir-based lock semantics, stale-detection, cross-filesystem safety
- [npm: proper-lockfile](https://www.npmjs.com/package/proper-lockfile) — version, download counts
- [apenwarr: Everything you never wanted to know about file locking](https://apenwarr.ca/log/20101213) — why mkdir-based locks beat fcntl on network filesystems
- [launchd.info tutorial](https://www.launchd.info/) — domain targets, bootstrap/bootout
- [ss64.com: launchctl](https://ss64.com/mac/launchctl.html) — bootout semantics
- Phase 2 02-CONTEXT.md — 4-stage state machine invariant, Pitfall #5 auto-rollback precedent

### Tertiary (LOW confidence — manual smoke required)

- Bootout timing assumptions (A1, A2) — flagged for manual smoke verification in Phase 4

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps registry-verified; simple-git + proper-lockfile are industry-standard
- Architecture: HIGH — all Server Action + state-file + lock patterns are established in v0.1/Phase 3
- Rollback orchestration: MEDIUM — depends on launchctl bootout timing assumptions (A1, A2); mitigated by 10s timeout + retry pattern
- Save-to-repo: HIGH — simple-git API is mature, docs are unambiguous
- Health badges: HIGH — existing healthCheckAll() provides the full data plane
- Testing: HIGH — Phase 2/3 established every mock pattern we need
- Pitfalls: HIGH — drawn from reading actual Phase 2/3 code + live-probe

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days for stable ecosystem; simple-git + proper-lockfile are slow-moving)
