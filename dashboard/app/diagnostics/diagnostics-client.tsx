"use client";

/**
 * CopyIssueButton — client island for the "Copy as GitHub issue body" action
 * on the /diagnostics page. Wraps navigator.clipboard.writeText in a user-
 * gesture handler (button onClick) so no auto-copy ever happens on page load
 * (threat-model T-06-02-04 mitigation).
 *
 * Receives the pre-formatted issue body as a string prop so this file does NOT
 * transitively import @/lib/diagnostics (which pulls in node:fs / node:os /
 * node:path / node:child_process / node:util for the probe surface). Next.js'
 * client bundler rejects `node:*` schemes in client code; this prop-first
 * shape keeps the client bundle free of server-only imports while preserving
 * formatAsIssueBody's EXPLICIT FIELD ALLOWLIST (Pitfall 1 defense) at the lib
 * boundary — the Server Component calls the formatter at SSR time and hands
 * the opaque string down.
 *
 * On secure origins (localhost:4001 qualifies; production would require
 * HTTPS) the clipboard API resolves. On blocked origins / permission-denied
 * cases we silently no-op — the user can screenshot the server-rendered
 * rows as a fallback instead of seeing a broken button.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyIssueButton({ issueBody }: { issueBody: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(issueBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API blocked (non-secure origin / permission denied /
      // focus lost during copy). Silently no-op; user can screenshot the
      // rendered rows as fallback. No thrown error reaches React.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-aurora-500/10 text-aurora-300 border border-aurora-500/30 hover:bg-aurora-500/20 transition-colors text-xs"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>{copied ? "Copied!" : "Copy as GitHub issue body"}</span>
    </button>
  );
}
