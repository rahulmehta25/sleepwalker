// dashboard/lib/runtime-adapters/gemini.ts
//
// Runtime adapter for Google Gemini CLI Pro.
//
// Near-twin of codex.ts (Plan 02-07) with one critical addition: explicit
// GOOGLE_CLOUD_PROJECT env injection into the plist (Pitfall #3 — Gemini's
// quota-project resolution is non-deterministic without an explicit env
// value; without it gemini may bill a wrong project or fail with cryptic
// quota errors).
//
// Deploy is BLOCKED when quota project is unconfigured. The user must set
// runtime_config.gemini_quota_project in ~/.sleepwalker/settings.json
// before the dashboard accepts a Gemini deploy. Phase 3 editor will add
// UI; Phase 2 just enforces the requirement at the adapter boundary.
//
// Pitfall #2: NO secrets in plist. GEMINI_API_KEY is NEVER written to
// EnvironmentVariables. GOOGLE_APPLICATION_CREDENTIALS, when present in
// the dashboard server env, is passed through — it is a PATH to a
// service-account JSON file (not the credentials themselves); the file
// mode 0600 is owned by the user and gcloud/gemini reads it directly.
//
// Pitfall #4: prompt NEVER enters argv. Plist ProgramArguments is
// [supervisor, runtime, slug] only; supervisor reads prompt.md via stdin.
//
// Auth-conflict (D-04 warn-but-allow): healthCheck sets the optional
// `warning` field on HealthStatus when conflicts are detected
// (GOOGLE_APPLICATION_CREDENTIALS + GEMINI_API_KEY both set, or missing
// quota project). Dashboard renders yellow badge + tooltip from `warning`.

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

const execFileP = promisify(execFile);

/**
 * Absolute path to bin/sleepwalker-run-cli (Plan 02-03 supervisor).
 * Resolved relative to this file: dashboard/lib/runtime-adapters/gemini.ts
 * → ../../.. = repo root → bin/sleepwalker-run-cli. Matches codex.ts pattern.
 */
function supervisorPath(): string {
  return path.resolve(__dirname, "..", "..", "..", "bin", "sleepwalker-run-cli");
}

/** Login-shell PATH resolution for gemini binary (Pitfall #1). */
async function resolveGeminiPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-l", "-c", "command -v gemini"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Read runtime_config.gemini_quota_project from ~/.sleepwalker/settings.json.
 * Returns null on missing file, malformed JSON, missing field, or empty string.
 * Phase 2 does NOT mutate the v0.1 settings.ts surface; this is a defensive
 * fs.readFile + JSON.parse. Phase 3 editor adds UI to edit this value.
 */
async function readQuotaProject(): Promise<string | null> {
  try {
    const home = process.env.HOME || os.homedir();
    const settingsPath = path.join(home, ".sleepwalker", "settings.json");
    const text = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(text) as {
      runtime_config?: { gemini_quota_project?: string };
    };
    const project = parsed.runtime_config?.gemini_quota_project;
    return typeof project === "string" && project.trim() ? project.trim() : null;
  } catch {
    return null;
  }
}

// Cron-5 → LaunchdSchedule is shared with codex.ts — see ./cron.ts. The inline
// copy was removed because parseInt("*/5", 10) returned NaN, which bypassed
// `!== undefined` guards and leaked `<integer>NaN</integer>` into the plist.

export const geminiAdapter: RuntimeAdapter = {
  runtime: "gemini",

  async deploy(bundle: RoutineBundle): Promise<DeployResult> {
    try {
      // Pitfall #3: quota project must be explicit. If missing, BLOCK deploy —
      // never write a plist that might bill the wrong project or fail silently.
      const quotaProject = await readQuotaProject();
      if (!quotaProject) {
        return {
          ok: false,
          error:
            "Gemini quota project not configured. Set runtime_config.gemini_quota_project in ~/.sleepwalker/settings.json before deploy (see docs/AUTHORING.md#gemini-quota-project).",
        };
      }

      const geminiAbs = await resolveGeminiPath();
      if (!geminiAbs) {
        return { ok: false, error: "gemini CLI not found on login-shell PATH" };
      }

      // toLaunchdLabel THROWS on invalid slug (Plan 02-01 assertValidSlug guard).
      // Programmer bug if upstream caller bypasses validateSlug; caught below.
      const label = toLaunchdLabel("gemini", bundle.slug);
      const home = process.env.HOME || os.homedir();
      const logsDir = path.join(home, ".sleepwalker", "logs");
      await fs.mkdir(logsDir, { recursive: true });

      // GOOGLE_APPLICATION_CREDENTIALS is a PATH (not a secret value); pass
      // through if dashboard server has it set so the scheduled gemini run
      // finds the same service account. The file mode 0600 + user ownership
      // keeps the credentials themselves off disk at 0644.
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

      const job: LaunchdJob = {
        label,
        programArguments: [supervisorPath(), "gemini", bundle.slug],
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
          GOOGLE_CLOUD_PROJECT: quotaProject,
          // Conditionally pass-through the credentials PATH (never the value).
          ...(serviceAccountPath
            ? { GOOGLE_APPLICATION_CREDENTIALS: serviceAccountPath }
            : {}),
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
      const label = toLaunchdLabel("gemini", bundle.slug);
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
      // response is not coupled to the supervisor's lifetime. Matches codex.ts.
      const child = spawn(supervisor, ["gemini", bundle.slug], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { ok: true, runId: `gemini:${bundle.slug}:${Date.now()}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listRuns(_bundle: RoutineBundle, _limit?: number): Promise<RunRecord[]> {
    // Phase 5 wires audit.jsonl filtering by fleet=gemini/<slug>.
    return [];
  },

  async healthCheck(): Promise<HealthStatus> {
    const geminiAbs = await resolveGeminiPath();
    if (!geminiAbs) {
      return {
        runtime: "gemini",
        available: false,
        reason: "gemini CLI not found on login-shell PATH",
      };
    }

    let baseVersion = "";
    try {
      const { stdout } = await execFileP(geminiAbs, ["--version"]);
      baseVersion = stdout.trim();
    } catch {
      return {
        runtime: "gemini",
        available: false,
        reason: `${geminiAbs} --version failed`,
      };
    }

    // Auth probe — env var presence only (never echoes values).
    const home = process.env.HOME || os.homedir();
    const dotGeminiExists = await fs
      .stat(path.join(home, ".gemini"))
      .then(() => true)
      .catch(() => false);
    const envSAC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const envApiKey = !!process.env.GEMINI_API_KEY;
    const quotaProject = await readQuotaProject();

    // Conflict 1: service-account + API key both set — gemini prefers SA,
    // but the ambiguity is surprising. Surface a warning so the user can
    // explicitly drop one.
    // Conflict 2: quota project unconfigured — deploy is BLOCKED; surface a
    // warning in healthCheck so the user sees the fix before attempting deploy.
    let warning: string | undefined;
    if (envSAC && envApiKey) {
      warning =
        "GOOGLE_APPLICATION_CREDENTIALS and GEMINI_API_KEY both set; gemini will prefer service account. Unset one in ~/.sleepwalker/env/gemini.env if you want deterministic auth.";
    } else if (!quotaProject) {
      warning =
        "No Gemini quota project configured; deploy is blocked. Set runtime_config.gemini_quota_project in ~/.sleepwalker/settings.json.";
    }

    // Surface the quota project in the version string so the dashboard shows
    // which project will be billed. Informational auth-mode hint follows.
    const versionWithQuota = quotaProject
      ? `${baseVersion} (quota: ${quotaProject})`
      : baseVersion;
    const authHint = dotGeminiExists
      ? "google-signin"
      : envSAC
        ? "service-account"
        : envApiKey
          ? "api-key"
          : "none-detected";
    const versionFinal = `${versionWithQuota} [auth: ${authHint}]`;

    return {
      runtime: "gemini",
      available: true,
      version: versionFinal,
      warning,  // undefined when no conflict; set to warning string when SAC+API-key conflict or missing quota (Plan 09 added this field)
    };
  },
};
