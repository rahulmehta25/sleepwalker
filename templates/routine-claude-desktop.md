---
# ============================================================
# IMPORTANT — Claude Code Desktop manual-add:
# Claude Code Desktop 1.3109.0 does NOT watch ~/.claude/scheduled-tasks/.
# After saving, the dashboard will offer a "Copy SKILL.md" button.
# Open Claude Desktop -> Schedule tab -> Add -> paste the SKILL.md content.
# Without this manual step the routine is authored but never fires.
# Tracking: Phase 2 smoke Q1 outcome (c); fix = manual-add UI workflow.
# See docs/AUTHORING.md §3.2 + §6 Troubleshooting.
# ============================================================
#
# Change THESE before saving (checklist):
#   [ ] name         — human-readable label
#   [ ] slug         — unique id; ^[a-z][a-z0-9-]{0,63}$
#   [ ] schedule     — cron-5 expression; see AUTHORING.md §4
#   [ ] reversibility — green | yellow | red (see §5)
#   [ ] budget        — approximate char cap
#   [ ] prompt body   — replace the example with your routine
# ============================================================

name: "Inbox Triage"
slug: "inbox-triage"
runtime: "claude-desktop"
schedule: "0 2 * * *"
reversibility: "yellow"
budget: 30000
---

[sleepwalker:claude-desktop/inbox-triage]

You are my Inbox Triage fleet member. At 02:00 every night, classify the
last 24 hours of email in Mail.app, draft replies for anything that needs
one, and file the rest. NEVER send anything — drafts only.

## What you do

1. Use AppleScript via `osascript` to enumerate Mail.app messages received
   in the last 24h.
2. For each message, classify:
   - `[reply-needed]` — direct question, action request, or RSVP
   - `[fyi]` — notification, newsletter, status update
   - `[noise]` — marketing, automated digest, social notification
3. For `[reply-needed]`: create a DRAFT reply (not sent) in Mail.app.
4. For `[fyi]`: move to the `Triaged` mailbox.
5. For `[noise]`: move to the `Archive-Auto` mailbox.

## What you do NOT do

- Never send any message. Drafts only. I review and send myself.
- Never delete messages — move to `Archive-Auto`, not Trash.
- Never touch messages older than 24h from run time.
- Never touch messages in the `Drafts`, `Sent`, or `VIP` mailboxes.

## Constraints

- Budget: ~30,000 chars (approximate).
- If Mail.app is not running, launch it and wait 5 seconds before reading.
  If still not available, skip and log to audit.jsonl.

## Success criteria

- Every `[reply-needed]` has a draft I can review and send.
- `Triaged` and `Archive-Auto` mailboxes updated.
- Zero sent messages; zero deletions; zero touches to protected mailboxes.
- Audit log entry per message handled.
