import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings, writeSettings, type Policy } from "./settings";
import { listBundles, RUNTIME_ROOT } from "./bundles";
import { computeStatus, readDeployState, type DeployState, type RoutineStatus } from "./deploy-state";
import type { Runtime } from "./runtime-adapters/types";

function scheduledTasksDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".claude", "scheduled-tasks");
}
function repoLocalDir(): string {
  return path.resolve(process.cwd(), "..", "routines-local");
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  installed: boolean;
  defaultCron: string;
  defaultPolicy: Policy;
  defaultBudget: number;
  source: "installed" | "repo-template";
}

/**
 * ListedRoutine is the Phase 4 widened shape returned by `listRoutinesAsync()`.
 * v0.1 `listRoutines()` returns Routine[] (claude-desktop local only) and is
 * preserved byte-compatible for existing callers (settings/page.tsx,
 * api/routines/route.ts). The async variant composes v0.1 local routines with
 * v0.2 codex/gemini/claude-routines bundles enumerated via listBundles() and
 * attaches drift-aware RoutineStatus via computeStatus().
 *
 * Consumers:
 *   - dashboard/app/routines/page.tsx (the /routines server component)
 *   - dashboard/tests/routines-page.test.ts (VALIDATION row 11)
 */
export interface ListedRoutine {
  id: string;
  fleet: string;
  runtime: Runtime;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  installed: boolean;
  defaultCron: string;
  defaultPolicy: Policy;
  defaultBudget: number;
  source: "installed" | "repo-template" | "bundle";
  status: RoutineStatus;
  deployState: DeployState | null;
  bundleDir: string;
}

const STARTER_DEFAULTS: Record<string, { cron: string; policy: Policy; budget: number }> = {
  "sleepwalker-inbox-triage":          { cron: "0 5 * * 1-5",  policy: "balanced", budget: 50000 },
  "sleepwalker-downloads-organizer":   { cron: "0 2 * * *",    policy: "balanced", budget: 50000 },
  "sleepwalker-calendar-prep":         { cron: "30 6 * * 1-5", policy: "balanced", budget: 30000 },
  "sleepwalker-standup-writer":        { cron: "30 8 * * 1-5", policy: "balanced", budget: 20000 },
  "sleepwalker-screenshot-reviewer":   { cron: "30 1 * * *",   policy: "balanced", budget: 50000 },
  "sleepwalker-disk-cleanup":          { cron: "0 3 * * 0",    policy: "strict",   budget: 30000 },
};

function readSkill(dirPath: string): { name: string; description: string } | null {
  const skillPath = path.join(dirPath, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;
  const content = fs.readFileSync(skillPath, "utf8");
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(dirPath),
    description: descMatch ? descMatch[1].trim() : "",
  };
}

export function listRoutines(): Routine[] {
  const settings = readSettings();
  const enabled = new Set(settings.enabled_routines);
  const routines = new Map<string, Routine>();

  // 1. Repo templates (always shown so users see all available routines)
  const repoDir = repoLocalDir();
  if (fs.existsSync(repoDir)) {
    for (const dir of fs.readdirSync(repoDir)) {
      if (!dir.startsWith("sleepwalker-")) continue;
      const skill = readSkill(path.join(repoDir, dir));
      if (!skill) continue;
      const defaults = STARTER_DEFAULTS[dir] ?? { cron: "0 9 * * *", policy: "balanced" as Policy, budget: 50000 };
      routines.set(dir, {
        id: dir,
        name: skill.name,
        description: skill.description,
        enabled: enabled.has(dir),
        installed: false,
        defaultCron: defaults.cron,
        defaultPolicy: defaults.policy,
        defaultBudget: defaults.budget,
        source: "repo-template",
      });
    }
  }

  // 2. Mark installed if present in ~/.claude/scheduled-tasks/
  const installedDir = scheduledTasksDir();
  if (fs.existsSync(installedDir)) {
    for (const dir of fs.readdirSync(installedDir)) {
      if (!dir.startsWith("sleepwalker-")) continue;
      if (routines.has(dir)) {
        routines.get(dir)!.installed = true;
        routines.get(dir)!.source = "installed";
      } else {
        const skill = readSkill(path.join(installedDir, dir));
        if (!skill) continue;
        const defaults = STARTER_DEFAULTS[dir] ?? { cron: "0 9 * * *", policy: "balanced" as Policy, budget: 50000 };
        routines.set(dir, {
          id: dir,
          name: skill.name,
          description: skill.description,
          enabled: enabled.has(dir),
          installed: true,
          defaultCron: defaults.cron,
          defaultPolicy: defaults.policy,
          defaultBudget: defaults.budget,
          source: "installed",
        });
      }
    }
  }

  return [...routines.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function setEnabled(id: string, enabled: boolean): void {
  const s = readSettings();
  const set = new Set(s.enabled_routines);
  if (enabled) set.add(id);
  else set.delete(id);
  writeSettings({ enabled_routines: [...set] });
}

/**
 * Parse per-bundle enabled flag from config.json (codex/gemini) or
 * routines.json archived_fleets list (claude-routines) or settings.json
 * enabled_routines (claude-desktop). Returns true when the routine is
 * currently enabled for scheduled firing.
 */
function readBundleEnabled(runtime: Runtime, bundleDir: string): boolean {
  if (runtime === "codex" || runtime === "gemini") {
    try {
      const cfgPath = path.join(bundleDir, "config.json");
      if (!fs.existsSync(cfgPath)) return false;
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { enabled?: boolean };
      return cfg.enabled !== false;
    } catch {
      return false;
    }
  }

  if (runtime === "claude-routines") {
    // Archived fleets file ~/.sleepwalker/routines.json — presence in the
    // array means DISABLED (inverse semantics, matching routines/actions.ts).
    try {
      const p = path.join(process.env.HOME || os.homedir(), ".sleepwalker", "routines.json");
      if (!fs.existsSync(p)) return true;
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { archived_fleets?: unknown };
      const archived = Array.isArray(parsed.archived_fleets)
        ? (parsed.archived_fleets as unknown[]).filter((s): s is string => typeof s === "string")
        : [];
      const bundleSlug = path.basename(bundleDir);
      return !archived.includes(`claude-routines/${bundleSlug}`);
    } catch {
      return true;
    }
  }

  // claude-desktop: delegates to v0.1 settings.enabled_routines convention.
  const settings = readSettings();
  const slug = path.basename(bundleDir);
  // v0.1 local routines carry "sleepwalker-" prefix; codex/gemini bundles do not.
  const legacyId = slug.startsWith("sleepwalker-") ? slug : `sleepwalker-${slug}`;
  return settings.enabled_routines.includes(legacyId) || settings.enabled_routines.includes(slug);
}

/**
 * Parse per-bundle cron from config.json (codex/gemini) or SKILL.md
 * frontmatter (claude-routines/claude-desktop). Returns "0 9 * * *" when
 * no schedule is declared — matches the v0.1 STARTER_DEFAULTS fallback.
 */
function readBundleCron(runtime: Runtime, bundleDir: string): string {
  const fallback = "0 9 * * *";
  try {
    if (runtime === "codex" || runtime === "gemini") {
      const cfgPath = path.join(bundleDir, "config.json");
      if (!fs.existsSync(cfgPath)) return fallback;
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { schedule?: string };
      return typeof cfg.schedule === "string" ? cfg.schedule : fallback;
    }
    const skillPath = path.join(bundleDir, "SKILL.md");
    if (!fs.existsSync(skillPath)) return fallback;
    const content = fs.readFileSync(skillPath, "utf8");
    const m = content.match(/^schedule:\s*["']?([^"'\n]+)["']?\s*$/m);
    return m ? m[1].trim() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Async variant of listRoutines() that widens the return to all 4 runtimes and
 * attaches drift-aware status per bundle. v0.1 local routines are preserved
 * verbatim (with status="draft" — v0.1 never deployed through the state
 * machine, so no deploy-state file exists). v0.2 codex/gemini/claude-routines
 * bundles come from listBundles() + computeStatus().
 *
 * Callers: dashboard/app/routines/page.tsx (server component) +
 * dashboard/tests/routines-page.test.ts. The sync listRoutines() remains the
 * canonical v0.1 API for settings + api/routines consumers.
 */
export async function listRoutinesAsync(): Promise<ListedRoutine[]> {
  const out: ListedRoutine[] = [];

  // 1. v0.1 local routines — preserve existing listRoutines() output verbatim.
  // claude-desktop carries source="installed"|"repo-template" and the
  // sleepwalker- id prefix. status defaults to "draft" because v0.1 never
  // wrote deploy-state files; Phase 4 routines that redeploy through the new
  // state machine will overwrite this below.
  const v1 = listRoutines();
  for (const r of v1) {
    const bundleDir = path.join(RUNTIME_ROOT["claude-desktop"], r.id);
    const deployState = await readDeployState("claude-desktop", r.id).catch(() => null);
    let status: RoutineStatus = "draft";
    try {
      if (fs.existsSync(bundleDir)) {
        status = await computeStatus({
          runtime: "claude-desktop",
          slug: r.id,
          bundleDir,
          enabled: r.enabled,
        });
      }
    } catch {
      status = "draft";
    }
    out.push({
      id: r.id,
      fleet: `claude-desktop/${r.id}`,
      runtime: "claude-desktop",
      slug: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      installed: r.installed,
      defaultCron: r.defaultCron,
      defaultPolicy: r.defaultPolicy,
      defaultBudget: r.defaultBudget,
      source: r.source,
      status,
      deployState,
      bundleDir,
    });
  }

  // 2. v0.2 codex + gemini + claude-routines bundles enumerated via
  // listBundles(). Each gets a computeStatus() lookup + readDeployState()
  // read. claude-desktop bundles are skipped here — already covered by v1.
  const seenClaudeDesktop = new Set(v1.map((r) => r.id));
  for (const bundle of listBundles()) {
    if (bundle.runtime === "claude-desktop") {
      // Already covered by the v0.1 listing above. Skip to avoid dupes.
      if (seenClaudeDesktop.has(bundle.slug)) continue;
      // A claude-desktop bundle authored via /editor but not marked installed
      // is a new routine — surface it.
    }

    const enabled = readBundleEnabled(bundle.runtime, bundle.bundleDir);
    const defaultCron = readBundleCron(bundle.runtime, bundle.bundleDir);
    const deployState = await readDeployState(bundle.runtime, bundle.slug).catch(() => null);
    let status: RoutineStatus = "draft";
    try {
      status = await computeStatus({
        runtime: bundle.runtime,
        slug: bundle.slug,
        bundleDir: bundle.bundleDir,
        enabled,
      });
    } catch {
      status = "draft";
    }

    out.push({
      id: `${bundle.runtime}/${bundle.slug}`,
      fleet: `${bundle.runtime}/${bundle.slug}`,
      runtime: bundle.runtime,
      slug: bundle.slug,
      name: bundle.slug,
      description: "",
      enabled,
      installed: true,
      defaultCron,
      defaultPolicy: "balanced",
      defaultBudget: 50000,
      source: "bundle",
      status,
      deployState,
      bundleDir: bundle.bundleDir,
    });
  }

  return out;
}
