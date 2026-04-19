// dashboard/lib/runtime-adapters/launchd-writer.ts
//
// Hand-rolled plist XML writer for Sleepwalker launchd integration.
// Split into three exports for test ergonomics:
//   - generatePlist(job)   : pure string generation; snapshot-testable
//   - installPlist(job)    : fs write + plutil-lint + bootout+bootstrap
//   - uninstallPlist(label): bootout + unlink (idempotent)
//
// Per .planning/research/PITFALLS.md: plist is mode 0644 (launchd rejects 0600);
// therefore NO secrets may enter environmentVariables. Callers (codex.ts, gemini.ts)
// are responsible for excluding secrets; this module does not validate content.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type LaunchdSchedule =
  | { kind: "calendar"; minute?: number; hour?: number; day?: number; weekday?: number; month?: number }
  | { kind: "calendar-array"; entries: Array<{ minute?: number; hour?: number; weekday?: number }> }
  | { kind: "interval"; seconds: number };

export interface LaunchdJob {
  label: string;
  programArguments: string[];
  schedule: LaunchdSchedule;
  stdoutPath: string;
  stderrPath: string;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
  runAtLoad?: boolean;
  throttleInterval?: number;
}

export interface InstallResult {
  ok: boolean;
  plistPath?: string;
  error?: string;
  lintOutput?: string;
}

/**
 * 5-char XML entity escape. & MUST BE FIRST so the subsequent replacements
 * do not double-escape an ampersand introduced by this very function.
 */
function plistEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render a LaunchdJob to a plutil -lint-passing plist XML document.
 * Pure function — no I/O, no side effects; snapshot-testable.
 *
 * Element order follows Apple's launchd.plist(5) conventions:
 *   Label → ProgramArguments → schedule → std{out,err}Path → WorkingDirectory
 *   → EnvironmentVariables → RunAtLoad → ThrottleInterval.
 *
 * Optional fields (workingDirectory, environmentVariables) are omitted from
 * output when undefined. RunAtLoad defaults to false; ThrottleInterval
 * defaults to 300 seconds (prevents crash-loop respawn storms).
 */
export function generatePlist(job: LaunchdJob): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${plistEscape(job.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
  ];
  for (const arg of job.programArguments) {
    lines.push(`    <string>${plistEscape(arg)}</string>`);
  }
  lines.push('  </array>');

  // Schedule dispatch. isFiniteInt defends against NaN leaking into
  // <integer>…</integer> — a bad upstream cron parser (e.g. parseInt("*/5", 10))
  // once produced NaN that passed the old `!== undefined` check and caused
  // plutil -lint to reject the plist.
  const isFiniteInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  if (job.schedule.kind === "interval") {
    lines.push(`  <key>StartInterval</key><integer>${job.schedule.seconds}</integer>`);
  } else if (job.schedule.kind === "calendar") {
    lines.push('  <key>StartCalendarInterval</key>');
    lines.push('  <dict>');
    const cal = job.schedule;
    if (isFiniteInt(cal.minute))  lines.push(`    <key>Minute</key><integer>${cal.minute}</integer>`);
    if (isFiniteInt(cal.hour))    lines.push(`    <key>Hour</key><integer>${cal.hour}</integer>`);
    if (isFiniteInt(cal.day))     lines.push(`    <key>Day</key><integer>${cal.day}</integer>`);
    if (isFiniteInt(cal.weekday)) lines.push(`    <key>Weekday</key><integer>${cal.weekday}</integer>`);
    if (isFiniteInt(cal.month))   lines.push(`    <key>Month</key><integer>${cal.month}</integer>`);
    lines.push('  </dict>');
  } else {
    // calendar-array
    lines.push('  <key>StartCalendarInterval</key>');
    lines.push('  <array>');
    for (const e of job.schedule.entries) {
      lines.push('    <dict>');
      if (isFiniteInt(e.minute))  lines.push(`      <key>Minute</key><integer>${e.minute}</integer>`);
      if (isFiniteInt(e.hour))    lines.push(`      <key>Hour</key><integer>${e.hour}</integer>`);
      if (isFiniteInt(e.weekday)) lines.push(`      <key>Weekday</key><integer>${e.weekday}</integer>`);
      lines.push('    </dict>');
    }
    lines.push('  </array>');
  }

  lines.push(`  <key>StandardOutPath</key><string>${plistEscape(job.stdoutPath)}</string>`);
  lines.push(`  <key>StandardErrorPath</key><string>${plistEscape(job.stderrPath)}</string>`);

  if (job.workingDirectory !== undefined) {
    lines.push(`  <key>WorkingDirectory</key><string>${plistEscape(job.workingDirectory)}</string>`);
  }

  if (job.environmentVariables !== undefined) {
    lines.push('  <key>EnvironmentVariables</key>');
    lines.push('  <dict>');
    for (const [k, v] of Object.entries(job.environmentVariables)) {
      lines.push(`    <key>${plistEscape(k)}</key><string>${plistEscape(v)}</string>`);
    }
    lines.push('  </dict>');
  }

  // RunAtLoad: default false
  lines.push(`  <key>RunAtLoad</key><${job.runAtLoad ? "true" : "false"}/>`);

  // ThrottleInterval: default 300 (prevents crash-loop respawn storms)
  const throttle = job.throttleInterval ?? 300;
  lines.push(`  <key>ThrottleInterval</key><integer>${throttle}</integer>`);

  lines.push('</dict>', '</plist>', '');
  return lines.join("\n");
}

/**
 * Resolve $HOME/Library/LaunchAgents/<label>.plist.
 * Uses process.env.HOME with os.homedir() fallback (matches slug.ts pattern).
 */
function launchAgentsPath(label: string): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, "Library", "LaunchAgents", `${label}.plist`);
}

/**
 * Get the current user's UID for gui/$UID launchd domain targeting.
 * process.getuid() is POSIX-only; macOS is POSIX so this is safe.
 */
function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new Error("process.getuid() unavailable - non-POSIX runtime not supported");
  }
  return process.getuid();
}

/**
 * Write plist -> plutil -lint -> bootout (idempotent) -> bootstrap.
 * Returns result object; never throws for operational failures.
 *
 * Pitfall #2: plist is mode 0644 (launchd rejects 0600). Callers must ensure
 * no secrets enter environmentVariables.
 * Pitfall #4: bootout-before-bootstrap is required; second bootstrap without
 * bootout silently no-ops if label is already loaded.
 */
export async function installPlist(job: LaunchdJob): Promise<InstallResult> {
  const plistPath = launchAgentsPath(job.label);
  try {
    // Ensure ~/Library/LaunchAgents/ exists (fresh Mac may not have it)
    await fs.mkdir(path.dirname(plistPath), { recursive: true });

    // Render + write (mode 0644 - launchd rejects more restrictive)
    const xml = generatePlist(job);
    await fs.writeFile(plistPath, xml, { mode: 0o644 });

    // plutil -lint BEFORE bootstrap (cryptic xpcproxy errors otherwise)
    try {
      await execFileP("plutil", ["-lint", plistPath]);
    } catch (e) {
      const lintOutput = e instanceof Error && "stderr" in e ? String((e as { stderr: unknown }).stderr) : String(e);
      await fs.unlink(plistPath).catch(() => { /* swallow */ });
      return { ok: false, error: "plist lint failed", lintOutput };
    }

    // bootout first (ignore failures - idempotent "not loaded" case)
    const domain = `gui/${currentUid()}`;
    await execFileP("launchctl", ["bootout", domain, plistPath]).catch(() => { /* intentional swallow */ });

    // bootstrap - on failure, unlink plist (rollback) and return error
    try {
      await execFileP("launchctl", ["bootstrap", domain, plistPath]);
      return { ok: true, plistPath };
    } catch (e) {
      await fs.unlink(plistPath).catch(() => { /* swallow */ });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * bootout + unlink plist. Idempotent: succeeds even if plist was absent.
 */
export async function uninstallPlist(label: string): Promise<InstallResult> {
  const plistPath = launchAgentsPath(label);
  try {
    const domain = `gui/${currentUid()}`;
    await execFileP("launchctl", ["bootout", domain, plistPath]).catch(() => { /* intentional swallow */ });
    try {
      await fs.unlink(plistPath);
    } catch (e) {
      // ENOENT is success for idempotent undeploy; anything else bubbles up
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: true, plistPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
