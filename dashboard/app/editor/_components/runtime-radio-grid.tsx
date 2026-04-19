"use client";

import { Cloud, Workflow, ScrollText, ListChecks, AlertCircle } from "lucide-react";
import clsx from "clsx";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

interface CardInfo {
  runtime: Runtime;
  title: string;
  description: string;
  Icon: typeof Cloud;
}

// Exact UI-SPEC strings — see .planning/phases/03-editor/03-UI-SPEC.md
// §Runtime picker copy (lines 143-152). Do not edit without updating UI-SPEC.
const CARDS: readonly CardInfo[] = [
  {
    runtime: "claude-routines",
    title: "Claude Routines",
    description: "Cloud — Anthropic infra, GitHub triggers.",
    Icon: Cloud,
  },
  {
    runtime: "claude-desktop",
    title: "Claude Desktop",
    description: "Local — Desktop Scheduled Tasks.",
    Icon: Workflow,
  },
  {
    runtime: "codex",
    title: "Codex Pro",
    description: "Local — OpenAI codex CLI via launchd.",
    Icon: ScrollText,
  },
  {
    runtime: "gemini",
    title: "Gemini CLI Pro",
    description: "Local — Google gemini CLI via launchd.",
    Icon: ListChecks,
  },
];

interface Props {
  value: Runtime | "";
  onChange: (r: Runtime) => void;
  healthStatuses: Record<Runtime, HealthStatus>;
}

export function RuntimeRadioGrid({ value, onChange, healthStatuses }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Runtime">
      {CARDS.map((card) => {
        const status = healthStatuses[card.runtime];
        const available = status?.available ?? false;
        const selected = value === card.runtime;
        const hasWarning = available && Boolean(status?.warning);

        return (
          <label
            key={card.runtime}
            className={clsx(
              "panel p-4 flex flex-col gap-2 cursor-pointer",
              selected && "panel-raised ring-1 ring-dawn-400",
              !available && "opacity-40 cursor-not-allowed",
            )}
          >
            <div className="flex items-center gap-2">
              <card.Icon className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm font-medium">{card.title}</span>
              <input
                type="radio"
                name="runtime"
                value={card.runtime}
                checked={selected}
                disabled={!available}
                onChange={() => onChange(card.runtime)}
                className="sr-only"
              />
            </div>
            <p className="text-xs text-moon-400">{card.description}</p>
            {available && !hasWarning && <span className="pill-green">Ready</span>}
            {available && hasWarning && (
              <span className="pill-amber inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {status.warning}
              </span>
            )}
            {!available && (
              <span
                className="pill-amber text-xs"
                title={`${status?.reason ?? "Unavailable."} See AUTHORING.md → Runtime setup.`}
              >
                {status?.reason ?? "Unavailable."}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
