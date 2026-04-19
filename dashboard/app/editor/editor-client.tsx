"use client";

import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

interface Props {
  healthStatuses: Record<Runtime, HealthStatus>;
  existingSlugs: string[];
}

export function EditorClient(_props: Props) {
  // STUB — replaced wholesale in Plan 03-08 with the full form state machine
  // (useActionState wiring against saveRoutine from ./actions, autosave,
  // slug-derivation, draft-recovery banner, secret-scan panel). This stub
  // keeps /editor renderable and typecheck clean through Plan 03-06/03-07
  // so the shell + presentational subcomponents (RuntimeRadioGrid,
  // CronPreview, etc.) can ship independently.
  return (
    <div
      data-testid="editor-client-stub"
      className="text-xs text-moon-600"
    >
      editor-client pending plan 03-08
    </div>
  );
}
