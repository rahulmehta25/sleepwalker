"use client";

/**
 * HealthBadge — presentational pill rendering the landing-page runtime
 * health state for one runtime. Four locked variants per 04-UI-SPEC
 * §Landing-page health badge row (lines 237-245):
 *
 *   - green (available + no warning): `{Runtime} · {version}` — plain span
 *   - amber (available + warning): `{Runtime}` — button, hover tooltip + AUTHORING link
 *   - grey (!available): `AlertCircle + {Runtime} · {truncatedReason}` — button
 *   - loading (status === null): `Loader2 + {Runtime} · checking…` — plain span
 *
 * Manual refresh button renders only on amber/grey (never green/loading)
 * and its click handler stops propagation so it doesn't trip the parent
 * pill's AUTHORING.md redirect. All visual tokens inherit from Phase 3
 * UI-SPEC (pill-green / pill-amber / pill-muted).
 */

import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

// Locked UI-SPEC labels (04-UI-SPEC line 240 + 04-PATTERNS.md line 599-605).
const RUNTIME_LABEL: Record<Runtime, string> = {
  "claude-routines": "Claude Routines",
  "claude-desktop": "Claude Desktop",
  codex: "Codex",
  gemini: "Gemini",
};

const AUTHORING_LINK = "/docs/AUTHORING.md#runtime-setup";

function truncate(s: string | undefined, max = 40): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function openAuthoring(): void {
  if (typeof window === "undefined") return;
  window.open(AUTHORING_LINK, "_blank", "noopener,noreferrer");
}

interface Props {
  status: HealthStatus | null;
  runtime: Runtime;
  onManualRefresh?: () => void;
}

export function HealthBadge({ status, runtime, onManualRefresh }: Props) {
  const label = RUNTIME_LABEL[runtime];

  // Loading — status === null (pre-fetch or initial SSR render)
  if (status === null) {
    return (
      <span
        className="pill-muted inline-flex items-center gap-1"
        data-testid={`health-badge-${runtime}`}
      >
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        {label} · checking…
      </span>
    );
  }

  // Manual refresh affordance — only rendered on amber/grey states
  // per UI-SPEC line 243 ("green state is not interactive").
  const refreshBtn = onManualRefresh ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onManualRefresh();
      }}
      aria-label={`Refresh ${label} health`}
      className="ml-1 opacity-70 hover:opacity-100"
    >
      <RefreshCw className="w-3 h-3" aria-hidden="true" />
    </button>
  ) : null;

  // Green — available + no warning
  if (status.available && !status.warning) {
    return (
      <span
        className="pill-green font-mono"
        data-testid={`health-badge-${runtime}`}
      >
        {label} · {status.version ?? "ready"}
      </span>
    );
  }

  // Amber — available + warning. Hover reveals warning; click opens AUTHORING.
  if (status.available && status.warning) {
    return (
      <span
        className="inline-flex items-center"
        data-testid={`health-badge-${runtime}`}
      >
        <button
          type="button"
          title={`${status.warning}. See AUTHORING.md → Runtime setup.`}
          onClick={openAuthoring}
          className="pill-amber inline-flex items-center gap-1"
        >
          {label}
        </button>
        {refreshBtn}
      </span>
    );
  }

  // Grey — !available. Render AlertCircle + truncated reason (or "not installed").
  const reasonText = truncate(status.reason) || "not installed";
  return (
    <span
      className="inline-flex items-center"
      data-testid={`health-badge-${runtime}`}
    >
      <button
        type="button"
        title={`${status.reason ?? "unavailable"}. See AUTHORING.md → Runtime setup.`}
        onClick={openAuthoring}
        className="pill-muted inline-flex items-center gap-1"
      >
        <AlertCircle className="w-3 h-3" aria-hidden="true" />
        {label} · {reasonText}
      </button>
      {refreshBtn}
    </span>
  );
}
