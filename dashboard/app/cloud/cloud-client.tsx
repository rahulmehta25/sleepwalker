"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Copy, Check, Zap, KeyRound, Trash2, Loader2 } from "lucide-react";
import type { CloudRoutine } from "@/lib/cloud";

export function CloudClient({
  routines,
  githubConfigured,
}: {
  routines: CloudRoutine[];
  githubConfigured: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (routines.length === 0) {
    return (
      <div className="panel p-8 text-center text-moon-400">
        <p>No cloud routine bundles found.</p>
        <p className="text-xs font-mono mt-2">Expected at ../routines-cloud/*/config.json</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routines.map((r) => (
        <CloudCard
          key={r.id}
          routine={r}
          isExpanded={expanded === r.id}
          onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
          githubConfigured={githubConfigured}
        />
      ))}
    </div>
  );
}

function CloudCard({
  routine: r,
  isExpanded,
  onToggle,
  githubConfigured,
}: {
  routine: CloudRoutine;
  isExpanded: boolean;
  onToggle: () => void;
  githubConfigured: boolean;
}) {
  const supportsApi = r.triggers.some((t) => t.type === "api");

  return (
    <div className="panel">
      <button
        className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-ink-600/30 transition-colors rounded-lg"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium">{r.name}</span>
            <TriggerPills triggers={r.triggers} />
          </div>
          <p className="text-sm text-moon-400">{firstParagraph(r.prompt)}</p>
          <div className="text-xs text-moon-400 mt-2 flex gap-2 flex-wrap">
            {r.connectors.map((c) => <span key={c} className="pill-muted">{c}</span>)}
            {r.env_vars.length > 0 && <span className="pill-muted">{r.env_vars.length} env vars</span>}
            <span className="pill-muted">~{r.approx_runs_per_week}/week</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-moon-400">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-ink-600 p-4 space-y-4">
          {!githubConfigured && (
            <div className="text-xs text-moon-200 bg-amber-500/10 border border-amber-500/20 p-2 rounded">
              <span className="pill-amber">heads up</span> Configure GitHub in Settings before setting up cloud routines.
            </div>
          )}

          {supportsApi && <ApiTriggerPanel routineId={r.id} routineName={r.name} />}

          <Section title="Setup">
            <pre className="text-xs whitespace-pre-wrap font-mono bg-ink-900 border border-ink-600 rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto">{r.setup}</pre>
          </Section>

          <Section title="Prompt">
            <PromptCopy prompt={r.prompt} />
          </Section>

          <div className="flex gap-2">
            <a
              className="btn-primary inline-flex items-center"
              href={r.scheduleDeeplink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4 inline mr-1" />
              Open claude.ai/code/routines
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiTriggerPanel({ routineId, routineName }: { routineId: string; routineName: string }) {
  const [configured, setConfigured] = useState(false);
  const [host, setHost] = useState<string | undefined>();
  const [configuredAt, setConfiguredAt] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fireResult, setFireResult] = useState<{ ok?: boolean; sessionUrl?: string; error?: string } | null>(null);

  async function loadStatus() {
    const res = await fetch(`/api/cloud/fire?routineId=${encodeURIComponent(routineId)}`);
    if (res.ok) {
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setHost(data.host);
      setConfiguredAt(data.configuredAt);
      setEditing(!data.configured);
    }
  }

  useEffect(() => { loadStatus(); }, [routineId]);

  async function save() {
    if (!url.trim() || !token.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cloud/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineId, url: url.trim(), token: token.trim() }),
      });
      if (res.ok) {
        setUrl(""); setToken(""); setEditing(false);
        await loadStatus();
      }
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await fetch("/api/cloud/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineId, token: null }),
      });
      setConfigured(false);
      setEditing(true);
    } finally {
      setBusy(false);
    }
  }

  async function fire() {
    setBusy(true);
    setFireResult(null);
    try {
      const res = await fetch("/api/cloud/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineId, text: text.trim() || undefined }),
      });
      const data = await res.json();
      setFireResult(data);
      if (data.ok) setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="API trigger — Run now from this dashboard">
      {configured && !editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="pill-green">configured</span>
            {host && <span className="pill-muted">{host}</span>}
            {configuredAt && (
              <span className="text-xs text-moon-600 data">
                · saved {new Date(configuredAt).toLocaleString()}
              </span>
            )}
            <button className="btn-ghost text-xs ml-auto" onClick={() => setEditing(true)} disabled={busy}>
              <KeyRound className="w-3.5 h-3.5 mr-1" /> Replace
            </button>
            <button className="btn-ghost text-xs text-signal-red" onClick={clear} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
            </button>
          </div>

          <div className="space-y-2">
            <textarea
              placeholder={`Optional context to pass to ${routineName} (alert body, deploy info, etc.). Leave blank to fire with no payload.`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full bg-ink-900 border border-ink-600 rounded-md px-3 py-2 text-sm font-mono leading-relaxed"
            />
            <button className="btn-primary" onClick={fire} disabled={busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Firing…</> : <><Zap className="w-4 h-4 mr-1.5" /> Run now</>}
            </button>
          </div>

          {fireResult && (
            <div className={`text-xs panel p-3 ${fireResult.ok ? "border-signal-green/30" : "border-signal-red/30"}`}>
              {fireResult.ok ? (
                <div className="space-y-1">
                  <div className="text-signal-green">✓ Fired successfully</div>
                  {fireResult.sessionUrl && (
                    <a href={fireResult.sessionUrl} target="_blank" rel="noopener noreferrer" className="text-dawn-400 underline inline-flex items-center gap-1 break-all">
                      Watch session <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-signal-red">✗ {fireResult.error || "Failed"}</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-moon-400">
            From claude.ai/code/routines, edit the routine, expand its API trigger, copy the URL and generate a token. Token is shown once — paste both below.
          </p>
          <input
            type="text"
            placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_.../fire"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-ink-900 border border-ink-600 rounded-md px-3 py-2 text-sm font-mono"
          />
          <input
            type="password"
            placeholder="sk-ant-oat01-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-ink-900 border border-ink-600 rounded-md px-3 py-2 text-sm font-mono"
          />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={busy || !url.trim() || !token.trim()}>
              <KeyRound className="w-4 h-4 mr-1.5" /> Save credentials
            </button>
            {configured && (
              <button className="btn-ghost border border-ink-600" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function TriggerPills({ triggers }: { triggers: CloudRoutine["triggers"] }) {
  return (
    <>
      {triggers.map((t, i) => {
        if (t.type === "schedule") return <span key={i} className="pill-blue font-mono">cron: {t.cron}</span>;
        if (t.type === "github") return <span key={i} className="pill-blue">github: {t.event}</span>;
        if (t.type === "api") return <span key={i} className="pill-blue inline-flex items-center gap-1"><Zap className="w-3 h-3" /> api</span>;
        return null;
      })}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-moon-400 uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

function PromptCopy({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="relative">
      <button onClick={copy} className="absolute top-2 right-2 btn-ghost text-xs flex items-center gap-1 bg-ink-900 border border-ink-600 z-10">
        {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
      </button>
      <pre className="text-xs font-mono whitespace-pre-wrap bg-ink-900 border border-ink-600 rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto pr-20">{prompt}</pre>
    </div>
  );
}

function firstParagraph(md: string): string {
  const stripped = md.replace(/^#+\s.*$/m, "").trim();
  const para = stripped.split(/\n\s*\n/)[0] ?? "";
  return para.replace(/\n/g, " ").slice(0, 220);
}
