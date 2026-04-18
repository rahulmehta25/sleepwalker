---
phase: 1
reviewers: [gemini, codex]
skipped: [claude, cursor]
reviewed_at: 2026-04-18T17:00:00Z
plans_reviewed: [01-01-PLAN.md, 01-02-PLAN.md, 01-03-PLAN.md, 01-04-PLAN.md]
---

# Cross-AI Plan Review — Phase 1: Foundation

**Invocation:** `/gsd-review --phase 1 --all`
**Runtime:** Claude Code (self, skipped per `SELF_CLI=claude`)
**Reviewers invoked:** Gemini CLI (gemini-pro latest), Codex CLI (gpt-5.4)
**Skipped with reason:**
- `claude` — self, skipped for independence
- `cursor` — not authenticated (`cursor agent login` required)
- `opencode`, `qwen`, `coderabbit` — not installed

---

## Gemini Review

# Phase 1 Plan Review: Foundation

## Summary
Phase 1 Foundation is technically sound and correctly prioritizes the "Interface First" architecture. The centralized `slug.ts` builder pattern is a high-signal strategy for preventing convention drift across four runtimes. However, the verification logic for the "frozen surface" is fundamentally incompatible with the agent's core "No Commit" mandate, and there is a critical pathing mismatch between v0.1 legacy routines and v0.2's proposed slug convention.

## Strengths
- **Idiomatic Interface Design:** `RuntimeAdapter` correctly employs the result-object pattern (`ok`, `error`) over exceptions, ensuring UI resilience and alignment with v0.1 error-handling styles.
- **Identifier Centralization:** Moving launchd labels, marker tags, and branch prefixes into tested builders in `slug.ts` makes naming-convention bugs nearly impossible for downstream consumers.
- **Compile-Time Exhaustiveness:** Using `Record<Runtime, RuntimeAdapter>` in the registry forces the TypeScript compiler to catch missing adapters as soon as the `Runtime` union is extended.
- **Additive Focus:** The plan successfully avoids modifying v0.1 files, keeping the foundation strictly additive.

## Concerns
- **HIGH: Broken Verification Gate:** Plan 01-04's `git diff` gate relies on `git log` to find a file created in Plan 01-01. Per the **Core Mandates (Source Control)**, the agent will not commit these files unless explicitly directed. Without commits, `git log` will return no results, and the verification gate will crash or return a vacuous fail.
- **MEDIUM: Legacy Slug Inconsistency:** V0.1 local routines use a `sleepwalker-` directory prefix (e.g., `routines-local/sleepwalker-inbox-triage`). Assumption A3 states v0.2 routines will use bare slugs. `toBundleDir("claude-desktop", "inbox-triage")` will resolve to `routines-local/inbox-triage`, failing to find any legacy v0.1 routines. This creates a split-brain directory structure that Phase 2 will struggle to reconcile.
- **MEDIUM: Runtime Drift Surface:** The authorized runtimes are hardcoded in three places: `types.ts` (union), `slug.ts` (tuple), and `index.ts` (registry keys). This creates unnecessary maintenance overhead for a phase intended to provide a "frozen" foundation.
- **LOW: Validation Split-Brain:** `validateSlug` rejects `_test-zen` (a core v0.1 routine). While designated for "authoring only," this creates a scenario where the codebase defines its own legacy routines as "invalid" if the regex is ever reused for loading or diagnostics.

## Suggestions
- **Explicit Commit Tasks:** Add a final task to Plans 01-01, 01-02, and 01-03 to "Commit the changes with message [feat: ...]" to ensure Plan 01-04 has a history to diff against.
- **Standardize Prefixing:** Update `toBundleDir` to automatically handle the `sleepwalker-` prefix for `claude-desktop` runtimes to maintain parity with v0.1, OR acknowledge that v0.1 routines must be renamed (which contradicts the "byte-identical" goal).
- **Consolidate Runtimes:** Define `RUNTIMES` as a `const` array in `types.ts` and derive the `Runtime` type using `typeof RUNTIMES[number]` to ensure the tuple and the type never drift.
- **Atomic Log Updates:** Ensure the "Activity Log" tasks in all plans explicitly use a read-then-append strategy to prevent race conditions or partial wipes of Phase 1 entries.

## Risk Assessment: MEDIUM
The foundation is architecturally robust, but the **Verification Gate** is currently non-executable as written, and the **Directory Pathing** mismatch for v0.1 routines represents a significant technical debt that will surface as "Missing Routine" bugs in Phase 2.

---

## Codex Review

**Summary**

The plan set is disciplined and mostly right-sized for a foundation phase: it freezes a concrete adapter contract, adds naming utilities, scaffolds new runtime directories, and verifies v0.1 untouched. But the slug/naming layer is weaker than the plans claim. The builders accept raw strings and do not enforce `validateSlug()`, so ADPT-02 is only partially enforced by convention. Plan 01-04's diff-base strategy is clever but brittle in real git history. Overall: solid scaffolding, but a few sharp edges should be fixed before letting Phase 2 depend on it.

**Strengths**

- The `RuntimeAdapter` interface is explicit, async, small, and stable enough for parallel adapter work.
- `Runtime` as a string-literal union plus `Record<Runtime, RuntimeAdapter>` is the right compile-time exhaustiveness pattern.
- Keeping `Reversibility` separate from `queue.ts` avoids an obvious dependency cycle.
- Additive-only directory scaffolding is appropriately scoped and does not disturb v0.1 runtime bundles.
- `slug.test.ts` covers the important happy paths and obvious malicious inputs: path segments, leading digits, uppercase, underscores, unknown runtimes.
- The frozen-surface gate is directionally correct: it tries to prove v0.1 files are byte-identical instead of relying on intent.
- Activity log discipline is consistent with the repo process, even if it serializes the plans.

**Concerns**

- **HIGH:** The identifier builders do not validate `slug`. `toBundleDir("codex", "../x")` would call `path.join("routines-codex", "../x")` and escape the intended directory. The plan says "string concatenation at call sites becomes a bug," but raw invalid slugs passed into builders are still a bug.
- **HIGH:** ADPT-02 is not actually "enforced everywhere" yet. It exports helpers, but nothing prevents Phase 2/3 code from bypassing them or passing unvalidated input. This is acceptable only if the plan explicitly says Phase 1 provides primitives, not enforcement.
- **MEDIUM:** `SLUG_REGEX` allows trailing hyphens and repeated hyphens, e.g. `a-`, `a--b`. That may be fine, but the plan should acknowledge it. If branch names, labels, or UX should be cleaner, tighten now.
- **MEDIUM:** `toPlistPath()` uses `process.env.HOME || os.homedir()`. For launchd/security-sensitive paths, trusting a mutated `HOME` may be surprising. At minimum, tests should pin behavior with temporary `HOME`; better, decide whether `os.homedir()` is canonical.
- **MEDIUM:** Plan 01-04's base detection can fail or lie if `types.ts` is deleted and recreated, squashed, rebased, renamed, or introduced in an uncommitted working tree. It also assumes Phase 1 work is committed before the gate.
- **MEDIUM:** All four plans append to `docs/activity_log.md`, forcing serialization and merge conflict risk. Fine for one executor, poor for parallel execution.
- **LOW:** Plan 01-03 has internal inconsistencies: it says "6 describe blocks" in must-haves, but the provided test has 4 `describe` blocks. It says "7 builders," but the exported surface is described elsewhere as 10 public symbols.
- **LOW:** Plan 01-04 claims "Updated .planning/ROADMAP.md" in the activity log, but the task only verifies it unless missing. The log should not claim an update if none happened.
- **LOW:** Stub adapters returning `available: false` are fine, but any Phase 3 UI built before real adapters could show all runtimes unavailable. Make that failure mode explicit.

**Suggestions**

- Introduce a branded `Slug` type or `assertValidSlug(slug): asserts slug is Slug`, and make builders accept `Slug` or validate internally.
- Add tests for invalid builder input, especially `../etc/passwd`, `a/b`, empty string, and `a-` if trailing hyphen is disallowed.
- Decide whether trailing/consecutive hyphens are acceptable. If not, use a stricter regex like `^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$`.
- Replace Plan 01-04's dynamic base with an explicit recorded base SHA in `.planning/STATE.md` or the plan summary. Fallback to `git merge-base HEAD main` only if appropriate.
- Make Plan 04 work before commits exist by also checking `git status --porcelain` for frozen paths.
- Defer activity-log writes to one closeout entry or require strict sequential execution because `docs/activity_log.md` is a shared write hotspot.
- Fix the describe-block/count terminology before execution; small inconsistencies cause executor drift.

**Risk Assessment**

**MEDIUM.** The type interface work is low-risk and well scoped. The main risk is that ADPT-02 is overstated: the current slug utilities document and test the convention, but they do not fully enforce it at the point where unsafe paths and identifiers are built. Backward compatibility looks well protected by scope boundaries and the frozen-surface gate, but the gate's base-SHA method is brittle unless Phase 1 commits are guaranteed.

---

## Consensus Summary

Two independent reviewers (Gemini and Codex) both assign **Risk: MEDIUM** and converge on the same three top concerns. The phase scaffolding is right. The failure modes both reviewers flagged are all fixable before execution.

### Agreed Strengths (2+ reviewers)

- **Interface design is sound.** Result-object error returns, async methods, string-literal `Runtime` union, and `Record<Runtime, RuntimeAdapter>` for compile-time exhaustiveness — both reviewers endorse the shape.
- **Additive-only discipline.** Both acknowledge the plans successfully avoid touching v0.1's frozen surface in scope (though both flag the verification gate's brittleness separately).
- **Centralized identifier builders.** Both agree that moving launchd labels / marker tags / branch prefixes into tested `slug.ts` builders is the right leverage point for preventing convention drift.

### Agreed Concerns (raised by 2+ reviewers, HIGH priority)

1. **ADPT-02 is not actually "enforced."** Both Gemini and Codex flag that the builders in `slug.ts` accept raw string slugs without calling `validateSlug()` internally. A caller can pass `"../../etc/passwd"` to `toBundleDir("codex", ...)` and it will escape the intended directory. Phase 1 ships the *primitives* for the convention but doesn't *enforce* it. ADPT-02 language should be tempered, OR the builders should validate internally (branded `Slug` type or `assertValidSlug(slug): asserts slug is Slug`).

2. **Plan 01-04 frozen-surface gate is brittle under real git history.** Gemini says "non-executable as written" if the executor doesn't commit intermediate work (though Sleepwalker's YOLO mode DOES auto-commit — Gemini's objection rests on a mistaken "no commits" mandate). Codex's version of the concern is sharper and correct: if `types.ts` is ever deleted-and-recreated, squashed, rebased, or renamed, the base-SHA detection fails or lies. Both reviewers recommend **recording an explicit pre-phase SHA** (e.g., in `.planning/STATE.md`) instead of deriving dynamically.

3. **`docs/activity_log.md` serialization hotspot.** Both flag that all 4 plans append to the same file, forcing serial execution. Plans could consolidate into a single closeout entry, or the dependency order could be relaxed for real parallelism later.

### Divergent Views

- **Gemini raised HIGH-priority v0.1 directory prefix mismatch** — `toBundleDir("claude-desktop", "inbox-triage")` resolves to `routines-local/inbox-triage/`, but v0.1's actual path is `routines-local/sleepwalker-inbox-triage/`. Codex didn't catch this. **Worth investigating** — this is either a Phase 2 reader concern (decide at read time) or a Phase 1 gap (builder should preserve the prefix for `claude-desktop`).
- **Codex raised `SLUG_REGEX` permissiveness** — trailing and repeated hyphens (`a-`, `a--b`) are allowed. Gemini didn't flag. Cosmetic vs correctness tradeoff; worth a decision.
- **Codex raised `process.env.HOME || os.homedir()`** precedence concern for `toPlistPath`. Gemini didn't flag. Security-adjacent but low stakes.
- **Gemini proposed `RUNTIMES as const` + `typeof RUNTIMES[number]` derivation** to eliminate the 3-place duplication (types.ts union, slug.ts tuple, index.ts registry keys). Codex didn't propose. Clear improvement worth adopting.

### Recommended Actions Before Execution

Four fixable items emerged from consensus:

1. **Validate inside builders.** Introduce `assertValidSlug()` or accept a branded `Slug` type; `toBundleDir`, `toLaunchdLabel`, `toMarkerTag`, `toBranchPrefix`, `toPlistPath` call it.
2. **Decide v0.1 prefix behavior.** Either `toBundleDir("claude-desktop", slug)` prepends `sleepwalker-` automatically, OR document that bare slugs are a v0.2-only convention and v0.1 routines get read via a different path in Phase 2's `bundles.ts`.
3. **Collapse Runtime definition.** Single `RUNTIMES` const array in `types.ts`; derive `Runtime` type. `slug.ts` and `index.ts` import the array.
4. **Harden the frozen-surface gate.** Record a `phase_1_base_sha` in `.planning/STATE.md` when Phase 1 planning completes (explicit, durable) and have Plan 01-04 read from there. Fall back to the dynamic detection only if the recorded SHA is missing.

Item 1 and item 4 are the two HIGH-priority items both reviewers converged on. Items 2 and 3 were raised by only one reviewer each but are clear improvements.

### How to apply these

Run: `/gsd-plan-phase 1 --reviews`

This will spawn the planner in revision mode with this REVIEWS.md as context. The planner will produce targeted revisions to Plans 01-01 and 01-03 (interface + slug changes), Plan 01-04 (gate hardening), and leave Plan 01-02 untouched.
