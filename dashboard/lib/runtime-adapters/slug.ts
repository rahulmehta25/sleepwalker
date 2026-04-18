// dashboard/lib/runtime-adapters/slug.ts
//
// Single source of truth for the <runtime>/<slug> namespacing convention.
// Every downstream consumer constructs identifiers via these builders —
// string concatenation at call sites is a bug.
//
// CRITICAL: The Runtime values in RUNTIMES below are duplicated in
// bin/sleepwalker-run-cli (Phase 2+). Changes to the tuple must update both.
//
// validateSlug() is for AUTHORING (new slugs from the editor).
// It is NOT a loader validator — the unified bundle reader (Phase 2/3)
// must NOT re-validate existing v0.1 directory names (e.g. `_test-zen`).

import os from "node:os";
import path from "node:path";
import type { Runtime } from "./types";

/** Authorized runtimes for v0.2. Amp + Devin deferred to v0.3. */
export const RUNTIMES: readonly Runtime[] = [
  "claude-routines",
  "claude-desktop",
  "codex",
  "gemini",
] as const;

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

/** Predicate: is `s` a valid NEW routine slug per ADPT-02? Never throws. */
export function validateSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}

/** Type guard: narrows `r` to `Runtime` if it is one of the four authorized values. */
export function isRuntime(r: string): r is Runtime {
  return (RUNTIMES as readonly string[]).includes(r);
}

/** Internal fleet key: `<runtime>/<slug>`. */
export function toFleetKey(runtime: Runtime, slug: string): string {
  return `${runtime}/${slug}`;
}

/** Parse a fleet key. Returns null for bad runtime, bad slug, or missing slash. */
export function parseFleetKey(
  key: string,
): { runtime: Runtime; slug: string } | null {
  const slashIdx = key.indexOf("/");
  if (slashIdx <= 0) return null;
  const runtime = key.slice(0, slashIdx);
  const slug = key.slice(slashIdx + 1);
  if (!isRuntime(runtime)) return null;
  if (!validateSlug(slug)) return null;
  return { runtime, slug };
}

/** Launchd label: `com.sleepwalker.<runtime>.<slug>`. */
export function toLaunchdLabel(runtime: Runtime, slug: string): string {
  return `com.sleepwalker.${runtime}.${slug}`;
}

/** Marker tag embedded in prompts: `[sleepwalker:<runtime>/<slug>]`. */
export function toMarkerTag(runtime: Runtime, slug: string): string {
  return `[sleepwalker:${runtime}/${slug}]`;
}

/** Cloud branch prefix: `claude/sleepwalker/<runtime>/<slug>/` (trailing slash, no glob). */
export function toBranchPrefix(runtime: Runtime, slug: string): string {
  return `claude/sleepwalker/${runtime}/${slug}/`;
}

/** Absolute plist path: `$HOME/Library/LaunchAgents/<label>.plist`. */
export function toPlistPath(runtime: Runtime, slug: string): string {
  const home = process.env.HOME || os.homedir();
  return path.join(
    home,
    "Library",
    "LaunchAgents",
    `${toLaunchdLabel(runtime, slug)}.plist`,
  );
}

/** On-disk bundle directory. Preserves v0.1 paths for Claude runtimes. */
export function toBundleDir(runtime: Runtime, slug: string): string {
  const dirName =
    runtime === "claude-desktop"
      ? "routines-local"
      : runtime === "claude-routines"
        ? "routines-cloud"
        : `routines-${runtime}`;
  return path.join(dirName, slug);
}
