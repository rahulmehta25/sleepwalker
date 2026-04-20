import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLocalQueue, type QueueEntry, type QueueStatus, type QueueSource } from "./queue";
import { fetchCloudQueue, readCachedCloudQueue } from "./cloud-cache";

export interface AggregatedQueue {
  pending: QueueEntry[];
  recent: QueueEntry[];
  cloudFetchedAt: string | null;
  cloudError: string | null;
  localCount: number;
  cloudCount: number;
  /**
   * Count of codex + gemini supervisor-run entries merged in from
   * ~/.sleepwalker/audit.jsonl (within the 24h cutoff, terminal events only).
   * Additive field — v0.1 consumers that destructure {pending, recent,
   * cloudFetchedAt, cloudError, localCount, cloudCount} keep working.
   */
  supervisorCount: number;
}

function auditFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "audit.jsonl");
}

/**
 * Raw supervisor event written by bin/sleepwalker-run-cli::audit_emit.
 * Mirrors the Phase 2 contract at bin/sleepwalker-run-cli:69-82.
 * Only codex/gemini runs emit entries with `runtime` + `event`; v0.1 hook
 * audit entries (tool/input/output_preview shape) are filtered out at the
 * read boundary because they lack the `runtime` discriminator.
 */
interface SupervisorAuditEntry {
  ts: string;
  fleet: string;
  runtime: "codex" | "gemini";
  event: "started" | "completed" | "failed" | "budget_exceeded" | "deferred";
  chars_consumed?: number;
  chars_limit?: number;
  partial_output_bytes?: number;
  preview?: string;
  exit_code?: number;
  reason?: string;
  hour?: number;
  cli?: string;
  budget?: number;
}

const TERMINAL_EVENTS = new Set<SupervisorAuditEntry["event"]>([
  "completed",
  "failed",
  "budget_exceeded",
  "deferred",
]);

const SUPERVISOR_RUNTIMES = new Set<SupervisorAuditEntry["runtime"]>([
  "codex",
  "gemini",
]);

/**
 * Map a supervisor audit event to a QueueEntry. Mirrors the shape of
 * cloud-cache.ts::prToQueueEntry — deterministic id, eager source tag,
 * kind discriminator, payload carrying upstream fields verbatim.
 *
 * Status map (per CONTEXT.md locked decision):
 *   completed        -> complete
 *   failed           -> failed
 *   budget_exceeded  -> failed   (SIGTERM-on-budget is a failure mode)
 *   deferred         -> rejected (policy-blocked; terminal, not actionable)
 */
function supervisorRunToQueueEntry(e: SupervisorAuditEntry): QueueEntry {
  let status: QueueStatus;
  switch (e.event) {
    case "completed":
      status = "complete";
      break;
    case "failed":
    case "budget_exceeded":
      status = "failed";
      break;
    case "deferred":
      status = "rejected";
      break;
    default:
      // Unreachable when TERMINAL_EVENTS filter ran first; belt-and-suspenders.
      status = "failed";
  }

  // Deterministic id: runtime + fleet(munged) + ts(compact) + event.
  // Matches cloud-cache.ts::prToQueueEntry's deterministic id idiom.
  const tsCompact = e.ts.replace(/[:\-TZ.]/g, "");
  const fleetMunged = e.fleet.replace(/\//g, "__");
  return {
    id: `q_sup_${e.runtime}_${fleetMunged}_${tsCompact}_${e.event}`,
    ts: e.ts,
    fleet: e.fleet,
    kind: "supervisor-run",
    source: e.runtime as QueueSource,
    status,
    payload: {
      event: e.event,
      preview: e.preview,
      chars_consumed: e.chars_consumed,
      chars_limit: e.chars_limit,
      partial_output_bytes: e.partial_output_bytes,
      exit_code: e.exit_code,
      reason: e.reason,
      hour: e.hour,
    },
  };
}

/**
 * Read Codex/Gemini supervisor terminal events from ~/.sleepwalker/audit.jsonl,
 * filter to the last 24 hours, and map each to a QueueEntry.
 *
 * Contract per RESEARCH §2 + CONTEXT.md:
 *   - Graceful missing file -> []
 *   - Graceful malformed line -> skipped (never throws) — matches queue.ts::parseLines
 *   - Filters to runtime ∈ {codex, gemini}
 *   - Filters to event ∈ {completed, failed, budget_exceeded, deferred}
 *   - Drops entries older than 24h (cutoff = Date.now() - 24*60*60*1000)
 *   - No cache: audit.jsonl is local disk; reads are fast (unlike cloud-cache's
 *     GitHub-API TTL).
 *
 * v0.1 PostToolUse hook entries (tool/input/output_preview shape, no runtime
 * field) are filtered out at the shape-check stage below — they are retained
 * for the v0.1 Audit page but are not supervisor runs.
 */
export function readSupervisorRuns(): QueueEntry[] {
  const f = auditFile();
  if (!fs.existsSync(f)) return [];

  const raw = fs.readFileSync(f, "utf8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  const parsed: SupervisorAuditEntry[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Partial<SupervisorAuditEntry>;
      // Defensive shape check: only accept entries that carry the supervisor
      // discriminator. v0.1 hook audit lines lack `runtime` + `event`.
      if (
        typeof obj.runtime === "string" &&
        typeof obj.event === "string" &&
        typeof obj.ts === "string" &&
        typeof obj.fleet === "string"
      ) {
        parsed.push(obj as SupervisorAuditEntry);
      }
    } catch {
      // Malformed line — skip silently per RESEARCH §7.3 (partial-write
      // recovery pattern, matches queue.ts::parseLines behavior).
    }
  }

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = parsed.filter(
    (e) =>
      SUPERVISOR_RUNTIMES.has(e.runtime) &&
      TERMINAL_EVENTS.has(e.event) &&
      new Date(e.ts).getTime() >= cutoffMs
  );

  return filtered.map(supervisorRunToQueueEntry);
}

export async function aggregateQueue(opts: { fetchCloud: boolean }): Promise<AggregatedQueue> {
  const local = readLocalQueue();
  const supervisor = readSupervisorRuns();

  let cloud: QueueEntry[] = [];
  let cloudError: string | null = null;
  let cloudFetchedAt: string | null = null;

  if (opts.fetchCloud) {
    try {
      cloud = await fetchCloudQueue(false);
      cloudFetchedAt = new Date().toISOString();
    } catch (e) {
      cloudError = e instanceof Error ? e.message : String(e);
      cloud = readCachedCloudQueue();
    }
  } else {
    cloud = readCachedCloudQueue();
  }

  const all = [...local, ...cloud, ...supervisor];
  const pending = all
    .filter((e) => e.status === "pending")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const recent = all
    .filter((e) => e.status !== "pending")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 20);

  return {
    pending,
    recent,
    cloudFetchedAt,
    cloudError,
    localCount: local.length,
    cloudCount: cloud.length,
    supervisorCount: supervisor.length,
  };
}
