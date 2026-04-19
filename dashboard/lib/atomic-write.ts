// dashboard/lib/atomic-write.ts
// Authoritative source: .planning/phases/03-editor/03-RESEARCH.md §Example 2 (lines 1057-1115).
//
// Directory-swap atomic write: writes all files into a sibling tmp dir, then
// fs.renameSync moves it into place (POSIX-atomic on same filesystem).
//
// Key invariants:
//   - tmp dir is a SIBLING of finalDir — guarantees same filesystem, no EXDEV.
//   - collision check is pre-flight — no tmp dir is created if finalDir already exists.
//   - any mid-write failure → tmp dir rm-rf'd (best-effort) before returning error.
//   - EEXIST / ENOTEMPTY during rename (APFS Pitfall #6) → errorCode:"collision".

import fs from "node:fs";
import path from "node:path";

export interface AtomicWriteResult {
  ok: boolean;
  path?: string;
  error?: string;
  errorCode?: "collision" | "io" | "permission";
}

/**
 * Atomically write a set of files into `finalDir`. Either every file is
 * present at `finalDir` on success, or `finalDir` does not exist at all on
 * failure. Never produces a partially-populated bundle directory.
 *
 * Strategy: mkdtemp a sibling of finalDir → writeFileSync each entry into
 * it → renameSync(tmpDir, finalDir). Sibling placement guarantees the
 * rename is same-filesystem (no EXDEV).
 */
export function atomicWriteBundle(
  finalDir: string,
  files: Record<string, string>,
): AtomicWriteResult {
  const parent = path.dirname(finalDir);
  const base = path.basename(finalDir);

  // Pre-flight: collision check — do NOT create tmp dir if target exists.
  if (fs.existsSync(finalDir)) {
    return {
      ok: false,
      error: `${finalDir} already exists`,
      errorCode: "collision",
    };
  }

  try {
    fs.mkdirSync(parent, { recursive: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const code: AtomicWriteResult["errorCode"] =
      err.code === "EACCES" || err.code === "EPERM" ? "permission" : "io";
    return { ok: false, error: err.message, errorCode: code };
  }

  let tmpDir: string;
  try {
    tmpDir = fs.mkdtempSync(path.join(parent, `.${base}.tmp-`));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const code: AtomicWriteResult["errorCode"] =
      err.code === "EACCES" || err.code === "EPERM" ? "permission" : "io";
    return { ok: false, error: err.message, errorCode: code };
  }

  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content, { encoding: "utf8" });
    }
    fs.renameSync(tmpDir, finalDir);
    return { ok: true, path: finalDir };
  } catch (e) {
    // Best-effort cleanup; never throw from cleanup itself.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
    const err = e as NodeJS.ErrnoException;
    const code: AtomicWriteResult["errorCode"] =
      err.code === "EEXIST" || err.code === "ENOTEMPTY" ? "collision" : "io";
    return { ok: false, error: err.message, errorCode: code };
  }
}
