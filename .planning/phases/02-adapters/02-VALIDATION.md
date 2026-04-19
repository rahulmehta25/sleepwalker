---
phase: 2
slug: adapters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `02-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (dashboard TS) + bash harness (supervisor) |
| **Config file** | `dashboard/vitest.config.ts` (existing, no changes) |
| **Quick run command** | `cd dashboard && pnpm test -- --run <file>` |
| **Full suite command** | `cd dashboard && pnpm typecheck && pnpm test && bash hooks/tests/supervisor-tests.sh` |
| **Estimated runtime** | quick ~2-5 s per file; full ~45-60 s |

---

## Sampling Rate

- **Per task commit:** `pnpm typecheck && pnpm test -- --run <changed file>` (< 10 s)
- **Per wave merge:** `pnpm typecheck && pnpm test && bash hooks/tests/supervisor-tests.sh` (full green)
- **Phase gate (Wave 4):** Full suite + manual smoke tests documented in `02-SUMMARY.md` + `git diff <pre-phase-2-SHA> HEAD -- <frozen surface>` returns 0 lines
- **Max feedback latency:** 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | ADPT-02 amend | V5 input validation | `assertValidSlug` rejects invalid input in each builder | unit | `pnpm test -- slug.test.ts` | ✅ extends | ⬜ pending |
| 2-02-01 | 02 | 1 | ADPT-03 | V12 file resources | `generatePlist` produces valid escaped XML | unit | `pnpm test -- launchd-writer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | ADPT-03 | — | `installPlist` writes + `plutil -lint` + `launchctl bootstrap gui/$UID` | unit | `pnpm test -- launchd-writer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | ADPT-03 | — | `uninstallPlist` `bootout` + unlink (idempotent on missing file) | unit | `pnpm test -- launchd-writer.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | ADPT-04 | V2 auth | Supervisor login-shell PATH resolution (zsh → bash fallback) | integration | `bash hooks/tests/supervisor-tests.sh` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 1 | ADPT-04 | — | Supervisor sleep-window gate (reads `~/.sleepwalker/settings.json`) | integration | same | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 1 | ADPT-04 | V12 | Supervisor reversibility allowlist gate | integration | same | ❌ W0 | ⬜ pending |
| 2-03-04 | 03 | 1 | ADPT-04 | — | Char-budget SIGTERM on exceed; `budget_exceeded` event emitted | integration | same | ❌ W0 | ⬜ pending |
| 2-03-05 | 03 | 1 | SAFE-02 | V14 output encoding | `NO_COLOR=1 TERM=dumb CI=true` set; ANSI stripped from `audit.jsonl` via `perl -pe 's/\e\[[0-9;]*m//g'` | integration | same (assert no `\e[` bytes in audit output) | ❌ W0 | ⬜ pending |
| 2-03-06 | 03 | 1 | ADPT-04 | — | `started` + exactly one terminal event (`completed`/`failed`/`budget_exceeded`) per run | integration | same (grep audit.jsonl) | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 2 | ADPT-05 | — | `claude-routines.runNow` wraps `fire-routine.ts` correctly | unit | `pnpm test -- claude-routines.test.ts` (mock fetch) | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 2 | ADPT-05 | — | `claude-routines.deploy` returns `{ok: true, handoffUrl}` with `/schedule create` pre-filled | unit | same | ❌ W0 | ⬜ pending |
| 2-04-03 | 04 | 2 | ADPT-05 | — | `claude-routines.healthCheck` probes `claude --version` + beta-header constant | unit | same (mock execFile) | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 2 | ADPT-06 | V12 | `claude-desktop.deploy` writes SKILL.md to `~/.claude/scheduled-tasks/<slug>/` | unit | `pnpm test -- claude-desktop.test.ts` (temp HOME) | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 2 | ADPT-06 | — | `deploy()` returns `{handoffUrl: "claude://scheduled-tasks?slug=<slug>"}` | unit | same | ❌ W0 | ⬜ pending |
| 2-05-03 | 05 | 2 | ADPT-06 | — | `undeploy()` removes SKILL.md directory | unit | same | ❌ W0 | ⬜ pending |
| 2-05-04 | 05 | 2 | ADPT-06 | — | Desktop Schedule tab picks up SKILL.md | **manual** | `test/manual/claude-desktop-smoke.md` | ❌ W4 | ⬜ pending |
| 2-06-01 | 06 | 2 | ADPT-07 | V2/V12 | `codex.deploy` full flow: `assertValidSlug` → absolute path resolve via login shell → plist gen → `plutil -lint` → `launchctl bootstrap` | unit | `pnpm test -- codex.test.ts` (mock execFile + fs) | ❌ W0 | ⬜ pending |
| 2-06-02 | 06 | 2 | ADPT-07 | V2 | `codex.healthCheck` detects auth conflict (subscription + env key); returns `{available: true, warning: "..."}` | unit | same (fixture `~/.codex/auth.json` + `OPENAI_API_KEY`) | ❌ W0 | ⬜ pending |
| 2-06-03 | 06 | 2 | ADPT-07 | — | codex real-Mac launchctl bootstrap + kickstart + bootout | **manual** | `test/manual/codex-adapter-smoke.md` | ❌ W4 | ⬜ pending |
| 2-07-01 | 07 | 2 | ADPT-08 | V2/V12 | `gemini.deploy` injects `GOOGLE_CLOUD_PROJECT` into plist `EnvironmentVariables` | unit | `pnpm test -- gemini.test.ts` | ❌ W0 | ⬜ pending |
| 2-07-02 | 07 | 2 | ADPT-08 | V2 | `gemini.healthCheck` probes quota project + `gemini --version`; surfaces `GOOGLE_APPLICATION_CREDENTIALS` vs `GEMINI_API_KEY` collision | unit | same | ❌ W0 | ⬜ pending |
| 2-08-01 | 08 | 3 | ADPT-09 | — | `ADAPTERS` registry exports real adapters (not stubs) keyed by runtime | unit | `pnpm test -- adapter-registry.test.ts` | ❌ W0 | ⬜ pending |
| 2-08-02 | 08 | 3 | ADPT-09 | — | `healthCheckAll()` returns exactly 4 `HealthStatus` objects in parallel | unit | same | ❌ W0 | ⬜ pending |
| 2-09-01 | 09 | 4 | all | — | Full-suite + supervisor harness green | gate | `pnpm typecheck && pnpm test && bash hooks/tests/supervisor-tests.sh` | ✅ | ⬜ pending |
| 2-09-02 | 09 | 4 | COMP-01 + COMP-02 (adjacent) | — | Frozen-surface diff = 0 against pre-Phase-2 SHA | smoke | See frozen-surface gate below | ✅ | ⬜ pending |
| 2-09-03 | 09 | 4 | ADPT-06/07 | — | Manual smoke tests completed on real Mac; results in `02-SUMMARY.md` | **manual** | `test/manual/*.md` reports | ❌ W4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · **manual** = human on real Mac*

**Frozen-surface gate command (Task 2-09-02):**

```bash
# Resolve pre-Phase-2 base SHA dynamically (parent of first commit creating dashboard/lib/runtime-adapters/launchd-writer.ts)
PHASE2_BASE=$(git log --reverse --format=%H --diff-filter=A -- dashboard/lib/runtime-adapters/launchd-writer.ts | head -1)~1
git diff "$PHASE2_BASE" HEAD -- \
  install.sh \
  hooks/sleepwalker-defer-irreversible.sh hooks/sleepwalker-budget-cap.sh hooks/sleepwalker-audit-log.sh hooks/_detect_fleet.sh \
  routines-local/ routines-cloud/ \
  bin/sleepwalker-execute \
  dashboard/lib/queue.ts dashboard/lib/routines.ts dashboard/lib/cloud.ts \
  dashboard/lib/cloud-cache.ts dashboard/lib/queue-aggregator.ts \
  dashboard/lib/settings.ts dashboard/lib/approval.ts dashboard/lib/audit.ts \
  dashboard/lib/github.ts dashboard/lib/fire-routine.ts \
  dashboard/app/ \
  dashboard/package.json dashboard/tsconfig.json dashboard/vitest.config.ts \
  | wc -l
# Expected: 0
```

Note: `hooks/tests/` is NOT in the frozen surface — Phase 2 adds `hooks/tests/supervisor-tests.sh`. That's additive, not a modification of v0.1.

---

## Wave 0 Requirements

- [ ] `dashboard/lib/runtime-adapters/slug.ts` — amended with `assertValidSlug()` inside every builder (covers ADPT-02 enforcement)
- [ ] `dashboard/lib/runtime-adapters/launchd-writer.ts` — `generatePlist`, `installPlist`, `uninstallPlist`, `plistEscape` exports (covers ADPT-03)
- [ ] `dashboard/tests/launchd-writer.test.ts` — ~8 `it()` blocks (plist shape, escape, schedule variants, bootstrap mock, bootout mock, idempotent uninstall)
- [ ] `bin/sleepwalker-run-cli` — bash supervisor with PATH, gates, budget, audit (covers ADPT-04 + SAFE-02)
- [ ] `hooks/tests/supervisor-tests.sh` — bash harness, fixture binaries, ~10 integration assertions
- [ ] `dashboard/lib/runtime-adapters/claude-routines.ts` + `dashboard/tests/claude-routines.test.ts` (covers ADPT-05)
- [ ] `dashboard/lib/runtime-adapters/claude-desktop.ts` + `dashboard/tests/claude-desktop.test.ts` (covers ADPT-06)
- [ ] `dashboard/lib/runtime-adapters/codex.ts` + `dashboard/tests/codex.test.ts` (covers ADPT-07 including auth-conflict branch)
- [ ] `dashboard/lib/runtime-adapters/gemini.ts` + `dashboard/tests/gemini.test.ts` (covers ADPT-08)
- [ ] `dashboard/lib/runtime-adapters/index.ts` — registry swap (stubs → real adapters) + `healthCheckAll` implementation (covers ADPT-09)
- [ ] `dashboard/tests/adapter-registry.test.ts` — 2 `it()` blocks (ADAPTERS shape, healthCheckAll returns 4)
- [ ] `test/manual/codex-adapter-smoke.md` — 11-step real-Mac contract (Wave 4)
- [ ] `test/manual/claude-desktop-smoke.md` — Desktop Schedule tab pickup contract (Wave 4)

**Reused infrastructure (no new install):**
- Vitest 2.1.8 + pnpm scripts
- `dashboard/tests/helpers.ts::makeTempHome()` + `ensureSleepwalkerDir()`
- `hooks/tests/run-tests.sh` harness pattern (copied into `supervisor-tests.sh`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Desktop Schedule tab picks up dropped SKILL.md | ADPT-06 | Desktop's internal state store is not file-based; automated probe is unreliable | `test/manual/claude-desktop-smoke.md` (Phase 1 research flag resolution) |
| Codex plist survives real `launchctl bootstrap gui/$UID` + cron fire + bootout cycle | ADPT-07 | CI sandbox can't install launchd agents at user domain level | `test/manual/codex-adapter-smoke.md` (11 steps, record in `02-SUMMARY.md`) |
| Gemini plist same on real Mac (optional but recommended) | ADPT-08 | Same | `test/manual/gemini-adapter-smoke.md` (optional; parallel to codex) |

Each manual test records timestamp, macOS version, CLI version, step-by-step pass/fail checkboxes in `02-SUMMARY.md`.

---

## Anti-Requirements (Frozen-Surface Guards)

Phase 2 MUST NOT touch any of the following:

| Asset | Reason |
|------|--------|
| `install.sh` | v0.1 install contract frozen |
| `hooks/sleepwalker-*.sh`, `hooks/_detect_fleet.sh` | 3 v0.1 hooks + fleet detector frozen |
| `routines-local/sleepwalker-*/` (all 6) | 14 v0.1 routine paths preserved byte-for-byte |
| `routines-cloud/<id>/` (all 9 incl. `_test-zen`) | Same |
| `bin/sleepwalker-execute` | v0.1 re-execution loop frozen |
| `dashboard/lib/queue.ts` | `QueueSource` widening is Phase 5 |
| `dashboard/lib/{routines,cloud,cloud-cache,queue-aggregator,settings,approval,audit,github,fire-routine}.ts` | v0.1 reader/writer contracts frozen (except `fire-routine.ts` is *read* by `claude-routines.ts` — no modification) |
| `dashboard/app/**` | No routes or pages added in Phase 2 (editor is Phase 3) |
| `dashboard/package.json` | No new runtime dependencies in Phase 2 (zod/execa/etc. enter in Phase 3+) |
| `dashboard/tsconfig.json`, `dashboard/vitest.config.ts` | Config frozen |
| `.planning/phases/01-foundation/*` | Phase 1 artifacts are immutable |

Phase 2 ships additive code in:
- `dashboard/lib/runtime-adapters/launchd-writer.ts` (new)
- `dashboard/lib/runtime-adapters/claude-routines.ts` (new)
- `dashboard/lib/runtime-adapters/claude-desktop.ts` (new)
- `dashboard/lib/runtime-adapters/codex.ts` (new)
- `dashboard/lib/runtime-adapters/gemini.ts` (new)
- `dashboard/tests/launchd-writer.test.ts`, `claude-routines.test.ts`, `claude-desktop.test.ts`, `codex.test.ts`, `gemini.test.ts`, `adapter-registry.test.ts` (new)
- `bin/sleepwalker-run-cli` (new)
- `hooks/tests/supervisor-tests.sh` (new — testing new code, additive to hooks/tests/)
- `test/manual/*.md` (new)

Modifications (not additions) permitted only on:
- `dashboard/lib/runtime-adapters/slug.ts` — add `assertValidSlug()` function + call inside every builder (Phase 1 output is mutable within Phase 2 because Phase 2 explicitly resolves the Phase 1 review debt)
- `dashboard/tests/slug.test.ts` — add `it()` blocks for builder invalid-input throws
- `dashboard/lib/runtime-adapters/types.ts` — add optional `warning?: string` to `HealthStatus` (additive, non-breaking)
- `dashboard/lib/runtime-adapters/index.ts` — replace 4 `notImplemented()` stubs with real adapter imports (the whole point)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR are listed as manual-only in the table above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (none in Phase 2 — all units + 3 manual)
- [ ] Wave 0 covers all MISSING references (13 new source/test files + manual test docs)
- [ ] No watch-mode flags in any task command
- [ ] Feedback latency < 60 s (quick: ~10s, full: ~45-60s)
- [ ] `nyquist_compliant: true` set in frontmatter once planner delivers PLAN.md files matching this contract
- [ ] Frozen-surface gate returns zero lines of diff after phase merge
- [ ] Manual smoke test reports included in `02-SUMMARY.md`

**Approval:** pending — awaiting plans from gsd-planner.
