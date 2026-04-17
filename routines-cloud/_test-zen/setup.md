# Sleepwalker Test (Zen) — Setup

This is a one-time integration test to prove the cloud-fleet → Morning Queue bridge works on YOUR machine with YOUR GitHub account. Set it up once, run it once, then either delete it or leave it disabled.

## Prerequisites

- Your dashboard is running at http://localhost:4001
- Settings → GitHub: token configured (`Test connection` returns `ok`)
- Settings → Tracked repos: at least one repo where opening a draft PR is safe (your own scratch repo is ideal)

## Setup steps

1. **Pick a scratch repo.** Don't run this on production code. Your own `rahulmehta25/scratch` (or create one) is perfect.

2. **Create the routine** at https://claude.ai/code/routines:
   - **Name:** `Sleepwalker Test (Zen)`
   - **Repositories:** select your scratch repo
   - **Prompt:** paste the contents of `prompt.md` from this directory
   - **Trigger:** Schedule → Manual (or `0 9 1 1 *` which is Jan 1 9am — far enough out it won't fire by accident)
   - **Environment:** Default
   - **Connectors:** keep `github` only

3. **From any Claude Code session, trigger it:**
   ```
   /schedule run sleepwalker-test-zen
   ```
   Or click **Run now** on the routine's detail page at claude.ai/code/routines.

## Verify the integration

Within a minute of the routine completing:

1. Open http://localhost:4001 (Morning Queue)
2. You should see a new card with:
   - `cloud` pill (sky blue)
   - Repository: `your-org/scratch`
   - Title: `[sleepwalker:test-zen] integration test (...)`
   - Branch: `claude/sleepwalker/test-zen/<date>`
   - Body containing: "Sleepwalker cloud-fleet integration test."
3. Click **Open PR** — should open the GitHub PR in a new tab
4. **Close the PR (do NOT merge)** — the file is just a wisdom string, no need to keep
5. Refresh the dashboard within 60s — the card disappears (because the PR is closed and dashboard polls only `state=open`)

## Cleanup

After verifying:

```bash
# Delete the local branch on your scratch repo
git fetch origin
git branch -D claude/sleepwalker/test-zen/<date> 2>/dev/null || true
git push origin --delete claude/sleepwalker/test-zen/<date>

# Delete the test wisdom file
git rm .sleepwalker/zen-*.txt && git commit -m "cleanup: remove zen test files" && git push
```

You can also delete the routine itself from claude.ai/code/routines, or leave it for next time you want to test.

## What this proves

End-to-end:
- Cloud routine can be created via the web/CLI
- It runs on Anthropic's cloud
- It can call connectors (GitHub) and shell tools
- It opens a `claude/sleepwalker/*` PR
- The dashboard's GitHub PR poller picks it up
- The PR appears as a queue card matching the same UI as local entries
