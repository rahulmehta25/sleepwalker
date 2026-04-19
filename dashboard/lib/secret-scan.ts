// dashboard/lib/secret-scan.ts
//
// Pure utility. Imported by BOTH the editor-client.tsx 250ms-debounced
// preview scan AND the server-authoritative scan inside actions.ts
// saveRoutine. Never throws. Pitfall #5 (Client/Server Scan Drift) is
// defeated by construction — there is exactly one scanner module.
//
// Authoritative pattern source: ./secret-patterns.ts (SECRET_PATTERNS).

import { SECRET_PATTERNS } from "./secret-patterns";

export interface SecretMatch {
  patternName: string;
  line: number;
  column: number;
  matched: string;
  description: string;
}

export function scanForSecrets(text: string): SecretMatch[] {
  if (!text) return [];
  const matches: SecretMatch[] = [];

  for (const pattern of SECRET_PATTERNS) {
    // Clone the regex per-scan so lastIndex state is local (SECRET_PATTERNS
    // is module-scope and shared across callers — stateful /g regex on a
    // shared instance would corrupt concurrent scans).
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const idx = m.index;
      const before = text.slice(0, idx);
      const line = (before.match(/\n/g)?.length ?? 0) + 1;
      const lastNl = before.lastIndexOf("\n");
      // column is 1-indexed: when lastNl === -1 (line 1), column = idx + 1.
      const column = idx - lastNl;
      matches.push({
        patternName: pattern.name,
        line,
        column,
        matched: m[0],
        description: pattern.description,
      });
      // Guard against zero-width matches causing infinite loops (none of the
      // shipped patterns are zero-width, but this is a cheap safety belt).
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  matches.sort((a, b) => a.line - b.line || a.column - b.column);
  return matches;
}
