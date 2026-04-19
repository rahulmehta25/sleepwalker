/**
 * Runtime adapter registry. Internal adapters import from './types'.
 * External consumers may import from this file for one-stop shopping;
 * type-only re-exports at bottom. Phase 2 Plan 09 swapped the Phase 1
 * placeholder stubs for real adapters; Record<Runtime, RuntimeAdapter>
 * shape is unchanged from Phase 1 (frozen surface).
 */

import type {
  RuntimeAdapter,
  Runtime,
  HealthStatus,
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

export function getAdapter(runtime: Runtime): RuntimeAdapter {
  return ADAPTERS[runtime];
}

export async function healthCheckAll(): Promise<HealthStatus[]> {
  return Promise.all(Object.values(ADAPTERS).map((a) => a.healthCheck()));
}

// Convenience re-exports so `import { Runtime, RoutineBundle } from "@/lib/runtime-adapters"` works.
// Verbatim Phase 1 type-only barrel re-exports preserved.
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
