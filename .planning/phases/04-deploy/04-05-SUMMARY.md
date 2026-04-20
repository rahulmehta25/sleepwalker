---
phase: 04-deploy
plan: 05
subsystem: routines/actions — save-to-repo Server Actions
tags: [server-actions, save-to-repo, git, simple-git, integration-test]
requires:
  - 04-02 (dashboard/lib/save-to-repo.ts — previewSaveToRepo / commitSaveToRepo / releaseSaveLock)
  - 04-04 (dashboard/app/routines/actions.ts — "use server" module + Runtime import)
provides:
  - previewSaveToRepoAction (Server Action wrapping previewSaveToRepo)
  - commitSaveToRepoAction (Server Action wrapping commitSaveToRepo)
  - releaseSaveLockAction (Server Action wrapping releaseSaveLock)
  - PreviewActionResult (exported type alias = PreviewResult | SaveToRepoError)
affects:
  - 04-08 SaveToRepoModal (consumes the 3 Action exports)
tech-stack:
  added:
    - Integration test pattern: real mkdtempSync + git init + SLEEPWALKER_REPO_ROOT env override
  patterns:
    - Thin Server Action pass-through (no inline logic, no error transformation)
    - "Action" suffix to disambiguate Server Action name from identically-named lib export
key-files:
  created:
    - dashboard/tests/save-to-repo-action.test.ts (136 lines, 4 it() blocks)
  modified:
    - dashboard/app/routines/actions.ts (+71 lines appended — 3 Action exports + import block + doc comment)
decisions:
  - "Action suffix on Server Action exports (previewSaveToRepoAction) preserves the UI-SPEC-mandated lib names (previewSaveToRepo) while disambiguating client-side import sites. Alternative: alias-at-import in 04-08. Chose the suffix so grep discovery is trivial from the module perspective."
  - "No try/catch / error reshape in the wrapper. The lib already returns discriminated unions ({ok:true|false, kind}); any Server Action transformation would fork the error surface and make 04-02's test matrix non-authoritative."
  - "Real-git integration test (not mocked) for the wrapper. Rationale: the wrapper is 5 lines, so mocking the lib only verifies TypeScript plumbing. A real git round-trip proves the Server Action boundary does not mutate the lib's behavior — cheap coverage (~1.3s) for a never-push / never-sweep invariant check."
metrics:
  duration: "~3m (2026-04-20 01:31:38Z → 01:34:26Z)"
  tasks-completed: 2/2
  files-created: 1
  files-modified: 1
  test-delta: "+4 blocks (318 → 322 passing)"
  date-completed: 2026-04-20
---

# Phase 4 Plan 05: routines/actions.ts save-to-repo Server Action wrappers — Summary

**One-liner:** Appended 3 thin pass-through Server Actions (`previewSaveToRepoAction`, `commitSaveToRepoAction`, `releaseSaveLockAction`) to `dashboard/app/routines/actions.ts` and authored a 4-block real-git integration test that validates the wrapper boundary preserves Plan 04-02's never-push / never-sweep invariants.

## Objective (as planned)

Extend `dashboard/app/routines/actions.ts` (from Plan 04-04) with the three save-to-repo Server Action wrappers that the Plan 04-08 `SaveToRepoModal` client component will invoke. Keep them thin — all git logic stays in Plan 04-02's `dashboard/lib/save-to-repo.ts` — so the `"use server"` surface is auditable and the never-push invariant propagates unchanged from lib → action layer.

## Implementation

### Task 1 — Append 3 Server Action wrappers (commit `1ae5398`)

Appended 71 lines to the end of `dashboard/app/routines/actions.ts` after the 4 Plan 04-04 deploy-family actions. The new section contains:

1. **Import block** — `previewSaveToRepo`, `commitSaveToRepo`, `releaseSaveLock`, and types `PreviewResult`, `SaveToRepoError`, `CommitResult` from `@/lib/save-to-repo`. No import aliasing — the Action suffix on the wrapper names is the disambiguation.
2. **`PreviewActionResult` type alias** — `PreviewResult | SaveToRepoError`. Mirrors the lib's shape exactly so the UI's `result.ok` narrowing + `result.kind` switch works without an adapter layer.
3. **Three Server Actions**, each 5 lines of pure delegation:
   - `previewSaveToRepoAction({runtime, slug})` → `previewSaveToRepo(runtime, slug)`
   - `commitSaveToRepoAction({lockToken, message})` → `commitSaveToRepo(args)`
   - `releaseSaveLockAction({lockToken})` → `releaseSaveLock(args)`

File now exposes **7 total Server Actions** — 4 deploy-family (`deployRoutine`, `getDeployState`, `runNowRoutine`, `setRoutineEnabled`) + 3 save-to-repo. `pnpm run typecheck` exits 0. `Runtime` type was already imported at line 59 (Plan 04-04) — reused verbatim per plan instruction.

### Task 2 — Author real-git integration test (commit `659ef16`)

Created `dashboard/tests/save-to-repo-action.test.ts` (136 lines, 4 `it()` blocks) validating the Server Action boundary against a real `mkdtempSync` git repo:

1. **`preview action returns ok with lockToken on a real repo`** — invokes `previewSaveToRepoAction({runtime:"codex", slug:"x"})`, asserts `result.ok && lockToken matches /^[0-9a-f]{32}$/ && files.length > 0`.
2. **`preview -> commit round-trip produces a real git commit`** — preview then `commitSaveToRepoAction({lockToken, message:"feat(routines): add codex/x"})`, asserts `sha matches /^[0-9a-f]{7,40}$/`, `shortSha.length === 7`, and `git log --oneline -1` in the tmp repo contains the commit message.
3. **`preview -> release -> preview: lock is released`** — preview, then `releaseSaveLockAction({lockToken})`, then modify `prompt.md` and re-preview; asserts the second preview succeeds (proves flock was actually freed).
4. **`second preview without release returns lock-busy`** — two back-to-back previews without a release between them; asserts second call returns `{ok:false, kind:"lock-busy"}`.

Scaffold reuses the pattern from Plan 04-02's `tests/save-to-repo.test.ts` (real `mkdtempSync` repo, `git init -q`, `SLEEPWALKER_REPO_ROOT` env override). `makeTempHome()` isolates `~/.sleepwalker/git.lock.sentinel` per block. `afterEach` restores env + `fs.rmSync(tmpRepo)`.

## Suite Count Delta

| Metric            | Before | After | Delta |
| ----------------- | ------ | ----- | ----- |
| Test files        | 34     | 35    | +1    |
| Passing tests     | 318    | 322   | +4    |
| Failing tests     | 0      | 0     | 0     |
| Typecheck         | pass   | pass  | —     |

## Commits

| Task | Commit    | Message                                                                        |
| ---- | --------- | ------------------------------------------------------------------------------ |
| 1    | `1ae5398` | `feat(04-05): save-to-repo Server Action wrappers (preview/commit/releaseLock)` |
| 2    | `659ef16` | `test(04-05): save-to-repo Server Action round-trip integration (4 it blocks)` |

## Never-push / Never-sweep Invariant Propagation — Confirmed

The three Server Actions are pure pass-throughs — zero inline git logic, zero error transformation, zero call to `simple-git` or `execFile`. They dispatch directly to `@/lib/save-to-repo`, which owns all the git surface:

- **Never-push**: `dashboard/lib/save-to-repo.ts` does not import or invoke `git.push` (verified in Plan 04-02 line 200-245 mocked test `"never pushes: full preview → commit flow never calls simple-git push"`). The Server Action layer cannot bypass this because it holds no `simpleGit` instance of its own — only the lib does. `grep -n "git\." dashboard/app/routines/actions.ts` returns no call sites below the new section.
- **Never-sweep**: Plan 04-02's `git.add(["--", subpath])` is the only staging path through the lib. The Action wrapper does not mutate the index; Plan 04-02's test `"never sweeps: uncommitted file outside subpath stays untracked"` (lib-level row in 04-VALIDATION) holds transitively.

The new integration test Block 2 (`preview -> commit round-trip`) exercises the full path end-to-end in a real git repo and verifies a clean `git log` entry lands. No `git remote -v` (none configured in tmp repo), no `git push` call site; the structural never-push invariant is machine-verifiable.

## Deviations from Plan

None — plan executed exactly as written.

- Task 1 implementation matches the plan's proposed code block verbatim (7 imports, 1 type alias, 3 Action exports).
- Task 2 test file matches the plan's proposed scaffold; one minor doc comment inside Block 3 was added inline to explain the prompt.md edit (noted in the plan's behavior section but not present in the scaffold snippet — additive doc, not a behavioral deviation).
- No auth gates, no checkpoints, no out-of-scope work triggered.

## Self-Check: PASSED

- `dashboard/app/routines/actions.ts` exists with 3 new Action-suffixed exports (`grep` confirms line 902/915/927).
- `dashboard/tests/save-to-repo-action.test.ts` exists with 4 `it()` blocks and 12 `previewSaveToRepoAction` references.
- Commits `1ae5398` and `659ef16` both present in `git log`.
- Full suite 322/322 green, typecheck exits 0.
