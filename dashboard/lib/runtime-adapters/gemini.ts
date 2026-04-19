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
import { ensureStagedSupervisor } from "./supervisor-staging";
import { ensureStagedBundle, removeStagedBundle } from "./bundle-staging";

const execFileP = promisify(execFile);

/**
 * Staging-SOURCE resolution for bin/sleepwalker-run-cli (Plan 02-03 supervisor).
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
 * cryptic failure 30 minutes later via Console.app. Patterns duplicated
 * (not imported) from codex.ts — DRY-ing would force a third module for
 * 12 LOC that change rarely.
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

      // Plan 02-11: stage the supervisor into ~/.sleepwalker/bin/ (outside
      // TCC-protected directories). Staging AFTER quota + CLI checks so a
      // missing source doesn't get surfaced to the user when the earlier
      // precondition was actually the problem.
      const supervisor = await ensureStagedSupervisor();

      // Plan 02-12: stage prompt.md + config.json out of TCC-protected paths.
      // launchd's sandbox blocks reads from ~/Desktop/ + friends even when
      // the supervisor is staged. Plist WorkingDirectory + supervisor $3
      // both point at the staged copy so the launchd sandbox never touches
      // the repo bundle path.
      const stagedBundle = await ensureStagedBundle(
        bundle.bundlePath,
        "gemini",
        bundle.slug,
      );

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
        // Plan 02-12: 4th arg is the STAGED bundle path (not bundle.bundlePath),
        // so the supervisor reads prompt.md + config.json from ~/.sleepwalker/
        // instead of the TCC-protected repo path.
        programArguments: [supervisor, "gemini", bundle.slug, stagedBundle],
        schedule: parseCron(bundle.schedule),
        stdoutPath: path.join(logsDir, `${label}.out`),
        stderrPath: path.join(logsDir, `${label}.err`),
        // Plan 02-12: WorkingDirectory ALSO points at the staged bundle.
        // launchd resolves WorkingDirectory before it executes the program;
        // if it points into TCC territory, the job fails with getcwd noise
        // before the supervisor ever runs.
        workingDirectory: stagedBundle,
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
      const label = toLaunchdLabel("gemini", bundle.slug);
      const result = await uninstallPlist(label);
      // Plan 02-12: clean up the staged bundle (idempotent — no error if
      // absent). Runs after uninstallPlist so we never leave stale bundles
      // pointing at a live launchd job.
      await removeStagedBundle("gemini", bundle.slug);
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
      // Plan 02-12: stage the bundle for runNow() too. Matches the deploy
      // pattern — consistent 4-arg supervisor contract regardless of caller.
      const stagedBundle = await ensureStagedBundle(
        bundle.bundlePath,
        "gemini",
        bundle.slug,
      );
      // spawn (not execFile): non-blocking fire-and-forget via detached+unref.
      // stdio: "ignore" detaches stdin/stdout/stderr so the Next.js server
      // response is not coupled to the supervisor's lifetime. Matches codex.ts.
      const child = spawn(supervisor, ["gemini", bundle.slug, stagedBundle], {
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
