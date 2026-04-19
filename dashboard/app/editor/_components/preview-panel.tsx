"use client";

import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";
import { CronPreview } from "./cron-preview";

// Sticky right-column preview — see .planning/phases/03-editor/03-UI-SPEC.md
// §Grid (lines 220-225) + §Live-preview copy (lines 156-163).
//
// Client-safe display formatting: this component is a "use client" boundary,
// so importing from @/lib/runtime-adapters/slug (which uses node:path +
// node:os) would drag Node built-ins into the client bundle (webpack
// UnhandledSchemeError at build time in Next 15). Because PreviewPanel is
// pure display — not a source of truth for any on-disk identifier — we
// inline the display-only formatters below. The authoritative builders in
// slug.ts remain the write-path source of truth (used by the Server Action
// and adapters); the strings produced here must match their output.
//
// Validation: we use a LOCAL slug regex check that mirrors SLUG_REGEX in
// slug.ts line 26 (^[a-z][a-z0-9-]{0,63}$). Mid-keystroke invalid slugs
// render the PLACEHOLDER instead of a malformed preview.

interface Props {
  runtime: Runtime | "";
  slug: string;
  schedule: string;
  healthStatus: HealthStatus | null;
}

const PLACEHOLDER = "—";
const CLIENT_SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

// Client-safe mirror of toBundleDir() — see slug.ts lines 108-118. The
// server builder uses path.join which emits OS-native separators; we display
// forward slashes per UI-SPEC line 160.
function clientBundleDir(runtime: Runtime, slug: string): string {
  const dirName =
    runtime === "claude-desktop"
      ? "routines-local"
      : runtime === "claude-routines"
        ? "routines-cloud"
        : `routines-${runtime}`;
  return `${dirName}/${slug}`;
}

function bundlePathDisplay(runtime: Runtime | "", slug: string): string {
  if (!runtime || !slug) return PLACEHOLDER;
  if (!CLIENT_SLUG_REGEX.test(slug)) return PLACEHOLDER;
  return `${clientBundleDir(runtime, slug)}/`;
}

function plistPathDisplay(runtime: Runtime | "", slug: string): string | null {
  // Per UI-SPEC line 161: plist only shown for local launchd runtimes.
  if (runtime !== "codex" && runtime !== "gemini") return null;
  if (!slug) return PLACEHOLDER;
  if (!CLIENT_SLUG_REGEX.test(slug)) return PLACEHOLDER;
  // UI-SPEC line 161: `~/Library/LaunchAgents/com.sleepwalker.{runtime}.{slug}.plist`
  return `~/Library/LaunchAgents/com.sleepwalker.${runtime}.${slug}.plist`;
}

// Marker tag format: [sleepwalker:<runtime>/<slug>] — UI-SPEC line 162.
function markerTagDisplay(runtime: Runtime | "", slug: string): string {
  if (!runtime || !slug) return PLACEHOLDER;
  if (!CLIENT_SLUG_REGEX.test(slug)) return PLACEHOLDER;
  return `[sleepwalker:${runtime}/${slug}]`;
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
