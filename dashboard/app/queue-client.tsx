"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [direction, setDirection] = useState<1 | -1>(1);

  const current = pending[idx];

  async function decide(action: "approve" | "reject" | "dismiss") {
    if (!current || busy) return;
    setBusy(true);
    setDirection(action === "approve" ? 1 : -1);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, action, source: current.source }),
      });
      if (!res.ok) throw new Error("update failed");
      const newStatus = action === "approve" ? "approved" as const : "rejected" as const;
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="space-y-10"
      >
        <div className="panel p-16 text-center">
          <Bot className="w-8 h-8 mx-auto mb-4 text-moon-600" />
          <h2 className="display text-2xl text-moon-50 mb-1">Inbox zero</h2>
          <p className="text-moon-400 text-sm max-w-md mx-auto leading-relaxed">
            All overnight actions completed without intervention, or no routines have run yet.
            Visit <a className="text-dawn-400 underline underline-offset-4 decoration-dawn-400/40 hover:decoration-dawn-400" href="/routines">Routines</a> to enable a fleet member.
          </p>
        </div>
        {recent.length > 0 && <RecentList recent={recent} />}
      </motion.div>
    );
  }

  const isCloud = current.source === "cloud";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="space-y-10"
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.article
          key={current.id}
          custom={direction}
          initial={{ opacity: 0, x: direction * 24, scale: 0.99 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -direction * 24, scale: 0.99 }}
          transition={{ duration: 0.32, ease: [0.2, 0.65, 0.3, 0.95] }}
          className="panel-raised p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 label">
              <Clock className="w-3 h-3" />
              <span className="data text-moon-400 normal-case tracking-normal">{new Date(current.ts).toLocaleString()}</span>
            </div>
            <div className="data text-moon-600 text-xs tabular-nums">
              {String(idx + 1).padStart(2, "0")} / {String(pending.length).padStart(2, "0")}
            </div>
          </div>

          <div className="flex items-center gap-2.5 mb-5 flex-wrap">
            {isCloud
              ? <span className="flex items-center gap-1.5 text-moon-50"><Cloud className="w-4 h-4 text-aurora-400" /><span className="font-medium tracking-tight">{current.fleet}</span></span>
              : <span className="flex items-center gap-1.5 text-moon-50"><HardDrive className="w-4 h-4 text-dawn-400" /><span className="font-medium tracking-tight">{current.fleet}</span></span>
            }
            <span className={isCloud ? "pill-aurora" : "pill bg-signal-green/10 text-signal-green border border-signal-green/20"}>
              {isCloud ? "cloud" : "local"}
            </span>
            {current.reversibility && <ReversibilityPill r={current.reversibility} />}
          </div>

          <ActionDetail entry={current} />

          <div className="mt-8 flex items-center justify-between border-t border-ink-600/60 pt-5">
            <div className="flex gap-1">
              <button
                className="btn-ghost p-2 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={idx === 0 || busy}
                onClick={() => { setDirection(-1); setIdx((i) => Math.max(0, i - 1)); }}
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="btn-ghost p-2 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={idx >= pending.length - 1 || busy}
                onClick={() => { setDirection(1); setIdx((i) => Math.min(pending.length - 1, i + 1)); }}
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              {isCloud ? (
                <>
                  <button className="btn-ghost border border-ink-600" onClick={() => decide("dismiss")} disabled={busy} title="Hide from this view (PR stays open in GitHub)">
                    <EyeOff className="w-4 h-4 mr-1.5" /> Dismiss
                  </button>
                  <button className="btn-primary" onClick={openExternal} disabled={busy}>
                    <ExternalLink className="w-4 h-4 mr-1.5" /> Open PR
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-danger" onClick={() => decide("reject")} disabled={busy}>
                    <X className="w-4 h-4 mr-1.5" /> Reject
                  </button>
                  <button className="btn-primary" onClick={() => decide("approve")} disabled={busy}>
                    <Check className="w-4 h-4 mr-1.5" /> Approve
                  </button>
                </>
              )}
            </div>
          </div>

          {isCloud && (
            <p className="text-xs text-moon-600 mt-4 leading-relaxed">
              Cloud actions live as GitHub PRs. <em className="text-moon-400 not-italic">Open PR</em> takes you to GitHub to merge or close;
              {" "}<em className="text-moon-400 not-italic">Dismiss</em> only hides from this view.
            </p>
          )}
        </motion.article>
      </AnimatePresence>

      {recent.length > 0 && <RecentList recent={recent} />}
    </motion.div>
  );
}

function ActionDetail({ entry }: { entry: QueueEntry }) {
  if (entry.source === "cloud" && entry.payload) {
    const { title, body, repo, branch, author, additions, deletions, changed_files } = entry.payload as Record<string, string | number | undefined>;
    return (
      <div className="space-y-4">
        <div>
          <div className="label mb-1">Repository</div>
          <div className="data text-sm text-moon-50">{repo as string}</div>
        </div>
        <div>
          <div className="label mb-1">Title</div>
          <div className="text-base text-moon-50 leading-snug">{title as string}</div>
        </div>
        {body && (
          <div>
            <div className="label mb-1">Body</div>
            <div className="text-[13px] text-moon-200 leading-relaxed whitespace-pre-wrap data bg-ink-900/60 border border-ink-600/60 rounded-lg p-4 max-h-60 overflow-y-auto">{body as string}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs text-moon-400">
          <span className="pill-muted">{branch as string}</span>
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
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Tool</div>
          <div className="data text-sm text-moon-50">{entry.tool}</div>
        </div>
        <div>
          <div className="label mb-1">Arguments</div>
          <pre className="data text-xs text-moon-200 bg-ink-900/60 border border-ink-600/60 rounded-lg p-4 overflow-x-auto">{JSON.stringify(entry.args, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (entry.kind && entry.payload) {
    return (
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Kind</div>
          <div className="data text-sm text-moon-50">{entry.kind}</div>
        </div>
        <div>
          <div className="label mb-1">Payload</div>
          <pre className="data text-xs text-moon-200 bg-ink-900/60 border border-ink-600/60 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">{JSON.stringify(entry.payload, null, 2)}</pre>
        </div>
      </div>
    );
  }

  return <pre className="data text-xs">{JSON.stringify(entry, null, 2)}</pre>;
}

function ReversibilityPill({ r }: { r: "green" | "yellow" | "red" }) {
  const cls = r === "green" ? "pill-green" : r === "yellow" ? "pill-amber" : "pill-red";
  const label = r === "green" ? "read-only" : r === "yellow" ? "reversible" : "irreversible";
  return <span className={cls}>{label}</span>;
}

function RecentList({ recent }: { recent: QueueEntry[] }) {
  return (
    <section>
      <h2 className="label mb-4">Recently decided</h2>
      <div className="space-y-1">
        {recent.map((e) => (
          <div key={e.id} className="panel p-3 flex items-center gap-3 text-sm">
            <span className={e.status === "approved" ? "pill-green" : "pill-red"}>{e.status}</span>
            <span className="text-moon-600 text-[10px] data uppercase tracking-wider">{e.source ?? "local"}</span>
            <span className="text-moon-200 tracking-tight">{e.fleet}</span>
            <span className="data text-moon-600 text-xs truncate">{e.tool ?? e.kind}</span>
            <span className="data text-moon-600 text-xs ml-auto whitespace-nowrap tabular-nums">{new Date(e.ts).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
