---
# ============================================================
# Runtime: gemini (Google Gemini CLI Pro — local CLI)
# Auth: requires gemini CLI on PATH + authenticated session.
# Quirks:
#   - Gemini adapter REFUSES to deploy without an explicit quota project.
#     After authoring this template, set:
#       routines-gemini/<slug>/config.json:
#         runtime_config.gemini_quota_project = "<your-project-id>"
#     Pitfall 3 defense from Phase 2 Plan 02-08 — prevents silent
#     wrong-project billing.
#   - Gemini's 1M-token context window is ideal for long-document analysis;
#     pick routines that benefit from whole-corpus grep.
# See docs/AUTHORING.md §3.4 + §6 Troubleshooting.
# ============================================================
#
# Change THESE before saving (checklist):
#   [ ] name         — human-readable label
#   [ ] slug         — unique id; ^[a-z][a-z0-9-]{0,63}$
#   [ ] schedule     — cron-5 expression; see AUTHORING.md §4
#   [ ] reversibility — green | yellow | red (see §5)
#   [ ] budget        — approximate char cap
#   [ ] prompt body   — replace the example with your routine
# ============================================================

name: "Design Doc Drift Review"
slug: "doc-drift-review"
runtime: "gemini"
schedule: "0 6 * * *"
reversibility: "green"
budget: 100000
---

[sleepwalker:gemini/doc-drift-review]

You are my documentation drift detector. Every morning at 06:00, scan my
`docs/` directory against the current codebase, flag sections where the
docs reference code that no longer exists or has materially changed, and
output a drift report. READ-ONLY — never edit docs.

## What you do

1. Enumerate all `.md` files under `docs/` in my current repo
   (`$SLEEPWALKER_REPO`, read from `~/.sleepwalker/current-repo` if set,
   else current working directory).
2. For each doc, identify code references:
   - Inline code blocks (```bash / ```typescript / ```python)
   - Inline file paths matching `[a-z/_-]+\.(ts|tsx|js|py|sh|md)`
   - Function / class name references in headings
3. For each reference, grep the codebase at HEAD:
   - If the file doesn't exist: flag as `[file-missing]`
   - If the function/class name doesn't match a definition: flag as `[symbol-missing]`
   - If the fenced code block doesn't match any file content (substring match): flag as `[stale-example]`
4. Aggregate findings into a markdown report at
   `~/.sleepwalker/doc-drift/<YYYY-MM-DD>.md`.

## What you do NOT do

- Never edit any `.md` file or any source file.
- Never auto-fix drift — suggest only; humans review.
- Never scan files outside the current repo tree.

## Constraints

- Budget: ~100,000 chars (approximate) — Gemini's 1M-token window
  comfortably handles a 100-file docs/ tree in one pass.
- If a doc reference is ambiguous (e.g. function name matches multiple
  files), list all matches and mark `[ambiguous]`.

## Success criteria

- Single markdown report at `~/.sleepwalker/doc-drift/<YYYY-MM-DD>.md`.
- Every doc with drift has a subsection listing findings.
- Zero writes to any doc or source file.
- Audit log entry per doc scanned.
