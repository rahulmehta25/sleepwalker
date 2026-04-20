"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { ListedRoutine } from "@/lib/routines";
import { RoutineActionBar } from "./_components/routine-action-bar";
import { StatusPill } from "./_components/status-pill";

const POLICY_DESC: Record<ListedRoutine["defaultPolicy"], string> = {
  strict: "defer all writes",
  balanced: "allow reversible, defer external",
  yolo: "allow everything",
};

export function RoutinesClient({ initial }: { initial: ListedRoutine[] }) {
  // Phase 4 amendment: each routine renders the existing upper metadata row
  // PLUS a hairline-separated RoutineActionBar below it per 04-UI-SPEC
  // §Routine card. The static `not installed` amber pill is replaced by a
  // dynamic `<StatusPill />` (DRAFT / DEPLOYED / DRIFT / DISABLED) driven by
  // the widened lib/routines.ts::computeStatus result.
  const [nonce, setNonce] = useState(0);

  if (initial.length === 0) {
    return (
      <div className="panel p-8 text-center text-moon-400">
        <p className="mb-2">No routines installed.</p>
        <p className="text-xs font-mono">Run ./install.sh from the repo root.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" key={nonce}>
      {initial.map((r) => {
        // claude-desktop v0.1 ids carry the sleepwalker- prefix; strip it for
        // display continuity with v0.1. Other runtimes use the raw slug.
        const fleet =
          r.runtime === "claude-desktop"
            ? r.slug.replace(/^sleepwalker-/, "")
            : `${r.runtime}/${r.slug}`;
        return (
          <div key={r.id} className="panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">{fleet}</span>
                  <span className="pill-muted font-mono">{r.defaultCron}</span>
                  <span className={r.defaultPolicy === "yolo" ? "pill-red" : r.defaultPolicy === "strict" ? "pill-green" : "pill-yellow"}>
                    {r.defaultPolicy}: {POLICY_DESC[r.defaultPolicy]}
                  </span>
                  <StatusPill status={r.status} />
                  {r.runtime === "claude-desktop" && !r.installed && (
                    <span className="pill-amber inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> not installed
                    </span>
                  )}
                </div>
                {r.description && (
                  <p className="text-sm text-moon-400">{r.description}</p>
                )}
                <div className="text-xs text-moon-400 mt-2 font-mono">
                  budget: {r.defaultBudget.toLocaleString()} tokens
                </div>
              </div>
            </div>

            <RoutineActionBar
              routine={r}
              onChange={() => setNonce((n) => n + 1)}
            />

            {r.runtime === "claude-desktop" && !r.installed && (
              <div className="mt-3 text-xs text-moon-400 border-t border-ink-600 pt-3">
                Run <code className="font-mono">./install.sh</code> from the repo root to install this routine.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
