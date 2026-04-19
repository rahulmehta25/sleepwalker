"use client";

import type { SecretMatch } from "@/lib/secret-scan";

// Exact UI-SPEC strings — see .planning/phases/03-editor/03-UI-SPEC.md
// §Secret-scan error panel (lines 262-274). Heading, body template, and
// inline code fix example are contract-locked. Do not edit without updating
// UI-SPEC first.

interface Props {
  match: SecretMatch | null;
  onScrollToLine?: (line: number, column: number) => void;
}

export function SecretScanPanel({ match, onScrollToLine }: Props) {
  if (!match) return null;

  return (
    <div className="panel border-signal-red/50 bg-signal-red/5 p-4 mt-2 flex flex-col gap-2">
      <h3 className="text-signal-red font-semibold text-sm">
        Secret detected — save blocked
      </h3>
      <p className="text-xs text-moon-200">
        {match.patternName} at line {match.line}, column {match.column}.
        {" "}Replace the matched substring with{" "}
        <code className="font-mono">${"{VAR}"}</code>{" "}
        and document the variable in AUTHORING.md.
      </p>
      <pre className="panel-raised text-xs font-mono p-2 whitespace-pre-wrap">
{`Before:  OPENAI_API_KEY=sk_live_abc123…
After:   OPENAI_API_KEY=\${OPENAI_API_KEY}`}
      </pre>
      {onScrollToLine && (
        <button
          type="button"
          className="text-xs text-dawn-400 underline-offset-2 hover:underline self-start"
          onClick={() => onScrollToLine(match.line, match.column)}
        >
          View matched region
        </button>
      )}
    </div>
  );
}
