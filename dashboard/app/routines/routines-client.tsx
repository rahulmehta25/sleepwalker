"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Routine } from "@/lib/routines";

const POLICY_DESC: Record<Routine["defaultPolicy"], string> = {
  strict: "defer all writes",
  balanced: "allow reversible, defer external",
  yolo: "allow everything",
};

export function RoutinesClient({ initial }: { initial: Routine[] }) {
  const [routines, setRoutines] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("toggle failed");
      setRoutines((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    } finally {
      setBusy(null);
    }
  }

  if (routines.length === 0) {
    return (
      <div className="panel p-8 text-center text-sw-muted">
        <p className="mb-2">No routines installed.</p>
        <p className="text-xs font-mono">Run ./install.sh from the repo root.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routines.map((r) => {
        const fleet = r.id.replace(/^sleepwalker-/, "");
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
                  {!r.installed && (
                    <span className="pill-amber inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> not installed
                    </span>
                  )}
                </div>
                <p className="text-sm text-sw-muted">{r.description}</p>
                <div className="text-xs text-sw-muted mt-2 font-mono">
                  budget: {r.defaultBudget.toLocaleString()} tokens
                </div>
              </div>

              <Toggle
                checked={r.enabled}
                disabled={busy === r.id || !r.installed}
                onChange={(enabled) => toggle(r.id, enabled)}
              />
            </div>

            {!r.installed && (
              <div className="mt-3 text-xs text-sw-muted border-t border-sw-border pt-3">
                Run <code className="font-mono">./install.sh</code> from the repo root to install this routine.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-sw-accent" : "bg-sw-border"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
