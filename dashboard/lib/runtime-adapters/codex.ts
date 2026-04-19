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
import { parseCron } from "./cron";
import { ensureStagedSupervisor } from "./supervisor-staging";

const execFileP = promisify(execFile);

/**
 * Staging-SOURCE resolution for bin/sleepwalker-run-cli (Plan 03 supervisor).
 * Uses process.cwd() (repo root in dev) with SLEEPWALKER_REPO_ROOT env
 * override for production builds where __dirname resolves to .next/server/.
 *
 * NOTE (Plan 02-11): deploy() + runNow() no longer pass this path to
 * launchd directly. They `await ensureStagedSupervisor()` which COPIES
 * this source into ~/.sleepwalker/bin/sleepwalker-run-cli-<hash8> (outside
 * macOS TCC-protected directories). This function remains as the named
 * resolver that ensureStagedSupervisor() mirrors, and is kept available
 * so tests can stub supervisor discovery in isolation.
 */
function supervisorPath(): string {
  const root = process.env.SLEEPWALKER_REPO_ROOT || path.resolve(process.cwd(), "..");
  return path.join(root, "bin", "sleepwalker-run-cli");
}

/**
 * macOS TCC-protected directory patterns. When bundle.bundlePath matches
 * any of these, launchd may be blocked from executing OR reading files in
 * the bundle (Operation not permitted) unless the user grants Full Disk
 * Access to launchd. We surface this at deploy time as a non-blocking
 * warning so the user sees a one-line banner instead of debugging a
 * cryptic failure 30 minutes later via Console.app.
 */
const TCC_PATTERNS = [
  /\/Desktop(\/|$)/,
  /\/Documents(\/|$)/,
  /\/Downloads(\/|$)/,
  /\/Library\/Mobile Documents(\/|$)/, // iCloud Drive
];

function tccWarning(bundlePath: string): string | undefined {
  const abs = path.resolve(bundlePath);
  if (!TCC_PATTERNS.some((rx) => rx.test(abs))) return undefined;
  return (
    `bundlePath is under a macOS TCC-protected directory (${abs}). ` +
    `If scheduled runs fail with "Operation not permitted", grant Full Disk ` +
    `Access to launchd via System Settings → Privacy & Security → Full Disk ` +
    `Access, OR move the routine bundle outside ~/Desktop, ~/Documents, ` +
    `~/Downloads, or iCloud.`
  );
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

// Cron-5 → LaunchdSchedule is shared with gemini.ts — see ./cron.ts. The inline
// copy was removed because parseInt("*/5", 10) returned NaN, which bypassed
// `!== undefined` guards and leaked `<integer>NaN</integer>` into the plist.

export const codexAdapter: RuntimeAdapter = {
  runtime: "codex",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      const codexAbs = await resolveCodexPath();
      if (!codexAbs) {
        return { ok: false, error: "codex CLI not found on login-shell PATH" };
      }

      // Plan 02-11: stage the supervisor into ~/.sleepwalker/bin/ (outside
      // TCC-protected directories). Source resolution mirrors supervisorPath()
      // above; target filename is content-hash-versioned so concurrent
      // deploys never stomp an executing supervisor binary.
      const supervisor = await ensureStagedSupervisor();

      // toLaunchdLabel + toPlistPath now THROW on invalid slug (Plan 01 guard).
      // Programmer bug if upstream caller bypasses validateSlug; we let it propagate.
      const label = toLaunchdLabel("codex", bundle.slug);
      const home = process.env.HOME || os.homedir();
      const logsDir = path.join(home, ".sleepwalker", "logs");
      await fs.mkdir(logsDir, { recursive: true });

      const job: LaunchdJob = {
        label,
        programArguments: [supervisor, "codex", bundle.slug],
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
      const warning = tccWarning(bundle.bundlePath);
      return result.ok
        ? { ok: true, artifact: result.plistPath, ...(warning ? { warning } : {}) }
        : {
            ok: false,
            error: result.error,
            artifact: result.lintOutput,
            ...(warning ? { warning } : {}),
          };
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
      // Plan 02-11: runNow() fires through the same staged supervisor as
      // deploy() so manual fire-now replays the exact TCC-safe path that
      // scheduled runs take.
      const supervisor = await ensureStagedSupervisor();
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
