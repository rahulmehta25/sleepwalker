"use client";

import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";
import {
  toBundleDir,
  toMarkerTag,
  toPlistPath,
} from "@/lib/runtime-adapters/slug";
import { CronPreview } from "./cron-preview";

// Sticky right-column preview — see .planning/phases/03-editor/03-UI-SPEC.md
// §Grid (lines 220-225) + §Live-preview copy (lines 156-163).
//
// Safety note: toBundleDir / toPlistPath / toMarkerTag all throw on invalid
// slug (Phase 2 CONTEXT.md line 43: assertValidSlug is a programmer-bug
// guard). During in-flight typing the slug is briefly invalid, so every
// builder call runs through safe() which returns the fallback placeholder
// instead of unmounting the panel. Display forward slashes so "routines-
// codex/morning-brief/" matches the UI-SPEC live-preview copy (path.join
// uses platform separator — not desired for display text).

interface Props {
  runtime: Runtime | "";
  slug: string;
  schedule: string;
  healthStatus: HealthStatus | null;
}

const PLACEHOLDER = "—";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function bundlePathDisplay(runtime: Runtime | "", slug: string): string {
  if (!runtime || !slug) return PLACEHOLDER;
  // toBundleDir throws on invalid slug; we render the same shape using
  // forward slashes so the preview copy matches UI-SPEC line 160 exactly
  // (path.join would produce backslashes on Windows — the dashboard is
  // macOS-targeted but forward-slash display is contract).
  return safe(() => {
    const dir = toBundleDir(runtime, slug);
    return `${dir.replaceAll("\\", "/")}/`;
  }, PLACEHOLDER);
}

function plistPathDisplay(runtime: Runtime | "", slug: string): string | null {
  // Per UI-SPEC line 161: plist only shown for local launchd runtimes.
  if (runtime !== "codex" && runtime !== "gemini") return null;
  if (!slug) return PLACEHOLDER;
  return safe(() => {
    const abs = toPlistPath(runtime, slug);
    // Collapse absolute $HOME path to ~ for readable display.
    const home = typeof process !== "undefined" ? process.env.HOME : undefined;
    if (home && abs.startsWith(home)) return `~${abs.slice(home.length)}`;
    return abs;
  }, PLACEHOLDER);
}

// Marker tag format: [sleepwalker:<runtime>/<slug>] — see UI-SPEC line 162.
// The toMarkerTag builder (imported above) produces the exact string at
// runtime. assertValidSlug throws on invalid slug, so we wrap in safe().
function markerTagDisplay(runtime: Runtime | "", slug: string): string {
  if (!runtime || !slug) return PLACEHOLDER;
  return safe(() => toMarkerTag(runtime, slug), PLACEHOLDER);
}

export function PreviewPanel({
  runtime,
  slug,
  schedule,
  healthStatus,
}: Props) {
  const plist = plistPathDisplay(runtime, slug);

  return (
    <aside className="w-80 sticky top-10 panel p-4 flex flex-col gap-3">
      <div>
        <div className="label mb-1">BUNDLE PATH</div>
        <div className="data text-xs text-moon-400">
          {bundlePathDisplay(runtime, slug)}
        </div>
      </div>
      {plist !== null && (
        <div>
          <div className="label mb-1">PLIST PATH</div>
          <div className="data text-xs text-moon-600 break-all">{plist}</div>
        </div>
      )}
      <div>
        <div className="label mb-1">MARKER TAG</div>
        <div className="data text-xs text-moon-600">
          {markerTagDisplay(runtime, slug)}
        </div>
      </div>
      <div>
        <div className="label mb-1">SCHEDULE</div>
        <CronPreview expression={schedule} />
      </div>
      {healthStatus && (
        <div>
          <div className="label mb-1">HEALTH</div>
          <div className="text-xs">
            {healthStatus.available ? (
              <span className="pill-green">Ready</span>
            ) : (
              <span className="pill-amber">
                {healthStatus.reason ?? "Unavailable"}
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
