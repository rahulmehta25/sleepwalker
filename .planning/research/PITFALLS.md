# Pitfalls Research

**Domain:** Multi-runtime agent orchestration on macOS (launchd-scheduled CLI agents + dashboard deployment)
**Researched:** 2026-04-18
**Confidence:** HIGH for launchd/CLI-auth pitfalls (extensive upstream issue trackers + Apple docs), MEDIUM for programmatic Routine API stability (feature is in research preview), MEDIUM for multi-user installation pitfalls (Rahul is the only v0.2 user).

Scope: New problems that the v0.2 work will introduce. Problems already present in v0.1 are tracked in `.planning/codebase/CONCERNS.md` and are *not* duplicated here — this file focuses on what the new multi-runtime deployment surface adds.

**Expected roadmap shape (for phase mapping):**
- **Phase 0 — Groundwork:** shared types, runtime detection, directory conventions
- **Phase 1 — Adapters:** per-runtime deploy/trigger/audit adapters (Claude Routines, Claude Desktop, Codex, Gemini)
- **Phase 2 — Editor:** Next.js authoring UI (form + Monaco + save-to-disk)
- **Phase 3 — One-click deploy + Run-now:** dashboard buttons glued to adapters, rollback on partial failure
- **Phase 4 — Unified audit/queue:** CLI stdout → `audit.jsonl` with normalized shape
- **Phase 5 — Docs, templates, OSS polish:** `docs/AUTHORING.md`, per-runtime templates, second-user validation

---

## Critical Pitfalls

### Pitfall 1: Launchd doesn't inherit `$PATH`; `claude`/`codex`/`gemini` not found at 03:00

**What goes wrong:**
Dashboard generates a plist with `ProgramArguments = ["/bin/bash", "-c", "codex exec ..."]`. It works when tested because the dev dashboard runs in a login-shell context where `codex` is on PATH. At 03:00 on the scheduled tick, launchd invokes the job with a bare `PATH=/usr/bin:/bin:/usr/sbin:/sbin` and the command fails with `codex: command not found`. StandardErrorPath may not even be set, so the failure is invisible until the user notices an empty Morning Queue.

**Why it happens:**
launchd does not run a login shell, does not source `.zshrc`/`.bash_profile`, and does not pull in `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, or version-manager shims (nvm/pyenv/rbenv). This is the single most documented launchd footgun; the canonical answer is "never assume a PATH, always use absolute paths."

**How to avoid:**
1. At plist-generation time, resolve the absolute path of the runtime binary using `which codex` / `command -v codex` run **inside a login shell** (`/bin/zsh -l -c 'command -v codex'`) from the dashboard's Node server. Store that absolute path in the plist's `ProgramArguments[0]`.
2. Write `EnvironmentVariables.PATH` into the plist explicitly: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`, plus `HOME` and `USER`.
3. Always set `StandardOutPath` and `StandardErrorPath` (to `~/.sleepwalker/logs/<slug>.out` / `.err`) so silent failures become visible.
4. In the adapter's `verify()` step after `launchctl bootstrap`, run `launchctl print gui/$UID/com.sleepwalker.<slug>` and confirm `last exit code = 0` OR that no exit has occurred yet.

**Warning signs:**
- `~/.sleepwalker/logs/<slug>.err` contains `command not found` or `No such file or directory`.
- `launchctl list | grep sleepwalker` shows exit code 127.
- Morning Queue has zero entries for a routine that should have fired overnight.

**Phase to address:** Phase 1 (adapters — every launchd-writing adapter for Codex, Gemini, and Claude Desktop must follow this pattern from day one; retrofitting is painful because every existing plist needs rewriting).

---

### Pitfall 2: Codex CLI auth mode collision — subscription login eats env-var API key

**What goes wrong:**
Rahul logs into `codex` interactively with his ChatGPT Pro subscription. Sleepwalker writes a plist that sets `OPENAI_API_KEY` in `EnvironmentVariables` (expecting CLI-driven auth for deterministic behavior). At runtime, Codex silently ignores the env var and consumes ChatGPT Pro quota instead — or worse, errors with `"You are currently using ChatGPT, while your preferred method is API key"` and exits non-zero with no output to the queue.

**Why it happens:**
Documented upstream behavior ([openai/codex#2733](https://github.com/openai/codex/issues/2733), [#3286](https://github.com/openai/codex/issues/3286)): Codex CLI prefers the subscription credential in `~/.codex/auth.json` over the env var unless you explicitly set `preferred_auth_method = "apikey"` in `~/.codex/config.toml` or pass `--config preferred_auth_method="apikey"`. Even then, a stale session file can override.

**How to avoid:**
1. Don't try to centralize Codex auth in the plist. Let Codex use whatever `~/.codex/auth.json` says — it's the user's choice.
2. In the adapter's `detectRuntime()` step, run `codex whoami` (or the equivalent status probe) and record which auth mode is active. Show it in the dashboard next to the runtime indicator: `Codex Pro (ChatGPT Pro subscription)` vs `Codex (API key)`.
3. Warn loudly in the dashboard if `OPENAI_API_KEY` is set in the shell environment but `~/.codex/auth.json` shows subscription login — this is the collision state.
4. Do not write `OPENAI_API_KEY` into the plist. If a user wants API-key mode, they set it in `~/.codex/config.toml` themselves; document this in `docs/AUTHORING.md`.
5. Per-routine cost cap should read `codex /status` output after each run, not try to compute quota from env-var assumptions.

**Warning signs:**
- Stderr log contains `"preferred method is API key"` or `"Reconnecting"`.
- Routine runs burn ChatGPT Pro quota silently; user hits the 5-hour window unexpectedly.
- `codex` command returns exit 0 but produces no stdout (common when auth works but then hits a soft block).

**Phase to address:** Phase 1 (Codex adapter) — explicit `detectRuntime()` probe must happen before any plist is written.

---

### Pitfall 3: Gemini CLI's quota-project requirement bites when gcloud is already configured

**What goes wrong:**
User has `gcloud` installed for another project (e.g., their day job's GCP). Sleepwalker's Gemini adapter invokes `gemini` with no `--project` flag, relying on Gemini's default auth. The day-job project has Gemini API disabled or uses a different quota project, so the routine fails with `"Quota exceeded"` or `"API not enabled"` — even though Rahul has a Google AI Pro subscription that should cover it.

**Why it happens:**
Gemini CLI's auth flow conflicts with pre-existing `gcloud` state ([google-gemini/gemini-cli#12121](https://github.com/google-gemini/gemini-cli/issues/12121), [#8883](https://github.com/google-gemini/gemini-cli/issues/8883)). The CLI picks up `GOOGLE_CLOUD_PROJECT`, `gcloud config get-value project`, and `gcloud config get-value billing/quota_project` in an order that's not obvious. Enterprise Workspace OAuth bypasses the Admin API consent flow entirely. "You exceeded your current quota" with 84% context remaining is a reported user-facing symptom.

**How to avoid:**
1. In the Gemini adapter's `detectRuntime()` step, run `gemini --version` AND `gcloud config configurations list` AND check `echo $GOOGLE_CLOUD_PROJECT`. Report the full auth picture in the dashboard.
2. In the plist, explicitly set `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_QUOTA_PROJECT` in `EnvironmentVariables` — pulled from the user's stated preference in dashboard settings, not auto-detected.
3. Provide a "Test Gemini auth" button in settings that runs `gemini -p "echo 'hello'"` with the configured env and shows the result. Must pass before any Gemini routine can be deployed.
4. If `GOOGLE_APPLICATION_CREDENTIALS` is set in the user's shell, surface it in the dashboard with a warning — it will override subscription auth and burn different quota.

**Warning signs:**
- Stderr contains `"Quota exceeded"`, `"API not enabled"`, `"billing/quota_project"`, `"/privacy error"`.
- Routine works when run manually in Terminal but fails from launchd (different env).
- Dashboard's "Test Gemini auth" button fails but the user's interactive `gemini` session works.

**Phase to address:** Phase 1 (Gemini adapter).

---

### Pitfall 4: Shell injection via routine prompt — prompt contains `$`, backticks, or command separators

**What goes wrong:**
User writes a routine prompt: `Review today's logs in /var/log/ and summarize any "error" lines containing $USER or \`whoami\``. Sleepwalker writes a plist that does `codex exec "<prompt>"` with the prompt pasted directly into `ProgramArguments[-1]` or into a bash-wrapped `-c` string. At runtime, `$USER` and `` `whoami` `` are expanded by the shell, the prompt is mutated, and — in the malicious case — an attacker who can edit the routine file gets arbitrary command execution as Rahul's user.

**Why it happens:**
Sleepwalker's v0.1 pattern is bash-heavy (hooks use `set -euo pipefail` + jq); the natural way to extend it for CLI runtimes is to keep shelling out. Node.js's `child_process.exec()` with a shell string is the canonical way to introduce command injection ([Semgrep cheat sheet](https://semgrep.dev/docs/cheat-sheets/javascript-command-injection)). Escaping is error-prone; users *will* paste prompts with quotes, backslashes, Unicode, and multiline content.

**How to avoid:**
1. **Never** embed the prompt into `ProgramArguments` as a single shell string. Write the prompt to a file (`routines-<runtime>/<slug>/prompt.md`) and invoke the CLI with a flag that reads from stdin or a file path: `codex exec -f /path/to/prompt.md` or `gemini -p "$(cat /path/to/prompt.md)"` — but the cleanest pattern is stdin redirection in a wrapper script.
2. In the adapter, generate a wrapper script `~/.sleepwalker/scripts/<slug>.sh` with `set -euo pipefail`, absolute paths, and `cat /path/to/prompt.md | codex exec --stdin`. The plist `ProgramArguments` becomes `["/bin/bash", "/Users/…/.sleepwalker/scripts/<slug>.sh"]` — no user prompt ever lives in a shell-parsed string.
3. When the dashboard uses Node to spawn any subprocess (for Run-now / diagnostic probes), use `child_process.spawn(cmd, argsArray)` with arguments as an array; never use `exec(`${cmd} ${args}`)`.
4. Validate the routine slug against `^[a-z][a-z0-9-]{0,63}$` on the save path — it becomes a filename and a launchd label, so `../` and shell metacharacters must be rejected.
5. In the routine editor, the "prompt" field is plain text and saved as a binary-safe file (UTF-8, no shell expansion). The "reversibility" and "schedule" fields are typed/selected, not free text.

**Warning signs:**
- Routine behaves differently when run via launchd vs when run by the Run-now button (shell expansion happens in one and not the other).
- Dashboard logs contain the literal text of a prompt — this means the prompt was interpolated into a command string that was logged.
- `ps aux | grep codex` at 03:00 shows environment variables from the prompt leaked into the argv.

**Phase to address:** Phase 0 (directory conventions must include the wrapper-script pattern) + Phase 1 (every adapter follows it). Must be established before the editor (Phase 2) lands, because retrofitting a wrapper layer onto existing prompts is painful.

---

### Pitfall 5: Partial-success deploy leaves the system in a wedged state

**What goes wrong:**
User clicks "Deploy" on a new Codex routine. Sleepwalker:
1. Creates `routines-codex/my-routine/` directory ✓
2. Writes `prompt.md` ✓
3. Writes `config.json` ✓
4. Writes `~/Library/LaunchAgents/com.sleepwalker.my-routine.plist` ✓
5. Calls `launchctl bootstrap gui/$UID …` ✗ (fails because a plist with the same label from a previous deploy attempt is still loaded)

Now: the routine files exist on disk, the plist exists on disk, but launchd refused to load it. The dashboard shows "Deployed" (because file writes succeeded) but the routine will never fire. User rediscovers this at 07:00 with an empty queue.

**Why it happens:**
Cross-filesystem deployment is inherently multi-step; idempotency requires a state-machine approach ([OneUptime idempotency guide](https://oneuptime.com/blog/post/2026-01-30-idempotency-implementation/view)) where the system tracks "intent executed" separately from each step's success. Sleepwalker v0.1 has a sympathetic bug in `install.sh`: it wires hooks into `settings.json` but doesn't verify they're executable. This pattern will get *worse* in v0.2 because there are now 5–6 steps per deploy instead of 2.

**How to avoid:**
1. Model deploy as a 4-phase state machine: `planning → writing → loading → verified`. Store the current phase in `~/.sleepwalker/deploys/<slug>.state.json` with a `steps[]` array of `{step, status, timestamp, error}`. Never claim "Deployed" in the UI until `verified` is reached.
2. Each step must have a matching rollback:
   - `writing` rollback: delete routine dir + plist
   - `loading` rollback: `launchctl bootout` + delete plist
3. The final `verified` step must actually probe: `launchctl print gui/$UID/com.sleepwalker.<slug>` returns state `waiting` or `running`, and `~/Library/LaunchAgents/com.sleepwalker.<slug>.plist` exists. If probe fails, auto-rollback.
4. Re-deploy (idempotent case): if `state.json` shows `verified`, compare the incoming plist to the on-disk plist. If identical, no-op. If different, run `launchctl bootout` first, then re-bootstrap.
5. Dashboard UI: show deploy progress step-by-step (a 4-step checklist that fills in as each state transition completes). This makes partial failures immediately visible.

**Warning signs:**
- `~/Library/LaunchAgents/com.sleepwalker.*.plist` files exist but `launchctl list | grep sleepwalker` shows fewer loaded jobs.
- `~/.sleepwalker/deploys/<slug>.state.json` has `status != "verified"` but the routine appears in the dashboard's Routines tab.
- Run-now button works for a routine that has never fired on schedule.

**Phase to address:** Phase 3 (one-click deploy) — state machine must be the foundation of the deploy button; retrofitting a state machine onto an already-shipped flat deploy is a rewrite.

---

### Pitfall 6: Monaco editor crashes Next.js SSR with `window is not defined`

**What goes wrong:**
Developer adds `import MonacoEditor from '@monaco-editor/react'` into a Next.js App Router page component. On first request, Next.js tries to SSR the page, Monaco touches `window` or `navigator` during module initialization, and Next crashes with `ReferenceError: window is not defined`. Dashboard's editor page returns a 500 in production; in dev, it flashes an error overlay before the client hydrates.

**Why it happens:**
Monaco is fundamentally a browser-only library. Next.js App Router defaults to server rendering everything. Dynamic imports with `ssr: false` exist but are unsupported in Turbopack as of early 2026 ([vercel/next.js#72613](https://github.com/vercel/next.js/issues/72613)).

**How to avoid:**
1. Keep using Webpack dev server for the dashboard (don't switch to Turbopack until the Monaco SSR issue lands upstream). Check `dashboard/next.config.ts` after adding the editor.
2. Wrap Monaco in a client-only component:
   ```tsx
   'use client';
   import dynamic from 'next/dynamic';
   const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div>Loading editor…</div> });
   ```
3. Mount the editor inside a parent that's already `'use client'` — don't try to render it from a Server Component.
4. Have a non-Monaco fallback for the editor (plain `<textarea>` with a toggle): useful for accessibility and when Monaco's async load hangs on slow connections.
5. Write a Vitest test that imports the editor wrapper component and asserts it renders without throwing — catches SSR regressions on PR.

**Warning signs:**
- `pnpm build` succeeds but first production request returns 500.
- Dev overlay shows `window is not defined` on the editor page.
- Browser console: `Cannot find module '@monaco-editor/react'` (indicates the dynamic import misfired).

**Phase to address:** Phase 2 (editor). The Monaco decision is load-bearing; validate with a bare "hello world" Monaco page **before** building the form around it.

---

### Pitfall 7: Cross-runtime slug collision — same `my-routine` in 2 runtimes desyncs state

**What goes wrong:**
User creates a Codex routine named `daily-brief`. Two weeks later, they create a Gemini routine also named `daily-brief` because they forgot. Sleepwalker's Morning Queue shows entries from both with `fleet: daily-brief`; the audit log can't distinguish which runtime produced a given entry; approving one "daily-brief" action accidentally re-executes via the wrong runtime. Budget caps for "daily-brief" sum across both runtimes, which is wrong.

**Why it happens:**
v0.1 uses `[sleepwalker:<fleet>]` marker tags keyed only by fleet name — no runtime namespace. The directory convention `routines-<runtime>/<slug>/` implicitly assumes slug uniqueness across runtimes but doesn't enforce it. When v0.2 adds Codex and Gemini, the fleet-name space suddenly triples and collisions are inevitable.

**How to avoid:**
1. Namespace every identifier: internal key becomes `<runtime>/<slug>`, e.g., `codex/daily-brief` and `gemini/daily-brief` are different. The marker tag becomes `[sleepwalker:codex/daily-brief]`. Fleet name in queue entries becomes `codex/daily-brief`.
2. Audit log entries gain a `runtime` field (one of: `claude-routines`, `claude-desktop`, `codex`, `gemini`).
3. Launchd labels use the runtime too: `com.sleepwalker.codex.daily-brief` not `com.sleepwalker.daily-brief`. This prevents launchd-level collision (which would manifest as `launchctl bootstrap` silently replacing the wrong job).
4. Editor "Save" validates: if a routine with the same `(runtime, slug)` already exists, show "already exists — overwrite?". Collisions across runtimes are allowed but visible.
5. Migration for v0.1 routines: they get `runtime: "claude-desktop"` (local fleet) or `runtime: "claude-routines"` (cloud fleet) prepended when v0.2's unified reader scans them. Keep the old unprefixed directory layout working for backward compat.

**Warning signs:**
- Two queue entries with identical fleet name but different `source` fields.
- Audit entries for the same tool call that appear to be from two fleets.
- `launchctl list | grep sleepwalker` shows fewer jobs than expected (two deploys overwrote each other).

**Phase to address:** Phase 0 (naming conventions must be settled before any adapter writes its first plist).

---

### Pitfall 8: Codex/Gemini stdout has ANSI escape codes and breaks the audit UI

**What goes wrong:**
Codex CLI prints colored spinners, bold text, and `\x1b[2K` (erase-line) codes to stdout when it detects a TTY. Sleepwalker's audit-append code naively writes the raw bytes into `audit.jsonl`. The dashboard's audit page renders these bytes as text, showing gibberish like `[32m✓[0m loaded` or breaking JSON parsing entirely when a raw byte happens to be `"` or newline.

**Why it happens:**
CLIs inherit `isatty()` state from their parent. When spawned from launchd or Node.js without explicit TTY disabling, some CLIs still emit color codes ([nodejs/node#26187](https://github.com/nodejs/node/issues/26187)). Claude Code's own output is usually safe, but Codex and Gemini are third-party and not under our control.

**How to avoid:**
1. In the wrapper script, set `NO_COLOR=1`, `TERM=dumb`, `CI=true` — this covers ~90% of CLIs that respect env-var color control.
2. Still, pipe stdout through a stripping filter before writing: in the wrapper, `codex exec -f prompt.md 2>&1 | tr -d '\000-\010\013\014\016-\037'` to remove ANSI control bytes, or pipe through a small Node/Python ANSI-strip step.
3. In the Node audit-append code, use `strip-ansi` (npm) or `stripVTControlCharacters` (Node built-in since v20) on every string before writing to `audit.jsonl`.
4. Before JSON-serializing audit entries, truncate to a safe length (keep v0.1's 500-char preview), and use `JSON.stringify` (which correctly escapes); don't string-concatenate.
5. Binary blobs (images from a screenshot-taking CLI, or tool responses with base64): detect `^.PNG\r\n`/`^JFIF`/`^\xff\xd8` at the start of stdout; store binary blobs in `~/.sleepwalker/artifacts/<ts>.<ext>` and put a path reference in the audit entry.

**Warning signs:**
- Audit page shows `�` characters, `[32m` prefixes, or rows that render weirdly.
- `audit.jsonl` contains a line that `jq .` refuses to parse.
- Audit file size grows alarmingly (raw TTY frame-redraws balloon 10x normal output).

**Phase to address:** Phase 4 (unified audit/queue) — establish the strip-and-sanitize pipeline when the first CLI adapter's audit path lands.

---

### Pitfall 9: Git commits from the dashboard clobber user's uncommitted work

**What goes wrong:**
User is mid-edit in a terminal: `CONCERNS.md` has 30 lines of uncommitted changes. User clicks "Save to repo" in the Sleepwalker dashboard for a new routine. Dashboard's `git add routines-codex/new-routine/ && git commit -m "..."` runs — and the commit includes the unrelated uncommitted `CONCERNS.md` changes if the add is too broad, OR the commit succeeds but now the user's terminal `git status` shows a confusing state ("why does my HEAD have a commit I didn't make?").

**Why it happens:**
The dashboard and user share the same working tree. Git doesn't lock the index. Two processes racing `git add` + `git commit` can interleave. Even without a race, `git add -A` or `git add .` sweeps up anything in the tree; broader-than-expected commits are a common Git CI/automation footgun.

**How to avoid:**
1. **Only** stage with explicit paths: `git add routines-codex/<slug>/prompt.md routines-codex/<slug>/config.json` — never `git add .` or `git add -A`. The paths must be derived from the exact files the user just saved, not inferred.
2. Before committing, run `git status --porcelain -- routines-codex/<slug>/` and verify only the expected files show up. If unrelated files appear in the intended path (unlikely but possible with directory races), abort with a clear error.
3. Run `git diff --cached --stat` and show the user what's about to be committed in a confirmation dialog. "Save to repo" is a two-click operation: Save → Review diff → Confirm commit.
4. Wrap the commit in a file-based lock: `flock ~/.sleepwalker/git.lock bash -c 'git add … && git commit …'`. If lock contention occurs, fall back gracefully with "Another save is in progress, try again."
5. Never auto-push. The user explicitly requested this in PROJECT.md ("local commit, no auto-push"). Don't tempt fate.
6. Handle the "nothing staged" case: if `git diff --cached --exit-code` reports no changes after `git add`, don't create an empty commit.
7. If git operation fails (merge conflict, index lock, hook rejection), the file-level save must NOT be rolled back — the routine files stay on disk. Only the git commit rolls back. User sees "Files saved. Git commit failed: <reason>" with a retry button.

**Warning signs:**
- Dashboard commit includes files outside `routines-*/`.
- `git status` shows a confusing mixture of changes after clicking Save.
- `git log -1 --stat` shows a commit with significantly more files than the UI implied.
- `.git/index.lock` persists after an error.

**Phase to address:** Phase 3 (one-click deploy also requires the Save-to-repo workflow; they share the commit pattern).

---

### Pitfall 10: Mac sleeps with lid closed; scheduled routine never fires

**What goes wrong:**
Rahul closes his MacBook lid at 22:30 before bed. Routine is scheduled for 03:00. Mac sleeps. At 03:00, launchd *does not* wake the Mac for a `StartCalendarInterval` event. At 07:00, Rahul opens the lid, Mac wakes, launchd runs all coalesced events (the missed 03:00 run happens at 07:01), but the Morning Queue is now empty because the routine is still running when he looks at it. Worse case: the routine takes 8 minutes, and Rahul has already driven to the office.

**Why it happens:**
Documented launchd behavior: if the machine is asleep when `StartCalendarInterval` fires, the job runs on wake, with multiple missed events coalesced into one run. But MacBook default is sleep-on-lid-close. Apple Silicon models make clamshell-with-no-monitor more restrictive than Intel. PROJECT.md constraint explicitly acknowledges "Mac must be awake during the scheduled slot" as an accepted tradeoff, but v0.2's OSS users won't know this.

**How to avoid:**
1. Dashboard Settings: "Sleep check" widget that runs `pmset -g` and shows current sleep state. If `sleep 1` or `disksleep 1`, warn: "Your Mac will sleep when the lid closes — overnight routines may not fire on time."
2. Offer a one-click `pmset` suggestion (displays the exact command for the user to run in Terminal; we do NOT run `pmset` from the dashboard because it requires sudo and changing power settings without permission is hostile).
3. In the plist, set `StartCalendarInterval` to fire at the *earliest* time the Mac is likely awake (configurable, default 07:00), not 03:00. The routine itself can wait until 03:00 internally if it needs to simulate overnight work — but the launchd trigger should be at wake time. This is a design shift from "fire at 03:00" to "fire when the user wakes."
4. Document this prominently in `docs/AUTHORING.md`: "Routines run when your Mac is awake. If you schedule 03:00 but your Mac sleeps, the routine runs on next wake." Include the `caffeinate` + `pmset` alternatives.
5. Use `StartInterval` (every N seconds) for routines that genuinely need repetitive firing, and `StartCalendarInterval` for "once at this time" — the coalescing behavior differs and StartInterval is more forgiving if wake happens mid-window.

**Warning signs:**
- User reports "routine never ran" but audit log shows a run at 07:12 (right after morning wake).
- `sysctl kern.waketime` vs the plist's `StartCalendarInterval` timestamp comparison shows systematic misses.
- Queue is always empty on Monday mornings (user sleeps longer on weekends, coalesced event hasn't fired yet).

**Phase to address:** Phase 5 (docs + polish) for the user-facing warning; Phase 1 (adapter) for the plist default choice of wake-time firing vs scheduled-time firing.

---

### Pitfall 11: Token leakage — prompts contain API keys that get logged

**What goes wrong:**
User writes a routine prompt: `Call the Stripe API at https://api.stripe.com with key sk_live_… and summarize yesterday's charges.` They save it. Sleepwalker writes the prompt to `routines-codex/billing/prompt.md`, then later commits it via Save-to-repo. The Stripe key is now in git history, possibly pushed to GitHub. Separately, `audit.jsonl` contains the prompt text as part of the "tool input preview" — so the key is in `~/.sleepwalker/audit.jsonl` (mode 0644 by default in some dirs) and in every audit-UI render.

**Why it happens:**
v0.1 treated the prompt as an opaque string because prompts were pre-written by Sleepwalker maintainers (no secrets in them). v0.2 opens the editor to the user, and users *will* paste secrets into prompts. Claude Code / Codex / Gemini all have better patterns for secret handling (env-var references, vault integrations) but the simple path a user takes is "paste the key into the prompt."

**How to avoid:**
1. Editor "Save" runs a secret scanner on the prompt body before writing. Use patterns from [gitleaks](https://github.com/gitleaks/gitleaks) or [trufflehog](https://github.com/trufflesecurity/trufflehog): `sk_live_`, `sk-ant-`, `ghp_`, `AIza`, `AKIA`, 40-char hex strings, Stripe/Twilio/etc. specific regexes.
2. If a potential secret is detected, block save with "This looks like a secret. Use `${ENV_VAR}` instead; see `docs/AUTHORING.md#secrets`."
3. The adapter supports `${VAR}` template expansion: prompts are templated and expanded from the user's `~/.sleepwalker/env/<slug>.env` (mode 0600, not in git). This file is NOT committed and the adapter explicitly adds it to `.gitignore`.
4. Audit log stores the *expanded* prompt only under a `DEBUG` setting, off by default. In normal mode, audit stores the *template* (with `${VAR}` placeholders intact).
5. Save-to-repo operation runs the secret scanner again as a last line of defense. If it finds something even after editor validation (user bypassed the UI), refuse to commit.
6. When generating a launchd plist, if any `EnvironmentVariables` value looks like a secret, warn the user and offer to store it in `~/.sleepwalker/env/<slug>.env` instead (which the wrapper script sources before invoking the CLI).

**Warning signs:**
- `git log -p routines-*/` | grep -E '(sk_|AKIA|AIza|ghp_)'` finds matches.
- `audit.jsonl` contains long hex strings or obvious key prefixes.
- User reports "my Stripe key rotated because someone used it" — too late, but a postmortem signal.

**Phase to address:** Phase 2 (editor) for the inline scanner; Phase 3 (deploy + save-to-repo) for the commit-time re-scan. Must be in place *before* any user authors a real routine.

---

### Pitfall 12: Claude Routines `/fire` beta-header churn breaks programmatic deploys

**What goes wrong:**
Sleepwalker's Claude Routines adapter sends `anthropic-beta: experimental-cc-routine-2026-04-01`. Six months later, Anthropic releases `experimental-cc-routine-2026-10-15` with a breaking request shape change. Old header continues to work for two versions, then is deprecated. User's Sleepwalker install keeps using the old header, silently degrades, and eventually starts receiving `410 Gone` responses. Routines that *used* to fire via Run-now now fail silently (dashboard shows "fired" but nothing happens).

**Why it happens:**
The Routines `/fire` endpoint is explicitly a research preview behind dated beta headers ([docs](https://code.claude.com/docs/en/web-scheduled-tasks)). Two-version compatibility window means users who don't update for 3-4 releases lose access. This is documented but easy to miss.

**How to avoid:**
1. Centralize the beta header in a single constant: `dashboard/lib/claude-routines.ts` exports `CC_ROUTINE_BETA = 'experimental-cc-routine-2026-04-01'`. Never inline.
2. On every dashboard start, `GET /routines` with the current header and check the response. If `410` or `400` with a header-version error message, show a prominent banner: "Claude Routines API has changed — Sleepwalker needs an update. See [URL]."
3. Store the *response* body shape version alongside cached data, so future schema mismatches surface as parse errors rather than silent data loss.
4. In `package.json`, add a comment about the required beta header pinned version so update-checking tools catch it.
5. Pin the Claude Code version in `docs/AUTHORING.md`'s compatibility table — update at each Sleepwalker release.

**Warning signs:**
- Run-now succeeds (HTTP 200) but the routine never creates a session.
- Response JSON has fields that don't match the documented shape.
- Dashboard cache contains nulls where IDs should be.

**Phase to address:** Phase 1 (Claude Routines adapter) — the version-check pattern must be there from day one, not added later.

---

### Pitfall 13: Second-user install exposes all the Rahul-specific assumptions

**What goes wrong:**
Rahul ships v0.2, a user on a different Mac tries `./install.sh` + dashboard deploy. Things fail:
- They're on Intel Mac, `brew` is `/usr/local/bin/brew`; Sleepwalker hardcoded `/opt/homebrew/bin/` in the wrapper scripts.
- They don't have `codex` installed but the Codex adapter's `detectRuntime()` probe crashes instead of gracefully disabling.
- Their shell is fish, not zsh — login-shell detection in the PATH-resolution logic fails.
- They have a space in their username (`~/Library/` path breakage).
- Their Mac is macOS 13 (Ventura) — some `launchctl` subcommands are macOS 14+.
- Their `claude` is installed via the MSI/pkg instead of npm; the binary path is different.

**Why it happens:**
v0.2 is Rahul-only testing. All the OSS users hit these on their first install. The dashboard works on Rahul's Mac because it's configured the way Rahul configured it.

**How to avoid:**
1. Build a `doctor` command: `./install.sh doctor` (or a dashboard "Diagnostics" page) that exhaustively probes:
   - macOS version (`sw_vers -productVersion`) — require >= 14.0
   - Architecture (`uname -m`) — branch logic for arm64 vs x86_64
   - Homebrew prefix (`brew --prefix` if available, else fall back search)
   - Each runtime CLI's absolute path (`command -v` across a list of likely locations)
   - Shell (`echo $SHELL`) — document fish/nu gotchas
   - Username contains non-ASCII/spaces
   - `~/Library/LaunchAgents/` exists and is writable
   - `launchctl` version / subcommand availability
   Report all of these in a single dashboard page.
2. In wrapper scripts, detect the brew prefix at runtime, not at install time: `BREW="$(arch | grep -q arm64 && echo /opt/homebrew || echo /usr/local)"`.
3. Runtime detection must degrade gracefully: if `codex` not found, the Codex adapter reports `{ available: false, reason: "..." }` — never crashes, never throws. Dashboard dims the runtime card with the reason in tooltip.
4. Ship an `examples/` directory with known-working routines per runtime. First-time users copy an example and modify — they don't write from scratch.
5. CI matrix: at minimum, test on one macOS 14 and one macOS 15 on both Intel and ARM. If no CI available, document the tested matrix explicitly.
6. `docs/AUTHORING.md` has a "Troubleshooting" section with the top 5 issues second-users hit, indexed by error message.

**Warning signs:**
- First-ever GitHub issue is titled "it doesn't work" with minimal repro details.
- Second user can't get past the Diagnostics page.
- Install script exits with status 0 but the dashboard shows no runtimes detected.

**Phase to address:** Phase 5 (OSS polish) — but the *architectural choices* that enable graceful degradation (abstract runtime detection, no hardcoded paths) must be made in Phase 0–1.

---

### Pitfall 14: Dashboard editor loses unsaved changes on navigation

**What goes wrong:**
User spends 10 minutes crafting a prompt in the routine editor. They click "Routines" in the sidebar to remind themselves of an existing routine's name. Next.js navigates client-side; the editor's unsaved state is gone. They navigate back and the form is blank. They rage-quit.

**Why it happens:**
Next.js App Router client navigation does NOT trigger `beforeunload`. Router `.push()` / `Link` clicks happen without warning. React form state lives in component memory; when the component unmounts, state dies. This is the classic "unsaved changes" problem, and it's *worse* in SPAs than in traditional multi-page apps because there's no browser-level warning.

**How to avoid:**
1. Persist editor state to `localStorage` on every keystroke (debounced 500ms): `localStorage.setItem('sleepwalker:editor:<slug>', JSON.stringify(formState))`. On editor mount, restore from localStorage if present.
2. Intercept navigation with `useEffect` + `beforeunload` (for window close) AND Next.js `useRouter` hooks (for in-app navigation). Prompt "You have unsaved changes — discard?".
3. Show a "dirty" indicator in the editor title: `● Untitled routine (unsaved)`.
4. Autosave to draft file: every 10 seconds, POST the current form state to `POST /api/routines/drafts/:slug` which writes to `~/.sleepwalker/drafts/<slug>.json`. Draft → saved transition happens on explicit "Save" click.
5. Disable the "Deploy" button until the routine is saved (draft state is not deployable). Visual indicator makes this obvious.
6. When the user returns to the editor later, show "You have a draft from [timestamp] — resume?" dialog.

**Warning signs:**
- User reports "I wrote a routine and it disappeared."
- localStorage sizes grow unbounded (no cleanup of old drafts).
- Two browser tabs open to the same routine — the last-saved wins silently.

**Phase to address:** Phase 2 (editor) — must be in the first editor iteration. Retrofitting autosave onto a UX where users have already lost work creates trust debt.

---

### Pitfall 15: Browser autosave / password manager corrupts the prompt field

**What goes wrong:**
User's password manager (1Password, Bitwarden) detects the large `<textarea>` for the prompt as a "notes" field and offers to autofill. Or Safari's autofill kicks in and inserts the user's address. Or the browser's spellcheck "helpfully" autocorrects a command name. Prompt is now corrupted in subtle ways — maybe a single character changed — and the routine behaves wrong.

**Why it happens:**
Browser form heuristics are aggressive. Large textareas trigger autofill in some managers. Password managers don't respect `autocomplete="off"` reliably (Chrome actively ignores it in many cases). Spellcheck on `<textarea>` is default-on.

**How to avoid:**
1. Use Monaco editor (not `<textarea>`) for the prompt field. Monaco's contenteditable-style internals are invisible to password managers.
2. If Monaco isn't used for some fields, set: `autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-form-type="other"`. The `data-*` attributes target 1Password and LastPass specifically.
3. Add a "Preview" step before save: show the prompt text exactly as it will be written to disk. User has a chance to spot autofill pollution before it persists.
4. On save, log a hash of the prompt to `audit.jsonl`. If the hash changes unexpectedly between save and next edit, investigate (could be an external edit, but also could be autofill).

**Warning signs:**
- Prompt text saved contains user's name, email, or address that the user didn't type.
- Command names appear misspelled in saved prompts (`commit` → `commute`).
- User reports "it saved the wrong thing" and can reproduce by opening the editor and watching autofill suggest.

**Phase to address:** Phase 2 (editor) — bake the Monaco choice in early for this reason alone.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline the user's prompt into a `bash -c "…"` plist argument | One-liner, no wrapper script to maintain | Shell injection, breaks on quotes/unicode, log leakage | Never |
| Hardcode `/opt/homebrew/bin` as the brew prefix | Works on Rahul's Mac today | Breaks on Intel Macs, breaks if user uses non-default prefix | Never for distributed code; OK for `install.sh` if it detects first |
| Skip the `verify` step after `launchctl bootstrap` | Faster deploy, simpler code | Partial failures wedge silently | Never |
| Use the same slug across runtimes without namespacing | Simpler URLs, shorter names in UI | Collision on the *next* routine the user adds | Never |
| Treat the first user (Rahul) as the test matrix | Fast iteration during v0.2 build | Second-user install fails, public issues flood in | OK through Phase 3; must harden by Phase 5 |
| Use `child_process.exec` with string command | Familiar API | Command injection, can't pass binary data | Never — always `spawn` with argv array |
| Store `OPENAI_API_KEY` / `GOOGLE_API_KEY` in plist `EnvironmentVariables` | Simple secret injection | Plist is world-readable in `~/Library/LaunchAgents/` (mode 644 default), secrets in backups | Never — use a sourced env file with mode 0600 |
| Ship with Turbopack enabled for faster Monaco iteration | Faster HMR | Monaco dynamic-import + ssr:false broken upstream | Never until [#72613](https://github.com/vercel/next.js/issues/72613) lands |
| Let the editor do `git add .` for convenience | Handles multi-file routines transparently | Sweeps up user's unrelated uncommitted changes | Never — always explicit paths |
| Share a single `slug` → `<slug>` → launchd label mapping without runtime prefix | Cleaner labels | Cross-runtime launchd collision, slug-reuse invisibly overwrites | Never after Phase 0 — v0.1 legacy OK with migration |
| Write `prompt.md` with the raw user input without sanitation | Simplest editor code | Shell-metacharacter injection, secret leakage, YAML-frontmatter corruption | Never — always UTF-8 validate + secret-scan + byte-length cap |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| launchd (local CLI runtimes) | Assuming `$PATH` is inherited | Absolute paths in `ProgramArguments`; set `EnvironmentVariables.PATH` explicitly |
| launchd | Using `launchctl load -w` (deprecated) | Use `launchctl bootstrap gui/$UID /path/to/plist`; `bootout` to unload |
| launchd | Firing at 03:00 assuming Mac is awake | Fire at user-configured wake time; document sleep caveat in editor UI |
| launchd | No `StandardOutPath`/`StandardErrorPath` | Always write to `~/.sleepwalker/logs/<slug>.{out,err}` |
| launchd | `.plist` permissions wrong | `chmod 644` for LaunchAgent plists (must be world-readable for user); do NOT put secrets in the plist file itself |
| Codex CLI | Assuming env-var API key overrides subscription login | Probe active auth mode, don't try to override — let user choose in their `~/.codex/config.toml` |
| Codex CLI | Parsing `codex --version` output as structured | Version output format unstable across releases; use `codex --help` presence checks instead |
| Codex CLI | Reading stdout synchronously | Codex streams incrementally; read async and stream to audit |
| Gemini CLI | Not setting `GOOGLE_CLOUD_PROJECT` explicitly | Set in plist `EnvironmentVariables`; don't rely on `gcloud config get-value project` |
| Gemini CLI | Confusing AI Studio auth vs Vertex AI auth | Document both paths; detect which is active in `detectRuntime()` |
| Claude Code Routines | Hardcoding beta header | Centralize constant; check response status for header-version errors |
| Claude Code Routines | Assuming `/fire` is synchronous | It returns a session URL; actual execution is async — caller must poll or wait for GitHub PR |
| Claude Code Desktop | Assuming Schedule tab actually runs SKILL.md files | `.planning/codebase/CONCERNS.md` flags this as unverified — v0.2 must validate with a synthetic "timestamp writer" routine before claiming the adapter works |
| Git (from Node) | `git add .` or `git add -A` | Explicit file paths only, derived from the just-saved files |
| Git | Not handling `.git/index.lock` collision | Use `flock` on a Sleepwalker-owned lock file; retry on index.lock with backoff |
| Monaco editor | Importing statically | `dynamic(() => import('...'), { ssr: false })` with a loading fallback |
| Monaco editor | Not disposing model on unmount | Memory leak; use `editor.dispose()` in cleanup |
| Next.js App Router | Client state surviving navigation | localStorage + useEffect cleanup; prompt-on-navigate for unsaved changes |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-parsing every plist on every dashboard page load | Dashboard slow after many routines | Cache parsed plists keyed by mtime; invalidate on file change | ~20 routines |
| Running `launchctl list` without filter | Multi-second hangs on macOS systems with many agents | `launchctl print gui/$UID/com.sleepwalker.<slug>` per routine instead | ~50 total launchd agents on system |
| Audit log grows unbounded across all runtimes | Audit page loads 100MB JSONL | Daily rotation to `audit-YYYY-MM-DD.jsonl`; archive >30 days | ~30 days of heavy use |
| Spawning a child process per audit-line-parse for ANSI strip | 500ms latency per line | Use Node built-in `stripVTControlCharacters` (v20+) | >100 lines/sec streaming |
| Polling `gh` CLI for status in a loop | Rate limit (5000/hr) and slowness | Use REST API with `If-None-Match` etags; 60s cache | Already fragile per v0.1 CONCERNS.md |
| Monaco with 50+ simultaneously mounted instances | Browser memory spike (50MB per instance) | Only mount on active editor tab; dispose on tab switch | ~5 open editors |
| Running `detectRuntime()` on every page load | 500ms-2s dashboard boot | Cache results in `~/.sleepwalker/runtime-cache.json` with 60s TTL; revalidate in background | Immediate — first page load |
| Reading the full prompt file on every dashboard render | I/O stall on large routines | Lazy-load prompt only when editor opens; show preview (first 200 chars) in list | ~50KB prompts |
| Synchronous `git status` in the dashboard's save flow | UI freezes on large monorepos | Run git ops on a worker; show spinner | >1000 files in repo |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shell-interpolating user prompt into `ProgramArguments` | Arbitrary code execution as user | Wrapper script pattern; prompt via file, not argv |
| Storing API keys in plist `EnvironmentVariables` | Plist is mode 644; secrets in Time Machine backups | Source an `env` file with mode 0600 from the wrapper |
| Writing expanded-secret prompt to `audit.jsonl` | Secrets in logs | Store template with `${VAR}` placeholders; only expand at runtime |
| Not secret-scanning routine prompts at save time | Secrets committed to git | Run `gitleaks`-style regex scan in editor save path |
| Auto-pushing commits from dashboard | Secrets propagate to GitHub | Never auto-push; always require explicit user push |
| Trusting routine slug without validation | Path traversal (`../../etc/passwd`), launchd label collision | Validate `^[a-z][a-z0-9-]{0,63}$` at every entry point |
| Running CLI with inherited terminal-session env | Leaks non-Sleepwalker env vars (`HISTFILE`, etc.) into agent context | Explicit env allowlist in wrapper script |
| Dashboard `localhost:4001` with no origin check | Any malicious local webpage can POST to the dashboard and trigger deploys | CSRF token in all state-changing endpoints; `Origin` header check |
| Exposing `/api/deploy` without rate-limiting | Accidentally-spawned tab can rapid-fire deploys | Rate limit 1/sec/routine; require explicit button click |
| Logging `launchctl bootstrap` command line with secrets | Bash history / system.log capture | Never include env vars in the command line; reference external file |
| Not verifying the signed-ness of routine files on cross-machine sync | Malicious routine file in git repo deploys on `pnpm dev` | Checksum validation on save; require explicit "trust this file" on first load |
| Treating `.task` files as safe to re-exec | Approved task from an old session fires with stale context | Task files expire after N hours; require re-approval if stale |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Deployed" shown before verify passes | User trusts routine is live, doesn't check until 07:00 empty queue | Multi-step progress UI; "Verified" only after `launchctl print` confirms |
| Runtime unavailable → grayed-out button with no tooltip | User thinks the dashboard is broken | Tooltip with exact reason ("codex not in PATH") + "Fix this" link to Diagnostics page |
| Editor loses work on navigation | Rage-quit | localStorage autosave + dirty-state warning on navigate |
| Error messages showing raw stderr | Users see "xpcproxy: EX_CONFIG (78)" and can't act | Map known error codes to actionable messages ("LaunchAgent plist rejected — check file path") |
| Scheduled time appears as "03:00" without timezone | User thinks "3am my time" but it's 3am UTC | Always show timezone; store UTC, display local with explicit TZ label |
| No way to test a routine before scheduling | Users schedule a broken prompt, find out 24h later | "Dry-run" button that invokes the CLI with the prompt and shows output in the editor |
| Routine deletion is instant and silent | User deletes by accident, no undo | Soft-delete to `routines-<runtime>/.trash/` for 7 days |
| Can't rename a routine | User stuck with typo in slug forever | Rename = move files + bootout/bootstrap with new label + migrate history references |
| "Save to repo" requires separate "Deploy" click | Users save but forget to deploy, routines don't run | Progress stepper: Save → Deploy → Verify in one flow; or clearly separate them with explicit state labels |
| Morning Queue entries show fleet but not runtime | With 4 runtimes, unclear which one produced an entry | Show runtime badge next to fleet name; filter by runtime |
| Budget displayed as "50,000 tokens" but actual counter is chars/4 | Users expect accurate tokens; v0.1 CONCERNS.md flags ±40% error | Relabel as "approximate budget"; link to an explanation; do not promise accuracy |
| No diff preview before Save-to-repo commit | User commits and later discovers unexpected files | Show `git diff --stat` and `git diff` before commit; require explicit confirmation |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Routine deployed:** Verify `launchctl print gui/$UID/com.sleepwalker.<runtime>.<slug>` returns a non-error state, plist exists in `~/Library/LaunchAgents/`, `deploys/<slug>.state.json` says `verified`. Just writing the plist file is not enough.
- [ ] **Run-now works:** Run-now returns "ok" AND the routine actually produced audit log entries within expected time. HTTP 200 alone does not mean the routine ran.
- [ ] **Audit entries present:** Audit entries have `runtime` field, ANSI-stripped content, non-null timestamps, and are valid JSON. Every entry `jq .` succeeds.
- [ ] **Cross-runtime queue works:** Create a routine in each runtime with distinct slugs, run them, verify all 4 source types appear in Morning Queue with distinguishable labels.
- [ ] **Idempotent redeploy:** Deploy → Deploy again (no changes). Confirm plist mtime did not change, no duplicate launchd entries, no queue pollution.
- [ ] **Save-to-repo works:** Save, check `git log -1` contains only the intended files, unrelated WIP files are not in the commit, no auto-push happened.
- [ ] **Sleep handling:** With Mac lid closed at 22:30 and routine scheduled for 03:00, verify the routine fires on wake AND the dashboard shows "ran late at XX:XX" instead of silently.
- [ ] **Editor unsaved changes:** Type in editor, navigate away, return; draft is restored. Close tab, reopen dashboard; draft is still there.
- [ ] **Monaco SSR safe:** `pnpm build && pnpm start` (production mode), hit every editor route, no 500s.
- [ ] **Secret-scanner catches keys:** Paste `sk_live_abc123xyz` into a prompt, try to save, verify it's blocked.
- [ ] **Diagnostics page complete:** Fresh clone of repo + `./install.sh` on a second Mac; Diagnostics page reports all runtimes correctly (including any missing ones with actionable messages).
- [ ] **Rollback on partial deploy failure:** Simulate a `launchctl bootstrap` failure (e.g., malformed plist); verify files get cleaned up and dashboard shows error, not "Deployed".
- [ ] **ANSI-free audit:** Run a Codex routine with colored output; verify `audit.jsonl` entry is plain-text, not escape-code-mangled.
- [ ] **Second-user install:** On a Mac other than Rahul's (ideally Intel + different shell + different macOS version), `install.sh` + dashboard deploy of one routine end-to-end completes in under 10 minutes per `docs/AUTHORING.md` claim.
- [ ] **v0.1 routines still work:** All 14 existing v0.1 routines (6 local + 8 cloud) continue to fire and surface in queue after v0.2 install. No regression.
- [ ] **Budget cap applies to CLI runtimes:** Create a Codex routine with a 1000-char budget; verify budget hook halts it when output exceeds. (This is the character-based approximation from PROJECT.md.)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Partial-success deploy left orphaned plist | LOW | `launchctl bootout gui/$UID /path/to/orphan.plist` + delete plist + delete routine dir + purge `deploys/<slug>.state.json` |
| Shell injection discovered post-deploy | MEDIUM | Rotate any exposed secrets; `git log -p` audit for leaked values; recall all existing plists and regenerate with wrapper-script pattern; audit `~/.sleepwalker/audit.jsonl` for exposed values |
| Secret committed to git | HIGH | Rotate the secret immediately; `git filter-repo` or BFG to remove from history (destructive — requires coordinated push-force); notify any downstream consumers of the repo |
| Cross-runtime slug collision after-the-fact | MEDIUM | Script-rename one routine (`codex/daily-brief` → `codex/daily-brief-codex` or similar), migrate audit log entries, `launchctl bootout` + rebootstrap both |
| Codex auth collision persistent | LOW | `rm ~/.codex/auth.json`; `unset OPENAI_API_KEY`; `codex login` fresh |
| Monaco SSR crash in production | MEDIUM | Hotfix: convert editor route to pure Client Component; redeploy; add regression test |
| ANSI-mangled audit log | LOW | One-shot script: `cat audit.jsonl | strip-ansi > audit.clean.jsonl && mv audit.clean.jsonl audit.jsonl`; fix pipeline forward |
| Mac asleep causing missed routine | LOW | `caffeinate -i` for tonight; fix `pmset -a disablesleep 1` or adjust schedule; add the warning banner for future |
| v0.1 routine regression | MEDIUM | Revert the offending v0.2 PR; ship a hotfix; add regression test; only re-ship v0.2 feature once tests pass |
| Git commit clobbered user's work | MEDIUM | Help user recover via `git reflog`; fix save path to use explicit paths; add confirmation dialog as mitigation |
| Launchd job stuck in "respawning" loop (crash → restart → crash) | MEDIUM | `launchctl bootout`; inspect stderr log; add `ThrottleInterval` to plist to prevent respawn storms |
| Second-user install fails silently | MEDIUM | Walk user through Diagnostics page output over GitHub issue; add their specific failure mode to `docs/AUTHORING.md`; consider pre-flight checks in `install.sh` |
| Claude Routines API beta-header deprecated | LOW | Update the constant in `claude-routines.ts`; verify response shape hasn't changed; cut a patch release |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 Launchd PATH missing | Phase 1 (Adapters) | Run a routine with `echo $PATH > /tmp/sw-path-test`; verify output contains expected bin dirs |
| #2 Codex auth collision | Phase 1 (Codex adapter) | Dashboard "detected auth: ChatGPT Pro" or "API key" shown correctly under all 4 combos of env/auth.json state |
| #3 Gemini quota-project | Phase 1 (Gemini adapter) | "Test Gemini auth" button in Settings, verify success before deploy enabled |
| #4 Shell injection | Phase 0 (conventions) + Phase 1 (every adapter) | Test case: prompt containing ``` `whoami` ```, `$(id)`, `;rm -rf /tmp/test` — verify all three are preserved literally in CLI invocation |
| #5 Partial-success deploy | Phase 3 (deploy) | Inject `launchctl bootstrap` failure in a test; confirm rollback produces clean state |
| #6 Monaco SSR | Phase 2 (editor) | `pnpm build && pnpm start`, hit editor route, no errors |
| #7 Cross-runtime slug collision | Phase 0 (naming) | Create `codex/x` and `gemini/x`, verify both work independently with distinct launchd labels, audit entries, queue rows |
| #8 ANSI in audit | Phase 4 (unified audit) | Test fixture: Codex output with `\x1b[32m`; verify stripped before write |
| #9 Git clobber | Phase 3 (Save-to-repo) | Integration test: WIP change outside `routines-*/` before save; verify commit excludes it |
| #10 Mac sleep | Phase 5 (docs + UX polish) | Dashboard Settings shows sleep warning when `pmset -g` indicates sleep enabled |
| #11 Token leakage | Phase 2 (editor) + Phase 3 (commit scan) | Paste a fake `sk-ant-oat01-abcdef…` token; save blocked with clear error |
| #12 Beta-header churn | Phase 1 (Claude Routines adapter) | Simulate 410 response; verify banner appears |
| #13 Second-user install | Phase 5 (polish) | Test on a second Mac; walk through install end-to-end |
| #14 Unsaved editor changes | Phase 2 (editor) | Type, navigate away, return; draft restored. Close tab, reopen; draft restored. |
| #15 Autofill corruption | Phase 2 (editor) | Ship with Monaco; verify 1Password doesn't offer to fill the prompt field |

---

## Cross-Reference to Existing v0.1 Concerns

`.planning/codebase/CONCERNS.md` flagged issues that v0.2 must NOT worsen. Key overlaps:

- **Concurrent JSONL writes** (CONCERNS.md): v0.2 adds 4 new audit writers (one per runtime). Either fix the race in Phase 4, or ensure each new writer uses `flock` consistently. Do not ship v0.2 with 5× concurrency on a known-racy append path.
- **Bash hook jq dependency**: v0.2 wrapper scripts should not require jq at runtime (use plain bash/awk where possible), to reduce the blast radius if jq becomes unavailable.
- **Reversibility hardcoded in bash**: CONCERNS.md suggests moving to config. v0.2's per-runtime adapters are a natural forcing function — each runtime's adapter needs its own reversibility classification anyway, so extract the pattern into a shared config file as part of Phase 0.
- **Bearer token retrieval**: v0.2 must not regress token handling. Cloud-credentials.json is already plaintext — don't make it worse by introducing more token storage formats.
- **Desktop Schedule tab unverified**: Phase 1's Claude Desktop adapter must include the synthetic "timestamp writer" test described in CONCERNS.md. Ship v0.2 with a passing verification of this, not a skipped "we'll figure it out" step.

---

## Sources

### Launchd
- [launchd StartInterval and sleep behavior (launchd-dev archive)](https://launchd-dev.macosforge.narkive.com/ZF2IQriC/launchd-startinterval-and-sleep)
- [macOS launchd plist StartInterval and StartCalendarInterval examples (alvinalexander.com)](https://alvinalexander.com/mac-os-x/launchd-plist-examples-startinterval-startcalendarinterval/)
- [A launchd Tutorial (launchd.info)](https://www.launchd.info/)
- [Scheduling a Cron Job on macOS with Wake Support (deniapps)](https://deniapps.com/blog/scheduling-a-cron-job-on-macos-with-wake-support)
- [Where is my PATH, launchd? (Lucas Pinheiro, Medium)](https://lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864)
- [launchctl/launchd cheat sheet (masklinn gist)](https://gist.github.com/masklinn/a532dfe55bdeab3d60ab8e46ccc38a68)
- [launchctl, scheduling shell scripts on macOS, and Full Disk Access](https://www.kith.org/jed/2022/02/15/launchctl-scheduling-shell-scripts-on-macos-and-full-disk-access/)
- [Debugging launchd plist jobs](https://mobeets.github.io/blog/launchd/)
- [Taming OSX LaunchDaemons (Ken Yee, Medium)](https://medium.com/@kenkyee/taming-osx-launchdaemons-60cabd8fdf9e)

### Codex CLI
- [openai/codex#2733 — Codex CLI switching to API key doesn't work with ChatGPT Teams active](https://github.com/openai/codex/issues/2733)
- [openai/codex#3286 — API key env var cannot be used if ChatGPT subscription login is active](https://github.com/openai/codex/issues/3286)
- [openai/codex#2000 — Sign in with ChatGPT still generates & requires an API key](https://github.com/openai/codex/issues/2000)
- [openai/codex#5823 — Unable to switch to OpenAI API key after hitting rate limit](https://github.com/openai/codex/issues/5823)
- [openai/codex#15761 — Codex CLI session continues working after API key is deleted](https://github.com/openai/codex/issues/15761)
- [Codex Authentication docs](https://developers.openai.com/codex/auth)
- [Fix Codex CLI 'Re-connecting' Loop Recovery Guide (SmartScope, Apr 2026)](https://smartscope.blog/en/generative-ai/chatgpt/codex-cli-reconnecting-issue-2025/)

### Gemini CLI
- [google-gemini/gemini-cli#12121 — Enterprise Workspace OAuth bypasses Admin API controls](https://github.com/google-gemini/gemini-cli/issues/12121)
- [google-gemini/gemini-cli#8883 — "You exceeded your current quota" with context remaining](https://github.com/google-gemini/gemini-cli/issues/8883)
- [Clarifying Authentication and Google Cloud Project Settings discussion](https://github.com/google-gemini/gemini-cli/discussions/13516)
- [Quotas and limits — Gemini for Google Cloud](https://docs.cloud.google.com/gemini/docs/quotas)
- [Troubleshoot ADC setup](https://cloud.google.com/docs/authentication/troubleshoot-adc)
- [Troubleshoot quota errors — Cloud Quotas](https://docs.cloud.google.com/docs/quotas/troubleshoot)

### Claude Code Routines
- [Automate work with routines (code.claude.com)](https://code.claude.com/docs/en/web-scheduled-tasks)
- [Claude Code Routines: Cloud Automation Guide](https://pasqualepillitteri.it/en/news/851/claude-code-routines-cloud-automation-guide)
- [Claude Code Routines Setup: Schedule, API, GitHub Triggers (FindSkill.ai)](https://findskill.ai/blog/claude-code-routines-setup-guide/)
- [Claude Platform Release Notes](https://platform.claude.com/docs/en/release-notes/overview)

### Security (command injection, secrets)
- [OS Command Injection in NodeJS (SecureFlag)](https://knowledge-base.secureflag.com/vulnerabilities/code_injection/os_command_injection_nodejs.html)
- [Command injection via child_process.exec with user input (Sourcery)](https://www.sourcery.ai/vulnerabilities/exec-user-input-nodejs)
- [Prevent Command Injection Node.js Child_Process: Safer Execution with execFile](https://securecodingpractices.com/prevent-command-injection-node-js-child-process/)
- [Command Injection in JavaScript (Semgrep cheat sheet)](https://semgrep.dev/docs/cheat-sheets/javascript-command-injection)
- [gitleaks (secret scanning patterns)](https://github.com/gitleaks/gitleaks)

### Next.js + Monaco
- [vercel/next.js#72613 — Truly dynamic imports with Turbopack / Monaco editor](https://github.com/vercel/next.js/issues/72613)
- [react-monaco-editor#486 — Next.js build failed](https://github.com/react-monaco-editor/react-monaco-editor/issues/486)
- [keephq/keep#3538 — monaco-editor is not 100% SSR-ready](https://github.com/keephq/keep/issues/3538)
- [Stop "Window Is Not Defined" in Next.js (2025)](https://dev.to/devin-rosario/stop-window-is-not-defined-in-nextjs-2025-394j)

### Git integration
- [Git: You Need to Resolve Your Current Index First (Unfuddle)](https://unfuddle.com/stack/tips-tricks/git-error-you-need-to-resolve-your-current-index-first/)
- [How to Fix the Git Index Lock Error](https://www.betterbugs.io/blog/fix-git-error-you-need-to-resolve-your-current-index-first)

### ANSI handling
- [strip-ansi (npm)](https://www.npmjs.com/package/strip-ansi)
- [strip-ansi-control-characters (npm)](https://www.npmjs.com/package/strip-ansi-control-characters)
- [nodejs/node#26187 — Node sends ANSI escape sequences to dumb terminals](https://github.com/nodejs/node/issues/26187)

### Cross-arch / Homebrew portability
- [Homebrew Installation docs](https://docs.brew.sh/Installation)
- [Using Homebrew on M1 Mac (Earthly)](https://earthly.dev/blog/homebrew-on-m1/)
- [Homebrew on Apple Silicon Macs](https://andre.arko.net/2021/02/11/homebrew-on-apple-silicon-macs/)

### Idempotent deployment
- [How to Build Idempotency Implementation (OneUptime, 2026-01)](https://oneuptime.com/blog/post/2026-01-30-idempotency-implementation/view)
- [Architecture strategies for designing a deployment failure mitigation strategy (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/mitigation-strategy)

### Anthropic/Claude Code frontmatter footgun
- [anthropics/claude-code#9817 — Skill discovery sensitive to frontmatter formatting](https://github.com/anthropics/claude-code/issues/9817)

### Sleepwalker internal references
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/PROJECT.md` (v0.2 scope)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/codebase/CONCERNS.md` (v0.1 known issues)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/codebase/ARCHITECTURE.md` (existing layers)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/.planning/codebase/TESTING.md` (test patterns)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/install.sh` (v0.1 install pattern to extend)

---
*Pitfalls research for: multi-runtime agent orchestration on macOS (Sleepwalker v0.2)*
*Researched: 2026-04-18*
