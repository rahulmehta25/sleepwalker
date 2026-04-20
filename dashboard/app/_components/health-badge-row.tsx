"use client";

/**
 * HealthBadgeRow — client component mounted on the landing page. Renders
 * four HealthBadge children (one per runtime, locked display order) fed by
 * a 60-second sessionStorage cache of the /api/health/all response.
 *
 * Three cache layers (04-RESEARCH.md Resolved Question #3):
 *   1. sessionStorage TTL (60s) — second mount within the same tab session
 *      within 60s skips the fetch entirely.
 *   2. Window focus refetch — when the user returns to the tab after >= 60s
 *      the cache is invalidated and a fresh fetch fires.
 *   3. Per-badge manual refresh — amber/grey badges expose a RefreshCw
 *      button that clears the cache + bumps the fetch key.
 *
 * SSR-safety (04-PATTERNS.md Pitfall #3 mirrors draft-recovery-banner.tsx):
 * every sessionStorage access is wrapped in typeof-window + try/catch so
 * Next.js server rendering never touches window and Safari Private Mode
 * (quota 0) never crashes the page. On fetch failure the row flips to a
 * grey all-runtimes state with a "retry" reason per 04-UI-SPEC §Failure
 * modes so the user sees actionable feedback rather than a stuck spinner.
 */

import { useCallback, useEffect, useState } from "react";
import { HealthBadge } from "./health-badge";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

const CACHE_KEY = "sleepwalker:health:v1";
const TTL_MS = 60_000;

// Locked UI-SPEC display order (04-UI-SPEC §Landing-page health badge row).
const RUNTIME_ORDER: Runtime[] = [
  "claude-routines",
  "claude-desktop",
  "codex",
  "gemini",
];

interface CacheEntry {
  statuses: HealthStatus[];
  checkedAt: number;
}

function readCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Safari Private Mode / storage-disabled — ignore
  }
}

function clearCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function HealthBadgeRow() {
  const [statuses, setStatuses] = useState<HealthStatus[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const manualRefresh = useCallback(() => {
    clearCache();
    setRefreshKey((k) => k + 1);
  }, []);

  // Fetch-on-mount + cache-first effect. `refreshKey` bumps trigger
  // re-fetches (manual refresh + focus refetch both route through it).
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const cached = readCache();
      if (cached && Date.now() - cached.checkedAt < TTL_MS) {
        setStatuses(cached.statuses);
        return;
      }

      try {
        const res = await fetch("/api/health/all");
        const data = (await res.json()) as {
          statuses: HealthStatus[];
          checkedAt: string;
        };
        if (cancelled) return;
        setStatuses(data.statuses);
        writeCache({ statuses: data.statuses, checkedAt: Date.now() });
      } catch {
        if (cancelled) return;
        // Fetch failure fallback: flip every badge to grey with a
        // retry reason so the user sees actionable feedback instead of
        // a stuck loading pill (04-UI-SPEC §Failure modes line 466).
        setStatuses(
          RUNTIME_ORDER.map((runtime) => ({
            runtime,
            available: false,
            reason: "health check failed · retry",
          })),
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Window-focus refetch: if the tab regains focus and the cache is stale
  // (>60s), bump refreshKey to trigger the fetch effect again.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onFocus() {
      const cached = readCache();
      if (!cached || Date.now() - cached.checkedAt >= TTL_MS) {
        setRefreshKey((k) => k + 1);
      }
    }

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="health-badge-row"
    >
      {RUNTIME_ORDER.map((runtime) => {
        const status = statuses
          ? (statuses.find((s) => s.runtime === runtime) ?? null)
          : null;
        // Manual refresh affordance only on amber/grey per UI-SPEC line 243.
        const needsRefresh =
          status !== null && (!status.available || Boolean(status.warning));
        return (
          <HealthBadge
            key={runtime}
            runtime={runtime}
            status={status}
            onManualRefresh={needsRefresh ? manualRefresh : undefined}
          />
        );
      })}
    </div>
  );
}
