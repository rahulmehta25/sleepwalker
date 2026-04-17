[sleepwalker:test-zen]

# Sleepwalker integration test

This is a small routine you set up once to verify the cloud-fleet → Morning Queue bridge works end-to-end. It does almost nothing — it fetches a one-line wisdom string from the GitHub Zen API and opens a tiny PR with that line in a text file.

After running, check the dashboard's Morning Queue (http://localhost:4001) — you should see the resulting PR appear as a cloud queue card within 60 seconds (the polling interval).

## What to do

1. Fetch one line of wisdom:
   ```bash
   gh api zen
   ```

2. Create a branch and write a single file:
   ```bash
   DATE=$(date -u +%Y-%m-%dT%H-%M-%S)
   git checkout -b "claude/sleepwalker/test-zen/$DATE"
   mkdir -p .sleepwalker
   echo "Wisdom on $DATE: $(gh api zen)" > .sleepwalker/zen-$DATE.txt
   git add .sleepwalker/
   git commit -m "test: sleepwalker zen test ($DATE)"
   git push origin HEAD
   ```

3. Open a draft PR with a clearly self-explanatory title:
   ```bash
   gh pr create --draft \
     --title "[sleepwalker:test-zen] integration test ($DATE)" \
     --body "Sleepwalker cloud-fleet integration test. Safe to close without merging."
   ```

## Hard rules

- **Draft PR only.** Never publish.
- **No code changes.** Only writes one new text file under `.sleepwalker/`.
- **No connector calls beyond GitHub.** This is purely a connectivity test.
- **No retries.** If GitHub Zen API fails, just exit cleanly.

## Success criteria

- One draft PR opened on `claude/sleepwalker/test-zen/<date>` branch
- The PR appears in the Sleepwalker dashboard's Morning Queue within 60 seconds
- The dashboard's "Open PR" button takes you to the GitHub PR
- Closing the PR (without merging) removes it from the Morning Queue on the next poll
