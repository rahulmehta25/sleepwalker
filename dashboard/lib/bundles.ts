// dashboard/lib/bundles.ts
//
// Read-side directory enumeration for all 4 runtime roots.
// Write path lives in dashboard/lib/atomic-write.ts + app/editor/actions.ts.
//
// Per Phase 2 CONTEXT.md §v0.1 Bundle Reading (lines 59-91):
//   - Uses fs.readdirSync on each root; does NOT use toBundleDir as a reader.
//   - Does NOT call validateSlug on enumerated entries. v0.1 directory names
//     are trusted as-authored ("sleepwalker-inbox-triage", "_test-zen" etc.).
//
// Consumers:
//   - Plan 03-05 saveRoutine Server Action — hasBundle + hasBundleAnyRuntime
//     for cross-runtime slug collision checks before committing a new bundle.
//   - Phase 4 routine cards list — listBundles() for all-fleet enumeration.
//   - Phase 5 queue cross-reference — readBundle() to resolve QueueEntry.slug.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Runtime, Reversibility } from "./runtime-adapters/types";
import { RUNTIMES } from "./runtime-adapters/slug";

// Directory names relative to the repo root, used for bundleDir return values.
const RUNTIME_DIR: Record<Runtime, string> = {
  "claude-routines": "routines-cloud",
  "claude-desktop": "routines-local",
  codex: "routines-codex",
  gemini: "routines-gemini",
};

// In production Next.js runs with CWD = dashboard/; routine dirs live one level
// up. Tests override via SLEEPWALKER_REPO_ROOT (matches save-to-repo.ts pattern).
// Otherwise: if CWD is the dashboard/ subdir, go up one level to the repo root.
function getRepoRoot(): string {
  if (process.env.SLEEPWALKER_REPO_ROOT) return process.env.SLEEPWALKER_REPO_ROOT;
  const cwd = process.cwd();
  return path.basename(cwd) === "dashboard" ? path.resolve(cwd, "..") : cwd;
}

// Lazily evaluated via Proxy so tests can override CWD with process.chdir().
export const RUNTIME_ROOT: Record<Runtime, string> = new Proxy(
  {} as Record<Runtime, string>,
  {
    get(_: Record<Runtime, string>, prop: string) {
      const dirName = RUNTIME_DIR[prop as Runtime];
      if (!dirName) return undefined;
      return path.join(getRepoRoot(), dirName);
    },
  },
);

export interface BundleDescriptor {
  runtime: Runtime;
  slug: string;
  /** Relative path from cwd, e.g. "routines-codex/morning-brief". */
  bundleDir: string;
}

/**
 * Parsed bundle shape returned by readBundle(). Distinct from the write-side
 * RoutineBundleInput (bundle-schema.ts) and from the adapter-contract
 * RoutineBundle (runtime-adapters/types.ts) — optional fields here reflect
 * tolerant parsing of on-disk bundles that may predate the full schema.
 */
export interface RoutineBundleRead {
  runtime: Runtime;
  slug: string;
  name: string;
  prompt: string;
  schedule?: string;
  reversibility?: Reversibility;
  budget?: number;
  /** Relative path from cwd, e.g. "routines-codex/morning-brief". */
  bundleDir: string;
}

/**
 * Enumerate bundles on disk. When `runtime` is provided, only that runtime
 * root is scanned; otherwise all 4 runtime roots are scanned.
 * Roots that don't exist are silently skipped. Non-directory entries
 * (e.g. .DS_Store) are filtered out.
 */
export function listBundles(runtime?: Runtime): BundleDescriptor[] {
  const runtimes = runtime ? [runtime] : RUNTIMES;
  const out: BundleDescriptor[] = [];
  for (const rt of runtimes) {
    const root = RUNTIME_ROOT[rt];
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const abs = path.join(root, entry);
      let isDir: boolean;
      try {
        isDir = fs.statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      out.push({ runtime: rt, slug: entry, bundleDir: `${RUNTIME_DIR[rt]}/${entry}` });
    }
  }
  return out;
}

/**
 * Returns true iff routines-<dir>/<slug>/ exists on disk.
 * Does NOT use toBundleDir (which throws on invalid slugs via assertValidSlug).
 * Plan 03-05 checkSlugAvailability relies on this tolerance: a user typing
 * an invalid slug should see an async "slug invalid" message from the schema,
 * not an exception from this lookup.
 */
export function hasBundle(runtime: Runtime, slug: string): boolean {
  const root = RUNTIME_ROOT[runtime];
  return fs.existsSync(path.join(root, slug));
}

/**
 * Returns the first runtime (in RUNTIMES tuple order) where slug exists, else null.
 * Used by Plan 03-05 saveRoutine to detect cross-runtime collisions before
 * committing a new bundle — the namespaced `<runtime>/<slug>` key must be
 * unique across the entire fleet so launchd labels, marker tags, and branch
 * prefixes stay unambiguous.
 */
export function hasBundleAnyRuntime(slug: string): Runtime | null {
  for (const runtime of RUNTIMES) {
    if (hasBundle(runtime, slug)) return runtime;
  }
  return null;
}

/**
 * Parse a bundle into RoutineBundleRead. Returns null for missing dir,
 * missing source file, or malformed content. Never throws.
 *
 *   - claude-desktop / claude-routines: reads SKILL.md, parses YAML
 *     frontmatter via gray-matter, body becomes prompt.
 *   - codex / gemini: reads config.json for metadata and prompt.md for body
 *     (falls back to cfg.prompt if prompt.md is absent).
 */
export function readBundle(
  runtime: Runtime,
  slug: string,
): RoutineBundleRead | null {
  const root = RUNTIME_ROOT[runtime];
  const dir = path.join(root, slug);
  if (!fs.existsSync(dir)) return null;

  if (runtime === "claude-desktop") {
    // Desktop bundles are always SKILL.md (written by launchd-writer.ts).
    const skillPath = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillPath)) return null;
    try {
      const { data, content } = matter(fs.readFileSync(skillPath, "utf8"));
      return {
        runtime,
        slug,
        name: typeof data.name === "string" ? data.name : slug,
        prompt: content.trim(),
        schedule: typeof data.schedule === "string" ? data.schedule : undefined,
        reversibility: isReversibility(data.reversibility)
          ? data.reversibility
          : undefined,
        budget: typeof data.budget === "number" ? data.budget : undefined,
        bundleDir: `${RUNTIME_DIR[runtime]}/${slug}`,
      };
    } catch {
      return null;
    }
  }

  if (runtime === "claude-routines") {
    // Cloud bundles may be SKILL.md (v0.1 hand-authored) or config.json (v0.2
    // editor-written). Try SKILL.md first; fall through to config.json path below.
    const skillPath = path.join(dir, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      try {
        const { data, content } = matter(fs.readFileSync(skillPath, "utf8"));
        return {
          runtime,
          slug,
          name: typeof data.name === "string" ? data.name : slug,
          prompt: content.trim(),
          schedule: typeof data.schedule === "string" ? data.schedule : undefined,
          reversibility: isReversibility(data.reversibility)
            ? data.reversibility
            : undefined,
          budget: typeof data.budget === "number" ? data.budget : undefined,
          bundleDir: `${RUNTIME_DIR[runtime]}/${slug}`,
        };
      } catch {
        return null;
      }
    }
    // Fall through to config.json branch below.
  }

  // v0.2 shape (codex / gemini / claude-routines config.json): config.json + prompt.md.
  const cfgPath = path.join(dir, "config.json");
  const promptPath = path.join(dir, "prompt.md");
  if (!fs.existsSync(cfgPath)) return null;
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  } catch {
    return null;
  }
  const prompt = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf8")
    : typeof cfg.prompt === "string"
      ? cfg.prompt
      : "";
  return {
    runtime,
    slug,
    name: typeof cfg.name === "string" ? cfg.name : slug,
    prompt,
    schedule: typeof cfg.schedule === "string" ? cfg.schedule : undefined,
    reversibility: isReversibility(cfg.reversibility)
      ? cfg.reversibility
      : undefined,
    budget: typeof cfg.budget === "number" ? cfg.budget : undefined,
    bundleDir: `${RUNTIME_DIR[runtime]}/${slug}`,
  };
}

function isReversibility(v: unknown): v is Reversibility {
  return v === "green" || v === "yellow" || v === "red";
}
