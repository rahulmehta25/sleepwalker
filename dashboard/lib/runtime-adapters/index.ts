/**
 * Runtime adapter registry. Internal adapters import from './types'.
 * External consumers may import from this file for one-stop shopping;
 * type-only re-exports at bottom. Phase 2 replaces notImplemented() stubs
 * with real adapter modules; the shape of ADAPTERS (Record<Runtime, RuntimeAdapter>)
 * does not change.
 */

import type {
  RuntimeAdapter,
  Runtime,
  HealthStatus,
  RoutineBundle,
  DeployResult,
  RunNowResult,
  RunRecord,
} from "./types";

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
export type {
  Runtime,
  RoutineBundle,
  RuntimeAdapter,
  HealthStatus,
  DeployResult,
  RunNowResult,
  RunRecord,
  Reversibility,
} from "./types";
