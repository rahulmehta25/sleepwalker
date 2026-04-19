---
phase: 03-editor
plan: 02
subsystem: editor
tags: [editor, security, secrets, gitleaks, scanner]
requires:
  - phase-3-plan-01-bundle-schema (co-Wave-0; no hard dep)
provides:
  - dashboard/lib/secret-patterns.ts::SECRET_PATTERNS
  - dashboard/lib/secret-patterns.ts::SecretPattern
  - dashboard/lib/secret-scan.ts::scanForSecrets
  - dashboard/lib/secret-scan.ts::SecretMatch
affects:
  - dashboard/tests/ (adds one new test file; no existing tests touched)
tech-stack:
  added: []
  patterns:
    - gitleaks-style regex registry with readonly array + typed entries
    - pure result-returning scanner (never throws, empty input returns [])
    - per-scan regex clone defeats /g shared-lastIndex state corruption
    - line/column from backward newline count (1-indexed both axes)
    - shared pattern module imported by client preview AND server scan (Pitfall #5 drift defeated by construction)
key-files:
  created:
    - dashboard/lib/secret-patterns.ts
    - dashboard/lib/secret-scan.ts
    - dashboard/tests/secret-scan.test.ts
  modified:
    - .planning/phases/03-editor/03-VALIDATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - docs/activity_log.md
decisions:
  - Clone each regex per-scan (`new RegExp(src, flags)`) instead of resetting `lastIndex = 0` on the module-scope instance — eliminates subtle concurrent-scan corruption if the editor preview and a server call happen to run in the same Node process
  - Use `text.slice(0, idx).match(/\n/g)?.length ?? 0 + 1` for line number and `idx - lastIndexOf("\n")` for column — 1-indexed on both axes per editor convention
  - Ship 18 `it()` blocks (plan asked for ≥14) — the positive it.each row covers 9 patterns + 2 dedicated blocks (OpenAI infix, PEM header) + 3 negative + 4 location = 18 total assertions firing
  - Keep SECRET_PATTERNS in its own file so `scanForSecrets` is a pure utility with a single type-import surface — future Phase 5 or Phase 6 code can tree-shake either as needed
  - `${VAR}` placeholder test pinned in negative suite — natural prose containing `${OPENAI_API_KEY}` never false-positives; this is the AUTHORING.md escape pattern we tell users to use
metrics:
  duration: ~5 min
  completed: 2026-04-19
  tasks: 2
  files_created: 3
  files_modified: 0 (in dashboard/; STATE/ROADMAP/VALIDATION/activity log are planning metadata)
  test_count_before: 161
  test_count_after: 179
  tests_added: 18
  lines_added: 182 (30 + 52 + 100)
---

# Phase 3 Plan 02: Shared Secret Scanner — SECRET_PATTERNS + scanForSecrets Summary

Pitfall #5 (Client/Server Scan Drift) is defeated by construction: the editor-client
preview and the `saveRoutine` authoritative scan will both import from
`@/lib/secret-scan`, which in turn imports from `@/lib/secret-patterns`. There is now
exactly one regex table for 11 gitleaks-style secret patterns and exactly one scanner
function that never throws.

## What Shipped

### Task 1 — `secret-patterns.ts` registry (11 gitleaks patterns)
**Commit:** `64fb6ec` — `feat(03-02): add secret-patterns.ts registry (11 gitleaks-style patterns)`

- `dashboard/lib/secret-patterns.ts` (30 lines)
  - `SecretPattern` interface: `{ name, regex, description }`
  - `SECRET_PATTERNS: readonly SecretPattern[]` with exactly 11 entries, all using the `/g` flag
  - Regex literals match 03-RESEARCH.md §Secret-Pattern Source verbatim
  - Comment block names the two consumers (editor-client preview, actions.ts saveRoutine) so drift is impossible to introduce silently

### Task 2 — `scanForSecrets` pure utility + test matrix
**Commit:** `891e2f3` — `feat(03-02): add scanForSecrets pure utility + 18 test blocks`

- `dashboard/lib/secret-scan.ts` (52 lines)
  - `scanForSecrets(text: string): SecretMatch[]` — pure, never throws
  - `SecretMatch` shape locked: `patternName | line | column | matched | description`
  - Per-scan regex clone (`new RegExp(source, flags)`) avoids `lastIndex` corruption when the same module handles concurrent scans
  - Line computed via `text.slice(0, idx).match(/\n/g)?.length ?? 0 + 1`; column via `idx - lastIndexOf("\n")` (both 1-indexed)
  - Matches sorted by `(line, column)` ascending before return
  - Zero-width-match safety belt present (`if (m.index === re.lastIndex) re.lastIndex++`)
- `dashboard/tests/secret-scan.test.ts` (100 lines, 18 executed test cases across 3 describe groups)
  - **Negative suite (3):** empty string, safe prose, `${OPENAI_API_KEY}` placeholder — all return `[]`
  - **Positive per-pattern suite (11):** `it.each` over 9 patterns (stripe-live/test, github-pat/oauth, aws, slack, anthropic, google, generic-40-hex) + 2 dedicated blocks (OpenAI `T3BlbkFJ` infix, PEM header with `\n...-----END-----` body)
  - **Location accuracy suite (4):** line=3 on third line, multi-match no-short-circuit, `matched` + `description` populated, sort-order monotonicity invariant

## Verification

| Command | Result |
|---|---|
| `cd dashboard && pnpm typecheck` | exit 0 |
| `cd dashboard && pnpm test secret-scan.test.ts` | 18/18 pass |
| `cd dashboard && pnpm test` | **179/179 pass** (161 baseline → +18) |
| `grep -c 'regex:' dashboard/lib/secret-patterns.ts` | 11 |
| `grep -c 'name:' dashboard/lib/secret-patterns.ts` | 11 |
| `grep -c 'from "./secret-patterns"' dashboard/lib/secret-scan.ts` | 1 |

## Validation Traceability

`03-VALIDATION.md` row 5 (EDIT-02 secret-scan / Stripe / GitHub / AWS / 40-hex / OpenAI / Anthropic / Slack / Google / PEM detection):

- `Task ID`: `3-02-02`
- `File Exists`: ✅ `dashboard/tests/secret-scan.test.ts`
- `Status`: ✅ green 2026-04-19

## Deviations from Plan

None. Plan executed exactly as written.

One small positive deviation (auto-add, no rule invocation): plan asked for ≥14 `it()`
blocks; shipped 18 by including a 4th location-accuracy test that asserts the
(line, column) sort-order invariant — useful when the SecretScanPanel UI renders
matches in list order (UI-SPEC §SecretScanPanel). Zero scope increase; zero new files.

## Pitfall #5 Mitigation Verification

The fix is structural, not procedural. Future consumers will be:

```
dashboard/app/editor/editor-client.tsx  ─┐
                                         ├──► import { scanForSecrets } from "@/lib/secret-scan"
dashboard/app/editor/actions.ts          ─┘                                │
                                                                           ▼
                                              import { SECRET_PATTERNS } from "./secret-patterns"
```

Any future PR that tries to "add a pattern the client checks" but forgets the server
side is architecturally impossible — the only file holding patterns is shared. A
reviewer seeing a second regex table anywhere in `dashboard/lib/` should reject.

## Key Files (absolute paths)

- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/secret-patterns.ts` (30 lines, commit `64fb6ec`)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/secret-scan.ts` (52 lines, commit `891e2f3`)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/secret-scan.test.ts` (100 lines, commit `891e2f3`)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/03-editor/03-02-SUMMARY.md` (this file)

## Self-Check: PASSED

- [x] `dashboard/lib/secret-patterns.ts` FOUND (11 patterns, 30 lines)
- [x] `dashboard/lib/secret-scan.ts` FOUND (exports scanForSecrets + SecretMatch, imports SECRET_PATTERNS from ./secret-patterns)
- [x] `dashboard/tests/secret-scan.test.ts` FOUND (18 test cases)
- [x] Commit `64fb6ec` present in `git log`
- [x] Commit `891e2f3` present in `git log`
- [x] Pre-existing uncommitted changes in cloud-cache / codex / gemini NOT included in either commit (verified `git show --stat`)
- [x] Test suite green 179/179
- [x] Typecheck exit 0
