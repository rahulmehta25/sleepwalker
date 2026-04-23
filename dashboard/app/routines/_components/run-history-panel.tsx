"use client";

// dashboard/app/routines/_components/run-history-panel.tsx
//
// Per-routine run history disclosure. Collapsed by default; on first open,
// fetches the last N runs via the getRunHistory Server Action and renders
// a compact table of timestamp + status + preview.
//
// Design decisions:
//
// 1. Lazy fetch — history is not useful on page load for 99% of cards; we
//    only hit audit.jsonl when the user actually opens a card's history.
//    Keeps the initial SSR payload light.
// 2. One-shot fetch with manual refresh — we cache the response in local
//    state so toggling open/closed doesn't refetch; a small Refresh button
//    at the top-right lets the user pull new runs after a manual Run-now.
// 3. Runtime-aware empty state — claude-routines + claude-desktop have no
//    local audit trail; the Server Action surfaces a `reason` string that
//    we render directly rather than showing an empty table.
// 4. Safety: preview is rendered as text (React escapes) and truncated
//    to PREVIEW_MAX chars so a hostile supervisor log line cannot blow
//    out the panel. The supervisor already strips ANSI before writing
//    audit events, so we don't re-strip here.
// 5. No React Server Component — this is a client island inside the
//    server-rendered routines-client.tsx. Using a Server Action rather
//    than a dedicated API route keeps the surface area minimal.

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { getRunHistory } from "@/app/routines/actions";
import type { RunRecord } from "@/lib/runtime-adapters/types";
import type { Runtime } from "@/lib/runtime-adapters/types";

interface RunHistoryPanelProps {
  runtime: Runtime;
  slug: string;
  /** Max rows to display — default 10 matches the Ship #1 scope. */
  limit?: number;
}

const PREVIEW_MAX = 140;
const DEFAULT_LIMIT = 10;

/** Status pill styling derived from the same palette used by status-pill.tsx. */
function statusClass(status: RunRecord["status"]): string {
  switch (status) {
    case "succeeded":
      return "pill-green";
    case "failed":
      return "pill-red";
    case "deferred":
      return "pill-amber";
    case "running":
      return "pill-muted";
  }
}

function statusLabel(status: RunRecord["status"]): string {
  switch (status) {
    case "succeeded": return "OK";
    case "failed":    return "FAIL";
    case "deferred":  return "DEFER";
    case "running":   return "RUN";
  }
}

/** Human-friendly relative time, e.g. "3m ago" or "2d ago". No deps. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const deltaS = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (deltaS < 60)  return `${deltaS}s ago`;
  const deltaM = Math.round(deltaS / 60);
  if (deltaM < 60)  return `${deltaM}m ago`;
  const deltaH = Math.round(deltaM / 60);
  if (deltaH < 24)  return `${deltaH}h ago`;
  const deltaD = Math.round(deltaH / 24);
  return `${deltaD}d ago`;
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function RunHistoryPanel({ runtime, slug, limit = DEFAULT_LIMIT }: RunHistoryPanelProps) {
  const [open,   setOpen]   = useState(false);
  const [runs,   setRuns]   = useState<RunRecord[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await getRunHistory({ runtime, slug, limit });
      if (!res.ok) {
        setError(res.error ?? "Failed to load run history");
        setRuns(null);
        setReason(null);
        return;
      }
      setRuns(res.runs);
      setReason(res.reason ?? null);
    });
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    // Load on first open only; keep cached data on subsequent toggles.
    if (next && runs === null && error === null) {
      load();
    }
  }

  return (
    <div
      className="mt-3 border-t border-ink-600 pt-3"
      data-testid="run-history-panel"
      data-runtime={runtime}
      data-slug={slug}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="text-xs text-moon-400 hover:text-moon-200 inline-flex items-center gap-1 font-mono"
        aria-expanded={open}
        aria-controls={`run-history-body-${runtime}-${slug}`}
        data-testid="run-history-toggle"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
        )}
        Recent runs
        {runs !== null && runs.length > 0 && (
          <span className="text-moon-500">({runs.length})</span>
        )}
      </button>

      {open && (
        <div
          id={`run-history-body-${runtime}-${slug}`}
          className="mt-2"
          data-testid="run-history-body"
        >
          {/* Manual refresh sits top-right when we already have data */}
          {(runs !== null || error !== null) && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={load}
                disabled={pending}
                className="text-xs text-moon-500 hover:text-moon-300 inline-flex items-center gap-1"
                data-testid="run-history-refresh"
                aria-label="Refresh run history"
              >
                {pending ? (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                )}
                Refresh
              </button>
            </div>
          )}

          {/* Loading state (first fetch) */}
          {pending && runs === null && error === null && (
            <div
              className="text-xs text-moon-500 inline-flex items-center gap-2"
              data-testid="run-history-loading"
            >
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              Loading…
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="text-xs text-rose-300 border border-rose-900/60 bg-rose-950/30 rounded px-2 py-1.5"
              data-testid="run-history-error"
            >
              {error}
            </div>
          )}

          {/* Runtime-specific advisory (claude-routines / claude-desktop) */}
          {reason && runs !== null && runs.length === 0 && (
            <div
              className="text-xs text-moon-500 italic"
              data-testid="run-history-reason"
            >
              {reason}
            </div>
          )}

          {/* Empty state for supervisor-backed runtimes with no runs yet */}
          {!reason && runs !== null && runs.length === 0 && (
            <div
              className="text-xs text-moon-500 italic"
              data-testid="run-history-empty"
            >
              No runs yet. Click Run now or wait for the next scheduled fire.
            </div>
          )}

          {/* Run table */}
          {runs !== null && runs.length > 0 && (
            <table
              className="w-full text-xs font-mono"
              data-testid="run-history-table"
            >
              <thead>
                <tr className="text-moon-500 text-left">
                  <th className="font-normal pb-1 pr-2 w-[6ch]">status</th>
                  <th className="font-normal pb-1 pr-2 w-[8ch]">when</th>
                  <th className="font-normal pb-1">preview</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.runId}
                    className="border-t border-ink-700/50 align-top"
                    data-testid="run-history-row"
                    data-status={r.status}
                  >
                    <td className="py-1 pr-2">
                      <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>
                    </td>
                    <td
                      className="py-1 pr-2 text-moon-400 whitespace-nowrap"
                      title={r.ts}
                    >
                      {relativeTime(r.ts)}
                    </td>
                    <td className="py-1 text-moon-300 break-words">
                      {truncate(r.preview, PREVIEW_MAX) || (
                        <span className="text-moon-600 italic">(no output)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
