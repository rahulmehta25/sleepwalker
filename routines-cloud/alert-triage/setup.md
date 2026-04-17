# Alert Triage — Setup

## What this is

An API-triggered Routine. Your monitoring system POSTs an alert body to a per-routine HTTPS endpoint with a bearer token. Sleepwalker pulls the stack trace, correlates with recent commits, opens a *draft* PR with a proposed fix.

## One-time setup

1. **Create the routine** at https://claude.ai/code/routines:
   - **Name**: `Sleepwalker Alert Triage`
   - **Prompt**: paste `prompt.md`
   - **Repositories**: select all production-relevant repos
   - **Trigger**: API. After saving, click **Generate token**. **Copy the URL and token immediately** — the token is shown once.

2. **Wire it into your alerting stack**:

   **Sentry** (Settings → Integrations → Webhooks):
   - URL: `<routine_url>`
   - Headers:
     - `Authorization: Bearer sk-ant-oat01-...`
     - `anthropic-beta: experimental-cc-routine-2026-04-01`
     - `anthropic-version: 2023-06-01`
     - `Content-Type: application/json`
   - Body: Sentry's default JSON payload — wrap in a small Lambda/Cloud Function that maps it to `{"text": "<sentry json>"}`

   **PagerDuty** (Service → Integrations → Generic Webhook):
   - Same headers
   - Body: PagerDuty's default JSON, wrapped to `{"text": ...}`

   **Datadog** (Monitor → Notifications → Webhook):
   - Same headers, same wrapping

   **Custom** (your own alerting):
   ```bash
   curl -X POST $ROUTINE_URL \
     -H "Authorization: Bearer $TOKEN" \
     -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
     -H "anthropic-version: 2023-06-01" \
     -H "Content-Type: application/json" \
     -d '{"text": "Production alert: API latency P99 > 5s for /v1/users"}'
   ```

3. **Test** by manually firing the curl command. The routine should respond with a session URL where you can watch it work.

## Cost / run estimate

- Depends on alert volume. At ~10 alerts/week, ~10 runs/week.
- Each run: 5K-30K tokens depending on repo size + diff size

## Why draft only

Alert-triggered code changes have the highest false-positive risk in the entire fleet. A draft PR is a *starting point*, not an answer. On-call should review every line.

## Troubleshooting

- **Endpoint returns 401**: token expired or wrong. Regenerate at the routine's edit page.
- **Endpoint returns 429**: hit per-account rate limit during research preview. Wait 60 seconds.
- **Routine fires but opens no PR**: it determined no recent commit was responsible. Check the run session — should have queue entry explaining.
- **Wrong repo**: tighten the "Map to a tracked repo" section in your prompt with explicit service-name → repo mappings
