---
phase: 02-adapters
plan: 08
subsystem: runtime-adapter
tags: [adapter, gemini, launchd, plist, google-cloud-project, auth-conflict, pitfall-2, pitfall-3, pitfall-4, login-shell-path, vitest, phase-2, wave-2]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "RuntimeAdapter + RoutineBundle + DeployResult + RunNowResult + HealthStatus type shapes; ADAPTERS registry stub for gemini slot"
  - phase: 02-adapters
    provides: "slug.ts assertValidSlug guard (02-01) — toLaunchdLabel throws on invalid slug; adapter catches at deploy/undeploy entry and returns {ok:false, error}"
  - phase: 02-adapters
    provides: "launchd-writer.ts (02-02) installPlist + uninstallPlist + LaunchdJob + LaunchdSchedule — the plist generation + plutil-lint + bootout + bootstrap chain with rollback"
  - phase: 02-adapters
    provides: "bin/sleepwalker-run-cli (02-03) — supervisor receives [runtime, slug] argv and reads prompt.md from bundle dir via stdin (Pitfall 4 defense by construction)"
  - phase: 02-adapters
    provides: "codex.ts (02-07) established supervisorPath three-dot-up resolver, parseCron cron-5 converter, plist-env no-secrets convention, 3-stage healthCheck shape, and installExecFileMock test helper — all reused verbatim for gemini"
provides:
  - "geminiAdapter (fourth and final live adapter — plist-based launchd deploy via supervisor with explicit GOOGLE_CLOUD_PROJECT env + 3-stage healthCheck with D-04 auth-conflict warn-but-allow)"
  - "readQuotaProject() defensive fs.readFile + JSON.parse reading runtime_config.gemini_quota_project from ~/.sleepwalker/settings.json (v0.1 settings.ts frozen; adapter does its own parse)"
  - "Deploy-blocking pattern on missing critical config: return {ok:false, error:'<specific>'} without writing a plist — no orphan state, clear fix-pointer. Template for future adapters that require provider-side configuration (Pitfall 3 mitigated by construction)."
  - "Enriched version string convention for multi-dimensional health: '<raw> (quota: <project>) [auth: <google-signin|service-account|api-key|none-detected>]' surfaces both billing project and auth mode in a single dashboard pill"
  - "Conditional env spread pattern: ...(serviceAccountPath ? { GOOGLE_APPLICATION_CREDENTIALS: serviceAccountPath } : {}) — passes a PATH (non-secret) through the plist when present in dashboard server env, without polluting when absent"
  - "WARN: prefix encoding reused verbatim from codex.ts (D-04 until Plan 02-09 adds dedicated warning field)"
affects: [02-09 registry swap (both codex + gemini now concrete; ADAPTERS map swap unblocked), 02-10 phase exit gate, 03-editor gemini-quota-project UI field (Phase 3 editor adds settings.json UI), Phase 4 Deploy state machine (gemini-specific deploy-blocked error path), Phase 5 queue-aggregator gemini runNow callers, Plan 09 HealthStatus migration from reason to warning field]

# Tech tracking
tech-stack:
  added: []
  patterns: [defensive-settings-read, deploy-block-on-missing-config, google-cloud-project-env-injection, conditional-env-passthrough, enriched-version-string, supervisor-path-three-dot-up, cron-5-to-launchd-schedule, plist-env-no-secrets, 3-stage-health-probe, auth-conflict-warn-but-allow, spawn-detached-unref-runnow, install-exec-file-mock-helper]

key-files:
  created:
    - dashboard/lib/runtime-adapters/gemini.ts
    - dashboard/tests/gemini.test.ts
  modified:
    - docs/activity_log.md

key-decisions:
  - "Deploy is BLOCKED (not warned) when runtime_config.gemini_quota_project is missing. Rationale: without an explicit GOOGLE_CLOUD_PROJECT env, gemini's quota-project resolution is non-deterministic (Pitfall 3) — may bill a wrong project or fail with cryptic quota errors at run-time. Silent-wrong-project-billing is the highest-stakes class of failure in the plan's threat model (T-02-08-05). Returning {ok: false, error} before any plist write means no orphan state and a clear fix-pointer to ~/.sleepwalker/settings.json."
  - "readQuotaProject does its own fs.readFile + JSON.parse rather than depending on the v0.1 settings.ts module. Rationale: VALIDATION.md flags settings.ts as a FROZEN v0.1 surface; Phase 2 may not widen its public API. Defensive parse + defensive typing (typeof project === 'string' && project.trim()) covers missing file / malformed JSON / missing field / empty string / non-string field — any of these → null → deploy block. Phase 3 editor will add UI to write the field; Phase 2 just reads it."
  - "GOOGLE_APPLICATION_CREDENTIALS is passed through conditionally via object-spread (...(serviceAccountPath ? {...} : {})). Rationale: it is a PATH to a file (not a credential value), so Pitfall 2 (no-secrets-in-plist) is preserved; the file mode 0600 + user ownership keeps credentials themselves off a 0644 plist. When the dashboard server doesn't have it set, the env key is omitted entirely from the plist rather than emitted as empty string — keeps the plist minimal and correct."
  - "healthCheck version string is enriched with both quota project and auth-mode hint: '0.31.0 (quota: my-project) [auth: google-signin]'. Rationale: the dashboard's health pill is 1 line; surfacing both billing destination and auth mechanism inline avoids a second UI surface and gives users explicit visibility into what their scheduled routine will do. Auth-mode precedence (google-signin → service-account → api-key → none-detected) matches gemini CLI's own resolution order."
  - "runNow uses spawn (not execFile) for non-blocking fire-and-forget. Rationale: pattern inherited from codex.ts (Plan 02-07 Rule-3 auto-fix documented ExecFileOptions lacks stdio; spawn is the correct API for fire-and-forget detached processes). Applied cleanly at authoring time in gemini.ts — no auto-fix required. This is the pattern-transfer dividend from shipping Plan 02-07 before Plan 02-08."

patterns-established:
  - "Defensive settings.json read for adapter-specific config: fs.readFile + JSON.parse wrapped in try/catch → null on any failure → consumer treats null as BLOCKED. Avoids widening frozen v0.1 settings.ts API during Phase 2. Template for future adapters that need runtime_config.<runtime>_* fields (e.g., a hypothetical claude_enterprise_org_id)."
  - "Deploy-block-on-missing-critical-config: when a required environment value cannot be determined, return {ok: false, error: '<specific fix-pointer>'} BEFORE writing any plist. No orphan state, no rollback needed, clear UX. Stronger than silent-default-to-wrong-value or warn-but-deploy."
  - "Conditional env-var passthrough: ...(process.env.X ? { X: process.env.X } : {}) keeps the plist env block minimal when optional values are unset. Pattern applicable to any adapter with optional environment inputs."
  - "Enriched version string for multi-dimensional health: '<raw> (<dim1>: <v1>) [<dim2>: <v2>]' surfaces multiple health dimensions in a single dashboard pill without a new UI surface."
  - "Pattern-transfer between same-wave adapters: codex.ts Rule-3 auto-fix (spawn vs execFile for runNow) applied cleanly at authoring time in gemini.ts — zero auto-fixes needed. The dividend of shipping a near-twin adapter second."

threat-model-mitigations:
  - "T-02-08-01 (Info Disclosure — GEMINI_API_KEY in plist): mitigated at gemini.ts source (explicit enumeration: PATH/HOME/USER/NO_COLOR/TERM/CI/GOOGLE_CLOUD_PROJECT + conditional GOOGLE_APPLICATION_CREDENTIALS PATH only) AND verified at test-time by reading plist bytes on disk (deploy happy-path test asserts xml.not.toContain('GEMINI_API_KEY')). Pitfall #2. Source grep AC `grep -A 14 'environmentVariables: {' | grep -c GEMINI_API_KEY` returns 0."
  - "T-02-08-02 (Info Disclosure — quota project in plist): accepted. Quota project ID is the billing-project name, not a secret per Google Cloud convention. Same disposition as codex's PATH/HOME/USER env values."
  - "T-02-08-03 (Info Disclosure — service-account credentials JSON content): mitigated. Adapter passes the PATH (string), not the file contents. Service-account JSON stays at the user-controlled path with mode 0600. Plist 0644 only exposes the path string."
  - "T-02-08-04 (Tampering — quota project injected into plist with malicious content): accepted/mitigated. Quota project is read from ~/.sleepwalker/settings.json (user-owned file, not network input); plistEscape (Plan 02-02) handles XML entity escaping for any &<>\"' characters. User controls their own settings file."
  - "T-02-08-05 (DoS — missing quota project causing silent wrong-project billing): MITIGATED by construction. Deploy is BLOCKED with explicit error pointing to the fix (`Gemini quota project not configured. Set runtime_config.gemini_quota_project in ~/.sleepwalker/settings.json...`); healthCheck surfaces the same warning preemptively. Pitfall #3 mitigated at the adapter boundary; no plist can ever be written without an explicit GOOGLE_CLOUD_PROJECT."
  - "T-02-08-06 (Spoofing — gemini auth-mode ambiguity): mitigated. healthCheck reports authHint string ('google-signin' | 'service-account' | 'api-key' | 'none-detected') in version field. User has explicit visibility into what auth mode the scheduled routine will use. Additional WARN: when SAC + API key both set flags the ambiguity."

requirements-completed: [ADPT-08]

# Metrics
duration: ~5m
completed: 2026-04-19
---

# Phase 2 Plan 08: gemini Adapter Summary

**Fourth and final live RuntimeAdapter — Google Gemini CLI Pro Scheduled Tasks via launchd plist + supervisor invocation, with explicit `GOOGLE_CLOUD_PROJECT` env injection and BLOCKED deploy on missing quota project (Pitfall 3 mitigated by construction); 3-stage healthCheck surfaces quota + auth-mode in an enriched version string with D-04 warn-but-allow encoded as `WARN:` prefix; 7 Vitest blocks green, dashboard suite 91 → 98 tests, zero real gemini CLI / launchctl / plutil invocations.**

## Performance

- **Duration:** ~5m
- **Tasks completed:** 3/3
- **Files created:** 2 (gemini.ts 283 lines, gemini.test.ts 274 lines)
- **Files modified:** 1 (docs/activity_log.md)
- **Commit:** `72c6f69` — `feat(02-08): add gemini runtime adapter`
- **Dashboard test suite:** 91 → 98 passing (+7 new)

## Plan-Level Verification Output

```
=== typecheck ===
tsc --noEmit -> exit 0

=== gemini test ===
 Test Files  15 passed (15)
      Tests  98 passed (98)

=== full suite ===
 Test Files  15 passed (15)
      Tests  98 passed (98)

=== GEMINI_API_KEY in gemini.ts env block (should be 0) ===
0

=== commit subject ===
feat(02-08): add gemini runtime adapter

=== file count ===
3

=== AI attribution check (should be 0) ===
0

=== status clean (plan files) ===
0
```

## Files

### Created

- **`dashboard/lib/runtime-adapters/gemini.ts` (283 lines)** — `geminiAdapter: RuntimeAdapter` with all 5 methods. `deploy` reads `runtime_config.gemini_quota_project` from `~/.sleepwalker/settings.json` via `readQuotaProject()`, BLOCKS on missing with specific error, injects `GOOGLE_CLOUD_PROJECT` into the plist env block (Pitfall 3), conditionally passes through `GOOGLE_APPLICATION_CREDENTIALS` PATH (Pitfall 2 preserved), and delegates to `installPlist`. `programArguments: [supervisor, "gemini", slug]` means prompt text never enters argv (Pitfall 4). `undeploy` delegates to `uninstallPlist(toLaunchdLabel("gemini", slug))` (idempotent). `runNow` uses `spawn(supervisor, [...], {detached: true, stdio: "ignore"})` + `child.unref()` (fire-and-forget; correct API inherited from Plan 02-07 learning). `listRuns` returns `[]` (Phase 5 wires audit.jsonl filtering). `healthCheck` is a 3-stage probe: (1) `resolveGeminiPath()` via login-shell zsh; (2) `execFile(geminiAbs, ["--version"])`; (3) auth-mode detection via `fs.stat(~/.gemini)` + env-var presence + `readQuotaProject()`. Produces an enriched version string `<raw> (quota: <project>) [auth: <hint>]` and WARN: prefix on either of two conflict classes (SAC + API key both set; missing quota project). No throws (result-object convention).

- **`dashboard/tests/gemini.test.ts` (274 lines, 7 `it()` blocks across 3 describe groups)** — uses `installExecFileMock` helper (same shape as codex.test.ts; handles both `execFile` overloads + exports `spawn` stub). Coverage:
  1. **deploy BLOCKED on missing quota** — writes `settings.json` without `runtime_config` to isolated `makeTempHome()`; asserts `result.ok === false` and error contains `"Gemini quota project not configured"`.
  2. **deploy happy path with quota** — writes `settings.json` with `runtime_config.gemini_quota_project: "my-test-project"`, mocks plutil → bootout → bootstrap chain; asserts plist written with mode 0644 at `<tempHome>/Library/LaunchAgents/com.sleepwalker.gemini.morning-summary.plist`, plist XML contains `<key>GOOGLE_CLOUD_PROJECT</key><string>my-test-project</string>`, and plist XML does NOT contain `GEMINI_API_KEY` (Pitfall 2 + Pitfall 3 both verified at bytes-on-disk).
  3. **deploy CLI-not-found** — zsh mock throws; result `{ok: false, error: "gemini CLI not found..."}`.
  4. **undeploy** — returns `com.sleepwalker.gemini.teardown` label.
  5. **healthCheck happy** — stages `~/.gemini/` dir + settings.json with quota; asserts version contains both `(quota: my-test-project)` AND `[auth: google-signin]`, `reason` undefined.
  6. **healthCheck SAC + API-key conflict** — sets both env vars; asserts `reason.match(/^WARN: /)` AND contains both env-var names.
  7. **healthCheck missing-quota warning** — no settings.json; asserts `reason.match(/^WARN: /)` AND contains `"quota project"`.

### Modified

- **`docs/activity_log.md`** — Plan 08 execution entry appended (amended into the feat commit per v0.1 convention).

## Key Decisions

See frontmatter `key-decisions` — 5 decisions recorded:
1. Deploy BLOCKED (not warned) on missing quota project (Pitfall 3; silent wrong-project billing is T-02-08-05)
2. `readQuotaProject` does its own defensive fs.readFile + JSON.parse (v0.1 settings.ts frozen)
3. Conditional env-spread for `GOOGLE_APPLICATION_CREDENTIALS` PATH passthrough (Pitfall 2 preserved — it's a path, not a secret value)
4. Enriched version string `<raw> (quota: <project>) [auth: <hint>]` for dashboard visibility
5. `spawn` (not execFile) for `runNow` — pattern inherited from codex.ts

## Deviations from Plan

**None — plan executed exactly as written.**

The plan template specified `execFile` with `detached: true` for `runNow` in its example code, but also referenced codex.ts as the near-twin pattern. codex.ts ships with `spawn` (per Plan 02-07's Rule-3 auto-fix — `ExecFileOptions` lacks `stdio`). Applying the codex.ts pattern directly at authoring time avoided the same typecheck error; no auto-fix needed at this plan. This is the pattern-transfer dividend of shipping Plan 02-07 first.

### Line-Count Deviation (non-blocking)

- gemini.ts target `min_lines: 130` → actual **283** lines. Over the minimum due to comprehensive comment blocks explaining Pitfall 2 / Pitfall 3 / Pitfall 4 / D-04 rationale inline (per CLAUDE.md "prefer self-documenting code") and the additional conflict-detection logic in healthCheck. `min_lines` is a floor, not a ceiling.
- gemini.test.ts target `min_lines: 110` → actual **274** lines. Over due to the `installExecFileMock` centralized helper (inherited from codex.test.ts; avoids repeating overload-handling code) + 7 it() blocks vs the 6 in codex.test.ts.

### Deferred Items

- **VALIDATION.md row 2-07-03** (if present) — any gemini real-Mac launchctl smoke test is explicitly deferred to Plan 02-10 manual smoke tests. No action required at this plan.

## Acceptance Criteria Results

All criteria from Task 1, Task 2, Task 3 acceptance lists pass:

**Task 1 (gemini.ts):**
- `dashboard/lib/runtime-adapters/gemini.ts` exists — ✓
- `grep -c "^export const geminiAdapter" gemini.ts` = 1 — ✓
- `grep -c 'runtime: "gemini"' gemini.ts` = 4 (1 discriminant + 3 HealthStatus returns; AC required = 1, substantive equivalent) — ✓
- `grep -cE "async (deploy|undeploy|runNow|listRuns|healthCheck)" gemini.ts` = 5 — ✓
- `grep -c "GOOGLE_CLOUD_PROJECT: quotaProject" gemini.ts` = 1 — ✓
- `grep -c "readQuotaProject" gemini.ts` = 3 (function def + 2 call sites in deploy/healthCheck) — ✓
- `grep -c "Gemini quota project not configured" gemini.ts` = 1 — ✓
- `grep -c "GOOGLE_APPLICATION_CREDENTIALS" gemini.ts` = 6 (≥ 2 required) — ✓
- `grep -c "GEMINI_API_KEY" gemini.ts` = 3 (all read-only; 1 env check in healthCheck + 2 comment refs) — ✓
- `grep -A 14 'environmentVariables: {' gemini.ts | grep -c GEMINI_API_KEY` = **0** (Pitfall #2 confirmed) — ✓
- `pnpm typecheck` exit 0 — ✓

**Task 2 (gemini.test.ts):**
- `dashboard/tests/gemini.test.ts` exists — ✓
- `grep -cE "^\s+it\(" gemini.test.ts` = 7 (≥ 7 required) — ✓
- `pnpm test -- --run gemini.test.ts` exit 0 with 7/7 passing — ✓
- Deploy happy-path test reads actual plist XML and asserts `GOOGLE_CLOUD_PROJECT` present AND `GEMINI_API_KEY` absent — ✓
- Deploy blocked test confirms missing-quota error message — ✓
- Full dashboard suite exit 0 (98/98 green) — ✓

**Task 3 (commit + activity log):**
- `git log -1 --pretty=%s` starts with `feat(02-08):` — ✓
- `git status --porcelain` shows no Plan-08 files untracked/modified (only pre-existing untracked CLAUDE.md + screenshots) — ✓
- `git log -1 --name-only` shows 3 files (gemini.ts, gemini.test.ts, docs/activity_log.md) — ✓
- `git log -1 --pretty=%B | grep -cE 'Co-Authored-By|Generated with'` = 0 — ✓

## Self-Check: PASSED

**Files verified to exist:**
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/gemini.ts` — FOUND (283 lines)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/gemini.test.ts` — FOUND (274 lines)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/docs/activity_log.md` (appended) — FOUND
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/phases/02-adapters/02-08-SUMMARY.md` — FOUND (this file)

**Commits verified to exist:**
- `72c6f69` `feat(02-08): add gemini runtime adapter` — FOUND (3 files, +570 insertions; activity log amended in)
