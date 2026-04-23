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

/**
 * Supervisor-emitted run lifecycle event. Shape is a superset of the v0.1
 * hook audit entry — same file, different writer (bin/sleepwalker-run-cli
 * for this variant, hooks/sleepwalker-audit-log.sh for the other). Fields
 * are drawn from the printf templates in the supervisor.
 */
export interface RunAuditEntry {
  ts: string;
  fleet: string;
  runtime: string;
  event: "started" | "completed" | "failed" | "budget_exceeded" | "deferred";
  cli?: string;
  budget?: number;
  chars_consumed?: number;
  chars_limit?: number;
  partial_output_bytes?: number;
  preview?: string;
  exit_code?: number;
  reason?: string;
  bundle?: string;
  hour?: number;
}

/**
 * Read supervisor-emitted run events for a single fleet (runtime/slug),
 * newest first, capped at `limit`. Malformed lines and hook-variant
 * entries without an `event` discriminator are skipped silently; a
 * corrupted audit line MUST NEVER break a dashboard page render.
 *
 * Reads the whole audit file (not a tail slice) so history queries cover
 * every run since the last rotation, not just the last 200 entries like
 * readAudit(). With 10MB rotation cap (~40k entries), whole-file read
 * stays bounded.
 */
export function readRunsByFleet(fleet: string, limit = 50): RunAuditEntry[] {
  const f = auditFile();
  if (!fs.existsSync(f)) return [];
  const raw = fs.readFileSync(f, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const matches: RunAuditEntry[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (
        obj.fleet === fleet &&
        typeof obj.event === "string" &&
        typeof obj.ts === "string" &&
        typeof obj.runtime === "string"
      ) {
        matches.push(obj as unknown as RunAuditEntry);
      }
    } catch {
      // Skip malformed lines — never break a render on corrupted audit
    }
  }
  return matches.slice(-limit).reverse();
}
