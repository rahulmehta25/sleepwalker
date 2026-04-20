"use client";

/**
 * DiffStatPanel — renders the `git diff --cached --stat` summary returned by
 * `previewSaveToRepoAction` (Plan 04-05) inside the Save-to-repo modal's
 * Stage 1 (Review). Purely presentational: consumes `{files, totals}` and
 * renders the UI-SPEC-locked row format `{path}  +{added} −{removed}`.
 *
 * UI-SPEC anchors:
 *   - Diff panel empty state copy (line 204): `No staged changes — this bundle
 *     is already in sync with HEAD.`
 *   - Diff panel non-empty heading (line 205): `{n} file{s} changed — {added}
 *     additions, {removed} deletions`
 *   - Diff row format (line 206): `{path}   +{added} −{removed}` (mono,
 *     `text-signal-green` + `text-signal-red` counts)
 *   - Layout contract (lines 331-336): `.panel max-h-64 overflow-auto p-4
 *     font-mono text-xs`
 *
 * The minus glyph is the Unicode MINUS SIGN (U+2212, `−`) to match the UI-SPEC
 * verbatim — not an ASCII hyphen.
 */

export interface DiffStatFile {
  path: string;
  added: number;
  removed: number;
}

export interface DiffStatTotals {
  filesChanged: number;
  added: number;
  removed: number;
}

interface DiffStatPanelProps {
  files: DiffStatFile[];
  totals: DiffStatTotals;
}

export function DiffStatPanel({ files, totals }: DiffStatPanelProps) {
  if (totals.filesChanged === 0) {
    return (
      <div
        className="panel p-4 text-sm text-moon-400 text-center"
        data-testid="diff-stat-panel-empty"
      >
        No staged changes — this bundle is already in sync with HEAD.
      </div>
    );
  }

  const plural = totals.filesChanged === 1 ? "" : "s";

  return (
    <div
      className="panel max-h-64 overflow-auto p-4 font-mono text-xs"
      data-testid="diff-stat-panel"
    >
      <div className="text-moon-300 mb-2">
        {totals.filesChanged} file{plural} changed — {totals.added} additions,{" "}
        {totals.removed} deletions
      </div>
      {files.map((f) => (
        <div
          key={f.path}
          className="grid grid-cols-[1fr_auto] gap-4 py-0.5"
          data-testid="diff-stat-row"
        >
          <span className="truncate">{f.path}</span>
          <span className="flex items-center gap-2">
            <span className="text-signal-green">+{f.added}</span>
            <span className="text-signal-red">−{f.removed}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
