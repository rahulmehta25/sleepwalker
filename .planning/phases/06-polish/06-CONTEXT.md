# Phase 6: Polish — Context

**Gathered:** 2026-04-22
**Status:** Ready for research + planning
**Source:** Direct authoring from ROADMAP + REQUIREMENTS (rich pre-context; no discuss-phase round — matches user preference)

<domain>
## Phase Boundary

Ship OSS-quality docs, per-runtime templates, a diagnostics page, and a backward-compat integration gate so a second user on a different Mac can go from `git clone` to first custom routine in under 10 minutes without surprising any v0.1 user.

**Requirements (5):** DOCS-01, DOCS-02, DOCS-03, COMP-01, COMP-02

**Deliverables:**
- `docs/AUTHORING.md` — 10-minute clone-to-routine walkthrough covering all 4 runtimes, Mac-sleep caveat with `caffeinate`/`pmset` alternatives, Troubleshooting section indexed by error message. Picks up where `docs/QUICKSTART.md` leaves off for v0.2 multi-runtime authoring.
- `templates/routine-claude-routines.md`, `templates/routine-claude-desktop.md`, `templates/routine-codex.md`, `templates/routine-gemini.md` — each with commented frontmatter block + skeleton prompt; copy-edit-save produces a valid `RoutineBundleInput`-parseable bundle.
- `dashboard/app/diagnostics/page.tsx` + `dashboard/lib/diagnostics.ts` — Next.js route reporting macOS version, Homebrew prefix (arm64/x86_64 detected at runtime), each CLI's absolute path, active shell, `~/Library/LaunchAgents/` writability, GitHub-issue-ready copy panel.
- COMP-01 integration test suite — verifies 14 v0.1 routines (6 local + 8 cloud) still deploy/run/surface in Morning Queue under v0.2 code + install.sh re-run idempotently on a v0.1 install is a no-op upgrade.
- COMP-02 backward-compat gate — locks hook script names + paths, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` hook wiring, `QueueEntry` field names, `[sleepwalker:<fleet>]` marker format, reversibility colors, policy names. Gate is runnable in CI, not just manual.

**Out of scope (explicitly deferred to v0.3+ per PROJECT.md):**
- New runtime additions (Amp + Devin deferred to v0.3)
- Automated launchd smoke test in CI requiring self-hosted runner (v0.2 stays manual)
- Dashboard UI refresh or redesign
- Multi-user auth / sharing
- Telemetry / analytics beyond audit.jsonl

</domain>

<decisions>
## Implementation Decisions

### DOCS-01 AUTHORING.md structure

**Locked:** Single user-facing markdown file at `docs/AUTHORING.md`. Seven sections in fixed order:

1. **Quick Start** — 3 minutes: clone, `./install.sh`, open dashboard, see 14 v0.1 routines + 4 runtime health badges
2. **Author a Custom Routine** — per-runtime walkthrough using `/editor`: name / prompt / runtime / cron / reversibility / budget; screenshots of each runtime's card
3. **The Four Runtimes** — 4 subsections (Claude Routines / Claude Desktop / Codex / Gemini), each with: what it is, auth prereqs (pointing at existing user accounts in MEMORY.md pattern), how sleepwalker invokes it, quirks/gotchas (e.g. Q1 Claude Desktop manual-add requirement from Phase 2 smoke), link to the matching template
4. **Scheduling & Mac Sleep** — cron syntax refresher, `*/5` and `0 3 * * *` examples, the Mac-sleep caveat with `caffeinate -i` + `sudo pmset schedule wake` alternatives, `launchctl print` debugging recipe
5. **Safety Semantics** — reversibility colors (green/yellow/red) + policies (conservative/balanced/aggressive), the char-budget "approximate" disclaimer, how to override per-routine
6. **Troubleshooting** — indexed by error message (e.g. `"Operation not permitted"` → TCC section linking to 02-12 bundle staging; `"Not inside a trusted directory"` → 02-12 skip-git-repo-check; `"flock not found"` → brew install; `"event":"deferred"` → reversibility policy; Claude Desktop routine never runs → Q1 manual-add)
7. **Going Further** — links to `ARCHITECTURE.md` (internals), `ROUTINES.md` (v0.1 routine catalog), GitHub issues

**Why this shape:** OSS users land on the README, click through to AUTHORING.md, hit Quick Start, then scan 3. The Four Runtimes to match their setup. The Troubleshooting index is critical — errors have specific causes that would cost 30-minute debug sessions without it (Phase 2 manual smoke proved this).

**Length target:** 600-1000 lines. Comprehensive but scan-friendly; every section heading is a jump link.

### DOCS-02 template shape

**Locked:** Each template is a commented YAML frontmatter block followed by a skeleton markdown prompt. Parseable by `gray-matter` (already installed for Phase 3 editor) so `saveRoutine` can ingest them directly. Example shape for all 4:

```markdown
---
# Runtime-specific notes at top (commented — YAML comments use #)
# claude-routines: Cloud-based. Requires Claude Code subscription + /schedule create browser handoff.

name: "Daily Morning Brief"                 # Human-readable; ≤80 chars
slug: "morning-brief"                        # ^[a-z][a-z0-9-]{0,63}$
runtime: "claude-routines"                   # Locked per template; don't change
schedule: "0 7 * * *"                        # Daily at 07:00 local; see AUTHORING.md §4
reversibility: "yellow"                       # green | yellow | red per §5
budget: 40000                                 # Approximate chars (not tokens)
---

# Morning Brief

[sleepwalker:claude-routines/morning-brief]

You are my morning briefing agent. Read my inbox, calendar, and trending
GitHub issues assigned to me. Output a prioritized 5-bullet summary.

## Guidelines

- Focus on things that need my attention today
- Cite sources with links
- Mark items that can wait as "defer"
```

**Four templates, four different example prompts, four different recommended `runtime` values.** Other than runtime/example-prompt, the scaffolding is identical — which is the point: users copy one, change `name`/`slug`/`schedule`/`prompt`, save.

### DOCS-03 diagnostics page

**Locked:** Server Component at `dashboard/app/diagnostics/page.tsx`. Calls `gatherDiagnostics()` from new `dashboard/lib/diagnostics.ts` — async function that parallel-probes via `execFile`:

- `sw_vers -productVersion` → macOS version
- `uname -m` → arch (arm64 | x86_64 | detects Rosetta)
- `brew --prefix` → Homebrew prefix
- `command -v claude` / `command -v codex` / `command -v gemini` + `--version` each (via `/bin/zsh -l -c`)
- `echo $SHELL` → active shell
- `stat -f "%Mp%Lp" ~/Library/LaunchAgents/` → directory writability + mode
- `flock --version` → flock availability (Phase 5 QUEU-04 dep)
- `jq --version` → jq availability (v0.1 dep)

**Zero secrets rendered.** No env var values, no API keys, no auth token state. Only paths + versions + writability flags.

Client component (or Server Component with client island) renders a two-column grid: labels + values + copy-to-clipboard button. Includes a single "Copy as GitHub issue body" button that formats the whole thing as a pre-formatted markdown block for the user to paste into `sleepwalker/issues/new`.

**Compatibility:** Server-side `execFile` probes must fail soft — Intel Macs running fish with macOS 14 may lack `flock` or return different Homebrew prefixes. Every probe wraps in try/catch; on failure, the UI renders the row with `(not found)` or `(error: ...)` instead of crashing the page. RESEARCH should confirm the fail-soft shapes.

### COMP-01 backward-compat integration test

**Locked:** Two-part test:

1. **Bash integration test at `tests/compat/v01-routines.sh`** (new dir) — idempotent install.sh rerun proof:
   - Creates isolated `$TEST_HOME`, runs `./install.sh` once, diffs `~/.sleepwalker/` + `~/.claude/settings.json` against baseline
   - Re-runs `install.sh`, diffs again — expect 0 changes (idempotency proof)
   - Enumerates all 14 v0.1 routines from `routines-local/` + `routines-cloud/`, asserts each has `prompt.md` (or equivalent SKILL.md) + config/metadata file
   - Asserts the 14 filename patterns match the v0.1 catalog from `docs/ROUTINES.md`

2. **TS integration test at `dashboard/tests/v01-queue-integration.test.ts`** — aggregator round-trip proof:
   - Seeds temp `$HOME/.sleepwalker/queue.jsonl` with 14 mock v0.1 entries (6 local + 8 cloud shapes)
   - Calls `aggregateQueue({fetchCloud: false})`
   - Asserts all 14 surface in pending ∪ recent, all have correct `source` + `kind` discriminants, no entries dropped

**Why two-part:** COMP-01 is about v0.1 behavior continuity. Some of that is OS-level (install.sh idempotency, filesystem layout) — that's bash. Some is app-level (queue aggregation shape stability) — that's TS. Neither alone covers the contract.

### COMP-02 backward-compat CI gate

**Locked:** A new bash script at `tests/compat/frozen-surface.sh` that runs the SAME frozen-surface diff pattern Phases 2/3/4/5 used at their exit gates, but PERMANENT — no `PHASE*_BASE` parameter; it compares HEAD against a static baseline captured from v0.1 commit `998455b` (the v0.1 seal commit per `git log`). The enumerated path list covers:

- `install.sh` (with Phase 5 QUEU-04 additive amendment documented as exception)
- 4 hook scripts (with Phase 5 QUEU-04 flock wrap on `sleepwalker-audit-log.sh` documented)
- `routines-local/` + `routines-cloud/` (14 routines — must match ROUTINES.md catalog byte-for-byte)
- `bin/sleepwalker-execute` (v0.1 binary; with bin/sleepwalker-run-cli being Phase 2 new)
- `dashboard/lib/queue.ts` (with Phase 5 QUEU-01 additive amendment documented)
- `dashboard/lib/cloud.ts`, `cloud-cache.ts`, `queue-aggregator.ts`, `settings.ts`, `approval.ts`, `audit.ts`, `github.ts`, `fire-routine.ts` (with Phase 5 cloud-cache.ts eager-source amendment documented)
- `dashboard/lib/routines.ts` (with Phase 4 DEPL additions documented)
- `dashboard/package.json` (dependency additions allowed; v0.1 deps must not be removed)

**Gate behavior:** Script runs via `bash tests/compat/frozen-surface.sh`. Exits 0 if all v0.1 files are either byte-identical OR grep-verified to contain ONLY additive amendments per the documented exception list. Non-zero + diff output otherwise. GitHub Actions workflow (if we add one in this phase) invokes this on every PR.

**Why this is different from phase exit gates:** Phase exit gates are one-time proofs with dynamic `PHASE*_BASE`. COMP-02 is a permanent regression gate. The baseline is hardcoded against v0.1 seal `998455b`, and the exception list documents every legitimate v0.2 amendment. Future contributors can't sneak in a breaking v0.1 change without explicitly editing the exception list.

### CI scope decision

**Locked:** Phase 6 adds a `.github/workflows/ci.yml` file that runs: `pnpm typecheck` + `pnpm test` + `bash hooks/tests/run-tests.sh` + `bash hooks/tests/supervisor-tests.sh` + `bash tests/compat/v01-routines.sh` + `bash tests/compat/frozen-surface.sh` on every push to main and every PR. macOS runner (for launchd/flock availability). No self-hosted runner needed because COMP-01 doesn't require real `launchctl bootstrap` (that's the Phase 2 manual smoke that's explicitly deferred).

**Why include CI setup in Phase 6:** OSS-quality means "a PR from a stranger gets feedback within 5 minutes". Without CI, COMP-02's permanent gate isn't actually permanent — it's just a file that a human has to remember to run.

### Claude's Discretion

- Exact AUTHORING.md headings + sub-structure within each section
- Which screenshots (if any) to include in DOCS-01 — capture new or skip
- Template prompt examples (should be useful demonstrations, not just `TODO`)
- Diagnostics page visual layout — just follow editor/routines page patterns
- Whether the CI workflow is a single job or a matrix across shell/OS variants
- Test fixture details for COMP-01 integration tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions and surface
- `CLAUDE.md` — project rules, frozen v0.1 surface
- `.planning/PROJECT.md` — v0.2 goals, anti-features, out-of-scope list
- `.planning/REQUIREMENTS.md` — DOCS-01..03 + COMP-01..02 full text
- `.planning/ROADMAP.md` §Phase 6 — success criteria

### v0.1 baseline (the backward-compat contract)
- `docs/QUICKSTART.md` — existing v0.1 quickstart; AUTHORING.md should complement, not replace
- `docs/ARCHITECTURE.md` — v0.1 internals
- `docs/ROUTINES.md` — catalog of 14 v0.1 routines (6 local + 8 cloud)
- `install.sh` — idempotent installer (COMP-01 test target)
- `hooks/*.sh` — 4 hook scripts (frozen names + paths)
- `bin/sleepwalker-execute` — v0.1 binary
- `routines-local/` + `routines-cloud/` — 14 routine bundles
- `dashboard/lib/queue.ts`, `queue-aggregator.ts`, `cloud-cache.ts`, `settings.ts`, etc. — frozen v0.1 API surface

### Phase 2-5 outputs that docs must accurately describe
- All four runtime adapters (Phase 2) — for DOCS-01 §3 The Four Runtimes
- Q1 Claude Desktop manual-add requirement (Phase 2 smoke) — critical for DOCS-01 §3 + §6
- TCC bundle staging (Phase 2 02-11/02-12) — DOCS-01 §6 Troubleshooting
- flock + Homebrew `discoteq/flock` install prereq (Phase 5) — DOCS-01 §1 Quick Start
- "approximate" char-budget labeling (Phase 5 SAFE-01) — DOCS-01 §5 Safety Semantics
- Editor route (Phase 3) + deploy state machine (Phase 4) — DOCS-01 §2 Author a Custom Routine
- QUEU-03 supervisor-run queue entries (Phase 5) — DOCS-01 §2 mention

### External docs (researcher will re-read)
- Next.js Server Components docs — for DOCS-03 diagnostics page structure
- macOS `sw_vers` / `uname` / `stat` man pages — for diagnostics probe accuracy
- `caffeinate(1)` + `pmset(1)` — for DOCS-01 §4 Mac sleep caveat
- GitHub Actions macOS runner docs — for CI setup

</canonical_refs>

<specifics>
## Specific Ideas

- DOCS-01 §6 Troubleshooting should be a table with columns: Error message | Cause | Fix (link to AUTHORING.md section or commit). Make it grep-friendly for users who copy-paste error strings into search.
- DOCS-02 templates should include an inline "change these before saving" checklist comment at the top of each YAML frontmatter.
- DOCS-03 diagnostics: include a "Last checked: <ISO timestamp>" footer since this is a transient snapshot, not live monitoring. Page should be static export of the moment.
- COMP-01 test shouldn't require `codex`/`gemini` binaries to be installed — the 14 v0.1 routines are all Claude. Skip mocking entirely; the test asserts file layout + queue aggregation, not real CLI calls.
- COMP-02 baseline commit: `git log --oneline | grep 'feat: Sleepwalker v0.1'` → `998455b feat: Sleepwalker v0.1 — overnight agent fleet on Claude Code`. This is the anchor.
- DOCS-03 diagnostics: mirror the `dashboard/app/audit/page.tsx` pattern (existing v0.1 Server Component) for layout conventions.

</specifics>

<deferred>
## Deferred Ideas

- **Amp + Devin adapters** — out of scope per PROJECT.md (v0.3 territory)
- **Automated real-Mac launchctl smoke in CI** — v0.2 explicitly accepts manual smoke (PROJECT.md). Real `launchctl bootstrap` test requires self-hosted runner; not worth the infra for v0.2.
- **Screenshots captured in this phase** — if not captured during execution, Phase 6 closeout ships text-only AUTHORING.md; screenshots can be added later without a new plan.
- **AUTHORING.md i18n / multi-language** — English-only for v0.2.
- **Diagnostics page live-refresh** — single snapshot per page load.
- **Dashboard UI visual refresh** — v0.2 preserves the lunar/celestial palette as-is.
- **Monetization / paid tier docs** — out of scope; OSS project.
- **Telemetry opt-in** — not a v0.2 feature; audit.jsonl is the only data surface and it's local.

</deferred>

---

*Phase: 06-polish*
*Context authored: 2026-04-22 direct-from-ROADMAP (rich pre-context; discuss-phase skipped per user preference)*
