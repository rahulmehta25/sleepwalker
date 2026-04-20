// dashboard/lib/deploy-state.ts
// Authoritative source: .planning/phases/04-deploy/04-RESEARCH.md §Deploy State Machine Design
// (lines 155-260) + §Drift Detection (lines 349-388).
//
// Single source of truth for the 4-stage deploy state machine's persistence
// layer and for the mtime(bundle) > verifiedAt ⇒ drift invariant (DEPL-01,
// DEPL-03). Every deploy Server Action, every poll endpoint, and every drift
// computation in Phase 4 calls into this module.
//
// Key invariants:
//   - State writes are atomic: tmp-path + rename. A crash mid-write leaves no
//     partial JSON at the final path (APFS/POSIX rename is atomic on same FS).
//   - readDeployState returns null for ENOENT (not throw) so the UI can poll
//     before the first write lands.
//   - deleteDeployState is idempotent on missing file (rm with force:true).
//   - bundleMtime picks MAX across directory contents — dir mtime alone does
//     not change when file contents are edited in place.
//   - computeStatus short-circuits on missing or non-succeeded state → draft.
//
// Path convention (04-RESEARCH.md line 192):
//   ~/.sleepwalker/deploys/<runtime>-<slug>.state.json
//   (slash-free to avoid nested-dir semantics; mirrors launchd label minus
//    the com.sleepwalker. prefix for grep-ability.)
//
// Task 2 (this file's final form): I/O + drift math bodies filled, all five
// exports exercised by dashboard/tests/deploy-state.test.ts (11 it() blocks).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Runtime } from "@/lib/runtime-adapters/types";

/** Four fixed step names from DEPL-01. Ordering: planning → writing → loading → verified. */
export type DeployStep = "planning" | "writing" | "loading" | "verified";

/**
 * Discriminated-union phase. `kind` is the discriminant. `running` carries the
 * current step and its start time; `succeeded` is the happy terminal state;
 * `rolled-back` captures the failed step, user-facing error, and a nested
 * array of rollback actions (each of which may itself have ok=false).
 */
export type DeployPhase =
  | { kind: "running"; step: DeployStep; stepStartedAt: number }
  | { kind: "succeeded" }
  | {
      kind: "rolled-back";
      failedStep: DeployStep;
      error: string;
      rollbackActions: Array<{ action: string; ok: boolean; error?: string }>;
    };

/**
 * Persisted state for an in-flight or completed deploy. One file per
 * (runtime, slug) pair. Lives at ~/.sleepwalker/deploys/<runtime>-<slug>.state.json.
 */
export interface DeployState {
  /** "<runtime>/<slug>" — the canonical fleet key */
  fleet: string;
  runtime: Runtime;
  slug: string;
  /** ISO 8601 when deploy was initiated */
  startedAt: string;
  /** Per-step timing; step keys present iff the step has started. */
  steps: Partial<
    Record<DeployStep, { startedAt: number; completedAt?: number; elapsedMs?: number }>
  >;
  phase: DeployPhase;
  /** Artifact path (plist, SKILL.md, handoff URL) — set during "writing". */
  artifact?: string;
  /** ms epoch when phase transitioned to succeeded. Feeds drift detection. */
  verifiedAt?: number;
  /**
   * Non-blocking advisory copied from `adapter.deploy()`'s `warning` field
   * on the verified transition. Populated ONLY when the underlying adapter
   * returned a warning (primarily claude-desktop's manual-add instruction;
   * codex/gemini TCC-protected bundlePath warnings). DeployProgressDrawer
   * surfaces this in the success toast alongside the "Close" + "Run now"
   * CTAs so the user is never left wondering why their routine is not
   * firing despite verified state.
   */
  warning?: string;
}

/** Aggregate status the routine card renders. */
export type RoutineStatus = "draft" | "deployed" | "drift" | "disabled";

/** Directory holding all per-routine state files. Resolves $HOME at call time. */
function deployStateDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "deploys");
}

/** Path to the state file for a given (runtime, slug). Slash-free filename. */
function deployStateFile(runtime: Runtime, slug: string): string {
  return path.join(deployStateDir(), `${runtime}-${slug}.state.json`);
}

/**
 * Atomically write a DeployState to disk. Strategy: mkdir parent → write tmp
 * file with a random suffix → rename over final path. On same filesystem
 * (APFS guaranteed, since tmp is a sibling of final), rename is POSIX-atomic,
 * so readers either see the old file or the new file — never a half-written
 * file at the final path.
 *
 * Mode 0o644 — state files are not secrets (they contain paths and timestamps
 * only; no tokens), matching the v0.1 JSONL audit convention.
 *
 * On any IO error we attempt a best-effort cleanup of the tmp file and
 * re-throw the original error. Callers (Server Actions) convert this to a
 * `{ok: false, error}` result shape at the boundary.
 */
export async function writeDeployState(state: DeployState): Promise<void> {
  const dir = deployStateDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const finalPath = deployStateFile(state.runtime, state.slug);
  const tmpPath = `${finalPath}.tmp-${crypto.randomBytes(6).toString("hex")}`;
  try {
    await fs.promises.writeFile(tmpPath, JSON.stringify(state, null, 2), {
      mode: 0o644,
    });
    await fs.promises.rename(tmpPath, finalPath);
  } catch (e) {
    // Best-effort cleanup: if rename failed, the tmp file may still exist.
    // Never throw from cleanup; surface the original error to the caller.
    try {
      await fs.promises.rm(tmpPath, { force: true });
    } catch {
      /* noop */
    }
    throw e;
  }
}

/**
 * Read the DeployState for a given (runtime, slug). Returns null when the
 * file does not exist — this is the expected shape for "never deployed yet"
 * and for the brief window during writeDeployState's tmp→final rename. UI
 * polling treats null as "keep polling."
 *
 * Any IO error OTHER than ENOENT is surfaced to the caller — a corrupted
 * JSON payload, a permission problem, etc. are real bugs, not states we
 * want to mask.
 */
export async function readDeployState(
  runtime: Runtime,
  slug: string,
): Promise<DeployState | null> {
  try {
    const raw = await fs.promises.readFile(deployStateFile(runtime, slug), "utf8");
    return JSON.parse(raw) as DeployState;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/**
 * Delete the DeployState for (runtime, slug). Idempotent: missing file is a
 * no-op (force:true swallows ENOENT). Used by rollback paths to guarantee no
 * orphaned state remains after a failed deploy.
 */
export async function deleteDeployState(runtime: Runtime, slug: string): Promise<void> {
  await fs.promises.rm(deployStateFile(runtime, slug), { force: true });
}

/**
 * Compute the newest mtime across the contents of a bundle directory. We
 * cannot use `fs.stat(bundleDir).mtimeMs` alone: the directory's mtime only
 * changes when entries are added or removed, NOT when file contents change in
 * place. Editing SKILL.md or prompt.md would be invisible to a dir-mtime
 * check. We take Math.max over both the directory itself and every entry's
 * mtime so in-place edits surface as drift.
 *
 * Subdirectories inside a bundle are not currently expected, but if present
 * their stat().mtimeMs is used (directory mtime). A future recursive walk
 * can be added if bundles grow nested content.
 */
export async function bundleMtime(bundleDir: string): Promise<number> {
  const dirStat = await fs.promises.stat(bundleDir);
  const entries = await fs.promises.readdir(bundleDir);
  const childStats = await Promise.all(
    entries.map((e) => fs.promises.stat(path.join(bundleDir, e))),
  );
  return Math.max(dirStat.mtimeMs, ...childStats.map((s) => s.mtimeMs));
}

/**
 * Aggregate routine status derived from (state file, bundle mtime, enabled flag).
 *
 *   - No state file OR phase.kind !== "succeeded"   → "draft"
 *   - bundleMtime > state.verifiedAt                 → "drift"
 *   - enabled === false (and deployed, not drifted)  → "disabled"
 *   - otherwise                                      → "deployed"
 *
 * enabled is optional so callers that haven't wired the enable/disable flag
 * yet (Wave 0 tests, early Server Actions) don't need to pass it. A missing
 * or undefined enabled is treated as "enabled=true" — the deployed state.
 */
export async function computeStatus(args: {
  runtime: Runtime;
  slug: string;
  bundleDir: string;
  enabled?: boolean;
}): Promise<RoutineStatus> {
  const state = await readDeployState(args.runtime, args.slug);
  if (!state || state.phase.kind !== "succeeded") return "draft";
  const mtime = await bundleMtime(args.bundleDir);
  if (state.verifiedAt && mtime > state.verifiedAt) return "drift";
  if (args.enabled === false) return "disabled";
  return "deployed";
}
