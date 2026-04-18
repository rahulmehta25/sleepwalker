# State: Sleepwalker v0.2

**Initialized:** 2026-04-18
**Last updated:** 2026-04-18 after Phase 1 Plan 04 execution (Phase 1 complete)

## Project Reference

**Core value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place. No copy-paste, no terminal, no multi-step wiring.

**Current focus:** Establish the adapter foundation (Phase 1) so every runtime integration is type-safe, collision-proof, and backward-compatible with v0.1.

## Current Position

**Milestone:** v0.2 — Multi-Runtime Agent Deployment
**Phase:** 1 — Foundation (complete); next = Phase 2 Adapters planning
**Plan:** 01-04 complete (frozen-surface exit gate passed, Phase 1 sealed)
**Status:** Phase 1 complete — advance via `/gsd-plan-phase 2`

**Milestone progress:**
```
[#-----] 1/6 phases complete
```

**Phase 1 progress:**
```
[####] 4/4 plans complete (01-01, 01-02, 01-03, 01-04 all done)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Requirements mapped | 32/32 (100%) |
| Phases defined | 6 |
| Phases complete | 1/6 (Phase 1 Foundation sealed) |
| Plans authored | 4 (Phase 1) |
| Plans complete | 4 (01-01, 01-02, 01-03, 01-04) |
| Requirements complete | 2/32 (ADPT-01, ADPT-02 both sealed by exit gate) |
| v0.1 surface frozen | Yes — byte-identical vs PHASE1_BASE 03d063d verified 2026-04-18 |
| Dashboard test suite | 56/56 green (43 v0.1 + 13 new slug) |

| Plan | Duration | Tasks | Files | Commit |
|------|----------|-------|-------|--------|
| 01-01 | ~2 min | 3 | 3 | c146acf |
| 01-02 | ~1 min | 4 | 4 | b38416c |
| 01-03 | ~3 min | 3 | 3 | 313bf62 / fbe8adc / 8b73e0f |
| 01-04 | ~2 min | 5 | 1 | b924c9a |

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

### Open Todos

- [x] Execute Phase 1 Plan 01 (types.ts + index.ts freeze) — completed 2026-04-18 as commit `c146acf`
- [x] Execute Phase 1 Plan 02 (.gitkeep scaffolding) — completed 2026-04-18 as commit `b38416c`
- [x] Execute Phase 1 Plan 03 (slug.ts + slug.test.ts) — completed 2026-04-18 as commits `313bf62` / `fbe8adc` / `8b73e0f`
- [x] Execute Phase 1 Plan 04 (frozen-surface gate) — completed 2026-04-18 as commit `b924c9a`
- [ ] Plan Phase 2 (Adapters): ADPT-03 through ADPT-09 + SAFE-02 — `/gsd-plan-phase 2`
- [ ] Validate Claude Desktop scheduling via synthetic timestamp-writer test (flagged in research/SUMMARY.md Phase 1 research flag — belongs to Phase 2 Claude Desktop adapter work)
- [ ] Spike Monaco SSR pattern in isolation before committing to it for the editor (flagged in research/SUMMARY.md Phase 3 research flag, but defaulting to `<textarea>` per ARCHITECTURE.md Layer 5)

### Blockers

None. Roadmap is ready for phase planning.

## Session Continuity

**Last session:** Phase 1 Plan 04 execution (2026-04-18) — Phase 1 sealed

**Resumption context:**
- Phase 1 complete. All four plans landed with atomic commits:
  - 01-01: `c146acf` — `dashboard/lib/runtime-adapters/types.ts` (RuntimeAdapter + 7 supporting types, 8 exports) + `index.ts` (ADAPTERS registry skeleton + getAdapter + healthCheckAll).
  - 01-02: `b38416c` — `routines-codex/`, `routines-gemini/`, `templates/` sibling directories each carrying `.gitkeep` with Pitfall-2 protective comment.
  - 01-03: `313bf62` + `fbe8adc` + `8b73e0f` — `dashboard/lib/runtime-adapters/slug.ts` (validateSlug + 5 builders + RUNTIMES + parseFleetKey, 10 exports) + `dashboard/tests/slug.test.ts` (13 it blocks / 28 expect assertions).
  - 01-04: `b924c9a` — frozen-surface exit gate verified (PHASE1_BASE=`03d063d`, 0-line diff across 14 paths); `pnpm typecheck` + `pnpm test` both exit 0 with 56/56 green; all 7 artifacts inventoried; ROADMAP finalized to 4/4 Complete; closeout activity-log entry appended.
- ADPT-01 and ADPT-02 both sealed and verified. 56-test dashboard suite is the v0.1+Phase 1 baseline Phase 2 must preserve.
- Phase 2 Adapters is now unblocked. Phase 2 imports `RuntimeAdapter` and identifier builders from the frozen Phase 1 surface; no Phase 2 plan may modify `types.ts` or `slug.ts` without a Phase 1 amendment.
- Next action: `/gsd-plan-phase 2` to author Phase 2 (ADPT-03..09, SAFE-02).

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
