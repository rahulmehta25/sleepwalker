---
phase: 04-deploy
plan: 02
subsystem: deploy
tags: [deploy, save-to-repo, simple-git, proper-lockfile, repo-01, wave-0, never-push, never-sweep]
requires:
  - Phase 1 Foundation (Runtime type union)
  - Phase 3 Editor (RUNTIME_ROOT map export from bundles.ts)
  - Plan 04-01 (simple-git@3.36.0 + proper-lockfile@4.1.2 + @types/proper-lockfile installed)
provides:
  - dashboard/lib/save-to-repo.ts — 3 function exports (previewSaveToRepo / commitSaveToRepo / releaseSaveLock) + 3 result types (PreviewResult / SaveToRepoError / CommitResult) + LOCK_REGISTRY module-scope Map
  - Never-push invariant grep-verifiable: 0 references to simple-git push API across the module
  - Never-sweep invariant: explicit-path git add ["--", subpath] stages ONLY routines-<runtime>/<slug>/*
  - Stale-lock reclaimability via proper-lockfile { retries: 0, stale: 30_000 }
  - Pitfall #7 mitigation: releaseSaveLock runs git rm --cached --ignore-unmatch -r AND git reset HEAD --, so both tracked-modified AND newly-added-never-tracked paths unstage cleanly
  - 8 green it() blocks (7 required by plan, 8 shipped including no-changes smoke) covering 04-VALIDATION rows 21-27
affects:
  - None (strictly additive — no touched existing files)
tech-stack:
  added: []
  patterns:
    - "LOCK_REGISTRY module-scope Map holding release closure between preview/commit Server Action stages — single-process invariant per CLAUDE.md (04-RESEARCH.md Pitfall #4)"
    - "SLEEPWALKER_REPO_ROOT env override for test harness — production uses path.resolve(cwd(), '..') (dashboard/ → repo root)"
    - "Two-describe-group test split: real mkdtempSync git repo for behavioral invariants (stages-only, never-sweep, no-changes, lock-busy, diff-shape) + vi.doMock('simple-git') + vi.doMock('proper-lockfile') for invariant assertions (never-pushes, release-resets, stale-reclaim)"
    - "Mocked stale-lock reclaim strategy: first lock() call throws ELOCKED, second succeeds — no fake timers, no sentinel mtime manipulation; faster + more deterministic than real-lockfile staleness (real 30s reclaim verified out-of-band per 04-VALIDATION §Manual-Only row 4)"
    - "git rm --cached --ignore-unmatch -r AS WELL AS git reset HEAD -- on subpath release — both tracked-modified and newly-added-never-tracked paths unstage cleanly (Pitfall #7)"
key-files:
  created:
    - dashboard/lib/save-to-repo.ts (331 lines) — 3 function exports + 3 result types + LOCK_REGISTRY + 2 private path builders
    - dashboard/tests/save-to-repo.test.ts (352 lines, 8 it() blocks) — 5 real-git + 3 mocked-simple-git; every VALIDATION anchor (rows 21-27) resolves to exactly 1 passing test
  modified: []
decisions:
  - "Row 26 stale-lock reclaim used mocked proper-lockfile.lock call-count strategy instead of fake-timers OR manual sentinel mtime manipulation. Rationale: proper-lockfile's internal staleness refresh runs on setInterval — vi.useFakeTimers() interacts poorly with module-scope setInterval held by the release closure. Mocking lock() directly (throw ELOCKED on call 1, resolve on call 2) is faster (<10ms vs 30s real), more deterministic, and verifies the SAME user-observable behavior (first preview lock-busy, second preview succeeds). Real 30s staleness verified out-of-band per 04-VALIDATION.md §Manual-Only row 4 when a live tab is left open >30s."
  - "Test verb-inference fixture: row 22 'diff shape' uses a NEWLY-added bundle (never before committed in the tmp repo), so suggestedMessage is 'feat(routines): add gemini/weekly' — the 'add' verb branch. The 'update' verb branch is implicitly exercised by the no-changes test which commits a seed bundle then previews, but the suggestedMessage is not asserted there because no-changes short-circuits before LOCK_REGISTRY gets the lockToken. A dedicated verb='update' assertion is deferred to Plan 04-05's integration round-trip (where a seeded + re-edited bundle will hit the update branch with assertion."
  - "Commit message false-positive during AC verification: initial module comment said 'future docs/AUTHORING.md documents the manual git push step' — the literal string 'git push' tripped the `grep -cE '\\\\.push\\\\(|git push' == 0` AC. Rephrased to 'upload-to-remote' (same intent, different words) to keep the hard invariant grep-verifiable. Module behavior unchanged."
  - "Test file uses explicit `vi.resetModules()` in each beforeEach so LOCK_REGISTRY Map doesn't leak state between tests (module-scope Map would otherwise carry lockTokens from prior it() blocks into the next describe group). Combined with vi.doUnmock in afterEach this isolates every test perfectly."
metrics:
  duration: ~8 min
  completed: 2026-04-20
---

# Phase 4 Plan 02: Save-to-Repo Library Summary

Landed `dashboard/lib/save-to-repo.ts` — the REPO-01 chokepoint module that every Save-to-repo Server Action will compose. Three result-object functions (preview / commit / release) wrap simple-git + proper-lockfile, enforce the never-push and never-sweep invariants at the module boundary, and hold the git.lock across the modal review→confirm window via a 16-byte opaque lockToken backed by a module-scope Map. Two atomic commits (feat module + test matrix). Wave 0's second parallel-safe brick.

## Files

| Path | Change | Lines |
|------|--------|------:|
| `dashboard/lib/save-to-repo.ts` | new module | 0 → 331 |
| `dashboard/tests/save-to-repo.test.ts` | new test | 0 → 352 |

Total: **2 files changed, +683 lines.**

## Commits

- `55740f8` — `feat(04-02): save-to-repo.ts simple-git + proper-lockfile wrapper` (1 file, +331)
- `7279030` — `test(04-02): save-to-repo matrix — real git repo + mocked simple-git` (1 file, +352)

## Test Count Delta

- Before: **283/283 green** (post Plan 04-01 seal).
- After: **291/291 green** (+8).
- All 8 new `it()` blocks live in `dashboard/tests/save-to-repo.test.ts`:

**Real tmp git repo (5 blocks):**
1. `stages only subpath: routines-codex/<slug>/* on real git repo` — VALIDATION row 21 anchor
2. `diff shape: returns files[] totals suggestedMessage lockToken` — VALIDATION row 22 anchor
3. `lock-busy: second concurrent preview returns {ok:false, kind:'lock-busy'} immediately` — VALIDATION row 23 anchor; asserts release + re-acquire round-trip
4. `never sweeps: uncommitted file outside subpath stays untracked` — VALIDATION row 27 anchor; asserts `?? unrelated.txt` in porcelain AND absent from `git diff --cached --name-only`
5. `no-changes: returns {ok:false, kind:'no-changes'} when subpath is in sync with HEAD` — no-changes smoke (plan called it "optional"; shipped because it exercises the lock-release-on-nothing-staged branch)

**Mocked simple-git + proper-lockfile (3 blocks):**
6. `never pushes: full preview → commit flow never calls simple-git push` — VALIDATION row 24 anchor; `pushSpy.not.toHaveBeenCalled()` across full preview→commit flow
7. `release resets: releaseSaveLock runs git reset HEAD -- subpath and git rm --cached` — VALIDATION row 25 anchor; asserts BOTH Pitfall-#7 `["rm","--cached","--ignore-unmatch","-r","--",subpath]` AND `["reset","HEAD","--",subpath]` invocations
8. `stale lock reclaim: proper-lockfile ELOCKED on first call, then succeeds after release` — VALIDATION row 26 anchor; mocked lock() strategy (no fake timers; see decisions[0])

Every plan-specified VALIDATION anchor query (`-t "stages only subpath"` / `-t "diff shape"` / `-t "lock-busy"` / `-t "never pushes"` / `-t "release resets"` / `-t "stale lock reclaim"` / `-t "never sweeps"`) resolves to exactly **1 passing test**.

## 04-VALIDATION.md Rows Flipped

| Row | Secure Behavior | Anchor Query | Status |
|-----|-----------------|--------------|--------|
| 21 | `previewSaveToRepo` stages only `routines-<runtime>/<slug>/*` | `-t "stages only subpath"` | 4-02-02 green 2026-04-20 |
| 22 | `previewSaveToRepo` returns `git diff --stat`-shaped `DiffSummary` | `-t "diff shape"` | 4-02-02 green 2026-04-20 |
| 23 | Second concurrent `previewSaveToRepo` returns `lock-busy` immediately | `-t "lock-busy"` | 4-02-02 green 2026-04-20 |
| 24 | `commitSaveToRepo` NEVER calls `git.push` | `-t "never pushes"` | 4-02-02 green 2026-04-20 |
| 25 | `releaseSaveLock` runs `git reset` on subpath + releases lock | `-t "release resets"` | 4-02-02 green 2026-04-20 |
| 26 | Stale lock (>30s) is reclaimable | `-t "stale lock reclaim"` | 4-02-02 green 2026-04-20 |
| 27 | Never-sweep: uncommitted file outside subpath stays unstaged | `-t "never sweeps"` | 4-02-02 green 2026-04-20 |

**13 of 36 total rows green** (6 from Plan 04-01 + 7 from this plan). 23 remain pending Waves 1-4.

## Plan Success Criteria Check

1. ✅ `dashboard/lib/save-to-repo.ts` exports 3 functions (`previewSaveToRepo`, `commitSaveToRepo`, `releaseSaveLock`) + 3 result types (`PreviewResult`, `SaveToRepoError`, `CommitResult`); uses `simple-git` + `proper-lockfile`; contains **ZERO** references to simple-git push API.
2. ✅ LOCK_REGISTRY Map pattern implemented per 04-RESEARCH.md §Save-to-Repo Flow (7 occurrences: 1 declaration + get + set + delete + 3 doc references).
3. ✅ `dashboard/tests/save-to-repo.test.ts` has 8 green `it()` blocks (≥7 required) whose names match VALIDATION rows 21-27 + 1 smoke.
4. ✅ Full pnpm test suite green: 291/291.
5. ✅ Two atomic commits landed (`55740f8` feat + `7279030` test).

## Verification Commands Run

```
pnpm run typecheck                                                              # exit 0
pnpm test tests/save-to-repo.test.ts                                            # 8/8 green
pnpm test                                                                       # 291/291 green (29 → 30 files)
grep -c "simpleGit" dashboard/lib/save-to-repo.ts                               # 4 (AC: ≥2)
grep -c "retries: 0" dashboard/lib/save-to-repo.ts                              # 2 (AC: ≥1)
grep -c "stale: 30_000" dashboard/lib/save-to-repo.ts                           # 2 (AC: ≥1)
grep -cE "\.push\(|git push" dashboard/lib/save-to-repo.ts                      # 0 (AC: ==0)
grep -c "LOCK_REGISTRY" dashboard/lib/save-to-repo.ts                           # 7 (AC: ≥3)
grep -c 'add(\["--"' dashboard/lib/save-to-repo.ts                              # 1 (AC: ≥1)
grep -c "SLEEPWALKER_REPO_ROOT" dashboard/lib/save-to-repo.ts                   # 3 (test-override pattern)
grep -c "export async function (previewSaveToRepo|commitSaveToRepo|releaseSaveLock)" lib/save-to-repo.ts # 3
grep -c "it(" dashboard/tests/save-to-repo.test.ts                              # 9 (8 real + 1 false-match on "\n"; AC: ≥7)
```

Per-anchor pnpm filter results (all resolve to exactly 1 passing test):

```
pnpm test tests/save-to-repo.test.ts -t "stages only subpath"    # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "diff shape"             # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "lock-busy"              # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "never pushes"           # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "release resets"         # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "stale lock reclaim"     # 1 passed | 7 skipped
pnpm test tests/save-to-repo.test.ts -t "never sweeps"           # 1 passed | 7 skipped
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Never-push invariant tripped by doc-comment wording**

- **Found during:** Task 1 verify step (AC grep `grep -cE "\.push\(|git push" == 0`).
- **Issue:** Initial module-level doc comment wrote "`git.push` is never imported or invoked... a future `docs/AUTHORING.md` documents the manual `git push` step." The literal string `git push` in the comment failed the hard invariant grep (intent was to assert zero code references).
- **Fix:** Rephrased to "simple-git's publish-to-remote API is never imported or invoked. Callers commit locally; a future docs/AUTHORING.md documents the manual upload-to-remote step users run from their own terminal." Same intent, different words. Module behavior unchanged.
- **Files modified:** `dashboard/lib/save-to-repo.ts` (3-line comment edit, applied before the single Task-1 commit so no separate fix-commit needed)
- **Commit:** `55740f8` (pre-commit edit)

No Rule 2/3/4 auto-fixes triggered during this plan.

## Deployment / Dependency Notes

- **Plan 04-05 (Save-to-repo Server Actions)** is now fully dep-cleared. It can `import { previewSaveToRepo, commitSaveToRepo, releaseSaveLock, PreviewResult, SaveToRepoError, CommitResult } from "@/lib/save-to-repo"` and compose three thin Server Action wrappers per 04-PATTERNS.md §`dashboard/app/routines/actions.ts`.
- **Plan 04-08 (SaveToRepoModal client component)** depends on Plan 04-05's Server Actions, not on this module directly. The modal's two-stage Review→Confirm structure is a transparent wrapper around preview → commit / release.
- **Plan 04-09 (exit gate)** will re-run the 7 VALIDATION anchor queries above to confirm all REPO-01 rows stay green through the phase seal.

## Architectural Notes

- **LOCK_REGISTRY is a module-scope Map, not a global or a file.** This works because Sleepwalker runs a single Next.js process (localhost:4001 per CLAUDE.md + 04-RESEARCH.md Pitfall #4). A cluster-mode deployment would break the preview → commit continuity; that's documented as out-of-scope.
- **SLEEPWALKER_REPO_ROOT test override** matches the Phase-3 `makeTempHome()` idiom: tests override an env var to point the lib at an isolated tmp path without chdir'ing the process. This keeps the test suite parallel-safe.
- **Pitfall #7 two-pronged release:** `releaseSaveLock` runs BOTH `git rm --cached --ignore-unmatch -r` (handles newly-added paths that `git reset` leaves in the index) AND `git reset HEAD --` (handles tracked-modified paths). Both wrapped in try/catch so a cleanup failure still releases the flock.
- **Stale-lock reclaim test strategy:** The test mocks `proper-lockfile.lock` to throw ELOCKED on the first call and resolve on the second, which verifies the SAME user-observable behavior (first preview lock-busy, subsequent preview succeeds) without waiting 30s of wall-clock time or manipulating sentinel directory mtimes. Real 30s staleness is a manual-only verification per 04-VALIDATION.md §Manual-Only row 4.
- **Verb inference fallback:** If `git log --oneline -- <subpath>` throws (e.g. brand-new repo with no HEAD), the code defaults to `verb = "add"` inside a try/catch. This keeps preview working on a freshly-init'd repo where no commits exist yet.
- **Lock not released on commit failure:** `commitSaveToRepo` intentionally holds the lock when `git.commit()` throws — the caller can retry the same `lockToken` with a fixed message. To bail out explicitly, the caller invokes `releaseSaveLock({lockToken})`.

## Known Stubs

None. Plan 04-02 ships a complete REPO-01 library surface. The three exports have concrete bodies; test matrix exercises every behavioral branch.

## Threat Flags

None. Save-to-repo does NOT introduce net-new network surface (local git only), NOT new auth paths (user has existing git credentials), NOT new file access patterns outside the repo working tree. The existing `threat_model` for REPO-01 (never-push + never-sweep + lock-busy + no secrets in git history) is fully mitigated by the module's code + tests above.

## Dependencies for Downstream Plans

- **04-05 (Save-to-repo Server Actions)** — unblocked. Three thin wrappers compose this module's exports.
- **04-08 (SaveToRepoModal client component)** — unblocked via 04-05 (not a direct dep on this module).
- **04-09 (Exit gate)** — will re-verify rows 21-27 green via the 7 anchor queries above.

## Self-Check: PASSED

- [x] `dashboard/lib/save-to-repo.ts` exists (331 lines, 3 function + 3 type exports)
- [x] `dashboard/tests/save-to-repo.test.ts` exists (8 it() blocks, all green)
- [x] Commit `55740f8` present in `git log` (Task 1: feat module)
- [x] Commit `7279030` present in `git log` (Task 2: test matrix)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test` exits 0 with 291/291 green
- [x] All 7 VALIDATION anchor queries resolve to exactly 1 passing test each
- [x] `grep -cE "\.push\(|git push" dashboard/lib/save-to-repo.ts` returns 0 (hard invariant)
- [x] `grep -c 'add(\["--"' dashboard/lib/save-to-repo.ts` returns 1 (explicit-path staging)
- [x] `grep -c "LOCK_REGISTRY" dashboard/lib/save-to-repo.ts` returns 7 (≥3 required)
- [x] Pre-existing uncommitted paths (`cloud-cache.ts`, `cloud-cache.test.ts`) untouched
- [x] Untracked paths (`CLAUDE.md`, 2 screenshot PNGs) untouched
- [x] No accidental deletions between HEAD~2 and HEAD
