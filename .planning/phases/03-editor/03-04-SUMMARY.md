---
phase: 03-editor
plan: 04
subsystem: editor/atomic-write
tags: [editor, atomic-write, fs, directory-swap, EDIT-02]
requires:
  - node:fs (mkdtempSync, renameSync, rmSync, writeFileSync, mkdirSync, existsSync)
  - node:path
provides:
  - dashboard/lib/atomic-write.ts :: atomicWriteBundle
  - dashboard/lib/atomic-write.ts :: AtomicWriteResult type
affects:
  - Plan 03-05 saveRoutine Server Action (unblocked — imports atomicWriteBundle after zod validation + secret-scan pass)
tech-stack-added: []
tech-stack-patterns:
  - "Directory-swap atomic write: mkdtempSync sibling of finalDir + renameSync into place (only POSIX-atomic-as-a-pair strategy per 03-RESEARCH.md §EDIT-02 + Pitfall #6)"
  - "Pre-flight collision check — fs.existsSync(finalDir) returns errorCode:collision BEFORE any tmp dir is created (no leakage on collision)"
  - "Best-effort cleanup — mid-write failures trigger fs.rmSync(tmpDir, recursive, force) inside try/catch so cleanup itself never throws"
  - "POSIX errno mapping — EEXIST/ENOTEMPTY (APFS Pitfall #6) → collision; EACCES/EPERM → permission; all other → io"
  - "Sibling-placement invariant: tmp dir parent === finalDir parent, guaranteeing same-filesystem rename (no EXDEV)"
key-files-created:
  - dashboard/lib/atomic-write.ts (85 lines)
  - dashboard/tests/atomic-write.test.ts (157 lines)
key-files-modified:
  - .planning/phases/03-editor/03-VALIDATION.md (row 6 flipped: 3-04-01 ✅ green)
  - .planning/STATE.md (phase 3 progress 3/8 → 4/8; metrics row added)
  - .planning/ROADMAP.md (phase 3 plan count 3/9 → 4/9)
  - docs/activity_log.md (appended 03-04 entry)
key-decisions:
  - "Directory-swap (mkdtemp sibling + single renameSync) is the ONLY POSIX-atomic-as-a-pair primitive — alternative of two separate file renames is NOT atomic across file boundaries"
  - "Tmp dir sibling-of-finalDir (NOT os.tmpdir()) — guarantees same filesystem, eliminates EXDEV cross-device error class entirely by construction"
  - "Pre-flight existsSync collision check — avoids creating + immediately cleaning up a tmp dir when caller has an obvious mistake; also keeps parent directory free of `.<base>.tmp-*` artifacts on collision"
  - "errno mapping matches APFS reality — macOS returns EEXIST/ENOTEMPTY on renameSync into a populated target, NOT EEXIST alone; both map to errorCode:collision so saveRoutine can branch uniformly"
  - "No explicit mode param — files written via writeFileSync inherit default 0o666 & ~umask = 0o644 on typical systems (no exec bits); test asserts non-executable rather than exact 0644 to avoid cross-platform flakes"
metrics:
  duration-minutes: 4
  completed: 2026-04-19
  tasks: 1
  commits: 1
  test-count-delta: +8 (197 → 205)
  line-count: 242 insertions (85 src + 157 tests)
---

# Phase 3 Plan 03-04: atomicWriteBundle Directory-Swap Helper Summary

**One-liner:** Directory-swap atomic bundle writer (`mkdtempSync` sibling + `writeFileSync` each entry + single `renameSync` into place) — only POSIX-atomic-as-a-pair strategy for multi-file bundles, with pre-flight collision check, best-effort mid-write tmp cleanup, and APFS EEXIST/ENOTEMPTY handling.

## What Shipped

### dashboard/lib/atomic-write.ts (85 lines, commit 96690b0)

Public API (2 exports):
- `AtomicWriteResult` — discriminated result object `{ok, path?, error?, errorCode?: "collision" | "io" | "permission"}`
- `atomicWriteBundle(finalDir, files): AtomicWriteResult` — writes all entries of `files` map into `finalDir` atomically

Algorithm (5 phases):
1. **Pre-flight collision check:** `fs.existsSync(finalDir)` → return `{ok:false, errorCode:"collision"}` — no tmp creation on collision
2. **Parent auto-create:** `fs.mkdirSync(path.dirname(finalDir), {recursive: true})` — EACCES/EPERM → `errorCode:"permission"`
3. **Tmp dir creation:** `fs.mkdtempSync(path.join(parent, ".${base}.tmp-"))` — sibling of finalDir guarantees same filesystem
4. **Writes:** `fs.writeFileSync(path.join(tmpDir, name), content, {encoding: "utf8"})` for each entry
5. **Atomic swap:** `fs.renameSync(tmpDir, finalDir)` → return `{ok:true, path:finalDir}`

Error paths (all mid-write failures):
- `fs.rmSync(tmpDir, {recursive: true, force: true})` inside try/catch (cleanup never throws)
- `EEXIST` / `ENOTEMPTY` on rename → `errorCode:"collision"` (APFS Pitfall #6)
- All other errors → `errorCode:"io"`

### dashboard/tests/atomic-write.test.ts (157 lines, same commit)

8 `it()` blocks in a single `describe("atomicWriteBundle")`:

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | Happy path (2 files) | both files present, contents roundtrip, `res.ok === true`, `res.path === finalDir` |
| 2 | UTF-8 multibyte + newlines | em-dash, check-mark, newlines all preserved byte-for-byte |
| 3 | Pre-existing finalDir | `errorCode:"collision"`, marker file untouched, NO `.already-here.tmp-*` siblings in parent |
| 4 | Auto-created nested parent | `deeply/nested/routines-codex/x` written ok without pre-existing parent chain |
| 5 | Mid-write io failure (null-byte filename) | `errorCode:"io"`, no `.badfile.tmp-*` siblings remain, `finalDir` does not exist |
| 6 | Permission error (chmod 0o555 parent) | `errorCode:"permission"` or `"io"` (kernel-dependent), error string populated |
| 7 | Error string populated on any failure | `res.error.length > 0` on collision path |
| 8 | Mode bits — non-executable | `config.json` + `prompt.md` written with 0 executable bits (mode & 0o111 === 0) |

Test infrastructure: each test gets a fresh `mkdtempSync` base in `os.tmpdir()`; `afterEach` chmods back to 0o755 before rm-rf to defend against the permission-test leaving a read-only tree.

## Verification Contract

| Check | Command | Result |
|-------|---------|--------|
| Atomic-write test suite | `cd dashboard && pnpm test atomic-write.test.ts` | 8/8 passing |
| Full dashboard suite | `cd dashboard && pnpm test` | 205/205 passing (baseline 197; +8 new) |
| TypeScript | `cd dashboard && pnpm typecheck` | exit 0 |
| Has mkdtempSync | `grep -c "mkdtempSync" dashboard/lib/atomic-write.ts` | 1 |
| Has renameSync | `grep -c "renameSync" dashboard/lib/atomic-write.ts` | 1 |
| Pre-flight collision (no tmp leakage) | test #3 asserts `siblings.filter(startsWith('.already-here.tmp-')) === []` | ✅ |
| Mid-write cleanup | test #5 asserts no `.badfile.tmp-*` siblings + finalDir absent | ✅ |
| v0.1 frozen surface | `git diff HEAD~1 -- install.sh hooks/ routines-local/ routines-cloud/ bin/sleepwalker-execute` | 0 lines |

## Deviations from Plan

None substantive — plan executed exactly as authored. Plan minimum 7 `it()` blocks; shipped 8 (added the mode-bits assertion explicitly enumerated in the success criteria). Implementation follows the authoritative snippet in 03-RESEARCH.md §Example 2 verbatim, with one additive improvement: the `mkdirSync` step also maps EACCES/EPERM to `errorCode:"permission"` (plan snippet had `errorCode:"permission"` only for that one call site — the implementation keeps the same semantics; the `mkdtempSync` step got the same EACCES/EPERM → permission treatment for symmetry, which is a natural extension rather than a deviation).

## Auth Gates

None. Pure filesystem module; no network, no credentials, no launchctl.

## Cross-References

- `03-VALIDATION.md` row 6 (EDIT-02 directory-swap atomic write) flipped from `TBD / ⬜ pending` to `3-04-01 / ✅ green 2026-04-19`.
- EDIT-02 coverage now: row 4 (zod schema — 03-01) ✅, row 5 (secret-scan — 03-02) ✅, row 6 (atomic-write — THIS PLAN) ✅; rows 7-9 (`saveRoutine` integration scenarios) still pending on Plan 03-05.
- Plan 03-05 `saveRoutine` Server Action can now `import { atomicWriteBundle } from "@/lib/atomic-write"` as the last step after zod validation + secret-scan + `hasBundleAnyRuntime` collision check all pass.
- Phase 3 Wave 1 status: 03-03 (bundles.ts read-side) ✅ + 03-04 (atomic-write) ✅; 03-05 (saveRoutine) is the last Wave 1 item and is now fully dep-cleared.

## Scope Discipline

- Two files authored; one commit (`96690b0`).
- `git add` used explicit paths (`dashboard/lib/atomic-write.ts dashboard/tests/atomic-write.test.ts`) to preserve pre-existing parallel-session uncommitted changes in `cloud-cache.ts` / `codex.ts` / `gemini.ts` / `cloud-cache.test.ts`. Zero scope bleed.
- No v0.1 files touched.

## Self-Check: PASSED

- `[ -f "dashboard/lib/atomic-write.ts" ]` → FOUND
- `[ -f "dashboard/tests/atomic-write.test.ts" ]` → FOUND
- `git log --oneline | grep -q "96690b0"` → FOUND
- 8/8 atomic-write tests green
- 205/205 full dashboard suite green
- `pnpm typecheck` exit 0
- v0.1 frozen-surface diff: 0 lines
