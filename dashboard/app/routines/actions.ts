"use server";
// dashboard/app/routines/actions.ts
//
// Server Actions for the /routines route. The four deploy-family actions
// that compose Phase 2 adapters + Plan 04-01 deploy-state.ts into the
// DEPL-01..05 surface (save-to-repo is Plan 04-05, not here):
//
//   1. deployRoutine   — 4-stage state machine planning → writing → loading → verified
//                        with auto-rollback on any step failure
//   2. getDeployState  — read-only pass-through for the drawer's 500ms polling loop
//   3. runNowRoutine   — per-runtime Run-now dispatch via getAdapter(runtime).runNow
//   4. setRoutineEnabled — bootstrap/bootout (codex/gemini) + persistEnabledFlag
//
// Authoritative sources:
//   - .planning/phases/04-deploy/04-RESEARCH.md §Deploy State Machine Design
//     (lines 153-281) — step transitions + per-step work mapping
//   - 04-RESEARCH.md §Rollback Orchestration (lines 282-347) — blocking-with-
//     visible-progress, rollback sequence, rollbackActions forensic capture,
//     10s timeout wrapper that resolves (never rejects)
//   - 04-RESEARCH.md §Run-Now Dispatch (lines 389-437) — per-runtime behaviors
//     (already implemented in Phase 2; this file just composes)
//   - 04-RESEARCH.md §Enable/Disable Toggle (lines 593-666) — bootstrap/bootout
//     per runtime + per-runtime enabled-flag storage locations
//   - .planning/phases/04-deploy/04-PATTERNS.md §dashboard/app/routines/actions.ts
//     (lines 213-294) — "use server" + discriminated union + step-composition
//   - dashboard/app/editor/actions.ts — canonical Phase 3 Server Action shape
//   - dashboard/lib/runtime-adapters/launchd-writer.ts lines 173-207 — launchctl
//     bootstrap/bootout call shape
//
// Contracts this file produces (consumed by Plans 04-07/08/09):
//   - deployRoutine       → DeployActionResult
//   - getDeployState      → DeployState | null (pass-through)
//   - runNowRoutine       → RunNowActionResult
//   - setRoutineEnabled   → SetEnabledActionResult
//
// Coordination with Plan 04-01: DeployState amended with optional `warning?:
// string` field in the same plan (see micro-commit ahead of this file) so
// claude-desktop's manual-add instruction surfaces in the terminal verified
// state without breaking the 11 existing deploy-state.test.ts blocks.

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as lockfile from "proper-lockfile";

import { getRepoRoot, readBundle, RUNTIME_ROOT } from "@/lib/bundles";
import {
  deleteDeployState,
  readDeployState,
  writeDeployState,
  type DeployState,
  type DeployStep,
} from "@/lib/deploy-state";
import { getAdapter } from "@/lib/runtime-adapters";
import type {
  Reversibility,
  RoutineBundle,
  RunRecord,
  Runtime,
} from "@/lib/runtime-adapters/types";
import {
  toFleetKey,
  toLaunchdLabel,
  toPlistPath,
} from "@/lib/runtime-adapters/slug";
import { setEnabled as setClaudeDesktopEnabled } from "@/lib/routines";

const execFileP = promisify(execFile);

/**
 * Serialize concurrent deployRoutine server actions for the same (runtime,
 * slug). React Strict Mode in dev can fire the action twice in quick succession;
 * without this, two deploys can race before the first state file lands.
 */
async function withPerRoutineDeployLock(
  runtime: Runtime,
  slug: string,
  fn: () => Promise<DeployActionResult>,
): Promise<DeployActionResult> {
  const dir = path.join(process.env.HOME || os.homedir(), ".sleepwalker", "deploys");
  const sentinel = path.join(dir, `.${runtime}-${slug}.deploy-action`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(sentinel, "", { flag: "a" });
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(sentinel, {
      retries: 0,
      stale: 120_000,
    });
  } catch {
    return {
      ok: false,
      error: "deploy already in progress",
      failedStep: "planning",
      rollbackActions: [],
    };
  }
  try {
    return await fn();
  } finally {
    await release?.().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/**
 * Result of `deployRoutine`. On success, the caller receives the terminal
 * `succeeded` state (artifact, verifiedAt, optional warning). On failure,
 * the state file has been deleted — zero orphans, DEPL-02 invariant. The
 * `failedStep` field tells the UI which step pill to paint red.
 */
export type DeployActionResult =
  | { ok: true; state: DeployState }
  | {
      ok: false;
      error: string;
      failedStep?: DeployStep;
      /**
       * Forensic trail of rollback actions run after the primary step
       * failure. Each entry captures whether an action (`adapter.undeploy`,
       * `deleteDeployState`) succeeded and, if not, the nested error. The
       * drawer's error banner renders this list so the user sees "undeploy:
       * timed out after 10s" alongside the primary error.
       *
       * Populated on every rollback path; an empty array means the failure
       * occurred before the rollback sequence ran (e.g. pre-state-file
       * write). Always present on `ok:false` so the UI can assume a typed
       * array instead of `undefined | []`.
       */
      rollbackActions: Array<{ action: string; ok: boolean; error?: string }>;
    };

/**
 * Result of `runNowRoutine`. Shape unifies the four adapter-level shapes:
 * claude-routines returns a browser-handoff URL (no local side effect);
 * codex/gemini/claude-desktop return a `runId` once the supervisor/CLI has
 * been dispatched.
 */
export type RunNowActionResult =
  | {
      ok: true;
      runId?: string;
      handoffUrl?: string;
      watchUrl?: string;
      warning?: string;
    }
  | { ok: false; error: string };

/**
 * Result of `setRoutineEnabled`. The terminal `enabled` value is echoed back
 * so the client can update its local optimistic state without re-reading
 * config.json.
 */
export type SetEnabledActionResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Rollback timeout (ms). `adapter.undeploy()` runs inside
 * `Promise.race([undeploy, timeout])`; if undeploy exceeds this window the
 * race resolves (never rejects) with a synthetic `{ok:false, error:"timed out
 * after 10s"}` so the state file always lands.
 *
 * 10s chosen per 04-RESEARCH.md §Rollback Orchestration — matches Phase 2's
 * launchd bootout profiling (p99 ~3s on live Mac + generous safety margin).
 */
const UNDEPLOY_TIMEOUT_MS = 10_000;

/**
 * Double-deploy guard window (ms). If a running state already exists and was
 * started less than this many ms ago, a second deployRoutine invocation
 * short-circuits with `{ok:false, error:"deploy already in progress"}`. This
 * guards against a fast double-click on the Deploy button bypassing the
 * client's `isDeploying` transition state. See 04-RESEARCH.md Open Question #1.
 */
const DOUBLE_DEPLOY_WINDOW_MS = 60_000;

/**
 * launchctl print retry policy. The loading-step verification polls
 * `launchctl print gui/<uid>/<label>` up to this many times with a 100ms
 * backoff between attempts, because launchd sometimes takes a few ms to
 * register a freshly-bootstrapped job. Per 04-RESEARCH.md Pitfall #2.
 */
const LOADING_RETRY_ATTEMPTS = 3;
const LOADING_RETRY_BACKOFF_MS = 100;

/**
 * ~/.sleepwalker/routines.json is the claude-routines archived-fleets store.
 * The file contains `{ archived_fleets: ["claude-routines/<slug>", ...] }`.
 * Inverse semantics: presence in the array means the routine is DISABLED
 * (archived). Disabling adds the fleet key; enabling removes it. No
 * launchctl involvement — claude-routines lives in the cloud, not launchd.
 */
interface SleepwalkerRoutinesFile {
  archived_fleets: string[];
}

function sleepwalkerRoutinesFile(): string {
  return path.join(
    process.env.HOME || os.homedir(),
    ".sleepwalker",
    "routines.json",
  );
}

function readRoutinesFile(): SleepwalkerRoutinesFile {
  const p = sleepwalkerRoutinesFile();
  if (!fs.existsSync(p)) return { archived_fleets: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<SleepwalkerRoutinesFile>;
    return {
      archived_fleets: Array.isArray(parsed.archived_fleets)
        ? parsed.archived_fleets.filter((s): s is string => typeof s === "string")
        : [],
    };
  } catch {
    return { archived_fleets: [] };
  }
}

function writeRoutinesFile(content: SleepwalkerRoutinesFile): void {
  const p = sleepwalkerRoutinesFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(content, null, 2));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Promise-race wrapper that resolves with `fallback` on timeout instead of
 * rejecting. Critical for rollback paths: if `adapter.undeploy()` hangs, the
 * state file MUST still land as `rolled-back` so the UI sees the forensic
 * trail. Rejection would leave the promise chain broken and the state file
 * stuck in a running phase.
 */
async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Adapt a `RoutineBundleRead` (from bundles.ts — tolerant parsing with
 * optional fields) into the frozen `RoutineBundle` contract the adapter
 * registry consumes. Applies sensible defaults for missing fields so the
 * adapter never sees `undefined` for schedule/reversibility/budget.
 */
function toRoutineBundle(read: {
  runtime: Runtime;
  slug: string;
  name: string;
  prompt: string;
  schedule?: string;
  reversibility?: Reversibility;
  budget?: number;
  bundleDir: string;
}): RoutineBundle {
  return {
    runtime: read.runtime,
    slug: read.slug,
    name: read.name,
    prompt: read.prompt,
    schedule: read.schedule ?? null,
    reversibility: read.reversibility ?? "yellow",
    budget: typeof read.budget === "number" ? read.budget : 50_000,
    bundlePath: path.join(getRepoRoot(), read.bundleDir),
  };
}

/**
 * Poll `launchctl print gui/<uid>/<label>` up to N times with a small
 * backoff. Launchd sometimes takes a handful of ms to register a job after
 * bootstrap; a single print right after bootstrap can race. The retry loop
 * resolves {ok:true} as soon as one attempt succeeds, or {ok:false, error}
 * after all attempts fail.
 *
 * 04-RESEARCH.md Pitfall #2: without this retry, loading-step verification
 * flakes intermittently on live Macs.
 */
async function launchctlPrintWithRetry(
  label: string,
  opts: { attempts: number; backoffMs: number } = {
    attempts: LOADING_RETRY_ATTEMPTS,
    backoffMs: LOADING_RETRY_BACKOFF_MS,
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}/${label}`;
  let lastError = "";
  for (let i = 0; i < opts.attempts; i += 1) {
    try {
      await execFileP("launchctl", ["print", domain]);
      return { ok: true };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (i < opts.attempts - 1) {
        await new Promise((r) => setTimeout(r, opts.backoffMs));
      }
    }
  }
  return { ok: false, error: lastError || "launchctl print failed" };
}

/**
 * Persist the enabled flag for a bundle per the runtime's storage policy
 * (04-RESEARCH.md §Enable/Disable Toggle §Storage):
 *
 *   - codex/gemini: rewrite config.json with new `enabled` field
 *   - claude-desktop: v0.1 `settings.json::enabled_routines` via
 *     `setEnabled()` from dashboard/lib/routines.ts (COMP-02 frozen surface)
 *   - claude-routines: `~/.sleepwalker/routines.json::archived_fleets[]`
 *     with INVERSE semantics (disable = add, enable = remove)
 */
function persistEnabledFlag(
  runtime: Runtime,
  slug: string,
  enabled: boolean,
  bundleDir: string,
): void {
  if (runtime === "codex" || runtime === "gemini") {
    const cfgPath = path.resolve(process.cwd(), bundleDir, "config.json");
    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(cfgPath)) {
      try {
        cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      } catch {
        cfg = {};
      }
    }
    cfg.enabled = enabled;
    fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    return;
  }
  if (runtime === "claude-desktop") {
    // v0.1 `setEnabled(id, enabled)` — id is the slug (v0.1 directory name).
    setClaudeDesktopEnabled(slug, enabled);
    return;
  }
  // claude-routines: archived_fleets with inverse semantics
  const key = toFleetKey("claude-routines", slug);
  const current = readRoutinesFile();
  const archived = new Set(current.archived_fleets);
  if (enabled) archived.delete(key);
  else archived.add(key);
  writeRoutinesFile({ archived_fleets: [...archived] });
}

/**
 * Build the base state shape used by the planning-step write and echoed
 * through every subsequent transition. Centralized so the state file always
 * carries a consistent fleet/runtime/slug/startedAt header.
 */
function buildBaseState(runtime: Runtime, slug: string): DeployState {
  return {
    fleet: toFleetKey(runtime, slug),
    runtime,
    slug,
    startedAt: new Date().toISOString(),
    steps: {
      planning: { startedAt: Date.now() },
    },
    phase: {
      kind: "running",
      step: "planning",
      stepStartedAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// deployRoutine — 4-stage state machine with rollback
// ---------------------------------------------------------------------------

/**
 * Composes readBundle + adapter.healthCheck + adapter.deploy + launchctl-print
 * verification + writeDeployState into a blocking-with-visible-progress state
 * machine. The UI polls getDeployState every 500ms and sees each step pill
 * advance as this function writes. On any failure, runs the rollback sequence
 * (adapter.undeploy + deleteDeployState) and writes a terminal `rolled-back`
 * state with a forensic `rollbackActions` array.
 *
 * This is the DEPL-01 + DEPL-02 implementation.
 */
export async function deployRoutine(args: {
  runtime: Runtime;
  slug: string;
}): Promise<DeployActionResult> {
  const { runtime, slug } = args;

  // Step 0 — Bundle read. If absent there is NOTHING to deploy and NOTHING
  // to roll back; we bail before writing any state file so the UI simply
  // reports "Bundle not found" and the drawer stays empty.
  const read = readBundle(runtime, slug);
  if (!read) {
    return {
      ok: false,
      error: `Bundle not found: ${runtime}/${slug}`,
      failedStep: "planning",
      rollbackActions: [],
    };
  }
  const bundle = toRoutineBundle(read);

  return withPerRoutineDeployLock(runtime, slug, async () => {
  // Step 0.5 — Double-deploy guard (04-RESEARCH.md Open Q#1). A prior state
  // in `running` phase started less than 60s ago means some other caller
  // (fast double-click, second tab) is mid-deploy; we refuse rather than
  // corrupt their state machine.
  const prior = await readDeployState(runtime, slug);
  if (prior && prior.phase.kind === "running") {
    const priorStarted = new Date(prior.startedAt).getTime();
    if (
      Number.isFinite(priorStarted) &&
      Date.now() - priorStarted < DOUBLE_DEPLOY_WINDOW_MS
    ) {
      return {
        ok: false,
        error: "deploy already in progress",
        rollbackActions: [],
      };
    }
  }

  // Step 1 — planning: write initial state, run healthCheck. The state file
  // lands before healthCheck so polling sees `running/planning` immediately
  // even if healthCheck takes a few hundred ms.
  const baseState = buildBaseState(runtime, slug);
  try {
    await writeDeployState(baseState);
  } catch (e) {
    // Unexpected IO error BEFORE any adapter work. Nothing to undeploy.
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      failedStep: "planning",
      rollbackActions: [],
    };
  }

  const adapter = getAdapter(runtime);
  const planningStartedAt = baseState.steps.planning!.startedAt;
  try {
    const health = await adapter.healthCheck();
    if (!health.available) {
      return rollback(
        runtime,
        bundle,
        baseState,
        "planning",
        health.reason || `${runtime} adapter unavailable`,
      );
    }
  } catch (e) {
    return rollback(
      runtime,
      bundle,
      baseState,
      "planning",
      e instanceof Error ? e.message : String(e),
    );
  }

  // Step 2 — writing: adapter.deploy performs the actual disk write /
  // handoff-URL build / plist install. Capture artifact + warning.
  const writingStartedAt = Date.now();
  const afterPlanning: DeployState = {
    ...baseState,
    steps: {
      ...baseState.steps,
      planning: {
        startedAt: planningStartedAt,
        completedAt: writingStartedAt,
        elapsedMs: writingStartedAt - planningStartedAt,
      },
      writing: { startedAt: writingStartedAt },
    },
    phase: {
      kind: "running",
      step: "writing",
      stepStartedAt: writingStartedAt,
    },
  };
  try {
    await writeDeployState(afterPlanning);
  } catch (e) {
    return rollback(
      runtime,
      bundle,
      afterPlanning,
      "writing",
      e instanceof Error ? e.message : String(e),
    );
  }

  let artifact: string | undefined;
  let warning: string | undefined;
  try {
    const deployRes = await adapter.deploy(bundle);
    if (!deployRes.ok) {
      return rollback(
        runtime,
        bundle,
        afterPlanning,
        "writing",
        deployRes.error || "adapter.deploy failed",
      );
    }
    artifact = deployRes.artifact;
    warning = deployRes.warning;
  } catch (e) {
    return rollback(
      runtime,
      bundle,
      afterPlanning,
      "writing",
      e instanceof Error ? e.message : String(e),
    );
  }

  // Step 3 — loading: verify the job landed. For codex/gemini, launchctl
  // print the label (with small retry since launchd takes a few ms). For
  // claude-desktop, the artifact path must exist. For claude-routines, the
  // handoff URL is informational — nothing to verify server-side.
  const loadingStartedAt = Date.now();
  const afterWriting: DeployState = {
    ...afterPlanning,
    steps: {
      ...afterPlanning.steps,
      writing: {
        startedAt: writingStartedAt,
        completedAt: loadingStartedAt,
        elapsedMs: loadingStartedAt - writingStartedAt,
      },
      loading: { startedAt: loadingStartedAt },
    },
    phase: {
      kind: "running",
      step: "loading",
      stepStartedAt: loadingStartedAt,
    },
    artifact,
  };
  try {
    await writeDeployState(afterWriting);
  } catch (e) {
    return rollback(
      runtime,
      bundle,
      afterWriting,
      "loading",
      e instanceof Error ? e.message : String(e),
    );
  }

  if (runtime === "codex" || runtime === "gemini") {
    const label = toLaunchdLabel(runtime, slug);
    const verifyRes = await launchctlPrintWithRetry(label);
    if (!verifyRes.ok) {
      return rollback(
        runtime,
        bundle,
        afterWriting,
        "loading",
        verifyRes.error,
      );
    }
  } else if (runtime === "claude-desktop") {
    if (artifact && !fs.existsSync(artifact)) {
      return rollback(
        runtime,
        bundle,
        afterWriting,
        "loading",
        `artifact not on disk: ${artifact}`,
      );
    }
  }
  // claude-routines: no-op — handoff URL is the artifact, user completes
  // the wiring by clicking the URL in a new tab.

  // Step 4 — verified: write terminal succeeded state with verifiedAt +
  // warning, return the state to the caller. verifiedAt feeds drift
  // detection (mtime(bundle) > verifiedAt ⇒ drift).
  const verifiedAt = Date.now();
  const terminal: DeployState = {
    ...afterWriting,
    steps: {
      ...afterWriting.steps,
      loading: {
        startedAt: loadingStartedAt,
        completedAt: verifiedAt,
        elapsedMs: verifiedAt - loadingStartedAt,
      },
      verified: { startedAt: verifiedAt, completedAt: verifiedAt, elapsedMs: 0 },
    },
    phase: { kind: "succeeded" },
    artifact,
    warning,
    verifiedAt,
  };
  try {
    await writeDeployState(terminal);
  } catch (e) {
    return rollback(
      runtime,
      bundle,
      afterWriting,
      "loading",
      e instanceof Error ? e.message : String(e),
    );
  }
  return { ok: true, state: terminal };
  });
}

/**
 * Rollback sequence. Runs adapter.undeploy() (wrapped in a 10s timeout that
 * resolves-never-rejects) then deleteDeployState(). Captures each attempted
 * action's result in `rollbackActions` so the UI's error drawer can show the
 * full forensic trail — "undeploy: ok", "deleteState: failed with EACCES",
 * etc.
 *
 * Writes a terminal `rolled-back` state. Returns `{ok:false, error,
 * failedStep}` to the caller. NEVER throws — even if the terminal state
 * write fails, we swallow and return the best-effort error.
 */
async function rollback(
  runtime: Runtime,
  bundle: RoutineBundle,
  priorState: DeployState,
  failedStep: DeployStep,
  error: string,
): Promise<DeployActionResult> {
  const rollbackActions: Array<{ action: string; ok: boolean; error?: string }> = [];

  // 1. adapter.undeploy — wrapped in a resolve-never-reject timeout so a
  //    hung bootout cannot prevent the state file from landing.
  try {
    const undeployRes = await withTimeout(
      adapter_undeploy_safe(runtime, bundle),
      UNDEPLOY_TIMEOUT_MS,
      { ok: false as const, error: `timed out after ${UNDEPLOY_TIMEOUT_MS / 1000}s` },
    );
    rollbackActions.push({
      action: "adapter.undeploy",
      ok: undeployRes.ok,
      error: undeployRes.ok ? undefined : undeployRes.error,
    });
  } catch (e) {
    rollbackActions.push({
      action: "adapter.undeploy",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. deleteDeployState — force:true is idempotent on ENOENT; any other
  //    error bubbles up here (EACCES etc.) and is captured for the UI.
  try {
    await deleteDeployState(runtime, bundle.slug);
    rollbackActions.push({ action: "deleteDeployState", ok: true });
  } catch (e) {
    rollbackActions.push({
      action: "deleteDeployState",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Return the forensic trail to the caller.
  //
  //    A truly orphan-free implementation means there is NO state file
  //    after rollback (step 2 deleted it, which is 04-RESEARCH.md's
  //    "no-orphaned-state" governing invariant). The drawer holds the
  //    terminal payload in its in-memory result from this Server Action
  //    return value — it does not need to re-read the file. So we do NOT
  //    rewrite the state file after delete; the DeployActionResult's
  //    `rollbackActions` field is the canonical forensic surface.
  //
  //    priorState is referenced in comments and available to future
  //    amendments if a requirement flips to persist rolled-back state.
  //    For now it is inspected by tests via the returned result shape.
  void priorState;
  return { ok: false, error, failedStep, rollbackActions };
}

/**
 * Safe undeploy wrapper. adapter.undeploy() can either return a result
 * object or throw (Phase 2 adapters are result-object, but defensive-code
 * for any third-party adapter that might throw). Normalizes to the result
 * shape so `withTimeout`'s fallback matches.
 */
async function adapter_undeploy_safe(
  runtime: Runtime,
  bundle: RoutineBundle,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await getAdapter(runtime).undeploy(bundle);
    return res.ok
      ? { ok: true }
      : { ok: false, error: res.error || "adapter.undeploy failed" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// getDeployState — read-only pass-through
// ---------------------------------------------------------------------------

/**
 * Read-only pass-through for the deploy-progress-drawer's 500ms poll loop.
 * Returns null when no state file exists (never-deployed OR just-rolled-back);
 * the client treats null as "keep polling." This function MUST NOT mutate
 * any state — any mutation would race with the live deployRoutine and
 * corrupt the state machine.
 */
export async function getDeployState(args: {
  runtime: Runtime;
  slug: string;
}): Promise<DeployState | null> {
  return readDeployState(args.runtime, args.slug);
}

// ---------------------------------------------------------------------------
// runNowRoutine — per-runtime Run-now dispatch
// ---------------------------------------------------------------------------

/**
 * Fire the routine right now. Thin wrapper around
 * `getAdapter(runtime).runNow(bundle)`; all four adapters already implement
 * the per-runtime mechanics (Phase 2):
 *
 *   - claude-routines: builds a browser-handoff URL to fire via the
 *     Anthropic `/fire` endpoint. Returns `{handoffUrl}`.
 *   - claude-desktop: `execFile("claude", ["-p", promptArg])`. Returns
 *     `{runId}` (the spawned pid or session id).
 *   - codex / gemini: `spawn(supervisor, [runtime, slug], {detached:true,
 *     stdio:"ignore"}).unref()` — fire-and-forget. The supervisor handles
 *     the sleep-window gate, reversibility gate, budget cap, and audit
 *     emission transparently, so audit entries land in ~/.sleepwalker/
 *     audit.jsonl a few hundred ms after the click.
 */
export async function runNowRoutine(args: {
  runtime: Runtime;
  slug: string;
}): Promise<RunNowActionResult> {
  const { runtime, slug } = args;

  const read = readBundle(runtime, slug);
  if (!read) {
    return { ok: false, error: `Bundle not found: ${runtime}/${slug}` };
  }
  const bundle = toRoutineBundle(read);

  const adapter = getAdapter(runtime);
  let res: Awaited<ReturnType<typeof adapter.runNow>>;
  try {
    res = await adapter.runNow(bundle);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!res.ok) {
    return { ok: false, error: res.error || "run-now failed" };
  }

  // adapter.runNow's result shape has runId + watchUrl (no explicit
  // handoffUrl). For claude-routines, the adapter returns the handoff URL
  // as `watchUrl` (see 04-RESEARCH.md §Run-Now Dispatch). We surface both
  // names for UI convenience — the drawer picks handoffUrl first and falls
  // back to watchUrl, giving claude-routines a stable prop regardless of
  // which adapter key carries the URL.
  return {
    ok: true,
    runId: res.runId,
    watchUrl: res.watchUrl,
    handoffUrl: runtime === "claude-routines" ? res.watchUrl : undefined,
  };
}

// ---------------------------------------------------------------------------
// setRoutineEnabled — bootstrap/bootout + persist
// ---------------------------------------------------------------------------

/**
 * Toggle a routine's enabled flag. For codex/gemini this also runs
 * `launchctl bootstrap` (enable) or `launchctl bootout` (disable). The
 * plist file STAYS on disk when disabling so a subsequent enable is a
 * simple bootstrap — no re-deploy, no re-verify.
 *
 * First-enable invariant: `setRoutineEnabled({enabled:true})` requires a
 * terminal succeeded deploy state. The Deploy drawer is the canonical path
 * to a first deploy; the UI intercepts toggle clicks on Draft cards and
 * opens the drawer instead of calling this function. If the client bypasses
 * that intercept, we hard-refuse with a UI-SPEC error message.
 */
export async function setRoutineEnabled(args: {
  runtime: Runtime;
  slug: string;
  enabled: boolean;
}): Promise<SetEnabledActionResult> {
  const { runtime, slug, enabled } = args;

  const read = readBundle(runtime, slug);
  if (!read) {
    return { ok: false, error: `Bundle not found: ${runtime}/${slug}` };
  }

  if (enabled) {
    // First-enable invariant: must be in succeeded state. The Draft case
    // is handled by the client (opens Deploy drawer instead).
    const state = await readDeployState(runtime, slug);
    if (!state || state.phase.kind !== "succeeded") {
      return { ok: false, error: "Not deployed yet. Click Deploy first." };
    }
  }

  // launchctl enable/disable (codex/gemini only). claude-routines lives in
  // the cloud; claude-desktop's scheduling lives in Desktop's own state.
  if (runtime === "codex" || runtime === "gemini") {
    const label = toLaunchdLabel(runtime, slug);
    const plistPath = toPlistPath(runtime, slug);
    const uid = process.getuid?.() ?? 501;
    const domain = `gui/${uid}`;
    try {
      if (enabled) {
        await execFileP("launchctl", ["bootstrap", domain, plistPath]);
      } else {
        await execFileP("launchctl", ["bootout", `${domain}/${label}`]);
      }
    } catch (e) {
      const verb = enabled ? "bootstrap" : "bootout";
      return {
        ok: false,
        error: `launchctl ${verb} failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Persistence: per-runtime storage policy. Distinct from launchd state —
  // even if launchctl fails we have already early-returned above. If we
  // get here, runtime-level state matches requested state; now flip the
  // config flag so next boot + next page render agree.
  try {
    persistEnabledFlag(runtime, slug, enabled, read.bundleDir);
  } catch (e) {
    return {
      ok: false,
      error: `Failed to persist enabled flag: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { ok: true, enabled };
}

// ---------------------------------------------------------------------------
// Exported type re-exports (convenience for UI callers)
// ---------------------------------------------------------------------------

// Re-export DeployState for UI callers that want to type-check poll results
// without digging into @/lib/deploy-state — the drawer usually only needs
// the actions here and the state type.
export type { DeployState } from "@/lib/deploy-state";

// RUNTIME_ROOT: import directly from @/lib/bundles if needed.

// ---------------------------------------------------------------------------
// save-to-repo Server Action wrappers (Plan 04-05)
// ---------------------------------------------------------------------------
//
// Thin pass-through dispatchers to dashboard/lib/save-to-repo. All real logic
// (git staging, flock acquisition, diff summary, commit, never-push invariant)
// lives in @/lib/save-to-repo. Keeping the wrappers dumb preserves the
// never-push / never-sweep invariants of Plan 04-02 at the Server Action
// boundary — no inline git work in this file, no error transformation, no
// behavioral drift from the lib-level tests.
//
// Naming: UI-SPEC line 538-544 names the Server Actions exactly
// `previewSaveToRepo`, `commitSaveToRepo`, `releaseSaveLock` — but Plan 04-02
// already claims those names for the library exports. To disambiguate the
// client-side import site (Plan 04-08 SaveToRepoModal), the Server Actions
// carry an `Action` suffix. The library names and Action names are one-to-one
// and pass through identical argument shapes.

import {
  previewSaveToRepo,
  commitSaveToRepo,
  releaseSaveLock,
  type PreviewResult,
  type SaveToRepoError,
  type CommitResult,
} from "@/lib/save-to-repo";

/**
 * Discriminated union returned to the SaveToRepoModal client. Mirrors the
 * library's `PreviewResult | SaveToRepoError` shape exactly — no shape
 * transformation — so the UI's `result.ok` narrowing + `result.kind` switch
 * works without an adapter layer.
 */
export type PreviewActionResult = PreviewResult | SaveToRepoError;

/**
 * Preview the diff for `routines-<runtime>/<slug>/` and acquire the git.lock
 * flock. Returns `{ok:true, files, totals, suggestedMessage, lockToken}` or a
 * discriminated failure (`lock-busy` | `no-changes` | `git-error`).
 */
export async function previewSaveToRepoAction(args: {
  runtime: Runtime;
  slug: string;
}): Promise<PreviewActionResult> {
  return previewSaveToRepo(args.runtime, args.slug);
}

/**
 * Commit the staged subpath with the user-authored message. Consumes the
 * `lockToken` from a prior `previewSaveToRepoAction` call. Releases the
 * flock on success; on failure leaves the lock held so the caller may retry
 * (or explicitly call `releaseSaveLockAction` to bail).
 */
export async function commitSaveToRepoAction(args: {
  lockToken: string;
  message: string;
}): Promise<CommitResult | { ok: false; error: string }> {
  return commitSaveToRepo(args);
}

/**
 * Cancel a prior preview. Unstages the subpath (reset + rm --cached) and
 * releases the flock. Idempotent — calling with an unknown token is a no-op
 * `{ok:true}`.
 */
export async function releaseSaveLockAction(args: {
  lockToken: string;
}): Promise<{ ok: true }> {
  return releaseSaveLock(args);
}

// ---------------------------------------------------------------------------
// Run history Server Action (Ship #1)
// ---------------------------------------------------------------------------
//
// Thin wrapper around RuntimeAdapter.listRuns() for client-side panels that
// want to show per-routine history on demand. Supervisor-backed runtimes
// (codex, gemini) read ~/.sleepwalker/audit.jsonl via run-history.ts;
// claude-routines + claude-desktop currently return [] at the adapter layer
// (those runtimes don't route through the supervisor and have no local
// audit trail the dashboard can read), which surfaces here as
// { ok: true, runs: [], reason: "no supervisor audit …" } so the client
// can render a clear empty-state instead of a spinner-forever.

export interface RunHistoryResult {
  ok: boolean;
  runs: RunRecord[];
  /** Populated when the runtime has no dashboard-readable audit source. */
  reason?: string;
  /** Error message on unexpected failure (bundle read error, adapter throw). */
  error?: string;
}

export async function getRunHistory(args: {
  runtime: Runtime;
  slug: string;
  limit?: number;
}): Promise<RunHistoryResult> {
  const { runtime, slug, limit = 10 } = args;

  const read = readBundle(runtime, slug);
  if (!read) {
    return { ok: false, runs: [], error: `Bundle not found: ${runtime}/${slug}` };
  }
  const bundle = toRoutineBundle(read);

  // Gate the remote-first runtimes explicitly rather than silently returning
  // []. If the adapter contract grows to populate these from api.anthropic.com
  // session-list endpoints later, delete this branch.
  if (runtime === "claude-routines" || runtime === "claude-desktop") {
    return {
      ok: true,
      runs: [],
      reason:
        runtime === "claude-routines"
          ? "Claude Routines runs live on api.anthropic.com; open the session to inspect."
          : "Claude Desktop runs are visible in Desktop's Schedule tab, not in Sleepwalker's audit.",
    };
  }

  try {
    const runs = await getAdapter(runtime).listRuns(bundle, limit);
    return { ok: true, runs };
  } catch (e) {
    return {
      ok: false,
      runs: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
