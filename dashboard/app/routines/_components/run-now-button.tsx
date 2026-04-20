"use client";

/**
 * RunNowButton — per-runtime Run-now dispatch with 800ms anti-double-click
 * busy window (04-UI-SPEC §Run-now button behavior + §Interaction Contracts
 * §Run-now).
 *
 * Behavior:
 *   - Click → setBusy(true) → await runNowRoutine({runtime, slug})
 *   - On ok: if claude-routines and handoffUrl present, open in new tab
 *     (noopener,noreferrer); fire per-runtime toast via onToast callback
 *   - On error: fire red toast with result.error
 *   - After 800ms minimum, clear busy (prevents double-click double-run)
 *
 * Copy (04-UI-SPEC line 183-193) is LOCKED — do not drift:
 *   claude-routines  → aurora 6s "Opened Claude Routines — complete the fire in browser"
 *   claude-desktop   → green 4s  "Started {slug} on Claude Desktop"
 *   codex            → green 4s  "Started {slug} on Codex — watch the Morning Queue"
 *   gemini           → green 4s  "Started {slug} on Gemini — watch the Morning Queue"
 *
 * Visual: .btn .btn-ghost (UI-SPEC line 154 — Run-now is the secondary
 * affordance on a deployed routine card; Deploy/Redeploy takes the
 * dawn-400 accent primary slot).
 */

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { runNowRoutine } from "@/app/routines/actions";
import type { Runtime } from "@/lib/runtime-adapters/types";

export type ToastKind = "aurora" | "green" | "red";

export interface Toast {
  kind: ToastKind;
  message: string;
  ttl: number;
}

interface RunNowButtonProps {
  runtime: Runtime;
  slug: string;
  onToast?: (toast: Toast) => void;
  disabled?: boolean;
}

const BUSY_WINDOW_MS = 800;

interface RuntimeToastCopy {
  kind: "aurora" | "green";
  template: (slug: string) => string;
  ttl: number;
}

const TOAST_COPY: Record<Runtime, RuntimeToastCopy> = {
  "claude-routines": {
    kind: "aurora",
    template: () => "Opened Claude Routines — complete the fire in browser",
    ttl: 6000,
  },
  "claude-desktop": {
    kind: "green",
    template: (slug) => `Started ${slug} on Claude Desktop`,
    ttl: 4000,
  },
  codex: {
    kind: "green",
    template: (slug) => `Started ${slug} on Codex — watch the Morning Queue`,
    ttl: 4000,
  },
  gemini: {
    kind: "green",
    template: (slug) => `Started ${slug} on Gemini — watch the Morning Queue`,
    ttl: 4000,
  },
};

export function RunNowButton({
  runtime,
  slug,
  onToast,
  disabled,
}: RunNowButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || disabled) return;
    setBusy(true);
    const startedAt = Date.now();
    try {
      const result = await runNowRoutine({ runtime, slug });
      if (result.ok) {
        if (
          runtime === "claude-routines" &&
          result.handoffUrl &&
          typeof window !== "undefined"
        ) {
          window.open(result.handoffUrl, "_blank", "noopener,noreferrer");
        }
        const { kind, template, ttl } = TOAST_COPY[runtime];
        onToast?.({ kind, message: template(slug), ttl });
      } else {
        onToast?.({ kind: "red", message: result.error, ttl: 8000 });
      }
    } catch (e) {
      onToast?.({
        kind: "red",
        message: e instanceof Error ? e.message : String(e),
        ttl: 8000,
      });
    } finally {
      // Enforce 800ms minimum busy window to defeat double-clicks. Clamp to
      // 0 so fast actions (cached handoffUrl builds) still hold the button
      // disabled for the full window.
      const elapsed = Date.now() - startedAt;
      const hold = Math.max(0, BUSY_WINDOW_MS - elapsed);
      setTimeout(() => setBusy(false), hold);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      className="btn btn-ghost inline-flex items-center gap-1"
      data-testid="run-now-button"
      data-busy={busy ? "true" : "false"}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="w-4 h-4" aria-hidden="true" />
      )}
      Run now
    </button>
  );
}
