#!/bin/bash
# tests/compat/frozen-surface.sh
#
# COMP-02: permanent v0.1 frozen-surface regression gate.
#
# Compares each enumerated v0.1 path against its state at the v0.1 seal
# commit 998455b. Exits 0 if byte-identical OR matches a documented
# Phase 2-5 (or same-day v0.1 shipped) additive exception predicate.
# Exits 1 + prints a diff preview on any undocumented change.
# Exits 2 if the baseline commit is missing (history was rewritten).
#
# Path grouping:
#   Group A — byte-identical vs 998455b (no exceptions allowed).
#   Group B — documented exceptions: additive amendment verified by a
#             grep-verifiable predicate. Covers both (a) same-day v0.1
#             shipped fixes (74c82f1 hook schema align + 61e1200 cloud
#             API trigger — both landed 2026-04-17, part of v0.1 shipped
#             surface per CLAUDE.md) and (b) Phase 2-5 additive
#             amendments (QUEU-01, QUEU-03, QUEU-04, DEPL-03, etc.).
#   Group C — post-seal additions: file was not present at 998455b.
#             Asserted byte-identical to its first-add blob unless a
#             documented Phase amendment applies.
#
# Process for adding a new exception (see 06-RESEARCH §5.4):
#   1. Open a PR that modifies the frozen path.
#   2. Add (a) short human-readable description, (b) grep-verifiable
#      predicate function, (c) link to the SUMMARY.md explaining the
#      amendment.
#   3. Committer review: confirm the amendment is truly additive (no
#      deletion of v0.1 lines) and documented in ROADMAP.md.
#
# DO NOT rewrite git history before commit 998455b. If significant rebases
# are planned, tag v0.1.0 on 998455b first so the baseline ref survives
# (see 06-RESEARCH §9 Pitfall 2).
#
# Runnable locally: `bash tests/compat/frozen-surface.sh`.
# Runnable in CI: same command from any working directory that resolves
# to the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

BASELINE="998455b"

# -----------------------------------------------------------------------------
# Preflight: baseline commit must exist. Exit 2 (distinct from gate failures at
# exit 1) so CI operators can tell "history rewrite misconfiguration" apart
# from "frozen surface regression".
# -----------------------------------------------------------------------------
if ! git rev-parse --verify "$BASELINE" >/dev/null 2>&1; then
  echo "ERROR: v0.1 baseline commit $BASELINE not in git history." >&2
  echo "Do not rewrite history before this commit." >&2
  echo "If the baseline ref is missing after a legitimate history operation," >&2
  echo "re-tag it: git tag -a v0.1.0 <new-sha> -m 'v0.1 seal'." >&2
  exit 2
fi

FAIL=0
FAILURES=()
BASELINE_TMP="$(mktemp -t fsurf_base.XXXXXX)"
trap 'rm -f "$BASELINE_TMP"' EXIT

record_fail() {
  FAIL=$((FAIL + 1))
  FAILURES+=("$1")
}

# -----------------------------------------------------------------------------
# Helper: byte-identical check against baseline for Group A paths.
# -----------------------------------------------------------------------------
assert_identical() {
  local path="$1"
  if ! git show "$BASELINE:$path" >"$BASELINE_TMP" 2>/dev/null; then
    # Misconfiguration — any Group A path must exist at baseline.
    record_fail "$path: not present at $BASELINE (should be in Group C)"
    return
  fi
  if ! diff -q "$BASELINE_TMP" "$path" >/dev/null 2>&1; then
    record_fail "$path: byte-diff vs $BASELINE"
    echo "----- diff: $path (first 20 lines) -----" >&2
    diff "$BASELINE_TMP" "$path" | head -20 >&2 || true
    echo "----------------------------------------" >&2
  fi
}

# -----------------------------------------------------------------------------
# Helper: Group C — post-seal addition. File must exist at HEAD AND be
# byte-identical to its first-add blob unless overridden.
# -----------------------------------------------------------------------------
assert_post_seal_identical() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    record_fail "$path: post-seal path missing at HEAD"
    return
  fi
  local first
  first="$(git log --format='%H' --diff-filter=A --reverse -- "$path" | head -1)"
  if [[ -z "$first" ]]; then
    record_fail "$path: cannot resolve first-add commit"
    return
  fi
  if ! git show "${first}:${path}" >"$BASELINE_TMP" 2>/dev/null; then
    record_fail "$path: cannot read first-add blob $first"
    return
  fi
  if ! diff -q "$BASELINE_TMP" "$path" >/dev/null 2>&1; then
    record_fail "$path: byte-diff vs first-add $first"
    echo "----- diff: $path (first 20 lines) -----" >&2
    diff "$BASELINE_TMP" "$path" | head -20 >&2 || true
    echo "----------------------------------------" >&2
  fi
}

# =============================================================================
# Group B — documented exception predicates.
#
# Each predicate asserts POSITIVE signals: v0.1 invariants still present AND
# the documented amendment is present. Removing a v0.1 line breaks the
# invariant count; removing the amendment breaks the amendment grep. Bypass
# requires editing multiple predicates plus the diffed file — visible in PR
# review (see threat register T-06-05-05).
# =============================================================================

# -----------------------------------------------------------------------------
# install.sh — Phase 5 QUEU-04 flock preflight (commit 71bfdcc, +7/-0 additive).
# v0.1 invariants: bash shebang, set -euo pipefail, three install steps
# ("Copying hooks to", "Wiring hooks into", "Initialize state directory").
# -----------------------------------------------------------------------------
assert_exception_install_sh() {
  local p="install.sh"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  head -1 "$p" | grep -qE '^#!/bin/(ba)?sh$' \
    || { record_fail "$p: shebang mutated"; return; }
  [[ "$(grep -c '^set -euo pipefail$' "$p")" -eq 1 ]] \
    || { record_fail "$p: set -euo pipefail missing or duplicated"; return; }
  [[ "$(grep -cE 'Copying hooks to|Wiring hooks into|Initialize state directory' "$p")" -eq 3 ]] \
    || { record_fail "$p: v0.1 install-step line count != 3"; return; }
  # Phase 5 QUEU-04 flock preflight amendment present:
  grep -qF 'ERROR: flock is required but not installed' "$p" \
    || { record_fail "$p: Phase 5 flock preflight amendment missing"; return; }
}

# -----------------------------------------------------------------------------
# hooks/sleepwalker-audit-log.sh — Phase 5 QUEU-04 flock wrap on jq -nc append
# (commit 13cd12b). v0.1 invariants: set -euo pipefail, single jq -nc call.
# Cross-file invariant: shared LOCK_FILE path with bin/sleepwalker-run-cli.
# -----------------------------------------------------------------------------
assert_exception_audit_log_sh() {
  local p="hooks/sleepwalker-audit-log.sh"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  [[ "$(grep -c '^set -euo pipefail$' "$p")" -eq 1 ]] \
    || { record_fail "$p: set -euo pipefail missing"; return; }
  [[ "$(grep -c 'jq -nc' "$p")" -eq 1 ]] \
    || { record_fail "$p: jq -nc shape mutated or duplicated"; return; }
  # Phase 5 QUEU-04 flock wrap amendment present:
  [[ "$(grep -c '^LOCK_FILE=' "$p")" -ge 1 ]] \
    || { record_fail "$p: Phase 5 flock wrap amendment missing"; return; }
  # Shared sidecar path invariant across writers:
  if [[ -f bin/sleepwalker-run-cli ]]; then
    local super_lock hook_lock
    super_lock="$(grep '^LOCK_FILE=' bin/sleepwalker-run-cli || true)"
    hook_lock="$(grep '^LOCK_FILE=' "$p" || true)"
    if [[ -n "$super_lock" && "$super_lock" != "$hook_lock" ]]; then
      record_fail "$p: LOCK_FILE path diverges from bin/sleepwalker-run-cli"
      return
    fi
  fi
}

# -----------------------------------------------------------------------------
# hooks/sleepwalker-defer-irreversible.sh — same-day v0.1 shipped amendment
# (commit 74c82f1 "align hooks with real Claude Code schema") retrofitted the
# hook to emit hookSpecificOutput + permissionDecision shape. Landed 2026-04-17,
# part of v0.1 as shipped per CLAUDE.md "v0.1 (shipped 2026-04-17)".
#
# v0.1 invariants: bash shebang, set -euo pipefail, the three policy tokens
# ("strict", "balanced", "yolo"), hookSpecificOutput envelope present.
# -----------------------------------------------------------------------------
assert_exception_defer_hook() {
  local p="hooks/sleepwalker-defer-irreversible.sh"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  head -1 "$p" | grep -qE '^#!/bin/(ba)?sh$' \
    || { record_fail "$p: shebang mutated"; return; }
  [[ "$(grep -c '^set -euo pipefail$' "$p")" -eq 1 ]] \
    || { record_fail "$p: set -euo pipefail missing"; return; }
  # v0.1 policy trio still documented:
  grep -q 'strict' "$p" && grep -q 'balanced' "$p" && grep -q 'yolo' "$p" \
    || { record_fail "$p: v0.1 defer-policy trio missing"; return; }
  # Claude Code schema envelope (74c82f1 amendment):
  grep -q 'hookSpecificOutput' "$p" \
    || { record_fail "$p: v0.1-shipped schema envelope missing"; return; }
  grep -q 'permissionDecision' "$p" \
    || { record_fail "$p: v0.1-shipped permissionDecision field missing"; return; }
}

# -----------------------------------------------------------------------------
# hooks/sleepwalker-budget-cap.sh — same-day v0.1 shipped amendment
# (commit 74c82f1). Hook was retrofitted to detect fleet via _detect_fleet.sh
# and emit PostToolUse continue=false on budget overrun.
#
# v0.1 invariants: bash shebang, set -euo pipefail, BUDGETS_FILE path,
# SLEEPWALKER_FLEET env-var contract preserved.
# -----------------------------------------------------------------------------
assert_exception_budget_hook() {
  local p="hooks/sleepwalker-budget-cap.sh"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  head -1 "$p" | grep -qE '^#!/bin/(ba)?sh$' \
    || { record_fail "$p: shebang mutated"; return; }
  [[ "$(grep -c '^set -euo pipefail$' "$p")" -eq 1 ]] \
    || { record_fail "$p: set -euo pipefail missing"; return; }
  grep -q 'BUDGETS_FILE=' "$p" \
    || { record_fail "$p: v0.1 BUDGETS_FILE path missing"; return; }
  grep -q 'SLEEPWALKER_FLEET' "$p" \
    || { record_fail "$p: v0.1 SLEEPWALKER_FLEET env contract missing"; return; }
}

# -----------------------------------------------------------------------------
# routines-local/*/SKILL.md — same-day v0.1 shipped amendment (commit 74c82f1)
# added `[sleepwalker:<slug>]` marker tag so _detect_fleet.sh can identify the
# fleet context from the transcript.
#
# v0.1 invariants: the six v0.1 slugs' SKILL.md files still exist AND each
# contains its marker tag. The YAML frontmatter `name: <slug>` still matches
# the directory slug.
# -----------------------------------------------------------------------------
assert_exception_local_skill() {
  local slug="$1"
  local p="routines-local/${slug}/SKILL.md"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q "^name: ${slug}$" "$p" \
    || { record_fail "$p: v0.1 frontmatter 'name: ${slug}' missing"; return; }
  # Marker tag amendment (74c82f1). Slug after `sleepwalker:` is the short
  # form (strip the `sleepwalker-` prefix):
  local short="${slug#sleepwalker-}"
  grep -qF "[sleepwalker:${short}]" "$p" \
    || { record_fail "$p: v0.1-shipped marker tag [sleepwalker:${short}] missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/queue.ts — Phase 5 QUEU-01 QueueSource + QueueStatus union
# widen (commit a545f0b, additive). v0.1 invariants: original "local" + "cloud"
# source literals and original "pending"/"approved"/"rejected" status literals
# still present. Phase 5 widen adds "codex" + "gemini" + "complete" + "failed".
# -----------------------------------------------------------------------------
assert_exception_queue_ts() {
  local p="dashboard/lib/queue.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  # v0.1 QueueSource literals preserved:
  grep -qE '"local"' "$p" || { record_fail "$p: v0.1 source \"local\" removed"; return; }
  grep -qE '"cloud"' "$p" || { record_fail "$p: v0.1 source \"cloud\" removed"; return; }
  # v0.1 QueueStatus literals preserved:
  grep -qE '"pending"'  "$p" || { record_fail "$p: v0.1 status \"pending\" removed"; return; }
  grep -qE '"approved"' "$p" || { record_fail "$p: v0.1 status \"approved\" removed"; return; }
  grep -qE '"rejected"' "$p" || { record_fail "$p: v0.1 status \"rejected\" removed"; return; }
  # Phase 5 QUEU-01 additive widen present (v0.2 runtimes + terminal states):
  grep -qE '"codex"'  "$p" || { record_fail "$p: QUEU-01 \"codex\" widen missing"; return; }
  grep -qE '"gemini"' "$p" || { record_fail "$p: QUEU-01 \"gemini\" widen missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/queue-aggregator.ts — Phase 5 QUEU-03 readSupervisorRuns reader
# + 3-source merge (commit 3c81b4f, additive). v0.1 invariants: aggregateQueue,
# readLocalQueue, fetchCloudQueue still exported.
# -----------------------------------------------------------------------------
assert_exception_queue_aggregator_ts() {
  local p="dashboard/lib/queue-aggregator.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q 'aggregateQueue'  "$p" || { record_fail "$p: v0.1 aggregateQueue export missing"; return; }
  grep -q 'readLocalQueue'  "$p" || { record_fail "$p: v0.1 readLocalQueue export missing"; return; }
  grep -q 'fetchCloudQueue' "$p" || { record_fail "$p: v0.1 fetchCloudQueue export missing"; return; }
  grep -q 'readSupervisorRuns' "$p" \
    || { record_fail "$p: QUEU-03 readSupervisorRuns reader missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/cloud-cache.ts — Phase 5 eager-source tag amendment (+1/-0).
# v0.1 invariants: prToQueueEntry exported, reversibility:"green" literal,
# status:"pending" literal. Phase 5 adds source:"cloud" literal so downstream
# readers can discriminate without re-deriving from kind.
# -----------------------------------------------------------------------------
assert_exception_cloud_cache_ts() {
  local p="dashboard/lib/cloud-cache.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q 'prToQueueEntry' "$p" \
    || { record_fail "$p: v0.1 prToQueueEntry missing"; return; }
  grep -q 'reversibility: "green"' "$p" \
    || { record_fail "$p: v0.1 reversibility default missing"; return; }
  grep -q 'status: "pending"' "$p" \
    || { record_fail "$p: v0.1 status default missing"; return; }
  grep -q 'source: "cloud"' "$p" \
    || { record_fail "$p: Phase 5 eager-source amendment missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/routines.ts — Phase 4 DEPL-03 additions (listRoutinesAsync +
# ListedRoutine type + drift math + enabled-flag persistence). v0.1 invariant:
# `export function listRoutines` still present (sync read API preserved).
# -----------------------------------------------------------------------------
assert_exception_routines_ts() {
  local p="dashboard/lib/routines.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -qE 'export function listRoutines\b' "$p" \
    || { record_fail "$p: v0.1 listRoutines sync export removed"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/audit.ts — v0.2 additive extension (RunAuditEntry + readRunsByFleet).
# v0.1 invariants: readAudit export, AuditEntry interface.
# v0.2 additions: RunAuditEntry interface + readRunsByFleet function.
# -----------------------------------------------------------------------------
assert_exception_audit_ts() {
  local p="dashboard/lib/audit.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q 'export function readAudit' "$p" \
    || { record_fail "$p: v0.1 readAudit export missing"; return; }
  grep -q 'export interface AuditEntry' "$p" \
    || { record_fail "$p: v0.1 AuditEntry interface missing"; return; }
  # v0.2 additive additions:
  grep -q 'export interface RunAuditEntry' "$p" \
    || { record_fail "$p: v0.2 RunAuditEntry interface missing"; return; }
  grep -q 'export function readRunsByFleet' "$p" \
    || { record_fail "$p: v0.2 readRunsByFleet function missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/settings.ts — same-day v0.1 shipped amendment (commit 61e1200)
# added cloudCredsFile + CloudCredential API-trigger secret storage.
# v0.1 invariants: Policy type + trackedFile + tokenFile + clearGithubToken
# still exported with the original signatures.
# -----------------------------------------------------------------------------
assert_exception_settings_ts() {
  local p="dashboard/lib/settings.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q 'export type Policy' "$p" \
    || { record_fail "$p: v0.1 Policy export removed"; return; }
  grep -q 'function trackedFile' "$p" \
    || { record_fail "$p: v0.1 trackedFile missing"; return; }
  grep -q 'function tokenFile' "$p" \
    || { record_fail "$p: v0.1 tokenFile missing"; return; }
  grep -q 'clearGithubToken' "$p" \
    || { record_fail "$p: v0.1 clearGithubToken export missing"; return; }
  # v0.1-shipped API-trigger amendment:
  grep -q 'CloudCredential' "$p" \
    || { record_fail "$p: v0.1-shipped CloudCredential type missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/lib/audit.ts — post-seal parallel-session additive amendment
# (commit c398a3e "run history — listRuns() + dashboard panel + supervisor
# test gaps") added the RunAuditEntry interface for supervisor-emitted run
# lifecycle events. Same JSONL file, different writer (bin/sleepwalker-run-cli
# vs hooks/sleepwalker-audit-log.sh). Amendment is strictly additive — no v0.1
# fields removed, no v0.1 export signatures changed.
#
# v0.1 invariants: auditFile() helper, AuditEntry interface, readAudit() export
# all still present with unchanged signatures.
# -----------------------------------------------------------------------------
assert_exception_audit_ts() {
  local p="dashboard/lib/audit.ts"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  grep -q 'function auditFile' "$p" \
    || { record_fail "$p: v0.1 auditFile helper missing"; return; }
  grep -q 'export interface AuditEntry' "$p" \
    || { record_fail "$p: v0.1 AuditEntry interface missing"; return; }
  grep -qE 'export function readAudit\b' "$p" \
    || { record_fail "$p: v0.1 readAudit export missing"; return; }
  # Parallel-session (c398a3e) additive amendment:
  grep -q 'export interface RunAuditEntry' "$p" \
    || { record_fail "$p: parallel-session RunAuditEntry amendment missing"; return; }
}

# -----------------------------------------------------------------------------
# dashboard/package.json — Phase 3+4 dep additions allowed; v0.1 deps must not
# be removed. Invariants checked: next, react, react-dom top-level deps.
# -----------------------------------------------------------------------------
assert_exception_package_json() {
  local p="dashboard/package.json"
  [[ -f "$p" ]] || { record_fail "$p: missing at HEAD"; return; }
  jq -e '.dependencies.next'          "$p" >/dev/null 2>&1 \
    || { record_fail "$p: v0.1 dep 'next' removed"; return; }
  jq -e '.dependencies.react'         "$p" >/dev/null 2>&1 \
    || { record_fail "$p: v0.1 dep 'react' removed"; return; }
  jq -e '.dependencies["react-dom"]'  "$p" >/dev/null 2>&1 \
    || { record_fail "$p: v0.1 dep 'react-dom' removed"; return; }
}

# -----------------------------------------------------------------------------
# bin/sleepwalker-execute — post-seal addition (first-added in 74c82f1) AND
# received the Phase 5 QUEU-04 shared-sidecar flock amendment (commit 554cfcf).
# v0.1 shipped invariants: set -euo pipefail, INBOX path, Phase 5 LOCK_FILE
# path matches the shared sidecar used by the hook + supervisor.
# -----------------------------------------------------------------------------
assert_exception_sleepwalker_execute() {
  local p="bin/sleepwalker-execute"
  [[ -f "$p" ]] || { record_fail "$p: post-seal path missing at HEAD"; return; }
  [[ "$(grep -c '^set -euo pipefail$' "$p")" -eq 1 ]] \
    || { record_fail "$p: set -euo pipefail missing"; return; }
  grep -q 'INBOX=' "$p" \
    || { record_fail "$p: v0.1-shipped INBOX path contract missing"; return; }
  # Phase 5 QUEU-04 flock wrap amendment:
  grep -q '^LOCK_FILE=' "$p" \
    || { record_fail "$p: Phase 5 flock wrap amendment missing"; return; }
  if [[ -f hooks/sleepwalker-audit-log.sh ]]; then
    local exec_lock hook_lock
    exec_lock="$(grep '^LOCK_FILE=' "$p" || true)"
    hook_lock="$(grep '^LOCK_FILE=' hooks/sleepwalker-audit-log.sh || true)"
    if [[ -n "$exec_lock" && "$exec_lock" != "$hook_lock" ]]; then
      record_fail "$p: LOCK_FILE diverges from hook shared-sidecar path"
      return
    fi
  fi
}

# =============================================================================
# Group A — byte-identical paths (no exceptions allowed).
#
# Literal array — no globs — so adding or removing a frozen path cannot happen
# silently. 27 entries covering every v0.1 file whose HEAD blob matches the
# baseline blob exactly.
# =============================================================================
GROUP_A=(
  "dashboard/lib/cloud.ts"
  "dashboard/lib/github.ts"
  "routines-cloud/alert-triage/prompt.md"
  "routines-cloud/alert-triage/config.json"
  "routines-cloud/alert-triage/setup.md"
  "routines-cloud/dead-code-pruner/prompt.md"
  "routines-cloud/dead-code-pruner/config.json"
  "routines-cloud/dead-code-pruner/setup.md"
  "routines-cloud/dependency-upgrader/prompt.md"
  "routines-cloud/dependency-upgrader/config.json"
  "routines-cloud/dependency-upgrader/setup.md"
  "routines-cloud/doc-drift-fixer/prompt.md"
  "routines-cloud/doc-drift-fixer/config.json"
  "routines-cloud/doc-drift-fixer/setup.md"
  "routines-cloud/library-port/prompt.md"
  "routines-cloud/library-port/config.json"
  "routines-cloud/library-port/setup.md"
  "routines-cloud/morning-brief/prompt.md"
  "routines-cloud/morning-brief/config.json"
  "routines-cloud/morning-brief/setup.md"
  "routines-cloud/pr-reviewer/prompt.md"
  "routines-cloud/pr-reviewer/config.json"
  "routines-cloud/pr-reviewer/setup.md"
  "routines-cloud/test-coverage-filler/prompt.md"
  "routines-cloud/test-coverage-filler/config.json"
  "routines-cloud/test-coverage-filler/setup.md"
)

# v0.1 local routines: same-day marker-tag retrofit (commit 74c82f1) moves
# them from pure byte-diff into Group B with a marker-tag predicate.
LOCAL_SLUGS=(
  "sleepwalker-calendar-prep"
  "sleepwalker-disk-cleanup"
  "sleepwalker-downloads-organizer"
  "sleepwalker-inbox-triage"
  "sleepwalker-screenshot-reviewer"
  "sleepwalker-standup-writer"
)

# =============================================================================
# Group C — post-seal additions (not present at 998455b; byte-identical at
# HEAD vs first-add blob unless overridden by a Group B predicate).
# =============================================================================
GROUP_C_IDENTICAL=(
  "hooks/_detect_fleet.sh"
  "dashboard/lib/approval.ts"
  "dashboard/lib/fire-routine.ts"
)

# =============================================================================
# Main — evaluate groups in order.
# =============================================================================

echo "==> COMP-02 frozen-surface gate (baseline $BASELINE)"

echo "==> Group A: byte-identical check (${#GROUP_A[@]} paths)"
for p in "${GROUP_A[@]}"; do
  assert_identical "$p"
done

echo "==> Group B: documented exceptions (v0.1-shipped + Phase 2-5 amendments)"
assert_exception_install_sh
assert_exception_audit_log_sh
assert_exception_defer_hook
assert_exception_budget_hook
assert_exception_settings_ts
assert_exception_queue_ts
assert_exception_queue_aggregator_ts
assert_exception_cloud_cache_ts
assert_exception_routines_ts
assert_exception_audit_ts
assert_exception_package_json
assert_exception_sleepwalker_execute
for slug in "${LOCAL_SLUGS[@]}"; do
  assert_exception_local_skill "$slug"
done

echo "==> Group C: post-seal additions (byte-identical vs first-add blob)"
for p in "${GROUP_C_IDENTICAL[@]}"; do
  assert_post_seal_identical "$p"
done

echo
if (( FAIL > 0 )); then
  echo "==> COMP-02 FAIL: $FAIL issue(s)" >&2
  printf '  - %s\n' "${FAILURES[@]}" >&2
  exit 1
fi
echo "==> COMP-02 PASS: frozen surface intact vs $BASELINE"
exit 0
