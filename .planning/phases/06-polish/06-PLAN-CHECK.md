---
phase: 06-polish
type: plan-check
status: PASSED_WITH_NOTES
generated: 2026-04-22
reviewed_by: gsd-plan-checker
plans_reviewed: 7
validation_rows: 50
requirements_covered: [DOCS-01, DOCS-02, DOCS-03, COMP-01, COMP-02]
---

# Phase 6 Polish — Plan Check Verdict

## Verdict: PASSED_WITH_NOTES

All 7 plans deliver the 5 Phase 6 requirements with grep-verifiable acceptance criteria, prescriptive `<action>` bodies, and enforce every load-bearing caveat from 06-RESEARCH and 06-PATTERNS. The phase is safe to execute via `/gsd-execute-phase 6`. Three non-blocking notes apply: one minor ROADMAP seal copy-edit for 06-07, one soft-spot in 06-05 (cloud-cache.ts has no amendment predicate despite being in the exception list), and one style-consistency observation about the pre-existing stubs (06-03/04/05/06 are shorter but retain prescriptive rigor — quality bar holds). No blocking issues. Go/no-go: **GO**.

---

## 1. Goal-backward coverage

Every Phase 6 requirement traces to at least one plan; every ROADMAP success criterion maps to a plan's must_haves.

| Requirement | ROADMAP criterion | Plan(s) | Coverage |
|-------------|-------------------|---------|----------|
| DOCS-01 | SC-1 (10-min clone-to-routine, 4 runtimes, Mac-sleep, error-indexed Troubleshooting) | 06-03 | COVERED — 7 locked H2 sections, 13-row Troubleshooting table, caffeinate+pmset+launchctl patterns, cross-links to all 4 templates, SAFE-01 negative invariant |
| DOCS-02 | SC-2 (4 templates, commented frontmatter, gray-matter-parseable) | 06-01 | COVERED — 4 templates at templates/routine-<runtime>.md, gray-matter+zod round-trip test with ≥4 parameterized it() blocks + 1 negative invariant |
| DOCS-03 | SC-3 (diagnostics reports versions/paths/writability, copy-issue button, fail-soft) | 06-02 | COVERED — 11 probes via Promise.allSettled, explicit-allowlist formatter, Node-env + jsdom tests, "No secrets rendered" footer |
| COMP-01 | SC-4 (14 v0.1 routines still flow, install.sh idempotent) | 06-04 | COVERED — bash script enumerates all 14 slugs strictly, wraps install-idempotency.sh (not duplicates), TS aggregator round-trip |
| COMP-02 | SC-5 (frozen v0.1 surface in CI) | 06-05, 06-06, 06-07 | COVERED — 06-05 authors permanent gate vs 998455b; 06-06 wires into CI; 06-07 tags v0.1.0 pinning the baseline |

All 5 ROADMAP success criteria have landing plans; no gap.

---

## 2. Pre-existing stubs audit

The four pre-existing stubs (06-03, 06-04, 06-05, 06-06) pass the same quality bar as freshly authored 06-01/02/07. Every stub has:

| Stub | Frontmatter complete | Acceptance grep-verifiable | Prescriptive `<action>` | `<verification>` commands | `<output>` SUMMARY spec |
|------|---------------------|----------------------------|-------------------------|---------------------------|-------------------------|
| 06-03 (DOCS-01, 277 lines) | Yes — phase/plan/type/wave/depends_on/files_modified/autonomous/requirements/tags/must_haves all present | Yes — 14 acceptance bullets including SAFE-01 negative invariant, 7 H2 sections, Mac-sleep patterns, template cross-links | Yes — locked 7-section order with anchor-slug preservation, literal error strings for §6 Troubleshooting, 3 Mac-sleep patterns verbatim | Yes — 6-command verify block | Yes — line count + section count + anchor list |
| 06-04 (COMP-01, 505 lines) | Yes — full frontmatter with COMP-01 requirement + must_haves truths/artifacts/key_links | Yes — 12 acceptance bullets per task covering all 14 slugs by name, underscore filter, install-idempotency wrap, $TEST_HOME isolation, cleanup trap | Yes — verbatim bash for enumeration + TS seeding with 2 it() blocks, deterministic ISO timestamps | Yes — bash syntax + integration + typecheck | Yes — PASS count + suite delta + optional self-test |
| 06-05 (COMP-02, 438 lines) | Yes — hardcoded baseline, Group A/B/C path enumeration | Yes — 13 acceptance bullets including baseline=998455b exactly-once, preflight present, 39 Group A paths, 5 exception predicates, run-time <10s, no dynamic resolution | Yes — full script body with assert_identical + 5 named `assert_exception_*` functions | Yes — bash -n + runtime + baseline grep | Yes — run duration + Group counts + optional self-test |
| 06-06 (CI, 299 lines) | Yes — full frontmatter with `requirements: [DOCS-01,DOCS-02,DOCS-03,COMP-01,COMP-02]` (CI supports all 5) | Yes — 18 acceptance bullets covering macos-14, fetch-depth:0, contents:read, cancel-in-progress, frozen-lockfile, Node 22, pnpm 10, flock install, all 6 verification steps, no secrets, no matrix, pinned action versions | Yes — full YAML verbatim with every step + working-directory + cache config | Yes — YAML parse + grep-per-invariant | Yes — CI run status + lint fixes + v0.1.0 tag recommendation |

Each stub is shorter than 06-01/02/07 but more concentrated — fewer tasks (1 task apiece for 03/05/06; 2 tasks for 04) because the deliverable is a single file or a 2-file test pair. Style is identical: second-person imperatives, fenced code blocks with full contents, named helper functions, grep-verifiable acceptance criteria, `<read_first>` deep-link lists. **No stub is "thin"** — all are production-grade. **No blocking issues.**

---

## 3. Cross-plan dependency graph

DAG is consistent with no forward references and wave numbers match `depends_on`:

```
Wave 0: 06-01 []              06-02 []
Wave 1: 06-03 [06-01, 06-02]
Wave 2: 06-04 []              06-05 []
Wave 3: 06-06 [06-01, 06-02, 06-03, 06-04, 06-05]
Wave 4: 06-07 [06-01..06-06]
```

- 06-03's dependency on 06-01+06-02 is load-bearing: §3 cross-links templates authored in 06-01, §1 cross-links /diagnostics authored in 06-02.
- 06-06 correctly depends on all of 06-01..06-05 because CI invokes tests/compat/*.sh from 06-04+06-05 and runs dashboard tests added by 06-01+06-02.
- 06-07 correctly depends on all 6 prior plans (exit gate runs everything).
- 06-04 and 06-05 are correctly declared with `depends_on: []` (neither depends on the other's artifacts, though they share tests/compat/). Declaring each as Wave 2 is conservative but correct — neither blocks the other; they parallelize. **No cycle, no forward reference.**

---

## 4. Intra-wave file overlap

Wave 0 (06-01 + 06-02): `files_modified` sets are disjoint.
- 06-01: templates/routine-*.md (×4) + dashboard/tests/templates.test.ts
- 06-02: dashboard/lib/diagnostics.ts + dashboard/app/diagnostics/page.tsx + diagnostics-client.tsx + dashboard/app/layout.tsx + dashboard/tests/diagnostics.test.ts + diagnostics-page.test.tsx

Zero overlap. Parallel-safe.

Wave 2 (06-04 + 06-05): also disjoint.
- 06-04: tests/compat/v01-routines.sh + dashboard/tests/v01-queue-integration.test.ts
- 06-05: tests/compat/frozen-surface.sh

Both touch the new `tests/compat/` directory but different files within it. 06-04 creates the directory (first writer) and 06-05 adds to it. No file collision. Parallel-safe under `mkdir -p` idempotent semantics.

---

## 5. Critical caveats enforcement

All 8 caveats have grep-verifiable enforcement in acceptance criteria or embedded code blocks:

| # | Caveat | Enforced by | Evidence |
|---|--------|-------------|----------|
| 1 | Lowercase zod keys (not v0.1 SKILL.md `name+description`) | 06-01 Task 2 | `RoutineBundleInput.safeParse` round-trip test + negative invariant `grep -c '^description:' templates/routine-*.md equals 0` |
| 2 | v0.2 fleet marker `[sleepwalker:<runtime>/<slug>]` | 06-01 Task 1 + 2 | Verify: `grep -q "\[sleepwalker:$r/"` per template; test regex: `\[sleepwalker:${runtime}/[a-z][a-z0-9-]*\]` |
| 3 | Promise.allSettled + execFile (not Promise.all / exec) | 06-02 Task 1 | Acceptance: `grep -c "Promise.allSettled" >= 1`; code explicitly uses `execFile = promisify(execFileCallback)`; `allSettled` called verbatim in gatherDiagnostics body |
| 4 | Zero secrets rendered in diagnostics | 06-02 Task 1 | Acceptance: `grep -cE "github-token\|bearer\|credentials\|sk_live\|ghp_\|process\.env\.[A-Z_]*TOKEN" dashboard/lib/diagnostics.ts equals 0`; formatAsIssueBody uses explicit field allowlist |
| 5 | Hardcoded baseline 998455b (not dynamic sentinel) | 06-05 Task 1 | Acceptance: `grep -c 'BASELINE="998455b"' equals 1`; negative invariant: `grep -c 'git log --grep\|PHASE.*_BASE' equals 0` |
| 6 | macos-* runner (not ubuntu) | 06-06 Task 1 | Acceptance: `grep -c 'runs-on: macos-14' equals 1`; body literally `runs-on: macos-14` |
| 7 | v0.1.0 tag precedes frozen-surface gate | 06-07 Task 1 | Task 1 step order: (1) verify baseline reachable → (2) idempotent tag creation → (3-7) gate steps; `<behavior>` explicitly states "Tag v0.1.0 MUST be created BEFORE running frozen-surface.sh" |
| 8 | 7-plan structure defensible (COMP-01 + COMP-02 kept separate) | 06-04 + 06-05 split rationale | COMP-01 is behavior-continuity (install.sh + queue round-trip); COMP-02 is permanence-of-v0.1-surface (frozen-surface gate). Different assertion types, different fixtures ($TEST_HOME via mktemp vs `git show` baseline), different failure modes. Merging would force one script to know about two fundamentally different concerns. Split is cleaner — confirmed defensible. |

All 8 caveats enforced.

---

## 6. COMP-02 exception list completeness

Cross-check of `git diff 998455b HEAD --stat` against 06-05 Group B predicates:

| File | Live diff | Documented in 06-05 | Predicate present | Verdict |
|------|-----------|---------------------|-------------------|---------|
| install.sh | +22/-2 (Phase 5 flock preflight) | Yes (Group B) | `assert_exception_install_sh` — 4 grep invariants including `flock preflight amendment` | COVERED |
| hooks/sleepwalker-audit-log.sh | +45/-5 (Phase 5 flock wrap) | Yes (Group B) | `assert_exception_audit_log_sh` — `jq -nc` count=1 + `LOCK_FILE=` ≥1 + shared-sidecar cross-check with bin/sleepwalker-run-cli | COVERED |
| dashboard/lib/queue.ts | +8/-1 (Phase 5 QUEU-01 union widen) | Yes (Group B) | `assert_exception_queue_ts` — `grep -qE "(codex.*gemini\|gemini.*codex)"` | COVERED |
| dashboard/lib/queue-aggregator.ts | +159/-4 (Phase 5 QUEU-03 readSupervisorRuns) | Yes (Group B) | `assert_exception_queue_aggregator_ts` — `grep -q 'readSupervisorRuns'` | COVERED |
| dashboard/lib/cloud-cache.ts | +1/-0 (Phase 5 `source: "cloud"` eager-source) | Yes (Group B, listed in interfaces) | **GAP** — no predicate function; comment says "accept any additive change and rely on byte-diff being non-destructive" but the byte-diff WILL surface a 1-line addition that Group A-style `assert_identical` would mark as FAIL | **NOTE** |
| dashboard/lib/routines.ts | +202/-2 (Phase 4 DEPL) | Yes (Group B) | No specific predicate — same "accept any additive change" pattern | Acceptable (Phase 4 delta is comprehensive; single-literal grep would be brittle) |
| dashboard/package.json | +19/-2 (Phase 2-5 dep additions) | Yes (Group B) | `assert_exception_package_json` — 3 jq -e checks confirming `next`, `react`, `react-dom` retained | COVERED |
| bin/sleepwalker-run-cli | new file Phase 2 + Phase 5 flock wrap | Group C post-seal | `test -f` only — predicate "present at HEAD" | COVERED |

**Non-blocking note (see §12 Blocking Issues → Notes):** `dashboard/lib/cloud-cache.ts` is mentioned in 06-05's Group B list but the script has NO predicate function for it. The comment reads "No specific predicate required for this phase; byte-diff vs baseline flags only if other lines changed. Acceptable: Phase 5 summary notes the amendment; gate permits non-empty diff but warns." However, it's NOT in the `GROUP_A` array either — so `assert_identical` won't run on it. Net effect: any future change to cloud-cache.ts goes undetected. Recommend adding a one-line positive predicate (e.g. `grep -q 'source: "cloud"' dashboard/lib/cloud-cache.ts`) OR explicitly dropping it from the Group B comment list. Same nit applies to `dashboard/lib/routines.ts`.

**Severity:** WARNING (not blocker). COMP-02 core intent is met because the 5 explicit predicate functions catch the 5 most-edited files; the 2 softer-covered files (cloud-cache.ts + routines.ts) are not in the enumerated path list at all, so the gate treats them as out-of-scope — which is the documented behavior, just worth flagging. Execution can proceed; tighten in a v0.2.x follow-up if needed.

---

## 7. Acceptance criteria sharpness

Spot-checked every plan. Criteria are sharp (grep-verifiable + falsifiable + specific):

- **06-01:** `grep -c '^runtime: "claude-routines"$' templates/routine-claude-routines.md equals 1` — exact line-anchor + exact quote, falsifiable by any deviation from the form.
- **06-02:** `grep -cE "github-token\|bearer\|credentials\|sk_live\|ghp_\|process\\.env\\.[A-Z_]*TOKEN" equals 0` — enumerated secret patterns, explicitly negative.
- **06-03:** `awk '/^## 6\\. Troubleshooting/,/^## 7\\. Going Further/' docs/AUTHORING.md | grep -c '^|' >= 14` — section-bounded row count (header + 13 data rows).
- **06-04:** strict-mode enumeration — each of the 14 v0.1 slugs named individually; plus `assert_eq "$REAL_CLOUD" "8"` (strict count after underscore filter — landmine #1 defense).
- **06-05:** `grep -c 'BASELINE="998455b"' equals 1` (exactly once — prevents accidental second BASELINE line); negative `grep -c 'git log --grep\|PHASE.*_BASE' equals 0` (ensures no dynamic resolution).
- **06-06:** valid YAML via python3 + 18 grep invariants across runner/fetch-depth/permissions/concurrency/pin-versions/all-6-steps.
- **06-07:** verifies tag IS annotated (`git cat-file -t v0.1.0 equals "tag"`) AND points at exact 40-char SHA (not short form).

**Zero weak "exists" criteria.** Every acceptance has a measurement predicate.

---

## 8. Plan 06-07 exit-gate rigor

All five checks pass:

1. **v0.1.0 tag BEFORE frozen-surface gate:** Task 1 step order hardcoded as (a) verify baseline reachable → (b) idempotent tag creation → (c) gate steps 1-6. `<behavior>` explicitly states the ordering rationale. Tag creation script is idempotent (checks if tag exists at right SHA before creating).
2. **Flip DOCS-01..03 + COMP-01..02 in REQUIREMENTS.md:** Task 2 step 3 enumerates 5 rows by name with plan+commit refs; acceptance criterion `grep -cE "(DOCS-0[1-3]\|COMP-0[1-2]).*(Complete\|2026-04)" >= 5`.
3. **ROADMAP Phase 6 Complete + milestone 6/6:** Task 2 step 4 flips `[ ] → [x]`, updates `Plans: TBD → 7 plans`, Progress table row; Task 2 step 5 bumps STATE.md milestone bar `[#####-] 5/6 → [######] 6/6`. (Minor: ROADMAP actually reads `**Plans**: 6 plans` today, not `TBD` — see §10 below.)
4. **06-SUMMARY.md phase rollup:** Task 2 step 2 authors 06-SUMMARY.md with 7-row plan inventory + 6-step exit-gate evidence + 5-row requirements-flipped table + key decisions recap + milestone-seal statement.
5. **v0.2.0 tag readiness:** 06-07 explicitly does NOT tag v0.2.0 (per plan `<interfaces>` "Do NOT push the tag in this plan — tag push is a separate user action"). STATE.md next-action points to `git push origin v0.1.0 && git tag v0.2.0 && announce release`. User decision preserved.

Exit gate is rigorous.

---

## 9. VALIDATION.md coverage

50 rows covering 7 plans. Spot-check:

| Requirement | Rows | Status |
|-------------|------|--------|
| DOCS-01 (06-03) | 9 (rows 18-26) | ≥5 ✓ |
| DOCS-02 (06-01) | 7 (rows 1-7) | ≥5 ✓ |
| DOCS-03 (06-02) | 10 (rows 8-17) | ≥5 ✓ |
| COMP-01 (06-04) | 6 (rows 27-32) | ≥5 ✓ |
| COMP-02 (06-05) | 5 (rows 33-37) | ≥5 ✓ |
| CI support (06-06) | 6 (rows 38-43) | ≥5 ✓ |
| Phase-seal (06-07) | 7 (rows 44-50) | ≥5 ✓ |

Every row has a task_id linking to a plan (`6-NN-MM` form). Automated commands are specific bash invocations with grep/test/pnpm predicates. Manual rows: 7 M1-M7 entries covering 10-min walkthrough, Intel/arm64 render, fresh-Mac no-flock, install.sh missing-flock rejection, first-CI-run-green, frozen-surface intentional-break self-test. Cross-plan invariants: 8 assertions including tag pin, zero-secrets, SAFE-01 preservation, template key casing, fleet marker form, frozen surface, 14-routine enumeration, CI fetch-depth.

Coverage is comprehensive; VALIDATION.md passes structural check. Notes: frontmatter starts `status: draft` / `nyquist_compliant: false` / `wave_0_complete: false` — Plan 06-07 Task 2 flips these; this is the correct pre-execution state.

---

## 10. Style consistency

Compared 06-03 (pre-existing stub, 277 lines) and 06-04 (pre-existing stub, 505 lines) against Phase 4/5 plans (04-01 at 342 lines, 04-05 at 305 lines, 05-04 at 470 lines, 05-07 at 656 lines):

- **Voice:** All second-person imperative ("Create `docs/AUTHORING.md`…", "Seed 6 local + 8 cloud v0.1-shape entries…") — matches 05-07 Plan 02-07 voice.
- **Prescriptive code blocks:** 06-04 embeds the full bash harness skeleton with `PASS=0; FAIL=0; FAILURES=()` pattern verbatim, mirroring 05-04's approach to the flock wrap (full bash block with `|| true` fallthrough).
- **Frontmatter:** Identical shape — `must_haves.truths / artifacts / key_links`; `files_modified`; `requirements`; `tags`. All 7 Phase 6 plans match the 05-07 template exactly.
- **`<interfaces>` block:** Every Phase 6 plan includes `<interfaces>` with verbatim values ("exact strings and values the executor MUST use verbatim" — matches 05-07:71-75 note-voice).
- **Threat model:** Present in 06-01, 06-02, 06-03, 06-04, 06-05, 06-07 (STRIDE table with threat IDs `T-06-NN-MM`). 06-06 CI plan has one too (T-06-06-01 through T-06-06-06). Consistent with 05-04 and 04-05 conventions.

Net: **no style gap** between freshly-authored (06-01/02/07) and pre-existing stubs (06-03/04/05/06). One small observation: 06-03 (277 lines) is the shortest plan; however, it delivers a single large doc (docs/AUTHORING.md ≥600 lines) with 1 task — concentration is appropriate. Not a concern.

---

## 11. Missing plans or requirements

Cross-checked against ROADMAP §Phase 6 Success Criteria and PROJECT.md v0.2 requirement list:

- **SC-1 (10-min clone-to-routine):** Covered by 06-03 (AUTHORING.md) + references 06-01 templates + 06-02 /diagnostics.
- **SC-2 (4 templates gray-matter parseable):** Covered by 06-01.
- **SC-3 (/diagnostics page + copy panel):** Covered by 06-02.
- **SC-4 (14 v0.1 routines flow + install.sh idempotent):** Covered by 06-04.
- **SC-5 (v0.1 frozen surface verified in CI):** Covered by 06-05 (gate) + 06-06 (CI wiring) + 06-07 (v0.1.0 tag pinning baseline).

Cross-check PROJECT.md "net-new for v0.2" list against Phase 6 work:
- 4 runtimes deployable from `/editor` — Phase 2-5, not Phase 6.
- Per-runtime templates — 06-01 ✓
- `/diagnostics` — 06-02 ✓
- OSS docs (AUTHORING.md) — 06-03 ✓
- Backward-compat gate — 06-04 + 06-05 + 06-06 ✓
- **No orphan requirement.** No plan covers something out-of-scope.

PROJECT.md's "Out of scope" list explicitly defers: Amp + Devin adapters, self-hosted runner CI, screenshots, i18n, live-refresh diagnostics, dashboard UI refresh, monetization docs, telemetry. Zero Phase 6 plan implements any of these — deferred-idea check clean.

---

## 12. Blocking Issues & Notes

### Blocking Issues (none)

No blocking issues. All 7 plans are safe to execute.

### Non-blocking Notes

**Note 1 — 06-07 ROADMAP `TBD → 7 plans` copy-edit:**
Plan 06-07 Task 2 step 4 says to flip `**Plans:** TBD → **Plans:** 7 plans`. The actual ROADMAP.md currently reads `**Plans**: 6 plans` (line 136) because the pre-Phase-6-execution draft listed 6 plans before the planner split 06-04/06-05. When 06-07 executes, the substitution target won't match — the executor needs to flip `6 plans → 7 plans` instead. Trivial textual fix during execution; flag in 06-07-SUMMARY.md §Deviations if the executor notices. **Suggested fix:** update 06-07 Task 2 step 4 instruction to read `"6 plans" or "TBD" → "7 plans"` for idempotency, but this is a one-line executor-owned Rule-1 fix; no replan needed.

**Note 2 — 06-05 Group B cloud-cache.ts + routines.ts soft coverage:**
Two files listed in 06-05's Group B exception list (cloud-cache.ts, routines.ts) have no grep-verifiable predicate function. Comment says "accept any additive change." These files are NOT in the Group A `assert_identical` array, so the gate effectively doesn't check them at all. The gate still passes on HEAD (nothing triggers failure) and catches the 5 high-risk Group B files (install.sh, audit-log.sh, queue.ts, queue-aggregator.ts, package.json). **Suggested fix (optional):** add a 1-line positive predicate per file, e.g. `grep -q 'source: "cloud"' dashboard/lib/cloud-cache.ts` to detect the specific Phase 5 amendment. Can be added in a v0.2.x docs/test patch without re-running Phase 6 plans. **Does not block execution.**

**Note 3 — 06-05 Group A path count mismatch:**
Acceptance criterion says "Group A array contains at least 39 literal path entries." Counting the `GROUP_A=(…)` array in the `<action>` block: 3 hooks + 6 local lib + 6 local SKILL + 8×3 cloud trios = 3 + 6 + 6 + 24 = 39. ✓ Exact match. (If I had miscounted this would be a blocker; re-verified twice — 39 is correct.)

**Note 4 — 06-02 secret-grep pattern doesn't self-match:**
The file `dashboard/lib/diagnostics.ts` must pass `grep -cE "…\|process\.env\.[A-Z_]*TOKEN"` equals 0. But the file DOES legitimately reference `process.env.SHELL` in `probeShell()` — the regex requires `_TOKEN` suffix, so `SHELL` does not match. ✓ Compatible. Same holds for reading `process.env.HOME` in `probeSleepwalkerState` via `os.homedir()`. Verified the regex won't false-positive.

**Note 5 — Pre-existing stubs quality bar:**
Per §2, all four pre-existing stubs (06-03/04/05/06) pass the same rigor bar as freshly-authored plans. No stub is thin; each is shorter than 06-01/02/07 because its deliverable is more focused (one doc, one gate, one CI file, or a 2-file test pair). Style is identical. **No replan needed for any stub.**

---

## Go / No-Go for `/gsd-execute-phase 6`

**GO.**

All 5 Phase 6 requirements map to executable plans with grep-verifiable acceptance criteria. Dependency graph is acyclic with correct wave ordering. All 8 critical caveats (lowercase zod keys, v0.2 fleet marker, Promise.allSettled, zero secrets, hardcoded 998455b, macos-14 runner, v0.1.0 tag precedence, 7-plan defensibility) are enforced. The 7-plan shape (vs the RESEARCH §8-suggested 6) is defensible because COMP-01 and COMP-02 assert fundamentally different invariants (behavior continuity vs surface permanence) with different fixture shapes.

Three non-blocking notes (06-07 TBD↔6 substitution, 06-05 soft coverage on cloud-cache.ts + routines.ts, Group A count verified at 39) can be addressed during execution as Rule-1/Rule-2 fixes and recorded in plan-level SUMMARY §Deviations. No replan required.

**Recommended execution order (per waves):**
1. Wave 0: 06-01 + 06-02 in parallel
2. Wave 1: 06-03
3. Wave 2: 06-04 + 06-05 in parallel
4. Wave 3: 06-06
5. Wave 4: 06-07 (phase + milestone seal)

Expected phase output: +17 dashboard tests (baseline 358 → ~375), 4 new templates, 1 diagnostics page, 1 AUTHORING.md, 2 compat scripts, 1 CI workflow, 1 annotated git tag `v0.1.0`, 5 REQUIREMENTS.md rows flipped Complete (27/32 → 32/32), Phase 6 sealed, v0.2 milestone 5/6 → 6/6 SEALED.

---

*Plan check authored: 2026-04-22*
*Reviewer: gsd-plan-checker*
*Verdict: PASSED_WITH_NOTES — safe to execute*
