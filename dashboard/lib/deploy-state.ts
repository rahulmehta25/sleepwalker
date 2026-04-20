// dashboard/lib/deploy-state.ts
// Authoritative source: .planning/phases/04-deploy/04-RESEARCH.md §Deploy State Machine Design
// (lines 155-260) + §Drift Detection (lines 349-388).
//
// Single source of truth for the 4-stage deploy state machine's persistence
// layer and for the mtime(bundle) > verifiedAt ⇒ drift invariant (DEPL-01,
// DEPL-03). Every deploy Server Action, every poll endpoint, and every drift
// computation in Phase 4 calls into this module.
//
// This file is scaffolded in Plan 04-01 Task 1 (types + path builders + stub
// function exports). Bodies are filled in Task 2 alongside the test matrix.
//
// Path convention (04-RESEARCH.md line 192):
//   ~/.sleepwalker/deploys/<runtime>-<slug>.state.json
//   (slash-free to avoid nested-dir semantics; mirrors launchd label minus
//    the com.sleepwalker. prefix for grep-ability.)

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

// Suppress "imports unused in scaffold" warnings — Task 2 fills bodies that
// consume every import above. Keep this block so `pnpm run typecheck` exits 0
// after Task 1 without noUnusedLocals / noUnusedParameters tripping.
void fs;
void crypto;

export async function writeDeployState(_state: DeployState): Promise<void> {
  throw new Error("unimplemented");
}

export async function readDeployState(
  _runtime: Runtime,
  _slug: string,
): Promise<DeployState | null> {
  throw new Error("unimplemented");
}

export async function deleteDeployState(
  _runtime: Runtime,
  _slug: string,
): Promise<void> {
  throw new Error("unimplemented");
}

export async function bundleMtime(_bundleDir: string): Promise<number> {
  throw new Error("unimplemented");
}

export async function computeStatus(_args: {
  runtime: Runtime;
  slug: string;
  bundleDir: string;
  enabled?: boolean;
}): Promise<RoutineStatus> {
  throw new Error("unimplemented");
}
