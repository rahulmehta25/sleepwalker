import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/**
 * Result-object shape for a single diagnostic probe. No throws from
 * gatherDiagnostics — every probe returns one of these two variants.
 * Pattern per CLAUDE.md §Conventions (result-object error returns) +
 * RESEARCH §3.3 fail-soft matrix.
 */
export type Probe =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Full snapshot returned by gatherDiagnostics. `rows` keys are stable
 * so formatAsIssueBody can use them as an EXPLICIT allowlist (Pitfall 1
 * defense — adding a new probe key does NOT auto-leak into copy output).
 */
export interface DiagnosticsSnapshot {
  capturedAt: string; // ISO 8601
  rows: {
    macos: Probe;
    arch: Probe;
    brew: Probe;
    shell: Probe;
    claude: Probe;
    codex: Probe;
    gemini: Probe;
    flock: Probe;
    jq: Probe;
    launchAgents: Probe;
    sleepwalkerState: Probe;
  };
  gitSha?: string; // short HEAD sha, best-effort
}

const EXEC_OPTS = { timeout: 2000, maxBuffer: 64_000 } as const;

/**
 * Direct subprocess probe — hardcoded arg arrays only, never user input.
 * execFile (not exec / spawn-through-shell) to keep zero shell-interpolation
 * surface per CLAUDE.md §Safety + threat-model T-06-02-01.
 */
async function probeExec(
  file: string,
  args: readonly string[],
): Promise<Probe> {
  try {
    const { stdout } = await execFile(file, [...args], EXEC_OPTS);
    const trimmed = stdout.trim();
    if (!trimmed) return { ok: false, error: "empty output" };
    return { ok: true, value: trimmed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.split("\n")[0].slice(0, 200) };
  }
}

/**
 * Probe a CLI via login-shell invocation so Homebrew-installed binaries
 * are found. Matches the supervisor's PATH-resolution idiom
 * (bin/sleepwalker-run-cli per Phase 2 Plan 02-03). Using execFile directly
 * with `command` / `which` bypasses shell config and misses Homebrew-installed
 * binaries on common Mac dev setups (RESEARCH §3.2).
 */
async function probeCli(cmd: string): Promise<Probe> {
  try {
    const { stdout } = await execFile(
      "/bin/zsh",
      ["-l", "-c", `command -v ${cmd} && ${cmd} --version 2>&1 | head -1`],
      EXEC_OPTS,
    );
    const lines = stdout.trim().split("\n");
    if (!lines[0]) return { ok: false, error: "not on PATH" };
    const pathLine = lines[0];
    const versionLine = lines[1] ?? "(version unknown)";
    return { ok: true, value: `${versionLine} — ${pathLine}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes("Command failed")
        ? "not on PATH"
        : msg.split("\n")[0].slice(0, 200),
    };
  }
}

/**
 * Synchronous probe of $SHELL env var — no subprocess needed. Renders the
 * literal path (e.g. "/bin/zsh" or "/opt/homebrew/bin/fish") verbatim per
 * RESEARCH §3.3 fish-shell row.
 */
function probeShell(): Probe {
  const s = process.env.SHELL;
  if (!s) return { ok: false, error: "$SHELL unset" };
  return { ok: true, value: s };
}

/**
 * Distinguish v0.2 install (flock lockfile present per Plan 05-05) from v0.1
 * install (no lockfile) from no install. Helps triage bug reports per
 * RESEARCH §3.7.
 */
function probeSleepwalkerState(): Probe {
  try {
    const home = os.homedir();
    const stateDir = path.join(home, ".sleepwalker");
    const lockFile = path.join(stateDir, "audit.jsonl.lock");
    if (!fs.existsSync(stateDir)) return { ok: true, value: "not installed" };
    if (fs.existsSync(lockFile)) return { ok: true, value: "installed (v0.2)" };
    return { ok: true, value: "installed (v0.1)" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Best-effort short HEAD sha for bug-report triage. Omitted silently on any
 * failure (not a git repo, git not on PATH, etc.) — this is metadata, not a
 * probe the user can act on.
 */
async function probeGitSha(): Promise<string | undefined> {
  try {
    const { stdout } = await execFile(
      "git",
      ["rev-parse", "--short", "HEAD"],
      EXEC_OPTS,
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run all 11 probes in parallel via Promise.allSettled — one hung probe
 * does NOT block the others. Every probe has its own try/catch so
 * allSettled outcomes are always fulfilled; we defensively unwrap any
 * rejected settlement into a result-object error. Per-probe timeout
 * 2000ms + maxBuffer 64KB bound total latency to <2.5s wall clock.
 */
export async function gatherDiagnostics(): Promise<DiagnosticsSnapshot> {
  const home = os.homedir();
  const launchAgentsPath = path.join(home, "Library", "LaunchAgents");

  const results = await Promise.allSettled([
    probeExec("sw_vers", ["-productVersion"]),             // 0 macos
    probeExec("uname", ["-m"]),                            // 1 arch
    probeExec("brew", ["--prefix"]),                       // 2 brew
    Promise.resolve(probeShell()),                         // 3 shell
    probeCli("claude"),                                    // 4 claude
    probeCli("codex"),                                     // 5 codex
    probeCli("gemini"),                                    // 6 gemini
    probeCli("flock"),                                     // 7 flock
    probeCli("jq"),                                        // 8 jq
    probeExec("stat", ["-f", "%Mp%Lp", launchAgentsPath]), // 9 launchAgents
    Promise.resolve(probeSleepwalkerState()),              // 10 sleepwalkerState
  ]);

  const read = (idx: number): Probe => {
    const s = results[idx];
    if (s.status === "fulfilled") return s.value;
    return {
      ok: false,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  };

  const gitSha = await probeGitSha();

  return {
    capturedAt: new Date().toISOString(),
    rows: {
      macos: read(0),
      arch: read(1),
      brew: read(2),
      shell: read(3),
      claude: read(4),
      codex: read(5),
      gemini: read(6),
      flock: read(7),
      jq: read(8),
      launchAgents: read(9),
      sleepwalkerState: read(10),
    },
    gitSha,
  };
}

/**
 * Render a GitHub-issue-body-ready fenced code block. Uses an EXPLICIT
 * FIELD ALLOWLIST so adding a new probe to DiagnosticsSnapshot.rows
 * does NOT auto-leak into copy output — maintainers must add each
 * new field here deliberately (Pitfall 1 defense per RESEARCH §9).
 */
export function formatAsIssueBody(d: DiagnosticsSnapshot): string {
  const pv = (p: Probe): string => (p.ok ? p.value : `(${p.error})`);
  const lines: string[] = [
    "## Environment",
    "```text",
    `macOS:            ${pv(d.rows.macos)}`,
    `Arch:             ${pv(d.rows.arch)}`,
    `Homebrew:         ${pv(d.rows.brew)}`,
    `Shell:            ${pv(d.rows.shell)}`,
    `claude:           ${pv(d.rows.claude)}`,
    `codex:            ${pv(d.rows.codex)}`,
    `gemini:           ${pv(d.rows.gemini)}`,
    `flock:            ${pv(d.rows.flock)}`,
    `jq:               ${pv(d.rows.jq)}`,
    `LaunchAgents:     ${pv(d.rows.launchAgents)}`,
    `Sleepwalker:      ${pv(d.rows.sleepwalkerState)}`,
  ];
  if (d.gitSha) lines.push(`Commit:           ${d.gitSha}`);
  lines.push(`Captured:         ${d.capturedAt}`);
  lines.push("```");
  return lines.join("\n");
}
