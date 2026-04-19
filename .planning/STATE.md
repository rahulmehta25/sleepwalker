# State: Sleepwalker v0.2

**Initialized:** 2026-04-18
**Last updated:** 2026-04-19 after Phase 2 Plan 01 execution (slug assertValidSlug guard shipped)

## Project Reference

**Core value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place. No copy-paste, no terminal, no multi-step wiring.

**Current focus:** Phase 2 Adapters — ship 4 runtime adapters + launchd writer + bash supervisor so every target runtime can be deployed and probed. 10 plans authored across 4 waves; 1 complete (02-01 slug guard), 9 remaining.

## Current Position

**Milestone:** v0.2 — Multi-Runtime Agent Deployment
**Phase:** 2 — Adapters (in progress)
**Plan:** 1/10 complete — 02-01 shipped assertValidSlug guard into all 6 identifier builders; next is 02-02 launchd-writer
**Status:** Phase 2 execution underway — next: `/gsd-execute-phase 2` → 02-02

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
[#---------] 1/10 plans complete (02-01 shipped; 02-02..02-10 pending)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Requirements mapped | 32/32 (100%) |
| Phases defined | 6 |
| Phases complete | 1/6 (Phase 1 Foundation sealed) |
| Plans authored | 14 (Phase 1: 4, Phase 2: 10) |
| Plans complete | 5 (01-01, 01-02, 01-03, 01-04, 02-01) |
| Requirements complete | 2/32 (ADPT-01, ADPT-02 both sealed; 02-01 is an ADPT-02 enforcement amendment) |
| v0.1 surface frozen | Yes — byte-identical vs PHASE1_BASE 03d063d verified 2026-04-18 |
| Dashboard test suite | 63/63 green (56 v0.1+Phase 1 + 7 new slug throw assertions) |

| Plan | Duration | Tasks | Files | Commit |
|------|----------|-------|-------|--------|
| 01-01 | ~2 min | 3 | 3 | c146acf |
| 01-02 | ~1 min | 4 | 4 | b38416c |
| 01-03 | ~3 min | 3 | 3 | 313bf62 / fbe8adc / 8b73e0f |
| 01-04 | ~2 min | 5 | 1 | b924c9a |
| 02-01 | 3 min | 3 | 3 | c5922de |

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

### Open Todos

- [x] Execute Phase 1 Plan 01 (types.ts + index.ts freeze) — completed 2026-04-18 as commit `c146acf`
- [x] Execute Phase 1 Plan 02 (.gitkeep scaffolding) — completed 2026-04-18 as commit `b38416c`
- [x] Execute Phase 1 Plan 03 (slug.ts + slug.test.ts) — completed 2026-04-18 as commits `313bf62` / `fbe8adc` / `8b73e0f`
- [x] Execute Phase 1 Plan 04 (frozen-surface gate) — completed 2026-04-18 as commit `b924c9a`
- [x] Plan Phase 2 (Adapters): ADPT-03 through ADPT-09 + SAFE-02 — planned 2026-04-19 (10 plans across 4 waves authored)
- [x] Execute Phase 2 Plan 01 (slug.ts assertValidSlug guard + throw coverage) — completed 2026-04-19 as commit `c5922de`
- [ ] Execute Phase 2 Plan 02 (launchd-writer.ts plist generator + tests) — `/gsd-execute-phase 2`
- [ ] Validate Claude Desktop scheduling via synthetic timestamp-writer test (flagged in research/SUMMARY.md Phase 1 research flag — belongs to Phase 2 Claude Desktop adapter work in Plan 02-06)
- [x] UI-SPEC for Phase 3 Editor — approved 2026-04-19 (commits 1152375 + 961c4d3); textarea locked in, Monaco spike no longer needed per research/SUMMARY.md Phase 3 flag
- [ ] Plan Phase 3 (Editor) with approved UI-SPEC as design context — `/gsd-plan-phase 3`

### Blockers

None. Roadmap is ready for phase planning.

## Session Continuity

**Last session:** Phase 2 Plan 01 execution (2026-04-19) — assertValidSlug guard shipped

**Resumption context:**
- Phase 2 Wave 1 kicked off with Plan 02-01: `dashboard/lib/runtime-adapters/slug.ts` now enforces ADPT-02 at the code level. A new module-private `assertValidSlug()` helper throws on invalid input and is the first statement of all 6 identifier builders. `parseFleetKey` intentionally unguarded (parse-returns-null asymmetry preserved, documented inline). Public API unchanged at exactly 10 exports.
- Commit `c5922de` (single atomic) covers `dashboard/lib/runtime-adapters/slug.ts` + `dashboard/tests/slug.test.ts` + `docs/activity_log.md` — plan Task 3 intentionally requests one commit via `git commit --amend --no-edit` to match v0.1 convention.
- Dashboard test suite grew 56 → 63 (13 → 20 it() blocks in slug.test.ts; 28 → 35 expect assertions). Zero regressions. `pnpm typecheck` green. Frozen-surface gate still 0-line diff (only slug.ts and slug.test.ts in frozen-modify list changed, matching Phase 2 VALIDATION permissions).
- Next action: `/gsd-execute-phase 2` → Plan 02-02 (launchd-writer.ts plist generator). 02-02 depends only on slug.ts builders, so it is the next critical-path target.
- Wave 1 blockers: none. Waves 2-3 adapters now inherit path-traversal / uppercase / empty-string / leading-digit rejection by construction.

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
