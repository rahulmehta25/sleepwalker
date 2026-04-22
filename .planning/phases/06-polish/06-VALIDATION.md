---
phase: 6
slug: polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1 (dashboard) + bash harness (hooks/tests + tests/compat) |
| **Config file** | `dashboard/vitest.config.ts` + `hooks/tests/run-tests.sh` |
| **Quick run command** | `cd dashboard && pnpm test -- --run <file>` OR `bash tests/compat/<script>.sh` |
| **Full suite command** | `cd dashboard && pnpm test --run && bash hooks/tests/run-tests.sh && bash hooks/tests/supervisor-tests.sh && bash tests/compat/v01-routines.sh && bash tests/compat/frozen-surface.sh` |
| **Estimated runtime** | ~45 seconds (Vitest ~15s + bash harness ~10s + compat ~20s) |

---

## Sampling Rate

- **After every task commit:** Run quick command for the affected file
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-* | 01 DOCS-01 | 1 | DOCS-01 | manual-doc | `test -f docs/AUTHORING.md && wc -l docs/AUTHORING.md` | ❌ W0 | ⬜ pending |
| 06-02-* | 02 DOCS-02 | 1 | DOCS-02 | integration | `node -e "const m=require('gray-matter');['claude-routines','claude-desktop','codex','gemini'].forEach(r=>m.read('templates/routine-'+r+'.md'))"` | ❌ W0 | ⬜ pending |
| 06-03-* | 03 DOCS-03 | 2 | DOCS-03 | unit + manual | `cd dashboard && pnpm test -- --run diagnostics` + visit `/diagnostics` | ❌ W0 | ⬜ pending |
| 06-04-* | 04 COMP-01 | 3 | COMP-01 | integration | `bash tests/compat/v01-routines.sh && cd dashboard && pnpm test -- --run v01-queue-integration` | ❌ W0 | ⬜ pending |
| 06-05-* | 05 COMP-02 | 3 | COMP-02 | integration | `bash tests/compat/frozen-surface.sh` | ❌ W0 | ⬜ pending |
| 06-06-* | 06 CI   | 4 | DOCS/COMP support | integration | Push to branch → GitHub Actions green on `ci.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/compat/` directory (new) — home for v01-routines.sh + frozen-surface.sh
- [ ] `dashboard/tests/v01-queue-integration.test.ts` (new Vitest file) — seeds temp queue.jsonl with 14 v0.1 entries
- [ ] `dashboard/tests/diagnostics.test.ts` (new Vitest file) — unit-tests fail-soft probe wrappers
- [ ] `.github/workflows/ci.yml` (new) — macOS runner job
- [ ] No new test framework needed — Vitest + bash already present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AUTHORING.md reads well end-to-end | DOCS-01 | Content quality is subjective | Read top-to-bottom; every internal link resolves; all error strings in §6 map to real landmines |
| `/diagnostics` page renders on Intel + arm64 | DOCS-03 | Requires two different Macs | Boot dashboard on each arch; visit `/diagnostics`; verify `uname -m` row shows correct arch, `brew --prefix` differs |
| 10-minute clone-to-routine walkthrough | DOCS-01 | End-to-end user experience | Fresh Mac → `git clone` → `./install.sh` → `/editor` → author one routine of each runtime → confirm queue entry appears within 10 minutes wall clock |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies documented
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/compat/`, new Vitest files, `.github/workflows/ci.yml`)
- [ ] No watch-mode flags — all Vitest runs use `--run`
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 completes

**Approval:** pending
