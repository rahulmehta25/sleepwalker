// dashboard/lib/runtime-adapters/codex.ts
//
// Runtime adapter for OpenAI Codex Pro CLI.
//
// deploy() composes launchd-writer (Plan 02) + slug builders (Plan 01
// with assertValidSlug) + bin/sleepwalker-run-cli (Plan 03) into a
// launchctl bootstrap call that registers the routine to fire on
// schedule. Supervisor path is resolved at module load time relative
// to this file; supervisor's resolved-via-login-shell PATH handles
// Pitfall #1 codex binary discovery at runtime.
//
// Pitfall #2: NO secrets in plist EnvironmentVariables. Codex auth
// stays in ~/.codex/auth.json (CLI-owned, mode 0600 by Codex install).
//
// Pitfall #4: prompt NEVER enters argv. Plist ProgramArguments is
// [supervisor, runtime, slug] only; supervisor reads prompt.md via stdin.
//
// Auth-conflict (D-04 warn-but-allow): healthCheck sets the optional
// `warning` field on HealthStatus when a subscription-vs-env-key conflict
// is detected (~/.codex/auth.json + $OPENAI_API_KEY both present without
// preferred_auth_method="apikey" in ~/.codex/config.toml). Dashboard
// renders yellow badge + tooltip from `warning`.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  RuntimeAdapter,
  RoutineBundle,
  DeployResult,
  RunNowResult,
  RunRecord,
  HealthStatus,
} from "./types";
import { toLaunchdLabel } from "./slug";
import {
  installPlist,
  uninstallPlist,
  type LaunchdJob,
  type LaunchdSchedule,
} from "./launchd-writer";

const execFileP = promisify(execFile);

/**
 * Absolute path to bin/sleepwalker-run-cli (Plan 03 supervisor).
 * Resolved relative to this file: dashboard/lib/runtime-adapters/codex.ts
 * → ../../.. = repo root → bin/sleepwalker-run-cli.
 * In Next.js server runtime this resolves correctly because Server Actions
 * run server-side with the source layout intact.
 */
function supervisorPath(): string {
  return path.resolve(__dirname, "..", "..", "..", "bin", "sleepwalker-run-cli");
}

/** Login-shell PATH resolution for codex binary (Pitfall #1). */
async function resolveCodexPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-l", "-c", "command -v codex"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Cron-5 → LaunchdSchedule. Phase 2 supports single-time conversion;
 * unparseable input falls back to daily interval (86400s). Phase 3 editor
 * adds richer cron validation (cronstrue).
 */
function parseCron(cron: string | null): LaunchdSchedule {
  if (!cron) return { kind: "interval", seconds: 86400 };
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return { kind: "interval", seconds: 86400 };
  const num = (s: string) => (s === "*" ? undefined : parseInt(s, 10));
  return {
    kind: "calendar",
    minute: num(parts[0]),
    hour: num(parts[1]),
    day: num(parts[2]),
    month: num(parts[3]),
    weekday: num(parts[4]),
  };
}

export const codexAdapter: RuntimeAdapter = {
  runtime: "codex",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const codexAbs = await resolveCodexPath();
      if (!codexAbs) {
        return { ok: false, error: "codex CLI not found on login-shell PATH" };
      }

      // toLaunchdLabel + toPlistPath now THROW on invalid slug (Plan 01 guard).
      // Programmer bug if upstream caller bypasses validateSlug; we let it propagate.
      const label = toLaunchdLabel("codex", bundle.slug);
      const home = process.env.HOME || os.homedir();
      const logsDir = path.join(home, ".sleepwalker", "logs");
      await fs.mkdir(logsDir, { recursive: true });

      const job: LaunchdJob = {
        label,
        programArguments: [supervisorPath(), "codex", bundle.slug],
        schedule: parseCron(bundle.schedule),
        stdoutPath: path.join(logsDir, `${label}.out`),
        stderrPath: path.join(logsDir, `${label}.err`),
        workingDirectory: bundle.bundlePath,
        environmentVariables: {
          PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
          HOME: home,
          USER: os.userInfo().username,
          NO_COLOR: "1",
          TERM: "dumb",
          CI: "true",
        },
        runAtLoad: false,
        throttleInterval: 300,
      };

      const result = await installPlist(job);
      return result.ok
        ? { ok: true, artifact: result.plistPath }
        : { ok: false, error: result.error, artifact: result.lintOutput };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async undeploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const label = toLaunchdLabel("codex", bundle.slug);
      const result = await uninstallPlist(label);
      return result.ok
        ? { ok: true, artifact: label }
        : { ok: false, error: result.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async runNow(bundle: RoutineBundle, _context?: string): Promise<RunNowResult> {
    try {
      const supervisor = supervisorPath();
      // spawn (not execFile): non-blocking fire-and-forget via detached+unref.
      // stdio: "ignore" detaches stdin/stdout/stderr so the Next.js server
      // response is not coupled to the supervisor's lifetime.
      const child = spawn(supervisor, ["codex", bundle.slug], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { ok: true, runId: `codex:${bundle.slug}:${Date.now()}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // Phase 5 wires audit.jsonl filtering by fleet=codex/<slug>.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    const codexAbs = await resolveCodexPath();
    if (!codexAbs) {
      return {
        runtime: "codex",
        available: false,
        reason: "codex CLI not found on login-shell PATH",
      };
    }
    let version = "";
    try {
      const { stdout } = await execFileP(codexAbs, ["--version"]);
      version = stdout.trim();
    } catch {
      return {
        runtime: "codex",
        available: false,
        reason: `${codexAbs} --version failed`,
      };
    }

    // Auth-conflict detection (D-04 warn-but-allow).
    // Best-effort regex parse of ~/.codex/config.toml; absent files are fine.
    let warning: string | undefined;
    try {
      const home = process.env.HOME || os.homedir();
      const configPath = path.join(home, ".codex", "config.toml");
      const configText = await fs.readFile(configPath, "utf8").catch(() => "");
      const hasAuthJson = await fs
        .stat(path.join(home, ".codex", "auth.json"))
        .then(() => true)
        .catch(() => false);
      const envKey = !!process.env.OPENAI_API_KEY;
      const preferredMatch = configText.match(
        /preferred_auth_method\s*=\s*"([^"]+)"/,
      );
      const preferred = preferredMatch?.[1];
      if (hasAuthJson && envKey && preferred !== "apikey") {
        warning =
          'OPENAI_API_KEY set but ~/.codex/auth.json present — Codex will use subscription login. To force API key, set preferred_auth_method = "apikey" in ~/.codex/config.toml.';
      }
    } catch {
      // Best-effort probe; absent files are fine
    }

    return {
      runtime: "codex",
      available: true,
      version,
      warning,  // undefined when no conflict; set to the warning string when conflict detected (Plan 09 added this field)
    };
  },
};
