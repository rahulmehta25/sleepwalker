"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Copy, Check } from "lucide-react";
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
      <div className="panel p-8 text-center text-sw-muted">
        <p>No cloud routine bundles found.</p>
        <p className="text-xs font-mono mt-2">Expected at ../routines-cloud/*/config.json</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routines.map((r) => {
        const isExpanded = expanded === r.id;
        return (
          <div key={r.id} className="panel">
            <button
              className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-sw-border/30 transition-colors rounded-lg"
              onClick={() => setExpanded(isExpanded ? null : r.id)}
              aria-expanded={isExpanded}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">{r.name}</span>
                  <TriggerPills triggers={r.triggers} />
                </div>
                <p className="text-sm text-sw-muted">{firstParagraph(r.prompt)}</p>
                <div className="text-xs text-sw-muted mt-2 flex gap-2 flex-wrap">
                  {r.connectors.map((c) => <span key={c} className="pill-muted">{c}</span>)}
                  {r.env_vars.length > 0 && <span className="pill-muted">{r.env_vars.length} env vars</span>}
                  <span className="pill-muted">~{r.approx_runs_per_week}/week</span>
                </div>
              </div>
              <div className="flex-shrink-0 text-sw-muted">
                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-sw-border p-4 space-y-4">
                {!githubConfigured && (
                  <div className="text-xs panel-amber p-2 rounded">
                    <span className="pill-amber">heads up</span> Configure GitHub in Settings before setting up cloud routines.
                  </div>
                )}

                <Section title="Setup">
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-sw-bg border border-sw-border rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto">{r.setup}</pre>
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
      })}
    </div>
  );
}

function TriggerPills({ triggers }: { triggers: CloudRoutine["triggers"] }) {
  return (
    <>
      {triggers.map((t, i) => {
        if (t.type === "schedule") return <span key={i} className="pill-blue font-mono">cron: {t.cron}</span>;
        if (t.type === "github") return <span key={i} className="pill-blue">github: {t.event}</span>;
        if (t.type === "api") return <span key={i} className="pill-blue">api</span>;
        return null;
      })}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-sw-muted uppercase tracking-wide mb-2">{title}</div>
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
      <button onClick={copy} className="absolute top-2 right-2 btn-ghost text-xs flex items-center gap-1 bg-sw-bg border border-sw-border z-10">
        {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
      </button>
      <pre className="text-xs font-mono whitespace-pre-wrap bg-sw-bg border border-sw-border rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto pr-20">{prompt}</pre>
    </div>
  );
}

function firstParagraph(md: string): string {
  const stripped = md.replace(/^#+\s.*$/m, "").trim();
  const para = stripped.split(/\n\s*\n/)[0] ?? "";
  return para.replace(/\n/g, " ").slice(0, 220);
}
