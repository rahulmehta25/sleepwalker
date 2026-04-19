// dashboard/lib/runtime-adapters/claude-routines.ts
//
// Runtime adapter for Anthropic Claude Code Routines (cloud).
//
// Anthropic does NOT expose a programmatic Routines API: schedule triggers
// must be completed via the web /schedule create page; API triggers require
// browser handoff. So `deploy()` returns a `handoffUrl` and the dashboard
// renders a one-click "Open in Claude" link. `runNow()` wraps the existing
// v0.1 /fire endpoint via fire-routine.ts — no logic duplication.
//
// Pitfall #12: beta-header is re-exported here for single-source-of-truth
// assertions. Canonical value lives in fire-routine.ts; constants must stay
// in sync (test asserts equality).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  RuntimeAdapter,
  RoutineBundle,
  DeployResult,
  RunNowResult,
  RunRecord,
  HealthStatus,
} from "./types";
import { fireRoutine } from "../fire-routine";

const execFileP = promisify(execFile);

/**
 * Anthropic beta-header version. KEEP IN SYNC with the BETA_HEADER constant
 * in dashboard/lib/fire-routine.ts. Pitfall #12 mitigation: tests assert
 * this value matches; bump in code (not in settings.json) on Anthropic
 * deprecation.
 */
export const CC_ROUTINE_BETA = "experimental-cc-routine-2026-04-01";

/**
 * Build the /schedule create deeplink. User prompt passes through
 * encodeURIComponent (ASVS V14 output encoding — Threat T-02-05-01) so it
 * cannot break out of the query string.
 */
function handoffUrlForBundle(bundle: RoutineBundle): string {
  const name = encodeURIComponent(bundle.name);
  const prompt = encodeURIComponent(bundle.prompt);
  const cadence = encodeURIComponent(bundle.schedule ?? "");
  return `https://claude.ai/code/routines/new?name=${name}&prompt=${prompt}&cadence=${cadence}`;
}

export const claudeRoutinesAdapter: RuntimeAdapter = {
  runtime: "claude-routines",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    return {
      ok: true,
      handoffUrl: handoffUrlForBundle(bundle),
      artifact: `browser-handoff:${bundle.slug}`,
    };
  },

  async undeploy(_bundle: RoutineBundle): Promise<DeployResult> {
    return {
      ok: true,
      handoffUrl: "https://claude.ai/code/routines",
      artifact: "browser-handoff-undeploy",
    };
  },

  async runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult> {
    const res = await fireRoutine(bundle.slug, context);
    if (!res.ok) {
      return { ok: false, error: res.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, runId: res.sessionId, watchUrl: res.sessionUrl };
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // Cloud runs surfaced via GitHub PR polling (v0.1 cloud-cache.ts);
    // per-routine listing wired in Phase 5.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    try {
      // Pitfall #1: on dev machines `claude` often lives at a non-standard
      // path (e.g. ~/.local/bin, /opt/homebrew/bin). Login-shell PATH
      // resolution picks up the user's zsh rc files.
      const { stdout } = await execFileP("/bin/zsh", [
        "-l",
        "-c",
        "claude --version",
      ]);
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
