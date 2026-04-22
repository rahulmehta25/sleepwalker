"use client";

/**
 * DeployProgressDrawer — right-anchored slide-in drawer that drives the 4-stage
 * deploy state machine (planning → writing → loading → verified) and renders
 * success + rollback terminal states per 04-UI-SPEC §Deploy progress drawer
 * (lines 162-180, 290-317) + §Interaction Contracts §Deploy state machine
 * (lines 361-381).
 *
 * Lifecycle:
 *   1. open flips true → invoke deployRoutine({runtime, slug}) once (fire
 *      and forget — terminal state lands via the poll). Immediately start
 *      setInterval(500ms) that calls getDeployState(...).
 *   2. Each poll updates local `state: DeployState | null`. The 4 DeployStepPill
 *      rows read the shape directly.
 *   3. Terminal state (phase.kind in {"succeeded","rolled-back"}) clears the
 *      interval, calls onComplete?.(state), swaps footer CTAs.
 *   4. open flips false → cleanup interval, reset state + invokedRef so a
 *      subsequent open triggers a fresh deploy.
 *
 * Interaction rules:
 *   - Esc closes drawer ONLY if state is terminal (UI-SPEC line 180 — prevents
 *     accidental dismissal mid-deploy)
 *   - Close button is focused on open (UI-SPEC §Focus management)
 *   - Success footer: [Close] + <RunNowButton /> for instant deploy→run chain
 *   - Rollback footer: [Dismiss] + [Retry deploy] (Retry re-invokes startDeploy)
 *   - Q1 warning surface: state.warning renders as pill-amber between step list
 *     and footer on successful claude-desktop deploys (SKILL.md manual-add)
 *
 * The drawer intentionally uses framer-motion for the slide-in (damping 25,
 * stiffness 200) per UI-SPEC line 292 — these exact numbers match the rest of
 * Phase 3/4 motion tokens so animations feel cohesive.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Rocket, X } from "lucide-react";
import {
  deployRoutine,
  getDeployState,
} from "@/app/routines/actions";
import type { DeployState, DeployStep } from "@/lib/deploy-state";
import type { Runtime } from "@/lib/runtime-adapters/types";
import { DeployStepPill } from "./deploy-step-pill";
import { RunNowButton } from "./run-now-button";

// UI-SPEC-locked step copy (lines 173-176). Frozen — do not drift.
const STEPS: Array<{ step: DeployStep; label: string; helper: string }> = [
  { step: "planning", label: "PLANNING", helper: "Read bundle, resolve paths." },
  {
    step: "writing",
    label: "WRITING",
    helper: "Write plist to ~/Library/LaunchAgents/",
  },
  { step: "loading", label: "LOADING", helper: "launchctl bootstrap gui/$UID" },
  {
    step: "verified",
    label: "VERIFIED",
    helper: "launchctl print confirms live state.",
  },
];

// UI-SPEC subtitles (lines 170-172). Frozen copy.
const SUBTITLE_RUNNING =
  "Watch each step complete. Failures auto-rollback.";
const SUBTITLE_SUCCESS = "Deployment verified. All four steps passed.";
const SUBTITLE_ROLLED_BACK = "Deploy rolled back — every artifact removed.";

// Polling cadence from UI-SPEC line 368 + 04-RESEARCH.md Polling Mechanism.
const POLL_INTERVAL_MS = 500;

interface DeployProgressDrawerProps {
  runtime: Runtime;
  slug: string;
  open: boolean;
  onClose: () => void;
  onComplete?: (state: DeployState) => void;
}

export function DeployProgressDrawer({
  runtime,
  slug,
  open,
  onClose,
  onComplete,
}: DeployProgressDrawerProps) {
  const [state, setState] = useState<DeployState | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const invokedRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startDeploy = useCallback(async () => {
    invokedRef.current = true;
    setState(null);
    clearPoll();

    // Fire the Server Action. The final state lands on disk; the polling
    // loop will observe it and transition to terminal. Do not await the
    // promise inline — the drawer remains responsive to cancel/Esc via the
    // poll loop's observation of the state file.
    //
    // Intentionally ignored — the action writes to disk and the poll loop
    // reads it. A rejection here would indicate an I/O failure BEFORE the
    // state file was written; poll returns null → drawer shows pending steps
    // indefinitely. Acceptable v0.2 behavior (user hits Dismiss / Esc).
    void deployRoutine({ runtime, slug });

    pollTimer.current = setInterval(async () => {
      const next = await getDeployState({ runtime, slug });
      if (!next) return;
      setState(next);
      if (
        next.phase.kind === "succeeded" ||
        next.phase.kind === "rolled-back"
      ) {
        clearPoll();
        onComplete?.(next);
      }
    }, POLL_INTERVAL_MS);
  }, [runtime, slug, onComplete, clearPoll]);

  // Drive the deploy/poll lifecycle off `open`. A single source of truth: the
  // effect starts a deploy on transition-to-open, and tears it down on any
  // transition-to-closed. invokedRef guards against double-invocation when
  // React 19 Strict Mode mounts/unmounts in dev.
  useEffect(() => {
    if (open && !invokedRef.current) {
      void startDeploy();
    }
    if (!open) {
      invokedRef.current = false;
      setState(null);
      clearPoll();
    }
    return () => {
      clearPoll();
    };
  }, [open, startDeploy, clearPoll]);

  // Focus management + Esc handling. Esc must NOT close while running (UI-SPEC
  // line 180 — protects from accidental dismissal).
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const terminal =
        state?.phase.kind === "succeeded" ||
        state?.phase.kind === "rolled-back";
      if (terminal) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state, onClose]);

  const isSucceeded = state?.phase.kind === "succeeded";
  const isRolledBack = state?.phase.kind === "rolled-back";
  const subtitle = isSucceeded
    ? SUBTITLE_SUCCESS
    : isRolledBack
      ? SUBTITLE_ROLLED_BACK
      : SUBTITLE_RUNNING;

  // Default phase shape for the step pills while we have no state yet. Once
  // the first poll returns, this is replaced by `state.phase`.
  const phase = state?.phase ?? {
    kind: "running" as const,
    step: "planning" as DeployStep,
    stepStartedAt: Date.now(),
  };
  const steps = state?.steps ?? {};

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-30"
            data-testid="deploy-drawer-backdrop"
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-40 w-full lg:w-[420px] panel-raised border-l border-ink-600 shadow-2xl flex flex-col"
            data-testid="deploy-progress-drawer"
            aria-label={`Deploying ${runtime}/${slug}`}
          >
            <header className="p-6 border-b border-ink-600">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="label text-[11px] text-moon-400">
                    DEPLOYING
                  </div>
                  <div className="font-mono text-sm mt-1 truncate">
                    {runtime}/{slug}
                  </div>
                </div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="text-moon-400 hover:text-moon-200 flex-shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <p className="text-xs text-moon-400 mt-2">{subtitle}</p>
            </header>

            {isRolledBack && state && state.phase.kind === "rolled-back" && (
              <div
                role="alert"
                className="panel border-signal-red/50 bg-signal-red/5 mx-6 mt-4 p-4"
                data-testid="deploy-rollback-banner"
              >
                <h2 className="text-sm font-semibold text-signal-red">
                  Deploy rolled back — {state.phase.failedStep} failed
                </h2>
                <p className="text-xs text-moon-400 mt-1">
                  All artifacts removed. You can safely retry after fixing{" "}
                  {state.phase.error}.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-auto py-2">
              {STEPS.map(({ step, label, helper }) => (
                <DeployStepPill
                  key={step}
                  step={step}
                  phase={phase}
                  steps={steps}
                  label={label}
                  helper={helper}
                />
              ))}
            </div>

            {isSucceeded && state?.warning && (
              <div className="px-6 pb-3">
                <span
                  className="pill-amber text-xs max-w-[360px] inline-block"
                  data-testid="deploy-warning-pill"
                >
                  {state.warning}
                </span>
              </div>
            )}

            <footer className="p-6 border-t border-ink-600 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost"
                data-testid="deploy-drawer-close-footer"
              >
                {isRolledBack ? "Dismiss" : "Close"}
              </button>
              {isRolledBack ? (
                <button
                  type="button"
                  onClick={() => {
                    // Retry: reset invokedRef and re-run the lifecycle.
                    invokedRef.current = false;
                    void startDeploy();
                  }}
                  className="btn btn-primary inline-flex items-center gap-1"
                  data-testid="deploy-drawer-retry"
                >
                  <Rocket className="w-4 h-4" aria-hidden="true" /> Retry deploy
                </button>
              ) : isSucceeded ? (
                <RunNowButton runtime={runtime} slug={slug} />
              ) : null}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
