import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function queueFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "queue.jsonl");
}

export type Reversibility = "green" | "yellow" | "red";
export type QueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "complete"
  | "failed";
export type QueueSource = "local" | "cloud" | "codex" | "gemini";

export interface QueueEntry {
  id: string;
  ts: string;
  fleet: string;
  tool?: string;
  args?: Record<string, unknown>;
  kind?: string;
  payload?: Record<string, unknown>;
  reversibility?: Reversibility;
  session?: string;
  status: QueueStatus;
  source?: QueueSource;
}

function ensureFile(): string {
  const f = queueFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, "");
  return f;
}

function queueLockFile(f: string): string {
  const lockPath = `${f}.lock`;
  if (!fs.existsSync(lockPath)) fs.writeFileSync(lockPath, "");
  return lockPath;
}

function runQueueWorker(env: Record<string, string>): string {
  const script = String.raw`
const fs = require("fs");
const f = process.env.SLEEPWALKER_QUEUE_FILE;
const op = process.env.SLEEPWALKER_QUEUE_OP;
if (!f || !op) process.exit(2);
function parseLines(raw) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}
if (op === "append") {
  const entry = process.env.SLEEPWALKER_QUEUE_ENTRY;
  if (!entry) process.exit(2);
  fs.appendFileSync(f, entry + "\n");
  process.stdout.write("true");
} else if (op === "update") {
  const id = process.env.SLEEPWALKER_QUEUE_ID;
  const status = process.env.SLEEPWALKER_QUEUE_STATUS;
  if (!id || !status) process.exit(2);
  const entries = parseLines(fs.readFileSync(f, "utf8"));
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) {
    process.stdout.write("false");
  } else {
    entries[idx].status = status;
    fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    process.stdout.write("true");
  }
} else {
  process.exit(2);
}
`;
  const f = ensureFile();
  return execFileSync(
    "flock",
    ["-x", queueLockFile(f), process.execPath, "-e", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SLEEPWALKER_QUEUE_FILE: f,
        ...env,
      },
    },
  ).trim();
}

function parseLines(raw: string): QueueEntry[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as QueueEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is QueueEntry => x !== null);
}

export function readLocalQueue(): QueueEntry[] {
  const f = ensureFile();
  return parseLines(fs.readFileSync(f, "utf8")).map((e) => ({
    ...e,
    source: "local" as const,
  }));
}

export function appendQueueEntry(entry: QueueEntry): void {
  ensureFile();
  runQueueWorker({
    SLEEPWALKER_QUEUE_OP: "append",
    SLEEPWALKER_QUEUE_ENTRY: JSON.stringify(entry),
  });
}

export function updateLocalStatus(id: string, status: QueueStatus): boolean {
  ensureFile();
  return runQueueWorker({
    SLEEPWALKER_QUEUE_OP: "update",
    SLEEPWALKER_QUEUE_ID: id,
    SLEEPWALKER_QUEUE_STATUS: status,
  }) === "true";
}

export function pendingCount(entries: QueueEntry[]): number {
  return entries.filter((e) => e.status === "pending").length;
}
