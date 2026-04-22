# Daily Standup — Operator Notes

A 7am cognitive-load brief across your local repo portfolio. Answers "which
repos moved, which are dormant, what are the top 3 threads today?" in under
300 words.

**Philosophy:** your 28 repos feel like 28 contexts. This fleet collapses them
into one. Every other fleet (security-sweeper, osmoti-keeper, repo-inventory)
becomes more valuable once this one exists — it's the layer that tells you
which agents' outputs to trust and when.

---

## Tonight — manual run, no schedule, markdown only

This is the v0 calibration run. Goal: verify the signals, tune the voice, see
if the "Top 3 threads" list is opinionated enough to be useful.

### Run it

From anywhere inside a Claude Code session (in this repo or otherwise):

```
Read routines-local/sleepwalker-daily-standup/SKILL.md and execute it.
```

Or via Claude Code CLI (headless, one-shot):

```bash
cd ~/Desktop/Projects/sleepwalker
claude -p "$(cat routines-local/sleepwalker-daily-standup/SKILL.md)"
```

### What it produces

- `~/.sleepwalker/reports/daily-standup-YYYY-MM-DD.md` — the brief
- One entry in `~/.sleepwalker/queue.jsonl` with `kind: "text-draft"`
- Optionally: the brief printed to stdout for immediate reading

### What it reads

By default, all git repos directly under `~/Desktop/Projects/` (per your
existing `~/.sleepwalker/tracked-projects.json`). If you want an explicit
allowlist, copy `tracked-repos.example.json` to the user config:

```bash
cp routines-local/sleepwalker-daily-standup/tracked-repos.example.json \
   ~/.sleepwalker/daily-standup-repos.json
# Edit to match your actual priority set
```

The allowlist overrides auto-discovery. Good for excluding archived/reference
repos you don't want in the daily scan.

### Read-only guarantees

- Zero writes to any repo working tree
- Zero `git push`, zero `git fetch`, zero `git commit`
- Zero GitHub mutations (only `gh api` reads, and only if `gh` is authenticated)
- No file reads inside repos beyond git metadata — no `grep`, no content scans

---

## Calibration loop (runs 1-3)

For the first 3 runs, the brief includes a `### Calibration notes` section.
Your job after each run:

1. **Does the mover/dirty/dormant classification match your mental model?**
   If MARA shows up as "moved" but you haven't touched it — check for
   dependabot / bot commits slipping past the `--author="$email"` filter.

2. **Is "Top 3 threads today" actually useful, or generic?**
   If it's generic ("focus on Osmoti because you committed to it"), the prompt
   needs a stronger opinion signal. Tighten the "Top 3" rules in SKILL.md §4.

3. **Word count ≤300?**
   Firehose is the failure mode. If the brief is 600 words, the prompt's prime
   directive isn't being respected — reinforce it.

4. **Any false-positive dormants?**
   Repos that look dormant but are intentionally paused (archived references,
   demo repos, Keep Safe Beach Box WIP). Add them to
   `~/.sleepwalker/daily-standup-repos.json` exclusion or just drop them from
   `tracked-projects.json`.

Once all four check out, delete the `### Calibration notes` section from
SKILL.md and promote to scheduled.

---

## Tomorrow — scheduled daily at 7am

Once the ad-hoc output is tuned, promote to a scheduled Claude Desktop task.

### One-time setup

1. Open Claude Code Desktop
2. Go to **Schedule** tab → **Add Scheduled Task**
3. Paste the entire `SKILL.md` content (or point it at the file path — depends
   on your Desktop version; 1.3109 expects paste)
4. Set schedule: `0 7 * * *` (daily at 07:00)
5. Save

### Verify

After setup, you should see `sleepwalker-daily-standup` in the Schedule list.
Click **Run now** to smoke-test before trusting the 7am fire.

### Known Desktop gotcha

Claude Code Desktop 1.3109 does NOT watch `~/.claude/scheduled-tasks/`. You
must paste into the Schedule tab manually. This is documented in
`docs/AUTHORING.md §3.2 + §6 Troubleshooting`. No way around it in the current
Desktop build.

---

## Week 2 — add Telegram delivery

Once the scheduled markdown-only version has fired cleanly for 3-4 days,
bolt on Telegram delivery. Options:

### Option A — Telegram MCP (cleanest, if available in the scheduled task's env)

Add to SKILL.md §4, after writing the report file:

```
After writing the report, call the `plugin-telegram-telegram` MCP's `reply`
tool with the full report body as the message text. Use the chat_id from
the TELEGRAM_STANDUP_CHAT_ID env var. If the MCP is not available in this
session, skip silently — the file is still the canonical artifact.
```

**Caveat:** Claude Desktop scheduled tasks do not always inherit your
interactive MCP config. If Telegram MCP isn't available when the 7am task
fires, fall back to Option B.

### Option B — direct Telegram bot API (always available)

Provision a bot via `@BotFather`, store the token at
`~/.sleepwalker/secrets/telegram-bot-token` (mode 0600), and add:

```bash
if [ -f "$HOME/.sleepwalker/secrets/telegram-bot-token" ]; then
  TOKEN=$(cat "$HOME/.sleepwalker/secrets/telegram-bot-token")
  CHAT_ID="${TELEGRAM_STANDUP_CHAT_ID:-YOUR_CHAT_ID_HERE}"
  /usr/bin/curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "parse_mode=Markdown" \
    --data-urlencode "text=$(cat "$REPORT_PATH")" \
    > /dev/null
fi
```

Direct API is dumber but dependency-free and works regardless of MCP state.
Start here; migrate to MCP only if you want the per-message reactions/edits
that the MCP offers.

---

## Week 3+ — cross-fleet integration

Once `security-sweeper` and `osmoti-keeper` are running (both in dry-run
first), have this fleet read `~/.sleepwalker/audit.jsonl` for the last 24h
and surface each fleet's overnight activity in a new section:

```markdown
## Overnight fleet activity

- security-sweeper: 3 repos scanned, 2 patch-level dependency updates queued
- osmoti-keeper (dry-run): would auto-merge 1 Dependabot PR (#247)
- repo-inventory: (next run Sunday 06:00)
```

This is the "cognitive layer" promise: the daily standup tells you which
agents' outputs deserve your review, not just what they did.

---

## Why this lives in `routines-local/` and not `routines-codex/` or `routines-gemini/`

- Needs local git access to 28 repos on disk — cloud Routines can't reach them
- Eventually needs MCP access (Telegram, Granola) — Claude Desktop has it,
  the codex/gemini supervisor does not
- Runs against your existing Claude subscription, not an API meter
- The supervisor (`bin/sleepwalker-run-cli`) enforces a `codex|gemini` runtime
  allowlist anyway — this bundle wouldn't pass its front gate

## Why no `config.json` in this bundle

The `routines-codex/` and `routines-gemini/` bundles require `config.json`
because `sleepwalker-run-cli` reads reversibility, budget, and schedule from
it. Claude Desktop bundles use SKILL.md frontmatter for the equivalent
metadata (`name`, `description` only, per existing local-routine convention
— schedule and budget live in Desktop's state, not the bundle).

If you later want budget enforcement via the v0.1 `budget-cap.sh` hook, add:

```json
{
  "budgets": {
    "daily-standup": 40000
  }
}
```

to `~/.sleepwalker/settings.json` (`budgets` map already exists for the v0.1
routines; add this key alongside the others).
