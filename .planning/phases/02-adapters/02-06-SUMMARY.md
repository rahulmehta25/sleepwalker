---
phase: 02-adapters
plan: 06
subsystem: runtime-adapter
tags: [adapter, claude-desktop, skill-md, browser-handoff, login-shell-path, idempotent-undeploy, pitfall-1, vitest, phase-2, wave-2]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "RuntimeAdapter + RoutineBundle + DeployResult + RunNowResult + HealthStatus type shapes; ADAPTERS registry stub for claude-desktop slot"
  - phase: 02-adapters
    provides: "slug.ts assertValidSlug guard (02-01) — bundleScheduledPath trusts upstream slug validation at the builder layer (Threat T-02-06-01 / ASVS V5)"
  - phase: 02-adapters
    provides: "claude-routines.ts (02-05) established the browser-handoff deploy + login-shell PATH probe patterns reused here verbatim"
provides:
  - "claudeDesktopAdapter (second live adapter — SKILL.md-to-disk + claude:// deeplink browser handoff)"
  - "SKILL.md write convention at ~/.claude/scheduled-tasks/<slug>/SKILL.md mode 0644 — Desktop watches this path"
  - "Idempotent undeploy via fs.rm({recursive: true, force: true}) — ENOENT treated as success (no throw on missing dir)"
  - "2-step healthCheck pattern: fs.stat(~/.claude) dir probe → execFile login-shell CLI probe. Distinct failure reasons surface which step broke."
affects: [02-09 registry swap, 02-10 phase exit gate, 03-editor preview handoffUrl rendering, Phase 5 queue-aggregator claude-desktop runNow callers, Plan 10 manual smoke test resolves research Q1]

# Tech tracking
tech-stack:
  added: []
  patterns: [browser-handoff-deploy, login-shell-path-probe, idempotent-fs-rm-force, 2-step-health-probe, execFile-array-args-no-shell-interpolation]

key-files:
  created:
    - dashboard/lib/runtime-adapters/claude-desktop.ts
    - dashboard/tests/claude-desktop.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "deploy uses fs.writeFile with explicit mode: 0o644 (not default umask-dependent mode) — matches v0.1 routine-file convention and is directly asserted by Test 1 via statSync(...).mode & 0o777."
  - "undeploy is idempotent by construction via fs.rm({recursive: true, force: true}) — force flag means ENOENT is silently treated as success, so the adapter does not need a pre-stat check. Matches Plan 02-02 launchd-writer.ts uninstallPlist ENOENT-tolerance convention."
  - "runNow uses execFile(\"claude\", [\"-p\", promptArg]) array args, NOT a shell string. Prompt enters argv as a single string (no shell expansion). This is distinct from the Codex/Gemini supervisor path (Plan 02-03) which requires stdin because those CLIs take multi-flag arg vectors where argv-injection would be unsafe."
  - "healthCheck performs TWO probes with distinct failure messages: step 1 fs.stat(~/.claude) returns reason '~/.claude/ not found; is Claude Desktop installed?' on miss; step 2 execFile zsh -l -c 'claude --version' returns reason 'claude CLI not found on login-shell PATH; see docs/AUTHORING.md' on miss. User can tell which step broke and take targeted action (Threat T-02-06-05 / ASVS V7)."
  - "Activity log entry SHA reference (82fd53a) captures the pre-final-amend commit hash rather than the final HEAD (81f68ca), because each amend that includes the activity log rewrites the SHA. Accepted rather than looped — the commit is findable by the unique 'feat(02-06): add claude-desktop runtime adapter' subject line. Same shape as the Plan 02-05 two-commit deviation: atomicity preserved (single commit), but SHA self-reference has one-hop drift."

patterns-established:
  - "Browser-handoff deploy #2: deploy writes bundle content to the runtime-specific disk path (SKILL.md for Desktop vs. nothing-on-disk for Routines) and returns {ok:true, artifact:<abs path>, handoffUrl:<deeplink>}. encodeURIComponent on the slug even though validateSlug rules already reject unsafe chars — defense in depth."
  - "Idempotent fs rm for undeploy: fs.rm(dir, {recursive: true, force: true}) is the one-liner pattern. Test coverage: (1) deploy-then-undeploy asserts dir gone; (2) undeploy-without-deploy asserts no throw. Reusable by any future runtime that stores bundle content in a per-slug directory."
  - "2-step healthCheck: stat a runtime-installation-sentinel path, then probe the CLI via login-shell. Each step returns a distinct, actionable reason. Codex/Gemini adapters in Plans 02-07/02-08 will follow the same shape (stat ~/.codex or ~/.gemini → execFile login-shell codex --version or gemini --version)."
  - "fs write + stat isolation via makeTempHome(): tests use real fs.writeFile / fs.rm against process.env.HOME overridden to a mkdtempSync dir. No fs mocking — only execFile mocked via vi.doMock. Template for claude-desktop-like adapters that touch disk."

requirements-completed: [ADPT-06]

# Metrics
duration: 3m
completed: 2026-04-19
---

# Phase 2 Plan 06: claude-desktop Adapter Summary

**Second live RuntimeAdapter — Claude Desktop Scheduled Tasks with SKILL.md-to-disk write + claude:// deeplink browser handoff, idempotent undeploy, and 2-step healthCheck; 6 Vitest blocks green, dashboard suite 79 → 85 tests, zero real claude CLI invocations.**

## Performance

- **Duration:** ~3m
- **Started:** 2026-04-19T06:23:00Z (approx)
- **Completed:** 2026-04-19T06:26:00Z (approx)
- **Tasks:** 3 (all `type="auto"`, 2 with `tdd="true"`)
- **Files touched:** 3 (2 created, 1 modified)

## What Shipped

### `dashboard/lib/runtime-adapters/claude-desktop.ts` (129 lines)

`claudeDesktopAdapter: RuntimeAdapter` implementing all 5 methods with the `runtime: "claude-desktop"` discriminant. Structure mirrors `claude-routines.ts` (Plan 02-05) but writes to disk instead of holding purely in-memory state.

**Method summary:**

| Method | Behavior | Shape |
|--------|----------|-------|
| `deploy` | `mkdir ~/.claude/scheduled-tasks/<slug>/`; `writeFile SKILL.md` mode 0644 with `bundle.prompt` | `{ok:true, artifact:<abs SKILL.md path>, handoffUrl:"claude://scheduled-tasks?slug=<encoded>"}` |
| `undeploy` | `fs.rm(targetDir, {recursive:true, force:true})` — ENOENT-tolerant | `{ok:true, artifact:<dir path>}` |
| `runNow` | `execFile("claude", ["-p", prompt + optional context])` — array args, no shell | `{ok:true, runId:"claude-desktop:<slug>:<timestamp>"}` |
| `listRuns` | Returns `[]` (Phase 5 queue-aggregator surfaces runs) | `[]` |
| `healthCheck` | `fs.stat(~/.claude)` then `execFile("/bin/zsh", ["-l", "-c", "claude --version"])` | `{available, version}` or `{available:false, reason}` |

**Zero throws** (result-object error convention throughout). **Login-shell PATH** via `/bin/zsh -l -c` (Pitfall #1 mitigation — reuses the pattern locked in Plan 02-05).

### `dashboard/tests/claude-desktop.test.ts` (160 lines, 6 it() blocks across 3 describe groups)

1. **deploy writes SKILL.md mode 0644** — real `fs.readFile` + `fsSync.statSync` against `makeTempHome()` isolated `$HOME` confirm file exists at `<tempHome>/.claude/scheduled-tasks/morning-brief/SKILL.md`, content is `bundle.prompt` verbatim, `stat.mode & 0o777 === 0o644`.
2. **deploy returns claude:// deeplink** — `result.handoffUrl === "claude://scheduled-tasks?slug=test-slug"`.
3. **undeploy removes directory** — deploy first, assert `existsSync` true, undeploy, assert `existsSync` false, `result.ok === true`.
4. **undeploy idempotent on missing dir** — no prior deploy; `result.ok === true` (no throw from `fs.rm` with `force: true`).
5. **healthCheck happy** — `mkdir ~/.claude` in temp HOME + `vi.doMock("node:child_process")` returning `"claude-cli 1.0.45\n"`; result `{available: true, version: "claude-cli 1.0.45"}`.
6. **healthCheck missing ~/.claude** — temp HOME has no `.claude`; result `{available: false, reason}` with reason containing `"~/.claude/ not found"`.

**Mock strategy:** real fs writes against isolated HOME; `execFile` mocked via `vi.doMock("node:child_process")` with `vi.resetModules()` in `beforeEach` + `vi.doUnmock` in `afterEach` — same pattern as `claude-routines.test.ts`.

## Acceptance Criteria

| AC | Status |
|----|--------|
| claudeDesktopAdapter export count = 1 | ✅ (1) |
| `runtime: "claude-desktop"` discriminant present | ✅ (4 occurrences — discriminant field + reason strings + comments; field-form exactly once) |
| 5 async methods present | ✅ (5/5: deploy, undeploy, runNow, listRuns, healthCheck) |
| scheduled-tasks path refs >= 3 | ✅ (3) |
| claude:// deeplink format = 1 | ✅ (1) |
| mode 0o644 = 1 | ✅ (1) |
| recursive+force = 1 | ✅ (1) |
| zero throws | ✅ (0) |
| pnpm typecheck exit 0 | ✅ |
| 6 it() blocks | ✅ (6) |
| pnpm test --run claude-desktop.test.ts exit 0 | ✅ (6/6) |
| pnpm test (full suite) exit 0 | ✅ (85/85) |
| Commit `feat(02-06):` exists | ✅ (`81f68ca`) |
| Activity log updated | ✅ (entry on 2026-04-19 02:23 EST) |
| Working tree clean (excluding pre-existing untracked) | ✅ |

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-06-01 (slug path traversal) | mitigate | Inherited from Plan 02-01 assertValidSlug + Phase 3 editor validation (upstream). Adapter trusts bundle.slug. |
| T-02-06-02 (SKILL.md mode 0644 world-readable) | accept | Prompt is non-secret by convention; Phase 3 editor scans before save (EDIT-02). Matches v0.1 routine convention. |
| T-02-06-03 (runNow argv prompt injection) | mitigate | execFile array args, no shell — prompt is one argv element. Verified in code. |
| T-02-06-04 (runNow blocking claude CLI) | accept | runNow is user-initiated (not unattended). Timeout/streaming deferred to Phase 3/4. |
| T-02-06-05 (healthCheck silent failure) | mitigate | Two distinct reason strings surface which probe step failed. |

## Deviations from Plan

### Rule-3 auto-fix: SHA ouroboros in activity log (minor, precedent-matched)

**Found during:** Task 3 commit sequence.

**Issue:** The plan says "append to activity log → amend commit." After the first amend, the commit SHA changed (expected). But the activity log entry inside that commit still references the pre-amend SHA. Per strict reading, this means the activity log reference is stale by one hop.

**Resolution:** Same precedent as Plan 02-05 — two amends max. After the first amend (`82fd53a`), edited the log to reference `82fd53a`, amended again (HEAD now `81f68ca`). The log inside the final commit references `82fd53a`, one hop off from the true `81f68ca` final SHA. Further amends would re-trigger the same drift. Accepted: the commit is findable by its unique `feat(02-06):` subject line, and the 7-char prefix `82fd53a` is a near-miss that grep-search will locate.

**Tracking:** Recorded as a key-decision in frontmatter above.

### Rule-1 auto-fix: none

No bugs auto-fixed during execution. All plan-specified behaviors landed as written.

### Rule-2 auto-fix: none

No missing critical functionality auto-added. Plan covered all five RuntimeAdapter methods end-to-end.

### Rule-4 architectural changes: none

No architectural decisions escalated.

## Open Items for Downstream Plans

- **Plan 10 manual smoke test** — Research Q1 (does Desktop pick up SKILL.md without user action in the Schedule tab?) is still open. The adapter ships the safe path; Plan 10's `test/manual/claude-desktop-smoke.md` will resolve the question on a real Mac. If Desktop requires user action, the `claude://scheduled-tasks?slug=<slug>` deeplink still gets the user to the right place in the UI.
- **VALIDATION.md rows 2-05-01 / 2-05-02 / 2-05-03** — All three can now flip from ⬜ pending to ✅ green. Row 2-05-04 stays pending for Plan 10.
- **Plan 09 registry swap** — `{ claudeDesktopAdapter }` from `./claude-desktop` replaces `notImplemented("claude-desktop")` in `index.ts`. Expected 2-line diff.

## Self-Check: PASSED

**Created files:**
- ✅ `dashboard/lib/runtime-adapters/claude-desktop.ts` (129 lines)
- ✅ `dashboard/tests/claude-desktop.test.ts` (160 lines)

**Modified files:**
- ✅ `docs/activity_log.md` (appended 4-line entry)

**Commit:**
- ✅ `81f68ca feat(02-06): add claude-desktop runtime adapter` (3 files, +301 lines)
- ✅ No AI attribution / `Co-Authored-By:` trailer
- ✅ Conventional commit format

**Verification:**
- ✅ `pnpm typecheck` exit 0
- ✅ `pnpm test -- --run claude-desktop.test.ts` exit 0 (6/6)
- ✅ `pnpm test` full suite exit 0 (85/85)
