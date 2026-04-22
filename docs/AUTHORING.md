# Sleepwalker — Authoring Guide

Ship a custom routine to any of 4 runtimes in under 10 minutes.

> **Prereq check:** If you're unsure whether `jq`, `flock`, `claude`, `codex`, or `gemini` are installed, open <http://localhost:4001/diagnostics> after `pnpm dev --port 4001`. Every required dependency has a pass/fail row and a one-click "Copy as GitHub issue body" button for filing bug reports.

> **New to Sleepwalker?** Run through [QUICKSTART.md](./QUICKSTART.md) §1-2 first — that's the v0.1 clone/install/dashboard flow. This guide picks up at §2 [Author a Custom Routine](#2-author-a-custom-routine) with v0.2's multi-runtime `/editor`.

**Contents**

1. [Quick Start](#1-quick-start) — 3 minutes to dashboard running with 14 v0.1 routines visible
2. [Author a Custom Routine](#2-author-a-custom-routine) — `/editor` walkthrough + Save + Deploy
3. [The Four Runtimes](#3-the-four-runtimes) — Claude Routines / Claude Desktop / Codex / Gemini
4. [Scheduling & Mac Sleep](#4-scheduling--mac-sleep) — cron + `caffeinate` + `pmset` + `launchctl print`
5. [Safety Semantics](#5-safety-semantics) — reversibility colors + defer policies + approximate budget cap
6. [Troubleshooting](#6-troubleshooting) — 13-row error table indexed by error message
7. [Going Further](#7-going-further) — architecture, catalog, contributing

---

## 1. Quick Start

Target time: **3 minutes** from `git clone` to the dashboard showing 14 v0.1 routines plus 4 runtime health badges.

### Install

```bash
git clone https://github.com/rahulmehta25/sleepwalker.git
cd sleepwalker
./install.sh
```

`install.sh` is idempotent (safe to re-run) and does three preflight checks:

1. `command -v jq` — v0.1 dependency, needed by hooks and install itself
2. `command -v flock` — Phase 5 dependency (`brew install discoteq/discoteq/flock`), serializes audit writes across supervisor + hooks
3. Existing hooks in `~/.claude/settings.json` — preserved, not overwritten

If the preflight fails, it prints one of the error strings listed in §6 [Troubleshooting](#6-troubleshooting) — copy-paste the string into your browser's find to jump straight to the fix.

### Start the dashboard

```bash
cd dashboard
pnpm install
pnpm dev --port 4001
```

Open <http://localhost:4001>. You should see:

- **14 v0.1 routines** listed (6 local + 8 cloud — see [ROUTINES.md](./ROUTINES.md))
- **4 runtime health badges** in the page header (Claude Routines · Claude Desktop · Codex · Gemini)
- **Morning Queue** view (empty on first run — routines are disabled by default)

### If something looks wrong

- **A health badge is grey or amber.** Click it → it tells you whether the CLI is missing, on the wrong PATH, or needs auth. Use `/diagnostics` to get a full copy-pasteable environment report.
- **`ERROR: flock is required but not installed`** on install. See §6 [Troubleshooting](#6-troubleshooting).
- **`/diagnostics` shows an `(error: ...)` row.** The page is built fail-soft — one broken probe never crashes the rest. Copy the issue body and open a bug.

### What Sleepwalker won't do for you in Quick Start

- **Nothing runs automatically yet.** All routines start disabled. You must author + deploy to schedule anything.
- **No authentication is set up.** Each runtime has its own auth step — see §3 [The Four Runtimes](#3-the-four-runtimes).
- **No Mac-awake policy is applied.** launchd jobs don't fire while your Mac is sleeping — see §4 [Scheduling & Mac Sleep](#4-scheduling--mac-sleep) before shipping an overnight job.

---

## 2. Author a Custom Routine

Target time: **under 10 minutes** from first keystroke to a scheduled routine running on any of the 4 runtimes.

There are four steps: [Open /editor](#21-open-editor) → [Fill the form](#22-fill-the-form) → [Click Save](#23-click-save) → [Click Deploy](#24-click-deploy). Each step has its own sub-section below.

### 2.1 Open /editor

With the dashboard running:

```bash
open http://localhost:4001/editor
```

You land on a single-page form that autosaves to `localStorage` every 500ms. If you hit **Refresh** or **Back**, a **Restore draft?** banner appears at the top of the page offering to recover the unsaved work. (There's no data loss between tabs, naps, or laptop lids.)

**Shortcut for the four most common starting points:** open one of the four templates in `templates/routine-*.md`, copy the frontmatter + body, and paste it into the editor's Prompt field. See §3 [The Four Runtimes](#3-the-four-runtimes) for which template matches your runtime.

### 2.2 Fill the form

The editor has 7 fields, in order:

1. **Name** — human-readable label (`<= 80 chars`). Appears in routine cards + Morning Queue entries. Example: `Daily Morning Brief`.
2. **Slug** — globally unique identifier matching `^[a-z][a-z0-9-]{0,63}$`. Auto-derives from the name on first keystroke; you can edit it. The slug becomes part of the on-disk path (`routines-<runtime>/<slug>/`) and the launchd label (`com.sleepwalker.<runtime>.<slug>`), so it must be URL-safe. Example: `morning-brief`.
3. **Runtime** — radio grid with four options (Claude Routines, Claude Desktop, Codex, Gemini). Runtimes whose `healthCheck()` returned `available: false` render dimmed with a fix-tooltip pointing at `/diagnostics`. Pick the one whose capabilities match your prompt (§3 [The Four Runtimes](#3-the-four-runtimes)).
4. **Prompt** — multi-line textarea (rows=30, autocomplete/autocorrect/spellcheck/password-manager all off via `INPUT_OPT_OUT`). This is the body of the routine. It **must** include the fleet marker `[sleepwalker:<runtime>/<slug>]` on its own line. The marker tells Sleepwalker's hooks that this session is a Sleepwalker routine (vs. an ad-hoc `claude -p` session that should not be intercepted).
5. **Schedule** — cron-5 string with a live `cronstrue` preview ("At 07:00 AM"). See §4.1 [Cron syntax refresher](#41-cron-syntax-refresher) for examples.
6. **Reversibility** — radio pills: `green` (read-only), `yellow` (reversible local writes), `red` (irreversible external effects like `git push`, `curl POST`, file deletion). This drives the defer policy — see §5 [Safety Semantics](#5-safety-semantics).
7. **Budget** — approximate character cap. The supervisor `SIGTERM`s the subprocess if cumulative output exceeds this count. Labeled **"chars (approximate)"** throughout the UI — SAFE-01 invariant, because the ±40% approximation a char count can honestly promise is stricter than what any single-runtime tokenizer would deliver across all four runtimes.

The Prompt textarea is also live-scanned for embedded secrets on every keystroke. If it matches any of the 11 patterns in `dashboard/lib/secret-patterns.ts` (GitHub tokens `ghp_*`, OpenAI keys `sk_live_*`, 40-char hex that looks like a PAT, etc.), a red Secret Scan panel appears below the textarea with the exact line + column. Save is rejected until you replace the literal secret with a `${ENV_VAR}` reference. See §6 [Troubleshooting](#6-troubleshooting) for the error strings.

### 2.3 Click Save

The **Save routine** button runs a zod validation + secret scan + slug-collision check server-side. On success it atomically writes the bundle to:

- `routines-<runtime>/<slug>/config.json` + `routines-<runtime>/<slug>/prompt.md` for codex + gemini
- `routines-<runtime>/<slug>/SKILL.md` (single-file format with frontmatter) for claude-routines + claude-desktop

Atomic means: the bundle is first written to a sibling temp directory, then renamed into place. Either both files land or neither does — no partial-write corruption.

On failure the editor surfaces one of these error toasts:

- `Slug must match \`^[a-z][a-z0-9-]{0,63}$\`` — fix the slug format
- `A <runtime> routine with slug <slug> exists. Slugs must be unique across runtimes.` — pick a different slug (e.g., `codex-morning-brief` vs. `gemini-morning-brief`)
- `Prompt appears to contain a secret (... at line N, column M). Replace with ${VAR}...` — replace the secret before re-saving

All three strings are verbatim in §6 [Troubleshooting](#6-troubleshooting) so you can grep them directly.

After save, the localStorage draft is cleared (so the Restore banner won't prompt again for this slug). The editor navigates to `/routines` where your new routine card appears with status **Draft** (bundle on disk but not deployed).

### 2.4 Click Deploy

On the routine card, click **Deploy**. A drawer slides in from the right showing a 4-step state machine:

```
planning -> writing -> loading -> verified
```

Each step has its own elapsed-ms counter and a status pill:

- **planning** — computes the launchd label, allocates the state file at `~/.sleepwalker/deploys/<slug>.state.json`, acquires a per-routine file lock
- **writing** — generates the plist XML, writes it to `~/Library/LaunchAgents/com.sleepwalker.<runtime>.<slug>.plist`, validates via `plutil -lint`, stages the bundle to `~/.sleepwalker/staged-bundles/<runtime>/<slug>/` (TCC-safe directory — see §3.3 / §3.4)
- **loading** — `launchctl bootstrap gui/$UID <plist-path>`; on failure, rolls back (bootout + delete plist + delete state)
- **verified** — `launchctl print gui/$UID/<label>` confirms the job is loaded; the card flips from **Draft** to **Deployed**

If any step fails, the drawer shows a red banner with the rollback actions taken and a **Retry deploy** button. Nothing stays orphaned — a failed deploy leaves zero residue (no half-plist, no lingering state file, no loaded job).

**Runtime-specific deploy behavior:**

- **Claude Routines** doesn't write a plist — `deploy()` returns a `handoffUrl` that the dashboard opens in a new tab with the `/schedule create` form pre-filled (§3.1).
- **Claude Desktop** writes a SKILL.md but doesn't register with `launchctl`. Because Desktop 1.3109.0 does **not** watch `~/.claude/scheduled-tasks/`, the routine is authored on disk but does **not** fire until you manually paste the SKILL.md into Desktop's Schedule tab (§3.2 + §6 [Troubleshooting](#6-troubleshooting)).
- **Codex** + **Gemini** write the plist, bootstrap the job, and the routine fires on the cron you configured.

After **Deployed**, click **Run now** on the card to fire the routine immediately. The supervisor writes an `audit.jsonl` entry with `event: "completed"` (or `"failed"` / `"budget_exceeded"` / `"deferred"`) and the Morning Queue shows the run. See §5 [Safety Semantics](#5-safety-semantics) for what each event means and which events require your approval.

---

## 3. The Four Runtimes

Each runtime has a different auth model, a different invocation path, and a different list of quirks. The summary below tells you which runtime to pick; the sub-sections give the full story plus a link to the matching template you can copy-paste from.

| Runtime | Where it runs | Best for | Schedule trigger | Key quirk |
|---------|--------------|----------|-----------------|-----------|
| [Claude Routines](#31-claude-code-routines-cloud) | Anthropic cloud | Mac-closed overnight work on GitHub repos | `/schedule create` via browser handoff | No full programmatic create (Phase 2 Q1) |
| [Claude Desktop](#32-claude-code-desktop-scheduled-tasks) | Your Mac | Full-Mac-access routines (Mail, Calendar, Files) | Schedule tab in Desktop app | Desktop 1.3109.0 needs manual paste |
| [Codex](#33-openai-codex-pro) | Your Mac (local CLI) | Codebase analysis + one-shot transforms | launchd | Needs `--skip-git-repo-check` (auto-added) |
| [Gemini](#34-google-gemini-cli-pro) | Your Mac (local CLI) | Long-context doc analysis (1M-token window) | launchd | Needs explicit `gemini_quota_project` |

### 3.1 Claude Code Routines

**Where it runs:** Anthropic's cloud (via [Claude Code Routines](https://code.claude.com/docs/en/routines)). Your Mac can be closed — the routine still fires.

**Auth prereqs:**

- Claude Code subscription at claude.ai
- `claude` CLI on PATH (`brew install claude`)
- Browser access to claude.ai/code/routines for the one-time schedule/API handoff

**How Sleepwalker invokes it:** Claude Routines has no full programmatic creation API. The Phase 2 Q1 finding documented this: schedule triggers require a one-click handoff to `/schedule create` in a browser, and API triggers also require the browser to configure a bearer token on claude.ai first. Sleepwalker's `claude-routines` adapter:

1. Writes `routines-claude-routines/<slug>/SKILL.md` locally so the fleet-tracking UI has a record
2. Returns a `handoffUrl` that the dashboard opens with the `/schedule create` form pre-filled with your prompt + cron + reversibility
3. For **Run now**, calls the per-routine `/fire` HTTPS endpoint (set up once via the same `/schedule create` → API-trigger flow) with an optional context payload from the dashboard

The Sleepwalker Morning Queue then polls the GitHub repos you've configured in Settings for `claude/sleepwalker/claude-routines/<slug>/*` branches and surfaces any PRs/diffs the routine produced.

**Quirks and gotchas:**

- **No full programmatic create.** The first time you use a Claude Routine, you must click through the browser handoff once per routine.
- **Cloud routines run under your Claude Code subscription's rate limit.** A sudden spike of 20 overnight routines may hit the daily cap — stagger schedules.
- **The `/fire` endpoint returns 202 Accepted, not the output.** Output lands on the `claude/sleepwalker/*` branch via PR, not in the HTTP response.

**Template:** [`templates/routine-claude-routines.md`](../templates/routine-claude-routines.md). Copy, edit the name/slug/schedule, paste the body, Save.

### 3.2 Claude Code Desktop Scheduled Tasks

**Where it runs:** Your Mac, via the signed-in Claude Code Desktop app. The Mac must be awake at schedule time (see §4 [Scheduling & Mac Sleep](#4-scheduling--mac-sleep)).

**Auth prereqs:**

- Claude Code Desktop installed and signed in
- `~/.claude/` directory present (Desktop creates it on first run)

**How Sleepwalker invokes it:** The `claude-desktop` adapter:

1. Writes `routines-claude-desktop/<slug>/SKILL.md` — single-file bundle with `name` + `schedule` + `reversibility` + `budget` frontmatter
2. Copies the SKILL.md into `~/.claude/scheduled-tasks/<slug>/SKILL.md`
3. Returns a `handoffUrl` that deep-links into Desktop's Schedule tab

**CRITICAL QUIRK — Q1 outcome (c) from Phase 2 smoke:**

> **Claude Code Desktop 1.3109.0 does NOT watch `~/.claude/scheduled-tasks/`.**

The Sleepwalker adapter writes the file correctly to disk, but Desktop never ingests it. You must manually:

1. Open Claude Code Desktop
2. Go to the **Schedule** tab → **Add**
3. Paste the generated SKILL.md content

The dashboard offers a **Copy SKILL.md** button on the routine card specifically for this workflow. After paste + save inside Desktop, the routine fires at the configured time.

Without this manual step, the routine is authored but **will never fire**. This is non-obvious and the #1 cause of "my Desktop routine isn't running" support questions — see §6 [Troubleshooting](#6-troubleshooting) row `Claude Desktop routine never fires even after save`.

**Quirks and gotchas:**

- Manual paste requirement (above)
- Desktop has full Mac access (Mail.app, Calendar, Files), so reversibility matters more here than for cloud — a `red`-classed tool call that gets auto-approved can do real damage
- Desktop routines run under the same Sleepwalker hook wiring as v0.1 — the `PreToolUse` defer hook + `PostToolUse` budget + audit hooks all fire

**Template:** [`templates/routine-claude-desktop.md`](../templates/routine-claude-desktop.md). The template's top comment includes the manual-add warning verbatim.

### 3.3 OpenAI Codex Pro

**Where it runs:** Your Mac, local CLI. launchd fires the routine on schedule via the Sleepwalker supervisor `bin/sleepwalker-run-cli`. Mac must be awake (§4).

**Auth prereqs:**

- Codex CLI installed (`brew install codex` or the OpenAI Codex Pro download)
- Signed in via `codex auth login` (writes `~/.codex/auth.json`)
- `codex --version` returns a version string

If `OPENAI_API_KEY` is set in your environment **and** `~/.codex/auth.json` exists, Codex may use the API key instead of the subscription, which bills against the OpenAI API plan (not Codex Pro). See §6 [Troubleshooting](#6-troubleshooting) for the conflict-warning entry.

**How Sleepwalker invokes it:** The `codex` adapter:

1. Writes `routines-codex/<slug>/config.json` + `prompt.md` — two-file bundle matching the v0.1 cloud format
2. Writes `~/Library/LaunchAgents/com.sleepwalker.codex.<slug>.plist` with `ProgramArguments` = `[supervisor-path, "codex", <slug>, <bundle-path>]` (4 args — Plan 02-11's fix; pre-Plan 02-11 plists will hit `bundle not found` at run time)
3. Stages the bundle to `~/.sleepwalker/staged-bundles/codex/<slug>/` (Plan 02-12 — avoids macOS TCC sandbox blocking reads from `~/Desktop` / `~/Documents` / `~/Downloads` / iCloud)
4. Pins the plist's `WorkingDirectory` to the staged bundle so `getcwd` doesn't error on the launchd-sandboxed cwd
5. `launchctl bootstrap gui/$UID` the plist, `plutil -lint` validates it, the routine fires on cron

The supervisor wraps every codex invocation with:

- Login-shell PATH resolution (`/bin/zsh -l -c`) so Homebrew binaries are found
- `NO_COLOR=1 TERM=dumb CI=true` in the launchd environment
- 3-class perl ANSI strip before any audit write (CSI + OSC + DCS/PM/APC)
- `--skip-git-repo-check` appended to the `codex` argv (Plan 02-12 / commit `633a07a`) — without it codex refuses to run in the non-git-repo staged bundle directory
- `flock`ed audit writes on the shared sidecar `~/.sleepwalker/audit.jsonl.lock` so concurrent supervisor + hook writers don't corrupt the JSONL
- Budget-cap `SIGTERM` if char count exceeds the configured cap
- Reversibility-gate check against `~/.sleepwalker/settings.json` (defers `red` tool calls to the Morning Queue when within the sleep window)

**Quirks and gotchas:**

- The supervisor's 4-arg `programArguments` is **load-bearing** — a routine deployed pre-Plan 02-11 will emit `bundle not found` every time it fires. Fix: re-deploy via the dashboard (newer plist).
- Codex refuses to run outside a git repo without `--skip-git-repo-check`. Sleepwalker auto-appends the flag; you don't need to manage it in the prompt.
- Running `codex` from a session where `OPENAI_API_KEY` is set **and** `~/.codex/auth.json` exists can silently bill the wrong account — the supervisor emits a warning in `audit.jsonl` when it detects this; the dashboard surfaces it in `/diagnostics`.

**Reversibility tip:** Codex is well-suited to `green` read-only analysis (e.g., dependency scans, doc drift detection) or `yellow` write-to-staged-bundle (e.g., PR draft generation that lands in `~/.sleepwalker/drafts/`). Avoid `red` for codex unless the routine genuinely needs to touch the live filesystem outside the staged bundle.

**Template:** [`templates/routine-codex.md`](../templates/routine-codex.md). The template's top comment documents the `--skip-git-repo-check` auto-add and lists the recommended reversibility posture.

### 3.4 Google Gemini CLI Pro

**Where it runs:** Your Mac, local CLI. launchd fires the routine on schedule via the Sleepwalker supervisor `bin/sleepwalker-run-cli`. Mac must be awake (§4).

**Auth prereqs:**

- Gemini CLI installed
- `gcloud auth login` complete (writes `~/.config/gcloud/` credentials)
- An explicit **quota project** configured (see the critical quirk below)
- `gemini --version` returns a version string

**How Sleepwalker invokes it:** The `gemini` adapter:

1. Writes `routines-gemini/<slug>/config.json` + `prompt.md`
2. **Refuses to deploy** unless `config.json` contains `runtime_config.gemini_quota_project` — the adapter returns `ok: false, reason: "Gemini quota project not configured. Set runtime_config.gemini_quota_project in config.json."` (Pitfall 3 defense from Plan 02-08 / commit `72c6f69`)
3. On success, writes `~/Library/LaunchAgents/com.sleepwalker.gemini.<slug>.plist` with `EnvironmentVariables.GOOGLE_CLOUD_PROJECT` = the quota project string
4. Stages the bundle to `~/.sleepwalker/staged-bundles/gemini/<slug>/` + pins `WorkingDirectory`
5. `launchctl bootstrap` + `plutil -lint` + ready

`healthCheck()` probes `gemini --version`, parses the active auth mode (`gcloud` vs. `api-key` vs. `adc`), and reports the active quota project so you can sanity-check before deploying.

**Critical quirk — quota project required:**

Deploying without `gemini_quota_project` returns the exact error string `Gemini quota project not configured. Set runtime_config.gemini_quota_project in config.json.`. This is intentional: Google's `gcloud auth login` authenticates you against every project you have access to, and the Gemini CLI picks a default based on recent activity — which can be **the wrong project**. Sleepwalker refuses to deploy without an explicit opt-in to prevent silent wrong-project billing.

To fix: edit `routines-gemini/<slug>/config.json` and add:

```json
{
  "runtime_config": {
    "gemini_quota_project": "your-project-id"
  }
}
```

Then re-deploy from the dashboard.

**Quirks and gotchas:**

- Quota project required (above)
- Gemini's 1M-token context window is the biggest of the four runtimes — ideal for routines that grep across a whole docs/ tree or an entire codebase in one pass. Scale the char budget accordingly (100K+ is reasonable for Gemini; 40K is tight for Codex).
- `gcloud auth list` shows which account is active; `gcloud config get-value project` shows the default project. `/diagnostics` surfaces both for quick verification.

**Template:** [`templates/routine-gemini.md`](../templates/routine-gemini.md). The template's top comment walks through the quota-project setup and recommends a long-context use case (design-doc drift review).

---

## 4. Scheduling & Mac Sleep

The four runtimes split into two groups for scheduling purposes:

- **Cloud (Claude Routines)** fires from Anthropic's infrastructure — Mac state doesn't matter.
- **Local (Claude Desktop, Codex, Gemini)** fires via your Mac's launchd or Claude Desktop's internal scheduler — **Mac must be awake at fire time.**

This section covers cron syntax you'll actually use (§4.1), the Mac-sleep caveat with three mitigation patterns (§4.2), and the `launchctl print` debug recipe for when a scheduled routine doesn't fire (§4.3).

### 4.1 Cron syntax refresher

Sleepwalker uses **cron-5** (5-field cron: minute hour day-of-month month day-of-week). The editor has a live cronstrue preview — type any expression and you see "At 07:00 AM" or "Every 5 minutes" below the field.

Common patterns:

| Expression       | Runs                                         |
| ---------------- | -------------------------------------------- |
| `*/5 * * * *`    | Every 5 minutes (useful for quick dev loops) |
| `0 2 * * *`      | Daily at 02:00 local time                    |
| `0 3 * * *`      | Daily at 03:00 — deep-overnight, low load    |
| `0 7 * * 1-5`    | Weekdays at 07:00                            |
| `0 6 * * 1-5`    | Weekdays at 06:00 — morning brief territory  |
| `0 3 * * 0`      | Sundays at 03:00 — weekly maintenance        |
| `30 4 1 * *`     | 1st of every month at 04:30                  |
| `0 */6 * * *`    | Every 6 hours on the hour                    |

**Tip:** Sleepwalker converts your cron-5 into a launchd `StartCalendarInterval` dict at deploy time. The `parseCron` routine was hardened in Plan 02-10 to correctly handle `*/N` slash intervals (pre-02-10 code emitted `<integer>NaN</integer>` and `plutil -lint` rejected the plist). If you authored a routine with `*/5 * * * *` before Plan 02-10 shipped, re-deploy it — the new plist parses correctly.

**No `@yearly`/`@reboot`/`@hourly` shorthands.** Use the 5-field form so the `cronstrue` preview can render a description.

### 4.2 Mac must be awake

> **Sleepwalker's CLI runtimes (Codex, Gemini) run via launchd, which does not fire while your Mac is sleeping or closed.**

Claude Desktop also won't fire scheduled tasks while Mac is asleep. Only Claude Routines (cloud) is immune to local Mac state.

Three mitigation patterns, pick one (or mix):

#### Pattern A — `caffeinate` (interactive dev)

Keeps your Mac awake as long as a shell is running. Useful when you're actively iterating on a routine and don't want to miss a `*/5 * * * *` fire while you grab lunch.

Run any of these in a dedicated terminal tab:

```bash
caffeinate -i &
```

Keeps the Mac awake indefinitely (until you Ctrl-C the shell, close the tab, or run `kill %1`).

```bash
caffeinate -i -t 28800 &
```

Keeps the Mac awake for the next 8 hours — a typical overnight routine window. The background job exits automatically at the timeout.

```bash
caffeinate -i -w $(pgrep -f "next dev")
```

Keeps the Mac awake only while the dashboard dev server is running — `caffeinate` blocks (foreground) until the pid from `pgrep` exits, then relinquishes the wake lock.

`caffeinate` flags: `-d` (display), `-i` (idle, **recommended** — prevents system sleep without keeping the display on), `-m` (disk), `-s` (system, AC-power only), `-u` (user active), `-t <seconds>` (timeout), `-w <pid>` (wait on pid). See `man caffeinate` for the full reference.

#### Pattern B — `pmset schedule` (scheduled wake for overnight routines)

Tells macOS Power Management to wake the Mac at a specific time (or repeatedly), regardless of lid state. This is the right pattern for a `0 3 * * *` routine you want to survive a lid close.

```bash
sudo pmset schedule wake "04/23/26 03:00:00"
```

One-time wake at the specified timestamp (date format is `MM/DD/YY HH:MM:SS`, 24-hour clock, local time).

```bash
sudo pmset repeat wake MTWRFSU 03:00:00
```

Repeating daily wake (or power on) at 03:00, every day. Weekday codes are `M T W R F S U` (U = Sunday). Use `MTWRF` for weekdays only.

```bash
pmset -g sched
```

Shows all currently-scheduled events — verify your command took effect.

```bash
sudo pmset schedule cancelall
```

Cancels all scheduled events. Useful for resetting when experimenting with schedule syntax.

`type` for `pmset schedule` is one of `sleep | wake | poweron | shutdown | wakeorpoweron`. `wakeorpoweron` is safer than `wake` for a Mac that sometimes goes fully off (e.g., drained battery or scheduled shutdown). See `man pmset` for the full reference.

**Verify it took:** `pmset -g sched` shows the pending events. If nothing appears, check that your Mac is on AC power when scheduling — battery-only Macs may refuse the schedule. Also confirm you ran the command with `sudo` — `pmset schedule` without sudo silently no-ops.

**Combine with Claude Routines:** if your overnight work fits Claude Routines' cloud model, you don't need `pmset schedule` at all. Keep local routines (Codex / Gemini / Desktop) for work that requires local filesystem access.

#### Pattern C — `launchctl print` (debug why a job didn't fire)

When a scheduled routine doesn't produce an audit entry at the expected time, inspect the launchd job directly:

```bash
launchctl print gui/$UID/com.sleepwalker.codex.morning-brief
```

Key fields to look for in the output:

- `state = running | waiting | exited` — should be `waiting` between fires
- `last exit code = 0` — non-zero = the supervisor failed; check `~/.sleepwalker/audit.jsonl` for the error
- `pending jobs = <count>` — should drop to 0 immediately after launchd fires the job
- `program = /Users/<you>/.sleepwalker/bin/sleepwalker-run-cli-<hash>` — if this path is wrong, re-deploy
- `working directory = /Users/<you>/.sleepwalker/staged-bundles/<runtime>/<slug>` — **critical**: if it shows your repo path instead, the plist is pre-Plan 02-12 and needs redeploy (TCC bundle staging)

If `pending jobs > 0` long after the scheduled time, your Mac was asleep — see Patterns A/B.

### 4.3 Debug with launchctl print

The full debugging flow for "my routine should have fired but didn't" is five ordered steps.

**Step 1 — confirm the job is loaded:**

```bash
launchctl print gui/$UID/com.sleepwalker.codex.morning-brief | head -30
```

If the output says `Could not find service "com.sleepwalker.codex.morning-brief" in domain for user: 501`, the job isn't bootstrapped. Re-deploy from the dashboard.

**Step 2 — check the last exit code:**

If Step 1 prints a full job description, scan for `last exit code = N`. A non-zero N means the supervisor ran but failed. Inspect the most recent audit entries for this routine:

```bash
tail -n 50 ~/.sleepwalker/audit.jsonl | jq 'select(.fleet == "codex/morning-brief")'
```

The `event` field tells you what happened: `completed`, `failed`, `budget_exceeded`, `deferred`. For `failed`, the `preview` field has the first 200 chars of stderr — grep for that string in §6 [Troubleshooting](#6-troubleshooting).

**Step 3 — verify the working directory is TCC-safe:**

In Step 1's output, look for `working directory = ...`. The expected value is `/Users/<you>/.sleepwalker/staged-bundles/<runtime>/<slug>`. If it instead shows your repo path (e.g., `/Users/<you>/Desktop/Projects/sleepwalker/routines-codex/<slug>`), the plist was written before Plan 02-12 landed. Bootout and re-deploy:

```bash
launchctl bootout gui/$UID/com.sleepwalker.codex.morning-brief
```

Then click Deploy again in the dashboard — the new plist will pin the TCC-safe working directory.

**Step 4 — check pending-jobs counter:**

In Step 1's output, look for `pending jobs = <count>`. This counter increments every time launchd wants to fire the job but can't (because the previous run is still going, or because the Mac was asleep at fire time). If `pending jobs > 0` long after the scheduled time, the most common cause is Mac sleep — apply Pattern A or B from §4.2.

**Step 5 — inspect the plist directly:**

If Steps 1-4 don't explain the problem, inspect the plist XML:

```bash
plutil -p ~/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist
```

Or get its lint status:

```bash
plutil -lint ~/Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist
```

A successful lint prints `OK`. A failure prints the specific XML problem (e.g., `<integer>NaN</integer>` from the pre-Plan 02-10 cron parser bug — see §6 [Troubleshooting](#6-troubleshooting)).

Every command in this section is read-only (`print`, `tail`, `jq`, `plutil -p`, `plutil -lint`) or trivially reversible (`bootout` — undone by re-deploy). You can't break anything by running them. **Re-deploy from the dashboard is always the one-click recovery** — the deploy state machine performs bootout + delete plist + delete state + re-generate automatically.

---

## 5. Safety Semantics

Sleepwalker has three defensive layers: **reversibility classification** (what kind of damage can this tool call do?), **defer policies** (what do we do about `red` calls?), and **approximate char budgets** (when do we stop a runaway loop?). All three are user-configurable. All three default to safe-but-not-paranoid values.

### 5.1 Reversibility colors

Every tool call routed through Sleepwalker's `PreToolUse` hook is classified by the routine's `reversibility` field plus the tool name:

- **green — safe to auto-approve.** Read-only (`Read`, `Grep`, `Glob`, `Bash(ls|cat|grep|find|fd)`, `WebSearch`). Can never delete data, send network writes, or touch external state. Fires immediately, no defer.
- **yellow — needs queue review.** Reversible local writes (`Edit`, `Write` inside a staged bundle or `~/.sleepwalker/drafts/`, `Bash(mkdir|mv|cp)`). In `balanced` policy, fires immediately. In `strict` policy, defers to Morning Queue.
- **red — irreversible external effects.** `WebFetch`, `Bash(curl -X POST|curl -X PUT|curl -X DELETE)`, `Bash(git push|git commit -m|gh pr create|gh release create|npm publish)`, `Bash(rm)`. **Always** defers to Morning Queue regardless of policy, **during the sleep window** (defined per-fleet in `~/.sleepwalker/settings.json`).

The `sleepwalker-defer-irreversible.sh` hook enforces this. If you see `"event":"deferred","preview":"red+balanced"` in `audit.jsonl`, that's the hook correctly parking a red call for your morning review — see §6 [Troubleshooting](#6-troubleshooting).

**Why `red` = irreversible:** rolling back a `git push` requires `git push --force-with-lease` and coordination with anyone who pulled; rolling back a `curl POST https://api.stripe.com/v1/charges` requires a refund workflow; rolling back `rm -rf ~/important-dir` requires Time Machine. Humans are better at saying "yes this is safe to do at 07:15 AM with my coffee" than an overnight agent at 03:47 AM.

### 5.2 Defer policies

Policies live in `~/.sleepwalker/settings.json` and can be set per-fleet (per routine slug) or globally. Three choices:

- **`conservative`** — defers anything `yellow` or `red`. Use when you want maximal human review. Every overnight run produces a Morning Queue you need to triage.
- **`balanced` (default)** — defers `red` only; `yellow` auto-fires. Use when you've built trust with a routine and are okay with reversible writes happening unattended. This is what ships out of the box.
- **`aggressive`** — defers nothing; everything fires, even `red`. **Only use inside the sleep window** and only for routines where you genuinely trust the reversibility classification. Think of it as yolo mode; the Sleep Window protects you from yourself outside of configured overnight hours.

The sleep window (also in `~/.sleepwalker/settings.json`) defaults to `23:00 → 07:00`. Outside that window, all hooks operate in **interactive** mode — no defer, no budget cap — because you're presumably at your keyboard and can intervene.

To change a policy for a specific fleet:

```bash
jq '.fleetPolicies["codex/morning-brief"] = "conservative"' ~/.sleepwalker/settings.json > /tmp/s.json \
  && mv /tmp/s.json ~/.sleepwalker/settings.json
```

Or use the dashboard's **Settings → Per-fleet Policies** UI.

### 5.3 Approximate budget cap

Every runtime has a per-routine `budget` field measured in **characters (approximate)**. The supervisor tracks cumulative output (stdout + stderr after ANSI strip) and `SIGTERM`s the subprocess when it exceeds the budget.

> **The cap is approximate — and it measures characters, not anything else.** A 40,000-char cap is roughly a 10,000-word output. Actual model-side counts vary ±40% depending on output format: code blocks are denser than prose, and non-ASCII is denser than ASCII. Every Sleepwalker UI surface labels this field as `chars (approximate)` and avoids any other unit word — the SAFE-01 invariant is that the char-count approximation never gets promoted to a precision it doesn't have.

**Why characters, not tokens?** Adding a real tokenizer (tiktoken, SentencePiece) would be a multi-MB dependency that works for one runtime's model and approximates the others. Adding four tokenizers (one per runtime) is worse. The char cap is simple, runtime-agnostic, and acceptable at ±40% — explicitly documented as such.

**What to do when you see `"event":"budget_exceeded"`:**

1. Read the preview string: `"Stopped at N chars (budget: M, approximate)"` — N is what the supervisor observed, M is your cap.
2. If N is close to M (say within 25%), your prompt scope is probably too broad. Narrow the "What you do" section of the prompt.
3. If N is far above M, your budget cap is too tight for the task. **Raise the budget by 50%** to give headroom — that accounts for the ±40% approximation plus a small buffer.
4. Edit the routine's `config.json` (or SKILL.md frontmatter for claude-*), save, re-deploy.

**Default budgets in the 4 templates:**

- Claude Routines (`Daily Morning Brief`): 40,000 — short structured output
- Claude Desktop (`Inbox Triage`): 30,000 — classification + draft replies
- Codex (`Dependency Update Scan`): 60,000 — per-repo markdown output
- Gemini (`Design Doc Drift Review`): 100,000 — whole docs/ tree analysis, 1M-token window comfortably handles it

Tune to your use case.

---

## 6. Troubleshooting

Indexed by the exact error string you'll see in a toast, a stack trace, or `~/.sleepwalker/audit.jsonl`. Copy-paste the error into your browser's find to jump to the row.

| Error message                                                                                                                | Cause                                                                                                                                               | Fix                                                                                                                                                                                                                            | Reference                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `ERROR: jq is required but not installed. Install with: brew install jq`                                                     | v0.1 install preflight failure — `jq` not on PATH                                                                                                    | `brew install jq`, then re-run `./install.sh`. The script is idempotent.                                                                                                                                                        | install.sh:27                                                 |
| `ERROR: flock is required but not installed. Install with: brew install flock`                                               | Phase 5 QUEU-04 install preflight failure — `flock` not on PATH. Sleepwalker uses `flock` to serialize audit.jsonl writes across supervisor + hooks | `brew install discoteq/discoteq/flock`, then re-run `./install.sh`. (The Homebrew default `flock` is Linux-only; the `discoteq` tap provides the macOS port.)                                                                    | install.sh:32 (commit `71bfdcc`)                              |
| `"event":"failed","preview":"..Operation not permitted.."` in audit.jsonl                                                     | launchd TCC sandbox blocks reads from `~/Desktop`, `~/Documents`, `~/Downloads`, or iCloud when the plist's `WorkingDirectory` sits in one of those  | Fixed in Plan 02-12: bundle staged to `~/.sleepwalker/staged-bundles/<runtime>/<slug>/`, `WorkingDirectory` pinned there. If you see this post-v0.2, run `launchctl print gui/$UID/com.sleepwalker.<runtime>.<slug>` and verify `working directory = ~/.sleepwalker/staged-bundles/...`; if it shows your repo path, re-deploy. | 02-SUMMARY.md §Cycle 3 + commit `4cbb5bb` + §4.3 above        |
| `"event":"failed","preview":"..Not inside a trusted directory and --skip-git-repo-check was not specified.."`                 | Codex CLI refuses to run in non-git-repo cwd (staged bundle is not a repo)                                                                          | Upgrade to commit `633a07a` or later — fix appended `--skip-git-repo-check` to codex argv. If still failing, `launchctl bootout` + re-deploy; the new plist ships the flag.                                                     | 02-SUMMARY.md §Cycle 4 + commit `633a07a`                     |
| Claude Desktop routine never fires even after save                                                                           | **Q1 outcome (c) from Phase 2 smoke:** Claude Code Desktop 1.3109.0 does NOT watch `~/.claude/scheduled-tasks/`. SKILL.md written to disk but never ingested by Desktop. | Open Claude Desktop → Schedule tab → **Add**. Paste the SKILL.md content manually. The dashboard's routine card has a **Copy SKILL.md** button for exactly this workflow. Without this step the routine is authored but never fires. | 02-SUMMARY.md §Claude Desktop Smoke + §3.2 above              |
| `"event":"budget_exceeded","preview":"Stopped at N chars (budget: M, approximate)"`                                            | Supervisor SIGTERMed the subprocess because cumulative output exceeded the configured char budget                                                   | Raise `budget` in the routine's `config.json` / SKILL.md frontmatter by 50% for headroom (budgets are approximate ±40%). Or narrow the prompt's "What you do" section so the routine produces less output.                      | SAFE-01 + §5.3 above                                          |
| `"event":"deferred","preview":"red+balanced"` / `"red+strict"` / `"yellow+strict"`                                             | Reversibility gate parked a tool call per your fleet policy. This is the hook doing its job, not an error                                             | Three options: (a) change `reversibility` in frontmatter if the action is safer than its classification; (b) change per-fleet policy in `~/.sleepwalker/settings.json` or dashboard Settings; (c) approve in Morning Queue at wake (intended flow). | §5 Safety Semantics + 02-SUMMARY.md §Defer policy             |
| `Gemini quota project not configured. Set runtime_config.gemini_quota_project in config.json.`                                 | Gemini adapter's Pitfall 3 defense — refuses to deploy without explicit quota project (prevents silent wrong-project billing)                       | Edit `routines-gemini/<slug>/config.json` and add `"runtime_config": { "gemini_quota_project": "<your-project-id>" }`. Then re-deploy. `/diagnostics` shows the currently-active gcloud auth mode + project.                     | 02-SUMMARY.md §Key Decisions #4 + commit `72c6f69` + §3.4     |
| `codex CLI not found on login-shell PATH` (red pill on landing page)                                                          | Codex CLI not installed, or login-shell PATH doesn't include `/opt/homebrew/bin` (Apple Silicon)                                                     | `brew install codex` (or download from openai.com/codex). Verify with `/bin/zsh -l -c "command -v codex"`. Restart `pnpm dev --port 4001` so the landing-page health badge refreshes. `/diagnostics` shows the current PATH. | HLTH-01 + ADPT-07 `healthCheck()`                             |
| `"event":"failed","preview":"bundle not found"` in audit.jsonl                                                                 | Codex/Gemini routine deployed pre-Plan 02-11; plist's `programArguments` doesn't include the explicit bundle path (4th arg)                          | Re-deploy from the dashboard — newer plist has 4-arg `programArguments [supervisor, runtime, slug, bundlePath]`. Or manually: `launchctl bootout gui/$UID/com.sleepwalker.<runtime>.<slug>`, then click Deploy again.            | 02-SUMMARY.md §Cycle 2 + commit `7cc884a`                     |
| `<integer>NaN</integer>` when `plutil -lint` checks the plist                                                                | `parseCron` bug pre-Plan 02-10: `*/5 * * * *` emitted `<integer>NaN</integer>` which `plutil` rejects                                                 | Upgrade to post-Plan 02-10 code. Re-author (or re-save) the routine — the editor's cron parser now handles `*/N` slash intervals correctly. Re-deploy.                                                                           | Plan 02-10 parseCron fix                                       |
| `OPENAI_API_KEY set but ~/.codex/auth.json present` warning in audit.jsonl / `/diagnostics`                                    | Conflicting auth: Codex CLI will prefer the API key and bill against the OpenAI API plan (not your Codex Pro subscription)                          | Either (a) `unset OPENAI_API_KEY` from the launchd environment by editing the plist's `EnvironmentVariables` (then re-deploy), or (b) `rm ~/.codex/auth.json` and re-run `codex auth login` to use API-key mode explicitly.    | ADPT-07 healthCheck                                           |
| Secret-scan blocks save with `Prompt appears to contain a secret (... at line N, column M). Replace with ${VAR}...`             | EDIT-02 gitleaks-style regex matched a secret pattern (`sk_live_*`, `ghp_*`, 40-char hex, AWS key, Slack bot token, etc.) in your prompt             | Replace the literal secret with a `${VAR_NAME}` reference and document the env var (in the routine's README or your shell profile). See `dashboard/lib/secret-patterns.ts` for the 11-pattern list.                              | Phase 3 EDIT-02                                               |
| Save rejected with `Slug must match \`^[a-z][a-z0-9-]{0,63}$\``                                                                 | EDIT-04 slug validation failure — uppercase, starts with digit, contains underscore/space, or >64 chars                                             | Use lowercase letters, digits, and hyphens only; start with a letter; ≤64 chars. Example: `morning-brief-v2`, not `MorningBrief_v2` or `2-morning-brief`.                                                                        | Phase 3 bundle-schema.ts:24                                   |
| Save rejected with `A <runtime> routine with slug <slug> exists. Slugs must be unique across runtimes.`                        | EDIT-04 cross-runtime slug collision — slugs are globally unique across `routines-*/` trees                                                         | Pick a different slug. Convention: prefix with the runtime when you're experimenting with the same prompt across multiple runtimes (`codex-morning-brief` vs `gemini-morning-brief`).                                            | Phase 3 EDIT-04 + editor/actions.ts                            |
| Dashboard says `cloud queue inactive · configure GitHub in Settings`                                                           | No GitHub PAT found at `~/.sleepwalker/github-token`, so the cloud fleet's PR-polling bridge can't run                                              | Open dashboard → **Settings → GitHub** → generate a PAT at <https://github.com/settings/tokens/new> with `repo` (private repos) or `public_repo` (public only) scope → paste → **Test connection**. Token stored mode 0600.   | Phase 4 HLTH-01 + v0.1 QUICKSTART.md §5                        |

**Copy-paste convention:** every error string above is reproduced verbatim from the source that emits it — the supervisor, the install script, the editor's zod error, or the adapter's `healthCheck()`. If you paste the exact string into `grep -r` across the repo, you will find the emitting site.

---

## 7. Going Further

You have a routine running on your pick of the four runtimes. What next?

**Extend and iterate:**

- **Add more routines.** Copy one of the four templates (`templates/routine-*.md`), edit, Save. You can have dozens — each with its own slug, runtime, schedule, and reversibility.
- **Explore the v0.1 routine catalog.** [ROUTINES.md](./ROUTINES.md) lists all 14 v0.1 routines (6 local + 8 cloud) with what they do and how they're wired — good source of prompt-structure inspiration.
- **Tune policies per fleet.** `~/.sleepwalker/settings.json` supports per-fleet policy overrides and sleep-window-aware enforcement (§5.2). Use the dashboard Settings UI or edit the JSON directly.
- **Run routines on demand.** Every **Deployed** card has a **Run now** button. Useful for iterating on prompts without waiting for the next cron fire.
- **Wire up GitHub PAT** (optional). If you haven't already, Settings → GitHub unlocks the cloud Morning Queue: PRs from `claude/sleepwalker/*` branches land in the queue alongside local entries.

**Understand the internals:**

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — v0.1 two-tier model (local + cloud) plus v0.2 multi-runtime adapter pattern (`RuntimeAdapter` interface, `ADAPTERS` registry, launchd-writer, bash supervisor, TCC bundle staging, shared-sidecar flock lock).
- **[CLAUDE.md](../CLAUDE.md)** — project conventions, frozen v0.1 surface, slug namespacing rules, tech stack, testing conventions.
- **[`.planning/phases/`](../.planning/phases/)** — every phase's PLAN / RESEARCH / PATTERNS / SUMMARY / VALIDATION artifacts. Phase 2 (Adapters) is the densest — all four runtime integrations are documented there with their discovered gotchas.
- **`bin/sleepwalker-run-cli`** — the bash supervisor (200+ lines of `set -euo pipefail`). Read this to understand how reversibility gating, sleep-window enforcement, char-budget `SIGTERM`, ANSI stripping, and audit-log emission actually fire. Comments at the top explain every environment variable override and every hook.
- **`dashboard/lib/runtime-adapters/`** — the four adapters and the launchd-writer. If you're considering sending a fifth-runtime PR (Amp, Devin), read all four existing adapters first to see the `deploy` / `undeploy` / `runNow` / `listRuns` / `healthCheck` interface that the registry enforces.

**Contribute:**

- **Report bugs** at <https://github.com/rahulmehta25/sleepwalker/issues> — include the output of `/diagnostics` → **Copy as GitHub issue body** for a ready-made environment report.
- **Send PRs** for new templates (a `templates/routine-<runtime>-<use-case>.md` pattern is welcome), for fixes to the Troubleshooting table (§6), or for additional runtime adapters once the v0.3 runtime-adapter epic opens (Amp, Devin).
- **Open a discussion** for architectural proposals (new hooks, new safety layers, new reversibility tiers) before sending code — v0.2's additive-only invariant is strict and non-obvious.

**If you changed the runtime-deployment code path:**

> If you modified `dashboard/lib/bundle-schema.ts`, any file under `dashboard/app/editor/**`, any file under `dashboard/lib/runtime-adapters/**`, or `bin/sleepwalker-run-cli`, please update this guide at the same time. Docs drift fast in an additive codebase; the ±40% budget approximation note, the Q1 Claude Desktop manual-add warning, and the `--skip-git-repo-check` auto-add are all examples of load-bearing invariants that need to survive the next refactor. When in doubt, run `grep -r 'AUTHORING.md' .planning/` to find every plan that referenced this file and check that each cited anchor still resolves.

CI (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) when it ships as part of Plan 06-06) runs `pnpm typecheck` + `pnpm test` + the hooks/supervisor/compat bash harnesses on every PR, so a breaking change to the frozen v0.1 surface or a regression in the 373+-test dashboard suite blocks merge — but it won't catch stale docs. That's on us.

---

*Last updated: v0.2 — sealed on completion of Phase 6 Plan 03 (2026-04-22).*
