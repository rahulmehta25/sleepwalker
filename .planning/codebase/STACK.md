# Technology Stack

**Analysis Date:** 2026-04-18

## Languages

**Primary:**
- TypeScript 5.7.2 - Dashboard frontend, API routes, and library modules (`dashboard/app/`, `dashboard/lib/`)
- Bash - Local hooks, CLI scripts, installation automation (`hooks/`, `bin/`)

**Secondary:**
- Markdown - Routine definitions, setup documentation (`routines-local/`, `routines-cloud/`)

## Runtime

**Environment:**
- Node.js 22.x (inferred from typescript 5.7.2 and latest dependencies)
- macOS (local fleet execution via Desktop Scheduled Tasks)
- Anthropic cloud (cloud fleet via Routines)

**Package Manager:**
- pnpm (inferred from pnpm-lock.yaml in dashboard/)
- Lockfile: present at `dashboard/pnpm-lock.yaml`

## Frameworks

**Core:**
- Next.js 15.1.4 - Full-stack web framework for dashboard UI + API (`dashboard/`)
- React 19.0.0 - Component library and UI rendering
- React DOM 19.0.0 - DOM bindings

**UI & Styling:**
- Tailwind CSS 3.4.17 - Utility-first CSS framework (`dashboard/tailwind.config.js`)
- PostCSS 8.4.49 - CSS transformation pipeline
- Autoprefixer 10.4.20 - Vendor prefix automation
- Lucide React 0.468.0 - SVG icon library
- Framer Motion 11.15.0 - Animation library for component transitions

**Testing:**
- Vitest 2.1.8 - Fast unit test runner (`dashboard/tests/`, `dashboard/vitest.config.ts`)

**Build/Dev:**
- TypeScript 5.7.2 - Static type checking
- Node.js built-in modules (fs, path, os, http) - File system and OS interactions

## Key Dependencies

**Critical:**
- next 15.1.4 - Why it matters: hosts dashboard at `localhost:4001`, provides API routes for queue management, settings persistence, GitHub polling, cloud routine triggering
- react 19.0.0 - Why it matters: renders UI components for Morning Queue, routines management, settings
- typescript 5.7.2 - Why it matters: strict mode enabled in tsconfig.json; all API routes and library code type-checked before deployment

**Infrastructure:**
- framer-motion 11.15.0 - Animations and transitions for queue swipe gestures
- clsx 2.1.1 - Utility for conditional CSS class merging
- lucide-react 0.468.0 - Icons for navigation (ListChecks, Workflow, Cloud, etc.)

## Configuration

**Environment:**
- Node.js modules read directly from file system (`process.cwd()`, `process.env.HOME`)
- State stored in `~/.sleepwalker/` (settings.json, queue.jsonl, audit.jsonl, budgets.json, github-token, cloud-credentials.json, cloud-cache.json)
- No .env files required or used (configuration via JSON files in home directory)

**Build:**
- `dashboard/tsconfig.json` - TypeScript compiler options with strict mode
- `dashboard/next.config.js` - Next.js configuration (reactStrictMode: true)
- `dashboard/postcss.config.js` - PostCSS configuration for Tailwind
- `dashboard/tailwind.config.js` - Tailwind CSS custom theme (lunar/celestial palette)
- `dashboard/vitest.config.ts` - Unit test configuration with Node environment

## Platform Requirements

**Development:**
- macOS (local fleet execution)
- jq (JSON query tool, required for install.sh)
- Node.js 22.x with pnpm
- Claude Code Desktop (for scheduled task enrollment)
- GitHub CLI (gh command, used by cloud routines for PR operations)
- git (version control, required by cloud routines)

**Production:**
- Deployment target: localhost:4001 (macOS development environment)
- Local file system access at `~/.sleepwalker/` for state persistence
- GitHub API access (token-based) for cloud queue polling
- Anthropic Claude Code Routines API (beta) for cloud fleet execution
- macOS system frameworks (Mail.app, Calendar, Photos via AppleScript for local routines)

## External API Contracts

**Claude Code Desktop Hooks Protocol:**
- Input: JSON over stdin with session_id, transcript_path, tool_name, tool_input
- Output: JSON over stdout with hookSpecificOutput containing permissionDecision (allow|deny|ask|defer)
- Hooks integrated at `~/.claude/settings.json` pre-merge by install.sh

**Claude Code Routines /fire Endpoint:**
- Method: POST
- Headers: Authorization (Bearer token), anthropic-beta: experimental-cc-routine-2026-04-01, anthropic-version: 2023-06-01, Content-Type: application/json
- Body: optional {text: string} for context
- Response: {type, claude_code_session_id, claude_code_session_url}
- Client: `dashboard/lib/fire-routine.ts`

**GitHub API v2022-11-28:**
- Endpoints used: /repos/{owner}/{repo}/pulls, /user
- Authentication: Bearer token (personal access token stored in `~/.sleepwalker/github-token`)
- Used by: cloud routine PR trigger detection, cloud queue polling (`dashboard/lib/github.ts`)

---

*Stack analysis: 2026-04-18*
