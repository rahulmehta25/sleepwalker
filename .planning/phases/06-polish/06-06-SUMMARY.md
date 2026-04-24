---
phase: 06-polish
plan: 06
subsystem: ci
tags: [ci, github-actions, macos, verification, backward-compat, oss]
requires: [06-01, 06-02, 06-03, 06-04, 06-05]
provides:
  - .github/workflows/ci.yml (GitHub Actions CI workflow)
  - macos-14 runner with fetch-depth:0 for COMP-02 baseline access
  - 6-step sequential verification (typecheck + dashboard tests + hook tests + supervisor tests + COMP-01 + COMP-02)
affects:
  - Every push to main and every pull_request against main from this commit forward
tech-stack:
  added: [GitHub Actions workflows, actions/checkout@v4, actions/setup-node@v4, pnpm/action-setup@v4, Homebrew discoteq/flock tap, macos-14 Apple Silicon runner]
  patterns: [least-privilege permissions, concurrency cancel-in-progress, pinned action major versions, frozen-lockfile install, non-watch vitest --run]
key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - docs/activity_log.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/phases/06-polish/06-06-SUMMARY.md
decisions:
  - Single job `verify` not a matrix — 06-CONTEXT locked single-job setup-tax math vs parallel-fan-out
  - runs-on macos-14 (Apple Silicon pinned) over macos-latest — reproducibility + COMP-01 bash harness uses Homebrew prefix probes
  - fetch-depth 0 on checkout — COMP-02 `git show 998455b:<path>` requires full history
  - pnpm test --run (non-watch) — Vitest in watch mode would hang CI forever
  - permissions contents:read at workflow root — least privilege, no pull-requests:write, forks cannot access secrets
  - concurrency cancel-in-progress:true — supersede in-flight runs on force-push/amend
  - Pinned action majors (@v4) not SHAs — pin-to-SHA hardening deferred to v0.3 per threat model
  - ci.yml added as separate sibling to pre-existing test.yml — plan 06-06 is strictly additive; test.yml left unmodified
metrics:
  duration: ~8 min
  completed: 2026-04-24
  commit: 42b31bc
---

# Phase 6 Plan 06: CI Workflow Summary

## One-liner

Added `.github/workflows/ci.yml` — the canonical GitHub Actions CI workflow that runs typecheck, dashboard tests, hook tests, supervisor tests, and both v0.1 backward-compat gates (COMP-01 + COMP-02) sequentially on every push to main and every PR against main, using a `macos-14` Apple Silicon runner with `fetch-depth: 0` for COMP-02 baseline access.

## What was built

### `.github/workflows/ci.yml` (new, 71 lines)

Single-file GitHub Actions workflow. Structure (top to bottom):

**Triggers** — push to `[main]` + pull_request against `[main]`.

**Permissions** — `contents: read` at workflow root. Least privilege. Forks cannot access secrets (GitHub Actions default for untrusted PRs). No `pull-requests: write` scope, so runners cannot post comments or merge.

**Concurrency** — `group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`. Supersedes in-flight runs when contributors force-push or amend.

**Job `verify` on `runs-on: macos-14`** (Apple Silicon pinned, per 06-CONTEXT locked single-job macOS runner decision — macOS is the only supported dev platform for sleepwalker):

1. **Checkout** — `actions/checkout@v4` with `fetch-depth: 0`. CRITICAL for COMP-02: Plan 06-05's `tests/compat/frozen-surface.sh` resolves v0.1 seal `998455b` via `git rev-parse --verify` + `git show "$BASELINE:$path"`; a shallow clone would make those commands exit non-zero and trigger the gate's exit-2 "baseline-missing" remediation path instead of running the actual surface diff.
2. **Install flock** — `brew install discoteq/discoteq/flock`. Required by hook audit-log writer (Plan 05-05) + supervisor audit_emit (Plan 05-04) + `bin/sleepwalker-execute` (Phase 5 QUEU-04 amendments). The preflight check in `install.sh` (Plan 05-06) aborts early if flock is missing; COMP-01 `tests/compat/v01-routines.sh` delegates to `hooks/tests/install-idempotency.sh` which exercises that preflight.
3. **Install jq** — conditional `command -v jq` probe with `brew install jq` fallback. v0.1 prereq.
4. **Setup pnpm** — `pnpm/action-setup@v4` version 10 (matches dev Mac pnpm 10.30.2 and `dashboard/pnpm-lock.yaml`).
5. **Setup Node** — `actions/setup-node@v4` node-version 22 (LTS, matches Next.js 15 current support) with `cache: pnpm` and `cache-dependency-path: dashboard/pnpm-lock.yaml`.
6. **Install dependencies** — `pnpm install --frozen-lockfile` in `dashboard/`. Prevents silent dep drift.
7. **Typecheck** — `cd dashboard && pnpm run typecheck` (tsc --noEmit).
8. **Dashboard tests** — `cd dashboard && pnpm test --run` (non-watch mode — watch would hang CI forever).
9. **Hook tests** — `bash hooks/tests/run-tests.sh`.
10. **Supervisor tests** — `bash hooks/tests/supervisor-tests.sh`.
11. **COMP-01** — `bash tests/compat/v01-routines.sh` (14 v0.1 routines + install.sh idempotency per Plan 06-04).
12. **COMP-02** — `bash tests/compat/frozen-surface.sh` (27 Group A + 12 Group B + 3 Group C paths vs hardcoded baseline `998455b` per Plan 06-05).

## Verification performed in-session

- **YAML parses cleanly:** `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml'))"` exit 0. Top-level keys `[name, on, permissions, concurrency, jobs]`. Single job `verify` with 12 steps.
- **All plan invariant greps pass** (each count in parens):
  - `runs-on: macos-14` (1) — exactly one occurrence as required
  - `fetch-depth: 0` (1) — COMP-02 baseline access
  - `contents: read` (1) — least privilege
  - `cancel-in-progress: true` (1) — concurrency control
  - `frozen-lockfile` (1) — no silent dep drift
  - `node-version: 22` (1) — Next.js 15 LTS
  - `version: 10` (1) — pnpm 10 matches lockfile
  - `brew install discoteq/discoteq/flock` (1) — flock tap
  - `actions/checkout@v4` (1) + `actions/setup-node@v4` (1) + `pnpm/action-setup@v4` (1) — pinned majors
  - `pnpm run typecheck` (1), `pnpm test --run` (1) — non-hanging test invocation
  - `bash hooks/tests/run-tests.sh` (1), `bash hooks/tests/supervisor-tests.sh` (1)
  - `bash tests/compat/v01-routines.sh` (1), `bash tests/compat/frozen-surface.sh` (1)
- **Negative invariants pass:**
  - `grep -c 'secrets\.' ci.yml` = 0 (read-only workflow; no token references)
  - `grep -c '^\s*matrix:' ci.yml` = 0 (single-job per 06-CONTEXT decision)
  - `grep -c 'branches: \[main\]' ci.yml` = 2 (push trigger + pull_request trigger)
- **Pre-existing `test.yml` untouched:** `git diff --stat .github/workflows/test.yml` = empty. The parallel-session `50055f9 test: add lifecycle integration tests, supervisor bash tests, and CI workflow` commit added `test.yml` (ubuntu-latest + macos-latest split); Plan 06-06 is strictly additive and leaves that workflow alone per the task prompt. Two workflows will run side-by-side on PRs — `Tests` (test.yml) and `CI` (ci.yml) — which is redundant but not harmful; Plan 06-07 or a future cleanup can rationalize them.
- **No file deletions:** `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty.
- **Pre-existing untracked files preserved:** `CLAUDE.md` + 2 screenshot PNGs remain untracked per explicit per-file `git add .github/workflows/ci.yml` staging.

## First CI run status

**Deferred to post-push.** The workflow file exists on main at commit `42b31bc` but has not executed yet — GitHub Actions runs workflows on GitHub's infrastructure, which requires the commit to be pushed to the remote. The first run will occur on the next `git push origin main` (or on any PR against main from a fork).

**Expected first-run result: GREEN** across all six verification steps. Rationale:
- Plan 06-04 `tests/compat/v01-routines.sh` passes locally at HEAD with `Summary: 32 passed, 0 failed`.
- Plan 06-05 `tests/compat/frozen-surface.sh` passes locally at HEAD with `==> COMP-02 PASS: frozen surface intact vs 998455b` in 0.384s.
- Hook tests (`run-tests.sh`) last measured 29/29 at Phase 5 exit gate.
- Supervisor tests (`supervisor-tests.sh`) last measured 36/36 across 30 scenarios at Phase 5 exit gate.
- Typecheck last measured exit 0 at Plan 06-05 closeout.
- Dashboard test suite last measured 375/375 at Plan 06-04 closeout (parallel-session commits 50055f9/c398a3e/e46bb1b may have shifted that count but direction is additive per conventional-commit messages).

**Potential first-run failure modes** (all documented in plan's verification section):
1. YAML indent error on line not caught by `yaml.safe_load` — mitigated by in-session `python3 yaml.safe_load` gate.
2. Path typo in any `bash ...` step — mitigated by grep-count invariants matching plan's exact string literals.
3. `brew install discoteq/discoteq/flock` tap flakiness — retry is cheap; tap is GitHub-hosted.
4. `fetch-depth: 0` interaction with GitHub's default shallow clone — explicitly set so baseline commit `998455b` is reachable.
5. pnpm cache miss on first run — only slows the first run; not a correctness failure.

**Observed CI runtime:** Not measured in-session. Plan 06-RESEARCH §6.5 estimates 3–5 minutes warm cache, 6–8 minutes cold cache. Runtime can be captured after first push via `gh run list --workflow=ci.yml --limit 1 --json durationMs`.

## YAML-lint fixes applied

None. The workflow file was authored directly from the plan's `<interfaces>` skeleton without iteration — `python3 yaml.safe_load` parsed it cleanly on first attempt, and all 16 acceptance grep invariants passed without edits.

## Deviations from Plan

None — plan executed exactly as written. Zero Rule 1 bugs, zero Rule 2 missing-critical auto-fixes, zero Rule 3 blocking-issue auto-fixes, zero Rule 4 architectural decisions, zero auth gates.

One plan-level observation (not a deviation): the existing `.github/workflows/test.yml` was added by parallel-session commit `50055f9` between Plan 06-05's seal and this plan's execution. The plan is silent on whether to consolidate or leave it. Per the task prompt's explicit instruction "DO NOT modify or delete it", `test.yml` was left untouched and `ci.yml` ships alongside it. Rationalization of the two workflows (whether to consolidate, delete test.yml, or keep both) is deferred — not blocking for Plan 06-07 or Phase 6 exit gate.

## Recommendation for Plan 06-07 / v0.1.0 tagging

Plan 06-05 COMP-02 gate anchors on the literal short SHA `998455b`. If history is ever rewritten or the commit is garbage-collected, the gate exits 2 with clear remediation text. Before publishing the repo to a wider audience (or running CI on a clone without access to the full local git pack), tag `v0.1.0` on `998455b`:

```bash
git tag -a v0.1.0 998455b -m "v0.1 seal — 2026-04-17 overnight agent fleet on Claude Code"
git push origin v0.1.0
```

Then optionally upgrade the gate's baseline ref to `refs/tags/v0.1.0` for maximum ref-stability (1-line amendment to `tests/compat/frozen-surface.sh`).

**This is explicitly Plan 06-07's responsibility** (or a user-initiated ops step before merging to a public remote). Plan 06-06 does not perform the tagging unilaterally.

## Known stubs

None. CI workflow is fully wired — no placeholder jobs, no TODO steps, no hardcoded mock data.

## Self-Check: PASSED

File existence:
- `FOUND: .github/workflows/ci.yml`
- `FOUND: .planning/phases/06-polish/06-06-SUMMARY.md`

Commit existence:
- `FOUND: 42b31bc` (`git log --oneline --all | grep -q 42b31bc` exit 0)

Untouched contracts:
- `FOUND: .github/workflows/test.yml` (pre-existing, unchanged — `git diff --stat` empty)
- `FOUND: tests/compat/v01-routines.sh` (Plan 06-04, unchanged)
- `FOUND: tests/compat/frozen-surface.sh` (Plan 06-05, unchanged)
- `FOUND: hooks/tests/run-tests.sh` + `hooks/tests/supervisor-tests.sh` (Phase 2/5, unchanged)

Invariant proofs (see Verification section above): all 16 positive greps count = 1 each; all 3 negative greps count = 0 or exactly the required value.
