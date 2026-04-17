# Sleepwalker Routine Catalog

14 hand-tuned routines across 2 tiers. Each is opinionated, scoped, and ships with a defined success criteria.

## Local fleet (Tier B — Desktop Scheduled Tasks)

These run on your Mac. They have full access to local apps (Mail.app, Calendar, Photos, Finder, your local repos). Triggered by cron only. Safety enforced by the 3 hooks (defer/budget/audit).

### sleepwalker-inbox-triage

**Schedule:** weekdays 05:00 (1h before you wake)
**Touches:** Mail.app via AppleScript
**Output:** drafts queued (never sent), classification labels

For each unread message in the last 24h, classifies as `urgent`, `important`, `notification`, `newsletter`, `spam`, or `personal`. For the top 5 urgent/important, drafts a reply and saves it (does NOT send). Pushes a single `draft-replies` queue entry to the Morning Queue.

**Why it's queue-only:** Sending email is irreversible. Drafts let you scan and one-tap-send the next morning.

---

### sleepwalker-downloads-organizer

**Schedule:** daily 02:00
**Touches:** `~/Downloads`, `~/Documents/PDFs`, `~/Pictures/From-Downloads`, etc.
**Output:** files moved into categorized folders; stale files queued for deletion review

By extension: PDFs → `~/Documents/PDFs/`, images → `~/Pictures/From-Downloads/`, archives → `~/Downloads/Archives/`, receipts (filename heuristic) → `~/Documents/Receipts/<YYYY-MM>/`. Files >30 days unused are queued for deletion review (never deleted directly).

**Why it's safe:** Moves are reversible. Deletions are deferred to the queue.

---

### sleepwalker-calendar-prep

**Schedule:** weekdays 06:30
**Touches:** Calendar.app, Documents/Notes/, recent emails
**Output:** `~/.sleepwalker/calendar-prep-<date>.md` with a packet per meeting

For each of tomorrow's meetings (>30 min, with attendees): pulls prior context from notes/emails, looks up external attendees by name + company, generates a 3-section packet (attendees, prior context, talking points). One queue notification entry.

---

### sleepwalker-standup-writer

**Schedule:** weekdays 08:30 (30 min before standup)
**Touches:** local git logs across tracked projects, calendar
**Output:** `~/.sleepwalker/standup-<date>.md` with the canonical Yesterday/Today/Blockers structure

Pulls yesterday's commits authored by you across tracked projects. Lists today's calendar items. Identifies blockers from open PRs/TODOs. Writes a ≤200-word draft. Never auto-posts.

---

### sleepwalker-screenshot-reviewer

**Schedule:** daily 01:30
**Touches:** `~/Desktop` screenshots
**Output:** classified files; deletion candidates queued

Vision OCR over each screenshot from the last 7 days. Classifies into `code-snippet`, `slack-conversation`, `error-message`, `marketing-screenshot`, `receipt`, `meme-or-personal`. High-value categories filed; obvious-cleanup candidates queued for one-tap review. Never deletes.

---

### sleepwalker-disk-cleanup

**Schedule:** weekly Sunday 03:00
**Touches:** brew, npm, pnpm, Xcode DerivedData, Docker, Conda — all DRY-RUN probes
**Output:** single batched cleanup queue entry with reclaimable GB per item

Probes (never executes) the standard cleanup commands. Builds a single approval batch with `(label, size_gb, last_used_days_ago, reclaim_command, reversibility)` per item. You approve the whole batch with one swipe.

**Why strict-mode default:** disk cleanup commands are irreversible.

---

## Cloud fleet (Tier C — Routines)

These run on Anthropic's cloud infrastructure. They can keep working when your laptop is closed. They operate on GitHub repos and MCP connectors only — no local file access. Output is always a `claude/sleepwalker/*` branch + PR (or a posted message in the case of Morning Brief).

### pr-reviewer

**Trigger:** GitHub `pull_request.opened` + `pull_request.synchronize` (filtered: not draft, not from fork)
**Output:** inline review comments on the PR (never approves/requests-changes)

Reviews each PR for security, correctness, performance, missing tests, style. Posts comments only — leaves the merge decision to the human. Skips bot PRs (Dependabot, Renovate, github-actions[bot]).

**~20 runs/week** for a team with 4-5 PRs/day.

---

### dependency-upgrader

**Trigger:** weekdays 04:00 (cron)
**Output:** one PR per scope on `claude/sleepwalker/deps/<scope>-<date>` branches

Detects package manager from lock file. Bumps deps in three batches: patch+minor (one PR), each major (separate PRs), devdeps (one PR). Runs the test suite — if green, opens the PR. If red, aborts that branch silently (no broken PRs land).

**~5 runs/week.** Skips repos without test suites.

---

### doc-drift-fixer

**Trigger:** weekly Sunday 03:00
**Output:** one PR per repo with drifted docs

Finds: README install commands that no longer match `package.json`, file references that no longer exist, docstrings whose function signatures have changed in the last 6 months. Edits the docs (never the code) and opens a doc-only PR per repo.

**1 run/week.**

---

### test-coverage-filler

**Trigger:** weekly Saturday 02:00
**Output:** one PR per repo with new tests for the highest-blast-radius uncovered functions

Runs `pnpm test --coverage`/`pytest --cov`/`cargo tarpaulin`. Picks the top 5 uncovered functions per repo, weighted by exported + complex + multi-import. Writes 3 tests each (happy/edge/error). Tests must pass before push.

**1 run/week.**

---

### dead-code-pruner

**Trigger:** monthly (1st at 01:00)
**Output:** conservative removal PR per repo

Uses `ts-prune`/`knip`/`vulture`/`cargo udeps`. Cross-references reflection-style usage. Removes Tier-1 (definitely dead) only. Lists Tier 2 (probably dead) and Tier 3 (worth a look) in the PR body for human review.

**Why monthly:** dead-code detection has a high false-positive rate. Less frequent = less PR fatigue + lets the codebase settle.

---

### morning-brief

**Trigger:** weekdays 06:00 (cron)
**Output:** Slack message to `$MORNING_BRIEF_SLACK_CHANNEL` (default `#sleepwalker-brief`)
**Connectors:** GitHub + Slack + Linear

Pulls overnight signals: PRs opened/merged across tracked repos, Linear issues moved, Slack mention counts. Synthesizes into a one-page brief with overnight signals, top items for review, fleet activity. Posts once per day.

**5 runs/week.**

---

### library-port

**Trigger:** GitHub `pull_request.closed` + `is_merged: true` on the source SDK repo
**Output:** matching PR on the target SDK repo in another language

When a PR merges in `acme/sdk-typescript`, ports the change to `acme/sdk-python`. Identifies the public API change semantics (not the syntax), matches it to target-language idioms, runs target tests, opens the matching PR with explicit "what was ported" and "what was deliberately skipped" sections.

**~3 runs/week** depending on source repo activity.

---

### alert-triage

**Trigger:** API (POST to per-routine endpoint with bearer token)
**Output:** **draft** PR with a proposed fix
**Wiring:** Sentry / PagerDuty / Datadog / custom webhook

Receives an alert body (Sentry stack trace, PagerDuty summary, Datadog monitor, freeform). Identifies the failing service → maps to a tracked repo → reads recent commits → drafts a minimal fix → opens a `[sleepwalker:DRAFT]` PR.

**Always draft, never published.** On-call reviews every line.

---

## Comparison table

| Routine | Tier | Trigger | Output | Approval mechanism |
|---------|------|---------|--------|-------------------|
| inbox-triage | B | cron | drafts (not sent) | Morning Queue card |
| downloads-organizer | B | cron | filed files + queued deletions | Morning Queue card |
| calendar-prep | B | cron | markdown brief file | Morning Queue notification |
| standup-writer | B | cron | markdown standup file | Morning Queue notification |
| screenshot-reviewer | B | cron | filed/queued screenshots | Morning Queue card |
| disk-cleanup | B | cron | batched cleanup commands | Morning Queue (strict) |
| pr-reviewer | C | GitHub event | inline PR comments | GitHub PR thread |
| dependency-upgrader | C | cron | PRs on `claude/sleepwalker/deps/*` | GitHub PR review |
| doc-drift-fixer | C | cron | PR per repo with doc edits | GitHub PR review |
| test-coverage-filler | C | cron | PR per repo with new tests | GitHub PR review |
| dead-code-pruner | C | cron (monthly) | conservative removal PR | GitHub PR review |
| morning-brief | C | cron | Slack message | (delivered, queued for tracking) |
| library-port | C | GitHub event | PR on target SDK | GitHub PR review |
| alert-triage | C | API | DRAFT PR | GitHub PR review |

## Adding your own

Local routine:

```bash
cp -R routines-local/sleepwalker-inbox-triage routines-local/sleepwalker-my-thing
$EDITOR routines-local/sleepwalker-my-thing/SKILL.md
./install.sh
# Then enable in Claude Code Desktop → Schedule
```

Cloud routine:

```bash
cp -R routines-cloud/pr-reviewer routines-cloud/my-cloud-thing
$EDITOR routines-cloud/my-cloud-thing/{prompt,setup,config}.{md,json}
# Restart the dashboard to pick it up
```
