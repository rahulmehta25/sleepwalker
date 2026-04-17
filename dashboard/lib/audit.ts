import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function auditFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "audit.jsonl");
}

export interface AuditEntry {
  ts: string;
  fleet: string;
  tool?: string;
  input?: Record<string, unknown>;
  output_preview?: string;
  output_length?: number;
  event?: string;
  total?: number;
  budget?: number;
}

export function readAudit(limit = 200): AuditEntry[] {
  const f = auditFile();
  if (!fs.existsSync(f)) return [];
  const raw = fs.readFileSync(f, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const tail = lines.slice(-limit);
  return tail
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is AuditEntry => x !== null)
    .reverse();
}
