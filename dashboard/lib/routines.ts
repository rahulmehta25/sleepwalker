import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings, writeSettings, type Policy } from "./settings";

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
