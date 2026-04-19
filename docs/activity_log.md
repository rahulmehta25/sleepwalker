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

