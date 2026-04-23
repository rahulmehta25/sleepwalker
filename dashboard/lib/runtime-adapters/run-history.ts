// dashboard/lib/runtime-adapters/run-history.ts
//
// Shared implementation of `RuntimeAdapter.listRuns()` for the codex +
// gemini adapters. Both runtimes emit run lifecycle events through
// bin/sleepwalker-run-cli to ~/.sleepwalker/audit.jsonl with a `fleet`
// field of shape `<runtime>/<slug>`. This helper filters that file by
// fleet and maps terminal events to the frozen RunRecord shape.
//
// Why a shared helper and not duplicated inline: the event → status
// mapping (completed→succeeded, failed/budget_exceeded→failed,
// deferred→deferred) is a contract that must stay identical across
// adapters. Duplicating it is a silent-drift risk.
//
// Status mapping:
//   completed        -> succeeded
//   failed           -> failed
//   budget_exceeded  -> failed    (SIGTERM-on-budget is still a failure)
//   deferred         -> deferred  (policy- or sleep-window-blocked)
//
// `started` events are dropped — they're paired with a terminal event in
// the normal case, and orphaned started events (crashed supervisor) are
// indistinguishable from genuine "still running" on a file-based read
// without temporal heuristics. Surfacing only terminal events keeps the
// contract clean; a future "currently running" indicator can layer on
// top with a now-minus-N-minutes cutoff.

import { readRunsByFleet } from "@/lib/audit";
import type { RunRecord } from "./types";

const TERMINAL_EVENTS = new Set([
  "completed",
  "failed",
  "budget_exceeded",
  "deferred",
]);

/**
 * Adapter-facing listRuns() implementation. Reads all audit entries for
 * the given `<runtime>/<slug>` fleet, drops non-terminal events, caps at
 * `limit`, and maps each remaining entry to a RunRecord.
 *
 * The audit file is read in full (not tail-sliced) so history queries
 * return every run since the last rotation. With rotation capping
 * audit.jsonl at 10MB (~40k entries), whole-file read stays bounded.
 */
export function listRunsFromAudit(
  runtime: "codex" | "gemini",
  slug: string,
  limit = 50,
): RunRecord[] {
  const fleet = `${runtime}/${slug}`;
  // Read a generous window so we can filter down to terminal events and
  // still have `limit` records left. Hook-variant audit entries and
  // `started` events are dropped by the filter below.
  const rawWindow = Math.max(limit * 4, 200);
  const entries = readRunsByFleet(fleet, rawWindow);

  const records: RunRecord[] = [];
  for (const e of entries) {
    if (!TERMINAL_EVENTS.has(e.event)) continue;

    let status: RunRecord["status"];
    switch (e.event) {
      case "completed":
        status = "succeeded";
        break;
      case "deferred":
        status = "deferred";
        break;
      default:
        status = "failed"; // "failed" or "budget_exceeded"
    }

    // Synthetic runId: ts + fleet munged. Supervisor emits no native id
    // (no correlation cookie); ts is monotonic per-fleet under flock and
    // unique in practice. Collision would require two events at the same
    // second for the same fleet, which flock serialization prevents.
    const runId = `${e.ts}:${fleet}`;

    // Preview priority: supervisor's `preview` (stdout excerpt) when
    // present; otherwise the `reason` field (for deferred + preflight-
    // failed events where there was no CLI output).
    const preview = e.preview ?? (e.reason ? `deferred: ${e.reason}` : undefined);

    records.push({ ts: e.ts, runId, status, preview });
    if (records.length >= limit) break;
  }

  return records;
}
