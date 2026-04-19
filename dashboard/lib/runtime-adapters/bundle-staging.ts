// dashboard/lib/runtime-adapters/bundle-staging.ts
//
// Stages the user-authored bundle (prompt.md + config.json) from the repo
// into ~/.sleepwalker/staged-bundles/<runtime>/<slug>/ so launchd can read
// them even when the repo lives under a TCC-protected directory
// (~/Desktop, ~/Documents, ~/Downloads, iCloud).
//
// Plan 02-11 staged the supervisor binary for the same reason. That was
// necessary but not sufficient — launchd's sandboxed job environment
// blocks READS from TCC paths too, so `cat $BUNDLE_DIR/prompt.md` fails
// with "Operation not permitted" even from a staged supervisor.
//
// The staged-bundle path is used as BOTH the supervisor's $3 bundle_dir
// argument (Plan 02-11 feature) AND the plist's WorkingDirectory, so the
// launchd sandbox never touches the repo bundle path at all. Resolves
// the `getcwd: cannot access parent directories` noise too.
//
// Staging is idempotent via per-file sha256 fast path.
// undeploy() cleans up via removeStagedBundle.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Runtime } from "./types";

const FILES_TO_STAGE = ["prompt.md", "config.json"] as const;

function stagedBundleRoot(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, ".sleepwalker", "staged-bundles");
}

function stagedBundlePath(runtime: Runtime, slug: string): string {
  return path.join(stagedBundleRoot(), runtime, slug);
}

async function sha256OfFile(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Ensure a staged copy of <bundlePath>/{prompt.md, config.json} exists at
 * ~/.sleepwalker/staged-bundles/<runtime>/<slug>/. Returns the absolute
 * path to the staged bundle directory.
 *
 * Idempotent: if the staged copy exists and each file's sha256 matches
 * the source, no re-copy happens. If any file is missing, outdated, or
 * has different content, it is overwritten.
 *
 * Throws if <bundlePath>/prompt.md is missing (config.json is optional
 * — if missing in source, the staged copy is also absent).
 */
export async function ensureStagedBundle(
  bundlePath: string,
  runtime: Runtime,
  slug: string,
): Promise<string> {
  // Source validation — prompt.md is mandatory
  const sourcePrompt = path.join(bundlePath, "prompt.md");
  try {
    await fs.stat(sourcePrompt);
  } catch {
    throw new Error(
      `Bundle source prompt.md not found at ${sourcePrompt}. ` +
        `Deploy requires a valid routine bundle.`,
    );
  }

  const dest = stagedBundlePath(runtime, slug);
  await fs.mkdir(dest, { recursive: true });

  for (const name of FILES_TO_STAGE) {
    const src = path.join(bundlePath, name);
    const dst = path.join(dest, name);

    // config.json is optional — skip if absent in source, and remove any
    // stale copy in dest.
    let srcExists: boolean;
    try {
      await fs.stat(src);
      srcExists = true;
    } catch {
      srcExists = false;
    }
    if (!srcExists) {
      await fs.unlink(dst).catch(() => undefined);
      continue;
    }

    // Fast path: destination exists and hashes match source → skip copy.
    try {
      const [srcHash, dstHash] = await Promise.all([
        sha256OfFile(src),
        sha256OfFile(dst),
      ]);
      if (srcHash === dstHash) continue;
    } catch {
      // Destination missing or unreadable; fall through to copy
    }

    await fs.copyFile(src, dst);
    // Explicit mode — fs.copyFile's mode preservation varies by Node.
    // Bundle files are user data, read by launchd; 0o644 is appropriate.
    await fs.chmod(dst, 0o644);
  }

  return dest;
}

/**
 * Remove the staged bundle directory for a deployed routine. Idempotent:
 * no error when the directory is already absent. Called from adapter
 * undeploy() after uninstallPlist so stale bundles don't accumulate.
 */
export async function removeStagedBundle(
  runtime: Runtime,
  slug: string,
): Promise<void> {
  const dest = stagedBundlePath(runtime, slug);
  await fs.rm(dest, { recursive: true, force: true });
}
