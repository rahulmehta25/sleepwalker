"use client";

/**
 * RoutineActionBar — per-card hairline-separated action row that composes
 * every Phase 4 Server Action / client component triad into a single
 * coherent UI. Sits below the existing routines-client.tsx card's metadata
 * row per 04-UI-SPEC §Routine card (lines 147-161) + §Layout Contract
 * lines 272-288.
 *
 * Left side (primary affordance):
 *   - status === "draft"    → Deploy   (btn-primary, Rocket icon)
 *   - status === "drift"    → Redeploy (btn-primary, RefreshCw icon) + Run now
 *   - status === "deployed" → Run now  (btn-ghost,   Play icon via RunNowButton)
 *   - status === "disabled" → Run now  (disabled — cannot run a disabled routine)
 *
 * Right side (secondary affordances):
 *   - Save to repo (btn-ghost, GitCommit icon) — opens SaveToRepoModal
 *   - Enable/disable Toggle — the existing v0.1 Toggle component visual,
 *     reused verbatim here. Click semantics gated by current state:
 *       - Draft  + enabling  → open DeployProgressDrawer first (first-enable
 *                              auto-deploy per UI-SPEC §Enable/disable lines
 *                              443-458). On success, the drawer runs; once
 *                              verified we call setRoutineEnabled({enabled:true}).
 *       - Deployed + disabling → open ConfirmDialog (destructive confirm).
 *                                On confirm → setRoutineEnabled({enabled:false}).
 *       - Otherwise (enable on deployed, disable on draft) → call directly.
 *
 * Composition: DeployProgressDrawer + SaveToRepoModal + ConfirmDialog +
 * RunNowButton are all pre-built Phase 4 components; this bar only owns the
 * `open` flags and dispatch wiring.
 *
 * Data contract: consumes a single `routine: ListedRoutine` prop — the widened
 * shape from dashboard/lib/routines.ts::listRoutinesAsync().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GitCommit, RefreshCw, Rocket } from "lucide-react";
import type { ListedRoutine } from "@/lib/routines";
import { setRoutineEnabled } from "@/app/routines/actions";
import { DeployProgressDrawer } from "./deploy-progress-drawer";
import { SaveToRepoModal } from "./save-to-repo-modal";
import { RunNowButton, type Toast } from "./run-now-button";
import { ConfirmDialog } from "@/app/_components/confirm-dialog";

interface RoutineActionBarProps {
  routine: ListedRoutine;
  /**
   * Called after a terminal Server Action lands. The page reads from disk via
   * router.refresh() — a server component re-read is the canonical way to
   * pick up the new status pill without client-state drift.
   */
  onChange?: () => void;
}

export function RoutineActionBar({ routine, onChange }: RoutineActionBarProps) {
  const { runtime, slug, status, enabled } = routine;

  const [deployOpen, setDeployOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mounted, setMounted] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portal requires document — gate behind mount to avoid SSR mismatch.
  useEffect(() => { setMounted(true); }, []);

  const showToast = useCallback((t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.ttl);
  }, []);

  const handleDeployComplete = useCallback(() => {
    onChange?.();
  }, [onChange]);

  const handleSaveClose = useCallback(() => {
    setSaveOpen(false);
    onChange?.();
  }, [onChange]);

  const applyEnabled = useCallback(
    async (nextEnabled: boolean) => {
      setBusy(true);
      setOptimisticEnabled(nextEnabled);
      try {
        const res = await setRoutineEnabled({ runtime, slug, enabled: nextEnabled });
        if (!res.ok) {
          // revert optimistic
          setOptimisticEnabled(!nextEnabled);
        } else {
          onChange?.();
        }
      } catch {
        setOptimisticEnabled(!nextEnabled);
      } finally {
        setBusy(false);
      }
    },
    [runtime, slug, onChange],
  );

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (busy) return;

      // Enabling a Draft routine → open Deploy drawer first.
      if (nextEnabled && status === "draft") {
        setDeployOpen(true);
        return;
      }

      // Disabling a Deployed routine → confirm first.
      if (!nextEnabled && (status === "deployed" || status === "drift")) {
        setConfirmDisableOpen(true);
        return;
      }

      // Otherwise (enable after verified, disable on already-draft) call directly.
      void applyEnabled(nextEnabled);
    },
    [busy, status, applyEnabled],
  );

  const handleConfirmDisable = useCallback(() => {
    setConfirmDisableOpen(false);
    void applyEnabled(false);
  }, [applyEnabled]);

  return (
    <>
      <div
        className="flex items-center justify-between gap-4 pt-3 mt-3 border-t border-ink-600"
        data-testid="routine-action-bar"
      >
        <div className="flex items-center gap-2">
          {status === "draft" && (
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-1"
              onClick={() => setDeployOpen(true)}
              data-testid="action-bar-deploy"
            >
              <Rocket className="w-4 h-4" aria-hidden="true" /> Deploy
            </button>
          )}
          {status === "drift" && (
            <>
              <button
                type="button"
                className="btn btn-primary inline-flex items-center gap-1"
                onClick={() => setDeployOpen(true)}
                data-testid="action-bar-redeploy"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Redeploy
              </button>
              <RunNowButton runtime={runtime} slug={slug} onToast={showToast} />
            </>
          )}
          {(status === "deployed" || status === "disabled") && (
            <RunNowButton runtime={runtime} slug={slug} onToast={showToast} />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost inline-flex items-center gap-1"
            onClick={() => setSaveOpen(true)}
            data-testid="action-bar-save-to-repo"
          >
            <GitCommit className="w-4 h-4" aria-hidden="true" /> Save to repo
          </button>
          <ActionBarToggle
            checked={optimisticEnabled}
            disabled={busy}
            slug={slug}
            onChange={handleToggle}
          />
        </div>
      </div>

      <DeployProgressDrawer
        runtime={runtime}
        slug={slug}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onComplete={handleDeployComplete}
      />
      <SaveToRepoModal
        runtime={runtime}
        slug={slug}
        open={saveOpen}
        onClose={handleSaveClose}
      />
      <ConfirmDialog
        open={confirmDisableOpen}
        title={`Disable ${slug}?`}
        body="This runs launchctl bootout — the routine will no longer fire on its cron. Your bundle on disk is unchanged. You can re-enable at any time."
        destructiveLabel="Disable"
        cancelLabel="Keep enabled"
        onConfirm={handleConfirmDisable}
        onCancel={() => setConfirmDisableOpen(false)}
      />
      {mounted && toast && createPortal(
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] text-xs px-4 py-2.5 rounded-lg border shadow-lg ${
            toast.kind === "aurora"
              ? "bg-aurora-500/10 text-aurora-300 border-aurora-500/30"
              : toast.kind === "red"
                ? "bg-signal-red/10 text-signal-red border-signal-red/30"
                : "bg-signal-green/10 text-signal-green border-signal-green/30"
          }`}
          role="status"
        >
          {toast.message}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Local Toggle variant matching the existing routines-client.tsx visual.
 * We keep it local instead of importing from routines-client to avoid a
 * circular import — routines-client.tsx imports RoutineActionBar directly.
 * The visual contract matches v0.1 byte-for-byte.
 */
function ActionBarToggle({
  checked,
  disabled,
  slug,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  slug: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      type="button"
      aria-checked={checked}
      aria-label={checked ? `Disable ${slug}` : `Enable ${slug}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-dawn-400" : "bg-ink-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      data-testid="action-bar-toggle"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
