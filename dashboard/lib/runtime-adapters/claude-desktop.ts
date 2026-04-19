// dashboard/lib/runtime-adapters/claude-desktop.ts
//
// Runtime adapter for Anthropic Claude Code Desktop Scheduled Tasks (local).
//
// Locked decision (D-03): browser handoff. deploy() writes SKILL.md to
// ~/.claude/scheduled-tasks/<slug>/ and returns claude:// deeplink for the
// user to click. Desktop's internal state machine handles the schedule
// (frequency lives in Desktop, not the disk).
//
// Phase 1 research flag remains open (Q1): does Desktop pick up SKILL.md
// without user action in the Schedule tab? Resolved via Plan 10 manual
// smoke test (test/manual/claude-desktop-smoke.md). Phase 2 adapter ships
// the safe path; if Desktop requires user action in Schedule tab, the
// handoff URL still gets the user there.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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

const execFileP = promisify(execFile);

function scheduledTasksDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".claude", "scheduled-tasks");
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
      const skillPath = path.join(targetDir, "SKILL.md");
      // Mode 0644: SKILL.md is non-secret (Pitfall #2 family — secrets must
      // never be in prompt text; Phase 3 editor scans before save).
      await fs.writeFile(skillPath, bundle.prompt, { mode: 0o644 });
      return {
        ok: true,
        artifact: skillPath,
        handoffUrl: `claude://scheduled-tasks?slug=${encodeURIComponent(bundle.slug)}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async undeploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const targetDir = bundleScheduledPath(bundle.slug);
      // recursive + force: idempotent on missing directory (ENOENT becomes ok)
      await fs.rm(targetDir, { recursive: true, force: true });
      return { ok: true, artifact: targetDir };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult> {
    try {
      // execFile array args = no shell interpolation. Prompt enters argv as
      // a single string argument (no risk of shell expansion). This is
      // distinct from Codex/Gemini where prompt MUST go via stdin (those
      // CLIs receive multiple flags + would lose stdin to argv-injection).
      const promptArg = context
        ? `${bundle.prompt}\n\n<context>\n${context}\n</context>`
        : bundle.prompt;
      await execFileP("claude", ["-p", promptArg]);
      return {
        ok: true,
        runId: `claude-desktop:${bundle.slug}:${Date.now()}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // v0.1 audit.jsonl + queue-aggregator already surface claude-desktop runs;
    // per-adapter listing not added in Phase 2.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    const home = process.env.HOME || os.homedir();
    const dotClaudeExists = await fs
      .stat(path.join(home, ".claude"))
      .then(() => true)
      .catch(() => false);
    if (!dotClaudeExists) {
      return {
        runtime: "claude-desktop",
        available: false,
        reason: "~/.claude/ not found; is Claude Desktop installed?",
      };
    }
    try {
      const { stdout } = await execFileP("/bin/zsh", [
        "-l",
        "-c",
        "claude --version",
      ]);
      return {
        runtime: "claude-desktop",
        available: true,
        version: stdout.trim(),
      };
    } catch {
      return {
        runtime: "claude-desktop",
        available: false,
        reason: "claude CLI not found on login-shell PATH; see docs/AUTHORING.md",
      };
    }
  },
};
