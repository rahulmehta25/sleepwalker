---
phase: 02-adapters
plan: 07
subsystem: runtime-adapter
tags: [adapter, codex, launchd, plist, auth-conflict, pitfall-1, pitfall-2, pitfall-4, login-shell-path, vitest, phase-2, wave-2]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "RuntimeAdapter + RoutineBundle + DeployResult + RunNowResult + HealthStatus type shapes; ADAPTERS registry stub for codex slot"
  - phase: 02-adapters
    provides: "slug.ts assertValidSlug guard (02-01) — toLaunchdLabel throws on invalid slug; adapter catches at deploy/undeploy entry and returns {ok:false, error} (Threat T-02-07-03 / ASVS V5)"
  - phase: 02-adapters
    provides: "launchd-writer.ts (02-02) installPlist + uninstallPlist + LaunchdJob + LaunchdSchedule — the plist generation + plutil-lint + bootout + bootstrap chain (Threat T-02-07-06 rollback)"
  - phase: 02-adapters
    provides: "bin/sleepwalker-run-cli (02-03) — supervisor receives [runtime, slug] argv and reads prompt.md from bundle dir via stdin (Pitfall 4 defense by construction)"
  - phase: 02-adapters
    provides: "claude-routines.ts (02-05) + claude-desktop.ts (02-06) established login-shell PATH probe pattern via promisify(execFile)(\"/bin/zsh\", [\"-l\", \"-c\", ...]) — reused here for resolveCodexPath and codex --version"
provides:
  - "codexAdapter (third live adapter — plist-based launchd deploy via supervisor + 3-stage healthCheck with D-04 auth-conflict warn-but-allow)"
  - "supervisorPath() three-dot-up resolution pattern (path.resolve(__dirname, \"..\", \"..\", \"..\", \"bin\", \"sleepwalker-run-cli\")) — reusable by gemini.ts in Plan 02-08"
  - "parseCron(cron) cron-5 → LaunchdSchedule converter with interval-86400 fallback for unparseable input — reusable by gemini.ts and potentially Phase 3 editor preview (though editor uses cronstrue)"
  - "Plist EnvironmentVariables minimal-set convention (PATH/HOME/USER/NO_COLOR/TERM/CI only; secrets excluded) — template for gemini.ts (which adds GOOGLE_CLOUD_PROJECT per Pitfall 3)"
  - "3-stage healthCheck pattern: login-shell path resolve → CLI --version probe → best-effort auth-conflict regex parse. Extends the 2-step pattern from claude-desktop.ts."
  - "WARN: prefix encoding in HealthStatus.reason for warn-but-allow state until Plan 09 adds dedicated `warning?: string` field (see D-04 decision; dashboard renders yellow-badge-when-available-true-and-reason-set)"
affects: [02-08 gemini adapter (reuses supervisorPath + parseCron + installExecFileMock test helper shape), 02-09 registry swap, 02-10 phase exit gate, 03-editor preview handoffUrl rendering, 03-UI-SPEC health-pill yellow-badge WARN: prefix parsing, Phase 5 queue-aggregator codex runNow callers, Plan 09 HealthStatus migration from reason to warning field]

# Tech tracking
tech-stack:
  added: []
  patterns: [supervisor-path-three-dot-up, cron-5-to-launchd-schedule, plist-env-no-secrets, 3-stage-health-probe, auth-conflict-warn-but-allow, spawn-detached-unref-runnow, install-exec-file-mock-helper]

key-files:
  created:
    - dashboard/lib/runtime-adapters/codex.ts
    - dashboard/tests/codex.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "runNow uses spawn (not execFile) for non-blocking fire-and-forget. Auto-fix during typecheck: execFile's options type ExecFileOptions does not include stdio (that's the spawn API). Switched to spawn(supervisor, [runtime, slug], {detached: true, stdio: 'ignore'}) + child.unref() so the Next.js server response is not coupled to supervisor lifetime. Correct semantic for fire-and-forget; test helper exports a spawn stub alongside execFile."
  - "supervisorPath() computed lazily at each call site (not at module load). Three `..` segments from dashboard/lib/runtime-adapters/codex.ts to repo root, then /bin/sleepwalker-run-cli. Chosen over a top-level constant so test isolation with vi.resetModules re-evaluates cleanly between scenarios."
  - "parseCron is a Phase-2-narrow implementation: valid cron-5 → calendar schedule with `*` → undefined; everything else → interval 86400s daily fallback. Rationale: Phase 3 editor adds cronstrue-based validation upstream; by the time cron reaches this adapter's deploy(), it's already been validated by the editor Server Action. Defensive fallback is belt-and-suspenders, not the primary validation layer."
  - "Plist EnvironmentVariables contains ONLY PATH/HOME/USER/NO_COLOR/TERM/CI — `OPENAI_API_KEY` deliberately excluded (Pitfall 2 / Threat T-02-07-01 / ASVS V8). Codex CLI resolves secret from ~/.codex/auth.json (mode 0600, CLI-owned) at exec time. Verified two ways: (1) grep acceptance criterion `grep -A 8 'environmentVariables: {' codex.ts | grep -c 'OPENAI_API_KEY' == 0`; (2) deploy test reads the actual plist XML bytes from disk and greps for OPENAI_API_KEY absence."
  - "healthCheck auth-conflict warning encoded in `reason` with `WARN: ` prefix because HealthStatus currently lacks a dedicated `warning?: string` field (Phase 2 adapter-layer discretion per 02-CONTEXT.md D-04 → Plan 09 adds the field). Dashboard differentiates failure vs warning via `available` boolean: available=true + reason set = yellow badge; available=false + reason set = grey badge; available=true + no reason = green badge. The `WARN: ` prefix is an intentional sentinel so Plan 09's migration can mechanically translate reason.startsWith('WARN: ') → warning field."

patterns-established:
  - "Three-dot-up supervisorPath resolution: path.resolve(__dirname, \"..\", \"..\", \"..\", \"bin\", \"sleepwalker-run-cli\") computes an absolute path from an adapter at dashboard/lib/runtime-adapters/*.ts to the repo-root supervisor. Gemini adapter (02-08) reuses this verbatim; if future refactoring moves adapters, a single constant in a shared helper is the natural next step, but Phase 2 keeps it inline for readability."
  - "installExecFileMock helper in tests: centralizes the (cmd, args, cbOrOpts, maybeCb?) overload handling for execFile mocks + exports a spawn stub. Factored into the test file rather than helpers.ts because the handler signature (cmd, args) → {err, stdout, stderr} is specific to the execFile-heavy adapters (codex, gemini) and not useful for the pure-fs claude-desktop or fetch-based claude-routines tests. If the pattern recurs in gemini.test.ts it can be promoted."
  - "3-stage healthCheck with best-effort auth probe: (1) resolveCodexPath via login-shell zsh; (2) execFile(codexAbs, [\"--version\"]); (3) fs.readFile(~/.codex/config.toml) + fs.stat(~/.codex/auth.json) + process.env.OPENAI_API_KEY — any file access swallowed via .catch(() => ...) so missing files produce no warning rather than a failure. Regex `/preferred_auth_method\\s*=\\s*\"([^\"]+)\"/` is defensive TOML parsing (no full parser dep); extracts just the string that drives the warn-vs-ok branch. Template for gemini.ts where the auth probe shape will differ (GOOGLE_CLOUD_PROJECT env check rather than file-based)."
  - "Deploy-time plist XML content verification: Test 1 in codex.test.ts reads the actual plist file written to `<tempHome>/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist` and asserts `xml.not.toContain(\"OPENAI_API_KEY\")` + `xml.toContain(\"<key>NO_COLOR</key>\")`. This catches any future regression where a maintainer adds OPENAI_API_KEY to environmentVariables for debugging convenience. Defense at bytes-on-disk is stronger than defense at source code grep."
  - "Plan 09 migration sentinel: `WARN: ` prefix in HealthStatus.reason is a two-way-door decision. Forward path: Plan 09 adds `warning?: string` and mechanically translates `reason.startsWith(\"WARN: \")` → `{reason: undefined, warning: reason.slice(6)}`. Rollback path: if Plan 09 decides against the field, the prefix stays and the dashboard yellow-badge check is `available && reason?.startsWith(\"WARN: \")`."

threat-model-mitigations:
  - "T-02-07-01 (Info Disclosure — OPENAI_API_KEY in plist env): mitigated at codex.ts source (explicit enumeration: PATH/HOME/USER/NO_COLOR/TERM/CI) and verified at test-time by reading plist bytes on disk. Pitfall #2."
  - "T-02-07-02 (Tampering — user prompt injection via ProgramArguments): mitigated by construction. ProgramArguments = [supervisor, \"codex\", slug] only. Prompt is read from prompt.md by the supervisor (Plan 02-03) via stdin. Slug is validated by toLaunchdLabel → assertValidSlug throw. Pitfall #4."
  - "T-02-07-03 (Tampering — path traversal via slug): mitigated by slug.ts assertValidSlug (Plan 02-01). Adapter wraps toLaunchdLabel call in try/catch at deploy/undeploy entry points; bad slug → {ok: false, error: \"Invalid slug: ...\"}."
  - "T-02-07-04 (Info Disclosure — healthCheck leaks auth file contents): mitigated. config.toml regex extracts only preferred_auth_method string (bounded match); auth.json is checked for existence only (fs.stat, no read); warning text mentions OPENAI_API_KEY and ~/.codex/auth.json names but never values."
  - "T-02-07-05 (Spoofing — malicious codex binary on PATH): accepted. Standard PATH-ordering trust; `command -v` returns whatever's first on the login-shell PATH. User controls /opt/homebrew/bin. Beyond v0.2 scope."
  - "T-02-07-06 (DoS — failed bootstrap leaving orphan plist): mitigated via installPlist rollback (Plan 02-02 unlinks plist on bootstrap failure) and ThrottleInterval=300 (prevents crash-loop respawn storms)."

requirements-completed: [ADPT-07]

# Metrics
duration: ~3m
completed: 2026-04-19
---

# Phase 2 Plan 07: codex Adapter Summary

**Third live RuntimeAdapter — OpenAI Codex Pro Scheduled Tasks via launchd plist + supervisor invocation, 3-stage healthCheck with D-04 auth-conflict warn-but-allow encoded as `WARN:` prefix in `reason` (Plan 09 migrates to dedicated `warning` field); 6 Vitest blocks green, dashboard suite 85 → 91 tests, zero real codex CLI / launchctl / plutil invocations.**

## Performance

- **Duration:** ~3m
- **Tasks completed:** 3/3
- **Files created:** 2 (codex.ts 223 lines, codex.test.ts 210 lines)
- **Files modified:** 1 (docs/activity_log.md)
- **Commit:** `fbda124` — `feat(02-07): add codex runtime adapter`
- **Dashboard test suite:** 85 → 91 passing (+6 new)

## Plan-Level Verification Output

```
=== commit subject ===
feat(02-07): add codex runtime adapter
=== file count ===
       3
=== AI attribution check (should be 0) ===
0
=== status clean ===
       0
=== sanity: OPENAI_API_KEY in codex.ts env block (should be 0) ===
0
=== codex.test.ts run ===
 Test Files  14 passed (14)
      Tests  91 passed (91)
```

## Files

### Created

- **`dashboard/lib/runtime-adapters/codex.ts` (223 lines)** — codexAdapter: RuntimeAdapter with all 5 methods. deploy composes installPlist (Plan 02) + supervisorPath + toLaunchdLabel (Plan 01); undeploy delegates to uninstallPlist (Plan 02); runNow uses spawn detached+unref for non-blocking fire-and-forget; listRuns returns [] (Phase 5); healthCheck does 3-stage probe with D-04 auth-conflict warning. Plist EnvironmentVariables minimal-set: PATH/HOME/USER/NO_COLOR/TERM/CI (no secrets per Pitfall 2). Prompt text NEVER in argv (Pitfall 4 — supervisor reads via stdin).
- **`dashboard/tests/codex.test.ts` (210 lines, 6 it() blocks across 3 describe groups)** — centralized `installExecFileMock` helper handles the (cmd, args, cbOrOpts, maybeCb?) overload + exports spawn stub. Test coverage:
  1. deploy full flow — zsh path resolve → plutil lint → bootout (ignored) → bootstrap → success. Asserts call ordering via execCalls array, plist written to `<tempHome>/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist` with mode 0644, **and plist XML bytes grepped for OPENAI_API_KEY absence + NO_COLOR presence** (Pitfall 2 verification at bytes-on-disk).
  2. deploy CLI-not-found — zsh mock throws, result `{ok: false, error: "codex CLI not found..."}`.
  3. undeploy returns `com.sleepwalker.codex.teardown-test` label.
  4. healthCheck happy — clean temp HOME, codex-cli 0.118.0 version trimmed, no reason.
  5. healthCheck auth-conflict — stages fixture `~/.codex/auth.json` + `config.toml` without `preferred_auth_method` + sets OPENAI_API_KEY; asserts `reason.match(/^WARN: /)` and `reason.contains("OPENAI_API_KEY")`.
  6. healthCheck version-probe failure — zsh resolves but codex --version throws; asserts `{available: false, reason: "... --version failed"}`.

### Modified

- **`docs/activity_log.md`** — Plan 07 execution entry with SHA `257d343` (pre-amend) + Rule-3 auto-fix documentation (spawn vs execFile runNow fix).

## Key Decisions

See frontmatter `key-decisions` — 5 decisions recorded:
1. runNow uses spawn (not execFile) — ExecFileOptions lacks stdio
2. supervisorPath lazy per-call for vi.resetModules isolation
3. parseCron is defensive fallback; Phase 3 editor validates upstream
4. Plist env excludes OPENAI_API_KEY — verified at source + at bytes on disk
5. `WARN: ` prefix encoding in reason until Plan 09 adds `warning` field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] runNow execFile → spawn TypeScript error**
- **Found during:** Task 1 (typecheck hook after Write)
- **Issue:** Plan specified `execFile(supervisor, ["codex", bundle.slug], {detached: true, stdio: "ignore"})`, but Node's `execFile` options type `ExecFileOptions` does not include `stdio` (that's the `spawn` API). TypeScript error TS2769: "No overload matches this call".
- **Fix:** Added `spawn` to the `node:child_process` import and replaced `execFile(...)` with `spawn(...)`. Updated test helper `installExecFileMock` to export a `spawn` stub alongside `execFile` so mocks cover both APIs.
- **Rationale:** `spawn` is the semantically correct API for fire-and-forget detached processes; `execFile` is for bounded-output subprocess capture. The plan's intent (non-blocking, stdio-detached, runId returned immediately) is preserved exactly; only the API is corrected.
- **Files modified:** `dashboard/lib/runtime-adapters/codex.ts` (import + runNow body), `dashboard/tests/codex.test.ts` (installExecFileMock helper).
- **Commit:** `fbda124` (all fixes in the single atomic commit before landing).

**2. [Rule 2 - Missing critical functionality] Added plist-bytes OPENAI_API_KEY absence assertion**
- **Found during:** Task 2
- **Issue:** The plan's Test 1 asserted the plist file exists with mode 0644 but did not read its content to verify `OPENAI_API_KEY` is absent. Relying only on the source-code grep acceptance criterion leaves a hole where a future maintainer could add OPENAI_API_KEY to `environmentVariables` and the test would still pass (grep AC is a lint, not a runtime assertion).
- **Fix:** Added two assertions to Test 1: `fsSync.readFileSync(result.artifact!, "utf8")` → `expect(xml).not.toContain("OPENAI_API_KEY")` and `expect(xml).toContain("<key>NO_COLOR</key>")`. Defense in depth: Pitfall 2 is now enforced at the bytes on disk, not only at source.
- **Rationale:** Threat T-02-07-01 (Information Disclosure) is the highest-stakes item in the plan's threat model. A byte-level assertion is the natural runtime companion to the source-code grep.
- **Files modified:** `dashboard/tests/codex.test.ts` (Test 1 added 2 assertions).
- **Commit:** `fbda124`.

### Line-Count Deviation (non-blocking)

- codex.ts target `min_lines: 130` → actual **223** lines. Over the minimum due to comprehensive comment blocks explaining Pitfall 2 / Pitfall 4 / D-04 rationale inline (per CLAUDE.md "prefer self-documenting code"). `min_lines` is a floor, not a ceiling — no issue.
- codex.test.ts target `min_lines: 100` → actual **210** lines. Over due to the `installExecFileMock` centralized helper (avoids repeating the overload-handling code in 6 places) + extra assertions for Pitfall 2 bytes-on-disk verification. Still well under any reasonable ceiling.

### Deferred Items

- **VALIDATION.md row 2-06-03 (codex real-Mac launchctl smoke test)** — explicitly deferred to Plan 02-10 manual smoke test per plan frontmatter. No action required at this plan.

## Acceptance Criteria Results

All criteria from Task 1, Task 2, Task 3 acceptance lists pass:

- `dashboard/lib/runtime-adapters/codex.ts` exists — ✓
- `grep -c "^export const codexAdapter" codex.ts` = 1 — ✓
- `grep -c 'runtime: "codex"' codex.ts` = 4 (1 discriminant + 3 HealthStatus returns; AC required ≥ 1) — ✓
- `grep -cE "async (deploy|undeploy|runNow|listRuns|healthCheck)" codex.ts` = 5 — ✓
- `grep -c 'from "./launchd-writer"' codex.ts` = 1 — ✓
- `grep -c 'from "./slug"' codex.ts` = 1 — ✓
- `grep -c "supervisorPath" codex.ts` = 3 (function def + 2 call sites) — ✓
- `grep -c 'NO_COLOR' codex.ts` = 1 — ✓
- `grep -A 8 'environmentVariables: {' codex.ts | grep -c 'OPENAI_API_KEY'` = **0** (Pitfall #2 confirmed) — ✓
- `grep -c "preferred_auth_method" codex.ts` = 3 (1 regex + 2 comments; AC required ≥ 1) — ✓
- `pnpm typecheck` exit 0 — ✓
- `dashboard/tests/codex.test.ts` exists — ✓
- `grep -cE "^\s+it\(" codex.test.ts` = 6 — ✓
- `pnpm test -- --run codex.test.ts` exit 0 with 6/6 passing — ✓
- Auth-conflict test asserts `reason.match(/^WARN: /)` — ✓
- Full dashboard suite exit 0 (91/91 green) — ✓
- `git log -1 --pretty=%s` = `feat(02-07): add codex runtime adapter` — ✓
- `git status --porcelain` (tracked files) = empty — ✓
- `git log -1 --name-only` shows 3 files — ✓
- AI attribution count = 0 — ✓

## Self-Check: PASSED

**Files verified to exist:**
- `dashboard/lib/runtime-adapters/codex.ts` — FOUND
- `dashboard/tests/codex.test.ts` — FOUND
- `docs/activity_log.md` (appended) — FOUND

**Commits verified to exist:**
- `fbda124` `feat(02-07): add codex runtime adapter` — FOUND (3 files, +449 insertions)
