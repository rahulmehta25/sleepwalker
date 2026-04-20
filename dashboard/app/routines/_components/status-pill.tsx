"use client";

/**
 * StatusPill — the DRAFT / DEPLOYED / DRIFT / DISABLED pill rendered on every
 * routine card per 04-UI-SPEC §Routine card (lines 157-160).
 *
 * Visual variants (04-UI-SPEC §Color):
 *   draft     → pill-muted text DRAFT
 *   deployed  → pill-green text DEPLOYED
 *   drift     → pill-amber inline-flex gap-1 + RefreshCw icon + text DRIFT
 *               hover tooltip: "Bundle edited {relative}; deployed artifact is
 *               older. Redeploy to sync."
 *   disabled  → pill-muted text DISABLED
 *
 * No Server Action interaction — this is purely presentational. Consumers
 * (routine-action-bar in Plan 04-09) read `status` from the RoutineStatus
 * computed by dashboard/lib/deploy-state.ts::computeStatus.
 */

import { RefreshCw } from "lucide-react";
import type { RoutineStatus } from "@/lib/deploy-state";

interface StatusPillProps {
  status: RoutineStatus;
  /**
   * Human-readable relative time for the DRIFT tooltip, e.g. "3 minutes ago".
   * Optional — when omitted the drift tooltip still surfaces the generic copy
   * so the component never produces a broken tooltip.
   */
  driftRelativeTime?: string;
}

export function StatusPill({
  status,
  driftRelativeTime,
}: StatusPillProps) {
  if (status === "draft") {
    return (
      <span className="pill-muted" data-testid="status-pill-draft">
        DRAFT
      </span>
    );
  }
  if (status === "deployed") {
    return (
      <span className="pill-green" data-testid="status-pill-deployed">
        DEPLOYED
      </span>
    );
  }
  if (status === "drift") {
    const relative = driftRelativeTime ?? "recently";
    return (
      <span
        className="pill-amber inline-flex items-center gap-1"
        title={`Bundle edited ${relative}; deployed artifact is older. Redeploy to sync.`}
        data-testid="status-pill-drift"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" />
        DRIFT
      </span>
    );
  }
  // disabled
  return (
    <span className="pill-muted" data-testid="status-pill-disabled">
      DISABLED
    </span>
  );
}
