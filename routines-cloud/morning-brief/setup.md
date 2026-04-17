# Morning Brief — Setup

## What this is

Weekdays 06:00 local. Pulls signals from GitHub + Linear + Slack via MCP connectors and posts a one-page brief to a Slack channel.

## One-time setup

1. **Connect MCP connectors** at https://claude.ai/settings/connectors:
   - GitHub (required)
   - Slack (required)
   - Linear (optional)

2. **Create a Slack channel** for the brief (e.g., `#sleepwalker-brief`). Make it private if you want — invite only yourself.

3. **Create the routine**:
   - **Name**: `Sleepwalker Morning Brief`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: select your tracked repos (used for GitHub signals)
   - **Connectors**: ensure GitHub + Slack + Linear are checked
   - **Environment variables**:
     - `MORNING_BRIEF_SLACK_CHANNEL` = `#sleepwalker-brief`
   - **Schedule**: `0 6 * * 1-5`

## Cost / run estimate

- 5 runs/week
- Each run: ~10K tokens

## Troubleshooting

- **Brief doesn't post**: check the run session for connector auth errors. Re-auth Slack in the connectors settings.
- **Brief is too long**: trim the "Top items for your review" section in the prompt to top 2 instead of top 3.
- **Signals are wrong**: the routine pulls from the *previous calendar day*. If you want last 24h rolling, edit the prompt's date math.
