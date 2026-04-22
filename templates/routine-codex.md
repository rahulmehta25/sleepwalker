---
# ============================================================
# Runtime: codex (OpenAI Codex Pro — local CLI)
# Auth: requires codex CLI on PATH; `codex --version` returns ok.
# Quirks:
#   - Codex refuses to run outside a git repo without --skip-git-repo-check.
#     Sleepwalker auto-adds this flag when invoking from staged bundles
#     (Phase 2 Plan 02-12). You don't need to manage it in the prompt.
#   - Reversibility: prefer `green` for read-only analysis or `yellow`
#     for write-to-staged-bundle routines; `red` only for routines that
#     touch the live filesystem outside the staged bundle.
# See docs/AUTHORING.md §3.3.
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

name: "Dependency Update Scan"
slug: "dep-update-scan"
runtime: "codex"
schedule: "0 3 * * *"
reversibility: "green"
budget: 60000
---

[sleepwalker:codex/dep-update-scan]

You are my nightly dependency scanner. At 03:00 every day, walk my
tracked repos listed in `~/.sleepwalker/tracked-repos.txt`, detect
outdated npm / pip / cargo / brew packages, and produce a per-repo
changelog note. READ-ONLY — never install, upgrade, or open a PR.

## What you do

1. Read `~/.sleepwalker/tracked-repos.txt` (one absolute path per line).
2. For each repo path:
   - `cd "$path"` then detect package manager from lock file:
     - `pnpm-lock.yaml` -> `pnpm outdated --format json`
     - `package-lock.json` -> `npm outdated --json`
     - `yarn.lock` -> `yarn outdated --json`
     - `requirements.txt` / `pyproject.toml` -> `pip list --outdated --format json`
     - `Cargo.lock` -> `cargo outdated --format json`
     - `Brewfile` -> `brew outdated --json`
   - Parse the JSON; produce a markdown note per package.
3. Aggregate all notes into a single `~/.sleepwalker/dep-update-scans/<YYYY-MM-DD>.md`.

## What you do NOT do

- Never run `pnpm up` / `npm update` / `pip install -U` / `cargo update` / `brew upgrade`.
- Never open a PR or modify any file in a tracked repo.
- Never install a new package manager if the lock-file tool isn't on PATH — log and skip.

## Constraints

- Budget: ~60,000 chars (approximate).
- Skip any repo whose path does not exist or is not a git working tree.
- If a package-manager command times out (>60s), skip that repo and log
  to audit.jsonl.

## Success criteria

- Single markdown note at `~/.sleepwalker/dep-update-scans/<YYYY-MM-DD>.md`.
- Every tracked repo has a section (or a "skipped — <reason>" line).
- Zero writes to any tracked repo.
- Audit log entry per repo scanned.
