import {
  formatAsIssueBody,
  gatherDiagnostics,
  type Probe,
} from "@/lib/diagnostics";
import { PageHeader } from "../_components/page-header";
import { CopyIssueButton } from "./diagnostics-client";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type RowKey =
  | "macos"
  | "arch"
  | "brew"
  | "shell"
  | "claude"
  | "codex"
  | "gemini"
  | "flock"
  | "jq"
  | "launchAgents"
  | "sleepwalkerState";

const ROW_SPEC: Array<{ key: RowKey; label: string }> = [
  { key: "macos", label: "macOS version" },
  { key: "arch", label: "Architecture" },
  { key: "brew", label: "Homebrew prefix" },
  { key: "shell", label: "Active shell ($SHELL)" },
  { key: "claude", label: "claude CLI" },
  { key: "codex", label: "codex CLI" },
  { key: "gemini", label: "gemini CLI" },
  { key: "flock", label: "flock (audit serialization)" },
  { key: "jq", label: "jq (JSON tooling)" },
  { key: "launchAgents", label: "~/Library/LaunchAgents/ mode" },
  { key: "sleepwalkerState", label: "Sleepwalker install state" },
];

export default async function DiagnosticsPage() {
  const snapshot = await gatherDiagnostics();
  // Pre-format on the server so the client island never imports the lib —
  // formatAsIssueBody owns the explicit field allowlist (Pitfall 1 defense)
  // and lives next to the probe surface for easy auditing. Keeping it
  // server-side also keeps node:fs / node:os / node:path / node:child_process
  // out of the client bundle (Next 15 webpack rejects `node:*` schemes in
  // client code; same class of fix applied to preview-panel.tsx in Plan 03-08).
  const issueBody = formatAsIssueBody(snapshot);

  return (
    <>
      <PageHeader
        eyebrow={`Last checked: ${snapshot.capturedAt}`}
        title="Diagnostics"
        subtitle="Environment probe for bug reports. No secrets rendered; copy the report into a GitHub issue for faster triage."
      />

      <div className="space-y-1 data text-xs mb-6">
        {ROW_SPEC.map(({ key, label }) => (
          <ProbeRow key={key} label={label} probe={snapshot.rows[key]} />
        ))}
      </div>

      {snapshot.gitSha && (
        <div className="panel p-3 mb-6 text-xs text-moon-400">
          <span className="text-moon-600">Sleepwalker commit:</span>{" "}
          <span className="tabular-nums text-moon-200">{snapshot.gitSha}</span>
        </div>
      )}

      <CopyIssueButton issueBody={issueBody} />

      <p className="text-xs text-moon-600 mt-4 max-w-2xl leading-relaxed">
        No secrets rendered. No env var values, no API keys, no auth token
        state. Only paths, versions, and writability flags.
      </p>
    </>
  );
}

function ProbeRow({ label, probe }: { label: string; probe: Probe }) {
  const notInstalledish =
    !probe.ok &&
    (probe.error === "not on PATH" || probe.error.startsWith("not installed"));
  const Icon = probe.ok ? CheckCircle2 : notInstalledish ? AlertCircle : XCircle;
  const iconClass = probe.ok ? "text-signal-green" : "text-moon-600";
  const valueClass = probe.ok ? "text-moon-200" : "text-moon-600";
  return (
    <div className="panel p-3 flex items-center gap-3">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <span className="text-moon-400 w-56 shrink-0 truncate">{label}</span>
      <span className={`${valueClass} truncate flex-1 tabular-nums`}>
        {probe.ok ? probe.value : `(${probe.error})`}
      </span>
    </div>
  );
}
