# Activity Log

## 2026-04-18 03:25 EST

### User Prompt
"Create the v0.2 roadmap: derive phases from requirements, map every v1 REQ-ID to exactly one phase, honor the hard build-order dependency chain, write ROADMAP.md + STATE.md + update REQUIREMENTS.md traceability, return a summary table."

### Actions Taken
- Created `.planning/ROADMAP.md` with 6 phases (Foundation, Adapters, Editor, Deploy, Queue, Polish), phase goals, dependencies, and 2-5 success criteria each
- Created `.planning/STATE.md` initialized to Phase 1 not-started with decisions log and resumption context
- Updated `.planning/REQUIREMENTS.md` traceability table: all 32 v1 REQ-IDs mapped (Phase 1: 2, Phase 2: 8, Phase 3: 5, Phase 4: 7, Phase 5: 5, Phase 6: 5)

## 2026-04-18 04:05 EST

### User Prompt
"Research how to implement Phase 1: Foundation for Sleepwalker v0.2. Phase 1 is intentionally narrow: freeze the RuntimeAdapter TypeScript interface + <runtime>/<slug> naming convention."

### Actions Taken
- Created `.planning/phases/01-foundation/01-RESEARCH.md` with locked interface signatures for ADPT-01 (Runtime, RoutineBundle, DeployResult, RunNowResult, RunRecord, HealthStatus, RuntimeAdapter), naming-convention builders for ADPT-02 (validateSlug, toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath, toBundleDir, parseFleetKey), registry skeleton, Wave 0 test plan (slug.test.ts), and explicit anti-requirements list (15+ v0.1 files Phase 1 must not touch)

## 2026-04-18 12:59 EST

### User Prompt
"gsd-plan-phase 1 — ship Phase 1 Foundation plan (ADPT-01 + ADPT-02 interface freeze + slug convention)"

### Actions Taken
- Created dashboard/lib/runtime-adapters/types.ts (RuntimeAdapter interface freeze, ADPT-01)
- Created dashboard/lib/runtime-adapters/index.ts (registry skeleton with 4 stub adapters, ADPT-01 compile-time exhaustiveness)

## 2026-04-18 13:04 EST

### User Prompt
"gsd-plan-phase 1 -- ship Phase 1 Foundation plan (ADPT-02 directory scaffolding)"

### Actions Taken
- Created routines-codex/.gitkeep (ADPT-02 sibling directory)
- Created routines-gemini/.gitkeep (ADPT-02 sibling directory)
- Created templates/.gitkeep (DOCS-02 placeholder for Phase 6)

## 2026-04-18 13:10 EST

### User Prompt
"gsd-plan-phase 1 -- ship Phase 1 Foundation plan (ADPT-02 slug validator + tests)"

### Actions Taken
- Created dashboard/lib/runtime-adapters/slug.ts (validateSlug + 7 identifier builders + RUNTIMES + parseFleetKey, ADPT-02)
- Created dashboard/tests/slug.test.ts (~28 assertions across 13 it() blocks covering ADPT-02 behavior)

## 2026-04-18 13:16 EST

### User Prompt
"gsd-plan-phase 1 -- ship Phase 1 Foundation plan (closeout gate + ROADMAP update)"

### Actions Taken
- Verified frozen-surface git diff (v0.1 files byte-identical, 0 lines of diff against PHASE1_BASE 03d063d)
- Ran pnpm typecheck + pnpm test (56-test suite green, zero regression vs 43-test v0.1 baseline)
- Confirmed all 7 Phase 1 artifacts exist at declared paths
- Updated .planning/ROADMAP.md Phase 1 block: 4 plans listed, status In progress
- Phase 1 plans authored: 01-01 (types + index), 01-02 (directory scaffolding), 01-03 (slug + tests), 01-04 (verification gate)

## 2026-04-19 00:15 EST

### User Prompt
"Research how to implement Phase 2: Adapters for Sleepwalker v0.2. Phase 2 ships 4 runtime adapters + the launchd writer + bash supervisor that Codex/Gemini adapters depend on."

### Actions Taken
- Created .planning/phases/02-adapters/02-RESEARCH.md (1942 lines): full Phase 2 research covering ADPT-03..09 + SAFE-02. Documents launchd-writer.ts API (generatePlist + installPlist + uninstallPlist), bin/sleepwalker-run-cli exact bash outline with PATH resolution / sleep-window + reversibility + char-budget gates / ANSI strip / audit JSONL shape, per-adapter TS shapes (claude-routines ~85 LOC, claude-desktop ~85 LOC, codex ~140 LOC, gemini ~130 LOC), assertValidSlug injection diff for slug.ts, Codex + Gemini auth-conflict detection, Vitest mock strategy with execFile hoisting, manual smoke test contract for test/manual/codex-adapter-smoke.md, recommended 4-wave plan structure, mandatory Validation Architecture section for Nyquist VALIDATION.md (28 requirement-to-test rows + Wave 0 gaps), live-CLI probes (codex 0.118.0 / gemini 0.31.0 / claude at ~/.local/bin), assumptions log (10 items with risk assessment)

## 2026-04-19 00:35 EST

### User Prompt
"Create UI design contract for Phase 3: Editor — the /editor route where a user composes a new routine with live validation, autosave, and collision protection."

### Actions Taken
- Created `.planning/phases/03-editor/03-UI-SPEC.md` with full design contract: design-system inventory (reusing existing lunar/celestial palette + Fraunces/Bricolage/JetBrains Mono), 7-token spacing scale, 4-role typography table, 60/30/10 color split with explicit accent reserved-for list, full copywriting contract (primary CTA, field labels, validation messages, empty/confirmation states), two-column layout (form + sticky preview), runtime radio-card grid spec, secret-scan panel spec, draft-recovery banner spec, component inventory, interaction contracts (500ms autosave, 250ms secret-scan debounce, slug auto-derive, cronstrue preview, slug collision check, health-check integration, WCAG 2.1 AA verified)

## 2026-04-19 01:00 EST

### User Prompt
"/gsd-ui-phase"

### Actions Taken
- Auto-detected next unplanned phase: Phase 3 Editor
- Created `.planning/phases/03-editor/` directory
- Spawned gsd-ui-researcher — produced `.planning/phases/03-editor/03-UI-SPEC.md` (440 lines), commit 1152375
- Spawned gsd-ui-checker — APPROVED 6/6 dimensions (Copywriting / Visuals / Color / Typography / Spacing / Registry Safety); 1 non-blocking FLAG on Typography header phrasing
- Applied checker clarification to UI-SPEC Typography section ("4 distinct sizes / 4 inherited weights" — no new sizes or weights introduced this phase)
- Flipped frontmatter `status: draft` → `approved`, added `reviewed_at: 2026-04-19`, checked off all 6 Checker Sign-Off dimensions, committed as 961c4d3
- Updated `.planning/STATE.md`: Last-updated timestamp, appended Phase 3 UI-SPEC approval decision, flipped UI-SPEC todo to complete, added Phase 3 planning todo

## 2026-04-19 01:27 EST

### User Prompt
"Execute Phase 2 Plan 01 — amend slug.ts with assertValidSlug guard and extend slug.test.ts."

### Actions Taken
- Modified `dashboard/lib/runtime-adapters/slug.ts`: added `assertValidSlug()` helper (module-private) and inserted `assertValidSlug(slug)` at the top of 6 builders (toFleetKey, toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath, toBundleDir). parseFleetKey left untouched (null-on-invalid asymmetry preserved, plus NOTE comment explaining the intent).
- Modified `dashboard/tests/slug.test.ts`: appended `describe("builders reject invalid slugs")` with 7 new it() blocks covering throw paths and parseFleetKey non-throw path.
- Ran `pnpm typecheck` and `pnpm test` — both green; full dashboard suite grew from 56 to 63 tests (+7 new slug throw assertions).
- Commit `cb16382` — `feat(02-01): enforce slug validation in identifier builders`.

## 2026-04-19 01:35 EST

### User Prompt
"Execute Phase 2 Plan 02 — author launchd-writer.ts with generatePlist + installPlist + uninstallPlist and cover with 8 Vitest blocks."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/launchd-writer.ts` (~225 lines): 3 public type exports (LaunchdSchedule, LaunchdJob, InstallResult) + 3 public async/sync functions (generatePlist pure XML templating with 5-char escape; installPlist mode-0644 write + plutil -lint + bootout-first + bootstrap with unlink-on-failure rollback; uninstallPlist bootout + unlink idempotent via ENOENT-tolerant flow). Module-private plistEscape, launchAgentsPath, currentUid helpers.
- Created `dashboard/tests/launchd-writer.test.ts` (~200 lines): 9 Vitest it() blocks — 5 generate tests (calendar, interval, calendar-array, XML escape, env-var presence/absence) + 4 install/uninstall tests (happy-path command order, lint-failure rollback, bootstrap-failure rollback, idempotent uninstall). Uses vi.doMock('node:child_process') — no real launchctl or plutil invocations.
- Full dashboard suite: 63 → 72 passing tests (plan expected >=71).
- Commit `e63ad7c` — `feat(02-02): add launchd-writer with plist generator and install/uninstall primitives`.

## 2026-04-19 01:42 EST

### User Prompt
"Execute Phase 2 Plan 03 — author bin/sleepwalker-run-cli supervisor."

### Actions Taken
- Created `bin/sleepwalker-run-cli` (183 lines, +x, mode 100755 in git): bash supervisor with set -euo pipefail. Header + preflight (bundle prompt.md existence check, EX_NOINPUT 66) + PATH resolution (inherited PATH → `/bin/zsh -l -c` → `/bin/bash -l -c` fallback, exit 127 on final miss) + sleep-window gate (deferred on `outside sleep window`) + reversibility policy gate (strict blocks non-green; balanced blocks red) + started-event emit + per-runtime CLI argv dispatch (codex=`exec - --json`; gemini=`-p - --output-format stream-json --yolo`) + char-budget watchdog (polls `wc -c` every second, SIGTERM + SIGKILL-2s on exceed) + terminal-event emit (completed / failed / budget_exceeded) with jq -Rs encoded 500-char preview.
- SAFE-02: `NO_COLOR=1 TERM=dumb CI=true` exported defensively (plist also sets these); perl ANSI strip covers CSI + OSC + DCS/PM/APC escape classes in pipeline before any tee/audit write.
- Pitfall 4 defeated by construction: user prompt text is read from `prompt.md` and piped via stdin; `CLI_ARGS` is a STATIC array per runtime and never contains the prompt string.
- Verified: `/bin/bash -n bin/sleepwalker-run-cli` → 0, `test -x` → 0, `git ls-files --stage` → 100755. Dashboard suite still 72/72 green (supervisor does not touch TS).
- Commit `4afe02a` — `feat(02-03): add bin/sleepwalker-run-cli supervisor`.

## 2026-04-19 01:59 EST

### User Prompt
"Execute Phase 2 Plan 04 — author hooks/tests/supervisor-tests.sh harness for bin/sleepwalker-run-cli."

### Actions Taken
- Created `hooks/tests/supervisor-tests.sh` (275 lines, +x, mode 100755): bash integration harness with `set -euo pipefail`, isolated $HOME via `mktemp -d -t sw-supervisor-XXXXXX`, fixture codex/gemini binaries in $TEST_BIN on PATH, `reset_state()` + `make_bundle()` helpers, `assert_eq` / `assert_contains` / `assert_file_lines` copied from v0.1 `hooks/tests/run-tests.sh` pattern, EXIT trap that cleans both the temp HOME and per-scenario fixture bundles under `$REPO_ROOT/routines-{codex,gemini}/`.
- Six scenarios covering Validation Strategy rows 2-03-01..06: (1) codex happy path — started + completed + exit_code 0 + audit has 2 lines; (2) SAFE-02 ANSI strip — raw CSI bytes absent, literal `[32m` absent, `green-prefix` payload preserved; (3) char-budget SIGTERM — runaway codex fixture blows through 500-byte cap, `budget_exceeded` event emitted; (4) reversibility gate — red routine under balanced policy defers without emitting `started`; (5) bundle missing — exit 66 + `failed` event with `bundle not found` reason, no started; (6) gemini happy path — second runtime arm green.
- Fixture design: dual-mode `codex` stub controlled by `CODEX_OVER` env var (happy mode emits ~60 bytes with an ANSI color escape for SAFE-02 verification; runaway mode emits `printf '%s\n' "$(printf 'x%.0s' $(seq 1 2000))"` in a `while true` loop — newline-terminated chunks are required so perl's line-oriented `-pe` strip_ansi flushes through to `tee` promptly, otherwise the watchdog never sees output grow beyond 0 bytes and SIGTERM never fires).
- Zero real launchctl, codex, or gemini invocations; no network I/O; fixture bundles are cleaned up on EXIT trap.
- Harness runs green end-to-end: `bash hooks/tests/supervisor-tests.sh` → 24 PASS / 0 FAIL / exit 0; final line is `all supervisor tests passed`.
- Commit `b39859d` — `test(02-04): add supervisor-tests.sh bash harness with 6 scenarios`.

## 2026-04-19 02:10 EST

### User Prompt
"Execute Phase 2 Plan 05 — author claude-routines runtime adapter + test."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/claude-routines.ts` (105 lines): `claudeRoutinesAdapter: RuntimeAdapter` implementing all 5 methods with `runtime: "claude-routines"` discriminant. `deploy(bundle)` returns `{ok: true, handoffUrl: https://claude.ai/code/routines/new?name=...&prompt=...&cadence=..., artifact: "browser-handoff:<slug>"}` — name/prompt/cadence run through `encodeURIComponent` per Threat T-02-05-01 (ASVS V14 output encoding, cannot break out of query string). `undeploy` returns `{ok: true, handoffUrl: "https://claude.ai/code/routines", artifact: "browser-handoff-undeploy"}`. `runNow` imports and delegates to v0.1 `fireRoutine(bundle.slug, context)` — on success maps `{sessionId, sessionUrl} → {runId, watchUrl}`, on failure passes `res.error` through with `HTTP <status>` fallback. `listRuns` returns `[]` (Phase 5 wires queue-aggregator). `healthCheck` uses `promisify(execFile)("/bin/zsh", ["-l", "-c", "claude --version"])` — Pitfall 1 login-shell PATH resolution on dev machines where `claude` lives at `~/.local/bin/` or `/opt/homebrew/bin/`. No throws anywhere (result objects per convention).
- Re-exported `CC_ROUTINE_BETA = "experimental-cc-routine-2026-04-01"` as single source of truth for Pitfall 12 beta-header drift — test asserts equality with hardcoded literal so future Anthropic deprecation triggers a compile-time-detectable test failure.
- Created `dashboard/tests/claude-routines.test.ts` (183 lines, 7 `it()` blocks): (1) `deploy` URL encoding — `Morning Brief` → `Morning%20Brief`, `Do a daily brief.` → `Do%20a%20daily%20brief.`, `0 6 * * *` → `0%206%20*%20*%20*`; (2) `undeploy` routines-list URL + `browser-handoff-undeploy` artifact; (3) `runNow` happy path — `globalThis.fetch` mocked + `setCloudCredential` configured, result.runId = session_01TEST; (4) `runNow` no-credential path — fireRoutine returns `no-credentials-configured`, adapter passes through verbatim; (5) `healthCheck` happy — `vi.doMock("node:child_process")` returns `claude-cli 1.0.45\n`, adapter trims to `claude-cli 1.0.45`; (6) `healthCheck` failure — mock throws `command not found`, adapter returns `available: false, reason` containing `claude CLI not found`; (7) `CC_ROUTINE_BETA` equality assertion. Mocks use `vi.doMock` + `vi.resetModules` / `vi.doUnmock` pattern for isolation between it() blocks.
- Dashboard suite: 72 → 79 passing (7 new). `pnpm typecheck` exit 0. Zero real claude CLI invocations, zero network I/O, zero filesystem writes (beyond `makeTempHome` for credentials persistence).
- Commit `62bdaa7` — `feat(02-05): add claude-routines runtime adapter`.


## 2026-04-19 03:30 EST

### User Prompt
"/gsd-plan-phase 3" (user chose to skip discussion and go straight to research + planning)

### Actions Taken
- Created `.planning/phases/03-editor/03-RESEARCH.md` (1361 lines, commit `c343cb8`) covering zod v4.3.6 schema, 11-pattern hand-ported gitleaks regex shared between client preview + server authoritative scanner, directory-swap atomic-write strategy (mkdtemp sibling + single rename — only POSIX-atomic-as-a-pair), bundles.ts design (directory enumeration preserving v0.1 sleepwalker- prefixes), Server Action shape with React 19 useActionState, testing strategy, build-order dependency on Phase 2 Plan 02-09, and mandatory Validation Architecture section (25 requirement-to-test rows)
- Created `.planning/phases/03-editor/03-VALIDATION.md` (commit `e33d52b`) mirroring the research Validation Architecture — 25 rows mapping EDIT-01..05 + 3 phase-exit smokes to Vitest/typecheck/grep commands
- Created `.planning/phases/03-editor/03-PATTERNS.md` (commit `2c7e190`) mapping 24 net-new files (13 source + 9 tests + 2 config) to analogs with concrete line-numbered code excerpts
- Created 9 PLAN.md files in 6 waves (commit `d64c359`): 03-01 deps + bundle-schema, 03-02 secret-patterns + scan, 03-03 bundles.ts, 03-04 atomic-write.ts, 03-05 saveRoutine + checkSlugAvailability Server Actions, 03-06 /editor page shell + RuntimeRadioGrid + CronPreview, 03-07 SecretScanPanel + DraftRecoveryBanner + PreviewPanel, 03-08 EditorClient state machine, 03-09 phase exit gate
- Plan-checker iteration 1 returned 2 BLOCKERS (research Open Questions not marked RESOLVED; plan 03-06 had 6 tasks/9 files exceeding scope threshold) + 1 warning + 1 info
- Revision (commit `7e4fbed`): renamed research heading to `## Open Questions (RESOLVED)` with 5 inline RESOLVED markers; split old 03-06 into new 03-06 + 03-07; renumbered old 03-07 → 03-08 EditorClient state machine and old 03-08 → 03-09 phase exit gate; updated depends_on chains; fixed 03-09 Tasks 1-2 `<files></files>` → `<files>n/a (verification only)</files>`; fixed 03-08 "9 autofill attrs" → "8"
- Plan-checker iteration 2: VERIFICATION PASSED across all 12 dimensions, 3 non-blocking cosmetic warnings in 03-09
- Sweep commit `c8989ea`: 03-09 stale "8 plans" text → "9 plans" in frontmatter + Task 3 `<done>` block; deduplicated `<name>` tags on Tasks 1 and 2
- Updated `.planning/STATE.md`: added Phase 3 planning decision row to Decisions block, flipped Phase 3 planning todo to complete, added Wave 0 parallel-execution todo


## 2026-04-19 02:23 EST

### User Prompt
"Execute Phase 2 Plan 06 — author claude-desktop runtime adapter."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/claude-desktop.ts` (130 lines): `claudeDesktopAdapter: RuntimeAdapter` implementing all 5 methods with `runtime: "claude-desktop"` discriminant. `deploy(bundle)` mkdirs `~/.claude/scheduled-tasks/<slug>/` recursively, writes `bundle.prompt` to `SKILL.md` with explicit `mode: 0o644`, and returns `{ok: true, artifact: <SKILL.md absolute path>, handoffUrl: "claude://scheduled-tasks?slug=<encodeURIComponent(slug)>"}` — the D-03 browser-handoff shape. `undeploy(bundle)` calls `fs.rm(targetDir, {recursive: true, force: true})` so ENOENT on missing-dir is treated as success (idempotent by construction). `runNow` shells out via `execFile("claude", ["-p", promptArg])` — array args mean no shell interpolation; prompt + optional context enter argv as a single string. `listRuns` returns `[]` (v0.1 audit.jsonl + queue-aggregator already surface claude-desktop runs). `healthCheck` is a 2-step probe: (1) `fs.stat(~/.claude)` — if missing returns `{available: false, reason: "~/.claude/ not found..."}`; (2) `execFile("/bin/zsh", ["-l", "-c", "claude --version"])` via login-shell PATH — on success returns `{available: true, version: stdout.trim()}`, on failure returns `{available: false, reason: "claude CLI not found on login-shell PATH..."}`. No throws anywhere (result objects per convention).
- Created `dashboard/tests/claude-desktop.test.ts` (160 lines, 6 `it()` blocks across 3 describe groups): (1) deploy writes SKILL.md with mode 0644 — real `fs.readFile` + `fsSync.statSync` against `makeTempHome()` isolated `$HOME` confirm the file exists at `<tempHome>/.claude/scheduled-tasks/morning-brief/SKILL.md`, content matches `bundle.prompt` verbatim, and `stat.mode & 0o777 === 0o644`; (2) deploy returns `claude://scheduled-tasks?slug=test-slug` deeplink with URL-encoded slug; (3) undeploy removes the scheduled-tasks directory — deploys first, asserts `fsSync.existsSync` true, undeploys, asserts false; (4) undeploy idempotent on never-deployed slug — `recursive: true, force: true` treats ENOENT as success; (5) healthCheck happy — `mkdir ~/.claude` in temp HOME + `vi.doMock("node:child_process")` returning `claude-cli 1.0.45\n`, result `{available: true, version: "claude-cli 1.0.45"}`; (6) healthCheck missing-dir — temp HOME has no `.claude`, result `{available: false, reason}` with reason containing `~/.claude/ not found`. Mocks use `vi.doMock` + `vi.resetModules` / `vi.doUnmock` pattern copied verbatim from `claude-routines.test.ts` for isolation between scenarios.
- Dashboard suite: 79 → 85 passing (6 new). `pnpm typecheck` exit 0. Zero real `claude` CLI invocations, zero network I/O, real filesystem writes isolated to temp HOME.
- Commit `82fd53a` — `feat(02-06): add claude-desktop runtime adapter`.


## 2026-04-19 02:31 EST

### User Prompt
"Execute Phase 2 Plan 07 — author codex runtime adapter."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/codex.ts` (223 lines): `codexAdapter: RuntimeAdapter` implementing all 5 methods with `runtime: "codex"` discriminant. `deploy(bundle)` resolves codex absolute path via `promisify(execFile)("/bin/zsh", ["-l", "-c", "command -v codex"])` (Pitfall 1 login-shell PATH), composes `LaunchdJob` with `programArguments: [supervisorPath(), "codex", bundle.slug]` — prompt text never enters argv (Pitfall 4 shell-injection defeated by construction) — and `environmentVariables` containing only `PATH / HOME / USER / NO_COLOR=1 / TERM=dumb / CI=true` (Pitfall 2: `OPENAI_API_KEY` deliberately excluded from plist; Codex CLI loads secret from `~/.codex/auth.json` mode 0600), then delegates to `installPlist` (Plan 02) for the plutil-lint + bootout + bootstrap chain with rollback. `undeploy(bundle)` delegates to `uninstallPlist(toLaunchdLabel("codex", slug))` (idempotent — ENOENT on plist becomes `{ok: true}`). `runNow` uses `spawn(supervisorPath(), ["codex", slug], {detached: true, stdio: "ignore"})` + `child.unref()` for non-blocking fire-and-forget; returns `{runId: "codex:<slug>:<timestamp>"}` immediately so the dashboard response is not coupled to the supervisor's lifetime. `listRuns` returns `[]` (Phase 5 wires audit.jsonl filtering). `healthCheck` is a 3-stage probe: (1) `resolveCodexPath()` via login-shell zsh; (2) `execFile(codexAbs, ["--version"])`; (3) best-effort regex parse of `~/.codex/config.toml` for `preferred_auth_method = "..."` + `fs.stat(~/.codex/auth.json)` + `!!process.env.OPENAI_API_KEY` — when `hasAuthJson && envKey && preferred !== "apikey"`, sets `reason: "WARN: OPENAI_API_KEY set but ~/.codex/auth.json present — ..."` per D-04 warn-but-allow. The `WARN:` prefix is the temporary encoding; Plan 09 adds a dedicated `warning` field to HealthStatus and this adapter migrates to it. No throws anywhere (result-object convention).
- `supervisorPath()` resolves `path.resolve(__dirname, "..", "..", "..", "bin", "sleepwalker-run-cli")` — three `..` segments from `dashboard/lib/runtime-adapters/codex.ts` to repo root.
- `parseCron(cron)` converts cron-5 to `LaunchdSchedule`: valid input → `{kind: "calendar", minute, hour, day, month, weekday}` with `*` → `undefined`; null or malformed → `{kind: "interval", seconds: 86400}` (daily fallback). Phase 3 editor adds cronstrue-based validation.
- Created `dashboard/tests/codex.test.ts` (210 lines, 6 `it()` blocks across 3 describe groups): (1) deploy full flow — shared `installExecFileMock` helper handles both `(cmd, args, cb)` and `(cmd, args, opts, cb)` execFile overloads + exports `spawn` stub; asserts `plutil -lint < launchctl bootout < launchctl bootstrap` ordering, plist written to `<tempHome>/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist` with mode 0644, **and plist XML content grep confirms `OPENAI_API_KEY` is absent** (Pitfall 2 verification at the actual bytes on disk); (2) deploy CLI-not-found — zsh mock throws, result `{ok: false, error: "codex CLI not found..."}`; (3) undeploy returns `com.sleepwalker.codex.teardown-test` label; (4) healthCheck happy — clean temp HOME, `codex-cli 0.118.0` version, no reason; (5) healthCheck auth-conflict — stages fixture `~/.codex/auth.json` + `config.toml` without `preferred_auth_method` + sets `OPENAI_API_KEY`, asserts `reason` matches `/^WARN: /` and contains `OPENAI_API_KEY`; (6) healthCheck version-probe failure — zsh resolves but `codex --version` throws, result `{available: false, reason: "... --version failed"}`. `process.env.OPENAI_API_KEY` is captured in `beforeEach` and restored in `afterEach` to avoid cross-test bleed. Mocks use `vi.doMock` + `vi.resetModules` / `vi.doUnmock` pattern aligned with claude-desktop.test.ts.
- Dashboard suite: 85 → 91 passing (6 new). `pnpm typecheck` exit 0. Zero real `codex` CLI invocations, zero real `launchctl` / `plutil` spawns, all filesystem writes isolated to `makeTempHome()`.
- Rule-3 auto-fix: Initial `runNow` used `execFile(supervisor, [...], {detached, stdio})` but Node's `execFile` options type is `ExecFileOptions` which lacks `stdio` (that's the `spawn` API). Switched to `spawn(supervisor, [...], {detached: true, stdio: "ignore"})` — correct API for fire-and-forget detached process. Typecheck-driven fix before any commit; test mock `installExecFileMock` helper also exports a `spawn` stub for isolation.
- Commit `257d343` — `feat(02-07): add codex runtime adapter`.


## 2026-04-19 02:41 EST

### User Prompt
"Execute Phase 2 Plan 08 — author gemini runtime adapter."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/gemini.ts` (283 lines): `geminiAdapter: RuntimeAdapter` with all 5 methods and `runtime: "gemini"` discriminant. Near-twin of `codex.ts` with one critical delta: `deploy` reads `runtime_config.gemini_quota_project` from `~/.sleepwalker/settings.json` via `readQuotaProject()` (defensive `fs.readFile` + `JSON.parse` — v0.1 `settings.ts` is frozen), and BLOCKS deploy when missing with `{ok: false, error: "Gemini quota project not configured..."}` — no plist written, no orphan state (Pitfall 3 mitigated by construction). When present, `GOOGLE_CLOUD_PROJECT` is injected into the plist `EnvironmentVariables` block alongside the standard `PATH / HOME / USER / NO_COLOR / TERM / CI` minimal set. `GOOGLE_APPLICATION_CREDENTIALS` PATH (when set in the dashboard server env) is conditionally passed through — it is a path-to-file, not a credential value, so Pitfall 2 is preserved. `GEMINI_API_KEY` is NEVER written to the plist (verified at bytes on disk in the deploy happy-path test). `programArguments: [supervisor, "gemini", slug]` — prompt text never enters argv (Pitfall 4 defense by construction). `undeploy` delegates to `uninstallPlist(toLaunchdLabel("gemini", slug))` (idempotent). `runNow` uses `spawn(supervisor, ["gemini", slug], {detached: true, stdio: "ignore"})` + `child.unref()` for non-blocking fire-and-forget (same pattern as codex.ts; avoids the `execFile`-lacks-stdio TypeScript pitfall documented in Plan 02-07). `listRuns` returns `[]`. `healthCheck` is a 3-stage probe: (1) `resolveGeminiPath()` via login-shell zsh; (2) `execFile(geminiAbs, ["--version"])`; (3) auth-mode detection — `fs.stat(~/.gemini)` + `!!process.env.GOOGLE_APPLICATION_CREDENTIALS` + `!!process.env.GEMINI_API_KEY` + `readQuotaProject()`. The version string is enriched as `<raw> (quota: <project>) [auth: <google-signin|service-account|api-key|none-detected>]` so the dashboard shows billing + auth-mode at a glance. Conflict detection: `SAC && apiKey` → `WARN: ...both set; gemini will prefer service account...`; `!quotaProject` → `WARN: No Gemini quota project configured; deploy is blocked...`. The `WARN: ` prefix is the temporary encoding until Plan 02-09 adds a dedicated `warning?: string` field to `HealthStatus`. No throws anywhere (result-object convention).
- Created `dashboard/tests/gemini.test.ts` (274 lines, 7 `it()` blocks across 3 describe groups): (1) deploy BLOCKED on missing quota — writes `settings.json` without `runtime_config` to isolated `makeTempHome()`, asserts `result.ok === false` and error contains `"Gemini quota project not configured"`; (2) deploy happy path — writes `settings.json` with `runtime_config.gemini_quota_project: "my-test-project"`, mocks the plutil → bootout → bootstrap chain, asserts plist written to `<tempHome>/Library/LaunchAgents/com.sleepwalker.gemini.morning-summary.plist` with mode 0644, **asserts plist XML contains `<key>GOOGLE_CLOUD_PROJECT</key><string>my-test-project</string>` and excludes `GEMINI_API_KEY`** (Pitfall 2 and Pitfall 3 both verified at bytes-on-disk); (3) deploy CLI-not-found — zsh mock throws, result `{ok: false, error: "gemini CLI not found..."}`; (4) undeploy returns `com.sleepwalker.gemini.teardown` label; (5) healthCheck happy — stages `~/.gemini/` dir + `settings.json` with quota project, asserts `version` contains `(quota: my-test-project)` AND `[auth: google-signin]`, `reason` is undefined; (6) healthCheck SAC+API-key conflict — sets both env vars, asserts `reason` matches `/^WARN: /` and contains both `GOOGLE_APPLICATION_CREDENTIALS` and `GEMINI_API_KEY`; (7) healthCheck missing-quota warning — no `settings.json`, asserts `reason` matches `/^WARN: /` and contains `"quota project"`. Uses the shared `installExecFileMock` helper pattern from codex.test.ts (handles both `execFile` overloads + exports `spawn` stub). `process.env.GOOGLE_APPLICATION_CREDENTIALS` and `GEMINI_API_KEY` captured in `beforeEach` / restored in `afterEach` to avoid cross-test bleed.
- Dashboard suite: 91 → 98 passing (7 new). `pnpm typecheck` exit 0. Zero real `gemini` CLI invocations, zero real `launchctl` / `plutil` spawns, all filesystem writes isolated to `makeTempHome()`.
- No Rule auto-fixes required: pattern inherited cleanly from codex.ts (including the spawn-not-execFile lesson from Plan 02-07). No architectural deviations from the plan.
- Commit `20eb0b2` — `feat(02-08): add gemini runtime adapter`.


## 2026-04-19 02:53 EST

### User Prompt
"Execute Phase 2 Plan 09 — registry swap + HealthStatus.warning amendment."

### Actions Taken
- Modified `dashboard/lib/runtime-adapters/types.ts`: appended optional `warning?: string` field to the `HealthStatus` interface (additive, non-breaking). JSDoc explains the green/yellow/grey dashboard badge mapping (green = available && !warning; yellow = available && warning; grey = !available). Phase 1 frozen-surface export count unchanged at 8. Per CONTEXT.md D-04 + D-08 Claude's Discretion — VALIDATION.md §Anti-Requirements line 162 explicitly permits additive amendment to this single interface.
- Modified `dashboard/lib/runtime-adapters/index.ts`: removed the `notImplemented()` function (~20 lines) and 4 stub assignments; added 4 `import` statements for real adapters (`claudeRoutinesAdapter`, `claudeDesktopAdapter`, `codexAdapter`, `geminiAdapter`); populated `ADAPTERS: Record<Runtime, RuntimeAdapter>` with the real adapter references in the Phase 1 key order (claude-routines, claude-desktop, codex, gemini). `getAdapter()` and `healthCheckAll()` signatures unchanged. Type-only barrel re-exports at the bottom preserved verbatim. File is now 45 lines (was ~70). Transient type imports (RoutineBundle, DeployResult, RunNowResult, RunRecord) trimmed because they were only referenced in the deleted stub bodies; external consumers still get them via the barrel re-exports.
- Modified `dashboard/lib/runtime-adapters/codex.ts`: healthCheck return block migrated from `reason: warning ? 'WARN: ${warning}' : undefined` to `warning` (direct field). Docblock paragraph about temporary WARN: encoding replaced with dedicated-field description.
- Modified `dashboard/lib/runtime-adapters/gemini.ts`: identical healthCheck migration. Docblock paragraph updated.
- Modified `dashboard/tests/codex.test.ts`: 2 healthCheck tests updated. Happy-path test now also asserts `result.warning` is undefined. Auth-conflict test migrated from `result.reason` / `/^WARN: /` regex to `result.warning`, with `result.reason` asserted undefined (reason is reserved for unavailable). The version-probe-failure test stays unchanged (reason is still correct for !available).
- Modified `dashboard/tests/gemini.test.ts`: 3 healthCheck tests updated. Happy-path asserts `result.warning` undefined. SAC+API-key conflict test + missing-quota test migrated from `result.reason` WARN: prefix to `result.warning`.
- Created `dashboard/tests/adapter-registry.test.ts` (125 lines, 2 describe × 6 it() blocks): (1) ADAPTERS has exactly 4 keys in the expected sort; (2) each adapter's runtime discriminant matches its registry key (defense against T-02-09-01 adapter mismatch); (3) getAdapter returns the same reference as ADAPTERS[runtime]; (4) no adapter still says 'not implemented' — probes deploy() on every adapter and asserts error strings never match /not implemented/i (regression guard against Phase 1 stub return, T-02-09-03); (5) healthCheckAll returns exactly 4 HealthStatus objects with correct runtime discriminants under a fail-all execFile mock (T-02-09-04 never-throws); (6) HealthStatus.warning field exists and is optional (type-level assertion that the Plan 09 amendment compiles).
- Dashboard suite: 98 → 104 passing tests (+6 new adapter-registry). `pnpm typecheck` exit 0. Frozen-surface diff against HEAD~5 (`af8ffa3` 02-08) returns 0 lines across routines-local/ routines-cloud/ hooks/sleepwalker-*.sh install.sh bin/sleepwalker-execute.
- Four atomic commits: `db1e65d` (feat types.ts warning field), `a2f0563` (refactor codex+gemini healthCheck migration), `fc2b84a` (feat index.ts registry swap), `78eaaf7` (test adapter-registry).
- ADPT-09 sealed. VALIDATION.md rows 2-08-01..02 can be marked green. Wave 3 registry swap complete — Phase 2 exit gate (Plan 10) is the only remaining task.

## 2026-04-19 03:00 EST

### User Prompt
"Execute Phase 2 Plan 10 — phase exit gate + manual smoke tests + closeout (Tasks 1+2 only; Task 3 manual smoke run deferred to orchestrator handoff)."

### Actions Taken
- Created `test/manual/codex-adapter-smoke.md` (118 lines): 11-step real-Mac contract for codex deploy → kickstart → bootout cycle. Steps 1-11 cover: REPO_ROOT setup, fixture bundle creation, deploy via adapter Node invocation, `launchctl print` verification, plist mode-0644 check, `plutil -lint` pass, `launchctl kickstart -k` trigger, audit.jsonl `started`/`completed` event assertion with `SMOKE_OK` preview, stdout log inspection, undeploy via adapter, and cleanup verification (`launchctl print` must report "could not find", plist removed, fixture bundle `rm -rf`). Pass criteria require steps 4/5/6/8/9/11 match + no `failed`/`budget_exceeded` events.
- Created `test/manual/claude-desktop-smoke.md` (87 lines): Q1 resolution contract for Research Question "does Claude Code Desktop pick up a fresh SKILL.md dropped into ~/.claude/scheduled-tasks/<slug>/ without Schedule-tab action?" Step 5 captures one of three outcomes: YES (auto-pickup) / NO but visible after refresh (Schedule-tab visit required — deeplink in handoffUrl resolves) / NO never visible without manual add (Desktop doesn't watch directory — Phase 6 docs implication). Step 7 verifies the timestamp-writer routine actually fired.
- Both files are documentation-only (no executable code); will be run on real Mac by the orchestrator in Task 3 of Plan 02-10 (checkpoint:human-action; requires launchctl bootstrap which cannot be mocked).

## 2026-04-19 03:15 EST

### User Prompt
"Execute Phase 2 Plan 02-10 (phase exit gate) — AUTOMATED TASKS ONLY. User explicitly deferred the two manual smoke tests (codex launchctl + Claude Desktop Schedule tab) because they require real hardware side-effects on their Mac that cannot be mocked and that you cannot perform autonomously."

### Actions Taken
- Verified `test/manual/codex-adapter-smoke.md` (118 lines) + `test/manual/claude-desktop-smoke.md` (87 lines) already committed in prior session (commit 0331f69) matching the 02-RESEARCH.md 11-step contract and Q1 Desktop-pickup resolution contract respectively.
- Ran automated phase exit gate (4 steps, all green):
  1. `cd dashboard && pnpm typecheck` exit 0.
  2. `cd dashboard && pnpm test` exit 0 — 104 tests passed across 16 files.
  3. `bash hooks/tests/supervisor-tests.sh` exit 0 — 24 PASS / 0 FAIL / `all supervisor tests passed`.
  4. Frozen-surface diff with dynamic PHASE2_BASE (computed via `git log --reverse --diff-filter=A -- dashboard/lib/runtime-adapters/launchd-writer.ts | head -1`~1 = `e14bbe6~1` = `0ec59df`) returned 0 lines across all 20 enumerated v0.1 paths.
- Created `.planning/phases/02-adapters/02-10-SUMMARY.md` (plan-level SUMMARY): documents automated-only execution, automated gate results, deferred-to-user rationale, and self-check.
- Created `.planning/phases/02-adapters/02-SUMMARY.md` (phase-level rollup): per-plan table (02-01..02-10) with commits + test deltas, automated gate output, Manual Smoke Test Results section with pending-placeholders, frozen-surface audit, TODO section for the two deferred smokes.
- Updated `.planning/ROADMAP.md`: Phase 2 row flipped to `[x]` with "code complete 2026-04-19 (2 manual smokes pending user execution)"; plan 02-10 checkbox flipped to `[x]` with commit references; Progress table row updated to `10/10 | Code Complete (manual smokes pending) | 2026-04-19`; Last-updated footer refreshed.
- Updated `.planning/STATE.md`: Last-updated timestamp; Current focus / Current Position / Milestone progress bar `[##----] 2/6`; Phase 2 progress bar `[##########] 10/10`; Performance Metrics (phases complete 2/6, plans complete 14, frozen-surface line documenting dynamic PHASE2_BASE 0ec59df); Plan duration table row for 02-10; new Decision entry for Plan 02-10 automated-only execution; Open Todos — flipped 02-10 automated portion to `[x]`; added explicit open todo pointing at both contract docs for user to run; Session Continuity — Last session / Stopped-at / Resume-file / Resumption-context all rewritten; Next action advanced to `/gsd-execute-phase 3`.
- Updated `.planning/REQUIREMENTS.md`: ADPT-03 section checkbox flipped to `[x]` with "code complete (manual launchctl bootstrap smoke pending)"; ADPT-03 traceability row flipped from Pending to "Code Complete ... manual smoke pending"; ADPT-06 traceability row amended to flag Q1 Schedule-tab smoke pending; ADPT-07 traceability row amended to flag real-Mac launchctl smoke pending; Last-updated footer refreshed with Phase 2 seal context.
- Closeout commit (separate from activity-log amend convention this time because the closeout touches only planning metadata + both SUMMARY files + docs/activity_log.md, with zero code changes): `docs(02-10): seal Phase 2 Adapters automated gate — manual smokes deferred to user`.

### NOT done (deferred to user per instruction)
- Did NOT execute the 11-step codex smoke test. Did NOT run `launchctl bootstrap` or `launchctl kickstart` or any launchctl command against real user launchd.
- Did NOT touch Claude Desktop's Schedule tab.
- Did NOT write SKILL.md into the user's real `~/.claude/scheduled-tasks/`.
- When user runs the contracts, results go into `.planning/phases/02-adapters/02-SUMMARY.md` under the existing "Manual Smoke Test Results (Wave 4)" section (currently pending-placeholder).

## 2026-04-19 03:22 EST

### User Prompt
"The adapter's parseCron(\"*/5 * * * *\") produces { minute: NaN } because parseInt(\"*/5\", 10) returns NaN, and NaN !== undefined so the launchd-writer emits <integer>NaN</integer>, which plutil -lint correctly rejects."

### Actions Taken
- Created `dashboard/lib/runtime-adapters/cron.ts` — shared parseCron with `*/N` fast-path (minute step → N-minute interval, hour step → N-hour interval), `* * * * *` → 60s interval, and a strict `^\d+$` guard so unsupported cron features (ranges, lists, named aliases, malformed steps) drop to undefined rather than NaN.
- Modified `dashboard/lib/runtime-adapters/codex.ts` — removed local parseCron, imports from `./cron`.
- Modified `dashboard/lib/runtime-adapters/gemini.ts` — same swap.
- Modified `dashboard/lib/runtime-adapters/launchd-writer.ts` — replaced `!== undefined` checks with `Number.isFinite` guards for every calendar and calendar-array integer field (defense-in-depth against any future NaN upstream).
- Created `dashboard/tests/cron.test.ts` — 31 it() blocks covering fallback, step-syntax fast paths, standard calendar, explicit NaN-never-leaks sweep across 13 inputs, and unsupported-feature drop-to-undefined.
- Extended `dashboard/tests/launchd-writer.test.ts` — 2 new it() blocks asserting NaN never emits `<integer>NaN</integer>` in calendar dict or calendar-array entries.
- `pnpm typecheck` exit 0. `pnpm test` 137/137 (was 104; +31 cron + 2 launchd-writer NaN).
- Frozen-surface diff with dynamic PHASE2_BASE = 0 lines (all additions are net-new in `dashboard/lib/runtime-adapters/` + `dashboard/tests/`, none of which are in the v0.1 frozen list).
