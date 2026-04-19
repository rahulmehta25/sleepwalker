---
phase: 02-adapters
status: code-complete-manual-smoke-pending
started: 2026-04-19
code_complete: 2026-04-19
plans_total: 10
plans_complete: 10
plans_code_complete: 10
manual_smokes_pending: 2
requirements_sealed: [ADPT-03, ADPT-04, ADPT-05, ADPT-06, ADPT-07, ADPT-08, ADPT-09, SAFE-02]
tags: [phase-rollup, adapters, launchd, supervisor, registry, exit-gate]
---

# Phase 2: Adapters — Phase Summary

**Status:** Code Complete (2 manual smokes pending user execution).
**Date:** 2026-04-19.
**Plans shipped:** 10/10. **Requirements sealed (code):** 8/8 (ADPT-03..09 + SAFE-02). **Manual smoke tests pending:** 2 (codex real-launchctl bootstrap; Claude Desktop Q1 Schedule-tab observation). **Frozen v0.1 surface:** byte-identical against PHASE2_BASE `0ec59df` (parent of `e14bbe6` — first launchd-writer.ts commit).

Phase 2 shipped four working runtime adapters (Claude Routines, Claude Desktop, Codex, Gemini), the shared launchd writer, the bash supervisor (`bin/sleepwalker-run-cli`) with the bash-harness integration suite, the frozen `ADAPTERS` registry with `healthCheckAll()`, and the `HealthStatus.warning` optional field that powers the dashboard's yellow-badge logic. Every consumer in v0.2 reaches runtimes through `getAdapter(runtime)`; no file directly imports a specific adapter module. The v0.1 public surface (`install.sh`, hook scripts, `~/.sleepwalker/*.jsonl` schemas, queue field names) is verified byte-identical via the dynamic-PHASE2_BASE frozen-surface diff.

Two manual smoke tests remain — both deferred to the user because they produce real hardware side-effects (launchctl bootstrap on real Mac; observation of Claude Desktop's Schedule tab UI). Contract documents exist at `test/manual/codex-adapter-smoke.md` + `test/manual/claude-desktop-smoke.md`.

## Per-plan rollup

| Plan | Requirement(s) | Key deliverable | Commit(s) | Tests added |
|------|----------------|-----------------|-----------|-------------|
| 02-01 | ADPT-02 amend | `slug.ts` `assertValidSlug` guard injected into 6 identifier builders (throw-on-invalid); `parseFleetKey` stays unguarded per result-object convention | `c5922de` | +7 in slug.test.ts (56 -> 63) |
| 02-02 | ADPT-03 | `dashboard/lib/runtime-adapters/launchd-writer.ts` (226 lines): 3 type exports + `generatePlist` / `installPlist` / `uninstallPlist`; `plutil -lint` gate; bootout-first + bootstrap rollback on failure | `e14bbe6` | +9 in launchd-writer.test.ts (63 -> 72) |
| 02-03 | ADPT-04 + SAFE-02 | `bin/sleepwalker-run-cli` (183 bash lines): login-shell PATH resolution; sleep-window + reversibility gates; char-budget SIGTERM watchdog; 3-class perl ANSI strip; `NO_COLOR=1 TERM=dumb CI=true`; prompt via stdin (Pitfall 4 by construction) | `39f7eb3` | (bash-only; no vitest delta) |
| 02-04 | ADPT-04 verification | `hooks/tests/supervisor-tests.sh` (275 bash lines): 6 integration scenarios covering codex happy, SAFE-02 ANSI strip, budget SIGTERM, red+balanced defer, bundle-missing EX_NOINPUT, gemini happy | `5bdb19c` | +24 bash asserts (0 -> 24 PASS) |
| 02-05 | ADPT-05 | `claude-routines.ts` (105 lines): browser-handoff deploy + `fireRoutine` delegation for runNow + login-shell healthCheck; `CC_ROUTINE_BETA` single-source-of-truth re-export | `62bdaa7` + `d7223a8` | +7 in claude-routines.test.ts (72 -> 79) |
| 02-06 | ADPT-06 | `claude-desktop.ts` adapter: SKILL.md drop into `~/.claude/scheduled-tasks/<slug>/` + `claude://` handoff URL | `81f68ca` | +6 in claude-desktop.test.ts (79 -> 85) |
| 02-07 | ADPT-07 | `codex.ts` (223 lines): login-shell resolver + `installPlist` + minimal env (no `OPENAI_API_KEY`); `spawn` fire-and-forget for runNow; 3-stage healthCheck with TOML auth-mode detection | `fbda124` | +6 in codex.test.ts (85 -> 91) |
| 02-08 | ADPT-08 | `gemini.ts` (283 lines): **deploy BLOCKED when `runtime_config.gemini_quota_project` missing** (Pitfall 3 by construction); `GOOGLE_CLOUD_PROJECT` injected into plist env; `GEMINI_API_KEY` never written; enriched version string with quota + auth mode | `72c6f69` | +7 in gemini.test.ts (91 -> 98) |
| 02-09 | ADPT-09 | `types.ts` `HealthStatus.warning?: string` field (additive); `index.ts` registry swap — 4 `notImplemented` stubs replaced with real adapters; codex + gemini migrated from `WARN:` prefix to direct `warning` field | `db1e65d` + `a2f0563` + `fc2b84a` + `78eaaf7` | +6 in adapter-registry.test.ts (98 -> 104) |
| 02-10 | phase exit gate | Two manual smoke contracts (`test/manual/codex-adapter-smoke.md` + `test/manual/claude-desktop-smoke.md`); automated 4-step gate green; frozen-surface diff = 0 lines; ROADMAP/STATE/REQUIREMENTS updated | `0331f69` + closeout commit | (no vitest delta; 104/104 preserved) |

## Automated Exit Gate Results

Executed 2026-04-19 03:10-03:11 EST at HEAD = `0331f69`.

- **Step 1 — `cd dashboard && pnpm typecheck`** -> exit 0. No type errors.
- **Step 2 — `cd dashboard && pnpm test`** -> exit 0. **104 tests passed across 16 files.**
- **Step 3 — `bash hooks/tests/supervisor-tests.sh`** -> exit 0. **24 PASS / 0 FAIL**. Final line: `all supervisor tests passed`.
- **Step 4 — dynamic frozen-surface diff** -> **0 lines**. `PHASE2_BASE` computed as `e14bbe6~1 = 0ec59df` (parent of the first `launchd-writer.ts` commit).

Full command for Step 4:
```bash
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
# 0
```

Per Phase 1 lessons learned: PHASE2_BASE is computed dynamically from git history rather than hardcoded. The `git log --reverse --diff-filter=A -- <sentinel-file>` idiom finds the first commit that introduced `launchd-writer.ts` (the earliest net-new Phase 2 source file) and takes its parent, which is rebase-safe and forward-compatible.

## Key Decisions (Phase 2)

1. **Browser-handoff deploys for Claude runtimes** — `claude-routines.ts` returns `{handoffUrl: claude.ai/code/routines/new?...}` and `claude-desktop.ts` returns `{handoffUrl: claude://scheduled-tasks?slug=...}`. Direct programmatic create is not supported by the Anthropic API today (see `.planning/research/STACK.md`); the browser-handoff is the documented safe path.
2. **Supervisor (`bin/sleepwalker-run-cli`) wraps every Codex/Gemini invocation** — Codex/Gemini have no hook schema, so safety semantics (ANSI strip, char-budget SIGTERM, reversibility defer, sleep-window defer, audit JSONL emission) move up one layer into the supervisor. Prompt text never enters argv (Pitfall 4 defense by construction).
3. **`HealthStatus.warning?: string` is additive, not migrated** — `reason?: string` kept its existing semantics ("why unavailable"); `warning?: string` was added for the "available but with caveats" case (Gemini quota collision, Codex auth.json + env-key both set). Dashboard yellow-badge logic is `!!warning`.
4. **Gemini deploy BLOCKS when quota project missing** — silent wrong-project billing (Pitfall 3) is defeated by construction: `runtime_config.gemini_quota_project` missing -> `{ok:false, error: "Gemini quota project not configured..."}` with zero plist written. No orphan state possible.
5. **`getAdapter(runtime)` everywhere; zero direct adapter imports** — enforced by the `ADAPTERS` registry + `Record<Runtime, RuntimeAdapter>` type in `index.ts`. Phase 2 Plan 09's `adapter-registry.test.ts` includes a regression-guard test that probes every adapter's `deploy()` and asserts `/not implemented/i` is not present — future contributors can't revert to the stub pattern without tripping CI.
6. **Codex runNow uses `spawn` not `execFile`** — `execFile`'s ExecFileOptions type lacks `stdio`, so fire-and-forget requires `spawn(..., {detached: true, stdio: "ignore"})` + `child.unref()`. Discovered as a Rule-3 auto-fix in Plan 02-07; applied to gemini.ts by pattern inheritance in Plan 02-08.

## Manual Smoke Test Results (Wave 4)

**Status:** Both smokes pending. Contracts are fully specified; the user runs them on their Mac and fills in this section.

### Codex Adapter Smoke (test/manual/codex-adapter-smoke.md)

- **Run timestamp:** _(pending)_
- **macOS version:** _(pending)_
- **codex version:** _(pending)_
- **Steps:** 1 [ ] · 2 [ ] · 3 [ ] · 4 [ ] · 5 [ ] · 6 [ ] · 7 [ ] · 8 [ ] · 9 [ ] · 10 [ ] · 11 [ ]
- **Audit entries observed:** _(pending)_
- **Issues / deviations:** _(pending)_

### Claude Desktop Smoke (test/manual/claude-desktop-smoke.md)

- **Run timestamp:** 2026-04-19 (pre-Phase-3 smoke run, user-reported)
- **macOS + Claude Desktop versions:** Claude Desktop 1.3109.0
- **Step 5 (Q1 outcome):** **(c) requires manual add** — Claude Desktop does NOT pick up `SKILL.md` files dropped into `~/.claude/scheduled-tasks/<slug>/`, even after visiting the Schedule tab. Users must use Desktop's "Add Scheduled Task" UI directly and paste the generated `SKILL.md` content.
- **Step 7 (output file written):** n/a — because Desktop never picked up the synthetic routine, it never fired, so no output file was written. This is the expected consequence of outcome (c).
- **Phase 6 docs recommendation:** AUTHORING.md MUST state explicitly: "After Sleepwalker deploys a Claude Desktop routine, you MUST open Claude Desktop → Schedule → Add, and paste the generated SKILL.md content. Otherwise the routine will never run."
- **Phase 3 UX implication:** the claude-desktop `deploy()` returning `{ok: true}` is misleading without a clipboard handoff. Dashboard Deploy drawer (or Editor save confirmation) must either (a) automatically `pbcopy` the SKILL.md contents AND open the `claude://scheduled-tasks` handoff URL, or (b) show an explicit "⚠ Next step: paste into Desktop's Schedule tab" instruction with a one-click "Copy SKILL.md" affordance. Tracked as Plan 02-11 (TCC staging + Desktop clipboard) — see Open Issues below.

### Codex Adapter Smoke Partial Results (user-reported)

- **Step 6 (parseCron):** PASSED. parseCron fix validated against a real codex adapter deploy flow.
- **Steps 8–9 (end-to-end supervisor execution):** NOT CERTIFIABLE from this smoke environment due to macOS TCC (Transparency, Consent, and Control) blocking writes from `launchctl`-spawned processes to `~/Desktop/`. Adapter, plist writer, and `launchctl bootstrap` integration are all verified to that layer; full supervisor-executed job output cannot be observed without relocating the smoke working tree out of `~/Desktop/` or staging the supervisor to `~/.sleepwalker/bin/`.
- **Environmental state confirmed clean:** no stale launchd jobs (only unrelated `com.slker.codex.registry-probe` from earlier dev work), no residual plists, no residual SKILL.md files, no residual `/tmp` files, no residual fixtures. `git status` unchanged from pre-smoke (only pre-existing untracked files).
- **Open Issue — TCC staging:** Recommend Plan 02-11 (follow-up) adds two small fixes: (1) `install.sh` copies `bin/sleepwalker-run-cli` to `~/.sleepwalker/bin/` (TCC-safe path) and adapters prefer that path when present; (2) Desktop adapter `deploy()` or dashboard UI additionally `pbcopy`s `SKILL.md` content. Together: ~30 LOC + 3 tests. Converts outcome (c) from a 3-step manual copy to a one-click UX.

### How to run

From repo root:
```bash
# Codex smoke (11 steps)
cat test/manual/codex-adapter-smoke.md
# then execute the bash blocks in order on your Mac

# Claude Desktop smoke (9 steps)
cat test/manual/claude-desktop-smoke.md
# then execute steps 1-3 in a terminal, open Claude Desktop for step 4-5,
# continue 6-9 in terminal
```

When done, edit this section to replace `_(pending)_` with the actual observations, then commit as `docs(02-10): record Wave 4 manual smoke results`.

## Frozen Surface Audit

Verified byte-identical against PHASE2_BASE `0ec59df` across all 20 enumerated v0.1 paths:

- `install.sh`
- `hooks/sleepwalker-defer-irreversible.sh` · `hooks/sleepwalker-budget-cap.sh` · `hooks/sleepwalker-audit-log.sh` · `hooks/_detect_fleet.sh`
- `routines-local/` · `routines-cloud/`
- `bin/sleepwalker-execute`
- `dashboard/lib/queue.ts` · `dashboard/lib/routines.ts` · `dashboard/lib/cloud.ts` · `dashboard/lib/cloud-cache.ts` · `dashboard/lib/queue-aggregator.ts` · `dashboard/lib/settings.ts` · `dashboard/lib/approval.ts` · `dashboard/lib/audit.ts` · `dashboard/lib/github.ts` · `dashboard/lib/fire-routine.ts`
- `dashboard/app/` · `dashboard/package.json` · `dashboard/tsconfig.json` · `dashboard/vitest.config.ts`

`git diff ... | wc -l = 0`.

## TODO — Pending Manual Smokes

1. Run `test/manual/codex-adapter-smoke.md` — 11 steps, ~10 minutes on a Mac with `codex` installed. Records in this file's "Codex Adapter Smoke" section.
2. Run `test/manual/claude-desktop-smoke.md` — 9 steps, ~5 minutes on a Mac with Claude Desktop installed. Records in this file's "Claude Desktop Smoke" section.
3. After both are recorded, commit as a docs update and consider Phase 2 fully sealed (flip ROADMAP.md Phase 2 row from "9/10 Complete (manual smokes pending)" to "10/10 Complete"; flip REQUIREMENTS.md traceability entries from "Code Complete (manual smoke pending)" to plain "Complete" with smoke-run date).

## Closeout

Phase 2 is code-complete. Phase 3 Wave 0 plans (03-01 deps + bundle-schema; 03-02 secret-patterns + scan) are unblocked immediately (they only depend on net-new npm packages). Phase 3 Wave 1+ plans (03-03, 03-05, 03-06) depend on `phase-2-plan-02-09` (the ADAPTERS registry swap) — now sealed, so those are also unblocked from a dependency standpoint even though manual smokes remain.

Next action: `/gsd-plan-phase 3` would plan Phase 3, but that work is already done (`03-RESEARCH.md` / `03-VALIDATION.md` / `03-PATTERNS.md` / 9 plans across 6 waves — see STATE.md). So next action is `/gsd-execute-phase 3`.

## Self-Check: PASSED

- [x] 10/10 per-plan SUMMARY files exist under `.planning/phases/02-adapters/`
- [x] Automated gate ran green (typecheck + vitest 104/104 + supervisor 24/24 + frozen-surface diff = 0)
- [x] PHASE2_BASE dynamically resolved to `0ec59df` (parent of `e14bbe6`, first launchd-writer.ts commit)
- [x] Manual Smoke Test Results section exists with pending-state placeholders for user to fill
- [x] TODO section explicitly names the two contract docs the user runs next
- [x] Frozen v0.1 surface verified byte-identical
