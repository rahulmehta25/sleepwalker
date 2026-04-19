"use client";

import cronstrue from "cronstrue";

interface Props {
  expression: string;
}

// Exact UI-SPEC copy — .planning/phases/03-editor/03-UI-SPEC.md line 159.
// Do not edit without updating the UI-SPEC row for "Cronstrue invalid".
const INVALID_MSG =
  "Invalid cron — 5 fields required (minute hour day month weekday).";

export function CronPreview({ expression }: Props) {
  const trimmed = expression.trim();
  const fieldCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  if (fieldCount !== 5) {
    return <span className="text-xs text-signal-red">{INVALID_MSG}</span>;
  }

  let parsed: string;
  try {
    parsed = cronstrue.toString(trimmed, {
      verbose: false,
      use24HourTimeFormat: true,
    });
  } catch {
    return <span className="text-xs text-signal-red">{INVALID_MSG}</span>;
  }

  return <span className="pill-aurora">Runs {parsed}</span>;
}
