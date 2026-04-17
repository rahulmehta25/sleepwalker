"use client";

import { useState } from "react";
import { Save, Trash2, KeyRound, Plus, X } from "lucide-react";
import type { Settings, Policy } from "@/lib/settings";
import type { Routine } from "@/lib/routines";

const POLICIES: Policy[] = ["strict", "balanced", "yolo"];

export function SettingsClient({
  initial,
  tokenSet,
  routines,
}: {
  initial: Settings;
  tokenSet: boolean;
  routines: Routine[];
}) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [tokenPresent, setTokenPresent] = useState(tokenSet);
  const [tokenInput, setTokenInput] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setBusy(false);
    }
  }

  async function saveToken() {
    if (!tokenInput.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      if (res.ok) {
        setTokenPresent(true);
        setTokenInput("");
        setSavedAt(new Date().toLocaleTimeString());
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearToken() {
    setBusy(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: null }),
      });
      setTokenPresent(false);
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setBusy(false);
    }
  }

  async function pingGithub() {
    setPingResult("…");
    const res = await fetch("/api/settings?action=ping-github");
    const data = await res.json();
    setPingResult(data.ok ? `ok — authenticated as ${data.user}` : `error — ${data.error}`);
  }

  function addRepo() {
    const trimmed = newRepo.trim();
    if (!trimmed) return;
    if (!/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
      alert("Format: owner/repo");
      return;
    }
    setSettings((s) => ({ ...s, tracked_repos: [...new Set([...s.tracked_repos, trimmed])] }));
    setNewRepo("");
  }

  function removeRepo(repo: string) {
    setSettings((s) => ({ ...s, tracked_repos: s.tracked_repos.filter((r) => r !== repo) }));
  }

  return (
    <div className="space-y-8">
      {savedAt && <div className="pill-green inline-block">saved at {savedAt}</div>}

      <Section title="Sleep window" desc="Outside this window, hooks operate in interactive mode (no defer, no budget cap).">
        <div className="flex items-center gap-3">
          <Field label="Start hour (24h)">
            <input
              type="number"
              min={0}
              max={23}
              value={settings.sleep_window.start_hour}
              onChange={(e) => setSettings((s) => ({ ...s, sleep_window: { ...s.sleep_window, start_hour: Number(e.target.value) } }))}
              className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm w-20"
            />
          </Field>
          <span className="text-moon-400">→</span>
          <Field label="End hour (24h)">
            <input
              type="number"
              min={0}
              max={23}
              value={settings.sleep_window.end_hour}
              onChange={(e) => setSettings((s) => ({ ...s, sleep_window: { ...s.sleep_window, end_hour: Number(e.target.value) } }))}
              className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm w-20"
            />
          </Field>
        </div>
      </Section>

      <Section title="GitHub" desc="Personal access token for cloud-routine PR polling. Stored at ~/.sleepwalker/github-token (mode 600).">
        {tokenPresent ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="pill-green">token configured</span>
            <button className="btn-ghost border border-ink-600" onClick={pingGithub} disabled={busy}>
              Test connection
            </button>
            <button className="btn-danger" onClick={clearToken} disabled={busy}>
              <Trash2 className="w-4 h-4 inline mr-1" /> Clear token
            </button>
            {pingResult && <span className="text-xs text-moon-400 ml-2">{pingResult}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="password"
              placeholder="ghp_..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm font-mono flex-1 max-w-md"
            />
            <button className="btn-primary" onClick={saveToken} disabled={busy || !tokenInput.trim()}>
              <KeyRound className="w-4 h-4 inline mr-1" /> Save token
            </button>
          </div>
        )}
        <p className="text-xs text-moon-400 mt-3">
          Needs <code>repo</code> scope for private repos, <code>public_repo</code> only for public. Generate at{" "}
          <a className="text-dawn-400 underline" href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/tokens/new</a>.
        </p>
      </Section>

      <Section title="Tracked repos" desc="Cloud-fleet PR polling targets. Format: owner/repo">
        <div className="space-y-2">
          {settings.tracked_repos.length === 0 && (
            <p className="text-sm text-moon-400">No repos tracked yet.</p>
          )}
          {settings.tracked_repos.map((r) => (
            <div key={r} className="flex items-center justify-between panel p-2">
              <span className="font-mono text-sm">{r}</span>
              <button className="btn-ghost p-1" onClick={() => removeRepo(r)} aria-label="Remove">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="owner/repo"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRepo()}
              className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm font-mono flex-1 max-w-md"
            />
            <button className="btn-ghost border border-ink-600" onClick={addRepo}>
              <Plus className="w-4 h-4 inline mr-1" /> Add
            </button>
          </div>
        </div>
      </Section>

      <Section title="Per-fleet policies and budgets" desc="strict = defer all writes; balanced = allow reversible, defer external; yolo = allow everything.">
        <div className="space-y-2">
          {routines.map((r) => {
            const fleet = r.id.replace(/^sleepwalker-/, "");
            const policy = settings.policies[fleet] ?? "balanced";
            const budget = settings.budgets[fleet] ?? 50000;
            return (
              <div key={r.id} className="panel p-3 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs flex-1 min-w-0 truncate">{fleet}</span>
                <select
                  value={policy}
                  onChange={(e) => setSettings((s) => ({ ...s, policies: { ...s.policies, [fleet]: e.target.value as Policy } }))}
                  className="bg-ink-900 border border-ink-600 rounded-md px-2 py-1 text-xs"
                >
                  {POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={budget}
                  onChange={(e) => setSettings((s) => ({ ...s, budgets: { ...s.budgets, [fleet]: Number(e.target.value) } }))}
                  className="bg-ink-900 border border-ink-600 rounded-md px-2 py-1 text-xs w-28 font-mono"
                />
                <span className="text-xs text-moon-400">tok</span>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="border-t border-ink-600 pt-6">
        <button className="btn-primary" onClick={save} disabled={busy}>
          <Save className="w-4 h-4 inline mr-1" /> Save changes
        </button>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      <p className="text-xs text-moon-400 mb-3">{desc}</p>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-moon-400">{label}</span>
      {children}
    </label>
  );
}
