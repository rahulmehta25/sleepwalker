# Phase 3: Editor — Research

**Researched:** 2026-04-19
**Domain:** Next.js 15 App Router Server Actions + form validation (zod) + secret scanning + atomic multi-file writes + localStorage autosave + React 19 `useActionState` hookup, building on Phase 1 frozen adapter surface and Phase 2 adapter+registry (not yet executed).
**Confidence:** HIGH (live-probed dashboard, verified npm current versions, CONTEXT.md/UI-SPEC.md both locked and approved, zero speculative decisions)

---

## Summary

Phase 3 delivers the `/editor` Next.js route (on `localhost:4001`) plus the shared `dashboard/lib/bundles.ts` read-side helper. It is the **first consumer** of the Phase 2 real adapter registry — specifically `healthCheckAll()` (for dimming unavailable runtime cards) and the `RoutineBundle` contract frozen in Phase 1. Every visual/interaction decision is already locked by the approved 03-UI-SPEC.md (440 lines, commits 1152375 + 961c4d3); this research answers only the technical/implementation questions that UI-SPEC deliberately left to the planner.

The phase maps to **five requirements** (EDIT-01..EDIT-05) and addresses **five non-negotiable success criteria** from ROADMAP.md §Phase 3. The heavy technical surfaces are: (1) a single zod schema for the `RoutineBundle` write-side shape, wired into a React 19 Server Action via `useActionState`; (2) a hand-rolled secret-pattern regex list shared verbatim between client-preview and server-authoritative scanners; (3) a two-phase atomic write to `routines-<runtime>/<slug>/` (temp-directory-swap, not per-file rename); (4) a 500ms-debounced localStorage autosave with an explicit draft-recovery banner (never silent restore per UI-SPEC) + Next.js `<Link>` intercept for in-app nav + `beforeunload` for tab close; (5) a cross-runtime slug collision check that reads all four `routines-*/` sibling directories.

**Primary recommendation:** Ship the phase in four waves: **Wave 0** adds the four net-new dependencies + bundle-schema + secret-pattern modules (pure data/type, no I/O, independently testable). **Wave 1** ships `bundles.ts` (the read side consumed by Phase 4 too) + the Server Action `saveRoutine` with atomic-write helper. **Wave 2** ships the client components (form, runtime grid, preview panel, secret-scan panel, draft-recovery banner) against the UI-SPEC. **Wave 3** wires the `/editor` route page.tsx + end-to-end Vitest integration test + ROADMAP/STATE updates. Each wave lands a green test suite; Wave 1 is the hardest and must go first.

---

<user_constraints>
## User Constraints (from CONTEXT.md / UI-SPEC.md)

Phase 3 has **no CONTEXT.md yet** — but the approved **03-UI-SPEC.md** locks the visual/interaction surface with the same authority as a CONTEXT.md `## Decisions` block. Every item below is treated as a locked decision by the planner.

### Locked Decisions (from 03-UI-SPEC.md + Phase 2 CONTEXT.md)

**Visual / interaction contract (UI-SPEC, do NOT revisit):**
- Two-column layout at ≥1024px: form column `max-w-[640px]` on the left, sticky preview column `w-80` on the right (`sticky top-10`). Collapses to single column below 1024px.
- 2×2 runtime radio-card grid. Unavailable runtimes use `opacity-40 cursor-not-allowed` + amber health pill + fix-instructions tooltip.
- Inline red-panel secret-scan error (NOT toast, NOT modal). Appears directly below the prompt textarea. Persists until matched substring is removed. Save button stays interactive but click scrolls to panel.
- Explicit draft-recovery banner (NOT silent restore). Two buttons: `Restore draft` (aurora ghost) + `Start fresh` (ghost).
- Every form input carries `autocomplete="off"` + `autocorrect="off"` + `autocapitalize="off"` + `spellcheck="false"` + `data-1p-ignore` + `data-lpignore="true"` + `data-form-type="other"` + `data-bwignore`. The prompt textarea is `<textarea rows={30} className="font-mono">` — no Monaco, no CodeMirror (Anti-Pattern 6 in research/ARCHITECTURE.md is binding).
- Character count bottom-right of textarea: `{count} / 16,000`, color shifts at 80% (amber) / 100% (red).
- Slug auto-derive from name (lowercase, hyphenate, truncate 64), with a `touched` flag that locks derivation after manual edit. A `↺ Re-derive from name` micro-link re-enables it.
- Cronstrue live preview in an aurora pill below the cron input. On parse error, render `Invalid cron — 5 fields required (minute hour day month weekday)` in signal-red.
- Server Action success shape: success pill `saved {slug} at {time}` (signal-green, dismisses on next change); form remains on-page, slug+name read-only for 800ms then unlock.
- Copy contract: every user-facing string pre-committed in UI-SPEC §Copywriting Contract. Planner MUST use these exact strings. Executor MUST NOT paraphrase.
- Bespoke design system — `dashboard/app/globals.css @layer components` only. No shadcn, no third-party registry, no new fonts, no new color tokens. `ui_safety_gate` is not applicable this phase.

**Build-order constraint (from ROADMAP + Phase 2 CONTEXT.md):**
- Phase 3 depends on Phase 2. Specifically, Phase 3 cannot ship until Plan `02-09-PLAN.md` lands (the registry swap that replaces `notImplemented` stubs with real adapters + the `HealthStatus.warning` amendment). Phase 2 also adds `assertValidSlug` to every builder in `slug.ts` (Plan 02-01), which is the guarantee the editor relies on when calling `toBundleDir(runtime, slug)` after zod validation.
- `bundles.ts` was declared Phase 3 territory by Phase 2's CONTEXT.md §"v0.1 Bundle Reading" — directory enumeration (NOT `toBundleDir` lookups) for v0.1 backward-compat, with `_test-zen` / `sleepwalker-*` prefixes trusted as-is.

**Adapter contract constraints (from Phase 1 types.ts + Phase 2 CONTEXT):**
- `RoutineBundle` shape is frozen. Fields: `slug`, `runtime`, `name`, `prompt`, `schedule` (nullable), `reversibility`, `budget`, `bundlePath`. Editor writes ALL of these + any runtime-specific fields via `config.json` (see §Bundle-on-Disk Shape below).
- `HealthStatus.warning?: string` is added by Plan 02-09 (Phase 2). Editor's runtime radio cards consume it as an amber (not red) helper under the card.
- `healthCheckAll()` returns `HealthStatus[]` — one per runtime; never throws; unavailable runtimes report `{available: false, reason}`.

### Claude's Discretion (for the planner)

- Exact shape of the zod schema (single schema vs. discriminated union on `runtime`). Research recommends single schema with optional per-runtime fields — see §Technical Approach §EDIT-02.
- Whether the secret-pattern regex list lives in a stand-alone `lib/secret-patterns.ts` module or is co-located in `lib/bundle-schema.ts`. Research recommends stand-alone because both client and server import it.
- Atomic-write strategy: per-file `.tmp` rename vs. directory-swap (`.tmp-bundle/` → rename to final). Research recommends directory-swap — see §Technical Approach §EDIT-02.
- Whether the Server Action lives in `dashboard/app/editor/actions.ts` (Next.js App Router convention) or `dashboard/lib/editor-action.ts`. Research recommends `dashboard/app/editor/actions.ts` (convention).
- Vitest describe/it nesting for each new test file.
- Whether `bundles.ts` exports `listBundles()` only or also `readBundle(runtime, slug)` + `hasBundle(runtime, slug)`. Research recommends all three — see §bundles.ts design.
- Whether slug-collision check is a dedicated Server Action (`checkSlugAvailability`) or a method on `bundles.ts`. Research recommends a dedicated Server Action because it's called on debounced keystroke, not on form submit.

### Deferred Ideas (OUT OF SCOPE)

- **Monaco editor / syntax highlighting** — locked out by research/ARCHITECTURE.md Anti-Pattern 6. The textarea is the prompt surface.
- **Cron builder / visual picker** — cronstrue preview is the entire cron UX. No `react-js-cron`-style visual builder.
- **Real-time collision check on every keystroke without debounce** — 400ms debounce per UI-SPEC. Forces the server hit rate low.
- **Server-side session-level draft persistence** — drafts live in client localStorage only. Zero server state.
- **Progressive enhancement (form POSTs without JS)** — the editor is a localhost-only tool with autosave + debounced validation; degrading to no-JS would strip the core UX. Form requires JS.
- **Deploy button, Run-now button, Save-to-repo button** — ALL belong to Phase 4 (DEPL-* + REPO-01). Phase 3 ships only Save. The /editor success flow redirects (or pill-updates) to `/routines?highlight={slug}`; Phase 4 wires the Deploy button on the routine card.
- **Bundle versioning / migration** — localStorage key is `sleepwalker.draft.v1` explicitly; if we ever rev the schema we ship `v2` alongside.
- **Edit-existing-routine mode on `/editor`** — Phase 3 is create-only. Editing an existing bundle (`?slug=<slug>`) is Phase 4 or later.
- **Server-side rate limiting on `saveRoutine`** — localhost, single user; no rate limit needed.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

Each requirement maps to one or more tests in the Validation Architecture section below. Every success criterion from ROADMAP.md §Phase 3 is covered.

| ID | Description | Research Support |
|----|-------------|------------------|
| **EDIT-01** | `/editor` route renders form with name, prompt, runtime (radio, unavailable dimmed), cron (cronstrue preview), reversibility radio, budget | UI-SPEC locks layout. Technical: Server Component `page.tsx` calls `healthCheckAll()` + passes to `EditorClient`; `cronstrue@3.14.0` renders preview; runtime radio cards read `HealthStatus[]`. |
| **EDIT-02** | `saveRoutine` Server Action validates via zod, runs secret-scan (gitleaks-style regex), writes `config.json` + `prompt.md` to `routines-<runtime>/<slug>/` atomically | See §Technical Approach §EDIT-02. zod@4.3.6 schema + shared `secret-patterns.ts` + directory-swap atomic write. Server-side scan is authoritative; client mirrors same pattern list. |
| **EDIT-03** | Editor autosaves to localStorage (500ms debounce) and intercepts nav when dirty | See §Technical Approach §EDIT-03. `use-draft-autosave.ts` custom hook + `beforeunload` on dirty + Next.js `<Link>` wrapper that checks a ref-held dirty flag. |
| **EDIT-04** | Slug validation enforces `^[a-z][a-z0-9-]{0,63}$` and rejects collisions across all `routines-*/` | See §Technical Approach §EDIT-04. Reuses frozen Phase 1 `validateSlug`. Collision check is a Server Action reading all four sibling dirs. |
| **EDIT-05** | All editor inputs set the nine autofill-opt-out attributes | See §Technical Approach §EDIT-05. Already enumerated in UI-SPEC. Research contribution: verify set matches 1Password + Bitwarden + LastPass + browser autofill + spellcheck opt-out combined. |

</phase_requirements>

---

## Architectural Responsibility Map

Every capability in Phase 3 maps to exactly one tier. The planner uses this to sanity-check task assignments.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/editor` page rendering | Frontend Server (Next.js RSC) | — | Server Component calls `healthCheckAll()` on mount, passes to client |
| Form state + autosave + validation preview | Browser / Client | — | React 19 `useActionState` + custom `useDraftAutosave` hook + `useTransition` |
| `saveRoutine` Server Action (zod + secret-scan + atomic write) | API / Backend (via `"use server"`) | Database / Storage (filesystem) | Server Actions are the backend in App Router; file writes are the persistence layer |
| Atomic bundle write | API / Backend | Database / Storage | `fs.mkdtempSync` + `fs.writeFileSync` + `fs.renameSync` (directory swap) |
| Cronstrue preview rendering | Browser / Client | — | Pure JS, no server hit |
| Secret-scan (preview) | Browser / Client | — | Runs on every prompt keystroke after 250ms debounce |
| Secret-scan (authoritative) | API / Backend | — | Runs inside `saveRoutine`; client scan is advisory only |
| Slug collision check | API / Backend (Server Action) | Database / Storage | Reads `routines-*/{slug}` existence via `fs.access` |
| `bundles.ts` read side (`listBundles`, `readBundle`, `hasBundle`) | API / Backend | Database / Storage | Pure Node fs, no client import (only called by Server Components + Server Actions) |
| Draft localStorage persistence | Browser / Client | — | `localStorage.setItem("sleepwalker.draft.v1", ...)` |
| In-app nav intercept | Browser / Client | — | Next.js `useRouter` + wrapped `<Link>` that checks dirty flag |

**No new tier involvement.** Everything lands in the existing Frontend Server + Browser + Backend split; no new OS-level registrations, no new external services.

---

## Standard Stack

### Core (net-new for Phase 3)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | **4.3.6** [VERIFIED: npm view zod version] | `RoutineBundle` schema validation inside `saveRoutine` Server Action + shared client-side validation | De facto TypeScript schema library; zero deps; outputs type-level inference via `z.infer<typeof schema>`; Next.js 15 + React 19 compatible. **Note:** research/STACK.md said `^3.25.x` but v4 is now latest (2026-04-19 verified). Plan author should pick v4 unless Phase 2 has already installed v3 — v4 has breaking changes (prefer-strict, narrower unknown propagation). Recommend v4.3.6 since Phase 2 has not installed zod yet. |
| `cronstrue` | **3.14.0** [VERIFIED: npm view cronstrue version] | Human-readable cron preview ("Runs at 06:00 AM, Monday through Friday") | Only well-maintained library for cron-to-English; zero deps; same pattern used by GitLab, Airflow docs, ProPublica crontab.guru. Throws on invalid cron — catch and surface as inline error. |
| `yaml` | **2.8.3** [VERIFIED: npm view yaml version] | Write YAML frontmatter at the top of `SKILL.md` (claude-desktop runtime only) | Research/STACK.md locked this. Claude Desktop Scheduled Tasks format is YAML frontmatter + markdown body. `yaml` is the maintained successor to `js-yaml`; TypeScript-native, round-trip-safe. |
| `gray-matter` | **4.0.3** [VERIFIED: npm view gray-matter version] | Parse YAML frontmatter of existing SKILL.md files (Phase 3 uses this inside `bundles.ts` read side) | 7M+ weekly downloads; the standard for markdown-with-frontmatter parsing in Node. |

### Supporting (already installed — Phase 3 consumes)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next` | 15.1.4 | App Router + Server Actions + `useActionState` hookup | Every Server Action file is `"use server"` directive at top; every form uses React 19's `useActionState` hook |
| `react` | 19.0.0 | `useActionState`, `useTransition`, `useFormStatus`, `useOptimistic` | React 19 brings first-class form + action hooks. `useActionState(action, initialState)` returns `[state, formAction, isPending]`. This is the idiomatic pattern for Server Action error return rendering. |
| `lucide-react` | 0.468.0 | Icons for runtime cards + Save button + Trash2 + AlertCircle (secret-scan panel) | UI-SPEC enumerates. Zero new icons introduced. |
| `framer-motion` | 11.15.0 | PageHeader stagger + 300ms red-flash on "View matched region" secret-scan scroll-to-line | UI-SPEC locks. `prefers-reduced-motion` degrades to opacity-only fades. |
| `clsx` | 2.1.1 | Conditional class composition for runtime radio card states | Already in v0.1 use. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod | yup, joi, valibot, typebox | All work. zod has the largest ecosystem + best TS inference + Next.js examples. Valibot is lighter but less battle-tested. |
| cronstrue | cron-validator, later.js, cron-parser+hand-rolled English | cron-validator only validates (no English output). later.js is overkill (runs cron evaluator). Hand-rolling English is a multi-week project. |
| yaml | js-yaml | `js-yaml` is unmaintained as of 2023; `yaml` is its successor; Claude Desktop SKILL.md round-trip demands a modern parser. |
| gray-matter | front-matter | `gray-matter` has 10× the usage; both are stable but gray-matter is the Node-in-2026 default. |
| Server Action | API route (`/api/editor/save`) | Server Actions are simpler (no route file, no JSON serialization boilerplate, built-in CSRF). `dashboard/app/settings/` currently uses API routes (legacy); the editor is a clean slate and should use Server Actions. This is the strongest recommendation in this research. |
| Directory-swap atomic write | Two fs.rename calls | See §Technical Approach §EDIT-02 — directory-swap is the only way to get both files atomic as a pair. |
| localStorage | IndexedDB, cookies, sessionStorage | localStorage is the only option — SSR-safe (window-guarded), survives refresh, shared across tabs (same-origin localhost), bounded to 5-10MB (draft fits in ~10KB). sessionStorage would lose data on tab close. IndexedDB is overkill for ~10KB. |

**Installation:**
```bash
# in dashboard/
pnpm add zod@4.3.6 cronstrue@3.14.0 yaml@2.8.3 gray-matter@4.0.3
```

**Version verification:** All four versions verified via `npm view <pkg> version` on 2026-04-19. If the planner wants to pin stricter, use `zod@^4.3.6` (strict major, patch-flexible); others can use `^` ranges.

**What must NOT be installed:** Monaco Editor, CodeMirror, react-hook-form, react-js-cron, react-datepicker, redux, zustand, swr, tanstack-query. UI-SPEC and Phase 1 stack lock this down.

---

## Architecture Patterns

### System Architecture Diagram (Phase 3 data flow)

```
                    ┌─────────────────────────────────────────────┐
                    │  Browser (localhost:4001/editor)             │
                    │  ┌──────────────────────────────────────┐   │
User keystroke ────►│  │  EditorClient (useActionState)       │   │
                    │  │   • useDraftAutosave (500ms debounce)│   │
                    │  │   • useSecretScan (250ms debounce)   │   │
                    │  │   • useSlugCollision (400ms debounce)│   │
                    │  │   • useCronstrue (sync)              │   │
                    │  └──────────┬────────────┬──────────────┘   │
                    │             │            │                  │
                    └─────────────┼────────────┼──────────────────┘
                                  │            │
              localStorage        │            │   Server Action RPC
              (sleepwalker        │            │   (form POST,
               .draft.v1)         │            │    auto CSRF)
                                  ▼            │
                            (persists)         │
                                               ▼
                    ┌─────────────────────────────────────────────┐
                    │  Next.js Server (Node.js)                    │
                    │  ┌──────────────────────────────────────┐   │
                    │  │  /editor/actions.ts                  │   │
                    │  │   1. zod parse(formData)             │   │
                    │  │   2. assertValidSlug + collision     │   │
                    │  │   3. scanForSecrets(prompt)          │   │
                    │  │   4. atomicWriteBundle()             │   │
                    │  │       ↓                              │   │
                    │  │       mkdtempSync(routines-X/)       │   │
                    │  │       writeFileSync(prompt.md)       │   │
                    │  │       writeFileSync(config.json)     │   │
                    │  │       renameSync(tmp → final)        │   │
                    │  │   5. return {ok, path} / {ok:false,  │   │
                    │  │              fieldErrors}            │   │
                    │  └─────────────────┬────────────────────┘   │
                    │                    │                         │
                    │                    ▼                         │
                    │  ┌──────────────────────────────────────┐   │
                    │  │  dashboard/lib/bundles.ts            │   │
                    │  │   • listBundles() — Phase 4 consumer │   │
                    │  │   • readBundle(runtime, slug)        │   │
                    │  │   • hasBundle(runtime, slug) — used  │   │
                    │  │     by checkSlugAvailability Action  │   │
                    │  └─────────────────┬────────────────────┘   │
                    └────────────────────┼─────────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────┐
                            │  Filesystem              │
                            │  routines-local/<slug>/  │
                            │  routines-cloud/<slug>/  │
                            │  routines-codex/<slug>/  │
                            │  routines-gemini/<slug>/ │
                            └──────────────────────────┘
```

### Recommended Project Structure (net-new files for Phase 3)

```
dashboard/
├── app/
│   └── editor/                          # NEW — Phase 3 route
│       ├── page.tsx                     # Server Component: calls healthCheckAll(), renders PageHeader + EditorClient
│       ├── editor-client.tsx            # "use client": the form state machine
│       ├── actions.ts                   # "use server": saveRoutine + checkSlugAvailability
│       └── _components/
│           ├── runtime-radio-grid.tsx   # 2×2 radio cards with health pill
│           ├── cron-preview.tsx         # cronstrue output + sleep-window warning
│           ├── secret-scan-panel.tsx    # Red panel below textarea
│           ├── draft-recovery-banner.tsx# Banner with Restore / Start fresh
│           └── preview-panel.tsx        # Sticky right column (bundle/plist/marker paths)
├── lib/
│   ├── bundles.ts                       # NEW — Phase 3 owns; Phase 4 consumes listBundles()
│   ├── bundle-schema.ts                 # NEW — zod schema for RoutineBundle write-side
│   ├── secret-patterns.ts               # NEW — shared client + server regex list
│   ├── secret-scan.ts                   # NEW — scanForSecrets(prompt) → matches[]
│   └── atomic-write.ts                  # NEW — atomicWriteBundle(bundleDir, files)
└── tests/
    ├── bundles.test.ts                  # NEW — listBundles / readBundle / hasBundle
    ├── bundle-schema.test.ts            # NEW — zod accept/reject matrix
    ├── secret-scan.test.ts              # NEW — pattern match matrix
    ├── atomic-write.test.ts             # NEW — tmp-swap semantics + failure paths
    ├── save-routine-action.test.ts      # NEW — end-to-end Server Action (mocks handled below)
    └── editor-client.test.tsx           # NEW — form component tests (jsdom env)
```

### Pattern 1: Server Action with React 19 `useActionState`

**What:** Next.js 15 App Router supports Server Actions via the `"use server"` directive at the top of a module. React 19 provides `useActionState(action, initialState)` which returns `[state, formAction, isPending]` for clean error-surfacing without client fetch boilerplate.

**When to use:** Every form submission in Phase 3 editor. There is no API route involved.

**Example:**
```typescript
// dashboard/app/editor/actions.ts
// Source: https://nextjs.org/docs/app/api-reference/functions/server-actions (verified 2026-04-19)
"use server";

import { z } from "zod";
import { RoutineBundleInput } from "@/lib/bundle-schema";
import { scanForSecrets } from "@/lib/secret-scan";
import { atomicWriteBundle } from "@/lib/atomic-write";
import { hasBundle } from "@/lib/bundles";
import { toBundleDir } from "@/lib/runtime-adapters/slug";

export type SaveRoutineState =
  | { status: "idle" }
  | { status: "ok"; bundlePath: string; runtime: string; slug: string }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError?: string };

export async function saveRoutine(
  prevState: SaveRoutineState,
  formData: FormData,
): Promise<SaveRoutineState> {
  // 1. zod parse
  const raw = Object.fromEntries(formData.entries());
  const parsed = RoutineBundleInput.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const input = parsed.data;

  // 2. slug namespace + collision check (authoritative)
  if (await hasBundle(input.runtime, input.slug)) {
    return {
      status: "error",
      fieldErrors: { slug: [`A routine at routines-${input.runtime}/${input.slug}/ already exists.`] },
    };
  }

  // 3. secret-scan (authoritative — client scan is preview only)
  const secrets = scanForSecrets(input.prompt);
  if (secrets.length > 0) {
    return {
      status: "error",
      fieldErrors: {
        prompt: [
          `Prompt appears to contain a secret (${secrets[0].patternName} at line ${secrets[0].line}, column ${secrets[0].column}). ` +
          `Replace with $\{VAR\} and document the env var in AUTHORING.md. Save blocked.`,
        ],
      },
    };
  }

  // 4. atomic write
  const bundleDir = toBundleDir(input.runtime, input.slug);
  await atomicWriteBundle(bundleDir, buildFiles(input));

  return { status: "ok", bundlePath: bundleDir, runtime: input.runtime, slug: input.slug };
}
```

```typescript
// dashboard/app/editor/editor-client.tsx
// Source: https://react.dev/reference/react/useActionState (verified 2026-04-19)
"use client";

import { useActionState } from "react";
import { saveRoutine, type SaveRoutineState } from "./actions";

const INITIAL: SaveRoutineState = { status: "idle" };

export function EditorClient({ healthStatuses }: { healthStatuses: HealthStatus[] }) {
  const [state, formAction, isPending] = useActionState(saveRoutine, INITIAL);
  // ... render form with {state.status === "error" && state.fieldErrors.slug?.[0]} etc.
  // Submit via <form action={formAction}>
}
```

**Key properties of this pattern:**
- Server Action receives `(prevState, formData)` signature per React 19 contract.
- `useActionState` keeps error state across submissions, replays on error, clears on success.
- No explicit `fetch` call on client — React runtime serializes the formData and dispatches.
- Built-in CSRF protection in Next.js 15 via origin headers.
- `isPending` drives the "Saving…" button state.

### Pattern 2: Discriminated-Union-Style State (no react-hook-form needed)

**What:** Return state is a discriminated union on `status`. Client pattern-matches with narrowing. No `react-hook-form` dependency needed.

**Why:** The form is simple (7 fields) and the expensive bits (debounced client validation, secret scan, slug collision) all live in custom hooks. react-hook-form's schema integration adds a dependency + complexity layer; for a single form of this size, `useActionState` + `defaultValue` on each field is cleaner.

### Pattern 3: Atomic Bundle Write via Directory-Swap

**What:** The write side needs BOTH `config.json` AND `prompt.md` to appear atomically — a reader at `routines-codex/morning-brief/` should never see only one file.

**Options evaluated:**

| Option | Atomic as pair? | Crash safety | Verdict |
|--------|-----------------|--------------|---------|
| A. `writeFileSync(config.json)` then `writeFileSync(prompt.md)` | ✗ | Partial bundle visible between writes | Rejected |
| B. `writeFileSync(config.json.tmp)` + `writeFileSync(prompt.md.tmp)` + two renames | ✗ | config renamed first → partial visible window | Rejected |
| C. `mkdtempSync` in a sibling `.tmp-*` directory → write both files there → `renameSync` the directory to the final name | **✓** | Either the old bundle or the new complete bundle is visible; never partial | **Chosen** |
| D. Single JSON with embedded prompt string, then split at read time | ✓ but changes bundle format | Breaks v0.1 convention (each routine is a directory with config.json + prompt.md) | Rejected |

**Option C is the only atomic-as-a-pair strategy that preserves the v0.1 `{config.json, prompt.md}` bundle format.** POSIX `rename(2)` is atomic for directories on the same filesystem — macOS APFS is same-fs by default for anything under `$REPO`.

**Pseudocode:**
```typescript
// dashboard/lib/atomic-write.ts
import fs from "node:fs";
import path from "node:path";

export async function atomicWriteBundle(
  finalDir: string,
  files: Record<string, string>, // { "config.json": "{...}", "prompt.md": "..." }
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const parent = path.dirname(finalDir);
  const base = path.basename(finalDir);
  fs.mkdirSync(parent, { recursive: true });

  // Create sibling temp dir to guarantee same-filesystem rename
  const tmpDir = fs.mkdtempSync(path.join(parent, `.${base}.tmp-`));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content);
    }
    // Rejects if finalDir already exists (EEXIST on Linux; EPERM on macOS).
    // Pre-flight hasBundle check in saveRoutine prevents this, but the rename
    // itself is the authoritative collision gate.
    fs.renameSync(tmpDir, finalDir);
    return { ok: true, path: finalDir };
  } catch (e) {
    // Clean up the temp dir on any failure
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

**Why sibling temp (not `os.tmpdir()`):** `fs.renameSync` across filesystems throws `EXDEV`. Putting the temp dir next to the destination guarantees same-fs (APFS volume) rename.

**Note on macOS `rename` over existing dir:** macOS's `rename(2)` does NOT silently replace an existing non-empty directory — it fails with `ENOTEMPTY` or `EEXIST`. This is the behavior we want: the pre-flight `hasBundle()` check in `saveRoutine` is soft; the final `renameSync` is the hard gate. If two editor tabs race to save the same slug, the second one's `renameSync` will fail and return a clean error.

### Pattern 4: Custom `useDraftAutosave` Hook (500ms debounce, beforeunload, Link intercept)

**What:** A client-side hook that mirrors form state to `localStorage.sleepwalker.draft.v1` with a 500ms debounce, registers `beforeunload` when dirty, and exposes a ref-held dirty flag that the wrapped `<Link>` checks before navigation.

**Why not use a library (e.g., `use-debounce`, `react-use`):** Adds dependency; the core of the hook is ~40 lines; we already have zero-client-state-library philosophy in v0.1.

**Implementation sketch:**
```typescript
// dashboard/app/editor/_hooks/use-draft-autosave.ts (or inline in editor-client.tsx)
"use client";

import { useEffect, useRef } from "react";

const KEY = "sleepwalker.draft.v1";
const DEBOUNCE_MS = 500;

export function useDraftAutosave(state: DraftState, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        sessionNonce: getSessionNonce(),
        updatedAt: new Date().toISOString(),
        fields: state,
      }));
    }, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [state, enabled]);

  // beforeunload — only while dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return {
    markClean: () => {
      dirty.current = false;
      localStorage.removeItem(KEY);
    },
    isDirty: () => dirty.current,
  };
}
```

**In-app nav intercept:** Next.js App Router's `<Link>` uses client-side navigation. To intercept sidebar clicks on `/editor`, the editor page wraps sidebar links in a tiny `<DirtyLink>` component that calls `useRouter().push()` after a confirmation dialog if `isDirty()` is true. Alternatively, the editor registers a `popstate` listener for browser-back. **Research-verified:** Next.js 15 does not emit `router.events` (that was Pages Router); for App Router the standard pattern is wrapping `<Link>` onClick or using the new `onNavigate` prop (Next.js 15.1+). Recommend the `<Link>` onClick wrapper because it's well-documented and doesn't depend on an API that may still be unstable.

### Pattern 5: Bundle-on-Disk Shape (what Phase 3 writes)

Phase 2 CONTEXT.md says `bundles.ts` uses **directory enumeration** (not builder lookups) for v0.1 backward compat. That implies every bundle directory has predictable contents:

| File | Present for | Phase 3 writes |
|------|-------------|----------------|
| `config.json` | v0.2 (codex, gemini) — required. claude-routines and claude-desktop: optional (for storing our metadata like reversibility/budget that don't fit the vendor's contract) | YES for all 4 runtimes |
| `prompt.md` | v0.2 (codex, gemini) — required. v0.1 claude-routines (`routines-cloud/<slug>/prompt.md`) also uses this | YES for codex, gemini, claude-routines |
| `SKILL.md` | v0.1 claude-desktop (`routines-local/sleepwalker-<slug>/SKILL.md`). Claude Desktop's on-disk contract | YES for claude-desktop only — YAML frontmatter + body via `yaml@2.8.3` |
| `setup.md` | v0.1 claude-routines (existing) | NO — Phase 3 does not write this; v0.1 files preserve it |

**Recommended config.json shape (v0.2 new routines):**
```json
{
  "name": "Morning Brief",
  "runtime": "codex",
  "slug": "morning-brief",
  "schedule": "0 6 * * 1-5",
  "reversibility": "yellow",
  "budget": 40000,
  "version": 1,
  "createdAt": "2026-04-19T12:34:56.789Z"
}
```

The `runtime` field is the discriminant duplicated from the directory name — belt-and-suspenders per research/ARCHITECTURE.md Layer 3. The `version: 1` lets future Phase 6 migrations detect the schema.

**For claude-desktop, SKILL.md shape (matches v0.1 convention):**
```markdown
---
name: Morning Brief
description: Daily 6am summary of new Downloads files
---
[sleepwalker:claude-desktop/morning-brief]

You are running as a Sleepwalker fleet member.

# Prompt body here
```

The reversibility + budget + schedule for claude-desktop still get written to `config.json` alongside SKILL.md — Sleepwalker needs them for the supervisor gates and the dashboard display, even though Desktop itself only reads SKILL.md.

### Anti-Patterns to Avoid

- **Monaco or CodeMirror editor:** locked out by research/ARCHITECTURE.md Anti-Pattern 6 + UI-SPEC. Prompts are plain text; 2MB JS cost; breaks no-JS progressive enhancement; users paste from external editors anyway.
- **react-hook-form / formik / redux-form:** form state machine is a 7-field form. `useActionState` + `defaultValue` on each input is the whole pattern. Adding a form library hides the simplicity.
- **Silent draft restore:** UI-SPEC explicitly rejects silent restore. Draft-recovery banner is mandatory because the user may have expected a clean slate (e.g., opened a fresh tab mid-flow on another machine's sync).
- **Toasting the secret-scan error:** UI-SPEC locks inline red panel. Toasts disappear; secret-detection errors must persist until the user fixes the prompt. Also — a toast makes "block Save" less visually tied to the matched region.
- **API route (`/api/editor/save`) instead of Server Action:** Adds a route.ts file, JSON (de)serialization, hand-rolled CSRF, hand-rolled redirect. Server Action is strictly simpler.
- **Per-file `fs.rename`:** See Pattern 3. Not atomic as a pair; partial-bundle state window; rejected.
- **Wrapping prompt text in argv for Server Action:** Not actually a risk here because Server Actions serialize form data through an opaque channel, but cited for completeness — per Phase 2 supervisor rule, prompts NEVER touch argv. The Server Action receives `FormData`, parses via zod, writes via `fs.writeFileSync`. No shell.
- **Using `fs.writeFile` (async) inside the Server Action when sync is clearer:** Either works. Sync variants match v0.1's existing `dashboard/lib/queue.ts` / `settings.ts` style (sync fs calls on lightweight localhost server). Recommend sync for Phase 3 consistency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | Hand-rolled `if (typeof x !== "string") return "error"` chains | `zod@4.3.6` | Zod's `safeParse` returns structured `fieldErrors` that `useActionState` surfaces; type inference via `z.infer<typeof schema>` keeps the input type in sync; way better error messages. |
| Cron human-readable | Hand-rolled English builder | `cronstrue@3.14.0` | Handles all 5-field cron edge cases (ranges, steps, lists); locale-aware; throws on invalid so catch = inline error. |
| YAML frontmatter parsing | Hand-rolled line splitter on `---` | `gray-matter@4.0.3` | Handles quoting, escaped colons, multi-line values; already the Node default. |
| YAML frontmatter writing | Template literal with `\n`-joined key:value | `yaml@2.8.3` | Correctly escapes values containing `:` or quotes; round-trip-safe. |
| Atomic multi-file write | Two `rename` calls | Directory-swap (this research's Pattern 3) | POSIX `rename(2)` is atomic for files AND directories on same-fs; two renames are not atomic as a pair; directory-swap is the only correct approach. |
| 500ms debounce | Hand-rolled `setTimeout` in every effect | Custom `useDraftAutosave` hook (this research's Pattern 4) | One hook, one place; ~40 lines; keeps pattern consistent across the three debounce layers (autosave 500ms, secret-scan 250ms, collision-check 400ms). |
| Secret-pattern regex | Every team rolls their own | Shared `lib/secret-patterns.ts` module | Hand-rolled regex is where bugs live. Using a shared constant module guarantees client-preview matches server-authoritative behavior byte-for-byte. |

**Key insight:** Every "hand-roll this for readability" impulse in Phase 3 actually introduces bugs. The dependencies here are small (zod: 0 deps; cronstrue: 0 deps; yaml: 0 deps; gray-matter: 4 deps) and battle-tested. Research/STACK.md already cleared these four — this research affirms and updates to current versions.

---

## Secret-Pattern Source (authoritative for Phase 3)

**Source:** [gitleaks default ruleset](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) — the OSS industry standard for credential detection. **Not** a runtime dependency (gitleaks is Go, not Node). Port the specific patterns to JavaScript regex.

**Minimum pattern set for Phase 3 (matches UI-SPEC §Secret scan):**

```typescript
// dashboard/lib/secret-patterns.ts
// Source: gitleaks defaults (github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)
// Verified 2026-04-19 against current gitleaks.toml.

export interface SecretPattern {
  name: string;
  regex: RegExp;
  description: string;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "Stripe live key",    regex: /sk_live_[0-9a-zA-Z]{24,}/,              description: "Stripe secret key (live)" },
  { name: "Stripe test key",    regex: /sk_test_[0-9a-zA-Z]{24,}/,              description: "Stripe secret key (test)" },
  { name: "GitHub PAT",         regex: /ghp_[0-9a-zA-Z]{36,}/,                  description: "GitHub personal access token" },
  { name: "GitHub OAuth",       regex: /gho_[0-9a-zA-Z]{36,}/,                  description: "GitHub OAuth token" },
  { name: "GitHub App",         regex: /(ghu|ghs)_[0-9a-zA-Z]{36,}/,            description: "GitHub app user/server token" },
  { name: "AWS access key",     regex: /AKIA[0-9A-Z]{16}/,                      description: "AWS IAM access key" },
  { name: "Slack bot token",    regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/,          description: "Slack bot/user/app token" },
  { name: "Google API key",     regex: /AIza[0-9A-Za-z\-_]{35}/,                description: "Google Cloud API key" },
  { name: "Anthropic API key",  regex: /sk-ant-(?:api|oat)[0-9]{2}-[0-9a-zA-Z_-]{32,}/, description: "Anthropic API key" },
  { name: "OpenAI API key",     regex: /sk-(?:proj-)?[0-9a-zA-Z\-_]{20,}/,      description: "OpenAI API key" },
  { name: "PEM private key",    regex: /-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/, description: "Private key header" },
  { name: "High-entropy hex",   regex: /\b[0-9a-fA-F]{40,}\b/,                  description: "Generic ≥40-char hex (catches most secrets that don't match a prefix)" },
];

export interface SecretMatch {
  patternName: string;
  patternDescription: string;
  line: number;       // 1-indexed
  column: number;     // 1-indexed
  matchedSubstring: string;
}

export function findAllMatches(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = text.split("\n");
  for (const pattern of SECRET_PATTERNS) {
    const global = new RegExp(pattern.regex.source, pattern.regex.flags.includes("g") ? pattern.regex.flags : pattern.regex.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = global.exec(text)) !== null) {
      const before = text.slice(0, m.index);
      const line = (before.match(/\n/g)?.length ?? 0) + 1;
      const lastNl = before.lastIndexOf("\n");
      const column = m.index - (lastNl === -1 ? 0 : lastNl + 1) + 1;
      matches.push({
        patternName: pattern.name,
        patternDescription: pattern.description,
        line,
        column,
        matchedSubstring: m[0],
      });
    }
  }
  return matches.sort((a, b) => a.line - b.line || a.column - b.column);
}
```

**Rules:**
1. The **exact same `SECRET_PATTERNS` array** is imported by both the client secret-scan hook (preview) and the server `saveRoutine` Server Action (authoritative). Drift between client and server is a bug.
2. Order: specific prefixes (Stripe, GitHub, AWS, etc.) BEFORE the generic high-entropy hex, because the specific patterns provide better error messages.
3. The generic hex pattern is the catch-all. It has false-positive risk (SHA1 of a commit, a UUID rendered without dashes). UI-SPEC already addresses this: the error copy says "replace with $\{VAR\} and document" — user can override by removing the false-positive substring or by understanding why it tripped. **No bypass button in Phase 3.** A bypass toggle belongs to Phase 6 polish if it surfaces from user testing.
4. `${VAR}` and `{{ env.VAR }}` and `<YOUR_KEY>` placeholders are NOT matched by any pattern — only concrete secrets trip the scan.

**Non-goal:** We are NOT shipping entropy-based detection in Phase 3 (Shannon entropy score > 4.5, etc.). The regex list is the full scope. Entropy scoring is deferred to v0.3 if false negatives surface.

---

## `bundles.ts` Design (consumed by Phase 3 + 4 + 5)

Phase 2 CONTEXT.md declared `bundles.ts` is Phase 3 territory. This is the single API for "enumerate / read / check existence" on disk-bundles across all four runtimes.

**Public API:**

```typescript
// dashboard/lib/bundles.ts
import type { RoutineBundle, Runtime } from "./runtime-adapters/types";
import { RUNTIMES } from "./runtime-adapters/slug";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Enumerate every bundle on disk across routines-local/, routines-cloud/,
 * routines-codex/, routines-gemini/. Preserves v0.1 directory names verbatim.
 * Does NOT call validateSlug on enumerated entries (v0.1 uses sleepwalker-*
 * and _test-zen prefixes which validateSlug would reject — see Phase 2 CONTEXT).
 */
export function listBundles(): RoutineBundle[];

/**
 * Read a single bundle by (runtime, slug). Returns null if directory missing
 * or config.json / SKILL.md unparseable. Does NOT throw.
 */
export function readBundle(runtime: Runtime, slug: string): RoutineBundle | null;

/**
 * Cheap existence check — used by checkSlugAvailability Server Action
 * and by saveRoutine's pre-flight collision gate. Returns true if the
 * bundle directory exists anywhere under routines-<runtime>/.
 */
export function hasBundle(runtime: Runtime, slug: string): boolean;

/**
 * True if ANY routines-*/<slug>/ exists (cross-runtime collision check).
 * Used by the editor's slug field when the user has not yet picked a runtime
 * OR when enforcing "slugs must be unique across runtimes" per ADPT-02.
 */
export function hasBundleAnyRuntime(slug: string): { exists: boolean; runtime: Runtime | null };
```

**Implementation notes:**

1. **Directory convention:** `claude-desktop` → `routines-local/<slug>/`; `claude-routines` → `routines-cloud/<slug>/`; `codex` → `routines-codex/<slug>/`; `gemini` → `routines-gemini/<slug>/`. Matches the frozen `toBundleDir` output but `bundles.ts` does NOT call `toBundleDir` (per Phase 2 CONTEXT v0.1-prefix rule).

2. **Parse priority:** For each runtime:
   - Try `config.json` for v0.2 fields (name, schedule, reversibility, budget). Fallback to hardcoded `STARTER_DEFAULTS` from `dashboard/lib/routines.ts` if absent (v0.1 routines don't have config.json).
   - For `claude-desktop`: parse `SKILL.md` frontmatter via gray-matter for name + description; prompt body is the rest.
   - For `claude-routines`: parse `prompt.md` for marker tag + body; fall back to `config.json` for name.
   - For `codex` / `gemini`: read `prompt.md` body + `config.json` fully.

3. **Does `bundles.ts` REPLACE or EXTEND `dashboard/lib/routines.ts`?** **Extend.** `routines.ts` stays as-is for v0.1 backward compat (it reads only `routines-local/` + `~/.claude/scheduled-tasks/`). `bundles.ts` is the v0.2 unified reader. Phase 6 backward-compat test (COMP-01) verifies both work. Phase 4's `/routines` page is rewritten on top of `bundles.ts`, and `routines.ts` can be kept as a thin compatibility shim until Phase 6 proves everything has migrated. **Do not delete `routines.ts` in Phase 3** — it is imported by the `/routines` page today.

4. **No filesystem locks.** `listBundles` is read-only; race with a concurrent `saveRoutine` is benign (directory-swap atomic means either the new bundle appears in the next read or it doesn't).

5. **`hasBundle` is the authoritative collision check used by both the debounced `checkSlugAvailability` Server Action AND the `saveRoutine` pre-flight gate.** The atomic `renameSync` in `atomic-write.ts` is the ultimate backstop (TOCTOU-safe).

---

## Server Action Pattern (actions.ts — full shape)

Consumed by `editor-client.tsx`. Declared in `dashboard/app/editor/actions.ts` with `"use server"` directive at file top.

**Exports:**

```typescript
// dashboard/app/editor/actions.ts
"use server";

// ========== saveRoutine ==========
export type SaveRoutineState =
  | { status: "idle" }
  | { status: "ok"; bundlePath: string; runtime: Runtime; slug: string }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError?: string };

export async function saveRoutine(
  prevState: SaveRoutineState,
  formData: FormData,
): Promise<SaveRoutineState>;

// ========== checkSlugAvailability ==========
// Called by editor-client on debounced keystroke (400ms). Returns:
export type SlugAvailability =
  | { available: true }
  | { available: false; existsIn: Runtime; message: string };

export async function checkSlugAvailability(
  runtime: Runtime,
  slug: string,
): Promise<SlugAvailability>;
```

**Error return shape rationale:**
- `fieldErrors` is a `Record<string, string[]>` to match zod's `flatten().fieldErrors` output (zod flattens by field; each field can have multiple error messages).
- `formError` is for cross-field errors (e.g., "disk write failed") that don't bind to a single field.
- UI-SPEC copy is deterministic — the error messages are pre-committed strings. Server Action MUST use those exact strings (not zod's default messages). Configure zod's `.refine` / `.min` / `.regex` with explicit `{ message: "..." }` overrides for every field.

**React 19 hook wiring on client:**

```tsx
// dashboard/app/editor/editor-client.tsx
"use client";
import { useActionState, useTransition } from "react";
import { saveRoutine, checkSlugAvailability } from "./actions";

export function EditorClient(props) {
  const [saveState, saveAction, isSaving] = useActionState(saveRoutine, { status: "idle" });

  // Slug collision: not a form submission, so use useTransition instead of useActionState
  const [isChecking, startTransition] = useTransition();
  const [availability, setAvailability] = useState<SlugAvailability | null>(null);

  function debouncedCheck(runtime: Runtime, slug: string) {
    // 400ms debounced call into startTransition(() => checkSlugAvailability(...))
    // then setAvailability(result)
  }

  return (
    <form action={saveAction}>
      {/* Render errors from saveState.fieldErrors */}
    </form>
  );
}
```

**Key point:** `saveAction` is the form's `action` prop directly. React 19 handles the serialization. No `event.preventDefault()`, no `fetch`, no JSON headers.

---

## Slug Collision Detection (EDIT-04 — full treatment)

**Cross-runtime requirement:** A `(codex, morning-brief)` bundle and a `(gemini, morning-brief)` bundle MUST be rejected as a collision — per ADPT-02 "slugs must be unique across runtimes" convention enforced by the `<runtime>/<slug>` fleet-key namespace.

**Three enforcement layers:**

1. **Client preview (debounced 400ms):** `checkSlugAvailability(runtime, slug)` Server Action called from editor-client as user types. Returns `{available: true}` or `{available: false, existsIn: runtime, message}`. Rendered inline below the slug field. Does NOT block typing — user can keep editing.

2. **Server authoritative (on save):** `saveRoutine` calls `hasBundle(runtime, slug)` before atomic write. Returns `fieldErrors.slug` if occupied. UI renders under slug field.

3. **Filesystem backstop (atomic write):** `fs.renameSync(tmpDir, finalDir)` throws if `finalDir` exists. This is the race-free backstop if two tabs race on save. Server Action catches and returns a clean `fieldErrors.slug` error.

**Implementation detail:** `hasBundle(runtime, slug)` uses `fs.existsSync(toBundleDir(runtime, slug))`. `hasBundleAnyRuntime(slug)` iterates all 4 runtimes. For the Phase 3 editor, ALWAYS call with (runtime, slug) — the cross-runtime variant is used when the user has not picked a runtime yet (helper message "a codex routine with this slug exists"). Both are fast O(4) `fs.existsSync` calls on localhost.

**Cost analysis:** Even with 50 routines per runtime, `fs.existsSync` is a stat() call (~10μs). The 400ms debounce already amortizes; no caching needed. If it ever shows up, `bundles.ts` can add an in-memory cache keyed by directory mtime — but not in Phase 3.

**Copy contract (from UI-SPEC):**
- Available: `Available — will write to routines-{runtime}/{slug}/` (signal-green)
- Occupied same runtime: `A routine at routines-{runtime}/{slug}/ already exists. Choose a different slug.` (signal-red)
- Occupied other runtime: `A {other_runtime} routine with slug {slug} exists. Slugs must be unique across runtimes.` (signal-red)

---

## Build-Order Dependency on Phase 2

Phase 3 CANNOT start until the following Phase 2 plans ship:

| Phase 2 Plan | Shipped Artifact Phase 3 Consumes |
|--------------|-----------------------------------|
| **02-01** (slug.ts assertValidSlug guard) | `toBundleDir` / `toLaunchdLabel` / `toMarkerTag` / `toPlistPath` now throw on invalid slugs — Phase 3 editor's zod layer + collision check feed these with already-validated slugs; the throw is a programmer-bug backstop. |
| 02-02 (launchd-writer.ts) | Not directly consumed by Phase 3 (Phase 4 uses it) |
| 02-03 / 02-04 (supervisor + harness) | Not directly consumed by Phase 3 |
| 02-05 (claude-routines.ts) | `healthCheck()` return shape consumed by `/editor`'s runtime radio grid |
| 02-06 (claude-desktop.ts) | Same |
| 02-07 (codex.ts) | Same |
| 02-08 (gemini.ts) | Same |
| **02-09** (registry swap + `HealthStatus.warning` amendment + adapter-registry.test.ts) | **`getAdapter(runtime)` returns a real adapter**, `healthCheckAll()` returns four real statuses; the amendment adds `HealthStatus.warning?: string` which the editor's amber-card warning pill consumes. |
| 02-10 (exit gate + smoke tests) | Phase 3 does not start until Phase 2 exits cleanly. |

**Hard gate:** Phase 3 Plan 03-01 (Wave 0 / dependencies + schema) cannot land until Plan 02-09 is merged and tests pass. Plan 02-10 is the formal phase-2-complete commit; Plan 03-01 can start after 02-10.

**What Phase 3 imports from Phase 2:**

```typescript
// Phase 3 files will import:
import { getAdapter, healthCheckAll, ADAPTERS } from "@/lib/runtime-adapters";
import type { RuntimeAdapter, HealthStatus, RoutineBundle, Runtime, Reversibility } from "@/lib/runtime-adapters/types";
import {
  validateSlug, toBundleDir, toLaunchdLabel, toMarkerTag,
  RUNTIMES, isRuntime,
} from "@/lib/runtime-adapters/slug";
```

**What Phase 3 does NOT touch in Phase 2:**
- `launchd-writer.ts` (only Phase 4 Deploy uses it)
- `bin/sleepwalker-run-cli` (only launchd fires it; dashboard never spawns it)
- Individual adapter deploy/undeploy/runNow methods (Phase 4 Deploy button wires those)

---

## Testing Strategy

### Vitest blocks to author (Wave-mapped)

All new tests live in `dashboard/tests/`. Follow v0.1 patterns (flat directory, `<module>.test.ts`, `makeTempHome` for file-touching, `vi.mock` for fs/execFile where appropriate).

**Wave 0 tests (~40 assertions):**

| File | Tests | What it verifies |
|------|-------|------------------|
| `bundle-schema.test.ts` | ~12 `it()` blocks | zod accept matrix: valid input parses; each field's failure mode returns the exact UI-SPEC error message; reversibility enum rejects lowercase/extraneous; budget range 1000-200000; schedule either null or non-empty string; runtime one of four; name 1-60 chars; prompt 1-16000 chars. |
| `secret-scan.test.ts` | ~14 `it()` blocks | Each of 11 patterns matches a real example; line:column math correct on multi-line input; no-match returns empty array; `${VAR}` and `{{ env.X }}` placeholders DO NOT match; multiple matches in one prompt returned sorted by line. |
| `secret-patterns.test.ts` (optional; can merge into secret-scan) | ~2 | Sanity — each pattern's regex compiles; each pattern has a `name` and `description`. |

**Wave 1 tests (~35 assertions):**

| File | Tests | What it verifies |
|------|-------|------------------|
| `bundles.test.ts` | ~10 `it()` blocks | `listBundles()` finds v0.1 routines (temp `routines-local/sleepwalker-x/SKILL.md`, temp `routines-cloud/y/prompt.md`); finds v0.2 (temp `routines-codex/z/config.json+prompt.md`); `readBundle` returns null for missing; `hasBundle` matches disk; `hasBundleAnyRuntime` cross-runtime. Uses `makeTempHome` + a tmp cwd for repo-relative paths. |
| `atomic-write.test.ts` | ~8 `it()` blocks | Happy path: tmp dir created as sibling, both files written, rename swapped. Collision: `finalDir` exists → rename fails → tmp cleaned. Mid-write failure: one file write errors → tmp cleaned. Returns ok:true with path on success. |
| `save-routine-action.test.ts` | ~15 `it()` blocks | End-to-end: valid FormData → files on disk under temp repo; invalid slug → error state with exact UI-SPEC message; secret in prompt → error state + disk NEVER touched; collision → error state + no write; zod parse failure → structured fieldErrors. Uses `makeTempHome` + mocks `process.cwd()` to temp dir. |
| `slug-collision-action.test.ts` (can be part of save-routine-action) | ~4 | `checkSlugAvailability` returns `{available:true}` for free slug; returns `{available:false, existsIn}` same runtime; returns `{available:false, existsIn: "other"}` cross-runtime. |

**Wave 2 tests (~30 assertions, mostly component tests):**

Vitest's default environment is Node; client components require jsdom. Either:
- (a) Add `"test:client": "vitest run --environment jsdom"` + a separate `dashboard/tests/client/` dir with `// @vitest-environment jsdom` comments per-file, OR
- (b) Add `@testing-library/react@16.x` + switch the test directory for client tests.

**Recommend (a)** — lighter, no new library. Use Vitest's built-in environment directive.

| File | Tests | What it verifies |
|------|-------|------------------|
| `editor-client.test.tsx` | ~12 `it()` blocks | Initial render shows all 7 fields; typing in name updates slug until slug touched; cronstrue preview appears on valid cron; secret pasted in prompt shows red panel; all 9 autofill-opt-out attrs on every input (EDIT-05 coverage); save button disabled while `isPending`. |
| `runtime-radio-grid.test.tsx` | ~5 | Unavailable runtimes rendered with `disabled` + amber pill + reason helper; selected runtime has `ring-dawn-400`; selection changes aria-checked. |
| `cron-preview.test.tsx` | ~4 | Valid cron → aurora pill with cronstrue; invalid cron → red error; empty → no pill; sleep-window warning appears for outside-window fires. |
| `secret-scan-panel.test.tsx` | ~3 | Panel hidden when no matches; shows matched pattern name + line:col; click "View matched region" scrolls textarea. |
| `draft-recovery-banner.test.tsx` | ~4 | Banner absent when no draft in localStorage; present when draft exists; "Restore draft" populates form; "Start fresh" clears localStorage. |

**Wave 3 tests:**

| File | Tests | What it verifies |
|------|-------|------------------|
| Integration: extend `save-routine-action.test.ts` | ~5 | EDIT-01..05 mapped to integration scenarios — see Validation Architecture below. |

### Can Vitest import `"use server"` files directly?

**Yes.** Vitest runs in Node — `"use server"` is a Next.js build-time directive that is a no-op at Vitest runtime. The action function is just an async function. We can import it and call it with a `FormData` instance in tests. No Next.js test harness needed. Verified pattern: https://github.com/vercel/next.js/discussions/56530 (many projects use this exact approach).

### Mock strategy

- **Filesystem:** `makeTempHome()` + `process.chdir(tempRepoRoot)` for file-touching tests. No fs mocks — use real files in a temp dir.
- **`healthCheckAll()`:** Mocked in `editor-client.test.tsx` via prop injection (the Server Component does the real call; the client component receives `healthStatuses` as a prop, so tests just pass a fake array).
- **`window.localStorage`:** Vitest jsdom provides a real `localStorage`. Tests call `.clear()` in `beforeEach`.
- **`window.scrollTo` / `textarea.scrollTop`:** stubbed with `vi.fn()` — not what we're verifying, just needs to not throw.
- **No network I/O.** Phase 3 makes zero network calls. If the planner thinks it does, something is wrong.

### Total Vitest count target

- Wave 0: ~28 new it() blocks
- Wave 1: ~37 new it() blocks
- Wave 2: ~28 new it() blocks
- Wave 3: ~5 new it() blocks
- **Phase 3 total: ~98 new it() blocks**
- **Full suite after Phase 3: 56 (v0.1 + Phase 1) + Phase 2 additions + ~98 = Phase 3 completes with ~180-220 green tests depending on Phase 2's count**

### Bash harness

**None.** Phase 3 does not touch hooks, install.sh, or the supervisor script. No bash tests. This is pure TypeScript.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (existing) |
| Config file | `dashboard/vitest.config.ts` |
| Client-test environment | jsdom (add via `// @vitest-environment jsdom` per-file directive; `@testing-library/react@^16` — net-new dev dep, ~1MB install) |
| Quick run command | `cd dashboard && pnpm test` |
| Full suite command | `cd dashboard && pnpm run typecheck && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | `/editor` route renders form with 7 fields incl. runtime radio, cron preview, reversibility, budget | integration (client component) | `cd dashboard && pnpm test editor-client.test.tsx` | ❌ Wave 2 |
| EDIT-01 | Unavailable runtimes dimmed with fix-tooltip | integration | `cd dashboard && pnpm test runtime-radio-grid.test.tsx` | ❌ Wave 2 |
| EDIT-01 | Cron input shows cronstrue preview | integration | `cd dashboard && pnpm test cron-preview.test.tsx` | ❌ Wave 2 |
| EDIT-02 | `saveRoutine` zod-validates; invalid input returns structured fieldErrors | unit | `cd dashboard && pnpm test bundle-schema.test.ts` | ❌ Wave 0 |
| EDIT-02 | `saveRoutine` secret-scans; Stripe/GitHub/AWS/40-hex/OpenAI/Anthropic/Slack/Google/PEM all detected | unit | `cd dashboard && pnpm test secret-scan.test.ts` | ❌ Wave 0 |
| EDIT-02 | `saveRoutine` writes `config.json` + `prompt.md` atomically | unit | `cd dashboard && pnpm test atomic-write.test.ts` | ❌ Wave 1 |
| EDIT-02 | Secret in prompt → disk NEVER touched | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "secret blocks write"` | ❌ Wave 1 |
| EDIT-02 | Collision on save → `renameSync` throws cleanly → no partial | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "collision returns error"` | ❌ Wave 1 |
| EDIT-02 | Claude-desktop runtime writes SKILL.md (frontmatter + body) instead of config.json + prompt.md | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "claude-desktop writes SKILL.md"` | ❌ Wave 1 |
| EDIT-03 | Autosave hook debounces 500ms and writes `sleepwalker.draft.v1` | integration (jsdom) | `cd dashboard && pnpm test editor-client.test.tsx -t "autosave"` | ❌ Wave 2 |
| EDIT-03 | `beforeunload` prompts when dirty | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "beforeunload"` | ❌ Wave 2 |
| EDIT-03 | Successful save clears `sleepwalker.draft.v1` | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "save clears draft"` | ❌ Wave 2 |
| EDIT-03 | Draft-recovery banner shows when draft from prior session exists | integration | `cd dashboard && pnpm test draft-recovery-banner.test.tsx` | ❌ Wave 2 |
| EDIT-04 | Slug regex `^[a-z][a-z0-9-]{0,63}$` enforced via zod | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "slug regex"` | ❌ Wave 0 |
| EDIT-04 | `../../../evil` rejected (regex fail) | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "path traversal rejected"` | ❌ Wave 0 |
| EDIT-04 | `Has Spaces` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "spaces rejected"` | ❌ Wave 0 |
| EDIT-04 | `UPPERCASE` rejected | unit | `cd dashboard && pnpm test bundle-schema.test.ts -t "uppercase rejected"` | ❌ Wave 0 |
| EDIT-04 | `checkSlugAvailability` detects same-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "slug collision same runtime"` | ❌ Wave 1 |
| EDIT-04 | `checkSlugAvailability` detects cross-runtime collision | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "slug collision cross-runtime"` | ❌ Wave 1 |
| EDIT-04 | `bundles.ts::hasBundle` returns true for existing, false for missing | unit | `cd dashboard && pnpm test bundles.test.ts -t "hasBundle"` | ❌ Wave 1 |
| EDIT-04 | Cross-runtime: `routines-codex/morning-brief/` existing + user types `morning-brief` on gemini → rejected | integration | `cd dashboard && pnpm test save-routine-action.test.ts -t "cross-runtime collision"` | ❌ Wave 1 |
| EDIT-05 | Every input has all 9 autofill-opt-out attrs (`autocomplete`, `autocorrect`, `autocapitalize`, `spellcheck`, `data-1p-ignore`, `data-lpignore`, `data-form-type`, `data-bwignore`, plus textarea specifically has `rows={30}`) | integration | `cd dashboard && pnpm test editor-client.test.tsx -t "autofill opt-out attrs"` | ❌ Wave 2 |
| EDIT-05 | Prompt textarea `spellcheck="false"` confirmed | integration | included in above | ❌ Wave 2 |
| Phase exit | Full suite green after Phase 3 merge | smoke | `cd dashboard && pnpm run typecheck && pnpm test` | ✓ existing |
| Phase exit | v0.1 frozen surface untouched (PHASE2_BASE vs HEAD diff of 14 v0.1 paths = 0) | smoke | `git diff --stat PHASE2_BASE HEAD -- <14 paths>` | ✓ existing pattern |

**Total rows:** 25 requirement-to-test mappings covering EDIT-01 (3), EDIT-02 (6), EDIT-03 (4), EDIT-04 (7), EDIT-05 (2), plus 3 phase-exit smoke tests.

### Sampling Rate

- **Per task commit:** `cd dashboard && pnpm test` (runs all Vitest specs; <30s on the 56-test baseline, projected <60s after Phase 3 adds ~98 tests)
- **Per wave merge:** `cd dashboard && pnpm run typecheck && pnpm test`
- **Phase gate:** Full suite green + frozen-surface diff = 0 lines before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `dashboard/lib/bundle-schema.ts` — zod schema for `RoutineBundleInput` (the write-side shape; differs from `RoutineBundle` by omitting `bundlePath` which the server computes)
- [ ] `dashboard/lib/secret-patterns.ts` — shared client+server regex list (11 patterns per §Secret-Pattern Source)
- [ ] `dashboard/lib/secret-scan.ts` — `scanForSecrets(text): SecretMatch[]` using the shared patterns
- [ ] `dashboard/tests/bundle-schema.test.ts` — zod accept/reject matrix (~12 it blocks)
- [ ] `dashboard/tests/secret-scan.test.ts` — pattern match matrix (~14 it blocks)
- [ ] Net-new deps: `zod@4.3.6`, `cronstrue@3.14.0`, `yaml@2.8.3`, `gray-matter@4.0.3` (pnpm add)
- [ ] Net-new dev dep: `@testing-library/react@^16` + `jsdom` (if not already in vitest's default install) — needed for Wave 2 client component tests
- [ ] `dashboard/vitest.config.ts` may need `test.environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]` OR per-file `// @vitest-environment jsdom` directive — planner chooses

---

## Common Pitfalls

### Pitfall 1: zod v3 → v4 migration gotcha

**What goes wrong:** research/STACK.md names `zod@^3.25.x` but npm's latest is `4.3.6`. If Phase 2 has already installed 3.x, Phase 3 installing 4.x creates duplicate versions; if Phase 3 installs 3.x, we're shipping a library that's been superseded.

**Why it happens:** Research document from 2026-04-18 captured a versionthat was already stale within 24 hours.

**How to avoid:** Planner picks zod@4.3.6 (verified 2026-04-19). Phase 2 does not install zod (research/STACK.md lists it, but no Phase 2 plan actually installs it — verify via `cat dashboard/package.json` during Plan 02-01). If Phase 2 did install 3.x, Phase 3 Plan 01 upgrades to 4.x and the planner allocates effort to migrate Phase 2 call sites (breaking changes: `z.string().nonempty()` → `z.string().min(1)`, stricter union narrowing). Realistically: Phase 2 hasn't installed it yet, so green field.

**Warning signs:** `pnpm list zod` shows multiple versions → red flag.

### Pitfall 2: Server Action receiving `FormData` with all values as strings

**What goes wrong:** FormData serializes every value as a string — `budget` arrives as `"40000"`, not `40000`. zod naively set up as `z.number()` will reject.

**Why it happens:** Forgetting HTML form semantics.

**How to avoid:** Use zod's coerce variants (`z.coerce.number()`) or `.transform()` in the schema. Example:
```typescript
budget: z.coerce.number().int().min(1000).max(200000),
runtime: z.enum(["claude-routines", "claude-desktop", "codex", "gemini"]),
reversibility: z.enum(["green", "yellow", "red"]),
```

**Warning signs:** All integration tests pass in Node (unit tests with JS objects) but the form submission fails in browser with "Expected number, got string."

### Pitfall 3: localStorage unavailable during SSR

**What goes wrong:** The editor-client accesses `localStorage.getItem(KEY)` during render to determine if a draft exists. On SSR, `window` is undefined → ReferenceError → route crashes.

**Why it happens:** Mixing browser APIs with server rendering.

**How to avoid:** All localStorage access lives inside `useEffect(() => {...}, [])` (post-mount). Initial render shows "no draft" state; the banner only appears after mount if a draft exists. This also avoids hydration mismatch warnings.

**Warning signs:** Console warning `Hydration failed because the initial UI does not match...`

### Pitfall 4: Next.js App Router route-change event listening

**What goes wrong:** Phase 3 needs to intercept in-app navigation (sidebar click) when dirty. Developers reach for `router.events` (Pages Router) which doesn't exist in App Router.

**Why it happens:** App Router docs are still catching up.

**How to avoid:** Use one of:
- (a) Wrap sidebar `<Link>`s in a `<DirtyLink>` component that calls `useRouter().push()` after confirmation (simplest)
- (b) Next.js 15.1+ added `onNavigate` on `<Link>` — but it fires AFTER navigation starts; too late to prevent
- (c) `window.addEventListener("popstate")` catches browser back/forward only

**Recommend:** Option (a). Ship a `<DirtyLink>` wrapper in `dashboard/app/editor/_components/dirty-link.tsx`. The editor passes its `isDirty()` ref-checker into the sidebar. Or simpler: the sidebar is part of `layout.tsx` and the editor page does NOT re-render the sidebar — instead, the editor registers a `window` event listener the sidebar checks, or wraps each sidebar link in its own dirty-check. **Cleanest:** keep sidebar untouched; put the intercept on browser `beforeunload` (catches close/refresh/hash-change) + a one-off confirm dialog on explicit "cancel" button in the form. In-app sidebar nav mid-edit is rare; the beforeunload warning covers ~95% of real loss.

**Actual research recommendation:** Ship `beforeunload` (catches tab close, refresh, external link) + a visible dirty indicator in the draft-saved pill. Skip in-app intercept for Phase 3 — it's an edge case. The UI-SPEC does mention "in-app navigation intercept" but marks it as the same mechanism as beforeunload. Planner can decide to defer the full `<DirtyLink>` wrapper to Phase 6 polish if it complicates Wave 2 more than expected.

**Warning signs:** User clicks sidebar, navigates away, loses draft, opens issue.

### Pitfall 5: Client-side secret scan drifting from server scan

**What goes wrong:** Client says "no secrets" but server says "secret found" → user confused and blocked at save time despite green preview.

**Why it happens:** Two code paths, two regex lists, one gets updated.

**How to avoid:** Both client and server import `SECRET_PATTERNS` from the same `dashboard/lib/secret-patterns.ts` module. The Server Action and the client `useSecretScan` hook both call `findAllMatches(text)` from `secret-scan.ts`. No regex literal appears twice in the codebase.

**Warning signs:** Test `save-routine-action.test.ts` passes but `editor-client.test.tsx` fails (or vice versa) on the same input.

### Pitfall 6: fs.renameSync on macOS APFS with existing destination

**What goes wrong:** Atomic write assumption is "rename fails if destination exists" — but if the destination is an EMPTY directory, some POSIX implementations silently replace it. macOS APFS behavior has changed between Monterey/Ventura/Sonoma.

**Why it happens:** Spec says rename(2) MAY replace an empty target directory; implementations vary.

**How to avoid:** Always pre-flight `hasBundle()` check AND handle `EEXIST`/`ENOTEMPTY` in the atomic-write error path. Do not assume silent-replace is impossible — if it happens, the pre-flight check was the real gate.

**Warning signs:** Two-tab race produces mysterious data loss. Detectable via a test that pre-creates an empty final-dir then tries to save.

### Pitfall 7: `pnpm add` in dashboard/ not picking up for Vitest imports

**What goes wrong:** Plan 03-01 installs zod, but Vitest spec files still can't `import { z } from "zod"` — pnpm workspace resolution acts up.

**Why it happens:** pnpm's phantom-dep protection: a package must be listed in the IMPORTING package's package.json.

**How to avoid:** `pnpm add` runs from `dashboard/` directory (verify cwd). Packages land in `dashboard/package.json`. If Vitest still complains, `pnpm install` at repo root + `pnpm -w install` to re-link.

**Warning signs:** `Cannot find module 'zod'` in test output despite `pnpm list zod` showing a version.

---

## Code Examples

### Example 1: Full zod schema (bundle-schema.ts)

```typescript
// dashboard/lib/bundle-schema.ts
// Source: zod@4.3.6 docs (zod.dev) + UI-SPEC §Validation messages — each message string
// matches UI-SPEC exactly.

import { z } from "zod";

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

export const RoutineBundleInput = z.object({
  name: z.string()
    .min(1, "Name is required.")
    .max(60, "Name must be 60 characters or fewer."),
  slug: z.string()
    .min(1, "Slug is required.")
    .regex(SLUG_REGEX, "Slug must match ^[a-z][a-z0-9-]{0,63}$ — lowercase letters, digits, and hyphens, starting with a letter."),
  runtime: z.enum(["claude-routines", "claude-desktop", "codex", "gemini"], {
    message: "Pick a runtime.",
  }),
  prompt: z.string()
    .min(1, "Prompt is required.")
    .max(16_000, "Prompt exceeds 16,000 characters. Split into multiple routines or reduce scope."),
  schedule: z.string()
    .min(1, "Schedule is required.")
    .refine((s) => s.trim().split(/\s+/).length === 5, {
      message: "Invalid cron — 5 fields required (minute hour day month weekday).",
    }),
  reversibility: z.enum(["green", "yellow", "red"], {
    message: "Pick a reversibility level.",
  }),
  budget: z.coerce.number()
    .int()
    .min(1_000, "Budget must be at least 1,000 characters.")
    .max(200_000, "Budget above 200,000 characters — consider splitting into multiple routines."),
});

export type RoutineBundleInput = z.infer<typeof RoutineBundleInput>;
```

### Example 2: Full atomic-write helper

```typescript
// dashboard/lib/atomic-write.ts
import fs from "node:fs";
import path from "node:path";

export interface AtomicWriteResult {
  ok: boolean;
  path?: string;
  error?: string;
  errorCode?: "collision" | "io" | "permission";
}

export function atomicWriteBundle(
  finalDir: string,
  files: Record<string, string>,
): AtomicWriteResult {
  const parent = path.dirname(finalDir);
  const base = path.basename(finalDir);

  // Pre-flight: if finalDir exists, report collision without creating tmp
  if (fs.existsSync(finalDir)) {
    return { ok: false, error: `${finalDir} already exists`, errorCode: "collision" };
  }

  fs.mkdirSync(parent, { recursive: true });

  let tmpDir: string;
  try {
    tmpDir = fs.mkdtempSync(path.join(parent, `.${base}.tmp-`));
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      errorCode: "permission",
    };
  }

  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content, { encoding: "utf8" });
    }
    fs.renameSync(tmpDir, finalDir);
    return { ok: true, path: finalDir };
  } catch (e) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {/* best-effort */}
    const err = e as NodeJS.ErrnoException;
    const code = err.code === "EEXIST" || err.code === "ENOTEMPTY" ? "collision" : "io";
    return {
      ok: false,
      error: err.message,
      errorCode: code,
    };
  }
}
```

### Example 3: Full draft-autosave hook

```typescript
// dashboard/app/editor/_hooks/use-draft-autosave.ts
"use client";
import { useEffect, useRef } from "react";

const KEY = "sleepwalker.draft.v1";
const DEBOUNCE_MS = 500;

export interface DraftState {
  name: string;
  slug: string;
  runtime: string;
  prompt: string;
  schedule: string;
  reversibility: string;
  budget: number | string;
}

export function useDraftAutosave(state: DraftState, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    dirty.current = Object.values(state).some((v) => v !== "" && v !== 0);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          fields: state,
        }));
      } catch {/* localStorage disabled or full — silent fail, user hasn't lost data */}
    }, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [state, enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return {
    markClean: () => {
      dirty.current = false;
      if (typeof window !== "undefined") localStorage.removeItem(KEY);
    },
    getDraft: (): DraftState | null => {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed.version === 1 ? parsed.fields : null;
      } catch { return null; }
    },
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API routes (`/api/editor/save`) | Server Actions (`"use server"` in actions.ts) | Next.js 14.0 stable (2023-10) | Simpler: no JSON (de)serialization, built-in CSRF, form POST native — React 19's `useActionState` turns errors into state transparently |
| react-hook-form for complex forms | `useActionState` + `defaultValue` | React 19 (2024-12) | For ≤10-field forms, eliminates the need for a form library |
| zod 3.x schema | zod 4.x schema | 2025-11 zod 4 GA | Stricter unknown propagation; breaking `.nonempty()` removal; better inference |
| Node `fs.rename` per file | Directory-swap via `mkdtempSync` + single `rename` | POSIX semantics (stable) | Only way to get multi-file atomic-as-pair writes |
| Monaco for any text editing | Plain `<textarea>` for prompts | OSS readability / Anti-Pattern 6 | 2MB JS cost avoided; plain-text paste behavior natural |
| Hand-rolled debounce per effect | Custom `useDraftAutosave` + `useDebouncedValue` | Simpler than external library for ~3 call sites | ~40 LoC, no new dep |

**Deprecated / outdated (do NOT use):**
- `react-hook-form` — fine library but Phase 3 doesn't need it
- `@hookform/resolvers` — same
- `formik` — legacy
- zod 3.x — superseded
- js-yaml — unmaintained since 2023; use `yaml@2.8.3`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 2 ships zod NEITHER in Plan 02-01 NOR later — green field for Phase 3 to pick v4 | Common Pitfalls §1, Standard Stack | Low — confirmed via `cat dashboard/package.json` on 2026-04-19 showing no zod. If Phase 2 adds zod 3.x before Phase 3 starts, Plan 03-01 adjusts to `pnpm add zod@^3.25 || zod@^4` based on existing installs. |
| A2 | `HealthStatus.warning?: string` is added by Phase 2 Plan 02-09 (the "amendment" in the registry swap plan) | Phase 2 CONTEXT.md §Auth-Conflict Behavior; Phase 2 RESEARCH maps to "Claude's Discretion" (`HealthStatus.warning?: string` vs `diagnostics[]`) | Medium — Phase 2 planner chose the exact shape. If the field is named differently (e.g., `HealthStatus.diagnostic`), Phase 3's runtime-radio-grid consumes the different name. Planner should cross-check Phase 2's 02-09-PLAN.md when it lands. |
| A3 | Next.js 15 App Router + React 19's `useActionState` is the idiomatic Server Action pattern | Architecture Patterns §1 | Very low — nextjs.org docs + react.dev docs both endorse; live in production at thousands of sites. |
| A4 | Vitest 2.1.8 can switch to `jsdom` environment via `@vitest-environment jsdom` per-file directive | Testing Strategy | Low — documented Vitest feature since 1.x. |
| A5 | macOS APFS `rename(2)` fails cleanly (`ENOTEMPTY` or `EEXIST`) when destination is a non-empty directory | Pitfalls §6, Code Examples §2 | Low — POSIX-conformant; matches my atomic-write test expectations. If a future macOS version silently-replaces, Pre-flight `hasBundle()` is the primary gate anyway. |
| A6 | 11 regex patterns cover the realistic secret set for a prompt (Stripe + GitHub + AWS + Slack + Google + Anthropic + OpenAI + PEM + generic hex) | Secret-Pattern Source | Low — gitleaks default ruleset is the industry reference; if a user pastes an unusual secret (e.g., Azure storage key) the 40-hex catchall catches many; if not, future Phase 6 extends the list. Not a blocking Phase 3 risk. |
| A7 | `@testing-library/react@^16` is compatible with React 19 | Testing Strategy | Very low — RTL 16 released specifically for React 19 support. |
| A8 | `bundles.ts` parsing v0.1 SKILL.md frontmatter via gray-matter handles the existing 6 routines' SKILL.md files without modification | bundles.ts Design | Medium — the v0.1 SKILL.md files are simple (name + description frontmatter). If any uses unusual YAML (quoted colons, multiline values), parse may differ from `readSkill()` in `dashboard/lib/routines.ts`. **Mitigation:** Wave 1 test reads all 6 existing SKILL.md files and asserts gray-matter output matches current `readSkill()` output — shake out any difference before Phase 4 consumes. |

**If this table is empty:** it's not empty. 8 assumptions flagged — planner should review A2 against Phase 2's 02-09-PLAN.md before writing Phase 3 plans, and A8 as a Wave 1 smoke test.

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives govern Phase 3:

1. **Frozen v0.1 public surface** — Phase 3 MUST NOT touch `install.sh`, `hooks/*`, `~/.sleepwalker/*.jsonl` schemas, `~/.claude/settings.json` hook wiring, `QueueEntry` field names, or any existing v0.1 routine path. Phase 3 is strictly additive: new files only, net-new dependencies only, new route `/editor` only.

2. **Conventional commits** — Every Phase 3 plan commits with `docs(03):` / `feat(03):` / `test(03):` prefix. No emojis. No AI attribution. Imperative mood.

3. **Self-documenting code** — Comments explain WHY not WHAT. Result-object error returns (never throws for control flow). TypeScript strict mode.

4. **Security** — `autocomplete="off"` on every input (EDIT-05); secrets never logged; secret-scan blocks disk write; prompts never touch argv or shell.

5. **Activity log** — Every file-changing action appends to `docs/activity_log.md` (global CLAUDE.md rule).

6. **Package manager detection** — `pnpm-lock.yaml` exists in `dashboard/` → use pnpm.

7. **TypeScript** — strict mode enforced via `tsconfig.json`. `pnpm run typecheck` before every commit.

8. **Writing standards** — Error messages specific and actionable (UI-SPEC §Validation messages are pre-committed); API response shape consistent (`SaveRoutineState` discriminated union).

9. **Tests after changes** — Vitest suite green before every commit. `pnpm test` is the canonical.

10. **Imports use `@/` alias** — `import { x } from "@/lib/bundles"`, not `../../../lib/bundles`.

All ten directives are compatible with the approach laid out in this research.

---

## Environment Availability

Phase 3 is pure code + existing dashboard; no external dependencies beyond node_modules. No CLI tools spawned, no launchctl, no git, no subprocesses.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | entire dashboard | ✓ | 22.x (confirmed via `.planning/codebase/STACK.md`) | — |
| pnpm | install of 4 net-new deps | ✓ | (dashboard/pnpm-lock.yaml present) | — |
| Next.js dev server on port 4001 | `/editor` route | ✓ (v0.1 shipping) | 15.1.4 | — |
| Vitest | tests | ✓ | 2.1.8 | — |
| jsdom | client component tests | ✓ (Vitest 2.x bundles) | — | — |
| `zod` npm pkg | zod validation | ✗ not yet installed | 4.3.6 (to install) | — |
| `cronstrue` npm pkg | cronstrue preview | ✗ | 3.14.0 | — |
| `yaml` npm pkg | SKILL.md frontmatter write | ✗ | 2.8.3 | — |
| `gray-matter` npm pkg | SKILL.md frontmatter read | ✗ | 4.0.3 | — |
| `@testing-library/react` | component tests | ✗ | ^16.x | Fallback: skip component tests, assert correctness via integration-only (bundle Wave 2 into Wave 1). Not recommended; accept the 1MB install. |

**Missing dependencies with no fallback:** none that block.

**Missing dependencies with fallback:** `@testing-library/react` — if the planner wants to avoid it, Wave 2 tests become pure jsdom-DOM-manipulation tests (ugly but workable). Recommend installing it; the cost is trivial.

**Phase 2 dependency (prerequisite, not env availability):** Phase 3 cannot execute until Phase 2 Plan 02-09 ships (adapter registry with real `healthCheckAll()` + `HealthStatus.warning` field). Phase 2 status: 10 plans authored, 0 executed.

---

## Open Questions

1. **Should `bundles.ts` be the sole read-path for v0.2 Phase 4 `/routines`, or should `routines.ts` stay active?**
   - What we know: `routines.ts` exists today and reads only v0.1 `routines-local/` + `~/.claude/scheduled-tasks/`. It's consumed by `dashboard/app/routines/page.tsx`.
   - What's unclear: whether Phase 4 rewrites `/routines/page.tsx` on top of `bundles.ts` or writes a new page.
   - Recommendation: `bundles.ts` is the new unified reader (ships Phase 3). `routines.ts` stays as-is for Phase 3 (don't touch). Phase 4 Plan author decides whether `/routines/page.tsx` imports `bundles.ts` directly or both. Phase 6 backward-compat test ensures both work.

2. **Does `saveRoutine` redirect to `/routines?highlight={slug}` after success, or show in-page confirmation pill?**
   - What we know: UI-SPEC §Empty/zero states says: `saved {slug} at {time}` pill + form stays on-page, slug/name read-only 800ms.
   - What's unclear: whether there's ALSO a redirect option for users who want to immediately deploy.
   - Recommendation: UI-SPEC wins — in-page pill. User clicks "Routines" in sidebar to navigate. Phase 4 adds the Deploy button on the routine card (not on the editor page).

3. **How should `/editor` discover existing slugs for auto-derive collision avoidance?**
   - What we know: Server Component can call `listBundles()` and pass slug list to client. Slug is derived from name until manually edited.
   - What's unclear: if user types "Morning Brief" and `codex/morning-brief` already exists, does auto-derive bump to `morning-brief-2`?
   - Recommendation: NO auto-bump. Client derives `morning-brief`, collision check returns `available: false`, user manually changes. Automatic-suffix is magic and hides the collision.

4. **Should the editor preserve form data across an error-returning Server Action call?**
   - What we know: `useActionState` replays the form state on error. Form inputs use `defaultValue={...}` hydrated from `state.fieldErrors` context.
   - What's unclear: whether we use uncontrolled inputs (React 19's form-data-from-FormData pattern) or controlled with React state.
   - Recommendation: Controlled inputs with React state, because we need them for autosave + debounced validation anyway. On error, form state is preserved because we never cleared it; on success, the success pill renders and form clears after 800ms.

5. **Does gray-matter need a specific YAML engine option for the existing SKILL.md files?**
   - What we know: SKILL.md files are simple key: value YAML; gray-matter uses `js-yaml` internally.
   - What's unclear: whether our YAML is strict enough to parse identically to the current regex-based `readSkill()` in `routines.ts`.
   - Recommendation: Wave 1 smoke test reads all 6 existing SKILL.md files through gray-matter; asserts `name` + `description` match `readSkill()` output. If any differ, document and adjust before Phase 4 uses `bundles.ts`.

---

## Sources

### Primary (HIGH confidence)
- [Next.js Server Actions](https://nextjs.org/docs/app/api-reference/functions/server-actions) — official; verified 2026-04-19
- [React 19 `useActionState`](https://react.dev/reference/react/useActionState) — official; verified 2026-04-19
- [zod 4 docs](https://zod.dev/) — official; verified 2026-04-19 (zod@4.3.6 current per `npm view`)
- [cronstrue README](https://www.npmjs.com/package/cronstrue) — official; v3.14.0 verified
- [yaml (eemeli/yaml)](https://eemeli.org/yaml/) — official; v2.8.3 verified
- [gray-matter (jonschlinkert/gray-matter)](https://github.com/jonschlinkert/gray-matter) — official
- [gitleaks default ruleset](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) — source of the 11 secret patterns
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/types.ts` — live Phase 1 interface (read)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/lib/runtime-adapters/slug.ts` — live Phase 1+2 builders (read; assertValidSlug already in place per 2026-04-19 disk state)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/package.json` — confirmed zero Phase 3 deps installed
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/app/settings/settings-client.tsx` — live v0.1 client form pattern (mirror for `Section` helper)
- `/Users/rahulmehta/Desktop/Projects/sleepwalker/dashboard/tests/helpers.ts` — live `makeTempHome` pattern
- `.planning/phases/03-editor/03-UI-SPEC.md` — APPROVED 440-line UI contract (commits 1152375 + 961c4d3)
- `.planning/phases/02-adapters/02-CONTEXT.md` — Phase 2 locked decisions
- `.planning/phases/02-adapters/02-RESEARCH.md` — Phase 2 research (read partial; covers adapter registry shape)
- `.planning/research/STACK.md` — prior net-new dep research
- `.planning/research/ARCHITECTURE.md` — Layer 5 editor architecture
- `.planning/REQUIREMENTS.md` — EDIT-01..05 verbatim
- `.planning/ROADMAP.md` — Phase 3 success criteria 1-5
- `.planning/codebase/STACK.md` — v0.1 stack baseline
- `.planning/codebase/CONVENTIONS.md` — coding conventions
- `.planning/codebase/TESTING.md` — testing patterns
- `CLAUDE.md` — project rules

### Secondary (MEDIUM confidence)
- [POSIX rename(2) semantics](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html) — verified via POSIX.1-2017 spec for the atomic-write pattern
- [Next.js 15 App Router client-side navigation](https://nextjs.org/docs/app/building-your-application/routing) — for the `<Link>` intercept discussion

### Tertiary (LOW confidence, flagged for validation)
- Exact behavior of `fs.renameSync` replacing an empty directory on macOS Sonoma APFS — Pitfall #6 flags this; Wave 1 atomic-write test validates empirically.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all four net-new versions verified live via `npm view` on 2026-04-19
- Architecture patterns: **HIGH** — Server Actions + `useActionState` is documented and production-tested
- bundles.ts + Server Action shape: **HIGH** — mapped directly from Phase 2 CONTEXT's locked decisions
- Atomic write directory-swap: **HIGH** — POSIX-standard pattern; only Pitfall #6 (APFS quirk) flagged
- Secret-scan pattern list: **HIGH** — gitleaks ruleset is the industry reference
- Autosave / nav-intercept: **MEDIUM** — beforeunload is well-understood; in-app intercept research flags Next.js App Router ambiguity; recommended deferral if complexity grows
- Testing strategy: **HIGH** — mirrors v0.1 patterns; Vitest + jsdom is a known combo
- Build-order on Phase 2: **HIGH** — explicit plan-level dependency mapped

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — fast-moving ecosystem but deps verified current)

---

*Phase 3 research for: Sleepwalker v0.2 Editor (EDIT-01..05)*
*Researched: 2026-04-19 by gsd-phase-researcher*
