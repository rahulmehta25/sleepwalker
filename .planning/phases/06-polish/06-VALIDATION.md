---
phase: 6
slug: polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
source: derived from 06-RESEARCH.md §Validation Architecture + 06-CONTEXT.md decisions + phase_context structure
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Plan 06-07 flips `status: draft` → `status: approved <date>`, fills every
> Status column, and sets `nyquist_compliant: true` + `wave_0_complete: true`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (dashboard) + bash harness (hooks/tests + tests/compat) + GitHub Actions (macos-14) |
| **Config file** | `dashboard/vitest.config.ts` + `hooks/tests/run-tests.sh` + `hooks/tests/supervisor-tests.sh` + `tests/compat/*.sh` |
| **Test helper** | `dashboard/tests/helpers.ts::makeTempHome()` + `ensureSleepwalkerDir()` + bash assert_eq/assert_file helpers |
| **Quick run command** | `cd dashboard && pnpm test tests/<file>.test.ts --run` OR `bash tests/compat/<script>.sh` |
| **Full suite command** | `cd /Users/rahulmehta/Desktop/Projects/sleepwalker && cd dashboard && pnpm run typecheck && pnpm test --run && cd .. && bash hooks/tests/run-tests.sh && bash hooks/tests/supervisor-tests.sh && bash tests/compat/v01-routines.sh && bash tests/compat/frozen-surface.sh` |
| **Estimated runtime** | ~60s full gate (Vitest ~12s + supervisor-tests ~20s + run-tests ~15s + compat ~8s + typecheck ~5s) |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm test tests/<touched>.test.ts --run` scoped to the file; <15s quick feedback
- **After every plan wave:** Run `cd dashboard && pnpm run typecheck && pnpm test --run` + whichever bash harness the wave touched
- **Before `/gsd-verify-work`:** Full gate green + both compat gates green + CI workflow green on the PR that introduces it (once 06-06 lands)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Planner fills `Task ID` (`6-NN-MM`) when authoring each plan; Plan 06-07 flips Status column verbatim across every row and bumps `status: draft` → `approved`.

| # | Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1 | 6-01-01 | 06-01 DOCS-02 | 0 | DOCS-02 | grep (template shape) | `for r in claude-routines claude-desktop codex gemini; do grep -q "^runtime: \"$r\"$" templates/routine-$r.md || exit 1; done` | ❌ W0 | ⬜ pending |
| 2 | 6-01-01 | 06-01 DOCS-02 | 0 | DOCS-02 | grep (marker shape) | `for r in claude-routines claude-desktop codex gemini; do grep -q "\\[sleepwalker:$r/" templates/routine-$r.md || exit 1; done` | ❌ W0 | ⬜ pending |
| 3 | 6-01-01 | 06-01 DOCS-02 | 0 | DOCS-02 | grep (negative invariant) | `grep -c "^description:" templates/routine-*.md` equals 0 (v0.1 casing excluded) | ❌ W0 | ⬜ pending |
| 4 | 6-01-01 | 06-01 DOCS-02 | 0 | DOCS-02 | grep (Q1 warning in claude-desktop) | `grep -q "manual-add\\|Q1" templates/routine-claude-desktop.md` | ❌ W0 | ⬜ pending |
| 5 | 6-01-01 | 06-01 DOCS-02 | 0 | DOCS-02 | grep (gemini quota note) | `grep -q "gemini_quota_project" templates/routine-gemini.md` | ❌ W0 | ⬜ pending |
| 6 | 6-01-02 | 06-01 DOCS-02 | 0 | DOCS-02 | unit (round-trip) | `cd dashboard && pnpm test tests/templates.test.ts --run` passes >=5 it() blocks | ❌ W0 | ⬜ pending |
| 7 | 6-01-02 | 06-01 DOCS-02 | 0 | DOCS-02 | unit (safeParse success) | `pnpm test tests/templates.test.ts -t "parses + validates"` 4 runtime cases green | ❌ W0 | ⬜ pending |
| 8 | 6-02-01 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (exports present) | `grep -c "export async function gatherDiagnostics\\|export function formatAsIssueBody\\|export type Probe" dashboard/lib/diagnostics.ts` >= 3 | ❌ W0 | ⬜ pending |
| 9 | 6-02-01 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (Promise.allSettled) | `grep -c "Promise.allSettled" dashboard/lib/diagnostics.ts` >= 1 (NOT Promise.all) | ❌ W0 | ⬜ pending |
| 10 | 6-02-01 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (secrets negative invariant) | `grep -cE "github-token\|bearer\|credentials\|sk_live\|ghp_" dashboard/lib/diagnostics.ts` equals 0 | ❌ W0 | ⬜ pending |
| 11 | 6-02-01 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (timeout bound) | `grep -c "timeout: 2000" dashboard/lib/diagnostics.ts` >= 1 | ❌ W0 | ⬜ pending |
| 12 | 6-02-02 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (Server Component) | `grep -c "export const dynamic = \"force-dynamic\"" dashboard/app/diagnostics/page.tsx` equals 1 | ❌ W0 | ⬜ pending |
| 13 | 6-02-02 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (client boundary) | `grep -c "\"use client\"" dashboard/app/diagnostics/diagnostics-client.tsx` equals 1 | ❌ W0 | ⬜ pending |
| 14 | 6-02-02 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (clipboard) | `grep -c "navigator.clipboard.writeText" dashboard/app/diagnostics/diagnostics-client.tsx` equals 1 | ❌ W0 | ⬜ pending |
| 15 | 6-02-02 | 06-02 DOCS-03 | 0 | DOCS-03 | grep (nav link) | `grep -c "href=\"/diagnostics\"" dashboard/app/layout.tsx` equals 1 | ❌ W0 | ⬜ pending |
| 16 | 6-02-03 | 06-02 DOCS-03 | 0 | DOCS-03 | unit (fail-soft matrix) | `cd dashboard && pnpm test tests/diagnostics.test.ts --run` passes >=5 it() blocks | ❌ W0 | ⬜ pending |
| 17 | 6-02-03 | 06-02 DOCS-03 | 0 | DOCS-03 | jsdom (render) | `cd dashboard && pnpm test tests/diagnostics-page.test.tsx --run` passes >=3 it() blocks | ❌ W0 | ⬜ pending |
| 18 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | file-length | `wc -l docs/AUTHORING.md` in [600, 1100] | ❌ W0 | ⬜ pending |
| 19 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (7 H2 sections) | `grep -cE "^## [1-7]\\. " docs/AUTHORING.md` equals 7 | ❌ W0 | ⬜ pending |
| 20 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (Troubleshooting table ≥13 rows) | `awk '/^## 6\\. Troubleshooting/,/^## 7\\. Going Further/' docs/AUTHORING.md \| grep -c '^\\|'` >= 14 | ❌ W0 | ⬜ pending |
| 21 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (Mac-sleep patterns) | `grep -c 'caffeinate' docs/AUTHORING.md` >= 1 AND `grep -c 'pmset schedule wake' docs/AUTHORING.md` >= 1 AND `grep -c 'launchctl print' docs/AUTHORING.md` >= 1 | ❌ W0 | ⬜ pending |
| 22 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (SAFE-01 positive) | `grep -c "chars (approximate)" docs/AUTHORING.md` >= 1 | ❌ W0 | ⬜ pending |
| 23 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (SAFE-01 negative invariant) | `grep -iE 'budget.*tokens\|tokens.*budget' docs/AUTHORING.md` returns zero | ❌ W0 | ⬜ pending |
| 24 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (4 runtime H3s) | `grep -cE "^### 3\\.[1-4] " docs/AUTHORING.md` equals 4 | ❌ W0 | ⬜ pending |
| 25 | 6-03-01 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (template cross-links ≥4) | `grep -c 'templates/routine-' docs/AUTHORING.md` >= 4 | ❌ W0 | ⬜ pending |
| 26 | 6-03-02 | 06-03 DOCS-01 | 1 | DOCS-01 | grep (README discovery) | `grep -c 'AUTHORING.md' README.md` >= 1 | ❌ W0 | ⬜ pending |
| 27 | 6-04-01 | 06-04 COMP-01 | 2 | COMP-01 | bash syntax | `bash -n tests/compat/v01-routines.sh` exits 0 | ❌ W0 | ⬜ pending |
| 28 | 6-04-01 | 06-04 COMP-01 | 2 | COMP-01 | bash integration | `bash tests/compat/v01-routines.sh` exits 0 (14 routines enumerated + install.sh idempotent) | ❌ W0 | ⬜ pending |
| 29 | 6-04-01 | 06-04 COMP-01 | 2 | COMP-01 | grep (14 v0.1 slugs) | `for s in sleepwalker-calendar-prep sleepwalker-disk-cleanup sleepwalker-downloads-organizer sleepwalker-inbox-triage sleepwalker-screenshot-reviewer sleepwalker-standup-writer alert-triage dead-code-pruner dependency-upgrader doc-drift-fixer library-port morning-brief pr-reviewer test-coverage-filler; do grep -q "$s" tests/compat/v01-routines.sh \|\| exit 1; done` | ❌ W0 | ⬜ pending |
| 30 | 6-04-01 | 06-04 COMP-01 | 2 | COMP-01 | grep (_test-zen excluded) | `grep -cE 'name == _\\*\\|REAL_CLOUD.*8' tests/compat/v01-routines.sh` >= 1 (underscore-filter present) | ❌ W0 | ⬜ pending |
| 31 | 6-04-02 | 06-04 COMP-01 | 2 | COMP-01 | unit (TS aggregator) | `cd dashboard && pnpm test tests/v01-queue-integration.test.ts --run` passes 2 it() blocks | ❌ W0 | ⬜ pending |
| 32 | 6-04-02 | 06-04 COMP-01 | 2 | COMP-01 | grep (no v0.2 leakage) | `grep -c 'supervisor-run' dashboard/tests/v01-queue-integration.test.ts` equals 0 (v0.1-only shape) | ❌ W0 | ⬜ pending |
| 33 | 6-05-01 | 06-05 COMP-02 | 2 | COMP-02 | bash syntax | `bash -n tests/compat/frozen-surface.sh` exits 0 | ❌ W0 | ⬜ pending |
| 34 | 6-05-01 | 06-05 COMP-02 | 2 | COMP-02 | bash execution | `bash tests/compat/frozen-surface.sh` exits 0 on HEAD | ❌ W0 | ⬜ pending |
| 35 | 6-05-01 | 06-05 COMP-02 | 2 | COMP-02 | grep (baseline hardcoded) | `grep -c 'BASELINE=\"998455b\"\\|998455b' tests/compat/frozen-surface.sh` >= 1 | ❌ W0 | ⬜ pending |
| 36 | 6-05-01 | 06-05 COMP-02 | 2 | COMP-02 | grep (preflight) | `grep -c 'git rev-parse --verify 998455b' tests/compat/frozen-surface.sh` >= 1 (Pitfall 2 diagnostic) | ❌ W0 | ⬜ pending |
| 37 | 6-05-01 | 06-05 COMP-02 | 2 | COMP-02 | grep (documented exceptions) | `grep -c 'verify_exception\\|EXCEPTIONS' tests/compat/frozen-surface.sh` >= 1 | ❌ W0 | ⬜ pending |
| 38 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | YAML validation | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exits 0 | ❌ W0 | ⬜ pending |
| 39 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | grep (macos-14 runner) | `grep -c 'runs-on: macos-14' .github/workflows/ci.yml` equals 1 | ❌ W0 | ⬜ pending |
| 40 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | grep (fetch-depth 0) | `grep -c 'fetch-depth: 0' .github/workflows/ci.yml` equals 1 (COMP-02 baseline access) | ❌ W0 | ⬜ pending |
| 41 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | grep (all 6 steps) | `grep -c 'pnpm run typecheck\\|pnpm test\\|bash hooks/tests/run-tests.sh\\|bash hooks/tests/supervisor-tests.sh\\|bash tests/compat/v01-routines.sh\\|bash tests/compat/frozen-surface.sh' .github/workflows/ci.yml` >= 6 | ❌ W0 | ⬜ pending |
| 42 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | grep (least privilege) | `grep -c 'contents: read' .github/workflows/ci.yml` >= 1 | ❌ W0 | ⬜ pending |
| 43 | 6-06-01 | 06-06 CI | 3 | DOCS/COMP support | manual (first run) | `gh run list --workflow=ci.yml --limit 1 --json conclusion \| jq -r '.[0].conclusion'` equals `success` (after first push) | ❌ W0 | ⬜ pending |
| 44 | 6-07-01 | 06-07 exit | 4 | Phase-seal | tag creation | `git rev-parse v0.1.0` equals `998455b53d73dceffb53ccfaf9e8dd6b4296da5d` AND `git cat-file -t v0.1.0` equals `tag` | ❌ W0 | ⬜ pending |
| 45 | 6-07-01 | 06-07 exit | 4 | Phase-seal | full gate | `cd dashboard && pnpm run typecheck && pnpm test --run` green AND `bash hooks/tests/run-tests.sh && bash hooks/tests/supervisor-tests.sh && bash tests/compat/v01-routines.sh && bash tests/compat/frozen-surface.sh` all exit 0 | ❌ W0 | ⬜ pending |
| 46 | 6-07-02 | 06-07 exit | 4 | Phase-seal | VALIDATION flip | `grep -q "status: approved 2026-04-" .planning/phases/06-polish/06-VALIDATION.md && grep -q "nyquist_compliant: true" .planning/phases/06-polish/06-VALIDATION.md` | ✓ this file | ⬜ pending |
| 47 | 6-07-02 | 06-07 exit | 4 | Phase-seal | REQUIREMENTS flip | `grep -cE "(DOCS-0[1-3]\|COMP-0[1-2]).*(Complete\|2026-04)" .planning/REQUIREMENTS.md` >= 5 AND `grep -c "32/32" .planning/REQUIREMENTS.md` >= 1 | ✓ REQUIREMENTS.md | ⬜ pending |
| 48 | 6-07-02 | 06-07 exit | 4 | Phase-seal | ROADMAP flip | `grep -cE "Phase 6.*(7/7\|Complete)" .planning/ROADMAP.md` >= 1 | ✓ ROADMAP.md | ⬜ pending |
| 49 | 6-07-02 | 06-07 exit | 4 | Milestone-seal | STATE flip | `grep -c "6/6 phases complete\\|v0.2 MILESTONE SEALED" .planning/STATE.md` >= 1 | ✓ STATE.md | ⬜ pending |
| 50 | 6-07-02 | 06-07 exit | 4 | Phase-seal | 06-SUMMARY.md exists | `test -f .planning/phases/06-polish/06-SUMMARY.md` AND `grep -qE "Phase 6 (sealed\|SEALED)" .planning/phases/06-polish/06-SUMMARY.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/compat/` directory (new) — home for v01-routines.sh + frozen-surface.sh; created by Plan 06-04 (first writer to the dir)
- [ ] `dashboard/tests/templates.test.ts` (new Vitest file) — round-trip template validator (Plan 06-01)
- [ ] `dashboard/tests/diagnostics.test.ts` (new Vitest file) — fail-soft probe matrix (Plan 06-02)
- [ ] `dashboard/tests/diagnostics-page.test.tsx` (new jsdom file) — page render test (Plan 06-02)
- [ ] `dashboard/tests/v01-queue-integration.test.ts` (new Vitest file) — 14-entry aggregator round-trip (Plan 06-04)
- [ ] `.github/workflows/ci.yml` (new) — macOS runner job (Plan 06-06)
- [ ] `.github/workflows/` directory (new) — first CI config in repo (Plan 06-06)
- [ ] `templates/` directory already exists at v0.1 seal (contains `.gitkeep` placeholder per v0.1 Plan 01-02 commit b38416c)
- [ ] `refs/tags/v0.1.0` annotated git tag on `998455b` (Plan 06-07 creates — Pitfall 2 defense)
- [ ] No new test framework needed — Vitest + jsdom + bash harness + GitHub Actions macos runner all existing/standard

---

## Manual-Only Verifications

These cannot be asserted by an automated command because they require interactive inspection or a specific runtime state CI doesn't replicate. Plan 06-07 records them as known-manual in 06-SUMMARY.md for user execution.

| # | Req | Description | How to Verify |
|---|-----|-------------|---------------|
| M1 | DOCS-01 | AUTHORING.md reads well end-to-end | Open docs/AUTHORING.md in a markdown renderer; read top-to-bottom; every internal anchor link resolves; every error string in §6 Troubleshooting maps to a real Phase 2-5 landmine; Mac-sleep §4.2 Patterns A/B/C each run clean on a live Mac (optional) |
| M2 | DOCS-01 | 10-minute clone-to-routine walkthrough | Fresh Mac → `git clone` → `./install.sh` → `pnpm dev --port 4001` → `/editor` → author one custom routine of each of 4 runtimes using templates from 06-01 → confirm queue entry appears within 10 minutes wall clock |
| M3 | DOCS-03 | `/diagnostics` page renders on Intel + arm64 | Boot dashboard on each arch; visit `/diagnostics`; verify `uname -m` row shows correct arch, `brew --prefix` differs between arm64 (`/opt/homebrew`) and x86_64 (`/usr/local`); copy button copies the expected output to clipboard |
| M4 | DOCS-03 | Fresh Mac (missing flock + brew) loads page without crashing | On a Mac WITHOUT `brew`/`flock` installed, visit `/diagnostics`; expect rows to render with `(not installed)` / `(not on PATH)` indicators; no 500 error; copy button still works |
| M5 | COMP-01 | install.sh rejects a Mac missing flock | On a fresh Mac (or one with `brew uninstall flock` temporarily), run `./install.sh`; expect exit 1 with "ERROR: flock is required" message (Phase 5 QUEU-04 preflight) |
| M6 | COMP-02 | CI workflow runs green on first PR | After Plan 06-06 ci.yml lands on main, open a small no-op PR targeting main; verify GitHub Actions "CI" workflow completes with all 6 steps green within <10 min; check Actions tab for the run details |
| M7 | COMP-02 | Frozen-surface intentional-break detection | Temporarily add a line to `dashboard/lib/queue.ts` outside the documented QUEU-01 union widen (e.g. `// regression test`) + run `bash tests/compat/frozen-surface.sh`; expect exit 1 with diff preview. Revert the line before committing. |

---

## Cross-Plan Invariants

Independent assertions every plan must satisfy (checked at phase exit by Plan 06-07):

- **v0.1.0 tag pinned:** `git rev-parse v0.1.0` equals `998455b53d73dceffb53ccfaf9e8dd6b4296da5d` (exact commit sha); `git cat-file -t v0.1.0` equals `tag` (annotated)
- **Zero secrets in diagnostics:** `grep -rnE 'github-token\|bearer\|credentials\|sk_live\|ghp_\|process\.env\.[A-Z_]*TOKEN' dashboard/lib/diagnostics.ts` returns empty
- **SAFE-01 invariant preserved across Phase 5→6:** `grep -iE 'budget.*tokens\|tokens.*budget' dashboard/app/ docs/AUTHORING.md` returns empty
- **Template lowercase-zod-key invariant:** `grep -c '^description:' templates/routine-*.md` equals 0 (no v0.1 SKILL.md casing leakage)
- **v0.2 fleet marker in templates:** `grep -cE '\\[sleepwalker:(claude-routines\|claude-desktop\|codex\|gemini)/[a-z][a-z0-9-]*\\]' templates/routine-*.md` >= 4 (one per template)
- **v0.1 frozen surface unchanged:** `bash tests/compat/frozen-surface.sh` exits 0 (baseline 998455b + documented Phase 2-5 additive exceptions)
- **14 v0.1 routines present:** `bash tests/compat/v01-routines.sh` exits 0 (routine enumeration + install.sh idempotency)
- **CI fetch-depth full:** `.github/workflows/ci.yml` has `fetch-depth: 0` so COMP-02 can `git show 998455b:<path>`

---

## Exit Gate Checklist

Plan 06-07 marks Phase 6 + v0.2 milestone sealed when ALL are true:

- [ ] Annotated tag `v0.1.0` on `998455b` exists (verify: `git cat-file -t v0.1.0` equals `tag` AND `git rev-list -n 1 v0.1.0` equals 998455b)
- [ ] Dashboard suite: `cd dashboard && pnpm run typecheck && pnpm test --run` exits 0 — expected ~375 tests (baseline 358 + 17 new Phase 6)
- [ ] Hook harness: `bash hooks/tests/run-tests.sh` all pass (29+ scenarios)
- [ ] Supervisor harness: `bash hooks/tests/supervisor-tests.sh` all pass (30+ scenarios)
- [ ] COMP-01 v0.1 integration: `bash tests/compat/v01-routines.sh` exits 0
- [ ] COMP-02 frozen-surface: `bash tests/compat/frozen-surface.sh` exits 0 (v0.1.0 = 998455b baseline + documented Phase 2-5 exceptions)
- [ ] CI workflow green on first PR (after Plan 06-06 lands)
- [ ] Every row Status column in this matrix flipped from ⬜ to ✅ green 2026-04-XX (50/50 rows)
- [ ] Frontmatter `status: approved 2026-04-XX`, `nyquist_compliant: true`, `wave_0_complete: true`
- [ ] REQUIREMENTS.md: DOCS-01 / DOCS-02 / DOCS-03 / COMP-01 / COMP-02 all Complete; coverage 27/32 → 32/32
- [ ] ROADMAP.md: Phase 6 sealed 7/7; Progress table updated
- [ ] STATE.md: milestone 5/6 → 6/6; v0.2 MILESTONE SEALED
- [ ] 06-SUMMARY.md authored (7-plan rollup + exit-gate evidence + milestone seal)
- [ ] docs/activity_log.md entry appended
- [ ] Single `docs(06)` commit landed
- [ ] Working tree clean

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies documented
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/compat/`, 4 new Vitest files, `.github/workflows/ci.yml`, `v0.1.0` tag)
- [ ] No watch-mode flags — all Vitest runs use `--run`
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 completes

**Approval:** pending (Plan 06-07 approves at Phase 6 exit gate)

---

*Phase 6 Validation Strategy drafted: 2026-04-22*
*Approved: pending (Plan 06-07 exit gate)*
</content>
