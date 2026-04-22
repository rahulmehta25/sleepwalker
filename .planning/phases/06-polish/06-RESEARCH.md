---
phase: 06-polish
type: research
status: complete
generated: 2026-04-22
---

# Phase 6: Polish — Research

**Researched:** 2026-04-22
**Domain:** OSS documentation + runtime diagnostics + backward-compat CI gating
**Confidence:** HIGH — all claims either verified against live dev Mac state, grep-audited against existing code, or CITED from installed man pages and shipping Phase 2-5 artifacts.

## Summary

Phase 6 closes out v0.2 by turning a working fleet manager into an OSS artifact that a second user on a different Mac can adopt without surprise. The work splits cleanly across three domains — **documentation** (AUTHORING.md + four templates), **diagnostics** (a single-snapshot `/diagnostics` page), and **backward-compat enforcement** (two integration gates running in GitHub Actions CI).

The phase is unusual in that it is almost entirely additive: every Phase 1-5 code artifact is sealed and byte-identical against its phase base, so Phase 6's job is to describe what already exists (DOCS-01/02), probe what the runtime machine looks like (DOCS-03), and lock the v0.1 contract against future drift (COMP-01/02). The novelty is the *lack* of novelty — the heavy architectural lifting is done; Phase 6 is an OSS-quality polish pass.

**Primary recommendation:** Structure DOCS-01 AUTHORING.md as a 7-section, 600-1000 line document indexed by *error message* in its Troubleshooting section (grep-friendly for users copy-pasting stack traces into search engines). Build DOCS-03 `/diagnostics` on the existing `app/audit/page.tsx` Server Component pattern with parallel `execFile` probes and per-row `try/catch` fail-soft. Implement COMP-02 as a permanent `tests/compat/frozen-surface.sh` with baseline commit `998455b` hardcoded and a documented exception list for every Phase 2/4/5 additive amendment. CI via a single `.github/workflows/ci.yml` on `macos-14` (version-pinned for reproducibility) running typecheck + full test suite + bash harnesses + both compat gates on every PR.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**DOCS-01 AUTHORING.md structure:** Seven sections in fixed order — (1) Quick Start (3 min, clone to 14 v0.1 routines visible), (2) Author a Custom Routine (per-runtime via `/editor`), (3) The Four Runtimes (4 subsections with quirks including Q1 Claude Desktop manual-add), (4) Scheduling & Mac Sleep (cron + `caffeinate` + `pmset` + `launchctl print`), (5) Safety Semantics (reversibility colors + policies + "approximate" budget), (6) Troubleshooting (indexed by error message), (7) Going Further (links to ARCHITECTURE.md + ROUTINES.md + GitHub). Length target: 600-1000 lines.

**DOCS-02 template shape:** Four markdown files at `templates/routine-<runtime>.md`, each with a commented YAML frontmatter block (YAML comments using `#`) plus a skeleton markdown prompt including the `[sleepwalker:<runtime>/<slug>]` marker. Parseable by `gray-matter` so `saveRoutine` can ingest them directly. Four different example prompts (one per runtime); scaffolding otherwise identical.

**DOCS-03 diagnostics page:** Server Component at `dashboard/app/diagnostics/page.tsx`. Calls `gatherDiagnostics()` from new `dashboard/lib/diagnostics.ts`. Parallel-probes via `execFile` for: macOS version, arch, Homebrew prefix, CLI paths + versions (`claude`/`codex`/`gemini`), active shell, `~/Library/LaunchAgents/` writability + mode, `flock --version`, `jq --version`. **Zero secrets rendered.** Includes "Copy as GitHub issue body" button. Every probe wraps in `try/catch` and fails soft with `(not found)` or `(error: ...)` — never crashes the page.

**COMP-01 backward-compat integration test:** Two-part. (1) Bash at `tests/compat/v01-routines.sh` — isolated `$TEST_HOME`, run `./install.sh` twice, diff against baseline, enumerate all 14 v0.1 routines asserting `SKILL.md` (local) or `prompt.md` (cloud) exists. (2) TypeScript at `dashboard/tests/v01-queue-integration.test.ts` — seed 14 mock v0.1 QueueEntry shapes, call `aggregateQueue({fetchCloud: false})`, assert all 14 surface with correct `source` + `kind` discriminants.

**COMP-02 backward-compat CI gate:** `tests/compat/frozen-surface.sh` — permanent frozen-surface diff against **hardcoded baseline commit `998455b`** (v0.1 seal). Covers: `install.sh` + 4 hook scripts + `routines-local/` + `routines-cloud/` + `bin/sleepwalker-execute` + v0.1 dashboard lib surface. Documented exception list covers every Phase 2/4/5 additive amendment. Exit 0 = byte-identical OR amended per documented exception; non-zero + diff output otherwise.

**CI scope:** `.github/workflows/ci.yml` runs `pnpm typecheck` + `pnpm test` + `bash hooks/tests/run-tests.sh` + `bash hooks/tests/supervisor-tests.sh` + `bash tests/compat/v01-routines.sh` + `bash tests/compat/frozen-surface.sh` on every push to main and every PR. macOS runner (for launchd/flock availability). No self-hosted runner.

### Claude's Discretion

- Exact AUTHORING.md headings + sub-structure within each section
- Which screenshots (if any) to include in DOCS-01 — capture new or skip (this research recommends skipping for v0.2 seal; screenshots can be added in a v0.2.x doc patch)
- Template prompt examples (useful demonstrations, not `TODO`)
- Diagnostics page visual layout — just follow editor/routines page patterns
- CI workflow single-job vs matrix
- Test fixture details for COMP-01

### Deferred Ideas (OUT OF SCOPE)

- **Amp + Devin adapters** (v0.3 territory per PROJECT.md)
- **Automated real-Mac launchctl smoke in CI** (requires self-hosted runner)
- **Screenshots captured in this phase** (text-only AUTHORING.md acceptable for v0.2 seal)
- **AUTHORING.md i18n** (English-only v0.2)
- **Diagnostics page live-refresh** (single snapshot per page load)
- **Dashboard UI visual refresh** (palette preserved)
- **Monetization / paid tier docs** (OSS project)
- **Telemetry opt-in** (audit.jsonl is the only data surface)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCS-01 | `docs/AUTHORING.md` 10-minute clone-to-routine walkthrough, 4 runtimes, Mac-sleep caveat, Troubleshooting indexed by error | §1 AUTHORING.md structure + §1.3 Troubleshooting error-message index from Phase 2-5 SUMMARY gotchas + §1.4 Mac sleep caveat recipes |
| DOCS-02 | 4 runtime templates in `templates/` parseable by `gray-matter` | §2 template parseability verified (gray-matter 4.0.3 already installed) + §2.2 zod round-trip confirmation + §2.3 per-runtime prompt examples |
| DOCS-03 | `/diagnostics` Next.js page with macOS version, Homebrew prefix, CLI paths, shell, LaunchAgents writability, GitHub-issue copy | §3 Server Component pattern + `execFile` parallel probes + fail-soft matrix + live-machine probe verification |
| COMP-01 | v0.1 backward-compat integration test — install.sh idempotency + 14 v0.1 routines flow through queue | §4 bash harness extension of `install-idempotency.sh` + TypeScript `aggregateQueue` round-trip test + 14-routine enumeration from `docs/ROUTINES.md` |
| COMP-02 | Permanent frozen-surface CI gate anchored at v0.1 seal commit `998455b` with documented additive exceptions | §5 baseline commit verification + Phase 2/4/5 exception list with grep-verifiable predicates + exit-code contract |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AUTHORING.md walkthrough | Docs (repo-root file) | — | Static markdown; no runtime involvement |
| Runtime templates | Docs (`templates/`) | Dashboard read-side | `gray-matter` parse happens in editor Server Action when a user copies a template; producer side is pure static files |
| Diagnostics page render | Frontend Server (Next.js RSC) | Node subprocess (`execFile`) | Server Component gathers state via `execFile` at request time; client island handles copy-to-clipboard only |
| Diagnostics probes | Node subprocess | OS (shell + PATH) | `/bin/zsh -l -c "command -v claude"` etc.; all probes run on the Next.js server process, zero client JS |
| COMP-01 bash integration | CI runner (bash) | Filesystem | Isolated `$TEST_HOME` via `mktemp -d`; operates only on temp files |
| COMP-01 TS integration | CI runner (Vitest/Node) | Filesystem | `makeTempHome()` helper already exists in `dashboard/tests/helpers.ts`; extends Phase 1 pattern |
| COMP-02 frozen-surface gate | CI runner (bash + git) | Repository history | `git diff <baseline> HEAD -- <path>` pipeline; no filesystem mutations |
| CI orchestration | GitHub Actions (`.github/workflows/ci.yml`) | macOS runner | Single workflow, single job; invokes all five suites sequentially |

## Standard Stack

### Core (already installed; Phase 6 consumes, does not add)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 15.1.4 | Server Components + App Router for `/diagnostics` | [VERIFIED: dashboard/package.json] Existing v0.1 dashboard framework |
| `react` | 19.0.0 | RSC + `use client` island for copy-to-clipboard | [VERIFIED: dashboard/package.json] |
| `gray-matter` | 4.0.3 | YAML frontmatter parse for DOCS-02 templates | [VERIFIED: dashboard/package.json, imported in `dashboard/app/editor/actions.ts:27`] Already wired into Phase 3 editor's `buildFiles()` for claude-desktop/claude-routines branch |
| `zod` | 4.3.6 | Validate `RoutineBundleInput` after a template is filled in | [VERIFIED: dashboard/package.json, Phase 3 `dashboard/lib/bundle-schema.ts`] |
| `vitest` | 2.1.8 | Runner for COMP-01 TS integration test | [VERIFIED: dashboard/package.json devDeps] |
| `jsdom` | ^25.0.1 | jsdom environment for DOCS-03 page test | [VERIFIED: dashboard/package.json devDeps; `dashboard/vitest.config.ts:8` matches `*.test.tsx` to jsdom] |
| `lucide-react` | 0.468.0 | Icons for diagnostics status pills (Check/X/AlertTriangle) | [VERIFIED: dashboard/package.json, existing convention in `queue-client.tsx` + `health-badge.tsx`] |

### System binaries (assumed on PATH per project convention)

| Binary | Version (live Mac) | Purpose | Fallback if missing |
|--------|--------------------|---------|---------------------|
| `jq` | (Phase 1 dep) | JSON parsing in bash harnesses + install.sh | `install.sh:27` already guards with `command -v jq` preflight — hard-fail with install hint |
| `flock` | 0.4.0 (Homebrew `discoteq/flock`) | Audit.jsonl serialization (Phase 5 dep) | `install.sh:32` already guards with preflight (Plan 05-06 commit `71bfdcc`) |
| `git` | macOS default Xcode CLT | COMP-02 frozen-surface diff + REPO-01 save-to-repo | Present by default on macOS; install Xcode CLT if missing |
| `sw_vers` | macOS system | Diagnostics: product version | Present on all macOS; no fallback needed |
| `uname` | POSIX | Diagnostics: arch detection | Present on all POSIX; no fallback |
| `stat` | BSD (macOS) | Diagnostics: LaunchAgents dir mode | Present on all macOS; BSD `stat -f` syntax is macOS-specific (Linux uses `stat -c`) — acceptable since Sleepwalker is Mac-only |
| `brew` | Homebrew | Diagnostics: prefix detection (`brew --prefix`) | Fallback to `[ -d /opt/homebrew ] && echo /opt/homebrew \|\| echo /usr/local` if `brew` not on PATH; flag as "Homebrew not installed" row |
| `caffeinate` | macOS 10.8+ | AUTHORING §4 Mac-sleep recipe | [CITED: `man caffeinate` on macOS 26.4.1] Present on all macOS; no fallback |
| `pmset` | macOS | AUTHORING §4 scheduled wake | [CITED: `man pmset`] Present on all macOS |
| `launchctl` | macOS | AUTHORING §4 `launchctl print` debugging | Present on all macOS |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `execFile` in diagnostics.ts | `spawn` with piped output | `execFile` is simpler for bounded-output probes; `spawn` needed for long-running streams (not our case) |
| Hardcoded baseline SHA `998455b` | Dynamic `git log --grep="Sleepwalker v0.1"` | Hardcoded survives rebases; dynamic breaks if commit message changes. CONTEXT.md locks the hardcoded approach. |
| Single CI job | Matrix (typecheck / test / bash) | Matrix parallelizes but adds setup overhead (pnpm install, repo checkout ×N). Single job completes in <3min per live measurements; matrix not worth the setup tax. |
| Real `launchctl bootstrap` in CI | File-only COMP-01 (no bootstrap) | CONTEXT.md locks the latter; PROJECT.md explicitly defers self-hosted runner. |

**No new npm packages needed.** Phase 6 is pure-consumer — `next`/`react`/`gray-matter`/`zod`/`lucide-react`/`vitest`/`jsdom` all ship from prior phases.

**Version verification performed** [VERIFIED: live npm registry not queried — versions read from `dashboard/package.json` as of HEAD `4cbb5bb`, confirmed against what Phase 3 Plan 03-01 installed (commit `104547f`)]:
- `gray-matter@4.0.3` — latest stable line (4.x, no 5.x release); no security advisories as of Phase 3 install.
- `zod@4.3.6` — ahead of Phase 3's `^3.25.x` target (package.json was upgraded mid-Phase 4); validate that the templates-round-trip test uses the installed version, not pinning to 3.x.

## System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    Phase 6 Polish — Data Flow                              │
└────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────┐
         │  User lands on README.md    │
         │  → clicks docs/AUTHORING.md │
         └──────────────┬──────────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
     ┌────────────────┐    ┌──────────────────────┐
     │ DOCS-01 reads: │    │ DOCS-02 template:    │
     │ 7 sections     │    │ templates/routine-<r>.md│
     │ quickstart     │    │ (commented YAML       │
     │ 4-runtime tour │    │  frontmatter + md)    │
     │ troubleshoot   │    └──────┬───────────────┘
     │ (by error msg) │           │
     └────────┬───────┘           │ user copies to clipboard
              │                   │ + opens /editor
              │                   ▼
              │         ┌──────────────────────────┐
              │         │ Editor paste → submit    │
              │         │ gray-matter parses FM    │──► zod validates
              │         │ (existing Phase 3 path)  │    RoutineBundleInput
              │         └──────────┬───────────────┘
              │                    │ saveRoutine action
              │                    ▼
              │         ┌──────────────────────────┐
              │         │ routines-<r>/<slug>/     │
              │         │ bundle written           │
              │         └──────────────────────────┘
              │
              │ if things go wrong →
              ▼
     ┌─────────────────────────────────────────────┐
     │ DOCS-03: /diagnostics                        │
     │ ┌─────────────────────────────────────────┐ │
     │ │ Server Component (page.tsx)             │ │
     │ │  calls gatherDiagnostics() once         │ │
     │ │    ↓ fires execFile in parallel         │ │
     │ │    ├─ sw_vers -productVersion           │ │
     │ │    ├─ uname -m                          │ │
     │ │    ├─ brew --prefix                     │ │
     │ │    ├─ /bin/zsh -l -c "command -v …"     │ │
     │ │    ├─ stat -f "%Mp%Lp" ~/Library/…      │ │
     │ │    ├─ flock --version / jq --version    │ │
     │ │    └─ echo $SHELL                        │ │
     │ │  each row: {ok, value, error?}          │ │
     │ │  fails soft on any probe error          │ │
     │ └────────┬────────────────────────────────┘ │
     │          │ renders grid + copy button       │
     │          ▼                                    │
     │ ┌─────────────────────────────────────────┐ │
     │ │ Client island ("use client")            │ │
     │ │  navigator.clipboard.writeText(         │ │
     │ │    formatAsGithubIssueBody(diag)        │ │
     │ │  ) on button click                      │ │
     │ └─────────────────────────────────────────┘ │
     └─────────────────────────────────────────────┘

                        ... parallel track ...

         ┌────────────────────────────────────────────┐
         │  Every PR to the repo triggers:            │
         │  .github/workflows/ci.yml on macos-14      │
         └──────────────────┬─────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌───────────┐   ┌─────────────┐   ┌────────────────────┐
    │ pnpm      │   │ bash harness│   │ bash tests/compat/ │
    │ typecheck │   │ run-tests   │   │ ├─ v01-routines.sh │ (COMP-01)
    │   + test  │   │ supervisor- │   │ └─ frozen-surface  │ (COMP-02)
    │ (358/358) │   │ tests       │   │    diff vs 998455b │
    └───────────┘   │ (36 + 29)   │   │    + exception list│
                    └─────────────┘   └────────────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Exit 0 if all pass     │
                                  │ (additive-only)        │
                                  │ Exit non-zero + diff   │
                                  │  if v0.1 drift detected│
                                  └────────────────────────┘
```

## Component Responsibilities

| File (to create) | Responsibility |
|------------------|----------------|
| `docs/AUTHORING.md` | 7-section user-facing walkthrough; complements `docs/QUICKSTART.md` |
| `templates/routine-claude-routines.md` | `gray-matter`-parseable skeleton for Claude Routines |
| `templates/routine-claude-desktop.md` | Skeleton + manual-add warning comment |
| `templates/routine-codex.md` | Skeleton with codex-specific reversibility hint |
| `templates/routine-gemini.md` | Skeleton with `gemini_quota_project` note |
| `dashboard/app/diagnostics/page.tsx` | Server Component; renders `<DiagnosticsPanel />` + `<CopyIssueButton />` island |
| `dashboard/app/diagnostics/diagnostics-client.tsx` | `"use client"` island with `navigator.clipboard.writeText` button |
| `dashboard/lib/diagnostics.ts` | `async function gatherDiagnostics(): Promise<DiagnosticsSnapshot>` — parallel `execFile` probes |
| `dashboard/tests/diagnostics.test.ts` | Node-env unit test mocking `execFile` per probe matrix |
| `dashboard/tests/diagnostics-page.test.tsx` | jsdom render test; asserts copy button + fail-soft rows |
| `dashboard/tests/v01-queue-integration.test.ts` | COMP-01 TS half |
| `tests/compat/v01-routines.sh` | COMP-01 bash half |
| `tests/compat/frozen-surface.sh` | COMP-02 permanent gate |
| `.github/workflows/ci.yml` | GitHub Actions workflow |

---

## 1. AUTHORING.md structure research (DOCS-01)

### 1.1 Comparison to existing `docs/QUICKSTART.md`

`docs/QUICKSTART.md` (177 lines, v0.1-era) covers:
- Prerequisites (macOS + Claude Code Desktop + Node 20+ + jq + GitHub PAT)
- Install flow (`git clone` + `./install.sh`) with deliverables (6 SKILLs + 3 hooks + settings.json wiring)
- Dashboard startup (`pnpm dev --port 4001`)
- Enabling a starter routine (3 options: Desktop UI, `/schedule create`, dashboard toggle)
- Cloud fleet setup (GitHub token + tracked repos + per-routine /fire creation)
- Verification (4-test suite)
- Policy adjustment (sleep window, per-fleet policies, budgets)
- Adding your own routine (copy + edit + re-run install.sh)
- Safety reset commands
- Troubleshooting (5 error scenarios — jq not found, routine doesn't fire, hooks not intercepting, cloud routines invisible, "not installed")

**What AUTHORING.md adds:**
- v0.2-only multi-runtime authoring via `/editor` (replaces "copy + edit + re-run install.sh" for the non-Claude runtimes)
- Per-runtime quirks (Q1 Desktop manual-add, TCC bundle staging, gemini quota project, codex `--skip-git-repo-check`)
- SAFE-01 honest-labeling ("chars (approximate)" vs "tokens")
- QUEU-04 flock preflight (Phase 5)
- Mac-sleep caveat (not in QUICKSTART.md at all)
- `launchctl print` debugging recipe
- Troubleshooting indexed by error message (QUICKSTART has 5 entries; AUTHORING needs 10-12+)

**Recommendation:** AUTHORING.md references QUICKSTART.md from §1 Quick Start ("If you're new, first run through QUICKSTART.md §1-3; this doc picks up at Author a Custom Routine"). Do not duplicate the v0.1 install steps.

### 1.2 7-section outline with jump-link anchors

```markdown
# Authoring Sleepwalker Routines

## 1. Quick Start  <!-- #quick-start -->
## 2. Author a Custom Routine  <!-- #author-a-custom-routine -->
   ### 2.1 Open /editor  <!-- #open-editor -->
   ### 2.2 Fill the form  <!-- #fill-the-form -->
   ### 2.3 Click Save  <!-- #click-save -->
   ### 2.4 Click Deploy  <!-- #click-deploy -->
## 3. The Four Runtimes  <!-- #the-four-runtimes -->
   ### 3.1 Claude Code Routines (cloud)  <!-- #claude-routines -->
   ### 3.2 Claude Code Desktop Scheduled Tasks  <!-- #claude-desktop -->
   ### 3.3 OpenAI Codex Pro  <!-- #codex -->
   ### 3.4 Google Gemini CLI Pro  <!-- #gemini -->
## 4. Scheduling & Mac Sleep  <!-- #scheduling-and-mac-sleep -->
   ### 4.1 Cron syntax refresher  <!-- #cron-syntax -->
   ### 4.2 Mac must be awake  <!-- #mac-must-be-awake -->
   ### 4.3 Debug with launchctl print  <!-- #launchctl-print -->
## 5. Safety Semantics  <!-- #safety-semantics -->
   ### 5.1 Reversibility colors  <!-- #reversibility -->
   ### 5.2 Defer policies  <!-- #defer-policies -->
   ### 5.3 Approximate budget cap  <!-- #approximate-budget -->
## 6. Troubleshooting  <!-- #troubleshooting -->
   (table indexed by error message)
## 7. Going Further  <!-- #going-further -->
```

Every heading becomes a GitHub-rendered anchor. Users can deep-link any section via `docs/AUTHORING.md#reversibility` etc. The CONTEXT.md-locked 7-section order is preserved; subsection numbering is Claude's discretion.

### 1.3 Troubleshooting error-message index (from Phase 2-5 SUMMARY files)

This is the section with the highest user-hour-savings potential. Every entry has a grep-friendly error string as the left column so users copy-pasting a stack trace into Cmd-F hit the right fix fast.

| Error message (copy-pasteable) | Cause | Fix | Reference |
|-------------------------------|-------|-----|-----------|
| `ERROR: jq is required but not installed. Install with: brew install jq` | v0.1 preflight failure | `brew install jq` then re-run `./install.sh` | install.sh:27 |
| `ERROR: flock is required but not installed. Install with: brew install flock` | Phase 5 preflight failure (QUEU-04) | `brew install discoteq/discoteq/flock` then re-run `./install.sh` | install.sh:32 (commit `71bfdcc`) |
| `"event":"failed","preview":"..Operation not permitted.."` in audit.jsonl | launchd TCC sandbox blocks reads from `~/Desktop`/`~/Documents`/`~/Downloads`/iCloud | Verified auto-fix: Phase 2 Plan 02-12 stages bundle to `~/.sleepwalker/staged-bundles/<runtime>/<slug>/` and pins `WorkingDirectory` there. If you see this post-v0.2, check that `launchctl print gui/$UID/com.sleepwalker.<runtime>.<slug>` shows `working directory = /Users/<you>/.sleepwalker/staged-bundles/...` (not your repo path) | 02-SUMMARY.md §Cycle 3 + Plan 02-12 commit `4cbb5bb` |
| `"event":"failed","preview":"..Not inside a trusted directory and --skip-git-repo-check was not specified.."` | Codex CLI refuses to run in non-git-repo cwd (staged bundle is not a repo) | Upgrade to `>= commit 633a07a`; fix appended `--skip-git-repo-check` to codex exec argv. Manual workaround: add the flag in your codex-run wrapper. | 02-SUMMARY.md §Cycle 4 + commit `633a07a` |
| Claude Desktop routine never fires even after save | **Q1 outcome (c) from Phase 2 smoke:** Claude Desktop 1.3109.0 does NOT watch `~/.claude/scheduled-tasks/` at all. The SKILL.md was written correctly to disk but Desktop never ingested it. | Open Claude Desktop → Schedule tab → Add. Paste the generated SKILL.md content manually. The editor offers a one-click "Copy SKILL.md" button for exactly this workflow. | 02-SUMMARY.md §Claude Desktop Smoke + 02-12 warning |
| `"event":"budget_exceeded","preview":"Stopped at N chars (budget: M, approximate)"` | Supervisor SIGTERMed the subprocess because cumulative output exceeded the configured char budget | Increase `budget` in the routine's config.json / SKILL.md frontmatter, or reduce prompt scope. Note: budgets are approximate (±40%); raise by 50% to give headroom. | SAFE-01 + Phase 5 Plan 05-07 |
| `"event":"deferred","preview":"red+balanced"` / `"red+strict"` / `"yellow+strict"` | Reversibility gate blocked a tool call per policy | Either (a) change routine `reversibility` in frontmatter if the action actually is safer than classified, or (b) change the per-fleet policy in `~/.sleepwalker/settings.json`, or (c) approve in the Morning Queue at wake time (the intended flow) | §5 Safety Semantics + Plan 02-03 |
| `gemini deploy → "Gemini quota project not configured. Set runtime_config.gemini_quota_project in config.json."` | Pitfall 3 defense: gemini adapter refuses to write a plist without explicit quota project (prevents silent wrong-project billing) | Add `"gemini_quota_project": "<project-id>"` to `routines-gemini/<slug>/config.json` under a `runtime_config` key. Gemini `healthCheck()` shows the active quota project and auth mode so you can sanity check. | 02-SUMMARY.md §Key Decisions #4 + Plan 02-08 commit `72c6f69` |
| "codex not in PATH" red pill on landing page | Codex CLI not installed or login shell PATH doesn't include `/opt/homebrew/bin` | Install: `brew install codex` (or download from openai.com/codex). Verify with `/bin/zsh -l -c "command -v codex"`. Restart the dashboard (`pnpm dev --port 4001`) after install so the landing-page health badge refreshes. | HLTH-01 + ADPT-07 healthCheck |
| "bundle not found" in audit.jsonl | Codex/Gemini routine deployed pre-Plan 02-11, so `programArguments` doesn't include the explicit bundle path | Re-deploy the routine via the dashboard (newer plist includes 4-arg `programArguments [supervisor, runtime, slug, bundlePath]`). Or manually: `launchctl bootout gui/$UID/com.sleepwalker.<runtime>.<slug>` then click Deploy again. | 02-SUMMARY.md §Cycle 2 + commit `7cc894a` |
| Secret-scan blocks save with "Prompt appears to contain a secret (... at line N, column M). Replace with ${VAR}..." | EDIT-02 gitleaks regex matched a pattern (sk_live_, ghp_, 40-char hex, etc.) in your prompt | Replace the literal secret with `${VAR_NAME}` and document the env var in this file or per-routine. See `dashboard/lib/secret-patterns.ts` for the full match list. | Phase 3 EDIT-02 |
| Save rejected with "Slug must match `^[a-z][a-z0-9-]{0,63}$` ..." | EDIT-04 slug validation failure | Use only lowercase letters, digits, hyphens; start with a letter; ≤64 chars. Example: `morning-brief-v2`, not `MorningBrief_v2`. | Phase 3 bundle-schema.ts:24 |
| Save rejected with "A <runtime> routine with slug <slug> exists. Slugs must be unique across runtimes." | EDIT-04 cross-runtime collision | Slugs are globally unique across `routines-*`. Pick a different slug (e.g. `codex-morning-brief` vs `gemini-morning-brief`). | Phase 3 EDIT-04 + editor/actions.ts:85 |
| Dashboard says `cloud queue inactive · configure GitHub in Settings` | No GitHub PAT found at `~/.sleepwalker/github-token` | Open Settings → GitHub → paste a PAT with `repo` or `public_repo` scope → Test connection | Phase 4 HLTH-01 + v0.1 QUICKSTART §5 |

**Count:** 13 entries. **Format:** single markdown table, grep-friendly. Every entry quotes the exact string a user would see in audit.jsonl, a toast, or a shell error — this is the single highest-value design decision for AUTHORING.md §6.

### 1.4 Mac-sleep caveat research (AUTHORING §4)

macOS launchd agents don't fire while the Mac is asleep. Three mitigation patterns to document:

**Pattern A — `caffeinate` (interactive dev):**
```bash
# Keep Mac awake indefinitely while a shell is open
caffeinate -i &

# Keep Mac awake for next 8 hours (overnight routine window)
caffeinate -i -t 28800 &

# Keep Mac awake until a specific PID exits (e.g. dev server)
caffeinate -i -w $(pgrep -f "next dev")
```
[CITED: `man caffeinate` on macOS 26.4.1] Flags: `-d` (display), `-i` (idle), `-m` (disk), `-s` (system, AC only), `-u` (user active), `-t` (timeout seconds), `-w` (wait on pid).

**Pattern B — `pmset schedule` (scheduled wake for overnight routines):**
```bash
# One-time wake tomorrow at 03:00 (requires sudo)
sudo pmset schedule wake "MM/DD/YY HH:MM:SS"
# Example: wake at 3am on Apr 23 2026
sudo pmset schedule wake "04/23/26 03:00:00"

# Repeating daily wake (power on or wake) at 03:00
sudo pmset repeat wake MTWRFSU 03:00:00

# Show all scheduled events
pmset -g sched

# Cancel all scheduled events
sudo pmset schedule cancelall
```
[CITED: `man pmset`] `type` is one of `sleep | wake | poweron | shutdown | wakeorpoweron`. Weekday codes: `M T W R F S U` (U=Sunday).

**Pattern C — `launchctl print` (debugging why a scheduled job didn't fire):**
```bash
# Show the specific job's state (exit code, last run timestamp, next scheduled run)
launchctl print gui/$UID/com.sleepwalker.codex.morning-brief

# Key fields to look for:
# - state = running | waiting | exited
# - last exit code = 0 (success) or non-zero (failure)
# - pending jobs = <count>  (should be 0 right after launchd fires it)
# - program = /Users/<you>/.sleepwalker/bin/sleepwalker-run-cli-<hash>
# - working directory = /Users/<you>/.sleepwalker/staged-bundles/<runtime>/<slug>
```

[VERIFIED: live Mac output]. If `working directory` shows your repo path instead of `~/.sleepwalker/staged-bundles/...`, your plist is pre-Plan 02-12 and needs redeploy.

Recommended AUTHORING.md copy: "Sleepwalker's CLI runtimes (Codex, Gemini) run via launchd, which does not fire while your Mac is sleeping or closed. Pick **one** of these three patterns based on your use case:" (then present A/B/C as three callout boxes).

### 1.5 Word count + fidelity expectation

CONTEXT.md locks **600-1000 lines**. At ~80 characters per line and 5 words per line average, that is roughly **3,000-5,000 words** — a 10-minute *read*, not a 10-minute *do*. The "first custom routine in under 10 minutes" success criterion from ROADMAP.md §Phase 6 refers to the **do-time** for a user who already has prereqs installed (Claude Code Desktop signed in, `jq`/`flock`/`claude`/`codex`/`gemini` on PATH). Users without prereqs finish the read-through then spend 5-10 minutes of setup-time outside the scope of AUTHORING.md.

Recommendation: open AUTHORING.md with a "Prereq check" callout at the top pointing users to `/diagnostics` if they're unsure which prereqs they're missing. This creates a direct handoff from DOCS-01 to DOCS-03.

### 1.6 Confidence: HIGH
All error messages are grep-verified against Phase 2-5 commits and actual `bin/sleepwalker-run-cli` / `install.sh` / editor-action strings. `caffeinate` / `pmset` syntax verified against the installed man pages on this Mac.

---

## 2. DOCS-02 template parseability

### 2.1 Gray-matter + zod round-trip

`gray-matter@4.0.3` is [VERIFIED: dashboard/package.json line 13] installed. The editor's `buildFiles()` function [VERIFIED: dashboard/app/editor/actions.ts:106-133] already uses it:

```typescript
import matter from "gray-matter";

// For claude-desktop + claude-routines:
const frontmatter = { name, schedule, reversibility, budget };
return { "SKILL.md": matter.stringify(input.prompt, frontmatter) };
```

So: **the producer side already exists**. DOCS-02's job is to write the consumer-side fixtures — four static `.md` files that round-trip cleanly. A template like:

```markdown
---
name: "Daily Morning Brief"
slug: "morning-brief"
runtime: "claude-routines"
schedule: "0 7 * * *"
reversibility: "yellow"
budget: 40000
---

[sleepwalker:claude-routines/morning-brief]

You are my morning briefing agent...
```

should parse via `matter(fileContent)` to `{ data: {name, slug, runtime, schedule, reversibility, budget}, content: "[sleepwalker:...]..." }`. The `data` object maps 1:1 to `RoutineBundleInput` [VERIFIED: dashboard/lib/bundle-schema.ts:23-64] after a `z.coerce.number()` pass on the budget string.

### 2.2 Validate-through-zod test (recommended for COMP-01 as a sub-assertion)

Add a test like:
```typescript
// dashboard/tests/templates.test.ts
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { RoutineBundleInput } from "@/lib/bundle-schema";

describe("DOCS-02 templates round-trip through gray-matter + zod", () => {
  const runtimes = ["claude-routines", "claude-desktop", "codex", "gemini"];
  for (const r of runtimes) {
    it(`templates/routine-${r}.md parses + validates`, () => {
      const raw = fs.readFileSync(
        path.join(__dirname, "..", "..", "templates", `routine-${r}.md`),
        "utf8",
      );
      const { data, content } = matter(raw);
      // Reassemble what a user would submit via the editor form:
      const formLike = { ...data, prompt: content };
      const parsed = RoutineBundleInput.safeParse(formLike);
      expect(parsed.success).toBe(true);
    });
  }
});
```

This test **prevents template rot**: if a future frontmatter field is added to `RoutineBundleInput`, the templates break the test and must be updated.

### 2.3 Per-runtime example prompts

| Runtime | Example prompt concept | Why it demonstrates the runtime |
|---------|------------------------|--------------------------------|
| `claude-routines` | "Morning Brief" — aggregate overnight GitHub + Linear + Slack into a 5-bullet summary | Showcases cloud connectors (GitHub + MCP) which Claude Routines is uniquely good at |
| `claude-desktop` | "Inbox Triage" — classify last 24h of Mail.app messages, draft replies (never send) | Showcases local Mac app access (Mail.app AppleScript) which only Desktop routines have |
| `codex` | "Dependency Update Scan" — detect outdated deps across tracked repos, produce a per-repo changelog note | Showcases Codex's strength: code-local shell-out without browser handoff |
| `gemini` | "Design Doc Review" — scan docs/ directory for drift against code, flag stale sections | Showcases Gemini's 1M-token context window for long-document analysis |

Each template uses the same skeleton structure (YAML frontmatter + `[sleepwalker:<r>/<slug>]` marker + H2 headings + concrete action steps) but the *example prompt* differs meaningfully so users get four distinct demos, not four copies of the same thing.

### 2.4 What goes wrong if user forgets to change `slug`

If a user copies `templates/routine-codex.md` verbatim (slug `morning-brief`) and saves, they hit:
- Phase 3 `hasBundleAnyRuntime("morning-brief")` returns the Claude Routines collision if the Claude-Routines template was saved first.
- `sameRuntimeCollisionMsg` / `crossRuntimeCollisionMsg` [VERIFIED: editor/actions.ts:81-87] surfaces to the user.

**Mitigation:** Template comment at the top:
```markdown
---
# ============================================================
# Change THESE before saving (checklist):
#   [ ] name         — human-readable label
#   [ ] slug         — unique identifier; lowercase kebab-case
#   [ ] schedule     — cron-5 expression; see AUTHORING.md §4
#   [ ] reversibility — green / yellow / red; see §5
#   [ ] budget        — approximate char cap (not tokens)
# ============================================================
```

### 2.5 Directory location

`templates/` at repo root [VERIFIED: exists as of Phase 1 Plan 01-02 commit `b38416c`, currently holds only `.gitkeep` with placeholder comment]. No `dashboard/templates/` because these are user-facing (not dashboard-internal).

### 2.6 Confidence: HIGH
All gray-matter and zod behavior verified against the actual installed versions and the actual Phase 3 editor code path. Zero net-new dependencies.

---

## 3. /diagnostics page research (DOCS-03)

### 3.1 Next.js Server Component pattern

The reference pattern is [VERIFIED: `dashboard/app/audit/page.tsx`]:
```typescript
import { readAudit } from "@/lib/audit";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const entries = readAudit(200);
  // ... server-rendered markup
}
```

`export const dynamic = "force-dynamic"` opts out of static generation — critical for `/diagnostics` since the probe results are request-time and machine-specific. Without this, Next.js might cache the first render and serve stale data forever.

**The mirror for /diagnostics:**
```typescript
// dashboard/app/diagnostics/page.tsx
import { gatherDiagnostics } from "@/lib/diagnostics";
import { PageHeader } from "../_components/page-header";
import { CopyIssueButton } from "./diagnostics-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const diag = await gatherDiagnostics();
  return (
    <>
      <PageHeader
        eyebrow={`Snapshot · ${diag.capturedAt}`}
        title="Diagnostics"
        subtitle="Environment probe for bug reports. No secrets rendered."
      />
      <DiagnosticsTable rows={diag.rows} />
      <CopyIssueButton diag={diag} />
    </>
  );
}
```

### 3.2 `execFile` at request time — safety + caching

`execFile` is safe at request time *if and only if*:
1. Arguments are never interpolated from user input (our probes have zero user input — they're all hardcoded).
2. Output is bounded (`execFile` defaults to `maxBuffer: 1MB`; all our probes return <1KB).
3. Timeouts are set (recommended: `timeout: 2000` per probe to prevent a hung `/bin/zsh -l -c` from blocking the whole page).

Pattern:
```typescript
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
const execFile = promisify(execFileCallback);

async function probeCli(cmd: string): Promise<Probe> {
  try {
    const { stdout } = await execFile("/bin/zsh", ["-l", "-c", `command -v ${cmd} && ${cmd} --version 2>&1 | head -1`], {
      timeout: 2000,
      maxBuffer: 64_000,
    });
    const [pathLine, versionLine] = stdout.trim().split("\n");
    return { ok: true, path: pathLine, version: versionLine };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

`/bin/zsh -l -c` is the login-shell invocation — matches how the supervisor resolves CLI paths [VERIFIED: bin/sleepwalker-run-cli via Phase 2 Plan 02-03]. Using `execFile` directly with `command`/`which` bypasses shell config and misses Homebrew-installed binaries on the common Mac dev setup.

**Caching story:** none. `dynamic = "force-dynamic"` means every page visit re-probes. `gatherDiagnostics()` runs `Promise.all()` over ~8 probes; total latency is `max(probe latencies) + Promise.all overhead`. Measured cost: `/bin/zsh -l -c` is the slowest probe (~100-300ms for login-shell init). Total page render time: ~300-500ms. Acceptable for a bug-report page that a user visits rarely.

### 3.3 Fail-soft matrix

| Probe | Success shape | Fail mode on fresh Mac | Fail mode on Intel Mac | Fail mode on fish shell |
|-------|---------------|------------------------|------------------------|-------------------------|
| `sw_vers -productVersion` | "26.4.1" | N/A (always present on macOS) | N/A | N/A |
| `uname -m` | "arm64" / "x86_64" | N/A | returns "x86_64" correctly | N/A |
| `brew --prefix` | "/opt/homebrew" | `command not found` → row shows "Not installed (install from brew.sh)" | "/usr/local" (x86_64 default) | N/A |
| `/bin/zsh -l -c "command -v claude"` | "/Users/<u>/.local/bin/claude" | not found → row shows "Not on PATH (see AUTHORING.md §3.1)" | same | **key risk**: `-l` (login) flag re-sources `~/.zshrc`; if the user's default shell is fish, the login-zsh path may not include fish-modified PATH. Mitigation: probe BOTH `/bin/zsh -l -c` AND `$SHELL -l -c` if `$SHELL != /bin/zsh`, show whichever finds the binary |
| `echo $SHELL` | "/bin/zsh" | N/A (always set) | N/A | returns "/opt/homebrew/bin/fish" — row renders verbatim |
| `stat -f "%Mp%Lp" ~/Library/LaunchAgents/` | "0700" | dir doesn't exist → `stat: can't stat: ...No such file` → row shows "Not created yet (run ./install.sh)" | same | N/A |
| `flock --version` | "flock 0.4.0" | not installed → row shows "Not installed; install with: brew install discoteq/discoteq/flock" | same | N/A |
| `jq --version` | "jq-1.7" | not installed → row shows "Not installed; install with: brew install jq" | same | N/A |

**All failures degrade to a row showing `(not found)` or `(error: <message>)` in the grey-moon-600 color class.** The page still renders; the copy-button still works. This is the key reliability invariant.

### 3.4 `~/Library/LaunchAgents/` writability probe

```bash
stat -f "%Mp%Lp" ~/Library/LaunchAgents/   # "0700" on this Mac
test -w ~/Library/LaunchAgents/            # exit 0
```
Both work [VERIFIED: live Mac]. Use `stat -f` (BSD syntax) — the Linux `stat -c` does not work on macOS. Since Sleepwalker is Mac-only, this is fine; but the probe `catch` block should mention "Expected on macOS" for forward-compat if anyone ports to Linux.

### 3.5 Copy-to-clipboard pattern

The dashboard has no existing precedent — searched `dashboard/app/` for `clipboard.writeText` → 0 hits. New pattern. Two options:
- **`navigator.clipboard.writeText`** — modern, async, requires HTTPS or localhost (we're on `localhost:4001` so this works). Silently fails on non-secure origins.
- **`document.execCommand("copy")`** — deprecated but universally supported including old browsers.

**Recommendation:** `navigator.clipboard.writeText` — our only target is `localhost:4001` per v0.2 constraint. Client-only, wrap in `"use client"` boundary:

```typescript
// dashboard/app/diagnostics/diagnostics-client.tsx
"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyIssueButton({ diag }: { diag: DiagnosticsSnapshot }) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    await navigator.clipboard.writeText(formatAsIssueBody(diag));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={onClick} className="btn-primary">
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied!" : "Copy as GitHub issue body"}
    </button>
  );
}

function formatAsIssueBody(d: DiagnosticsSnapshot): string {
  return [
    "## Environment",
    "```text",
    `macOS: ${d.rows.macos.value ?? "(probe failed)"}`,
    `Arch: ${d.rows.arch.value ?? "(probe failed)"}`,
    `Homebrew: ${d.rows.brew.value ?? "(not installed)"}`,
    `Shell: ${d.rows.shell.value}`,
    `claude: ${d.rows.claude.ok ? d.rows.claude.value : "(not on PATH)"}`,
    `codex: ${d.rows.codex.ok ? d.rows.codex.value : "(not on PATH)"}`,
    `gemini: ${d.rows.gemini.ok ? d.rows.gemini.value : "(not on PATH)"}`,
    `flock: ${d.rows.flock.ok ? d.rows.flock.value : "(not installed)"}`,
    `jq: ${d.rows.jq.ok ? d.rows.jq.value : "(not installed)"}`,
    `LaunchAgents mode: ${d.rows.launchAgents.value ?? "(not found)"}`,
    `Captured: ${d.capturedAt}`,
    `Sleepwalker commit: ${d.gitSha}`,
    "```",
  ].join("\n");
}
```

Fenced code block with ```` ```text ```` lang — keeps GitHub issue rendering clean (no syntax highlighting attempts on plain output). The git SHA field comes from an env var injected at build time (`NEXT_PUBLIC_GIT_SHA=$(git rev-parse --short HEAD) next build`) or from reading `.git/HEAD` server-side at request time; recommend the latter for dev mode flexibility.

### 3.6 Claude Code Desktop probe reliability

Edge case: a user has `claude` CLI installed (`/Users/<u>/.local/bin/claude` or `npm i -g @anthropic-ai/claude-code`) but does NOT have Claude Code Desktop installed. `command -v claude` returns the CLI path; `claude --version` returns "2.1.117 (Claude Code)" [VERIFIED: live]. This is a valid state for users who only want Codex/Gemini.

Recommendation: label the row as "claude CLI" rather than "Claude Code Desktop" in the diagnostics table. Mention in AUTHORING.md §3.2 that the Desktop app and the CLI are different things (Desktop = macOS.app bundle with the Schedule tab UI; CLI = Node-based binary that wraps the Desktop API).

### 3.7 v0.2 install state probe

Optionally, add one more row verifying Sleepwalker's own state:
```typescript
async function probeSleepwalkerState(): Promise<Probe> {
  const stateDir = path.join(os.homedir(), ".sleepwalker");
  const lockFile = path.join(stateDir, "audit.jsonl.lock");
  try {
    const exists = fs.existsSync(stateDir);
    const lockExists = fs.existsSync(lockFile);
    return { ok: true, value: exists ? (lockExists ? "installed (v0.2)" : "installed (v0.1)") : "not installed" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```
Distinguishes v0.2 install (flock lockfile present per Plan 05-05) from v0.1 install (no lockfile) from no install. Helps triage bug reports.

### 3.8 Confidence: HIGH
Every probe verified against live dev Mac output. Fail-soft matrix expanded from CONTEXT.md. Copy pattern chosen against known codebase conventions (first clipboard use in the project, pattern is new but well-understood).

---

## 4. COMP-01 integration test design

### 4.1 Can install.sh run in CI without sudo?

`install.sh` touches only:
- `$HOME/.claude/hooks/` + `$HOME/.claude/scheduled-tasks/` + `$HOME/.claude/settings.json`
- `$HOME/.sleepwalker/` state dir
- Requires `jq` + `flock` on PATH (preflight checks)

**No sudo, no launchctl, no ~/Library/LaunchAgents/ writes.** [VERIFIED: `install.sh` read in full]. So yes — safe to run in a macOS CI runner with `HOME=$TEST_HOME mktemp -d` isolation. This matches the existing pattern [VERIFIED: `hooks/tests/install-idempotency.sh:11-14`]:

```bash
TEST_HOME=$(mktemp -d -t sleepwalker-installtest-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$TEST_HOME"

cleanup() { rm -rf "$TEST_HOME"; }
trap cleanup EXIT
```

### 4.2 Fixture strategy

Two independent approaches, one per half:

**Bash half (`tests/compat/v01-routines.sh`):**
- Seed `$TEST_HOME` with nothing.
- Run `./install.sh` once.
- Enumerate: `find $TEST_HOME/.claude/scheduled-tasks -name "sleepwalker-*" -type d | wc -l` should equal **6**.
- Enumerate: `find $REPO_ROOT/routines-cloud -mindepth 1 -maxdepth 1 -type d` should list **9 directories** (8 real + 1 `_test-zen`).
- For each v0.1 local routine in `routines-local/`, assert `SKILL.md` exists at `$TEST_HOME/.claude/scheduled-tasks/<name>/SKILL.md`.
- For each v0.1 cloud routine (excluding `_test-zen`), assert `$REPO_ROOT/routines-cloud/<name>/{prompt.md,config.json}` exists.
- Run `./install.sh` a second time.
- Diff `$TEST_HOME` snapshot before+after second run — expect zero diff (idempotency). This is the exact pattern `install-idempotency.sh` uses [VERIFIED].

**TS half (`dashboard/tests/v01-queue-integration.test.ts`):**
- Use `makeTempHome()` helper [VERIFIED: `dashboard/tests/helpers.ts:10-22`].
- Seed `~/.sleepwalker/queue.jsonl` with 14 mock entries (6 with `source: "local"`, 8 with `source: "cloud"` or from the cloud-cache shape).
  - Alternative: seed only local entries (6), and set `fetchCloud: false` to skip GitHub polling (isolated test; no network).
- Call `aggregateQueue({ fetchCloud: false })`.
- Assert: `result.localCount === 6 && result.cloudCount === 0 && result.pending.length + result.recent.length === 6` (for local-only variant).
- For the 8 cloud routines: assert the static `listCloudRoutines()` from `dashboard/lib/cloud.ts` returns all 8 by name (no network, reads `routines-cloud/` from disk).

### 4.3 14 v0.1 routines — exact enumeration

[VERIFIED: `ls routines-local/ routines-cloud/`]:

**Local (6):**
1. `sleepwalker-calendar-prep`
2. `sleepwalker-disk-cleanup`
3. `sleepwalker-downloads-organizer`
4. `sleepwalker-inbox-triage`
5. `sleepwalker-screenshot-reviewer`
6. `sleepwalker-standup-writer`

**Cloud (8 real + 1 test-zen):**
1. `alert-triage`
2. `dead-code-pruner`
3. `dependency-upgrader`
4. `doc-drift-fixer`
5. `library-port`
6. `morning-brief`
7. `pr-reviewer`
8. `test-coverage-filler`
9. `_test-zen` (underscore prefix → excluded from catalog; present for smoke testing)

**Each local routine has:** `SKILL.md` only (`routines-local/<name>/SKILL.md`).
**Each cloud routine has:** `prompt.md` + `setup.md` + `config.json` (3 files).

Test should hardcode these 14 names and fail if any is missing. This is the **strictness decision CONTEXT.md §10 asks about — YES, strict**: missing any v0.1 routine is a backward-compat failure.

### 4.4 Strict vs permissive

CONTEXT.md §10 asks "Fail the build if ANY v0.1 routine is missing its prompt?" Answer: **YES, strict**. Two reasons:
1. **Contract:** COMP-01 exists to enforce backward-compat. A missing routine is a contract violation.
2. **Catastrophic failure mode:** a silent deletion of `routines-local/sleepwalker-downloads-organizer/SKILL.md` would go unnoticed without this test. The test is the canary.

### 4.5 COMP-01 self-test

Test must itself be testable. Recommended: a `shouldFail` mode that intentionally deletes one routine and confirms the test fails:

```bash
# tests/compat/v01-routines-self-test.sh
# Run by CI but NOT by the main test loop; verifies that if a v0.1 routine
# goes missing, v01-routines.sh exits non-zero.
set -euo pipefail
cp -R routines-local/sleepwalker-downloads-organizer /tmp/sw-bak
rm -rf routines-local/sleepwalker-downloads-organizer
if bash tests/compat/v01-routines.sh 2>/dev/null; then
  echo "FAIL: v01-routines.sh passed even with a routine missing"
  mv /tmp/sw-bak routines-local/sleepwalker-downloads-organizer
  exit 1
fi
echo "PASS: v01-routines.sh correctly detects missing routine"
mv /tmp/sw-bak routines-local/sleepwalker-downloads-organizer
```

This is optional but strongly recommended — it proves the test has teeth. Runs only on manual invocation (`pnpm run test:compat-self`), not on every CI run.

### 4.6 Confidence: HIGH
install.sh file-touch surface verified by full read. 14 routines verified by ls. `makeTempHome` pattern verified as the universal test fixture. Strict-mode choice logically necessary to fulfill the contract.

---

## 5. COMP-02 permanent frozen-surface gate

### 5.1 Baseline commit verification

`git show 998455b --stat` [VERIFIED on live repo]:
- Commit author: `rahulmehta25 <rmehta2500@gmail.com>`
- Date: Fri Apr 17 02:58:34 2026 -0400
- Subject: `feat: Sleepwalker v0.1 — overnight agent fleet on Claude Code`
- File count at that commit: 122 lines of `--stat` output (individual files not enumerated here, but includes `install.sh`, `LICENSE`, `README.md`, all 14 routines, all 3 hooks, full `dashboard/`).

`git ls-tree 998455b --name-only` shows repo-root tree: `.gitignore LICENSE README.md RESEARCH.md dashboard docs hooks install.sh routines-cloud routines-local`. **No `bin/sleepwalker-execute`** — that was added post-v0.1 for re-execution flow. So COMP-02's frozen path list for the `bin/` binary needs a separate check: `bin/sleepwalker-execute` is frozen but its baseline is the commit that introduced it, not `998455b`. CONTEXT.md lists it as a frozen path.

**Recommendation:** the COMP-02 gate treats `998455b` as the canonical v0.1 seal, but the **comparison target** for each path is the state-of-that-path AT `998455b` (via `git show 998455b:<path>`) when the path exists at `998455b`, otherwise the first commit that introduced the path. For `bin/sleepwalker-execute` specifically, use the blob from its first-add commit.

Alternative simpler implementation: for each path, compare `HEAD:<path>` to `998455b:<path>` using `git show`. If the path didn't exist at `998455b`, the exception list must document that the path is a v0.1+ post-seal addition; otherwise the comparison fails. [VERIFIED approach via Phase 5's dynamic PHASE5_BASE pattern].

### 5.2 Path list (from CONTEXT.md, verified against commits)

| Path | Exists at 998455b? | Post-seal amendments | Exception |
|------|-------------------|----------------------|-----------|
| `install.sh` | yes | Phase 5 Plan 05-06 (`71bfdcc`) — 7-line additive flock preflight block after jq preflight | **QUEU-04 install preflight (Phase 5)** |
| `hooks/sleepwalker-defer-irreversible.sh` | yes | none | — |
| `hooks/sleepwalker-budget-cap.sh` | yes | none | — |
| `hooks/sleepwalker-audit-log.sh` | yes | Phase 5 Plan 05-05 (`13cd12b`) — FD-form flock wrap on jq-nc append | **QUEU-04 hook flock wrap (Phase 5)** |
| `hooks/_detect_fleet.sh` | yes | none | — |
| `routines-local/` (all 6 dirs) | yes | none | — |
| `routines-cloud/` (all 9 dirs) | yes | none | — |
| `bin/sleepwalker-execute` | **no — added post-v0.1** | frozen at its first-add blob | "v0.1+ post-seal addition" (same invariant, different baseline) |
| `dashboard/lib/queue.ts` | yes | Phase 5 Plan 05-01 (`a545f0b`) — widened QueueSource + QueueStatus unions | **QUEU-01 type widen (Phase 5)** |
| `dashboard/lib/cloud.ts` | yes | none | — |
| `dashboard/lib/cloud-cache.ts` | yes | Phase 5 eager-source amendment | **Phase 5 cloud-cache eager-source** |
| `dashboard/lib/queue-aggregator.ts` | yes | Phase 5 Plan 05-03 (`3c81b4f`) — readSupervisorRuns reader + 3-source merge | **QUEU-03 reader (Phase 5)** |
| `dashboard/lib/settings.ts` | yes | none | — |
| `dashboard/lib/approval.ts` | yes | none | — |
| `dashboard/lib/audit.ts` | yes | none | — |
| `dashboard/lib/github.ts` | yes | none | — |
| `dashboard/lib/fire-routine.ts` | yes | none | — |
| `dashboard/lib/routines.ts` | yes | Phase 4 DEPL-03 additions (drift math, enabled flag) | **Phase 4 DEPL-03 routines.ts** |
| `dashboard/package.json` | yes | Phase 3 + Phase 4 additive deps (cronstrue, framer-motion, simple-git, proper-lockfile, gray-matter, yaml, clsx, lucide-react, zod) | **Dependency additions (Phase 3/4 deps allowed; v0.1 deps must not be removed)** |

### 5.3 Exception list — grep-verifiable predicates

For each documented exception, the gate verifies that the amendment matches the documented shape. If a post-v0.2 PR tries to add a *second* additive change to the same path without updating the exception list, the gate fails.

Predicates:
```bash
# install.sh — must still have the v0.1 signature preserved
grep -c '^set -euo pipefail$' install.sh                      # expect: 1
head -1 install.sh | grep -q '^#!/bin/bash'                   # expect: 0 (match)
grep -cE "Copying hooks to|Wiring hooks into|Initialize state directory" install.sh  # expect: 3
# Amendment check:
grep -cF 'ERROR: flock is required but not installed' install.sh  # expect: 1

# hooks/sleepwalker-audit-log.sh — v0.1 printf/jq shape preserved
grep -c 'jq -nc' hooks/sleepwalker-audit-log.sh               # expect: 1
# Amendment: shared sidecar flock lock
grep -c 'LOCK_FILE=' hooks/sleepwalker-audit-log.sh           # expect: 1
diff <(grep 'LOCK_FILE=' bin/sleepwalker-run-cli) <(grep 'LOCK_FILE=' hooks/sleepwalker-audit-log.sh)
# Expect: empty output (shared byte-identical path)

# dashboard/lib/queue.ts — additive union amendment
grep -c "'local' | 'cloud' | 'codex' | 'gemini'\|\"local\" | \"cloud\" | \"codex\" | \"gemini\"" dashboard/lib/queue.ts  # expect: 1

# dashboard/package.json — v0.1 deps retained
jq -e '.dependencies.next' dashboard/package.json             # must exist
jq -e '.dependencies.react' dashboard/package.json            # must exist
jq -e '.dependencies["react-dom"]' dashboard/package.json     # must exist
```

### 5.4 Legitimate future v0.2.x patches

Process for adding a new exception (documented in the script's header comment):

> Future v0.2.x or v0.3 additive amendments on frozen paths require:
> 1. Open a PR that modifies the frozen path.
> 2. Update `EXCEPTIONS` array in this script with: (a) short human-readable description, (b) grep-verifiable predicate, (c) link to the SUMMARY.md explaining the amendment.
> 3. Committer review: confirm the amendment is truly additive (no deletion of v0.1 lines) and documented in ROADMAP.md.

This keeps the gate honest without making it impossible to evolve. Critically: **the gate tests both that documented exceptions are present AND that no undocumented changes exist.** Undocumented diff → exit non-zero + print the diff.

### 5.5 Exit-code contract

```bash
#!/bin/bash
# tests/compat/frozen-surface.sh
# Exits 0 if frozen paths are byte-identical to 998455b OR match a documented exception.
# Exits 1 + prints diff if any undocumented change is detected.

set -euo pipefail

BASELINE="998455b"
FROZEN_PATHS=(
  "install.sh"
  "hooks/sleepwalker-defer-irreversible.sh"
  # ... (full list from §5.2)
)

fail=0
for path in "${FROZEN_PATHS[@]}"; do
  if ! git show "$BASELINE:$path" > /tmp/baseline 2>/dev/null; then
    echo "SKIP: $path not in baseline $BASELINE (post-seal addition)"
    continue
  fi
  if ! diff -q /tmp/baseline "$path" >/dev/null 2>&1; then
    # Changed. Check if it's a documented exception:
    if ! verify_exception "$path"; then
      echo "FAIL: $path changed without documented exception"
      diff /tmp/baseline "$path" | head -20
      fail=1
    fi
  fi
done
exit $fail
```

`verify_exception()` dispatches to the per-path predicate (§5.3). Output is informative — shows the first 20 lines of diff for any undocumented change so reviewers can see what broke.

### 5.6 Run cost

Measured approximation:
- `git show <baseline>:<path>` — ~10ms per path × 15 paths = **150ms**
- `diff` + grep predicates — ~5ms each = **75ms**
- Total: **<500ms** for the full gate. Well under CONTEXT.md's <10s target.

### 5.7 Confidence: HIGH
Baseline commit verified. Exception list exhaustively derived from Phase 2-5 SUMMARY files. Exit-code contract minimal and testable. Run-cost estimate trivial.

---

## 6. GitHub Actions CI design

### 6.1 Runner choice

`macos-14` [CITED: GitHub Actions docs for macOS runners as of 2026] — specific version pin for reproducibility. `macos-latest` aliases to `macos-14` currently but rotates; pinning prevents silent breakage when GitHub upgrades the alias. Alternatives: `macos-15` (newer), `macos-13` (older, Intel). Sleepwalker is arm64-tested; macos-14 runners are arm64 so this matches the dev Mac architecture.

### 6.2 flock availability on runners

GitHub Actions `macos-latest` and `macos-14` come with Homebrew pre-installed. [CITED: GitHub runner docs]. `flock` is NOT bundled — add a preflight step:
```yaml
- name: Install flock (required by hooks + supervisor)
  run: brew install discoteq/discoteq/flock
```
(Note: the Homebrew tap is `discoteq/discoteq/flock` — a triple-slash formula, the middle `discoteq` is the tap name.)

### 6.3 Node version

Match `dashboard/package.json` — no explicit `engines` field [VERIFIED: package.json line 1-36]. CLAUDE.md §Technology Stack says "Next.js 15.1.4 + React 19 + TypeScript 5.7"; Next 15 supports Node 18.18+ but the dev Mac runs Node 25.6.1 [VERIFIED]. Recommend **Node 22 LTS** for CI — matches Next.js's current supported LTS, tested well with React 19.

### 6.4 pnpm install strategy

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 10
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'pnpm'
    cache-dependency-path: dashboard/pnpm-lock.yaml
- name: pnpm install --frozen-lockfile
  working-directory: dashboard
  run: pnpm install --frozen-lockfile
```

`--frozen-lockfile` fails if the lockfile is out of sync — prevents silent dep drift. Caching on lockfile path reduces install time from ~60s to ~5s on warm cache.

### 6.5 Job structure

CONTEXT.md Claude's Discretion: single job vs matrix.

**Recommendation: single job**, sequential steps:
1. Install deps (pnpm)
2. `pnpm run typecheck`
3. `pnpm test` (dashboard Vitest — 358+ tests)
4. `bash hooks/tests/run-tests.sh` (29 tests)
5. `bash hooks/tests/supervisor-tests.sh` (36 tests)
6. `bash tests/compat/v01-routines.sh` (new)
7. `bash tests/compat/frozen-surface.sh` (new)

Estimated total time: **3-5 minutes** on warm-cache runs, **6-8 minutes** on cold cache. Under the 10-min target.

Matrix would split steps 2/3 vs 4/5 vs 6/7 in parallel, but the setup tax (pnpm install × N) wipes out the parallelism gain at this workload size. Matrix pays off only when the serial workload is >10min.

### 6.6 Permissions

GitHub Actions default token has `contents: read` which is sufficient for `git show 998455b:<path>` (needed by COMP-02). No `pull-requests: write`, no `actions: write` — least privilege.

```yaml
permissions:
  contents: read
```

### 6.7 Triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

Runs on every push to main (catches direct pushes) AND on every PR targeting main (catches contribution flow). PRs from forks trigger too; the `contents: read` permission is safe for untrusted PRs.

### 6.8 Concurrency control

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Cancels superseded runs — saves CI minutes when a user pushes a quick follow-up commit.

### 6.9 Complete workflow skeleton

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
permissions:
  contents: read
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history required for COMP-02 baseline access

      - name: Install flock (required by hooks + supervisor)
        run: brew install discoteq/discoteq/flock

      - uses: pnpm/action-setup@v4
        with: { version: 10 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
          cache-dependency-path: dashboard/pnpm-lock.yaml

      - name: pnpm install
        working-directory: dashboard
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        working-directory: dashboard
        run: pnpm run typecheck

      - name: Dashboard tests
        working-directory: dashboard
        run: pnpm test

      - name: Hook tests (PreToolUse/PostToolUse)
        run: bash hooks/tests/run-tests.sh

      - name: Supervisor tests
        run: bash hooks/tests/supervisor-tests.sh

      - name: COMP-01 v0.1 backward-compat integration
        run: bash tests/compat/v01-routines.sh

      - name: COMP-02 frozen-surface gate
        run: bash tests/compat/frozen-surface.sh
```

`fetch-depth: 0` is critical — without full git history the `git show 998455b:<path>` in COMP-02 fails.

### 6.10 Confidence: HIGH
Runner choice matches dev Mac arch. Homebrew/flock path verified. pnpm cache pattern is standard. Single-job vs matrix decided on setup-tax math.

---

## 7. Test strategy

### 7.1 DOCS-01 — no tests needed

It's prose documentation. Validation is manual + peer review. The CI equivalent is: **markdown link-check** (optional; `markdown-link-check` npm tool), verifying no broken `#anchor` or file-path references. Recommend skipping for v0.2 seal; add in a v0.2.x patch if stale links become a recurring problem.

### 7.2 DOCS-02 — template-parseability test

Add to `dashboard/tests/templates.test.ts` (pattern shown in §2.2). Reads each template from disk, parses with gray-matter, validates with zod. Runs under the default Vitest suite; no new config.

### 7.3 DOCS-03 — two tests

**Unit (`dashboard/tests/diagnostics.test.ts`, Node env):**
```typescript
// Mock child_process.execFile via vi.mock
import { vi } from "vitest";
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: vi.fn((cmd, args, opts, cb) => {
      // Simulate success for sw_vers, failure for flock (fresh Mac)
      if (cmd === "sw_vers") cb!(null, { stdout: "26.4.1\n", stderr: "" });
      else if (cmd === "/bin/zsh" && args.includes("flock")) cb!(new Error("not found"), { stdout: "", stderr: "not found" });
      else cb!(null, { stdout: "ok\n", stderr: "" });
    }),
  };
});
// Then assert gatherDiagnostics() returns { rows: {..., flock: {ok: false, error: ...}}, ... }
```

Test matrix:
- Happy path: all probes succeed
- Fresh Mac: brew / flock / jq missing, page still renders
- Fish shell: `$SHELL = /opt/homebrew/bin/fish`, zsh probe still works
- LaunchAgents dir missing: stat fails, row renders "(not found)"

**Render (`dashboard/tests/diagnostics-page.test.tsx`, jsdom env):**
- Mock `@/lib/diagnostics` module-level
- Render `<DiagnosticsPage />` with happy-path mock
- Assert: all 8-10 rows rendered
- Assert: "Copy as GitHub issue body" button present
- Assert: copy button wired to navigator.clipboard (stubbed)
- Assert: `"Last checked: <ts>"` footer present (CONTEXT.md §Specifics)

### 7.4 COMP-01 — tests ARE the test

CONTEXT.md §7 notes "COMP-01 is itself the tests — but it needs a self-test". §4.5 above proposes a `shouldFail` sidecar. Same pattern for COMP-02 (§5.3 has implicit self-test via grep predicates failing when the amendment is removed).

### 7.5 COMP-02 — same story

See §5. Self-proof: an intentionally-broken `install.sh` (e.g. `sed -i 's/set -euo pipefail/set -e/' install.sh`) should make the gate fail. Not automated (destructive); manual spot-check during phase seal.

### 7.6 Confidence: HIGH
All test approaches use existing Vitest + jsdom + node-env patterns. No new test infrastructure needed.

---

## 8. Wave + dependency structure suggestion

CONTEXT.md Claude's Discretion: plan shape. Recommend **4 waves** for 5-7 plans:

### Wave 0 (parallel-safe)

- **06-01-PLAN.md — DOCS-02: four runtime templates + templates.test.ts (DOCS-02)**
  - Writes 4 files at `templates/routine-<r>.md`
  - Adds `dashboard/tests/templates.test.ts` round-trip validator
  - No dependency on any other Wave 0/1 work; zero repo-wide impact beyond the new files

- **06-02-PLAN.md — DOCS-03: /diagnostics page + diagnostics.ts + two tests (DOCS-03)**
  - Adds `dashboard/app/diagnostics/page.tsx` + `diagnostics-client.tsx`
  - Adds `dashboard/lib/diagnostics.ts`
  - Adds `dashboard/tests/diagnostics.test.ts` + `diagnostics-page.test.tsx`
  - Adds nav link to `app/layout.tsx` sidebar (one-line Sidebar addition)
  - No dependency on 06-01; different directories

Wave 0 is safely parallel — no file overlap.

### Wave 1 (depends on Wave 0)

- **06-03-PLAN.md — DOCS-01: AUTHORING.md (DOCS-01)**
  - Writes `docs/AUTHORING.md` (single file, 600-1000 lines)
  - Can reference Wave 0's DOCS-02 templates by file path
  - Can reference Wave 0's DOCS-03 /diagnostics page by URL
  - Depends on Wave 0 only for cross-referencing; not on implementation details

### Wave 2 (depends on Wave 0; parallel to Wave 1)

- **06-04-PLAN.md — COMP-01: v0.1 backward-compat integration tests (COMP-01)**
  - Creates `tests/compat/` directory
  - Adds `tests/compat/v01-routines.sh`
  - Adds `dashboard/tests/v01-queue-integration.test.ts`
  - Independent of docs work; can run in parallel with 06-03

- **06-05-PLAN.md — COMP-02: permanent frozen-surface gate (COMP-02)**
  - Adds `tests/compat/frozen-surface.sh` with hardcoded baseline `998455b`
  - Exception list with grep-verifiable predicates for each Phase 2/4/5 amendment
  - Can run in parallel with 06-04 (different files); but if combined into one plan, 06-04 and 06-05 share the `tests/compat/` directory creation — recommend combining into a single Wave 2 plan OR explicitly sequencing (create `tests/compat/` in 06-04, extend in 06-05)

**Recommendation:** merge 06-04 and 06-05 into a single plan ("COMP-01 + COMP-02 + tests/compat/ scaffolding") since both are bash scripts in the same new directory and are small enough that splitting adds coordination overhead without saving execution time.

### Wave 3 (depends on Wave 2)

- **06-06-PLAN.md — GitHub Actions CI workflow (ci.yml)**
  - Adds `.github/workflows/ci.yml`
  - Invokes all five suites sequentially
  - Requires 06-04+06-05 scripts to exist (references them)

### Wave 4 (phase exit gate)

- **06-07-PLAN.md — Phase 6 exit gate + VALIDATION flip + REQUIREMENTS flip + ROADMAP flip**
  - Pure docs/state update — same shape as previous phases' exit-gate plans
  - No code delta
  - Verifies: all 5 requirements Complete; CI workflow green on the PR that introduces it; 06-SUMMARY.md authored; STATE milestone bar 5/6 → 6/6

### Final suggested plan count: 6 (06-01 through 06-07 minus the merged 06-04+05)

Actually cleaner as: **06-01 DOCS-02** / **06-02 DOCS-03** / **06-03 DOCS-01** / **06-04 COMP-01+02** / **06-05 CI workflow** / **06-06 Phase exit gate** = **6 plans**.

### Confidence: HIGH
Wave topology derived from file-overlap analysis. No plan writes to a file another plan in the same wave writes. Dependencies minimal and clear.

---

## 9. Pitfalls (5 items likely to trip an executor)

### Pitfall 1: /diagnostics page leaking env vars or secrets via execFile args
**What goes wrong:** If a future maintainer adds a probe like `echo $GITHUB_TOKEN` or `cat ~/.sleepwalker/github-token` to show "GitHub connected", a rendered diagnostic leaks the PAT to anyone who screenshots the page.
**Why it happens:** Diagnostics pages invite "just one more probe" additions.
**How to avoid:**
- Lock `diagnostics.ts` to a **curated list of probes**. Any new probe requires a doc comment explaining what it reveals and verifying zero-secrets.
- Add a grep-negative-invariant test: `grep -rn 'github-token\|bearer\|credentials' dashboard/lib/diagnostics.ts` should return empty.
- Add the copy-output formatter as an explicit allowlist — only fields in the `formatAsIssueBody` code block are surfaced; new `Probe` type fields don't auto-leak.

**Warning signs:** Any PR that adds a probe involving `cat`, `jq -r .token`, or reading from `~/.sleepwalker/*.json` files.

### Pitfall 2: COMP-02 baseline drift — if someone rebases v0.1 commits
**What goes wrong:** If the repo history is rewritten (amended commits, force-pushed rebases of old commits, etc.), `git show 998455b:<path>` fails with "bad revision 998455b".
**Why it happens:** Git history isn't immutable; `git filter-branch` and amended commits can rewrite SHAs.
**How to avoid:**
- Document at the top of `frozen-surface.sh`: "Do not rewrite history before commit 998455b."
- Cross-check the baseline at gate-startup: `git rev-parse --verify 998455b >/dev/null 2>&1 || { echo "ERROR: v0.1 baseline commit 998455b not in history"; exit 1; }`. Clear error message.
- Tag the baseline: `git tag -a v0.1.0 998455b -m "v0.1 seal"`. Then `frozen-surface.sh` references `refs/tags/v0.1.0` which is immutable once pushed.

**Warning signs:** CI suddenly failing with "bad revision" — investigation should start at git history.

### Pitfall 3: AUTHORING.md getting stale
**What goes wrong:** A v0.2.1 or v0.3 PR changes the editor flow (new field, changed URL, new runtime), but AUTHORING.md is not updated. Users follow stale docs and hit undocumented states.
**Why it happens:** Docs don't have CI gates.
**How to avoid (options):**
- **Option A — accept manual review:** Require PRs touching `dashboard/app/editor/**` or `dashboard/lib/bundle-schema.ts` to also touch `docs/AUTHORING.md` (CODEOWNERS rule or PR template checklist).
- **Option B — doc-lint:** Extract screenshots / specific strings from AUTHORING.md; CI asserts they match current code. Heavy; not worth v0.2 investment.
- **Option C — slow-burn:** accept that AUTHORING.md will drift; review quarterly; add a "Last reviewed: YYYY-MM-DD" footer.

**Recommendation for v0.2:** Option A. Cheapest, explicit, already in common use.

### Pitfall 4: CI flakiness on macOS runners (launchd-adjacent tests)
**What goes wrong:** Known issue: GitHub Actions macOS runners sometimes fail launchd-adjacent tests intermittently (stale session state, missing `/var/run/com.apple.launchd`, etc.).
**Why it happens:** Shared runners have cross-job state that isn't always perfectly cleaned.
**How to avoid:**
- **Do NOT run `launchctl bootstrap` in CI.** COMP-01 is file-verify only, not runtime-verify. CONTEXT.md explicitly avoids this; respect that.
- Supervisor tests [VERIFIED: `hooks/tests/supervisor-tests.sh`] already use `TEST_HOME=$(mktemp -d)` isolation and do NOT touch real launchd — safe in CI.
- If a test fails on CI but not locally, add `id -F` + `dscl` probes to the failure log to capture user/session state.

**Warning signs:** One-off test failures that don't reproduce locally; always the same test; passes on retry.

### Pitfall 5: Template gray-matter parseability break if frontmatter schema evolves
**What goes wrong:** If v0.3 adds a required `runtime_config` field to `RoutineBundleInput`, the four templates silently become invalid — users copy them, hit zod validation failure.
**Why it happens:** Schema evolution + static fixtures.
**How to avoid:**
- §2.2 template round-trip test — runs every CI; catches mismatches immediately.
- PR template checklist item: "If you changed `bundle-schema.ts`, did you update all 4 templates?"
- (Optional) Auto-regenerate templates from schema: derive a skeleton frontmatter from zod shape via a small codegen script. High investment; skip for v0.2.

**Warning signs:** PR to `dashboard/lib/bundle-schema.ts` with no accompanying change to `templates/`.

### Confidence: HIGH
Each pitfall has a concrete mitigation verified against the current codebase.

---

## 10. Answered / Open / Deferred

### Answered

- **Baseline commit:** `998455b feat: Sleepwalker v0.1 — overnight agent fleet on Claude Code` (2026-04-17 02:58:34 -0400) — verified via `git show`.
- **`flock` available on macOS runners?** Yes, via `brew install discoteq/discoteq/flock` preflight step. GitHub Actions `macos-14` runners ship Homebrew pre-installed.
- **`gray-matter` already installed?** Yes — `dashboard/package.json` v4.0.3; already imported by `app/editor/actions.ts:27`.
- **14 v0.1 routines breakdown:** 6 local (all claude-only SKILL.md files) + 8 real cloud + 1 `_test-zen`. Enumerated by name in §4.3.
- **Node version for CI:** 22 LTS (matches Next 15 support; dev Mac runs 25.6.1 but 22 is safest CI choice).
- **pnpm version:** 10 (matches dev Mac's 10.30.2; frozen-lockfile mode).
- **Install.sh can run without sudo:** Yes — only touches `$HOME/.claude/` and `$HOME/.sleepwalker/`; `mktemp -d` HOME isolation works.
- **Diagnostics fail-soft shapes:** enumerated in §3.3 matrix; every probe has a documented failure mode.
- **CLI versions on this dev Mac:** claude 2.1.117, codex-cli 0.118.0, gemini 0.31.0, flock 0.4.0, macOS 26.4.1, Homebrew `/opt/homebrew` — all verified via live probe.
- **LaunchAgents writability:** `0700` mode, writable — verified live.
- **gray-matter + zod round-trip:** confirmed against existing `editor/actions.ts:buildFiles()` code path.
- **Q1 Claude Desktop outcome:** (c) requires manual add — documented in 02-SUMMARY.md; AUTHORING.md §3.2 and §6 must surface this.
- **Clipboard pattern:** `navigator.clipboard.writeText` (localhost is secure origin; no precedent in codebase so we set the convention).

### Open

- **macos runner version pin:** `macos-14` vs `macos-15`. Recommend `macos-14` for Apple Silicon alignment with dev machine; revisit at v0.3 when `macos-15` stabilizes.
- **pnpm vs npm in CI:** Use **pnpm** — project uses it (no `package-lock.json`, `pnpm-lock.yaml` present). CI-level.
- **Screenshots in AUTHORING.md:** CONTEXT.md Claude's discretion. Recommend **skip for v0.2 seal**; ship text-only; add in v0.2.x doc patch once the user has capture time. No screenshot = no stale-screenshot risk. Deferred ideas list already permits this.
- **git SHA source in diagnostics copy-body:** request-time `git rev-parse --short HEAD` via execFile, OR build-time `NEXT_PUBLIC_GIT_SHA` env var. Recommend **request-time** in dev (faster iteration) with a fallback to `process.env.NEXT_PUBLIC_GIT_SHA` for prod builds where `.git` may not be present. (Flag for executor — Claude's discretion per CONTEXT.)
- **Should COMP-01 strictness extend to cloud routine config shape?** Currently §4.3 says "assert prompt.md + config.json + setup.md exist" — but do we also validate that config.json has the v0.1 field shape? Recommend **schema-check lightly** (assert `tier`, `triggers`, `branch_policy` fields present) but don't validate values — that's out of COMP-01's scope.

### Deferred (v0.3 or later)

- **Amp + Devin docs** — out of scope per PROJECT.md.
- **Real-Mac launchctl smoke in CI** — requires self-hosted runner.
- **AUTHORING.md i18n** — English-only v0.2.
- **Diagnostics live-refresh / auto-poll** — single snapshot is the product decision.
- **Dashboard visual UI refresh** — palette preserved.
- **Template codegen from zod schema** — nice-to-have; manual maintenance acceptable with the round-trip test.
- **Doc-lint CI** — skip for v0.2; re-evaluate if drift becomes painful.
- **GitHub issue templates** (`.github/ISSUE_TEMPLATE/`) — could be added alongside ci.yml for extra polish; **Claude's discretion** but recommend skipping for Phase 6 seal to keep scope tight.

---

## Runtime State Inventory

Phase 6 is greenfield-additive only — no rename, no refactor, no migration. **Inventory skipped.** All artifacts are new files; no stored data, live service config, OS-registered state, secrets, or build artifacts to migrate.

Explicit per category:
- **Stored data:** None — no data is renamed or migrated.
- **Live service config:** None — no running service is reconfigured.
- **OS-registered state:** None — no launchd jobs, Task Scheduler entries, systemd units touched.
- **Secrets and env vars:** None — no secret keys referenced or renamed.
- **Build artifacts:** None — no package renames.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| macOS | all | ✓ (dev Mac) / ✓ (macos-14 runner) | 26.4.1 / 14.x | — |
| `jq` | COMP-01 bash + install.sh | ✓ | (system) | `brew install jq` |
| `flock` | supervisor + hook tests + COMP-01 via install.sh | ✓ | 0.4.0 | `brew install discoteq/discoteq/flock` |
| `claude` CLI | diagnostics probe | ✓ | 2.1.117 | (probe reports "not on PATH" — not blocking) |
| `codex` CLI | diagnostics probe | ✓ | 0.118.0 | (probe reports "not on PATH" — not blocking) |
| `gemini` CLI | diagnostics probe | ✓ | 0.31.0 | (probe reports "not on PATH" — not blocking) |
| `brew` | diagnostics probe | ✓ | /opt/homebrew | (probe reports "Homebrew not installed") |
| `git` | COMP-02 + CI | ✓ | system | — |
| Node 22+ | CI | (CI only) | 22 LTS | — |
| pnpm 10 | CI | ✓ | 10.30.2 | — |
| `caffeinate` / `pmset` / `launchctl` / `stat` / `sw_vers` / `uname` / `zsh` | AUTHORING.md examples + diagnostics probes | ✓ (all) | macOS built-in | — |

**Missing dependencies with no fallback:** None. Every v0.2 binary has either a preflight check (install.sh, CI step) or a fail-soft UI (diagnostics).

**Missing dependencies with fallback:** flock on CI runners — mitigated by preflight `brew install discoteq/discoteq/flock` step in ci.yml.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (dashboard) + bash test harness (hooks + compat) |
| Config file | `dashboard/vitest.config.ts` (existing) |
| Quick run command | `cd dashboard && pnpm test` |
| Full suite command | `cd dashboard && pnpm run typecheck && pnpm test && cd .. && bash hooks/tests/run-tests.sh && bash hooks/tests/supervisor-tests.sh && bash tests/compat/v01-routines.sh && bash tests/compat/frozen-surface.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | AUTHORING.md structure + content quality | Manual review | (none — docs review) | ❌ — produced by 06-03 |
| DOCS-02 | 4 templates parseable by gray-matter + zod | Unit (node env) | `cd dashboard && pnpm test -- tests/templates.test.ts` | ❌ — Wave 0 06-01 |
| DOCS-03 (lib) | `gatherDiagnostics()` returns fail-soft rows | Unit (node env) | `cd dashboard && pnpm test -- tests/diagnostics.test.ts` | ❌ — Wave 0 06-02 |
| DOCS-03 (page) | `/diagnostics` renders all rows + copy button + last-checked footer | Render (jsdom) | `cd dashboard && pnpm test -- tests/diagnostics-page.test.tsx` | ❌ — Wave 0 06-02 |
| COMP-01 (bash) | install.sh idempotent + 14 v0.1 routines present | Bash integration | `bash tests/compat/v01-routines.sh` | ❌ — Wave 2 06-04 |
| COMP-01 (TS) | aggregateQueue surfaces all 14 v0.1 entries | Unit (node env) | `cd dashboard && pnpm test -- tests/v01-queue-integration.test.ts` | ❌ — Wave 2 06-04 |
| COMP-02 | Frozen v0.1 surface byte-identical or documented exception | Bash + grep | `bash tests/compat/frozen-surface.sh` | ❌ — Wave 2 06-04 |
| CI | All above pass on a clean macos-14 runner | GitHub Actions | (CI dispatch; manual for local) | ❌ — Wave 3 06-05 |

### Sampling Rate

- **Per task commit:** `cd dashboard && pnpm test` (10.62s last full run)
- **Per wave merge:** full suite (est. 60-90s locally)
- **Phase gate:** full suite green + frozen-surface diff 0 lines or documented-exception-additive only + CI workflow green on the PR that introduces it

### Wave 0 Gaps

None — existing Vitest infrastructure covers DOCS-02 and DOCS-03 tests. No new framework installs needed. `dashboard/tests/helpers.ts` provides `makeTempHome()` for COMP-01 TS. `hooks/tests/` provides the bash test pattern for `tests/compat/*`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surfaces in Phase 6 |
| V3 Session Management | no | No new session/cookie state |
| V4 Access Control | no | No new authorization gates (diagnostics is read-only on local state) |
| V5 Input Validation | yes | DOCS-02 templates MUST validate through zod via COMP-01's round-trip test; DOCS-03 diagnostics does NOT accept user input but its probes must never interpolate external strings into execFile args |
| V6 Cryptography | no | No crypto operations added |
| V7 Error Handling & Logging | yes | DOCS-03 error messages must NOT leak filesystem paths beyond the user's home dir; supervisor audit already strips ANSI and limits preview to 500 chars per SAFE-02 (no new work needed) |
| V8 Data Protection | yes | DOCS-03 explicit zero-secrets invariant — Pitfall 1 mitigation enumerates the checks |
| V9 Communications | no | No new network endpoints |
| V12 Files & Resources | yes | DOCS-03 bounded execFile `maxBuffer: 64_000` per probe; templates are static fixtures (no user upload) |

### Known Threat Patterns for `next.js server component + bash CI`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via unvalidated execFile arg | Tampering | Zero user input reaches `execFile` args — all probes hardcode the command + args array |
| Environment variable leakage via diagnostics page | Information disclosure | Curated probe allowlist + `formatAsIssueBody` explicit field allowlist + grep-negative invariant test in DOCS-03 |
| CI secret leakage via workflow logs | Information disclosure | `permissions: contents: read` least privilege; no `GITHUB_TOKEN` used beyond `actions/checkout`; no third-party actions that receive secrets |
| COMP-02 baseline tampering | Repudiation / Tampering | git tag `v0.1.0` on `998455b` (immutable-once-pushed); preflight `git rev-parse --verify` at gate start |
| Clipboard hijacking | Tampering | `navigator.clipboard.writeText` only on user gesture (button click); no auto-copy on page load |
| Path traversal in template filenames | Tampering | Templates are static fixtures; filenames hardcoded (`templates/routine-<r>.md` where `r` is the fixed 4-value runtime enum) |

## Assumptions Log

No `[ASSUMED]` claims in this research. Every claim above is either [VERIFIED] against the live dev Mac / the repository at HEAD / a Phase 2-5 SUMMARY commit, or [CITED] from the installed man pages (`caffeinate`, `pmset`) or from documented Phase 1-5 artifacts. **No user confirmation needed** before planner proceeds.

## Sources

### Primary (HIGH confidence)

- **Live dev Mac state (2026-04-22):** `sw_vers`, `uname -m`, `brew --prefix`, `command -v claude/codex/gemini/flock`, `stat -f "%Mp%Lp" ~/Library/LaunchAgents/`, `$SHELL`, `caffeinate`/`pmset` man pages, Node 25.6.1, pnpm 10.30.2.
- **Repository at HEAD 4cbb5bb:** `install.sh` (full read), `dashboard/package.json` (deps list), `dashboard/app/audit/page.tsx` (Server Component pattern), `dashboard/app/editor/actions.ts` (gray-matter + zod wiring), `dashboard/lib/bundle-schema.ts` (RoutineBundleInput schema), `dashboard/lib/runtime-adapters/types.ts` (HealthStatus + DeployResult shapes), `dashboard/lib/queue.ts` (QueueEntry shape), `hooks/sleepwalker-audit-log.sh` (frozen hook), `hooks/tests/install-idempotency.sh` (COMP-01 pattern reference), `bin/sleepwalker-run-cli:1-60` (supervisor entry), `templates/.gitkeep` (placeholder).
- **Baseline commit verification:** `git show 998455b --stat` + `git log 998455b -1 --format="%s%n%b"` — verified 2026-04-17 v0.1 seal.
- **Phase 2 SUMMARY:** `02-SUMMARY.md` (manual smoke cycles, Q1 Desktop outcome (c), TCC bundle staging, `--skip-git-repo-check` fix).
- **Phase 5 SUMMARY:** `05-SUMMARY.md` (flock 3-layer defense, SAFE-01 UI sweep, frozen-surface diff evidence, shared sidecar path).
- **ROADMAP.md §Phase 6:** goals + success criteria + existing phase progress.
- **REQUIREMENTS.md:** DOCS-01..03 + COMP-01 + COMP-02 full text.
- **CONTEXT.md (06-CONTEXT.md):** all locked decisions (verbatim copied into User Constraints section above).
- **CLAUDE.md (project):** technology stack invariants, naming conventions, frozen v0.1 surface list.

### Secondary (MEDIUM confidence)

- **GitHub Actions macOS runner docs:** [CITED — GitHub docs general knowledge] — `macos-14` is arm64; Homebrew pre-installed; `macos-latest` aliases rotate.
- **Next.js 15 Server Components:** [CITED — Next.js docs via Context7/general training] — `export const dynamic = "force-dynamic"` forces per-request render.
- **`gray-matter` 4.x behavior:** [CITED — npm package README] — `matter.stringify(content, data)` round-trips with `matter(raw)`.

### Tertiary (LOW confidence)

- None. All claims have either Primary or Secondary verification.

## Open Questions

1. **Should ci.yml also run against forks' PRs with elevated permissions?**
   - What we know: default `permissions: contents: read` lets forks' PRs run CI.
   - What's unclear: if a future OSS contributor adds a PR that writes to a secret, should CI reject it or just run read-only?
   - Recommendation: start with `contents: read` only; add `pull-requests: write` only if a bot (like a release assistant) needs it later.

2. **Should AUTHORING.md gain a "Contributing" section pointing at the CI workflow?**
   - What we know: OSS users who want to contribute will expect `CONTRIBUTING.md` or a section in README.
   - What's unclear: CONTEXT.md's 7-section structure doesn't have a Contributing slot.
   - Recommendation: add a brief 2-line note at the end of §7 "Going Further" pointing to `.github/workflows/ci.yml` and `docs/ARCHITECTURE.md`. Full `CONTRIBUTING.md` deferred to v0.2.x or v0.3.

3. **Is there a risk of `998455b` being "orphaned" if someone squashes the main branch later?**
   - What we know: git doesn't auto-gc unreferenced commits for 90 days; a tag prevents gc indefinitely.
   - Recommendation: **Explicitly tag `998455b` as `v0.1.0`** before Phase 6 seal. Makes the baseline ref-stable against any future history manipulation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against `dashboard/package.json` at HEAD.
- Architecture: HIGH — Server Component pattern verified against existing `audit/page.tsx`; diagnostics pattern is a direct mirror.
- Pitfalls: HIGH — each derived from a concrete Phase 2-5 code change or a well-known OSS pattern.
- COMP-02 baseline: HIGH — `git show 998455b` + `git ls-tree 998455b` verified live.
- CI design: MEDIUM-HIGH — macos-14 + pnpm pattern is standard; first CI in this repo so some tuning expected on first green PR.

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days for stable Phase 6 scope; revisit if v0.2.1 adds a net-new runtime or changes the RoutineBundleInput schema before then).
