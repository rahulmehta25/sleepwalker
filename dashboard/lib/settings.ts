import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

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
function cloudCredsFile(): string {
  return path.join(home(), ".sleepwalker", "cloud-credentials.json");
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

const PolicySchema = z.enum(["strict", "balanced", "yolo"]);

export const SettingsSchema = z.object({
  sleep_window: z.object({
    start_hour: z.number().int().min(0).max(23),
    end_hour: z.number().int().min(0).max(23),
  }).optional(),
  policies: z.record(z.string(), PolicySchema).optional(),
  budgets: z.record(z.string(), z.number().positive()).optional(),
  enabled_routines: z.array(z.string()).optional(),
  tracked_repos: z.array(z.string()).optional(),
});

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

// ----------------------------------------------------------------------------
// Cloud routine credentials (per-routine API trigger url + bearer token)
// ----------------------------------------------------------------------------

export interface CloudCredential {
  /** Full /fire endpoint URL from claude.ai/code/routines */
  url: string;
  /** Bearer token (sk-ant-oat01-...) — shown once, store securely */
  token: string;
  /** ISO timestamp when configured */
  configuredAt: string;
}

type CloudCredsMap = Record<string, CloudCredential>;

function readAllCloudCreds(): CloudCredsMap {
  const f = cloudCredsFile();
  if (!fs.existsSync(f)) return {};
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function writeAllCloudCreds(creds: CloudCredsMap): void {
  const f = cloudCredsFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(creds, null, 2));
  fs.chmodSync(f, 0o600);
}

export function getCloudCredential(routineId: string): CloudCredential | null {
  const all = readAllCloudCreds();
  return all[routineId] ?? null;
}

/** Whether a routine has API-trigger credentials configured. */
export function hasCloudCredential(routineId: string): boolean {
  return getCloudCredential(routineId) !== null;
}

export function setCloudCredential(routineId: string, url: string, token: string): void {
  const all = readAllCloudCreds();
  all[routineId] = { url, token, configuredAt: new Date().toISOString() };
  writeAllCloudCreds(all);
}

export function clearCloudCredential(routineId: string): void {
  const all = readAllCloudCreds();
  if (all[routineId]) {
    delete all[routineId];
    writeAllCloudCreds(all);
  }
}

/**
 * Public-safe view: never expose tokens, only configured/not + URL host + timestamp.
 */
export function getCloudCredentialPublic(routineId: string): { configured: boolean; host?: string; configuredAt?: string } {
  const c = getCloudCredential(routineId);
  if (!c) return { configured: false };
  let host = "";
  try { host = new URL(c.url).host; } catch { host = "(invalid url)"; }
  return { configured: true, host, configuredAt: c.configuredAt };
}

/**
 * Returns whether GitHub is configured (token present + at least one tracked repo).
 */
export function hasGithubConfig(): boolean {
  return Boolean(readGithubToken()) && readSettings().tracked_repos.length > 0;
}
