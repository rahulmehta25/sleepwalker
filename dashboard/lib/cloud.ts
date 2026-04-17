import fs from "node:fs";
import path from "node:path";

function cloudDir(): string {
  return path.resolve(process.cwd(), "..", "routines-cloud");
}

export interface CloudTrigger {
  type: "schedule" | "github" | "api";
  cron?: string;
  description?: string;
  event?: string;
  filters?: Record<string, unknown>;
}

export interface CloudRoutineConfig {
  name: string;
  tier: "C";
  triggers: CloudTrigger[];
  repos: "all-tracked" | "two-required" | string[];
  connectors: string[];
  env_vars: string[];
  recommended_schedule: string | null;
  branch_policy: string | null;
  approx_runs_per_week: number;
}

export interface CloudRoutine extends CloudRoutineConfig {
  id: string;
  prompt: string;
  setup: string;
  scheduleDeeplink: string;
}

function buildScheduleDeeplink(name: string): string {
  const params = new URLSearchParams({ name });
  return `https://claude.ai/code/routines?new=true&${params.toString()}`;
}

export function listCloudRoutines(): CloudRoutine[] {
  const dir = cloudDir();
  if (!fs.existsSync(dir)) return [];
  const dirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const routines: CloudRoutine[] = [];
  for (const id of dirs) {
    const configPath = path.join(dir, id, "config.json");
    const promptPath = path.join(dir, id, "prompt.md");
    const setupPath = path.join(dir, id, "setup.md");
    if (!fs.existsSync(configPath) || !fs.existsSync(promptPath)) continue;

    try {
      const config: CloudRoutineConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      routines.push({
        ...config,
        id,
        prompt: fs.readFileSync(promptPath, "utf8"),
        setup: fs.existsSync(setupPath) ? fs.readFileSync(setupPath, "utf8") : "",
        scheduleDeeplink: buildScheduleDeeplink(config.name),
      });
    } catch {
      // skip malformed routine
    }
  }

  return routines.sort((a, b) => a.name.localeCompare(b.name));
}

export function getCloudRoutine(id: string): CloudRoutine | null {
  return listCloudRoutines().find((r) => r.id === id) ?? null;
}
