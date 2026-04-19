# Phase 3: Editor — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 19 source/test/config (13 net-new source/test + 2 config modifications + 4 test helpers reused)
**Analogs found:** 17 / 19 (two net-new patterns have no direct codebase analog — called out explicitly; RESEARCH.md is the authoritative source for those)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `dashboard/lib/bundle-schema.ts` | schema / validation utility | transform (FormData→typed) | `dashboard/lib/settings.ts` (typed I/O module) + `dashboard/lib/runtime-adapters/slug.ts` (regex + builders) | role-match (no prior zod usage) |
| `dashboard/lib/secret-patterns.ts` | constant / pattern registry | none (pure data) | `dashboard/lib/runtime-adapters/slug.ts` `RUNTIMES` constant + `SLUG_REGEX` | role-match |
| `dashboard/lib/secret-scan.ts` | utility (pure function) | transform (string→matches[]) | `dashboard/lib/runtime-adapters/slug.ts` `validateSlug` + `parseFleetKey` | role-match |
| `dashboard/lib/bundles.ts` | service (read-side FS enumeration) | CRUD (R only) | `dashboard/lib/routines.ts` (directory enumeration + SKILL.md parse) | **exact** |
| `dashboard/app/editor/actions.ts` | Server Action (API / backend) | request-response + file-I/O | `dashboard/app/api/settings/route.ts` (POST handler with body validation → fs writes) | role-match (Server Action replaces route handler) |
| `dashboard/lib/atomic-write.ts` | utility (filesystem write) | file-I/O (directory swap) | `dashboard/lib/approval.ts` (single-file write) + `dashboard/lib/settings.ts::writeSettings` | role-match + **RESEARCH.md §EDIT-02 authoritative** |
| `dashboard/app/editor/page.tsx` | Server Component (page shell) | request-response | `dashboard/app/settings/page.tsx` + `dashboard/app/page.tsx` | **exact** |
| `dashboard/app/editor/editor-client.tsx` | Client Component (form state machine) | event-driven (form + autosave) | `dashboard/app/settings/settings-client.tsx` | **exact** |
| `dashboard/app/editor/_components/runtime-radio-grid.tsx` | Client Component (controlled radio) | event-driven | `settings-client.tsx::Field` + pills/.panel utilities | role-match |
| `dashboard/app/editor/_components/cron-preview.tsx` | Client Component (derived-value display) | transform | `dashboard/app/_components/sleep-indicator.tsx` (derived UI from state) | role-match |
| `dashboard/app/editor/_components/secret-scan-panel.tsx` | Client Component (error panel) | transform (matches[]→UI) | Existing `.pill-red` / `btn-danger` usage in `settings-client.tsx` lines 134–136 | role-match |
| `dashboard/app/editor/_components/draft-recovery-banner.tsx` | Client Component (localStorage-backed banner) | event-driven | None for localStorage; `page-header.tsx` for panel-raised banner structure | partial (localStorage is net-new) |
| `dashboard/app/editor/_components/preview-panel.tsx` | Client Component (derived-path display) | transform (form state→paths) | `settings-client.tsx::Field` + `slug.ts` builders as inputs | role-match |
| `dashboard/tests/bundle-schema.test.ts` | test (pure unit) | — | `dashboard/tests/slug.test.ts` | **exact** |
| `dashboard/tests/secret-scan.test.ts` | test (pure unit) | — | `dashboard/tests/slug.test.ts` | **exact** |
| `dashboard/tests/atomic-write.test.ts` | test (filesystem, temp HOME) | — | `dashboard/tests/settings.test.ts` + `dashboard/tests/routines.test.ts` (tmp-cwd chdir pattern) | **exact** |
| `dashboard/tests/bundles.test.ts` | test (filesystem, temp HOME) | — | `dashboard/tests/routines.test.ts` | **exact** |
| `dashboard/tests/save-routine-action.test.ts` | test (Server Action, temp HOME) | — | `dashboard/tests/fire-routine.test.ts` (setup → action → assert file + mock) | **exact** |
| `dashboard/tests/editor-client.test.tsx` | test (React component, jsdom) | — | None (jsdom + RTL are **net-new** dev deps) | no analog — RESEARCH.md §Test Strategy authoritative |
| `dashboard/tests/runtime-radio-grid.test.tsx` | test (React component, jsdom) | — | None | no analog |
| `dashboard/tests/cron-preview.test.tsx` | test (React component, jsdom) | — | None | no analog |
| `dashboard/tests/draft-recovery-banner.test.tsx` | test (React component, jsdom) | — | None | no analog |
| `dashboard/package.json` | config | — | Existing `dashboard/package.json` | **exact** |
| `dashboard/vitest.config.ts` | config | — | Existing `dashboard/vitest.config.ts` | **exact** |

---

## Pattern Assignments

### `dashboard/lib/bundle-schema.ts` (schema utility, transform)

**Analog:** `dashboard/lib/runtime-adapters/slug.ts` (for regex-as-const + exported type; zod itself is net-new per RESEARCH.md)

**Imports pattern** (slug.ts lines 14–16):
```typescript
import os from "node:os";
import path from "node:path";
import type { Runtime } from "./types";
```

**Apply:** Same top-of-file ordering — node built-ins (none needed here), then external (`zod`), then type imports from sibling modules.

**Constant-export pattern** (slug.ts lines 19–26):
```typescript
export const RUNTIMES: readonly Runtime[] = [
  "claude-routines",
  "claude-desktop",
  "codex",
  "gemini",
] as const;

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;
```

**Apply:** Re-use `SLUG_REGEX` via `.regex(SLUG_REGEX, { message: "Slug must match ^[a-z][a-z0-9-]{0,63}$ — ..." })` inside the zod schema. Do not duplicate the regex.

**Error-message discipline:** UI-SPEC.md §Validation messages is the authoritative source. Every `z.string().min(...)`, `.max(...)`, `.regex(...)` MUST pass the exact UI-SPEC string via `{ message: "..." }`. RESEARCH.md line 699: *"Server Action MUST use those exact strings (not zod's default messages)."*

**Exported shape:** Mirror slug.ts's "predicate + builder" split — export the zod schema + `type RoutineBundleInput = z.infer<typeof Schema>`.

---

### `dashboard/lib/secret-patterns.ts` (constant registry)

**Analog:** `dashboard/lib/runtime-adapters/slug.ts` lines 19–26 (readonly const array with declarative entries)

**Shape to copy:**
```typescript
// dashboard/lib/runtime-adapters/slug.ts:19-26
export const RUNTIMES: readonly Runtime[] = [
  "claude-routines",
  "claude-desktop",
  "codex",
  "gemini",
] as const;
```

**Apply:** Export `SECRET_PATTERNS: readonly SecretPattern[]` with object entries `{ name, regex, description }`. Provenance comment at top mirroring slug.ts lines 1–12 (note source = gitleaks.toml per RESEARCH.md line 536). 11-pattern list is in UI-SPEC.md §Secret scan (EDIT-02) + RESEARCH.md §Secret-Pattern Source.

---

### `dashboard/lib/secret-scan.ts` (pure utility)

**Analog:** `dashboard/lib/runtime-adapters/slug.ts::validateSlug` + `parseFleetKey` (pure functions, no throw on expected states, null/false for not-found)

**Pure-predicate pattern** (slug.ts lines 29–31):
```typescript
export function validateSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}
```

**Result-returning pattern** (slug.ts lines 66–76):
```typescript
export function parseFleetKey(
  key: string,
): { runtime: Runtime; slug: string } | null {
  const slashIdx = key.indexOf("/");
  if (slashIdx <= 0) return null;
  const runtime = key.slice(0, slashIdx);
  const slug = key.slice(slashIdx + 1);
  if (!isRuntime(runtime)) return null;
  if (!validateSlug(slug)) return null;
  return { runtime, slug };
}
```

**Apply:** `findAllMatches(text: string): SecretMatch[]` iterates `SECRET_PATTERNS`, calls `regex.exec()` in a global-scan loop, returns `{ patternName, line, column, matched }[]`. Empty array (not null) when none — matches the result-object convention (CONVENTIONS.md line 232 "consistent shapes"). No throws.

---

### `dashboard/lib/bundles.ts` (directory enumeration — read-side)

**Analog:** `dashboard/lib/routines.ts` — **exact match**. This is the canonical pattern; Phase 2 CONTEXT.md lines 62–92 lock it.

**Directory-enumeration + SKILL.md parse** (routines.ts lines 46–101):
```typescript
// dashboard/lib/routines.ts:46-71
export function listRoutines(): Routine[] {
  const settings = readSettings();
  const enabled = new Set(settings.enabled_routines);
  const routines = new Map<string, Routine>();

  // 1. Repo templates (always shown so users see all available routines)
  const repoDir = repoLocalDir();
  if (fs.existsSync(repoDir)) {
    for (const dir of fs.readdirSync(repoDir)) {
      if (!dir.startsWith("sleepwalker-")) continue;
      const skill = readSkill(path.join(repoDir, dir));
      if (!skill) continue;
      const defaults = STARTER_DEFAULTS[dir] ?? { cron: "0 9 * * *", policy: "balanced" as Policy, budget: 50000 };
      routines.set(dir, { id: dir, name: skill.name, ... });
    }
  }
```

**Frontmatter parse helper** (routines.ts lines 34–44):
```typescript
function readSkill(dirPath: string): { name: string; description: string } | null {
  const skillPath = path.join(dirPath, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;
  const content = fs.readFileSync(skillPath, "utf8");
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(dirPath),
    description: descMatch ? descMatch[1].trim() : "",
  };
}
```

**Apply:**
- `listBundles()` iterates the four bundle roots: `routines-local/` (→ `claude-desktop`), `routines-cloud/` (→ `claude-routines`), `routines-codex/`, `routines-gemini/` — per Phase 2 CONTEXT.md decision.
- For v0.1 runtimes, parse SKILL.md frontmatter (like `readSkill`). For v0.2 runtimes (codex/gemini), parse `config.json` via `JSON.parse(fs.readFileSync(...))` with try/catch → return null on bad file (match the `try { ... } catch { return null; }` pattern from `settings.ts::readSettings` line 56–61).
- `hasBundle(runtime, slug)`: returns `fs.existsSync(toBundleDir(runtime, slug))`. Used by both the debounced `checkSlugAvailability` Server Action and `saveRoutine` pre-flight (RESEARCH.md line 741).
- `hasBundleAnyRuntime(slug)`: cross-runtime check per ADPT-02.
- **Do NOT validate enumerated slugs** — Phase 2 CONTEXT.md lines 89–91 mandates: *"bundle reader does not call validateSlug on enumerated entries; it trusts the existing v0.1 directory names."*

---

### `dashboard/app/editor/actions.ts` (Server Action)

**Analog:** `dashboard/app/api/settings/route.ts` — closest analog for "body parse → validation → fs writes → JSON response." Server Action replaces `NextResponse.json` with a plain return object.

**Body-parse + fs-write + result-object** (api/settings/route.ts lines 28–42):
```typescript
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (body.settings) {
    writeSettings(body.settings);
  }
  if (body.token === null) {
    clearGithubToken();
  } else if (typeof body.token === "string" && body.token.length > 0) {
    writeGithubToken(body.token);
  }

  return NextResponse.json({ ok: true, settings: readSettings() });
}
```

**Result-object shape** (fire-routine.ts lines 116–134 — the canonical convention):
```typescript
export interface FireResult {
  ok: boolean;
  status: number;
  sessionId?: string;
  error?: string;
}

export async function fireRoutine(routineId: string): Promise<FireResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, sessionId: parsed.claude_code_session_id };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
```

**Apply:**
- File starts with `"use server";` directive (net-new but one-line).
- Export `async function saveRoutine(prevState, formData): Promise<SaveResult>` returning `{ok: true, bundlePath} | {ok: false, error, fieldErrors?}` — matches `FireResult` convention.
- Flow (RESEARCH.md lines 263–313): (1) `Schema.safeParse(Object.fromEntries(formData))`; (2) on parse fail return `{ok:false, fieldErrors: parsed.error.flatten().fieldErrors}`; (3) `findAllMatches(prompt)` — any hits → `{ok:false, error, fieldErrors: {prompt: [UI-SPEC message]}}`; (4) `hasBundleAnyRuntime(slug)` pre-flight → `{ok:false, fieldErrors: {slug: [...]}}`; (5) `atomicWriteBundle(toBundleDir(runtime, slug), {"config.json": ..., "prompt.md": ...})`; (6) wrap the whole block in try/catch returning `{ok:false, error: e.message}` to match fire-routine.ts lines 131–133.
- Also export `async function checkSlugAvailability({runtime, slug}): Promise<{available: boolean}>` — simpler wrapper around `hasBundleAnyRuntime`.
- **Secret scan runs server-side authoritatively** even if client scanned — RESEARCH.md line 988 locks this.

---

### `dashboard/lib/atomic-write.ts` (directory-swap write)

**Analog:** `dashboard/lib/approval.ts` (single-file writer with mkdirSync + writeFileSync) is closest codebase match, but the **directory-swap atomic pattern is net-new**. RESEARCH.md §Technical Approach §EDIT-02 is authoritative.

**Basic write pattern** (approval.ts lines 24–40):
```typescript
export function enqueueForExecution(entry: QueueEntry): string | null {
  if (entry.source === "cloud") return null;
  if (!entry.tool || !entry.args) return null;

  const dir = inboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.id}.task`);
  fs.writeFileSync(
    file,
    JSON.stringify({ ...entry, approvedAt: new Date().toISOString() }, null, 2)
  );
  return file;
}
```

**Apply:** Follow the `mkdirSync({recursive: true}) + writeFileSync` primitive and the CONVENTIONS.md result-object error style, but the structure is from RESEARCH.md lines 364–391:
```typescript
// Net-new pattern, authoritative source: RESEARCH.md §EDIT-02
export async function atomicWriteBundle(
  finalDir: string,
  files: Record<string, string>,
): Promise<{ok: true; path: string} | {ok: false; error: string}> {
  const parent = path.dirname(finalDir);
  const base = path.basename(finalDir);
  fs.mkdirSync(parent, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(parent, `.${base}.tmp-`));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content);
    }
    fs.renameSync(tmpDir, finalDir);  // atomic on same-fs (APFS)
    return { ok: true, path: finalDir };
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

**Key invariants (RESEARCH.md lines 395–397):**
- Temp dir is sibling of final dir (same filesystem → no EXDEV).
- `renameSync` over non-empty existing dir throws on macOS → acts as backstop against TOCTOU slug collisions.

---

### `dashboard/app/editor/page.tsx` (Server Component shell)

**Analog:** `dashboard/app/settings/page.tsx` — **exact match**.

**Full analog file** (settings/page.tsx lines 1–23):
```typescript
import { readSettings, readGithubToken } from "@/lib/settings";
import { listRoutines } from "@/lib/routines";
import { SettingsClient } from "./settings-client";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = readSettings();
  const tokenSet = Boolean(readGithubToken());
  const routines = listRoutines();

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Sleep window, per-fleet defer policies, token budgets, GitHub credentials, tracked repositories. All stored under ~/.sleepwalker/."
      />
      <SettingsClient initial={settings} tokenSet={tokenSet} routines={routines} />
    </>
  );
}
```

**Also see `dashboard/app/page.tsx` lines 1–36** for an async Server Component that awaits multiple data sources (`aggregateQueue`) — pattern for Phase 3 when calling `healthCheckAll()`.

**Apply (from UI-SPEC.md line 371):**
- Copy import order verbatim. Replace lib imports with: `healthCheckAll` from `@/lib/runtime-adapters/index`, `listBundles` from `@/lib/bundles`.
- `export const dynamic = "force-dynamic"` (same as settings/page.tsx line 6 + page.tsx line 6).
- Make function `async` (per page.tsx line 8 pattern) because `healthCheckAll()` is async.
- `<PageHeader eyebrow="AUTHORING" title="Author a routine" subtitle="Write a prompt, pick a runtime, pick a schedule. Save writes a validated bundle to disk." />` — exact strings from UI-SPEC.md lines 121–123.
- Pass `healthStatuses` and seed `existingSlugs` (for client-side collision preview) into `<EditorClient>`.

---

### `dashboard/app/editor/editor-client.tsx` (Client form state machine)

**Analog:** `dashboard/app/settings/settings-client.tsx` — **exact match**. Reuse the `Section` helper verbatim per UI-SPEC.md line 234.

**"use client" + useState + handler pattern** (settings-client.tsx lines 1–39):
```typescript
"use client";

import { useState } from "react";
import { Save, Trash2, KeyRound, Plus, X } from "lucide-react";
import type { Settings, Policy } from "@/lib/settings";
import type { Routine } from "@/lib/routines";

const POLICIES: Policy[] = ["strict", "balanced", "yolo"];

export function SettingsClient({
  initial,
  tokenSet,
  routines,
}: {
  initial: Settings;
  tokenSet: boolean;
  routines: Routine[];
}) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", { method: "POST", ... });
      if (res.ok) setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setBusy(false);
    }
  }
```

**Section / Field primitives** (settings-client.tsx lines 228–245):
```typescript
function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      <p className="text-xs text-moon-400 mb-3">{desc}</p>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-moon-400">{label}</span>
      {children}
    </label>
  );
}
```

**Input styling** (settings-client.tsx lines 104–111):
```tsx
<input
  type="number"
  min={0}
  max={23}
  value={settings.sleep_window.start_hour}
  onChange={(e) => setSettings(...)}
  className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm w-20"
/>
```

**Save-feedback pill** (settings-client.tsx line 99):
```tsx
{savedAt && <div className="pill-green inline-block">saved at {savedAt}</div>}
```

**Destructive button** (settings-client.tsx lines 134–136):
```tsx
<button className="btn-danger" onClick={clearToken} disabled={busy}>
  <Trash2 className="w-4 h-4 inline mr-1" /> Clear token
</button>
```

**Apply:**
- Top directive: `"use client";`
- Imports: `useState, useEffect, useActionState, useRef` from react; `Save, Trash2` from lucide-react (per UI-SPEC.md line 24); `saveRoutine, checkSlugAvailability` from `./actions`; types from `@/lib/bundle-schema`.
- Duplicate `Section` helper inline (UI-SPEC.md line 234 mandate).
- Copy the input `className` pattern byte-for-byte — `bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm`.
- Prompt textarea follows UI-SPEC.md lines 254–258: `rows={30}`, `font-mono resize-y`, all autofill-suppression attributes (`autocomplete="off"` etc.).
- Form submits via `<form action={formAction}>` with `useActionState(saveRoutine, initialState)` per RESEARCH.md §EDIT-03.
- Autosave: `useEffect` with debounced `localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(...))` — key mandated by UI-SPEC.md line 297.

---

### `dashboard/app/editor/_components/runtime-radio-grid.tsx` (Client)

**Analog:** `settings-client.tsx` `.panel` / pill usage at lines 165–170 (the repo list item with panel + action button) + radio-input pattern.

**Panel + conditional classes** (settings-client.tsx lines 164–170):
```tsx
{settings.tracked_repos.map((r) => (
  <div key={r} className="flex items-center justify-between panel p-2">
    <span className="font-mono text-sm">{r}</span>
    <button className="btn-ghost p-1" onClick={() => removeRepo(r)} aria-label="Remove">
      <X className="w-4 h-4" />
    </button>
  </div>
))}
```

**Apply (UI-SPEC.md §Runtime radio-card grid, lines 245–251):**
- 2×2 grid wrapping `<label>` + hidden `<input type="radio" name="runtime">`.
- Classes: `.panel` default, `.panel-raised ring-1 ring-dawn-400` when selected, `opacity-40 cursor-not-allowed` when `!healthStatus.available`.
- Row 1: lucide icon (16px) + card title (14px `font-medium`).
- Row 2: description (12px `text-moon-400`).
- Row 3: health pill — `pill-green` / `pill-amber` / `pill-muted`. Use `HealthStatus.warning` from Phase 2 Plan 02-09 amendment (yellow badge path).
- Exact copy from UI-SPEC.md lines 147–150.

---

### `dashboard/app/editor/_components/cron-preview.tsx` (Client)

**Analog:** `dashboard/app/_components/sleep-indicator.tsx` (derived display) — structural only. `cronstrue` usage is net-new per RESEARCH.md line 149.

**Apply (UI-SPEC.md lines 317–322):**
```tsx
"use client";
import cronstrue from "cronstrue";

export function CronPreview({ expression, sleepWindow }: { expression: string; sleepWindow?: {start: number; end: number} }) {
  let parsed: string | null = null;
  let error: string | null = null;
  try { parsed = cronstrue.toString(expression, { verbose: false, use24HourTimeFormat: true }); }
  catch { error = "Invalid cron — 5 fields required (minute hour day month weekday)."; }

  if (error) return <span className="text-xs text-signal-red">{error}</span>;
  return <span className="pill-aurora">Runs {parsed}</span>;
}
```

Exact error string from UI-SPEC.md line 175. "Runs {cronstrue}" prefix from line 158.

---

### `dashboard/app/editor/_components/secret-scan-panel.tsx` (Client)

**Analog:** `.pill-red` / `.btn-danger` usage in `settings-client.tsx` lines 134–136; UI-SPEC.md §Secret-scan error panel lines 262–274 is authoritative.

**Panel structure** (from UI-SPEC.md lines 263–272):
- `.panel` with `border-signal-red/50 bg-signal-red/5`.
- Heading: `Secret detected — save blocked` (`text-signal-red` semibold).
- Body: `{matched_pattern_name} at line {n}, column {c}. Replace the matched substring with ${VAR} and document the variable in AUTHORING.md.`
- Inline code fix example (mono, `panel-raised`).
- Link: `View matched region` → scrolls textarea to `line:col` (framer-motion 300ms flash).

---

### `dashboard/app/editor/_components/draft-recovery-banner.tsx` (Client)

**Analog:** `page-header.tsx` for `.panel-raised` structure + framer-motion wrapping. localStorage is **net-new pattern** — no existing usage in codebase.

**framer-motion wrap pattern** (page-header.tsx lines 16–22):
```tsx
<motion.header
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.45, ease: [0.2, 0.65, 0.3, 0.95] }}
  className="mb-10"
>
```

**Apply (UI-SPEC.md §Draft-recovery banner, lines 278–286):**
- `useEffect` on mount: `const raw = localStorage.getItem("sleepwalker.draft.v1"); if (raw) { setDraft(JSON.parse(raw)); }`.
- Key: `sleepwalker.draft.v1` (UI-SPEC.md line 297).
- `.panel-raised` with `border-aurora-400/30`.
- Exact copy: `You have an unsaved draft from {relative time}.` per line 283.
- Buttons: `Restore draft` (aurora ghost) + `Start fresh` (btn-ghost).

---

### `dashboard/app/editor/_components/preview-panel.tsx` (Client)

**Analog:** `settings-client.tsx::Field` + slug.ts builders used as inputs.

**Apply (UI-SPEC.md §Grid lines 220–225 + §Live-preview copy lines 156–163):**
- Sticky right column: `className="w-80 sticky top-10"`.
- Lines (each mono/data style):
  - `routines-{runtime}/{slug}/` — call `toBundleDir(runtime, slug)` from `@/lib/runtime-adapters/slug`.
  - `~/Library/LaunchAgents/com.sleepwalker.{runtime}.{slug}.plist` — call `toPlistPath(runtime, slug)` (only for `codex` / `gemini`).
  - `[sleepwalker:{runtime}/{slug}]` — call `toMarkerTag(runtime, slug)`.
  - Cronstrue line (pass through `<CronPreview>`).
  - Health status pill.
- **Every builder call MUST be wrapped in try/catch** because slug.ts `assertValidSlug` throws on invalid input (Phase 2 CONTEXT.md line 43). Show blank/placeholder when slug not yet valid.

---

### Tests (server/lib layer, Wave 0 + Wave 1)

**Analog:** `dashboard/tests/slug.test.ts` + `dashboard/tests/settings.test.ts` + `dashboard/tests/routines.test.ts` + `dashboard/tests/fire-routine.test.ts`.

**Pure-unit test structure** (slug.test.ts lines 1–34):
```typescript
import { describe, it, expect } from "vitest";
import {
  validateSlug,
  isRuntime,
  toFleetKey,
  // ...
} from "@/lib/runtime-adapters/slug";

describe("validateSlug", () => {
  it("accepts canonical kebab-case", () => {
    expect(validateSlug("morning-brief")).toBe(true);
    // ...
  });

  it("rejects leading digits, uppercase, spaces, path segments", () => {
    expect(validateSlug("1-start")).toBe(false);
    // ...
  });
});
```

**Apply:**
- `bundle-schema.test.ts` → copy structure from slug.test.ts: `describe("RoutineBundleSchema", ...)`, multiple `it()` blocks for accept/reject matrix per RESEARCH.md line 803. Assert exact UI-SPEC error strings via `parsed.error.flatten().fieldErrors.slug[0]`.
- `secret-scan.test.ts` → same structure; one `describe` per pattern category.

**Temp-HOME + filesystem test structure** (settings.test.ts lines 1–42):
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("settings lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => env.restore());

  it("writeGithubToken writes to the right path with mode 600", async () => {
    const { writeGithubToken, readGithubToken } = await import("@/lib/settings");
    writeGithubToken("ghp_test_token");
    expect(readGithubToken()).toBe("ghp_test_token");
    const stat = fs.statSync(path.join(dir, "github-token"));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
```

**Tmp-cwd chdir pattern for repo-relative paths** (routines.test.ts lines 5–21):
```typescript
const ORIG_CWD = process.cwd();
const DASHBOARD_DIR = path.resolve(__dirname, "..");

describe("routines lib", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    process.chdir(DASHBOARD_DIR);
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
  });
```

**Apply:**
- `atomic-write.test.ts` / `bundles.test.ts` / `save-routine-action.test.ts` all follow the same pattern. For `bundles.test.ts` + `save-routine-action.test.ts`, use the `chdir` pattern from `routines.test.ts` because `listBundles` + `saveRoutine` read/write repo-relative paths (`routines-codex/`). Each test creates a temp cwd, mkdirs the bundle directories, runs the function, asserts.

**Dynamic import pattern** (TESTING.md lines 91–95, demonstrated in settings.test.ts line 18):
```typescript
const { readSettings } = await import("@/lib/settings");  // Import AFTER env setup
```

**Apply:** Every test imports `@/lib/*` inside the `it()` body so env vars take effect first.

---

### React component tests (Wave 2)

**Analog:** None — jsdom + React Testing Library are **net-new dev dependencies** (see package.json modification below). RESEARCH.md §Test Strategy + RESEARCH.md lines 814–816 is authoritative.

**Net-new convention (from RESEARCH.md):**
```typescript
// dashboard/tests/editor-client.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// ...
```

**Config requirement:** `vitest.config.ts` must set `environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]]` so `.test.ts` stays on node (existing behaviour) and `.test.tsx` uses jsdom. See "Config" section below.

---

### `dashboard/package.json` (modified)

**Analog:** existing `dashboard/package.json` — **exact match** (add entries only).

**Apply:**
- Add to `dependencies`: `"zod": "^4.3.6"`, `"cronstrue": "^3.14.0"`, `"yaml": "^2.8.3"`, `"gray-matter": "^4.0.3"` — versions from RESEARCH.md line 149.
- Add to `devDependencies`: `"@testing-library/react": "^16.x"`, `"@testing-library/user-event": "^14.x"`, `"jsdom": "^25.x"`.
- Do not change existing entries (Next, React, Vitest, Tailwind, Lucide, Framer Motion).

---

### `dashboard/vitest.config.ts` (modified)

**Analog:** existing `dashboard/vitest.config.ts` — **exact match**.

**Existing content:**
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

**Apply (minimal diff):**
- Change `include` to `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`.
- Add `environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]]` so node stays default and only `.tsx` tests use jsdom — preserves 43 existing tests unchanged.

---

## Shared Patterns

### Imports and path aliases

**Source:** `dashboard/tests/slug.test.ts:1-13`, `dashboard/lib/routines.ts:1-4`
**Apply to:** All new `dashboard/lib/*.ts` and `dashboard/tests/*.test.ts` files.

**Rule (CONVENTIONS.md lines 77–88):**
1. Built-in Node modules (`import fs from "node:fs"`).
2. External packages (`import { describe, it } from "vitest"`, `import { z } from "zod"`).
3. Relative lib imports via `@/*` alias (`import { toBundleDir } from "@/lib/runtime-adapters/slug"`).
4. Type imports (`import type { Runtime } from "@/lib/runtime-adapters/types"`).
5. Local siblings (`import { SettingsClient } from "./settings-client"`).

Never `../`; always `@/*`.

### Error handling — result objects (not throws)

**Source:** `dashboard/lib/fire-routine.ts:116-134` (canonical shape), CONVENTIONS.md lines 114–134.
**Apply to:** `actions.ts::saveRoutine`, `atomic-write.ts::atomicWriteBundle`, `bundles.ts::listBundles/readBundle`, `secret-scan.ts::findAllMatches`.

**Rule:**
```typescript
try {
  // ...
  return { ok: true, ...payload };
} catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}
```

Never throw for control flow. Throws are reserved for programmer-bug assertions (e.g., `assertValidSlug` in slug.ts).

### Graceful fallback on JSON parse

**Source:** `dashboard/lib/settings.ts:56-61`, `dashboard/lib/queue.ts:103-110`.
**Apply to:** `bundles.ts` when reading `config.json` from disk.

```typescript
if (!fs.existsSync(f)) return null;
try {
  return JSON.parse(fs.readFileSync(f, "utf8"));
} catch {
  return null;
}
```

Matches "Return Null for Not Found" convention (CONVENTIONS.md lines 137–143).

### Test setup / teardown — temp HOME + (optionally) chdir

**Source:** `dashboard/tests/settings.test.ts:6-16`, `dashboard/tests/routines.test.ts:5-21`, `dashboard/tests/helpers.ts:11-23`.
**Apply to:** All new filesystem-touching tests (bundles, atomic-write, save-routine-action).

**Rule:**
- Use `makeTempHome()` + `ensureSleepwalkerDir()` from `tests/helpers.ts` (no fork; reuse).
- For repo-relative reads (`routines-*/`) also `process.chdir(DASHBOARD_DIR)` in `beforeEach` and restore in `afterEach`.
- Dynamic `await import(...)` inside `it()` body — ensure env is set before the lib reads `process.env.HOME`.

### UI primitives — no new tokens

**Source:** `dashboard/app/settings/settings-client.tsx` (entire file), `dashboard/app/globals.css @layer components` (pre-existing `.panel`, `.pill-green`, `.btn-danger`, `.label`, `.hairline`, `.data`).
**Apply to:** All Phase 3 client components.

**Rule (UI-SPEC.md lines 29, 386–391):** No new component library, no new fonts, no new color tokens, no third-party registries. Every class already exists in `globals.css`. Icons from `lucide-react` only.

### Copy strings are pre-committed

**Source:** `.planning/phases/03-editor/03-UI-SPEC.md` §Copywriting Contract (lines 113–197).
**Apply to:** `editor-client.tsx`, every `_components/*`, `actions.ts` fieldErrors, `bundle-schema.ts` zod messages, `secret-scan-panel.tsx`.

**Rule:** Every user-facing string is pre-written in UI-SPEC.md. The executor MUST use the exact strings. Zod `{ message: "..." }` overrides use these strings, not zod defaults. This is enforced by `bundle-schema.test.ts` asserting exact-match output (RESEARCH.md line 699, 803).

### Frozen contracts from Phase 1/2

**Source:** `dashboard/lib/runtime-adapters/slug.ts`, `dashboard/lib/runtime-adapters/types.ts`, `dashboard/lib/runtime-adapters/index.ts` (after Plan 02-09).
**Apply to:** `bundle-schema.ts` (regex), `actions.ts` (builders), `preview-panel.tsx` (builders), `page.tsx` (`healthCheckAll`).

**Rule:**
- `SLUG_REGEX` is imported via `validateSlug` or hard-coded via regex literal in zod — but the message references the exact regex `^[a-z][a-z0-9-]{0,63}$`.
- `toBundleDir`, `toPlistPath`, `toMarkerTag` all **throw** on invalid slug (Phase 2 CONTEXT.md line 43). Callers in preview-panel.tsx wrap in try/catch to tolerate in-flight typing.
- `HealthStatus.warning?: string` (Phase 2 Plan 02-09 amendment) drives the amber-card tooltip.
- `RoutineBundle` type from `@/lib/runtime-adapters/types` is the write shape; zod schema's `z.infer` MUST be assignable to it.

---

## No Analog Found

Files with no close match in the codebase (planner should reference RESEARCH.md / UI-SPEC.md directly, not a codebase analog):

| File | Role | Data Flow | Reason | Authoritative Source |
|------|------|-----------|--------|----------------------|
| `dashboard/lib/atomic-write.ts` | utility | file-I/O (directory swap) | No existing directory-swap or mkdtemp usage in codebase | RESEARCH.md §Technical Approach §EDIT-02 (lines 349–397) |
| `dashboard/tests/editor-client.test.tsx` and the other `.test.tsx` files | test (React + jsdom) | — | No existing React component tests; jsdom + RTL are net-new dev deps | RESEARCH.md §Test Strategy (lines 811–816) + package.json modification |
| `dashboard/app/editor/actions.ts` (partial) | Server Action | request-response | No existing `"use server"` file in codebase — only REST API routes | RESEARCH.md §Technical Approach §EDIT-02 (lines 260–313); closest analog for body-handling is `api/settings/route.ts` |
| localStorage usage in `draft-recovery-banner.tsx` | — | — | No existing localStorage usage in codebase | UI-SPEC.md §Draft-recovery banner (lines 276–287) + §Autosave (lines 293–308) |

---

## Metadata

**Analog search scope:**
- `dashboard/app/` (all routes + `_components/`)
- `dashboard/lib/` (all lib modules including `runtime-adapters/`)
- `dashboard/tests/` (all existing Vitest tests)
- `dashboard/vitest.config.ts`, `dashboard/package.json`, `dashboard/tsconfig.json`

**Files scanned:** 22 TS/TSX source files + 10 test files + 2 config files

**Reads performed (non-overlapping ranges only):**
- `.planning/phases/03-editor/03-UI-SPEC.md` (full)
- `.planning/phases/03-editor/03-RESEARCH.md` (grep-targeted — full read exceeded token limit)
- `.planning/codebase/ARCHITECTURE.md` (full)
- `.planning/codebase/CONVENTIONS.md` (full)
- `.planning/codebase/TESTING.md` (full)
- `.planning/phases/02-adapters/02-CONTEXT.md` (full)
- `dashboard/app/settings/settings-client.tsx` (full)
- `dashboard/app/settings/page.tsx` (full)
- `dashboard/app/page.tsx` (full)
- `dashboard/app/layout.tsx` (full)
- `dashboard/app/_components/page-header.tsx` (full)
- `dashboard/lib/routines.ts` (full)
- `dashboard/lib/settings.ts` (full)
- `dashboard/lib/approval.ts` (full)
- `dashboard/lib/runtime-adapters/slug.ts` (full)
- `dashboard/tests/slug.test.ts` (full)
- `dashboard/tests/settings.test.ts` (full)
- `dashboard/tests/routines.test.ts` (full)
- `dashboard/tests/fire-routine.test.ts` (first 80 lines only)
- `dashboard/tests/helpers.ts` (full)
- `dashboard/tests/launchd-writer.test.ts` (first 60 lines — structural sample)
- `dashboard/app/api/settings/route.ts` (full)
- `dashboard/vitest.config.ts` + `dashboard/package.json` (full, via Bash)

**Pattern extraction date:** 2026-04-19
