# Stack Research — Sleepwalker v0.2

**Domain:** Multi-runtime agent deployment dashboard (Next.js 15 + macOS launchd + 4 CLI/API runtimes)
**Researched:** 2026-04-18
**Overall confidence:** HIGH (all recommendations verified against official docs published within the last 30 days; npm versions confirmed via `npm view`)

## Scope Clarification

v0.1 stack is settled and carries forward unchanged: **Next.js 15.1.4, React 19, TypeScript 5.7, Tailwind 3.4, Vitest 2.1, bash+jq hooks, pnpm**. See `.planning/codebase/STACK.md`.

This document only covers **net-new** dependencies for v0.2's "one-click deploy across 4 runtimes" editor + deployment pipeline.

---

## Recommended Stack

### Runtime Adapters (the 4 target runtimes)

| Runtime | Binary | Install | Verified Version | Auth | Non-Interactive Invocation | Confidence |
|---------|--------|---------|------------------|------|----------------------------|------------|
| **Claude Code Routines** (cloud) | `claude` | already installed by v0.1 users | N/A (uses cloud API) | `claude login` OAuth + per-routine bearer tokens | `claude /schedule create` (CLI) **OR** POST to `/fire` endpoint (already working in v0.1) | HIGH |
| **Claude Code Desktop Scheduled Tasks** (local) | N/A — disk-based | Desktop.app | N/A | Desktop OAuth | drop `SKILL.md` at `~/.claude/scheduled-tasks/<slug>/SKILL.md` | HIGH |
| **OpenAI Codex CLI** (local) | `codex` | `npm i -g @openai/codex` or `brew install --cask codex` | **0.121.0** (2026-04-15) | `codex login` (ChatGPT OAuth) or `codex login --with-api-key`; token at `~/.codex/auth.json` | `codex exec [--json] "prompt"` or `codex exec - < prompt.txt` | HIGH |
| **Google Gemini CLI** (local) | `gemini` | `npm i -g @google/gemini-cli` | **0.38.2** (2026-04-17) | `gemini` (Google OAuth) or `GEMINI_API_KEY` env var; cached under `~/.gemini/` | `gemini -p "prompt" --output-format json --yolo` | HIGH |

**Why these exact invocation forms:**

- **Codex `exec` subcommand** is the officially supported non-interactive path. Aliases to `codex e`. Supports `--json` (newline-delimited events), `--cd <path>` (working dir), `-m <model>`, `-s <sandbox>` where sandbox ∈ `{read-only, workspace-write, danger-full-access}`. Prompt can be positional arg or stdin via `codex exec - < file`.
- **Gemini `-p` flag** triggers headless mode. Non-TTY contexts (launchd-spawned shells) also auto-trigger headless mode. `--output-format json` returns a single `{response, stats, error?}` object; `stream-json` returns JSONL. Exit codes: `0` success, `1` error, `42` input error, `53` turn limit. `--yolo` (or `--approval-mode yolo`) auto-approves all tool calls — required for unattended overnight runs.
- **Claude Routines** have two create paths: the `/schedule create` CLI command (per official docs, writes to same account as `claude.ai/code/routines`) and the web UI. **API trigger tokens must be generated in the web UI**; the CLI cannot create/revoke tokens. So Sleepwalker's "deploy to Claude Routine" flow is: (a) invoke `claude /schedule` with prompt + cadence for schedule-triggered routines, (b) for API triggers, hand off to a pre-filled web URL since the token-generation step is web-only.
- **Desktop scheduled tasks** have a documented disk contract: `~/.claude/scheduled-tasks/<task-name>/SKILL.md` with YAML frontmatter (`name`, `description`) and prompt body. However, **schedule/folder/model/enabled state are NOT in this file** — they live in Desktop's internal state (likely SQLite). Editing SKILL.md on disk updates the prompt; changing frequency still requires the Desktop Edit form or asking Claude in-session. Sleepwalker's "deploy to Desktop" flow writes SKILL.md and then either (a) opens Desktop's Schedule page for the user to click through, or (b) asks Claude via `claude -p "add scheduled task ..."` in a Desktop session.

### Core Deployment Primitives

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **`plist` (npm)** | 3.1.0 | Generate launchd plist XML from JS objects | Last published 2023-09 — stable, widely used. Two-way parse/build. Treat plist as "JSON with XML wire format." Sleepwalker writes one plist per deployed Codex/Gemini routine. |
| **`simple-git` (npm)** | 3.36.0 | Git ops from Next.js server (Save-to-repo button) | 11M+ weekly downloads vs isomorphic-git's 1.1M. Last published 2026-04-12 — actively maintained. Shells out to the user's `git` binary (already required by v0.1). Promise-based, TypeScript types included. |
| **`execa` (npm)** | 9.6.1 | Wrapper for `codex`, `gemini`, `claude` shell-outs | Faster than `zx` (no shell spawn overhead), structured stderr capture, timeouts, verbose logging with timestamps, ESM-native. Already the de facto Node.js child_process replacement. |
| **`@monaco-editor/react` (npm)** | 4.7.0 | In-browser prompt + YAML frontmatter editor | Peer-deps compatible with React 19 (v0.1 stack). IntelliSense makes writing YAML frontmatter + markdown prompts feel like VS Code. 4.7.0 was published 2025-11. See "Editor decision" below for CodeMirror comparison. |
| **`monaco-editor` (npm)** | 0.55.1 | Peer dep of `@monaco-editor/react` | Required peer. Pin to a known-good range. |

### launchd Wiring

**No Node.js library for launchd orchestration is recommended.** The only package found — `launchd.plist` — has a single version (0.0.1) published 2013-11 and is abandoned. DIY approach using the `plist` library + `execa` is both simpler and more robust.

**Canonical flow for deploying a Codex/Gemini routine:**

1. Generate plist object in TypeScript.
2. Write XML with `plist.build(obj)` to `~/Library/LaunchAgents/com.sleepwalker.<slug>.plist`.
3. Register with `execa('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath])`.
4. Unregister with `execa('launchctl', ['bootout', `gui/${process.getuid()}/com.sleepwalker.<slug>`])`.

**Why `bootstrap`/`bootout` over `load`/`unload`:** `load`/`unload` are legacy subcommands — they still work but Apple's docs classify them as deprecated. `bootstrap` requires explicit domain target (`gui/<uid>` for GUI-logged-in user agents, `user/<uid>` for headless, `system` for root daemons). For Sleepwalker we want `gui/<uid>` — matches Desktop app's behavior: only run when user is logged in at the GUI, which is the "Mac must be awake" constraint users already accept from v0.1.

**Canonical plist shape for a Sleepwalker routine:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sleepwalker.codex.my-routine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>codex exec --json "$(cat ~/.sleepwalker/routines/my-routine/prompt.md)" >> ~/.sleepwalker/audit.jsonl 2>&amp;1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/Users/.../routines/my-routine/stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/.../routines/my-routine/stderr.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

`StartCalendarInterval` is the launchd analog of cron. For multi-time schedules (e.g. "9am and 6pm") pass an **array of dicts**, not a single dict. Missing keys = wildcard.

### Editor Decision: Monaco vs CodeMirror 6

**Recommended: `@monaco-editor/react` 4.7.0.**

| Criterion | Monaco | CodeMirror 6 |
|-----------|--------|--------------|
| Bundle size | 5-10 MB | ~300 KB core + modular extensions |
| Markdown + YAML highlighting | Built-in, VS Code-grade | Built-in via language packs |
| IntelliSense / autocomplete | Rich out-of-box | Requires wiring extensions |
| Next.js 15 SSR | Needs `dynamic(..., { ssr: false })` wrapped in a `'use client'` component — known pattern | Works as client component |
| Mobile | Not usable | First-class |
| Learning curve for extending | High | Medium (modular) |

**Rationale for Monaco:** Sleepwalker's dashboard is a desktop-only localhost tool (mobile support not a requirement). The editor is the **authoring surface** — prompt feels like editing VS Code is a strong UX win and matches what Claude Code / Codex users already know. The bundle-size penalty is paid once on `/routines/new` and doesn't affect the Morning Queue route. Next.js dynamic-import workaround is well-documented. If Turbopack integration breaks (known issue per Vercel #72613), fall back to the non-Turbopack dev server — this codebase already uses the standard Next.js compiler.

**When to switch to CodeMirror 6 instead:** if mobile authoring becomes a v0.3 requirement, or if the dashboard starts embedding multiple editors on the same page (bundle cost multiplies).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `yaml` (npm) | ^2.6.x | Parse/write YAML frontmatter for SKILL.md + routine configs | Every routine file; YAML frontmatter is the Desktop contract |
| `gray-matter` (npm) | ^4.0.x | Markdown + frontmatter parser | Reading existing SKILL.md files back into the editor |
| `uuid` (npm) | ^11.x | Generate routine slugs / deploy IDs | Only if kebab-case slug collides; otherwise use user-provided name |
| `zod` (npm) | ^3.25.x | Validate routine schema before disk write | Critical — an invalid plist or malformed SKILL.md silently fails to schedule |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `plutil` (macOS built-in) | Validate generated plist XML | Run as post-write check: `plutil -lint <path>` returns 0 on valid |
| `launchctl list com.sleepwalker.<slug>` | Verify registration post-bootstrap | Returns status dict; use in integration tests |
| Existing `vitest` harness | Unit test adapters with mocked execa | Already wired in v0.1 — reuse |

---

## Installation

```bash
# in dashboard/
pnpm add plist simple-git execa @monaco-editor/react monaco-editor yaml gray-matter zod

# dev dep
pnpm add -D @types/plist

# user-level prerequisites (document in docs/AUTHORING.md, not auto-installed)
npm i -g @openai/codex        # v0.121.0+
npm i -g @google/gemini-cli   # v0.38.2+
# claude CLI assumed present from v0.1
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `plist` + DIY launchd | `launchd.plist` npm package | Never — package is abandoned (last published 2013-11, v0.0.1 only). |
| `simple-git` | `isomorphic-git` | Only if shipping code that runs in a browser (not our case — Save-to-repo is server-side Next.js API route). |
| `simple-git` | shell out to `git` via `execa` | Works fine for 2-3 commands; `simple-git` pays for itself when we need log parsing, status checks, branch ops. |
| `execa` | `zx` | `zx` is better as a CLI scripting tool (globally installed, `.mjs` scripts). For a library embedded in a Node server, `execa` is lighter + faster (no shell spawn) + more observable. |
| `execa` | Node's `child_process` directly | Use `child_process` only for streaming stdout line-by-line to the dashboard UI (execa handles this too but the built-in is sometimes easier for custom backpressure). |
| `@monaco-editor/react` | `@uiw/react-codemirror` (CodeMirror 6) | If mobile support becomes required, or if editor bundle size degrades FCP for `/routines/new` below acceptable threshold. |
| `@monaco-editor/react` | `react-simple-code-editor` | Only if Monaco fails to load in Turbopack and we need a zero-dep fallback — it's textarea-plus-highlighting, no IntelliSense. |
| DIY YAML frontmatter parse | `gray-matter` | `gray-matter` is 5 lines of dependency for robust parsing — worth it, don't reinvent. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `launchd.plist` npm package | Abandoned since 2013 (single version 0.0.1); no TS types; no maintenance | `plist` v3.1.0 + DIY |
| `launchctl load -w` | Deprecated legacy subcommand; Apple moving all tooling off it (Homebrew already switched) | `launchctl bootstrap gui/$(id -u) <path>` |
| `nodegit` | Native bindings — compile failures on new Node versions; install takes minutes; overkill for `git add`/`git commit` | `simple-git` |
| `child_process.exec` (raw) | No timeout, no signal handling, no stderr stream separation, easy to miss exit codes | `execa` |
| Creating a Claude Routine fully programmatically with a single API call | **Does not exist** as of 2026-04. Routine *creation* is CLI-only (`/schedule create` for schedule triggers) or web-only (for API + GitHub triggers). Only the `/fire` endpoint on an already-created routine is programmatic. | Hybrid flow: CLI for schedule-trigger creation, pre-filled web URL handoff for API-trigger creation |
| `monaco-editor` (standalone) without `@monaco-editor/react` | Requires manual lifecycle management in React 19 — mount/unmount, dispose, refs | `@monaco-editor/react` wrapper |
| System-domain launchd plists (`/Library/LaunchDaemons/`) | Require root, run as root, access-control nightmare | User-agent plists in `~/Library/LaunchAgents/` with `gui/<uid>` domain |
| Writing plist XML by hand (string interpolation) | XML escaping is subtle, plutil will reject malformed output, debugging costs hours | `plist.build(obj)` + `plutil -lint` in CI |

---

## Stack Patterns by Runtime

**If deploying to Claude Code Routines (cloud):**
- For **schedule triggers only**: shell out `claude /schedule create --name <slug> ...` via `execa`. Prompt is passed through stdin or positional arg per Claude CLI contract.
- For **API triggers**: open the routine's edit page at `claude.ai/code/routines/<id>` with the token-generation modal pre-scrolled; user copies token back into Sleepwalker Settings → Cloud Credentials (v0.1 flow, already working).
- For **GitHub triggers**: web-only, no CLI path. Hand off to the web UI.
- The `/fire` endpoint (v0.1) continues to be the Run-now mechanism.

**If deploying to Claude Code Desktop Scheduled Tasks (local):**
- Write `SKILL.md` (YAML frontmatter + prompt body) to `~/.claude/scheduled-tasks/<slug>/SKILL.md`.
- Schedule + permission-mode + model + enabled state are held in Desktop's state store, not accessible via file drop. Either:
  - (a) Write SKILL.md + open Desktop's Schedule page for the user to set frequency (realistic).
  - (b) Invoke `claude -p "create a scheduled task named <slug> running <cadence> at <time>"` — lets the Desktop agent create the task record with the correct schedule. Higher trust cost but fully programmatic.
- Recommended: start with (a) for v0.2; revisit (b) once we can verify it against a real Desktop install.

**If deploying to Codex CLI:**
- Write prompt file to `~/.sleepwalker/routines/codex/<slug>/prompt.md`.
- Generate plist invoking `codex exec --json --sandbox workspace-write --cd <routine-dir> - < prompt.md`.
- Append JSONL output to `~/.sleepwalker/audit.jsonl` with `source: "codex"`.
- `bootstrap` into `gui/$(id -u)`.

**If deploying to Gemini CLI:**
- Write prompt file to `~/.sleepwalker/routines/gemini/<slug>/prompt.md`.
- Generate plist invoking `gemini -p "$(cat prompt.md)" --output-format stream-json --yolo --include-directories <dir>`.
- Parse streamed JSONL events; map `tool_use`, `tool_result`, `message`, `result` types to audit entries with `source: "gemini"`.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@monaco-editor/react@4.7.0` | `react@19.0.0`, `monaco-editor@>=0.25 <1` | Peer deps explicitly list React 19 — verified. Monaco 0.55.1 is current. |
| `execa@9.6.1` | Node `^18.19 \|\| >=20.5` | v0.1 uses Node 22, safe. ESM-only — `import { execa } from 'execa'`. |
| `simple-git@3.36.0` | Node `>=10.4` | Requires git binary on PATH (already a v0.1 dependency). |
| `plist@3.1.0` | Node `>=10.4` | No native deps. |
| `@openai/codex@0.121.0` | macOS 12+, Linux; Windows experimental | Most recent release 2026-04-15 per changelog. |
| `@google/gemini-cli@0.38.2` | Node 18+ | Published 2026-04-17 (one day before this research). |
| Next.js 15.1.4 + Monaco | Requires `dynamic(..., { ssr: false })` wrapped in a `'use client'` component | Known pattern; Turbopack has open bug for dynamic imports — use standard compiler until resolved. |

---

## Critical Non-Existence Claims (roadmap must NOT assume these exist)

1. **No programmatic Claude Routine creation with full trigger set.** Schedule triggers: CLI only (`/schedule create`). API triggers: web UI only for token generation. GitHub triggers: web UI only. The `/fire` endpoint only fires an already-created routine; it does not create one. [Source: code.claude.com/docs/en/routines, verified 2026-04-18]

2. **No file-based schedule/enable toggle for Desktop Scheduled Tasks.** SKILL.md on disk controls only the prompt + name + description. Frequency, folder, model, and enabled state are in Desktop's internal state store. Editing SKILL.md alone does not create a new scheduled task — it must already be registered through the Desktop UI or by a Desktop session agent invocation. [Source: code.claude.com/docs/en/desktop-scheduled-tasks, verified 2026-04-18]

3. **No maintained Node.js library for launchd plist orchestration.** `launchd.plist` is abandoned. DIY with `plist` + `execa` + `launchctl` is the canonical path.

4. **No way to detect Codex / Gemini login programmatically without invoking the tool.** Heuristic: check for `~/.codex/auth.json` presence for Codex; check for cached credential files under `~/.gemini/` for Gemini. These are not officially documented as detection points but are the on-disk artifacts of login. Most robust check is to run `codex login status` / `gemini` with a trivial prompt and parse exit code.

---

## Sources

**Official docs (HIGH confidence):**
- [Claude Code Routines](https://code.claude.com/docs/en/routines) — `/fire` endpoint, `/schedule` CLI, trigger types, daily caps (Pro 5/day, Max 15/day, Team/Enterprise 25/day), research preview caveats
- [Claude Code Desktop Scheduled Tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) — `~/.claude/scheduled-tasks/<name>/SKILL.md` format, YAML frontmatter spec, state separation (prompt on disk; schedule in app state)
- [OpenAI Codex CLI Reference](https://developers.openai.com/codex/cli/reference) — `codex exec`, `--json`, `--cd`, `--sandbox`, `-m`, `--full-auto` flags
- [OpenAI Codex Auth](https://developers.openai.com/codex/auth) — `~/.codex/auth.json`, OS keychain option, ChatGPT vs API-key auth
- [OpenAI Codex CLI overview](https://developers.openai.com/codex/cli) — install (`npm i -g @openai/codex` / `brew install --cask codex`), plan inclusions (Plus/Pro/Business/Edu/Enterprise)
- [OpenAI Codex Releases](https://github.com/openai/codex/releases) — latest v0.121.0, 2026-04-15
- [Gemini CLI repo](https://github.com/google-gemini/gemini-cli) — v0.38.2, `-p/--prompt`, `--output-format json|stream-json`, rate limits (60 req/min, 1000/day personal Google account)
- [Gemini CLI Authentication](https://geminicli.com/docs/get-started/authentication/) — Google sign-in, API key, Vertex AI, headless mode
- [Gemini CLI Headless Mode](https://geminicli.com/docs/cli/headless/) — JSON/JSONL event shape, exit codes 0/1/42/53
- [Apple launchd.info tutorial](https://www.launchd.info/) — `launchctl bootstrap gui/<uid>` vs legacy `load -w`, user agent path (`~/Library/LaunchAgents/`)
- [launchctl cheat sheet](https://gist.github.com/masklinn/a532dfe55bdeab3d60ab8e46ccc38a68) — modern vs legacy subcommand status, domain targets

**npm registry (HIGH confidence, via `npm view`):**
- `@monaco-editor/react@4.7.0` (modified 2025-11-21) — peer deps React 19 ✓
- `monaco-editor@0.55.1`
- `execa@9.6.1` (Node ^18.19 || >=20.5)
- `simple-git@3.36.0` (modified 2026-04-12)
- `plist@3.1.0` (modified 2023-09-10; stable)
- `launchd.plist@0.0.1` (modified 2013-11-18) — **DO NOT USE, abandoned**
- `zx@8.8.5`
- `codemirror@6.0.2`, `@uiw/react-codemirror@4.25.9`
- `@openai/codex@0.121.0` (modified 2026-04-18)
- `@google/gemini-cli@0.38.2` (modified 2026-04-17)

**Community references (MEDIUM confidence — triangulated against official docs):**
- [9to5Mac: Anthropic adds routines](https://9to5mac.com/2026/04/14/anthropic-adds-repeatable-routines-feature-to-claude-code-heres-how-it-works/) — confirms research-preview status as of 2026-04-14
- [CodeMirror vs Monaco comparison](https://dev.to/suraj975/monaco-vs-codemirror-in-react-5kf) — bundle size, mobile, feature comparison
- [LogRocket: code editors for React](https://blog.logrocket.com/best-code-editor-components-react/) — triangulation of editor recommendations
- [execa vs zx comparison](https://npm-compare.com/child_process,execa,shelljs,shx) — shell-spawn overhead, cross-platform
- [simple-git vs isomorphic-git trends](https://npmtrends.com/isomorphic-git-vs-nodegit-vs-simple-git) — 10x download lead for simple-git

**OSS multi-runtime agent references (LOW confidence — none are direct analogs):**
- [Flowise](https://docs.flowiseai.com/using-flowise/agentflowv2) — visual workflow composition, different problem domain (LLM chain orchestration, not CLI-runtime deployment)
- [Continue.dev](https://github.com/continuedev/continue) — IDE-integrated, not scheduler
- [Open-Interpreter](https://github.com/openinterpreter/open-interpreter) — code execution, not scheduling

None of the OSS projects surveyed solve the same problem Sleepwalker does (one dashboard → N CLI agent runtimes + cron). Sleepwalker's design is ahead of the reference implementations.

---

*Stack research for: Sleepwalker v0.2 multi-runtime deployment*
*Researched: 2026-04-18*
