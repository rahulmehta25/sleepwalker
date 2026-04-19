// dashboard/lib/runtime-adapters/supervisor-staging.ts
//
// Content-hash-versioned staging of bin/sleepwalker-run-cli into
// ~/.sleepwalker/bin/sleepwalker-run-cli-<hash8>. Two problems solved:
//
// 1. macOS TCC blocks launchd from executing binaries in protected paths
//    (~/Desktop, ~/Documents, ~/Downloads, iCloud). Staging into
//    ~/.sleepwalker/ (user's home, not TCC-protected) makes the executable
//    half of the supervisor pipeline work regardless of where the repo lives.
//
// 2. Overwriting an executing supervisor binary mid-run is defined but
//    fragile on macOS. Versioned filenames (one-per-content-hash) mean a
//    concurrent re-stage NEVER replaces the file a live launchd job holds.
//
// Source path resolution mirrors codex.ts/gemini.ts: process.env
// SLEEPWALKER_REPO_ROOT override with process.cwd()+/.. fallback.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function repoRoot(): string {
  return process.env.SLEEPWALKER_REPO_ROOT || path.resolve(process.cwd(), "..");
}

function sourcePath(): string {
  return path.join(repoRoot(), "bin", "sleepwalker-run-cli");
}

function stagingDir(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, ".sleepwalker", "bin");
}

async function sha256Hex8(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

/**
 * Ensure a content-versioned copy of bin/sleepwalker-run-cli exists in
 * ~/.sleepwalker/bin/. Returns the absolute path to the staged copy.
 *
 * Idempotent: second call with unchanged source is a stat + hash only
 * (sub-millisecond). fs.copyFile is atomic (POSIX rename semantics); mode
 * is explicitly re-applied via fs.chmod because fs.copyFile's preserve-mode
 * behavior varies across Node versions.
 *
 * Throws if source is missing — caller's deploy() wraps in try/catch and
 * surfaces the error to DeployResult.
 */
export async function ensureStagedSupervisor(): Promise<string> {
  const src = sourcePath();
  // fs.stat first for the clearest error path — readFile on missing file
  // buries the path in a generic ENOENT message.
  let srcStat;
  try {
    srcStat = await fs.stat(src);
  } catch {
    throw new Error(
      `Supervisor source not found at ${src}. ` +
        `Set SLEEPWALKER_REPO_ROOT to the repo root, or run install.sh first.`,
    );
  }
  if (!srcStat.isFile()) {
    throw new Error(`Supervisor source at ${src} is not a regular file.`);
  }

  const hash = await sha256Hex8(src);
  const destDir = stagingDir();
  const dest = path.join(destDir, `sleepwalker-run-cli-${hash}`);

  // Fast path: staged copy with matching hash already exists and is
  // executable — return it. We trust the filename's hash to be honest.
  try {
    const destStat = await fs.stat(dest);
    if (destStat.isFile() && (destStat.mode & 0o111) !== 0) {
      return dest;
    }
  } catch {
    // ENOENT is expected on first stage; fall through to copy
  }

  await fs.mkdir(destDir, { recursive: true });
  // Defense-in-depth: unlink any pre-existing partial write. fs.copyFile
  // with the default flags overwrites, but an unlink-first makes the
  // intent explicit and survives weird filesystem corner cases.
  await fs.unlink(dest).catch(() => undefined);
  await fs.copyFile(src, dest);
  // Explicit chmod because fs.cp's mode-preservation varies across
  // Node versions and fs.copyFile does not preserve mode on some
  // platforms. 0o755 = rwxr-xr-x, required for launchd exec.
  await fs.chmod(dest, 0o755);

  return dest;
}
