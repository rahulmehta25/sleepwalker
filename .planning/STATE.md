# State: Sleepwalker v0.2

**Initialized:** 2026-04-18
**Last updated:** 2026-04-18 after Phase 1 planning

## Project Reference

**Core value:** Write a prompt + pick a schedule + pick a runtime -> click once -> a live agent exists on that runtime, scheduled, audited, and reviewed from one place. No copy-paste, no terminal, no multi-step wiring.

**Current focus:** Establish the adapter foundation (Phase 1) so every runtime integration is type-safe, collision-proof, and backward-compatible with v0.1.

## Current Position

**Milestone:** v0.2 — Multi-Runtime Agent Deployment
**Phase:** 1 — Foundation (planned, ready to execute)
**Plan:** 4 plans authored (01-01 types + index, 01-02 .gitkeep scaffolding, 01-03 slug.ts + tests, 01-04 frozen-surface gate)
**Status:** Ready to execute via `/gsd-execute-phase 1`

**Milestone progress:**
```
[------] 0/6 phases complete
```

**Phase 1 progress:**
```
[OOOO--] 0/4 plans complete (all authored, none executed)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Requirements mapped | 32/32 (100%) |
| Phases defined | 6 |
| Plans authored | 4 (Phase 1) |
| Plans complete | 0 |
| v0.1 surface frozen | Yes (enforced in Phase 6) |

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

### Open Todos

- [ ] Execute Phase 1 (Foundation) — `/gsd-execute-phase 1`
- [ ] Validate Claude Desktop scheduling via synthetic timestamp-writer test (flagged in research/SUMMARY.md Phase 1 research flag — belongs to Phase 2 Claude Desktop adapter work)
- [ ] Spike Monaco SSR pattern in isolation before committing to it for the editor (flagged in research/SUMMARY.md Phase 3 research flag, but defaulting to `<textarea>` per ARCHITECTURE.md Layer 5)

### Blockers

None. Roadmap is ready for phase planning.

## Session Continuity

**Last session:** Phase 1 planning (2026-04-18)

**Resumption context:**
- All 32 v1 requirements are mapped to exactly one of six phases.
- Phase 1 has 4 plans authored, verified, and committed. Plan-checker PASSED on iteration 2.
- Next action: Run `/gsd-execute-phase 1` to build `types.ts`, `slug.ts`, `index.ts`, `slug.test.ts`, and the three `.gitkeep` directory markers.

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
