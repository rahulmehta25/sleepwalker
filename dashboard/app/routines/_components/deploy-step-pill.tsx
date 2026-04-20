"use client";

/**
 * DeployStepPill — one row of the 4-stage progress drawer.
 *
 * Renders a single deploy step (planning / writing / loading / verified) with
 * its state-driven icon, UI-SPEC locked label + helper, and an elapsed timer
 * (or rollback reason). The derivation rules (04-07-PLAN.md task 1) are:
 *
 *   - phase.kind === "rolled-back" && failedStep matches        → rolled-back
 *   - phase.kind === "running" && phase.step === step           → running
 *   - steps[step]?.completedAt is set                           → succeeded
 *   - otherwise                                                 → pending
 *
 * Visual tokens inherit from 04-UI-SPEC §Step-state color mapping:
 *   pending    → pill-muted + Circle
 *   running    → pill-aurora + Loader2 (animate-spin)
 *   succeeded  → pill-green + CheckCircle2
 *   rolled-back → pill-red + AlertTriangle
 *
 * Layout per 04-UI-SPEC §Layout Contract (lines 299-316):
 *   grid grid-cols-[16px_1fr_auto] items-center gap-3 px-6 py-3
 *   left: 16px state icon
 *   center: .label step name + moon-400 12px helper
 *   right: elapsed (ms <1s, s.s else) | "(running, {s}s)" | "—" | rollback reason
 */

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { DeployPhase, DeployState, DeployStep } from "@/lib/deploy-state";

type StepStatus = "pending" | "running" | "succeeded" | "rolled-back";

interface DeployStepPillProps {
  step: DeployStep;
  phase: DeployPhase;
  steps: DeployState["steps"];
  /**
   * Optional UI-SPEC copy override. The drawer owns the locked label + helper
   * from 04-UI-SPEC lines 173-176; if not passed, derive sensible defaults so
   * this component remains standalone-renderable.
   */
  label?: string;
  helper?: string;
}

const DEFAULT_COPY: Record<DeployStep, { label: string; helper: string }> = {
  planning: { label: "PLANNING", helper: "Read bundle, resolve paths." },
  writing: {
    label: "WRITING",
    helper: "Write plist to ~/Library/LaunchAgents/",
  },
  loading: { label: "LOADING", helper: "launchctl bootstrap gui/$UID" },
  verified: {
    label: "VERIFIED",
    helper: "launchctl print confirms live state.",
  },
};

function deriveStatus(
  step: DeployStep,
  phase: DeployPhase,
  steps: DeployState["steps"],
): StepStatus {
  if (phase.kind === "rolled-back") {
    // The failed step and any previously-succeeded step are both rolled-back
    // visually (cascade in the drawer). If the step has any completed record
    // OR matches failedStep, paint it red. Otherwise leave it pending so
    // never-reached steps read as muted rather than rolled-back.
    if (phase.failedStep === step) return "rolled-back";
    if (steps[step]?.completedAt) return "rolled-back";
    return "pending";
  }
  if (phase.kind === "running" && phase.step === step) return "running";
  if (steps[step]?.completedAt) return "succeeded";
  return "pending";
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderRight(
  status: StepStatus,
  step: DeployStep,
  phase: DeployPhase,
  steps: DeployState["steps"],
): React.ReactNode {
  if (status === "running" && phase.kind === "running") {
    const elapsedS = ((Date.now() - phase.stepStartedAt) / 1000).toFixed(1);
    return (
      <span className="text-[11px] text-moon-400 font-mono">
        (running, {elapsedS}s)
      </span>
    );
  }
  if (status === "succeeded") {
    const elapsedMs = steps[step]?.elapsedMs ?? 0;
    return (
      <span className="text-[11px] text-moon-400 font-mono">
        {formatElapsed(elapsedMs)}
      </span>
    );
  }
  if (status === "rolled-back" && phase.kind === "rolled-back") {
    return (
      <span className="text-[11px] text-signal-red font-mono max-w-[160px] truncate">
        {phase.error}
      </span>
    );
  }
  return <span className="text-[11px] text-moon-400 font-mono">—</span>;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          className="w-4 h-4 text-aurora-400 animate-spin"
          aria-hidden="true"
        />
      );
    case "succeeded":
      return (
        <CheckCircle2
          className="w-4 h-4 text-signal-green"
          aria-hidden="true"
        />
      );
    case "rolled-back":
      return (
        <AlertTriangle
          className="w-4 h-4 text-signal-red"
          aria-hidden="true"
        />
      );
    case "pending":
    default:
      return (
        <Circle className="w-4 h-4 text-moon-500" aria-hidden="true" />
      );
  }
}

export function DeployStepPill({
  step,
  phase,
  steps,
  label,
  helper,
}: DeployStepPillProps) {
  const status = deriveStatus(step, phase, steps);
  const copy = DEFAULT_COPY[step];
  const resolvedLabel = label ?? copy.label;
  const resolvedHelper = helper ?? copy.helper;

  return (
    <div
      className="grid grid-cols-[16px_1fr_auto] items-center gap-3 px-6 py-3"
      data-testid={`deploy-step-pill-${step}`}
      data-status={status}
    >
      <StatusIcon status={status} />
      <div className="min-w-0">
        <div className="label text-[11px] font-mono uppercase tracking-wider">
          {resolvedLabel}
        </div>
        <div className="text-xs text-moon-400 truncate">{resolvedHelper}</div>
      </div>
      {renderRight(status, step, phase, steps)}
    </div>
  );
}
