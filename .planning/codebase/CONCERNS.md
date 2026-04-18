# Codebase Concerns

**Analysis Date:** 2026-04-18

## Tech Debt

**Defer hook reversibility classification is hardcoded:**
- Issue: The bash command pattern matching in `sleepwalker-defer-irreversible.sh` uses wildcard patterns to classify Bash commands as `green/yellow/red`. New reversibility categories (e.g., destructive operations on specific cloud services, or plugin calls) require modifying the hook script itself.
- Files: `hooks/sleepwalker-defer-irreversible.sh` (lines 72-96)
- Impact: Adding new irreversible operation types requires shipping a new version of the hook; cannot be extended per-user or per-routine
- Fix approach: Migrate reversibility rules to a config file in `~/.sleepwalker/reversibility-rules.json` (loaded at hook runtime) to allow user-customization without code changes

**Token budget accounting uses character count approximation:**
- Issue: `sleepwalker-budget-cap.sh` divides (input + output length in bytes) by 4 to approximate tokens. This is a rough heuristic that breaks down for non-ASCII text, image descriptions, or tool responses with binary data.
- Files: `hooks/sleepwalker-budget-cap.sh` (lines 37-40)
- Impact: Routines may burn more tokens than budgets suggest, or consume less if text is short. Budget caps can be inaccurate by ±40%.
- Fix approach: Call Claude's `token-counter` endpoint or integrate a proper tokenizer (tiktoken library) if available in the hook environment

**install.sh merges hooks idempotently but doesn't validate existing hook chains:**
- Issue: The installer uses jq to append hooks to `~/.claude/settings.json`. It checks if the hook command path is already in the config, but doesn't validate that the hooks are actually present or executable in `~/.claude/hooks/`.
- Files: `install.sh` (lines 114-134)
- Impact: If a user manually deletes hook files after install, or a previous install partially failed, the dashboard and routines will silently bail out when they call the missing hooks (no error message).
- Fix approach: After wiring hooks, validate that each hook script exists and is executable; warn if not

**No timezone handling in sleep window checks:**
- Issue: Sleep window logic in `sleepwalker-defer-irreversible.sh` uses local system time via `date +%H` without considering timezone or DST transitions.
- Files: `hooks/sleepwalker-defer-irreversible.sh` (lines 55-60)
- Impact: If a user travels or their system timezone changes mid-sleep-window, defer policies may activate at the wrong time (routine runs during daytime and defers when it shouldn't, or vice versa)
- Fix approach: Use absolute UTC time plus a configurable offset in `settings.json` instead of hour-of-day checks

---

## Known Bugs

**Concurrent writes to `queue.jsonl` may corrupt entries under load:**
- Symptoms: If two deferred actions arrive within the same second, or two threads try to update `queue.jsonl` simultaneously, entries can be lost or partially written
- Files: `hooks/sleepwalker-defer-irreversible.sh` (line 110), `dashboard/lib/queue.ts` (line 59)
- Trigger: Multiple concurrent Claude Code sessions (main + background routines) both deferring actions during peak hours; or dashboard approving while a new routine is writing
- Workaround: None — this is a race condition that only manifests at high concurrency
- Fix approach: Use atomic writes with a lock file (`flock` in bash, or `fs.writeFileSync` with exclusive mode in Node.js)

**`_detect_fleet.sh` reads transcript with `head -c 65536` which truncates very long transcripts:**
- Symptoms: If a routine runs for a very long time and generates a transcript >64KB, the fleet detection may fail to find the `[sleepwalker:...]` marker and incorrectly classify the session as non-sleepwalker
- Files: `hooks/_detect_fleet.sh` (line 39)
- Trigger: Long-running routines with large outputs (vision processing, file listing, etc.)
- Workaround: Clear the session cache at `~/.sleepwalker/sessions/<session_id>.fleet` and re-run the hook
- Fix approach: Increase buffer size or stream-search for the marker pattern without loading the entire file

**GitHub PR polling doesn't handle pagination >50 PRs per repo:**
- Symptoms: If a tracked repo has >50 open PRs, only the first 50 are returned; `claude/sleepwalker/*` PRs beyond that won't appear in the Morning Queue
- Files: `dashboard/lib/github.ts` (line 46)
- Trigger: High-velocity repos with many open PRs
- Workaround: Close old PRs or filter tracked repos
- Fix approach: Implement pagination loop to fetch all results (GitHub returns `Link` header; use it to continue fetching)

**Cloud routine credentials stored in plaintext JSON without encryption:**
- Symptoms: `~/.sleepwalker/cloud-credentials.json` contains bearer tokens in plaintext. If the machine is physically compromised or a backup is stolen, tokens can be extracted.
- Files: `dashboard/lib/settings.ts` (lines 138-140) — file is mode 0600 but content is plaintext
- Trigger: Machine theft, backup breach, compromised backup service
- Workaround: Rotate tokens frequently via claude.ai/code/routines settings page
- Fix approach: Encrypt tokens using the system keychain (macOS Keychain, Linux libsecret) instead of storing in JSON

---

## Security Considerations

**API trigger bearer tokens shown once on screen but not recoverable:**
- Risk: When setting up cloud routine API triggers, the token is shown once in the browser and then hidden. If the user doesn't copy it, or loses the copy, there's no way to retrieve it (not returned by `GET /api/cloud/fire`).
- Files: `dashboard/app/cloud/cloud-client.tsx` (lines 112-180), `dashboard/lib/settings.ts` (lines 169-175)
- Current mitigation: File is mode 0600; tokens marked as secret in interface (password input)
- Recommendations: 
  1. Add a "Show token" toggle with confirmation (to prevent accidental exposure in screenshots)
  2. Add a "Download token as file" button that saves to `~/Downloads/sleepwalker-<routine>.token` (mode 0600)
  3. Emit a warning if the token isn't copied before dismissing the dialog
  4. Add token rotation endpoint (clear old, generate new) accessible from dashboard

**GitHub token stored in plaintext at `~/.sleepwalker/github-token`:**
- Risk: Same as cloud credentials — if machine is compromised, token can be extracted
- Files: `dashboard/lib/settings.ts` (lines 98-103)
- Current mitigation: File is mode 0600; never returned via API
- Recommendations: Use system keychain instead of plaintext file

**Bash hook input validation is minimal:**
- Risk: Hooks parse JSON from stdin without validating structure. If Claude Code ever sends a malformed hook input, parsing could fail and hooks could silently allow dangerous actions.
- Files: All hook scripts (lines reading from stdin)
- Current mitigation: `set -euo pipefail` halts on jq errors
- Recommendations: Add explicit schema validation and logging when input parse fails

**Defer hook bash command detection uses string pattern matching:**
- Risk: A command like `echo "rm -rf /"` would be classified as `red` and deferred, even though it's harmless. Conversely, `git push` disguised as `GIT_PUSH=1 bash -c 'git push'` might slip through.
- Files: `hooks/sleepwalker-defer-irreversible.sh` (lines 77-96)
- Current mitigation: Patterns are broad enough to catch most cases
- Recommendations: 
  1. Add logging of deferred commands (with --dry-run if possible)
  2. Add override mode for advanced users to mark specific sessions as "bypass defer"
  3. Consider using Claude Code's native AST if available instead of string matching

**Install.sh overwrites hooks without backup:**
- Risk: `install.sh` copies hooks into `~/.claude/hooks/` with `cp -f`, overwriting any existing files. If the user had custom hooks, they're lost.
- Files: `install.sh` (line 85)
- Current mitigation: Script is idempotent on re-run
- Recommendations: Back up overwritten files to `~/.claude/hooks/.backup/` before replacing

---

## Performance Bottlenecks

**GitHub polling on every dashboard page load:**
- Problem: Every time the user opens the dashboard, `GET /api/queue` calls `fetchCloudQueue()`, which polls all tracked repos' PRs. With 5+ repos, this can take 3-5 seconds.
- Files: `dashboard/lib/queue-aggregator.ts` (line 22), `dashboard/lib/github.ts` (line 46)
- Cause: No caching between page loads; GitHub API is slow; pagination loop (if fixed) will make it slower
- Improvement path: 
  1. Increase cache TTL from 60s to 5 minutes (current is too aggressive)
  2. Implement a background refresh on a timer instead of on-demand
  3. Add a "refresh now" button if user needs fresh data
  4. Batch repo queries (GitHub supports `repo:` OR queries)

**Cloud routine setup process requires manual copy-paste of bash command:**
- Problem: User must copy a `/schedule create` command from the dashboard and paste it into Terminal. Manual copy-paste is error-prone and slow.
- Files: `dashboard/app/cloud/page.tsx`, cloud routine setup docs
- Cause: No API for programmatic routine scheduling in Claude Code (as of v0.1)
- Improvement path: 
  1. Add copy-to-clipboard button (already has copy icon for other things)
  2. Provide QR code that links to a deep-link (claude.ai/code/routines?preset=<name>)
  3. Wait for Claude Code API to support routine scheduling

**Dashboard audit log read-all on every load:**
- Problem: `readAuditLog()` loads the entire `audit.jsonl` file and parses every line. With thousands of entries (1 per tool call), this can be 10-50MB.
- Files: `dashboard/lib/audit.ts`
- Cause: No pagination or streaming
- Improvement path:
  1. Add jsonl tail-read (read last N lines only)
  2. Paginate via HTTP (GET /api/audit?offset=0&limit=50)
  3. Archive old entries to a separate file

---

## Fragile Areas

**Bash hooks depend on jq being available in user's PATH:**
- Files: `hooks/*.sh`, `install.sh` (line 27-30)
- Why fragile: If `jq` is not installed or in a non-standard location, all hooks silently fail and allow all actions. `install.sh` checks for it, but doesn't check at hook runtime.
- Safe modification: Wrap jq calls with a check function; add jq availability assertion at hook startup
- Test coverage: `hooks/tests/` checks basic functionality but doesn't test with jq unavailable

**Queue status updates use read-modify-write without locking:**
- Files: `dashboard/lib/queue.ts` (line 62-70)
- Why fragile: `updateLocalStatus()` reads entire queue, finds and modifies one entry, writes back. If two updates happen simultaneously, one is lost.
- Safe modification: Use a lock file (`flock`) or write to a temp file and atomic rename
- Test coverage: Tests don't cover concurrent updates

**Dashboard Next.js API routes assume `process.env.HOME` is set:**
- Files: All `lib/*.ts` files (e.g., `dashboard/lib/settings.ts` line 6)
- Why fragile: If HOME is unset (edge case in some CI/CD or Docker environments), state files go to undefined location
- Safe modification: Validate HOME at startup; throw error if unset
- Test coverage: Tests mock HOME via `makeTempHome()`

**Cloud routine config parsing silently skips malformed entries:**
- Files: `dashboard/lib/cloud.ts` (lines 54-65)
- Why fragile: If a `config.json` is invalid JSON, the entire routine is skipped with no warning
- Safe modification: Log warnings for skipped routines; validate configs at dashboard startup
- Test coverage: No tests for malformed configs

**`bin/sleepwalker-execute` doesn't handle partial task failures:**
- Files: `bin/sleepwalker-execute` (line 63)
- Why fragile: If re-execution fails (e.g., Claude Code crashes, network error), the task is moved to `executed/` as "failed" but never retried. User must manually re-approve.
- Safe modification: Add retry queue for failed executions; add exponential backoff
- Test coverage: No integration tests for execute script

---

## Scaling Limits

**Per-session budget tracking grows unbounded:**
- Current capacity: `~/.sleepwalker/budgets.json` stores one entry per `{fleet}___{session_id}`. With 6 local fleets + multiple daily sessions = ~100s of entries in the JSON file.
- Limit: At 10,000 concurrent sessions (unlikely but possible in shared setups), JSON parsing becomes slow
- Scaling path: Migrate to a time-series database (local SQLite) keyed by `{fleet, session_id, hour}`. Clean up old entries daily.

**Local queue JSONL append-only growth:**
- Current capacity: `~/.sleepwalker/queue.jsonl` is append-only. With 50 deferred actions/day, grows 1.8MB/year.
- Limit: No practical limit, but dashboards that load entire file into memory will slow down
- Scaling path: Implement archival (move entries >30 days old to `queue.archive.jsonl`)

**GitHub API rate limits (5,000 requests/hour for authenticated users):**
- Current capacity: Dashboard caches cloud queue for 60s. With 60 users each polling once per minute, that's 60 requests/hour — safe.
- Limit: Scales up to 5,000/hour before hitting GitHub's limit
- Scaling path: If deployed to Anthropic infrastructure, implement shared rate-limit bucket across all users

---

## Dependencies at Risk

**jq is a shell dependency with no fallback:**
- Risk: If jq is not available, all hooks break silently
- Impact: Defer policies don't work; all actions pass through
- Migration plan: 
  1. Add fallback JSON parsing using shell built-ins (brittle but possible)
  2. Vendor a statically-compiled jq binary in the repo
  3. Document as a required system dependency and fail gracefully

**Claude Code's hook API stability unknown:**
- Risk: Hook schema (`PreToolUse`, `PostToolUse` input/output formats) may change in future Claude Code versions
- Impact: Hooks may break silently if Claude Code changes the input format
- Migration plan: 
  1. Add version checks to hook scripts (parse and validate input schema)
  2. Monitor Claude Code release notes for hook API changes
  3. Test against beta/preview Claude Code versions

---

## Missing Critical Features

**No end-to-end testing of production cloud routines:**
- Problem: The Zen test bundle proves the bridge works, but the 8 production routines haven't been validated by users yet. A buggy prompt or missing dependency could cause all cloud routines to fail silently.
- Blocks: First-time cloud routine users don't know if it's working until 24h later
- Fix approach:
  1. Add manual "test run" button in dashboard for each cloud routine (fires with synthetic test payload)
  2. Add synthetic daily test run per cloud routine (separate from user's actual scheduled run)
  3. Add sample output in each routine's setup.md (show what success looks like)

**No way to verify that Desktop's Schedule tab runs SKILL.md files:**
- Problem: The README notes that v0.1 "couldn't verify" whether Desktop's Schedule tab actually surfaces and runs routines. If Desktop doesn't support it, the entire local fleet is non-functional.
- Blocks: Setup can't be completed without verifying this works
- Fix approach:
  1. Manually test with one routine (add a marker file at install time, check if local routine was run)
  2. Add a test routine that writes a timestamp to `~/.sleepwalker/local-fleet-test.txt`
  3. Wait 1 minute and check if file was updated

---

## Test Coverage Gaps

**API trigger fire-routine tests don't cover network failures during fetch:**
- What's not tested: Timeouts, partial responses, malformed JSON from the fire endpoint
- Files: `dashboard/tests/fire-routine.test.ts` (lines 58-166)
- Risk: Network errors could return ok=false but the dashboard might not render them properly
- Priority: Medium

**Hook script tests don't cover jq unavailable:**
- What's not tested: Behavior when jq is not in PATH
- Files: `hooks/tests/run-tests.sh`
- Risk: Hooks fail silently without any error message
- Priority: High

**GitHub polling tests don't cover pagination or missing repos:**
- What's not tested: >50 PRs per repo, invalid token, archived repos
- Files: `dashboard/tests/cloud.test.ts`
- Risk: Real-world GitHub usage may hit these edge cases
- Priority: Medium

**Queue status update tests don't cover concurrent writes:**
- What's not tested: Two simultaneous calls to `updateLocalStatus()`
- Files: `dashboard/tests/queue.test.ts` (lines 1-75)
- Risk: Race condition in production could lose approvals
- Priority: High

**No tests for `bin/sleepwalker-execute` script:**
- What's not tested: Task file parsing, claude -p invocation, re-execution loop
- Files: `bin/sleepwalker-execute`
- Risk: Approval loop could have silent failures
- Priority: Critical

---

## Known Unknowns (from README "Designed but not verified")

**Whether Desktop's Schedule tab actually surfaces and runs SKILL.md files:**
- Status: Unverified — format matches docs but untested on real Desktop
- Impact: If Schedule tab doesn't work, the entire 6-routine local fleet is non-functional

**Whether the 8 production cloud routines produce useful output:**
- Status: Bridge is verified; individual routines are untested at scale
- Impact: Routines might have broken prompts, missing dependencies, or bad assumptions about repo structure

---

*Concerns audit: 2026-04-18*
