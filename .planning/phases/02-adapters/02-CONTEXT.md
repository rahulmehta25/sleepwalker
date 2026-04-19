# Phase 2: Adapters — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** `/gsd-discuss-phase 2`

<domain>
## Phase Boundary

Ship working, health-checkable, safely-invoked implementations of `RuntimeAdapter` for all four runtimes, plus the shared `launchd-writer.ts` and `bin/sleepwalker-run-cli` supervisor that Codex and Gemini adapters depend on.

**Requirements (8):** ADPT-03, ADPT-04, ADPT-05, ADPT-06, ADPT-07, ADPT-08, ADPT-09, SAFE-02

**Deliverables:**
- `dashboard/lib/runtime-adapters/launchd-writer.ts` — hand-rolled plist XML + `launchctl bootstrap gui/$UID` + `plutil -lint`
- `bin/sleepwalker-run-cli` — bash supervisor (login-shell PATH, reversibility + sleep-window + char-budget gates, ANSI stripping, audit JSONL)
- `claude-routines.ts` — wraps `fire-routine.ts` for Run-now; `deploy()` returns `{handoffUrl}` for `/schedule create`
- `claude-desktop.ts` — writes SKILL.md to `~/.claude/scheduled-tasks/<slug>/`; returns handoff URL for Desktop's Schedule page
- `codex.ts` — writes `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` invoking supervisor
- `gemini.ts` — same pattern with explicit `GOOGLE_CLOUD_PROJECT` env
- `dashboard/lib/runtime-adapters/index.ts` — `ADAPTERS` registry already ships stubs in Phase 1; Phase 2 replaces each stub with real adapter
- Vitest unit tests for all 4 adapters (mock `execFile` + `fs`)

**Out of scope (belongs to later phases):**
- Editor UI (Phase 3)
- Deploy button, state machine, rollback (Phase 3/4)
- Morning Queue extension, ANSI in queue, flock (Phase 4/5)
- Docs, templates, diagnostics page (Phase 6)

</domain>

<decisions>
## Implementation Decisions

### Slug Validation (resolves Phase 1 review debt)

**Locked:** Every builder in `slug.ts` gains `assertValidSlug(slug)` at the top of the function body. `toBundleDir("codex", "../x")` will throw before `path.join` runs. Adapters can never construct invalid identifiers.

**Why:** Phase 1 review (Gemini + Codex consensus) flagged that builders accepting raw strings makes ADPT-02 "primitive only," not enforcement. Phase 2 adapters are the first real consumers — fixing it here means adapters are the first callers with the guarantee. Stronger than documentation, simpler than a branded `Slug` type.

**Implementation:**
```ts
// slug.ts — amended in Phase 2 Wave 1
function assertValidSlug(slug: string): asserts slug is string {
  if (!validateSlug(slug)) {
    throw new Error(`Invalid slug: ${JSON.stringify(slug)}. Must match ${SLUG_REGEX}`);
  }
}

export function toBundleDir(runtime: Runtime, slug: string): string {
  assertValidSlug(slug);
  // ...
}
// Same pattern in toLaunchdLabel, toMarkerTag, toBranchPrefix, toPlistPath
```

Existing `slug.test.ts` gets additional `it()` blocks for invalid-input throws on each builder.

### v0.1 Bundle Reading (resolves Phase 1 review debt)

**Locked:** `dashboard/lib/bundles.ts` uses **directory enumeration** to read v0.1 routines. `toBundleDir` is write-only for new v0.2 routines.

**Pattern:**
```ts
// bundles.ts
export async function listBundles(): Promise<RoutineBundle[]> {
  const bundles: RoutineBundle[] = [];
  // v0.1 local (preserves sleepwalker- prefix as part of slug)
  for (const entry of await readdir("routines-local")) {
    const slug = entry; // "sleepwalker-inbox-triage"
    bundles.push({ runtime: "claude-desktop", slug, ... });
  }
  // v0.1 cloud
  for (const entry of await readdir("routines-cloud")) {
    bundles.push({ runtime: "claude-routines", slug: entry, ... });
  }
  // v0.2 codex
  for (const entry of await readdir("routines-codex")) {
    bundles.push({ runtime: "codex", slug: entry, ... });
  }
  // v0.2 gemini
  for (const entry of await readdir("routines-gemini")) {
    bundles.push({ runtime: "gemini", slug: entry, ... });
  }
  return bundles;
}
```

**Why:** Zero coupling of v0.1's quirk into a v0.2 builder. `toBundleDir` stays the authoritative write path for new routines. v0.1 routines' `sleepwalker-` prefix IS their slug; builders called on them would produce `claude-desktop/sleepwalker-inbox-triage` fleet keys, which is consistent and grep-able.

**Consequence for `validateSlug`:** The regex `^[a-z][a-z0-9-]{0,63}$` already accepts `sleepwalker-inbox-triage` (starts with letter, all lowercase, hyphens OK). No change needed. `_test-zen` (cloud routine with leading underscore) fails validateSlug — but bundle reader does not call validateSlug on enumerated entries; it trusts the existing v0.1 directory names. The validateSlug/builder enforcement is for *new* routines authored via the editor (Phase 3).

### Claude Desktop Deploy UX

**Locked:** Browser handoff. `claude-desktop.ts::deploy(bundle)` writes `SKILL.md` to `~/.claude/scheduled-tasks/<slug>/` and returns `{ok: true, handoffUrl: "claude://scheduled-tasks?slug=<slug>" }`. User clicks once in the dashboard to open Desktop's Schedule tab pre-filled.

**Why:** Conservative + inspectable + matches v0.1 cloud routine pattern. `claude -p "add scheduled task"` is undocumented behavior with a new failure mode. Phase 2 ships the safe path; if user demand surfaces, we can add CLI invocation as a fast-path in a v0.2.x patch.

**Research flag remains open** (per Phase 1 research SUMMARY.md): validate that writing SKILL.md alone + opening the Schedule page actually lets Desktop detect the new task. Phase 2 plan adds a synthetic "timestamp-writer" smoke test that the executor runs manually and reports back.

### Auth-Conflict Behavior

**Locked:** `healthCheck()` reports active auth mode as `{available: true, authMode: "subscription" | "env-key", warning: "..." | undefined}`. When conflict detected (both subscription login AND env var present), `warning` is set. Dashboard renders yellow badge + link to `docs/AUTHORING.md#auth-conflicts`. Deploy still allowed.

**Why:** User might legitimately want both modes on their machine (e.g., Codex subscription for personal, env key for CI). Blocking creates friction. Silent trust hides a real footgun (03:00 runs exceeding quota). Yellow badge + doc link is the right middle.

**Dashboard UI:** Green badge = available+no conflict. Yellow badge = available+warning (tooltip shows warning text + link). Grey badge = unavailable (tooltip shows `reason`). Same pattern for all 4 runtimes.

### Supervisor Design (ADPT-04 specifics — mostly locked by research)

**Locked (already in research):**
- `bin/sleepwalker-run-cli` is bash, `set -euo pipefail`
- Resolves absolute CLI path via login shell: `/bin/zsh -l -c 'command -v codex'`
- Gates: sleep-window check, reversibility allowlist check, char-budget SIGTERM on exceed
- Environment: `NO_COLOR=1 TERM=dumb CI=true`
- Output: strips ANSI via `perl -pe 's/\e\[[0-9;]*m//g'` (no Node dependency in bash); writes to `~/.sleepwalker/audit.jsonl` with normalized schema
- Prompt routing: reads `prompt.md` from bundle dir via `cat`, pipes to CLI via stdin (Codex `exec --stdin`, Gemini `-p -`)

**Newly locked (Phase 2 discussion):**
- Supervisor emits a `started` event AND a terminal `completed`/`failed`/`budget_exceeded` event in audit.jsonl per run
- On SIGTERM due to budget, supervisor writes a `budget_exceeded` event with `chars_consumed`, `chars_limit`, `partial_output_bytes` fields before exiting

### Adapter Test Strategy (supporting detail, aligns with research)

**Locked:**
- All adapter tests mock `execFile` / `spawn` / `fs` via Vitest `vi.mock()`
- No real `launchctl` calls in unit tests
- `launchd-writer.test.ts` validates plist XML shape with snapshot
- Each adapter's `deploy.test.ts` asserts the exact `execFile` invocations (`launchctl bootstrap`, `launchctl bootout`) and file writes
- Phase 2 ships ONE manual smoke test (`test/manual/codex-adapter-smoke.md`) the executor runs once on real Mac: plist install, launchctl boot, 1 cron fire, launchctl bootout. Result logged in the executor's SUMMARY.md, not CI.

### Claude's Discretion

- Exact TypeScript structure of each adapter module (composition vs. inline)
- How deep to type `DeployResult` success payloads per runtime (base type is fine; runtime-specific fields can be optional)
- Vitest describe/it nesting for adapter tests
- Whether `launchd-writer.ts` exports a single `writePlist(bundle): Promise<Result<void>>` function or separate `generatePlist` + `installPlist` — planner decides based on test ergonomics
- How to represent auth-conflict in `HealthStatus` type (add optional `warning?: string` field, or a richer `diagnostics: DiagnosticEntry[]`) — planner decides

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions and surface
- `CLAUDE.md` — project rules, frozen v0.1 surface, naming convention
- `.planning/PROJECT.md` — v0.2 active requirements, out of scope, key decisions
- `.planning/REQUIREMENTS.md` — ADPT-03 through ADPT-09 + SAFE-02 full text

### Upstream research (primary input)
- `.planning/research/SUMMARY.md` — phase shape + build order + phase-pitfall map
- `.planning/research/ARCHITECTURE.md` — `RuntimeAdapter` interface, adapter pattern choice, frozen-surface list, build-order chain
- `.planning/research/STACK.md` — runtime CLI contracts (Codex `exec --json`, Gemini `-p --output-format stream-json`), launchd `bootstrap/bootout` semantics, Claude Routines `/fire` endpoint
- `.planning/research/PITFALLS.md` — Pitfall #1 (launchd PATH), #2 (plist security), #4 (shell injection), #12 (beta header churn)

### Codebase baseline (what Phase 2 must NOT break)
- `.planning/codebase/ARCHITECTURE.md` — two-tier v0.1 model, data flow, state management
- `.planning/codebase/CONCERNS.md` — concurrent JSONL race (fixed in Phase 5, don't re-break), plaintext token storage (don't worsen)
- `.planning/codebase/CONVENTIONS.md` — TS strict, camelCase, result-object errors, bash `set -euo pipefail`
- `.planning/codebase/TESTING.md` — Vitest `makeTempHome()` pattern, bash hook harness `hook_input()` JSON simulation, mock patterns

### Phase 1 Foundation outputs (Phase 2 consumes these)
- `dashboard/lib/runtime-adapters/types.ts` — frozen `RuntimeAdapter` interface
- `dashboard/lib/runtime-adapters/slug.ts` — validator + builders (Phase 2 amends with `assertValidSlug` inside builders)
- `dashboard/lib/runtime-adapters/index.ts` — `ADAPTERS` stub registry (Phase 2 replaces stubs with real adapters)
- `.planning/phases/01-foundation/01-RESEARCH.md` — TypeScript signatures reference
- `.planning/phases/01-foundation/01-VERIFICATION.md` — VERIFICATION PASSED WITH DEBT; the two debt items are resolved in this phase (slug enforcement + v0.1 prefix)
- `.planning/phases/01-foundation/01-REVIEWS.md` — cross-AI review of Phase 1; consensus concerns informed Phase 2 decisions above

### External runtime docs (researcher will re-read)
- https://code.claude.com/docs/en/routines — Claude Routine deployment surface
- https://code.claude.com/docs/en/desktop-scheduled-tasks — SKILL.md contract
- https://developers.openai.com/codex/cli/reference — Codex CLI flags
- https://geminicli.com/docs/cli/headless — Gemini headless mode
- https://www.launchd.info — launchd plist + bootstrap/bootout reference

</canonical_refs>

<specifics>
## Specific Ideas

- The Codex auth probe should parse `~/.codex/config.toml` to detect which mode is active (subscription lines vs `OPENAI_API_KEY` env); see openai/codex#2733 and #3286 for the documented collision behavior.
- The Gemini adapter must set `GOOGLE_CLOUD_PROJECT` explicitly in the plist `EnvironmentVariables` block (per Phase 1 PITFALLS.md #3 and google-gemini/gemini-cli#12121).
- Every plist MUST set `StandardOutPath` and `StandardErrorPath` to `~/.sleepwalker/logs/<runtime>-<slug>.stdout` / `.stderr` — this is how the supervisor's audit writes get captured when launchd invokes it.
- Supervisor reads prompt via `cat <bundle-dir>/prompt.md`, NEVER via argv — per PITFALLS.md #4 shell-injection prevention.

</specifics>

<deferred>
## Deferred Ideas

- **Automated launchd smoke test in CI** — Real Mac integration testing requires a self-hosted runner. Phase 2 ships manual smoke test only; CI coverage deferred to a future phase or left OSS-community-driven.
- **Real tokenizer for char-budget** — Phase 2 stays with the v0.1 character/4 approximation. PROJECT.md explicitly marks a real tokenizer as out-of-scope anti-feature for v0.2.
- **Codex/Gemini rate-limit awareness in supervisor** — Supervisor does NOT parse CLI rate-limit responses or back off. If rate-limited, the run fails loudly in audit.jsonl and the user adjusts. Richer handling deferred.
- **Cross-runtime fan-out (one prompt → 4 runtimes)** — Explicitly out-of-scope per PROJECT.md.
- **Two-tier editor with Advanced/raw YAML mode** — Phase 3/6 concern, not Phase 2.

</deferred>

---

*Phase: 02-adapters*
*Context gathered: 2026-04-18 via `/gsd-discuss-phase 2`*
