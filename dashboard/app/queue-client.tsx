"use client";

import { useState } from "react";
import { Check, X, ChevronLeft, ChevronRight, Clock, Bot, ExternalLink, EyeOff, Cloud, HardDrive } from "lucide-react";
import type { QueueEntry } from "@/lib/queue";

export function QueueClient({
  initialPending,
  initialRecent,
}: {
  initialPending: QueueEntry[];
  initialRecent: QueueEntry[];
}) {
  const [pending, setPending] = useState<QueueEntry[]>(initialPending);
  const [recent, setRecent] = useState<QueueEntry[]>(initialRecent);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = pending[idx];

  async function decide(action: "approve" | "reject" | "dismiss") {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, action, source: current.source }),
      });
      if (!res.ok) throw new Error("update failed");
      const newStatus =
        action === "approve" ? ("approved" as const) :
        action === "reject"  ? ("rejected" as const) :
                               ("rejected" as const);
      const updated = { ...current, status: newStatus };
      setPending((p) => p.filter((e) => e.id !== current.id));
      setRecent((r) => [updated, ...r].slice(0, 20));
      setIdx((i) => Math.min(i, Math.max(0, pending.length - 2)));
    } finally {
      setBusy(false);
    }
  }

  function openExternal() {
    const url = current?.payload?.pr_url as string | undefined;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  if (pending.length === 0) {
    return (
      <div className="space-y-8">
        <div className="panel p-12 text-center">
          <Bot className="w-10 h-10 mx-auto mb-3 text-sw-muted" />
          <h2 className="text-lg font-medium mb-1">Nothing to review</h2>
          <p className="text-sw-muted text-sm max-w-md mx-auto">
            All overnight actions completed without intervention, or no routines have run yet.
            Visit <a className="text-sw-accent underline" href="/routines">Routines</a> to enable a fleet member.
          </p>
        </div>
        {recent.length > 0 && <RecentList recent={recent} />}
      </div>
    );
  }

  const isCloud = current.source === "cloud";

  return (
    <div className="space-y-8">
      <div className="panel p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs text-sw-muted">
            <Clock className="w-3.5 h-3.5" />
            {new Date(current.ts).toLocaleString()}
          </div>
          <div className="text-xs text-sw-muted font-mono">
            {idx + 1} / {pending.length}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {isCloud ? (
            <span className="flex items-center gap-1.5 text-sw-text"><Cloud className="w-4 h-4 text-sw-accent" /><span className="font-medium">{current.fleet}</span></span>
          ) : (
            <span className="flex items-center gap-1.5 text-sw-text"><HardDrive className="w-4 h-4 text-sw-accent" /><span className="font-medium">{current.fleet}</span></span>
          )}
          <span className={isCloud ? "pill bg-sky-500/10 text-sky-300 border border-sky-500/20" : "pill bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"}>
            {isCloud ? "cloud" : "local"}
          </span>
          {current.reversibility && <ReversibilityPill r={current.reversibility} />}
        </div>

        <ActionDetail entry={current} />

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1">
            <button
              className="btn-ghost p-2 rounded-md"
              disabled={idx === 0 || busy}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              aria-label="Previous"
              title="Previous action"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              className="btn-ghost p-2 rounded-md"
              disabled={idx >= pending.length - 1 || busy}
              onClick={() => setIdx((i) => Math.min(pending.length - 1, i + 1))}
              aria-label="Next"
              title="Next action"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            {isCloud ? (
              <>
                <button className="btn-ghost border border-sw-border" onClick={() => decide("dismiss")} disabled={busy} title="Hide from this view (PR stays open in GitHub)">
                  <EyeOff className="w-4 h-4 inline mr-1" /> Dismiss
                </button>
                <button className="btn-primary" onClick={openExternal} disabled={busy}>
                  <ExternalLink className="w-4 h-4 inline mr-1" /> Open PR
                </button>
              </>
            ) : (
              <>
                <button className="btn-danger" onClick={() => decide("reject")} disabled={busy}>
                  <X className="w-4 h-4 inline mr-1" /> Reject
                </button>
                <button className="btn-primary" onClick={() => decide("approve")} disabled={busy}>
                  <Check className="w-4 h-4 inline mr-1" /> Approve
                </button>
              </>
            )}
          </div>
        </div>

        {isCloud && (
          <p className="text-xs text-sw-muted mt-4 border-t border-sw-border pt-3">
            Cloud actions live as GitHub PRs. <em>Approve</em> means clicking through to GitHub and merging; <em>Dismiss</em> only hides from this view.
          </p>
        )}
      </div>

      {recent.length > 0 && <RecentList recent={recent} />}
    </div>
  );
}

function ActionDetail({ entry }: { entry: QueueEntry }) {
  if (entry.source === "cloud" && entry.payload) {
    const { pr_url, title, body, repo, branch, author, additions, deletions, changed_files } = entry.payload as Record<string, string | number | undefined>;
    return (
      <div className="space-y-3">
        <div>
          <div className="text-sw-muted text-xs uppercase tracking-wide">Repository</div>
          <div className="font-mono text-sm">{repo as string}</div>
        </div>
        <div>
          <div className="text-sw-muted text-xs uppercase tracking-wide">Title</div>
          <div className="text-base">{title as string}</div>
        </div>
        {body && (
          <div>
            <div className="text-sw-muted text-xs uppercase tracking-wide">Body</div>
            <div className="text-sm text-sw-text whitespace-pre-wrap font-mono bg-sw-bg border border-sw-border rounded-md p-3 max-h-60 overflow-y-auto">{body as string}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs text-sw-muted">
          <span className="pill-muted font-mono">{branch as string}</span>
          <span className="pill-muted">@{author as string}</span>
          {changed_files !== undefined && <span className="pill-muted">{changed_files as number} files</span>}
          {additions !== undefined && <span className="pill-green">+{additions as number}</span>}
          {deletions !== undefined && <span className="pill-red">-{deletions as number}</span>}
        </div>
      </div>
    );
  }

  if (entry.tool && entry.args) {
    return (
      <div className="space-y-2">
        <div className="text-sw-muted text-xs uppercase tracking-wide">Tool</div>
        <div className="font-mono text-sm">{entry.tool}</div>
        <div className="text-sw-muted text-xs uppercase tracking-wide mt-3">Arguments</div>
        <pre className="font-mono text-xs bg-sw-bg border border-sw-border rounded-md p-3 overflow-x-auto">
          {JSON.stringify(entry.args, null, 2)}
        </pre>
      </div>
    );
  }

  if (entry.kind && entry.payload) {
    return (
      <div className="space-y-2">
        <div className="text-sw-muted text-xs uppercase tracking-wide">Kind</div>
        <div className="font-mono text-sm">{entry.kind}</div>
        <div className="text-sw-muted text-xs uppercase tracking-wide mt-3">Payload</div>
        <pre className="font-mono text-xs bg-sw-bg border border-sw-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      </div>
    );
  }

  return <pre className="font-mono text-xs">{JSON.stringify(entry, null, 2)}</pre>;
}

function ReversibilityPill({ r }: { r: "green" | "yellow" | "red" }) {
  const cls = r === "green" ? "pill-green" : r === "yellow" ? "pill-yellow" : "pill-red";
  const label = r === "green" ? "read-only" : r === "yellow" ? "reversible" : "irreversible";
  return <span className={cls}>{label}</span>;
}

function RecentList({ recent }: { recent: QueueEntry[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-sw-muted mb-3">Recently decided</h2>
      <div className="space-y-1">
        {recent.map((e) => (
          <div key={e.id} className="panel p-3 flex items-center gap-3 text-sm">
            <span className={e.status === "approved" ? "pill-green" : "pill-red"}>{e.status}</span>
            <span className="text-sw-muted text-xs">{e.source ?? "local"}</span>
            <span className="text-sw-muted">{e.fleet}</span>
            <span className="text-sw-muted font-mono text-xs truncate">{e.tool ?? e.kind}</span>
            <span className="text-sw-muted text-xs ml-auto whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
