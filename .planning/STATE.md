# State: Sleepwalker v0.2

**Initialized:** 2026-04-18
**Last updated:** 2026-04-19 after Phase 2 Plan 05 execution (claude-routines.ts adapter + 7 Vitest blocks shipped — first Wave 2 adapter green; VALIDATION.md rows 2-04-01..03 green; dashboard suite 72 -> 79 tests)

## Project Reference

**Core value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place. No copy-paste, no terminal, no multi-step wiring.

**Current focus:** Phase 2 Adapters — ship 4 runtime adapters + launchd writer + bash supervisor so every target runtime can be deployed and probed. 10 plans authored across 4 waves; 5 complete (02-01 slug guard, 02-02 launchd-writer, 02-03 supervisor, 02-04 supervisor-tests harness, 02-05 claude-routines adapter), 5 remaining. **Wave 1 complete. Wave 2 underway — 1 of 4 adapters green.**

## Current Position

**Milestone:** v0.2 — Multi-Runtime Agent Deployment
**Phase:** 2 — Adapters (in progress)
**Plan:** 5/10 complete — 02-05 shipped `dashboard/lib/runtime-adapters/claude-routines.ts` (105 lines) + `dashboard/tests/claude-routines.test.ts` (183 lines, 7 Vitest blocks); dashboard suite 72 → 79 green; ADPT-05 sealed. Wave 2 remaining: 02-06 (claude-desktop), 02-07 (codex), 02-08 (gemini) — all three runnable in parallel.
**Status:** Phase 2 execution underway — next: `/gsd-execute-phase 2` → 02-06 (claude-desktop adapter)

**Milestone progress:**
```
[#-----] 1/6 phases complete
```

**Phase 1 progress:**
```
[####] 4/4 plans complete (01-01, 01-02, 01-03, 01-04 all done)
```

**Phase 2 progress:**
```
[#####-----] 5/10 plans complete (02-01 + 02-02 + 02-03 + 02-04 + 02-05 shipped; Wave 1 complete; Wave 2 underway — claude-routines green, claude-desktop/codex/gemini pending; 02-06..02-10 pending)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Requirements mapped | 32/32 (100%) |
| Phases defined | 6 |
| Phases complete | 1/6 (Phase 1 Foundation sealed) |
| Plans authored | 14 (Phase 1: 4, Phase 2: 10) |
| Plans complete | 9 (01-01, 01-02, 01-03, 01-04, 02-01, 02-02, 02-03, 02-04, 02-05) |
| Requirements complete | 6/32 (ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05, SAFE-02) |
| v0.1 surface frozen | Yes — byte-identical vs PHASE1_BASE 03d063d verified 2026-04-18; frozen-surface gate 0-line diff after 02-05 (new additive `claude-routines.ts` + `claude-routines.test.ts`; no v0.1 files touched) |
| Dashboard test suite | 79/79 green (+7 new from 02-05: 4 describe × 7 it() in claude-routines.test.ts) |
| Supervisor harness | 24 PASS / 0 FAIL / exit 0 (`bash hooks/tests/supervisor-tests.sh` → `all supervisor tests passed`) |

| Plan | Duration | Tasks | Files | Commit |
|------|----------|-------|-------|--------|
| 01-01 | ~2 min | 3 | 3 | c146acf |
| 01-02 | ~1 min | 4 | 4 | b38416c |
| 01-03 | ~3 min | 3 | 3 | 313bf62 / fbe8adc / 8b73e0f |
| 01-04 | ~2 min | 5 | 1 | b924c9a |
| 02-01 | 3 min | 3 | 3 | c5922de |
| 02-02 | 4 min | 4 | 3 | e14bbe6 |
| 02-03 | 3 min | 3 | 2 | 39f7eb3 |
| 02-04 | 6 min | 3 | 2 | 5bdb19c |
| 02-05 | 4 min | 3 | 3 | 62bdaa7 + d7223a8 |

## Accumulated Context

### Decisions

- **2026-04-18** — Four runtimes in v0.2: Claude Routines, Claude Desktop, Codex Pro, Gemini CLI Pro. Amp + Devin deferred to v0.3. Rationale: Rahul has all four; they share the "CLI that takes a prompt" shape; Amp + Devin don't.
- **2026-04-18** — Adapter pattern + discriminated-union registry (Airflow/Prefect shape), not plugins, not class hierarchy. Rationale: OSS readability, stateless, type-safe.
- **2026-04-18** — Parallel sibling directories (`routines-codex/`, `routines-gemini/` alongside `routines-local/`, `routines-cloud/`). Rationale: zero `install.sh` changes needed; matches v0.1 convention.
- **2026-04-18** — Hand-rolled plist XML writer (30 lines, zero deps), `launchctl bootstrap/bootout` (not deprecated `load/unload`). Rationale: plist format stable since 10.4; library deps add no value.
- **2026-04-18** — `bin/sleepwalker-run-cli` supervisor wraps all Codex/Gemini invocations with the same safety semantics v0.1 hooks provide for Claude: PATH setup, reversibility gate, char-budget SIGTERM, ANSI-stripped audit JSONL. Rationale: Codex/Gemini have no hook schema; safety moves up one layer.
- **2026-04-18** — Cross-runtime identifiers are namespaced `<runtime>/<slug>` everywhere (internal keys, launchd labels `com.sleepwalker.<runtime>.<slug>`, marker tags `[sleepwalker:<runtime>/<slug>]`, branch prefix `claude/sleepwalker/<runtime>/<slug>/*`). Rationale: Pitfall #7 slug collisions must be impossible by construction.
- **2026-04-18** — User prompts NEVER touch a shell-expanded string. Prompt is always written to `prompt.md`; supervisor reads via stdin/file flag; plist `ProgramArguments` points to supervisor by absolute path only. Rationale: Pitfall #4 shell injection defeated by convention.
- **2026-04-18** — Deploy is a 4-phase state machine (`planning -> writing -> loading -> verified`) tracked in `~/.sleepwalker/deploys/<slug>.state.json`; auto-rollback on any step failure. Rationale: Pitfall #5 partial-success deploys leave orphaned artifacts.
- **2026-04-18** — Backward compatibility is non-negotiable. v0.1 hook names/paths, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` wiring, `QueueEntry` field names, reversibility colors, policy names — all frozen. v0.2 additions are strictly additive. Verified in Phase 6 via integration test.
- **2026-04-18** — Plan 01-01 shipped the frozen `RuntimeAdapter` contract in `dashboard/lib/runtime-adapters/types.ts` (8 exports) and the `ADAPTERS` registry skeleton in `index.ts` (4 stubs). Runtime is a string-literal union (not enum); Reversibility is declared in types.ts (not imported from queue.ts) to respect the v0.2 dep graph. ADPT-01 locked.
- **2026-04-18** — Plan 01-02 shipped the filesystem half of ADPT-02: three root-level sibling directories (`routines-codex/`, `routines-gemini/`, `templates/`) with `.gitkeep` placeholders each carrying a Pitfall-2 protective comment naming the future consumer (codex.ts, gemini.ts, Phase 6 templates). v0.1 directories byte-identical (0 lines of diff). Commit b38416c.
- **2026-04-18** — Plan 01-03 completed the code half of ADPT-02: `dashboard/lib/runtime-adapters/slug.ts` exports 10 public symbols (RUNTIMES tuple + validateSlug + isRuntime type guard + toFleetKey + parseFleetKey + 5 identifier builders) enforcing the `<runtime>/<slug>` namespacing convention by code reuse. Backed by `dashboard/tests/slug.test.ts` (13 it() blocks, 28 expect() assertions, 100% pass). Full dashboard suite grows from 43 to 56 green tests; zero v0.1 regressions; frozen-surface gate returns 0 lines. Commits 313bf62 (slug.ts) + fbe8adc (slug.test.ts) + 8b73e0f (activity log).
- **2026-04-18** — Plan 01-04 exit gate passed: dynamic PHASE1_BASE (parent of `c146acf` = `03d063d`) confirms 0-line diff across all 14 enumerated v0.1 paths; `pnpm typecheck` exit 0; `pnpm test` 56/56 green; all 7 Phase 1 artifacts present (4049+2332+3149+3173+3×gitkeep = 13,230 bytes); ROADMAP Phase 1 row flipped to `4/4 Complete 2026-04-18`. ADPT-01 and ADPT-02 sealed. Commit b924c9a. Phase 1 Foundation complete; Phase 2 Adapters is now the critical path.
- **2026-04-19** — Phase 3 UI-SPEC approved. `03-UI-SPEC.md` (440 lines, commits 1152375 + 961c4d3) locks the Editor route visual/interaction contract against the existing bespoke "lunar/celestial" Tailwind 3.4 palette (ink/moon/dawn/aurora/signal). Two-column layout at ≥1024px (form + sticky preview), 2×2 radio-card runtime picker with live health pills, inline red secret-scan panel, auto-derived slug with manual override, cronstrue-pill live preview, explicit draft-recovery banner (no silent restore). gsd-ui-checker APPROVED 6/6 (Copywriting, Visuals, Color, Typography, Spacing, Registry Safety); 1 non-blocking FLAG on Typography header cleared in follow-up commit. Bespoke design system — no shadcn, no third-party registries, `ui_safety_gate` not applicable. Planner for Phase 3 now has a prescriptive design source-of-truth before `/gsd-plan-phase 3`.
- **2026-04-19** — Plan 02-01 resolved Phase 1 review debt item #1 by injecting a module-private `assertValidSlug()` throw guard into every identifier builder in `dashboard/lib/runtime-adapters/slug.ts` (toFleetKey, toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath, toBundleDir). `parseFleetKey` deliberately unguarded (construct-throws / parse-returns-null asymmetry preserved per result-object convention; NOTE comment added so future readers understand the intent). `assertValidSlug` is NOT exported → public API stays at exactly 10 surfaces. File grew 92 → 118 lines; suite grew 56 → 63 tests. Single atomic commit `c5922de` covers slug.ts + slug.test.ts + activity log per v0.1 amend-log convention. Wave 2 adapters inherit path-traversal / shell-metacharacter / git-ref-invalid rejection by construction.
- **2026-04-19** — Plan 02-02 shipped `dashboard/lib/runtime-adapters/launchd-writer.ts` (226 lines): 3 type exports (`LaunchdSchedule` discriminated union, `LaunchdJob`, `InstallResult`) + 3 functions (`generatePlist` pure XML templating with 5-char escape for `&<>"'`; `installPlist` async mode-0644 write + plutil -lint gate + bootout-first + bootstrap with rollback-unlink; `uninstallPlist` async bootout + ENOENT-tolerant unlink). Backed by `dashboard/tests/launchd-writer.test.ts` (200 lines, 9 Vitest it() blocks using `vi.doMock("node:child_process")` — no real launchctl or plutil). Single atomic commit `e14bbe6` (amended to include activity log) covers both source files per v0.1 convention. Dashboard suite grew 63 → 72 passing tests. Frozen-surface diff against `e14bbe6~1` returns 0 lines. ADPT-03 sealed. Two minor auto-adds documented in SUMMARY: 9th test block for bootstrap-failure rollback (threat T-02-02-04) and try/catch-instead-of-re-throw in uninstallPlist to match AC7 single-throw cap.
- **2026-04-19** — Plan 02-03 shipped `bin/sleepwalker-run-cli` (183 lines, mode 100755): bash supervisor with `set -euo pipefail`, `#!/bin/bash` shebang (byte-identical to v0.1 hooks), two helpers (`audit_emit` 2-arg JSON-fragment emitter; `strip_ansi` 3-class perl regex for CSI/OSC/DCS-PM-APC), five safety gates (usage-check EX_USAGE 64; bundle-preflight EX_NOINPUT 66; PATH-resolution with `/bin/zsh -l -c` then `/bin/bash -l -c` login-shell fallback chain + exit 127; sleep-window defer; reversibility policy defer), char-budget watchdog (`kill -0` liveness probe + `wc -c` poll every second + SIGTERM + SIGKILL-after-2s escalation), per-runtime static CLI_ARGS array (codex `exec - --json`; gemini `-p - --output-format stream-json --yolo`) — prompt text NEVER in argv (Pitfall 4 defeated by construction), backgrounded CLI pipeline with stderr-fold + strip_ansi + tee, terminal-event mutual exclusivity (budget_exceeded / completed / failed with exactly one emit per invocation). Single atomic commit `39f7eb3` covers supervisor + activity log per v0.1 convention. Dashboard suite stays 72/72 green (supervisor is bash-only). Two AC-grep clarifications documented in SUMMARY (same category as Plan 02-01 AC-doc notes): terminal-event regex count is 6 due to early-exit `failed` emits outside the terminal block, preview-encoder count is 4 due to explanatory comment — both behavioral intents verified via scoped grep. ADPT-04 + SAFE-02 sealed. Wave 2 codex/gemini adapters now have a real supervisor path for their `LaunchdJob.programArguments`.
- **2026-04-19** — Plan 02-04 shipped `hooks/tests/supervisor-tests.sh` (275 lines, mode 100755): bash integration harness with `set -euo pipefail`, isolated `$HOME` via `mktemp -d -t sw-supervisor-XXXXXX`, fixture `codex` / `gemini` bash stubs in `$TEST_BIN` on prepended PATH, `reset_state()` + `make_bundle()` helpers, `assert_eq` / `assert_contains` / `assert_file_lines` helpers copied verbatim from v0.1 `hooks/tests/run-tests.sh` pattern, EXIT trap cleaning both `$TEST_HOME` and per-scenario fixture bundles. Six scenarios cover VALIDATION.md rows 2-03-01..06: (1) codex happy path with `started` + `completed` + exit 0; (2) SAFE-02 ANSI strip — raw CSI bytes absent, literal `[32m` absent, `green-prefix` payload preserved; (3) char-budget SIGTERM — runaway fixture blows through 500-byte cap, `budget_exceeded` event emits; (4) reversibility defer — red routine under balanced policy defers without emitting `started`; (5) bundle missing — exit 66 + `failed` event with `bundle not found` reason; (6) gemini happy path — second runtime arm green. Harness runs green end-to-end: `bash hooks/tests/supervisor-tests.sh` → 24 PASS / 0 FAIL / exit 0 / final line `all supervisor tests passed`. Zero real launchctl/codex/gemini invocations; bash stubs only. Single atomic commit `5bdb19c` (pre-amend `b39859d`) covers harness + activity log per v0.1 amend convention. One Rule-3 auto-fix documented in SUMMARY: runaway fixture chunks changed from raw 2000-byte blobs to newline-terminated chunks because `perl -pe` is line-oriented (without `\n` perl buffers indefinitely and the watchdog never sees OUTPUT_FILE grow past budget — supervisor itself is unchanged; real codex/gemini emit NDJSON so production flow is unaffected). ADPT-04 + SAFE-02 are now *behaviorally* verified on top of 02-03's structural ship. Wave 1 complete; Wave 2 adapter work (Plans 02-05..08) is the next critical path.
- **2026-04-19** — Phase 3 Editor planned. `/gsd-plan-phase 3` ran research → pattern-mapper → planner → plan-checker. Artifacts: `03-RESEARCH.md` (1361 lines, commit `c343cb8`), `03-VALIDATION.md` (25 requirement-to-test rows, commit `e33d52b`), `03-PATTERNS.md` (24 files mapped to analogs, commit `2c7e190`), 9 PLAN.md files in 6 waves (commits `d64c359` plans + `7e4fbed` revision + `c8989ea` sweep). Plan-checker iteration 2 returned VERIFICATION PASSED across all 12 dimensions. EDIT-01 through EDIT-05 all covered. Hard build-order gate: plans 03-03, 03-05, 03-06 `depends_on: [phase-2-plan-02-09]`; only Wave 0 (03-01, 03-02) is safely parallel with Phase 2 execution. Net-new deps targeted: `zod@4.3.6` + `cronstrue@3.14.0` + `yaml@2.8.3` + `gray-matter@4.0.3` (runtime) and `@testing-library/react@^16` + `jsdom` (dev). Revision split: original 03-06 (6 tasks / 9 files — exceeded scope blocker) split into 03-06 (shell + RuntimeRadioGrid + CronPreview, 3 tasks) and 03-07 (SecretScanPanel + DraftRecoveryBanner + PreviewPanel, 3 tasks); old 03-07 → 03-08 EditorClient state machine; old 03-08 → 03-09 phase exit gate. Directory-swap atomic write (mkdtemp sibling + single-rename) is the only POSIX-atomic-as-a-pair write strategy and is locked as Plan 03-04. Phase 3 cannot fully execute until Phase 2 seals (02-05..02-10 pending).

### Open Todos

- [x] Execute Phase 1 Plan 01 (types.ts + index.ts freeze) — completed 2026-04-18 as commit `c146acf`
- [x] Execute Phase 1 Plan 02 (.gitkeep scaffolding) — completed 2026-04-18 as commit `b38416c`
- [x] Execute Phase 1 Plan 03 (slug.ts + slug.test.ts) — completed 2026-04-18 as commits `313bf62` / `fbe8adc` / `8b73e0f`
- [x] Execute Phase 1 Plan 04 (frozen-surface gate) — completed 2026-04-18 as commit `b924c9a`
- [x] Plan Phase 2 (Adapters): ADPT-03 through ADPT-09 + SAFE-02 — planned 2026-04-19 (10 plans across 4 waves authored)
- [x] Execute Phase 2 Plan 01 (slug.ts assertValidSlug guard + throw coverage) — completed 2026-04-19 as commit `c5922de`
- [x] Execute Phase 2 Plan 02 (launchd-writer.ts plist generator + tests) — completed 2026-04-19 as commit `e14bbe6`
- [x] Execute Phase 2 Plan 03 (bin/sleepwalker-run-cli bash supervisor) — completed 2026-04-19 as commit `39f7eb3`
- [x] Execute Phase 2 Plan 04 (hooks/tests/supervisor-tests.sh bash harness — 6 scenarios verifying audit contract + budget SIGTERM + ANSI strip) — completed 2026-04-19 as commit `5bdb19c` (24 PASS / 0 FAIL / `all supervisor tests passed`)
- [ ] Execute Phase 2 Plan 05 (claude-routines.ts adapter + 7 Vitest blocks; ADPT-05) — Wave 2 kickoff — `/gsd-execute-phase 2`
- [ ] Validate Claude Desktop scheduling via synthetic timestamp-writer test (flagged in research/SUMMARY.md Phase 1 research flag — belongs to Phase 2 Claude Desktop adapter work in Plan 02-06)
- [x] UI-SPEC for Phase 3 Editor — approved 2026-04-19 (commits 1152375 + 961c4d3); textarea locked in, Monaco spike no longer needed per research/SUMMARY.md Phase 3 flag
- [x] Plan Phase 3 (Editor) with approved UI-SPEC as design context — completed 2026-04-19 (9 plans in 6 waves, commits `c343cb8` research / `e33d52b` validation / `2c7e190` patterns / `d64c359` plans + `7e4fbed` revision + `c8989ea` sweep; plan-checker VERIFICATION PASSED on iteration 2)
- [ ] Execute Phase 3 Wave 0 in parallel with Phase 2 execution — Plans 03-01 (deps + bundle-schema) + 03-02 (secret-patterns + scan) depend only on net-new npm packages, not on runtime-adapters. Wave 1+ blocks on Phase 2 Plan 02-09 sealing

### Blockers

None. Roadmap is ready for phase planning.

## Session Continuity

**Last session:** Phase 2 Plan 04 execution (2026-04-19) — hooks/tests/supervisor-tests.sh bash harness shipped (Wave 1 complete)

**Resumption context:**
- Phase 2 Wave 1 complete: Plan 02-04 added `hooks/tests/supervisor-tests.sh` — the 275-line bash integration harness that exercises `bin/sleepwalker-run-cli` end-to-end with fixture codex/gemini stubs, isolated `$HOME`, and 6 assertion scenarios covering VALIDATION.md rows 2-03-01 through 2-03-06. `#!/bin/bash` shebang, `set -euo pipefail`, mode 100755 in git index. Pattern copied verbatim from v0.1 `hooks/tests/run-tests.sh`: `mktemp -d -t sw-supervisor-XXXXXX` for isolated HOME, `FIXTURE_BUNDLES` array + dual-layer `cleanup()` in EXIT trap, PASS/FAIL counters, `assert_eq` / `assert_contains` / `assert_file_lines` helpers. Zero real launchctl / codex / gemini invocations; fixture bash stubs on `$TEST_BIN`-prepended PATH only.
- Six scenarios cover the supervisor's behavioral contract: (1) codex happy path — started + completed + exit_code 0; (2) SAFE-02 ANSI strip — no raw CSI bytes, no literal `[32m`, `green-prefix` payload preserved; (3) char-budget SIGTERM — runaway codex fixture blows through 500-byte cap, `budget_exceeded` event emits; (4) reversibility defer — red routine under balanced policy defers without emitting `started`; (5) bundle missing — exit 66 + `failed` event with `bundle not found` reason; (6) gemini happy path — second runtime arm green.
- Harness run: `bash hooks/tests/supervisor-tests.sh` → 24 PASS / 0 FAIL / exit 0; final line `all supervisor tests passed`.
- One Rule-3 auto-fix documented in 02-04-SUMMARY.md: runaway fixture emits newline-terminated 2000-byte chunks instead of raw blobs. Supervisor's `strip_ansi` uses `perl -pe` which is line-oriented; without `\n` on each chunk perl buffers indefinitely, `tee` never writes, the watchdog never sees OUTPUT_FILE grow past budget, and `budget_exceeded` never fires. Supervisor itself is unchanged — real codex/gemini both emit NDJSON so production flow is unaffected. Fix is harness-side only.
- Commit `5bdb19c` (single atomic, amended; pre-amend `b39859d`) covers `hooks/tests/supervisor-tests.sh` + `docs/activity_log.md`. Plan Task 3 explicitly requested this single-commit shape via `git commit --amend --no-edit`, matching Plan 02-01/02/03 precedent.
- Dashboard test suite unchanged at 72/72 green (harness is bash-only; no TS touched). Frozen-surface diff returns 0 lines.
- VALIDATION.md rows 2-03-01 through 2-03-06 all flip from ⬜ pending to ✅ green with this plan's harness.
- Next action: `/gsd-execute-phase 2` → Plan 02-05 (claude-routines adapter + 7 Vitest blocks — ADPT-05). Wave 2 (Plans 02-05 through 02-08) can run in parallel per the plan's wave structure; Plan 02-09 (registry swap) blocks on all four; Plan 02-10 (exit gate) blocks on 02-09.
- Wave 1 blockers: none. Wave 2 codex/gemini adapters now have a behaviorally-ratified supervisor path for their `LaunchdJob.programArguments`.

**Files in play:**
- `.planning/PROJECT.md` — v0.1 Validated + v0.2 Active requirements + Out of Scope
- `.planning/REQUIREMENTS.md` — 32 v1 REQ-IDs with Phase + Status columns now filled
- `.planning/ROADMAP.md` — 6 phases with success criteria
- `.planning/STATE.md` — this file
- `.planning/research/SUMMARY.md` — research synthesis (5-phase suggestion; v0.2 uses 6 because Foundation was split out of the adapter phase)
- `.planning/research/ARCHITECTURE.md` — adapter interface, build-order chain, frozen v0.1 surface
- `.planning/research/PITFALLS.md` — 15 critical pitfalls mapped to phases
- `.planning/codebase/ARCHITECTURE.md` — v0.1 baseline
- `.planning/codebase/CONCERNS.md` — v0.1 issues (concurrent JSONL race is fixed in Phase 5)

---
*State file initialized: 2026-04-18*
