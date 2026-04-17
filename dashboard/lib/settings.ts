import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function home(): string {
  return process.env.HOME || os.homedir();
}
function settingsFile(): string {
  return path.join(home(), ".sleepwalker", "settings.json");
}
function trackedFile(): string {
  return path.join(home(), ".sleepwalker", "tracked-projects.json");
}
function tokenFile(): string {
  return path.join(home(), ".sleepwalker", "github-token");
}

export type Policy = "strict" | "balanced" | "yolo";

export interface Settings {
  sleep_window: { start_hour: number; end_hour: number };
  policies: Record<string, Policy>;
  budgets: Record<string, number>;
  enabled_routines: string[];
  tracked_repos: string[];
}

const DEFAULT_SETTINGS: Settings = {
  sleep_window: { start_hour: 23, end_hour: 7 },
  policies: {
    "inbox-triage": "balanced",
    "downloads-organizer": "balanced",
    "calendar-prep": "balanced",
    "standup-writer": "balanced",
    "screenshot-reviewer": "balanced",
    "disk-cleanup": "strict",
  },
  budgets: {
    "inbox-triage": 50000,
    "downloads-organizer": 50000,
    "calendar-prep": 30000,
    "standup-writer": 20000,
    "screenshot-reviewer": 50000,
    "disk-cleanup": 30000,
  },
  enabled_routines: [],
  tracked_repos: [],
};

export function readSettings(): Settings {
  const f = settingsFile();
  if (!fs.existsSync(f)) return DEFAULT_SETTINGS;
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: Partial<Settings>): Settings {
  const merged = { ...readSettings(), ...s };
  const f = settingsFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(merged, null, 2));
  return merged;
}

export function readTrackedProjects(): string[] {
  const f = trackedFile();
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return [];
  }
}

export function writeTrackedProjects(list: string[]): void {
  const f = trackedFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list, null, 2));
}

export function readGithubToken(): string | null {
  const f = tokenFile();
  if (!fs.existsSync(f)) return null;
  try {
    return fs.readFileSync(f, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function writeGithubToken(token: string): void {
  const f = tokenFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, token);
  fs.chmodSync(f, 0o600);
}

export function clearGithubToken(): void {
  const f = tokenFile();
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

/**
 * Returns whether GitHub is configured (token present + at least one tracked repo).
 */
export function hasGithubConfig(): boolean {
  return Boolean(readGithubToken()) && readSettings().tracked_repos.length > 0;
}
