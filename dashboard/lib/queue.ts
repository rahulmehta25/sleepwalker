import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function queueFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "queue.jsonl");
}

export type Reversibility = "green" | "yellow" | "red";
export type QueueStatus = "pending" | "approved" | "rejected";
export type QueueSource = "local" | "cloud";

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
  const f = ensureFile();
  fs.appendFileSync(f, JSON.stringify(entry) + "\n");
}

export function updateLocalStatus(id: string, status: QueueStatus): boolean {
  const f = ensureFile();
  const entries = parseLines(fs.readFileSync(f, "utf8"));
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries[idx].status = status;
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return true;
}

export function pendingCount(entries: QueueEntry[]): number {
  return entries.filter((e) => e.status === "pending").length;
}
