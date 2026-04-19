"use client";

import { useEffect, useState } from "react";

// Exact UI-SPEC copy — .planning/phases/03-editor/03-UI-SPEC.md
// §Draft-recovery banner (lines 276-287). localStorage key
// `sleepwalker.draft.v1` is contract-locked (UI-SPEC line 297).
//
// Pitfall #3 guard (03-RESEARCH.md): window / localStorage is accessed
// ONLY inside useEffect so Next.js SSR can render this component without
// a "window is not defined" crash. The first client render returns null;
// the post-hydration effect promotes to the banner if a draft is found.

export interface DraftFields {
  name: string;
  slug: string;
  runtime: string;
  prompt: string;
  schedule: string;
  reversibility: string;
  budget: number | string;
}

interface StoredDraft {
  version: number;
  updatedAt: string;
  fields: DraftFields;
}

interface Props {
  onRestore: (fields: DraftFields) => void;
  onStartFresh: () => void;
}

const STORAGE_KEY = "sleepwalker.draft.v1";

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "recently";
  const mins = Math.max(1, Math.floor((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function DraftRecoveryBanner({ onRestore, onStartFresh }: Props) {
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Pitfall #3 SSR guard — localStorage only exists in the browser.
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      if (
        parsed &&
        parsed.version === 1 &&
        parsed.fields &&
        typeof parsed.updatedAt === "string"
      ) {
        setDraft(parsed as StoredDraft);
      }
    } catch {
      // Malformed JSON — silently ignore (UI-SPEC: never silent-restore,
      // but also never surface corrupt state to the user).
    }
  }, []);

  if (!draft || dismissed) return null;

  const handleRestore = () => {
    onRestore(draft.fields);
    setDismissed(true);
  };

  const handleStartFresh = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    onStartFresh();
    setDismissed(true);
  };

  const subtitleFields = [
    draft.fields.name || "Unnamed routine",
    draft.fields.runtime || "no runtime",
    draft.fields.slug || "no slug",
  ].join(" · ");

  return (
    <div className="panel-raised border border-aurora-400/30 p-4 mb-6 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          You have an unsaved draft from {relativeTime(draft.updatedAt)}.
        </p>
        <p className="text-xs text-moon-400">{subtitleFields}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost text-aurora-400"
          onClick={handleRestore}
        >
          Restore draft
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={handleStartFresh}
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}
