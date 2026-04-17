# Sleepwalker — Quickstart

You're 5 minutes from your first overnight routine.

## Prerequisites

- macOS with Claude Code Desktop installed and signed in
- Node 20+ and `pnpm` (or `npm`/`yarn`/`bun`)
- `jq` (`brew install jq`) — required by the install script + hooks
- A GitHub personal access token if you want to enable the Cloud fleet

---

## 1. Install the local fleet

```bash
git clone https://github.com/rahulmehta25/sleepwalker.git
cd sleepwalker
./install.sh
```

This:
- Copies the 6 routine `SKILL.md` files into `~/.claude/scheduled-tasks/`
- Copies the 3 hook scripts into `~/.claude/hooks/`
- Wires the hooks into `~/.claude/settings.json` (idempotent — safe to re-run)
- Initializes `~/.sleepwalker/` state with sane defaults

**Nothing runs automatically yet.** All routines are disabled by default.

## 2. Start the dashboard

```bash
cd dashboard
pnpm install
pnpm dev --port 4001
```

Open http://localhost:4001. You should see the Morning Queue page.

## 3. Enable a starter routine

The lowest-blast-radius first routine is **Downloads Organizer** (only files, only `~/Downloads`).

**Option A — via Claude Code Desktop (recommended):**

1. Open Claude Code Desktop → **Schedule** tab
2. You should see all 6 `sleepwalker-*` skills listed
3. Pick `sleepwalker-downloads-organizer`
4. Set frequency: **Daily** at **02:00**
5. Save

**Option B — via the CLI:**

```
/schedule create sleepwalker-downloads-organizer at "0 2 * * *"
```

**Option C — via the dashboard:**

Toggle it on at http://localhost:4001/routines. (Note: this records intent in `~/.sleepwalker/settings.json`. You still need to schedule it via Desktop or CLI for it to actually fire.)

## 4. Tomorrow morning

Open http://localhost:4001 (Morning Queue). You'll see:

- Card-by-card swipe-through of every action that needs your approval
- "Recently decided" list of approvals/rejections from previous mornings
- Direct links into approved actions

Approve = the deferred action runs. Reject = it's dropped.

---

## 5. Set up the cloud fleet (optional)

The 8 cloud routines (PR Reviewer, Dependency Upgrader, Doc-Drift Fixer, Test Coverage Filler, Dead Code Pruner, Morning Brief, Library Port, Alert Triage) run on Anthropic's cloud via [Claude Code Routines](https://claude.ai/code/routines). They keep working when your laptop is closed.

### Configure GitHub access first

1. Open the dashboard → **Settings** → **GitHub**
2. Generate a token at https://github.com/settings/tokens/new
   - **Scope**: `repo` for private, `public_repo` for public-only
3. Paste it into the dashboard. It's stored at `~/.sleepwalker/github-token` (mode 600).
4. Add tracked repos in `owner/repo` format
5. Click **Test connection** to verify

### Set up a cloud routine

1. Open the dashboard → **Cloud Routines**
2. Pick a routine (recommend **PR Reviewer** as the first — it's the highest-value one for most teams)
3. Click to expand → read the **Setup** instructions
4. Copy the **Prompt** body
5. Click **Open claude.ai/code/routines** → it opens the routine creation form
6. Paste the prompt, configure the trigger, save

### What happens next

- Cloud routines push to `claude/sleepwalker/<routine>/<date>` branches in your tracked repos
- The dashboard's Morning Queue polls GitHub every minute for these branches
- Approve = open the PR in GitHub and merge it
- Dismiss = hide from view (PR stays open until you act on it)

---

## Verifying your install

Run the test suite:

```bash
# Lib tests (28 tests)
cd dashboard && pnpm test

# Hook script tests (21 tests)
hooks/tests/run-tests.sh

# install.sh idempotency
hooks/tests/install-idempotency.sh

# Full E2E demonstration
hooks/tests/e2e.sh
```

All four should pass.

---

## Adjusting policies

Edit `~/.sleepwalker/settings.json` directly, or use the dashboard's **Settings** page:

- **Sleep window**: defaults to 23:00 → 07:00. Outside this window, hooks operate in interactive mode (no defer, no budget cap).
- **Per-fleet policies**: `strict` (defer all writes), `balanced` (allow reversible, defer external — default), `yolo` (allow everything; only honored outside the sleep window).
- **Per-fleet token budgets**: defaults to 50K per run. The budget hook halts the agent at this limit.

## Adding your own routine

1. Copy any `routines-local/sleepwalker-*` directory to a new name
2. Edit the `SKILL.md` — update `name`, `description`, and the prompt body
3. Re-run `./install.sh`
4. Schedule it via Claude Code Desktop or `/schedule create`

For cloud routines, copy `routines-cloud/<some-routine>/` and edit the three files (`prompt.md`, `setup.md`, `config.json`). The dashboard will pick it up automatically.

## Safety reset

If anything goes weird:

```bash
# Disable all hooks (preserve other settings)
jq '.hooks = {}' ~/.claude/settings.json > /tmp/s.json && mv /tmp/s.json ~/.claude/settings.json

# Remove a single routine
rm -rf ~/.claude/scheduled-tasks/sleepwalker-<name>

# Reset queue (keep audit log for forensics)
> ~/.sleepwalker/queue.jsonl

# Nuclear option
rm -rf ~/.sleepwalker
# Then re-run ./install.sh
```

## Troubleshooting

**"jq: command not found"** when running `install.sh` → `brew install jq`

**Routine doesn't fire** → Confirm it's enabled in Claude Code Desktop's Schedule tab and that "Keep computer awake" is on.

**Hooks aren't intercepting tool calls** → Confirm `~/.claude/settings.json` has the hooks wired in:
```bash
jq '.hooks' ~/.claude/settings.json
```
You should see all 3 sleepwalker hooks. The matcher is `sleepwalker-*`, which matches the routine ID prefix.

**Cloud routines don't show in Morning Queue** → Verify GitHub token + tracked repos in Settings, then click **Test connection**. The dashboard polls every 60 seconds.

**Dashboard says "not installed"** for a routine → Run `./install.sh` from the repo root.
