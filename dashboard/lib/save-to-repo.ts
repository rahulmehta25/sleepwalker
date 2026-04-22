// dashboard/lib/save-to-repo.ts
// Authoritative source: .planning/phases/04-deploy/04-RESEARCH.md §Save-to-Repo
// Flow (lines 438-579) + §Common Pitfalls #3 and #7 (lines 1130-1171).
//
// REPO-01 chokepoint: every Save-to-repo Server Action composes the three
// exports below. The never-push and never-sweep invariants live here and are
// grep-verifiable at the module boundary.
//
// Key invariants:
//   - Stage ONLY via `git add ["--", "routines-<runtime>/<slug>/"]` — never
//     `git add -A`, never `git add .`. Any uncommitted file outside the
//     subpath stays untouched.
//   - simple-git's publish-to-remote API is never imported or invoked.
//     Callers commit locally; a future docs/AUTHORING.md documents the
//     manual upload-to-remote step users run from their own terminal.
//   - `proper-lockfile.lock(..., { retries: 0, stale: 30_000 })` is
//     non-blocking: a second concurrent preview fails immediately with
//     `kind: "lock-busy"` (Resolved Q2, 04-RESEARCH.md lines 851-870).
//   - `releaseSaveLock` uses `git rm --cached --ignore-unmatch` in addition to
//     `git reset` so newly-added (never-tracked) paths also unstage cleanly
//     (Pitfall #7, 04-RESEARCH.md lines 1165-1171).
//   - A LOCK_REGISTRY module-scope Map holds the `release` closure keyed by
//     an opaque 16-byte hex token between `previewSaveToRepo` and
//     `commitSaveToRepo`. Sleepwalker is single-process (localhost:4001) per
//     CLAUDE.md, so module-scope sharing across Server Actions is safe.
//
// Path convention:
//   ~/.sleepwalker/git.lock.sentinel — zero-byte sentinel file that
//   proper-lockfile locks against (it creates a sibling `.lock/` dir).
//
// Repo root resolution:
//   process.env.SLEEPWALKER_REPO_ROOT (test override) || path.resolve(process.cwd(), "..")
//   dashboard/ cwd → parent = repo root on the standard dev/prod surface.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { simpleGit, type SimpleGit } from "simple-git";
import * as lockfile from "proper-lockfile";
import { RUNTIME_ROOT } from "@/lib/bundles";
import type { Runtime } from "@/lib/runtime-adapters/types";

/**
 * Successful preview result. `lockToken` is the opaque handle the caller
 * passes back to `commitSaveToRepo` (or `releaseSaveLock` on cancel).
 */
export interface PreviewResult {
  ok: true;
  files: Array<{ path: string; added: number; removed: number }>;
  totals: { filesChanged: number; added: number; removed: number };
  suggestedMessage: string;
  lockToken: string;
}

/**
 * Discriminated failure union. `kind` lets UI pick the right user-facing
 * copy without string-matching the `error` field.
 */
export type SaveToRepoError =
  | { ok: false; kind: "lock-busy"; error: string }
  | { ok: false; kind: "no-changes"; error: string }
  | { ok: false; kind: "git-error"; error: string };

/** Successful commit result. shortSha is the first 7 chars of the full sha. */
export interface CommitResult {
  ok: true;
  sha: string;
  shortSha: string;
}

/** Directory for sentinel + lock dir. Resolves $HOME at call time. */
function sleepwalkerDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker");
}

/** Sentinel file path. proper-lockfile creates <sentinel>.lock/ beside it. */
function gitLockSentinel(): string {
  return path.join(sleepwalkerDir(), "git.lock.sentinel");
}

/**
 * Resolve the repo root. On the normal dev/prod surface, dashboard/ cwd →
 * parent = repo root. Tests override via SLEEPWALKER_REPO_ROOT so they can
 * point simple-git at a mkdtempSync repo without chdir'ing the process.
 */
function repoRoot(): string {
  return process.env.SLEEPWALKER_REPO_ROOT || path.resolve(process.cwd(), "..");
}

/**
 * Module-scope registry holding the lockfile release closure between the
 * preview and commit stages. Keys are 16-byte hex tokens returned to the
 * client; values are the release fn plus the (runtime, slug) pair so
 * releaseSaveLock can recompute the subpath for `git reset`/`git rm --cached`
 * without trusting client input.
 *
 * Per Pitfall #4 (04-RESEARCH.md lines 1139-1146): this pattern only works
 * in a single-process Next.js runtime. Sleepwalker is localhost:4001 per
 * CLAUDE.md so cluster mode is out of scope.
 */
const LOCK_REGISTRY = new Map<
  string,
  {
    release: () => Promise<void>;
    runtime: Runtime;
    slug: string;
    startedAt: number;
  }
>();

/**
 * Stage `routines-<runtime>/<slug>/`, compute the diff, and return a preview
 * to the caller. Holds the git.lock across the preview/commit window via
 * `proper-lockfile`.
 *
 * Never sweeps: the `git add ["--", subpath]` call stages ONLY files under
 * the subpath. Any unrelated uncommitted work elsewhere in the repo stays
 * unstaged (and untouched if untracked).
 *
 * Never pushes: this module does not import or call `git.push`.
 *
 * Failure modes:
 *   - lock-busy   : another preview is holding the lock (retries:0)
 *   - no-changes  : subpath is in sync with HEAD (lock released + cleaned up)
 *   - git-error   : any simple-git throw or IO failure
 */
export async function previewSaveToRepo(
  runtime: Runtime,
  slug: string,
): Promise<PreviewResult | SaveToRepoError> {
  // Ensure ~/.sleepwalker/ exists and the sentinel file exists (idempotent
  // touch). proper-lockfile needs a target to lock against; it creates a
  // sibling .lock/ directory as the actual mutex.
  try {
    await fs.promises.mkdir(sleepwalkerDir(), { recursive: true });
    await fs.promises.writeFile(gitLockSentinel(), "", { flag: "a" });
  } catch (e) {
    return {
      ok: false,
      kind: "git-error",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Acquire the flock. retries:0 = non-blocking; stale:30_000 = reclaimable
  // after 30s of no mtime refresh (proper-lockfile auto-refreshes while the
  // release closure is in scope, per Pitfall #3).
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(gitLockSentinel(), {
      retries: 0,
      stale: 30_000,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err && err.code === "ELOCKED") {
      return {
        ok: false,
        kind: "lock-busy",
        error: "Another save-to-repo is in progress. Wait a moment and try again.",
      };
    }
    return {
      ok: false,
      kind: "git-error",
      error: err?.message ?? String(e),
    };
  }

  try {
    const git: SimpleGit = simpleGit(repoRoot());
    const subpath = `${path.relative(repoRoot(), RUNTIME_ROOT[runtime])}/${slug}/`;

    // Explicit-path staging. The -- separator prevents path-vs-flag ambiguity
    // and the trailing slash scopes the add to that subtree only.
    await git.add(["--", subpath]);

    // git diff --cached --stat --numstat on the same subpath. simple-git's
    // diffSummary returns { files: [...], insertions, deletions }.
    const diff = await git.diffSummary(["--cached", "--", subpath]);

    if (diff.files.length === 0) {
      // Subpath is clean — unstage whatever we may have partially staged
      // (no-op if nothing staged) and release the lock so the next save
      // attempt can proceed.
      try {
        await git.raw(["reset", "HEAD", "--", subpath]);
      } catch {
        /* best-effort */
      }
      await release();
      return {
        ok: false,
        kind: "no-changes",
        error: "No changes to commit — bundle is in sync with HEAD.",
      };
    }

    // Verb inference: if any prior commit touched this subpath → "update";
    // first-ever commit → "add". Uses `git log --oneline -- <subpath>` with
    // a try/catch fallback to "add" if the log call fails for any reason
    // (e.g. a brand-new repo with no HEAD).
    let verb: "add" | "update" = "add";
    try {
      const log = await git.raw(["log", "--oneline", "--", subpath]);
      if (log.trim().length > 0) verb = "update";
    } catch {
      /* default to "add" */
    }

    const suggestedMessage = `feat(routines): ${verb} ${runtime}/${slug}`;
    const lockToken = crypto.randomBytes(16).toString("hex");
    LOCK_REGISTRY.set(lockToken, {
      release,
      runtime,
      slug,
      startedAt: Date.now(),
    });

    return {
      ok: true,
      files: diff.files.map((f) => ({
        path: f.file,
        added: "insertions" in f ? (f.insertions as number) : 0,
        removed: "deletions" in f ? (f.deletions as number) : 0,
      })),
      totals: {
        filesChanged: diff.files.length,
        added: diff.insertions,
        removed: diff.deletions,
      },
      suggestedMessage,
      lockToken,
    };
  } catch (e) {
    // Any simple-git / IO failure after the lock was acquired: release the
    // lock (best-effort — never throw from cleanup) and surface the error.
    await release().catch(() => {
      /* noop */
    });
    return {
      ok: false,
      kind: "git-error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Commit the staged subpath with the user-authored message. Looks up the
 * held lock by token, runs `git.commit(message)`, removes the registry
 * entry, and releases the flock.
 *
 * Never calls `git.push`.
 *
 * Failure modes:
 *   - Lock missing (token expired / unknown) → `{ ok: false, error: "Lock expired..." }`
 *   - simple-git commit throw → `{ ok: false, error: <message> }`
 */
export async function commitSaveToRepo(args: {
  lockToken: string;
  message: string;
}): Promise<CommitResult | { ok: false; error: string }> {
  const entry = LOCK_REGISTRY.get(args.lockToken);
  if (!entry) {
    return { ok: false, error: "Lock expired. Reopen Save to repo." };
  }
  try {
    const git = simpleGit(repoRoot());
    const commit = await git.commit(args.message);
    LOCK_REGISTRY.delete(args.lockToken);
    await entry.release();
    return {
      ok: true,
      sha: commit.commit,
      shortSha: commit.commit.slice(0, 7),
    };
  } catch (e) {
    // Do NOT release the lock here — the caller can retry commitSaveToRepo
    // with the same token (the lock is still held). If they want to bail,
    // they call releaseSaveLock explicitly.
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Idempotent: releases the flock and resets the staged subpath. Safe to
 * call multiple times with the same token (missing entry → `{ ok: true }`).
 *
 * Uses BOTH `git rm --cached --ignore-unmatch -r` AND `git reset HEAD --`
 * on the subpath:
 *   - `git rm --cached --ignore-unmatch` unstages newly-added (never-tracked)
 *     paths that `git reset` alone would leave in the index. (Pitfall #7)
 *   - `git reset HEAD --` handles the tracked-but-modified case.
 * Both run inside try/catch so a git failure during cleanup still releases
 * the flock and clears the registry entry.
 */
export async function releaseSaveLock(args: {
  lockToken: string;
}): Promise<{ ok: true }> {
  const entry = LOCK_REGISTRY.get(args.lockToken);
  if (!entry) return { ok: true };
  try {
    const git = simpleGit(repoRoot());
    const subpath = `${path.relative(repoRoot(), RUNTIME_ROOT[entry.runtime])}/${entry.slug}/`;
    // Pitfall #7: git rm --cached handles newly-added-but-never-tracked
    // paths. --ignore-unmatch makes it a no-op if nothing matches.
    try {
      await git.raw(["rm", "--cached", "--ignore-unmatch", "-r", "--", subpath]);
    } catch {
      /* best-effort */
    }
    // Complementary: handles the tracked-but-modified case.
    try {
      await git.raw(["reset", "HEAD", "--", subpath]);
    } catch {
      /* best-effort */
    }
  } catch {
    /* best-effort — never throw from cleanup */
  }
  LOCK_REGISTRY.delete(args.lockToken);
  await entry.release().catch(() => {
    /* noop */
  });
  return { ok: true };
}
