---
phase: 5
slug: queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
source: derived from 05-RESEARCH.md §Validation Architecture + 05-CONTEXT.md decisions
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Mirrors `05-RESEARCH.md` §Validation Architecture (lines 1062-1096).
> Plan 05-08 flips `status: draft` → `status: approved <date>`, fills every
> Status column, and sets `nyquist_compliant: true` + `wave_0_complete: true`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (dashboard) + bash harness (hooks + supervisor) |
| **Config file** | `dashboard/vitest.config.ts` + `hooks/tests/run-tests.sh` + `hooks/tests/supervisor-tests.sh` |
| **Quick run command** | `cd dashboard && pnpm test tests/<file>.test.ts` |
| **Full suite command** | `cd /Users/rahulmehta/Desktop/Projects/sleepwalker && cd dashboard && pnpm run typecheck && pnpm test && bash ../hooks/tests/supervisor-tests.sh && bash ../hooks/tests/run-tests.sh` |
| **Test helper** | `dashboard/tests/helpers.ts::makeTempHome()` + `ensureSleepwalkerDir()` |
| **Estimated runtime** | ~11s dashboard (baseline 336 tests) + ~20s supervisor-tests + ~15s run-tests = ~46s full gate |

---

## Sampling Rate

- **After every task commit:** Run `cd dashboard && pnpm test tests/<touched-file>.test.ts` or the matching bash harness (supervisor-tests.sh / run-tests.sh) scoped to the scenario touched; <15s quick feedback
- **After every plan wave:** Run `cd dashboard && pnpm run typecheck && pnpm test` + whichever bash harness the wave touched
- **Before `/gsd-verify-work`:** Full suite green + both bash harnesses green + frozen-surface diff 0 lines vs PHASE5_BASE (sentinel: `dashboard/tests/supervisor-runs.test.ts` first-added commit parent)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Planner fills `Task ID` (`5-NN-MM`) when authoring each plan. Plan 05-08 flips Status
> column verbatim across every row and bumps status: draft → approved in the frontmatter.

| # | Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1 | 5-01-01 | 05-01 | 0 | QUEU-01 | unit | `pnpm test tests/queue.test.ts -t "codex"` | ✓ dashboard/tests/queue.test.ts | ⬜ pending |
| 2 | 5-01-02 | 05-01 | 0 | QUEU-01 | unit (type+round-trip) | `pnpm test tests/queue.test.ts -t "gemini"` | ✓ dashboard/tests/queue.test.ts | ⬜ pending |
| 3 | 5-01-01 | 05-01 | 0 | QUEU-01 | unit (status widen) | `pnpm test tests/queue.test.ts -t "complete"` | ✓ dashboard/tests/queue.test.ts | ⬜ pending |
| 4 | 5-01-01 | 05-01 | 0 | QUEU-01 | typecheck | `cd dashboard && pnpm run typecheck` | - | ⬜ pending |
| 5 | 5-02-01 | 05-02 | 0 | QUEU-02 | grep (producer) | `grep -q "\.pill-codex" dashboard/app/globals.css && grep -q "bg-aurora-500/10" dashboard/app/globals.css` | ✓ dashboard/app/globals.css | ⬜ pending |
| 6 | 5-02-01 | 05-02 | 0 | QUEU-02 | grep (producer) | `grep -q "\.pill-gemini" dashboard/app/globals.css && grep -q "bg-dawn-400/10" dashboard/app/globals.css` | ✓ dashboard/app/globals.css | ⬜ pending |
| 7 | 5-02-01 | 05-02 | 0 | QUEU-02 | build | `cd dashboard && pnpm run build` exits 0 | - | ⬜ pending |
| 8 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "empty when audit.jsonl"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 9 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "codex.*gemini runtime"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 10 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "filters out 'started'"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 11 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "completed.*complete"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 12 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "failed.*failed"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 13 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "budget_exceeded"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 14 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "deferred.*rejected"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 15 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "24h cutoff\|older than 24h"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 16 | 5-03-01 | 05-03 | 1 | QUEU-03 | unit | `pnpm test tests/supervisor-runs.test.ts -t "malformed\|skips malformed"` | ✓ dashboard/tests/supervisor-runs.test.ts | ⬜ pending |
| 17 | 5-03-03 | 05-03 | 1 | QUEU-03 | integration | `pnpm test tests/queue-aggregator.test.ts -t "4 sources\|all 4 sources"` | ✓ dashboard/tests/queue-aggregator.test.ts | ⬜ pending |
| 18 | 5-03-02 | 05-03 | 1 | QUEU-03 | grep (supervisor byte-identical) | `git diff --numstat HEAD~10 HEAD -- bin/sleepwalker-run-cli \| awk '{ total+=$2 }' — deletions 0 across Phase 5` (supervisor JSON write path pre-Plan 05-04 unchanged) | - | ⬜ pending |
| 19 | 5-04-01 | 05-04 | 2 | QUEU-04 | grep (wrap present) | `grep -cE "flock -w 5 -x 200" bin/sleepwalker-run-cli — equals 2` | ✓ bin/sleepwalker-run-cli | ⬜ pending |
| 20 | 5-04-01 | 05-04 | 2 | QUEU-04 | grep (JSON shape preserved) | `grep -cE '"ts":"%s","fleet":"%s","runtime":"%s","event":"%s"' bin/sleepwalker-run-cli — equals 2` | ✓ bin/sleepwalker-run-cli | ⬜ pending |
| 21 | 5-04-02 | 05-04 | 2 | QUEU-04 | bash integration | `bash hooks/tests/supervisor-tests.sh` — Scenario 8 asserts 4 concurrent runs × 2 events = 8 lines, zero malformed | ✓ hooks/tests/supervisor-tests.sh | ⬜ pending |
| 22 | 5-04-02 | 05-04 | 2 | QUEU-04 | bash integration | `bash hooks/tests/supervisor-tests.sh` — Scenario 9 asserts flock -w 5 timeout path exits 0 gracefully | ✓ hooks/tests/supervisor-tests.sh | ⬜ pending |
| 23 | 5-05-01 | 05-05 | 2 | QUEU-04 | grep (wrap present) | `grep -cE "flock -w 5 -x 200" hooks/sleepwalker-audit-log.sh — equals 1` | ✓ hooks/sleepwalker-audit-log.sh | ⬜ pending |
| 24 | 5-05-01 | 05-05 | 2 | QUEU-04 | grep (hook JSON preserved) | `grep -c "jq -nc" hooks/sleepwalker-audit-log.sh — equals 1` | ✓ hooks/sleepwalker-audit-log.sh | ⬜ pending |
| 25 | 5-05-01 | 05-05 | 2 | QUEU-04 | grep (shared lock file) | `diff <(grep 'LOCK_FILE="' bin/sleepwalker-run-cli) <(grep 'LOCK_FILE="' hooks/sleepwalker-audit-log.sh)` — shows only whitespace differences | - | ⬜ pending |
| 26 | 5-05-02 | 05-05 | 2 | QUEU-04 | bash integration | `bash hooks/tests/run-tests.sh` — concurrent-audit scenario asserts 4 hook invocations → 4 valid JSON lines | ✓ hooks/tests/run-tests.sh | ⬜ pending |
| 27 | 5-06-01 | 05-06 | 2 | QUEU-04 | grep (preflight present) | `grep -c "command -v flock" install.sh` equals 1 AND `grep -c "brew install flock" install.sh` equals 1 | ✓ install.sh | ⬜ pending |
| 28 | 5-06-01 | 05-06 | 2 | QUEU-04 | grep (v0.1 install steps preserved) | `grep -cE "(Copying hooks to\|Wiring hooks into\|Initialize state directory)" install.sh` equals 3 | ✓ install.sh | ⬜ pending |
| 29 | 5-07-01 | 05-07 | 3 | SAFE-01 | grep (violation removed) | `grep -c "budget:.*tokens" dashboard/app/routines/routines-client.tsx` equals 0 | ✓ dashboard/app/routines/routines-client.tsx | ⬜ pending |
| 30 | 5-07-01 | 05-07 | 3 | SAFE-01 | grep (approximate present) | `grep -c "chars (approximate)" dashboard/app/routines/routines-client.tsx` equals 1 | ✓ dashboard/app/routines/routines-client.tsx | ⬜ pending |
| 31 | 5-07-01 | 05-07 | 3 | SAFE-01 | grep (editor helper) | `grep -q "Approximate character cap" dashboard/app/editor/editor-client.tsx && grep -q "±40%" dashboard/app/editor/editor-client.tsx` | ✓ dashboard/app/editor/editor-client.tsx | ⬜ pending |
| 32 | 5-07-01 | 05-07 | 3 | SAFE-01 | grep (global sweep) | `[ -z "$(grep -rn 'budget.*tokens\\|tokens.*budget' dashboard/app/)" ]` — zero matches | - | ⬜ pending |
| 33 | 5-07-02 | 05-07 | 3 | QUEU-02 | grep (consumer) | `grep -cE "pill-(codex\|gemini)" dashboard/app/queue-client.tsx` >= 2 | ✓ dashboard/app/queue-client.tsx | ⬜ pending |
| 34 | 5-07-02 | 05-07 | 3 | QUEU-03 | grep (supervisor-run branch) | `grep -c "supervisor-run" dashboard/app/queue-client.tsx` >= 2 | ✓ dashboard/app/queue-client.tsx | ⬜ pending |
| 35 | 5-07-02 | 05-07 | 3 | SAFE-01 | grep (budget_exceeded copy) | `grep -cE "Stopped at.*chars.*budget.*approximate" dashboard/app/queue-client.tsx` equals 1 | ✓ dashboard/app/queue-client.tsx | ⬜ pending |
| 36 | 5-07-03 | 05-07 | 3 | QUEU-02 | jsdom (pill-codex) | `pnpm test tests/queue-client.test.tsx -t "pill-codex"` | ✓ dashboard/tests/queue-client.test.tsx | ⬜ pending |
| 37 | 5-07-03 | 05-07 | 3 | QUEU-02 | jsdom (pill-gemini) | `pnpm test tests/queue-client.test.tsx -t "pill-gemini"` | ✓ dashboard/tests/queue-client.test.tsx | ⬜ pending |
| 38 | 5-07-03 | 05-07 | 3 | SAFE-01 | jsdom (budget_exceeded) | `pnpm test tests/queue-client.test.tsx -t "approximate.*budget_exceeded\|budget_exceeded.*approximate"` | ✓ dashboard/tests/queue-client.test.tsx | ⬜ pending |
| 39 | 5-08-01 | 05-08 | 4 | Phase-exit | full suite | `cd dashboard && pnpm run typecheck && pnpm test` exits 0 | - | ⬜ pending |
| 40 | 5-08-01 | 05-08 | 4 | Phase-exit | bash | `bash hooks/tests/supervisor-tests.sh` — `all supervisor tests passed`; scenario count >= 30 | - | ⬜ pending |
| 41 | 5-08-01 | 05-08 | 4 | Phase-exit | bash | `bash hooks/tests/run-tests.sh` — all-passed indicator; scenario count >= 27 | - | ⬜ pending |
| 42 | 5-08-01 | 05-08 | 4 | Phase-exit | frozen-surface diff | `PHASE5_BASE=$(git log --reverse --diff-filter=A --format=%H -- dashboard/tests/supervisor-runs.test.ts \| head -1)^ && [ -z "$(git diff --numstat $PHASE5_BASE HEAD -- <30+ enumerated paths>)" ]` | - | ⬜ pending |
| 43 | 5-08-01 | 05-08 | 4 | QUEU-04 (documented exception) | additive audit | `git diff --numstat PHASE5_BASE HEAD -- install.sh bin/sleepwalker-run-cli hooks/sleepwalker-audit-log.sh hooks/tests/supervisor-tests.sh hooks/tests/run-tests.sh` — 5 lines, all additive (deletions ≤ 2 per writer for printf-line replacement) | - | ⬜ pending |
| 44 | 5-08-02 | 05-08 | 4 | Phase-seal | VALIDATION flip | `grep -q "status: approved 2026-04-" .planning/phases/05-queue/05-VALIDATION.md && grep -q "nyquist_compliant: true" .planning/phases/05-queue/05-VALIDATION.md` | ✓ this file | ⬜ pending |
| 45 | 5-08-02 | 05-08 | 4 | Phase-seal | REQUIREMENTS flip | `grep -cE "(QUEU-0[1-4]\|SAFE-01).*(Complete\|2026-04)" .planning/REQUIREMENTS.md` >= 5 | ✓ .planning/REQUIREMENTS.md | ⬜ pending |
| 46 | 5-08-02 | 05-08 | 4 | Phase-seal | ROADMAP flip | `grep -cE "Phase 5.*(8/8\|Complete)" .planning/ROADMAP.md` >= 1 | ✓ .planning/ROADMAP.md | ⬜ pending |
| 47 | 5-08-02 | 05-08 | 4 | Phase-seal | STATE flip | `grep -c "5/6 phases" .planning/STATE.md` >= 1 | ✓ .planning/STATE.md | ⬜ pending |
| 48 | 5-08-02 | 05-08 | 4 | Phase-seal | 05-SUMMARY.md exists | `test -f .planning/phases/05-queue/05-SUMMARY.md` | ✓ .planning/phases/05-queue/05-SUMMARY.md | ⬜ pending |

---

## Manual-Only Verifications

These cannot be asserted by an automated command because they require interactive
inspection or a specific runtime state the test hosts don't replicate. Plan 05-08
records them as known-manual in 05-SUMMARY.md for the user to execute.

| # | Req | Description | How to Verify |
|---|-----|-------------|---------------|
| M1 | QUEU-02 | Pill colors pass visual contrast on a real screen | Load dashboard at localhost:4001, view a page rendering pill-codex + pill-gemini, confirm readable against panel background (RESEARCH §4.3 computed ratios but not measured on physical device) |
| M2 | QUEU-04 | install.sh rejects a Mac missing flock | On a fresh Mac (or one with `brew uninstall flock` temporarily), run `./install.sh`; expect exit 1 with "ERROR: flock is required" message |
| M3 | QUEU-04 | 4 concurrent real routines in production don't corrupt audit.jsonl | Deploy 2 codex + 2 gemini routines, trigger runNow on each via the dashboard within 10 seconds, then inspect `~/.sleepwalker/audit.jsonl` via `jq -e . < audit.jsonl > /dev/null && echo OK` — expect OK |
| M4 | SAFE-01 | Budget-exceeded run renders "approximate" in the live UI | Deploy a codex routine with budget 1000 chars, write a prompt guaranteed to exceed, wait for supervisor budget_exceeded emit, refresh Morning Queue, confirm the entry shows "Stopped at N chars (budget: 1000, approximate)" |

---

## Cross-Plan Invariants

Independent assertions every plan must satisfy (checked at phase exit):

- **Lock-file path identity:** `grep "audit\.jsonl\.lock" bin/sleepwalker-run-cli` and `grep "audit\.jsonl\.lock" hooks/sleepwalker-audit-log.sh` resolve to the SAME literal path `${HOME}/.sleepwalker/audit.jsonl.lock` — one mutex, two writers
- **Zero "tokens" in budget context:** `grep -rn 'budget.*tokens\|tokens.*budget' dashboard/app/` returns empty
- **audit.jsonl schema unchanged:** Supervisor's printf format string + hook's jq -nc construction are byte-identical to pre-Phase-5 HEAD (both pre-Phase-5 commits are Phase 2-era)
- **install.sh signature unchanged:** `head -2 install.sh` shows `#!/bin/bash` + the header comment; `grep '^set -euo pipefail' install.sh` equals 1; no flags introduced to the entry point
- **No new npm deps:** `cd dashboard && diff <(jq -r '.dependencies | keys[]' package.json) <(jq -r '.dependencies | keys[]' package.json.phase4-baseline)` shows no additions (Phase 5 is pure-TS + pure-CSS on the dashboard side; flock is a system binary, not npm)

---

## Exit Gate Checklist

Plan 05-08 marks Phase 5 sealed when ALL are true:

- [ ] Dashboard suite: `pnpm run typecheck && pnpm test` exits 0 (expected count 336 → ~345-350)
- [ ] Supervisor harness: `bash hooks/tests/supervisor-tests.sh` all pass (expected scenario count 28 → 30)
- [ ] Hook harness: `bash hooks/tests/run-tests.sh` all pass (expected scenario count 26 → 27)
- [ ] Frozen-surface diff = 0 lines across v0.1 + Phase 2/3/4 paths (see 05-08-PLAN for enumerated list)
- [ ] Documented-exception audit: 3 QUEU-04 amendments on v0.1 surface are additive-only
- [ ] Every row Status column in this matrix flipped from ⬜ to ✅ green 2026-04-XX
- [ ] Frontmatter `status: approved 2026-04-XX`, `nyquist_compliant: true`, `wave_0_complete: true`
- [ ] REQUIREMENTS.md: QUEU-01 / QUEU-02 / QUEU-03 / QUEU-04 / SAFE-01 all Complete
- [ ] ROADMAP.md: Phase 5 sealed 8/8
- [ ] STATE.md: milestone 5/6
- [ ] 05-SUMMARY.md authored
- [ ] docs/activity_log.md entry appended
- [ ] Single `docs(05)` commit landed

---

*Phase 5 Validation Strategy drafted: 2026-04-20*
*Approved: [Plan 05-08 fills this line at phase seal]*
</content>
</invoke>
