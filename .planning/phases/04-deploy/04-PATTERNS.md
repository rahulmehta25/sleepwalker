# Phase 4: Deploy — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 20 (10 new server/lib + route, 7 new client components, 9 new tests, 3 modified)
**Analogs found:** 19 / 20 (save-to-repo has no direct analog — simple-git is net-new)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `dashboard/lib/deploy-state.ts` | lib (state-machine I/O) | file-I/O (atomic write + read) | `dashboard/lib/atomic-write.ts` + `dashboard/lib/queue.ts` | exact (atomic primitive + JSONL reader composition) |
| `dashboard/lib/save-to-repo.ts` | lib (git ops + flock) | file-I/O + subprocess | `dashboard/lib/runtime-adapters/launchd-writer.ts` (result-object + execFile pattern) | role-match (no simple-git analog exists) |
| `dashboard/app/api/health/all/route.ts` | route (Route Handler) | request-response | `dashboard/app/api/routines/route.ts` + `dashboard/app/api/cloud/fire/route.ts` | exact |
| `dashboard/app/routines/actions.ts` | server-action module | request-response (7 actions) | `dashboard/app/editor/actions.ts` | exact |
| `dashboard/app/routines/_components/deploy-progress-drawer.tsx` | component (client) | event-driven (500ms poll) | `dashboard/app/editor/editor-client.tsx` (useEffect polling) + `dashboard/app/editor/_components/draft-recovery-banner.tsx` (overlay pattern) | role-match |
| `dashboard/app/routines/_components/routine-action-bar.tsx` | component (client) | user-action dispatch | `dashboard/app/routines/routines-client.tsx::Toggle` + `dashboard/app/editor/editor-client.tsx` (Save button block) | exact |
| `dashboard/app/routines/_components/drift-pill.tsx` | component (client, presentational) | static render | `dashboard/app/routines/routines-client.tsx` (pill usage) + `dashboard/app/editor/editor-client.tsx` (inline pill status) | exact |
| `dashboard/app/routines/_components/save-to-repo-modal.tsx` | component (client) | two-stage form | `dashboard/app/editor/editor-client.tsx` (Section + form composition) | role-match |
| `dashboard/app/_components/health-badge-row.tsx` | component (client) | event-driven (fetch on mount + sessionStorage) | `dashboard/app/editor/_components/draft-recovery-banner.tsx` (useEffect + storage) | exact |
| `dashboard/app/_components/health-badge.tsx` | component (client, presentational) | static render | `dashboard/app/routines/routines-client.tsx` (pill render) | exact |
| `dashboard/app/routines/_components/runtime-toggle.tsx` | component (client) | user-action dispatch | `dashboard/app/routines/routines-client.tsx::Toggle` (direct reuse) | exact |
| `dashboard/tests/deploy-state.test.ts` | test (unit, node) | file-I/O | `dashboard/tests/atomic-write.test.ts` + `dashboard/tests/queue.test.ts` | exact |
| `dashboard/tests/deploy-routine-action.test.ts` | test (unit, node) | Server Action + mocks | `dashboard/tests/save-routine-action.test.ts` | exact |
| `dashboard/tests/deploy-progress-drawer.test.tsx` | test (jsdom) | client component + fake timers | `dashboard/tests/draft-recovery-banner.test.tsx` | exact |
| `dashboard/tests/run-now-action.test.ts` | test (unit, node) | Server Action + adapter mocks | `dashboard/tests/save-routine-action.test.ts` + `dashboard/tests/codex.test.ts` (execFile mock) | exact |
| `dashboard/tests/set-enabled-action.test.ts` | test (unit, node) | Server Action + execFile mock | `dashboard/tests/codex.test.ts::installExecFileMock` | exact |
| `dashboard/tests/save-to-repo.test.ts` | test (unit, node) | real tmp git repo + simple-git | `dashboard/tests/atomic-write.test.ts` (tmp-dir pattern) + `dashboard/tests/codex.test.ts` (execFile calls assertion) | role-match |
| `dashboard/tests/health-route.test.ts` | test (integration, node) | Route Handler + mocked adapters | `dashboard/tests/adapter-registry.test.ts::healthCheckAll` | exact |
| `dashboard/tests/health-badge-row.test.tsx` | test (jsdom) | fetch mock + sessionStorage | `dashboard/tests/draft-recovery-banner.test.tsx` | exact |
| `dashboard/tests/routines-page.test.ts` | test (integration, node) | listBundles + drift attach | `dashboard/tests/bundles.test.ts` | exact |
| `dashboard/app/routines/page.tsx` | Server Component (MODIFIED) | request-response | `dashboard/app/editor/page.tsx` (listBundles + healthCheckAll) | exact |
| `dashboard/app/page.tsx` | Server Component (MODIFIED) | add HealthBadgeRow into meta slot | `dashboard/app/page.tsx` (existing meta pattern) + `dashboard/app/editor/page.tsx` (health pass-through) | exact |

---

## Pattern Assignments

### `dashboard/lib/deploy-state.ts` (lib, file-I/O)

**Analog:** `dashboard/lib/atomic-write.ts` (atomic write primitive) + `dashboard/lib/queue.ts` (read-with-fallback)

**Imports pattern** (from `atomic-write.ts` lines 13-14):
```typescript
import fs from "node:fs";
import path from "node:path";
```

**Home-resolved path builder pattern** (from `queue.ts` lines 1-7):
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function queueFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "queue.jsonl");
}
```
Apply verbatim: `deployStateFile(slug)` returns `path.join(process.env.HOME || os.homedir(), ".sleepwalker", "deploys", `${slug}.state.json`)`.

**Atomic write pattern** (from `atomic-write.ts` lines 32-85):
```typescript
export function atomicWriteBundle(
  finalDir: string,
  files: Record<string, string>,
): AtomicWriteResult {
  const parent = path.dirname(finalDir);
  const base = path.basename(finalDir);

  if (fs.existsSync(finalDir)) {
    return { ok: false, error: `${finalDir} already exists`, errorCode: "collision" };
  }
  // ... mkdtemp sibling → write → renameSync
```
For single-file state, use simpler variant: `fs.writeFileSync(tmpPath, json)` then `fs.renameSync(tmpPath, finalPath)` — same POSIX-atomic rename guarantee (same filesystem via sibling tmp path).

**Result-object error pattern** (from `atomic-write.ts` lines 16-21):
```typescript
export interface AtomicWriteResult {
  ok: boolean;
  path?: string;
  error?: string;
  errorCode?: "collision" | "io" | "permission";
}
```
Apply: `DeployState` union = `{ok: true, state: DeployStateRecord} | {ok: false, error: string}`.

**Tolerant JSON parse** (from `queue.ts` lines 34-47):
```typescript
function parseLines(raw: string): QueueEntry[] {
  return raw.split("\n").map(l => l.trim()).filter(Boolean)
    .map(line => { try { return JSON.parse(line) as QueueEntry; } catch { return null; } })
    .filter((x): x is QueueEntry => x !== null);
}
```
Apply: `readDeployState` wraps `JSON.parse(fs.readFileSync(...))` in try/catch, returns `null` for missing/corrupt (NOT throws — matches `readBundle` tolerance in `bundles.ts:108-173`).

**Drift mtime computation** (net-new, but follow `bundles.ts::listBundles` enumeration style):
```typescript
// Model after bundles.ts lines 60-78 — iterate directory, fs.statSync per entry
const bundleMtime = Math.max(
  ...fs.readdirSync(bundleDir).map(f => fs.statSync(path.join(bundleDir, f)).mtimeMs)
);
const driftFlag = deployState?.verifiedAt && bundleMtime > deployState.verifiedAt;
```

---

### `dashboard/lib/save-to-repo.ts` (lib, file-I/O + subprocess)

**Analog:** No direct simple-git analog. Closest structural match: `dashboard/lib/runtime-adapters/launchd-writer.ts` (result-object + execFileP + try/catch + always-cleanup).

**Result-object contract** (model after `launchd-writer.ts` lines 38-43):
```typescript
export interface InstallResult {
  ok: boolean;
  plistPath?: string;
  error?: string;
  lintOutput?: string;
}
```
Apply: `PreviewResult = {ok: true, files: [...], totals: {...}} | {ok: false, error: "lock-busy" | "git-error" | string}`.

**Subprocess + rollback pattern** (from `launchd-writer.ts` lines 173-207):
```typescript
export async function installPlist(job: LaunchdJob): Promise<InstallResult> {
  const plistPath = launchAgentsPath(job.label);
  try {
    await fs.mkdir(path.dirname(plistPath), { recursive: true });
    const xml = generatePlist(job);
    await fs.writeFile(plistPath, xml, { mode: 0o644 });

    try {
      await execFileP("plutil", ["-lint", plistPath]);
    } catch (e) {
      const lintOutput = e instanceof Error && "stderr" in e ? String((e as { stderr: unknown }).stderr) : String(e);
      await fs.unlink(plistPath).catch(() => { /* swallow */ });
      return { ok: false, error: "plist lint failed", lintOutput };
    }
    // ... bootout → bootstrap → rollback on failure
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```
Apply same shape for `previewSaveToRepo`: acquire lock → `git add -- <subpath>` → `git diff --cached --stat` → return result OR release lock + reset path on any error.

**Never-push invariant** (new, enforce at import level):
```typescript
// save-to-repo.ts: do not import/call git.push. Unit test asserts:
// expect(git.push).not.toHaveBeenCalled();  (see save-to-repo.test.ts analog below)
```

**Explicit-subpath invariant** (model after `atomic-write.ts::atomicWriteBundle(finalDir, files)`):
```typescript
// Always stage via: git add -- routines-<runtime>/<slug>/
// NEVER git add -A, NEVER git add .
const subpath = path.join(`routines-${runtime === "claude-routines" ? "cloud" : runtime === "claude-desktop" ? "local" : runtime}`, slug);
await git.add(["--", subpath]);
```
Note: use `RUNTIME_ROOT` mapping from `bundles.ts:23-28` to resolve runtime → directory.

---

### `dashboard/app/api/health/all/route.ts` (route, request-response)

**Analog:** `dashboard/app/api/routines/route.ts` (simplest GET) + `dashboard/app/api/cloud/fire/route.ts` (error handling)

**Route structure** (from `api/routines/route.ts` lines 1-8):
```typescript
import { NextResponse } from "next/server";
import { listRoutines, setEnabled } from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routines: listRoutines() });
}
```

**For Phase 4**, wrap `healthCheckAll()` from `@/lib/runtime-adapters/index.ts:30-32`:
```typescript
export async function healthCheckAll(): Promise<HealthStatus[]> {
  return Promise.all(Object.values(ADAPTERS).map((a) => a.healthCheck()));
}
```
Phase 4 amends to `Promise.allSettled` + per-adapter 2000ms timeout wrapper:
```typescript
const withTimeout = <T>(p: Promise<T>, ms: number, runtime: Runtime): Promise<HealthStatus> =>
  Promise.race([
    p as Promise<HealthStatus>,
    new Promise<HealthStatus>((resolve) => setTimeout(
      () => resolve({ runtime, available: false, reason: `healthCheck timed out after ${ms}ms` }),
      ms
    )),
  ]);
const settled = await Promise.allSettled(
  Object.values(ADAPTERS).map((a) => withTimeout(a.healthCheck(), 2000, a.runtime))
);
const statuses: HealthStatus[] = settled.map((r, i) =>
  r.status === "fulfilled" ? r.value : {
    runtime: Object.keys(ADAPTERS)[i] as Runtime,
    available: false,
    reason: `healthCheck threw: ${r.reason}`,
  }
);
return NextResponse.json({ statuses, checkedAt: new Date().toISOString() });
```

---

### `dashboard/app/routines/actions.ts` (server-actions, request-response)

**Analog:** `dashboard/app/editor/actions.ts` (exact — same project, same React 19 pattern)

**"use server" + imports pattern** (from `editor/actions.ts` lines 1-34):
```typescript
"use server";
// dashboard/app/editor/actions.ts
// ...
import path from "node:path";
import matter from "gray-matter";

import { RoutineBundleInput } from "@/lib/bundle-schema";
import { scanForSecrets } from "@/lib/secret-scan";
import { hasBundleAnyRuntime, RUNTIME_ROOT } from "@/lib/bundles";
import { atomicWriteBundle } from "@/lib/atomic-write";
import type { Runtime } from "@/lib/runtime-adapters/types";
```

**Discriminated-union result type** (from `editor/actions.ts` lines 42-63):
```typescript
export type SaveRoutineState =
  | { status: "idle" }
  | { status: "ok"; bundlePath: string; runtime: Runtime; slug: string; warning?: string }
  | { status: "error"; fieldErrors: Record<string, string[]>; formError?: string };
```
Apply per action: `DeployActionResult`, `RunNowActionResult`, `SetEnabledActionResult`, `PreviewResult`, `CommitResult` — each a `{ok: true, ...} | {ok: false, error: string}` union.

**Step-composition + early-return pattern** (from `editor/actions.ts` lines 139-214):
```typescript
export async function saveRoutine(
  _prevState: SaveRoutineState,
  formData: FormData,
): Promise<SaveRoutineState> {
  // Step 1 — FormData coercion + zod validation
  const raw = Object.fromEntries(formData);
  const parsed = RoutineBundleInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { status: "error", fieldErrors };
  }
  // Step 2 — Secret scan
  const matches = scanForSecrets(input.prompt);
  if (matches.length > 0) { /* return early */ }
  // Step 3 — Collision
  const occupiedBy = hasBundleAnyRuntime(input.slug);
  if (occupiedBy) { /* return early */ }
  // Step 4 — Atomic write
  const result = atomicWriteBundle(finalDir, files);
  if (!result.ok) { /* map errorCode → UI copy */ }
  // Success
}
```
Apply to `deployRoutine`:
```typescript
// Step 1: readBundle(runtime, slug) — return error if null
// Step 2: writeDeployState({step: "planning", ...}) — atomic
// Step 3: writeDeployState({step: "writing", ...}) + adapter.deploy() — on failure, rollback + return
// Step 4: writeDeployState({step: "loading", ...}) + wait for launchctl
// Step 5: writeDeployState({step: "verified", verifiedAt: Date.now()})
// Rollback (any step failure): adapter.undeploy(bundle).catch(ignore) + deleteDeployState(slug) + return {ok: false, error, failedStep}
```

**Non-FormData Server Action signature** (from `editor/actions.ts` lines 226-238):
```typescript
export async function checkSlugAvailability(
  runtime: Runtime,
  slug: string,
): Promise<SlugAvailability> {
  // ... plain object args + typed return
}
```
Apply: `getDeployState({slug})`, `runNowRoutine({runtime, slug})`, `setRoutineEnabled({runtime, slug, enabled})` all take plain objects, not FormData.

**Adapter dispatch pattern** (new for Phase 4 — use registry from `runtime-adapters/index.ts:19-28`):
```typescript
import { getAdapter } from "@/lib/runtime-adapters";
const adapter = getAdapter(runtime);
const result = await adapter.deploy(bundle);
// result: { ok: true, artifact, handoffUrl?, warning? } | { ok: false, error }
```

---

### `dashboard/app/routines/_components/deploy-progress-drawer.tsx` (client, event-driven)

**Analog:** `dashboard/app/editor/editor-client.tsx` (debounced useEffect + fetch) + `dashboard/app/editor/_components/draft-recovery-banner.tsx` (SSR-safe mount)

**"use client" + hooks imports** (from `editor-client.tsx` lines 1-45):
```typescript
"use client";
import { useActionState, useEffect, useRef, useState } from "react";
// ...
```

**useRef-based timer pattern** (from `editor-client.tsx` lines 123-127):
```typescript
const dirtyRef = useRef(false);
const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const secretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```
Apply: `pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)` for 500ms deploy-state poll.

**Debounced useEffect pattern** (from `editor-client.tsx` lines 163-190):
```typescript
useEffect(() => {
  if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  autosaveTimer.current = setTimeout(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ... }));
    } catch {
      /* storage disabled or quota exceeded */
    }
  }, 500);
  return () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  };
}, [name, slug, runtime, ...]);
```
Apply same pattern for polling — setInterval 500ms, clear on unmount + clear on terminal state.

**Server Action invocation from client** (from `editor-client.tsx` lines 118-122):
```typescript
const [saveState, formAction, isSaving] = useActionState<SaveRoutineState, FormData>(
  saveRoutine,
  INITIAL_SAVE_STATE,
);
```
For deploy drawer (non-FormData action) use direct invocation + `useTransition`:
```typescript
const [isDeploying, startTransition] = useTransition();
startTransition(async () => {
  const result = await deployRoutine({ runtime, slug });
  // handle result
});
```

**Framer-motion overlay pattern** (from `app/_components/page-header.tsx` lines 3-21):
```typescript
import { motion } from "framer-motion";

export function PageHeader({ ... }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.65, 0.3, 0.95] }}
      className="mb-10"
    >
```
Apply to drawer: `<motion.aside initial={{x: 420}} animate={{x: 0}} transition={{type: "spring", damping: 25, stiffness: 200}}>`.

**Terminal-state UI swap** (from `editor-client.tsx` lines 500-515 — saveState.status branches):
```typescript
{saveState.status === "ok" && (
  <span className="pill-green">saved {saveState.slug}</span>
)}
{saveState.status === "ok" && saveState.warning && (
  <span className="pill-amber text-xs max-w-[520px]">{saveState.warning}</span>
)}
{saveState.status === "error" && saveState.formError && (
  <span className="text-xs text-signal-red">{saveState.formError}</span>
)}
```
Apply: 4-step pills map `state.step` → `pill-muted | pill-aurora + Loader2 | pill-green + CheckCircle2 | pill-red + AlertTriangle`.

---

### `dashboard/app/routines/_components/routine-action-bar.tsx` (client, user-action dispatch)

**Analog:** `dashboard/app/routines/routines-client.tsx::Toggle` + existing card layout

**Existing card layout to extend** (from `routines-client.tsx` lines 43-81):
```typescript
return (
  <div key={r.id} className="panel p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium">{fleet}</span>
          <span className="pill-muted font-mono">{r.defaultCron}</span>
          <span className={r.defaultPolicy === "yolo" ? "pill-red" : ...}>
            {r.defaultPolicy}: {POLICY_DESC[r.defaultPolicy]}
          </span>
          {!r.installed && (
            <span className="pill-amber inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> not installed
            </span>
          )}
        </div>
        <p className="text-sm text-moon-400">{r.description}</p>
        ...
      </div>
      <Toggle checked={r.enabled} disabled={busy === r.id || !r.installed} onChange={...} />
    </div>
    ...
  </div>
);
```
Phase 4 MUST NOT rewrite this — add an action-bar row below the existing `flex items-start justify-between` block, hairline-separated per 04-UI-SPEC §Layout Contract:
```tsx
<div className="flex items-center justify-between gap-4 pt-3 mt-3 border-t border-ink-600">
  {/* left: Deploy/Redeploy + Run-now */}
  {/* right: Save-to-repo + Toggle */}
</div>
```

**Optimistic fetch pattern** (from `routines-client.tsx` lines 14-30):
```typescript
async function toggle(id: string, enabled: boolean) {
  setBusy(id);
  try {
    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (!res.ok) throw new Error("toggle failed");
    setRoutines((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
  } finally {
    setBusy(null);
  }
}
```
Apply same shape for action-bar click handlers — `setBusy(slug)` → Server Action → update local state → `setBusy(null)` in finally.

---

### `dashboard/app/routines/_components/drift-pill.tsx` + `status-pill.tsx` (client, presentational)

**Analog:** `routines-client.tsx` inline pills (lines 51-59)

**Pill-variant mapping** (from `routines-client.tsx` lines 52-59):
```tsx
<span className="pill-muted font-mono">{r.defaultCron}</span>
<span className={r.defaultPolicy === "yolo" ? "pill-red" : r.defaultPolicy === "strict" ? "pill-green" : "pill-yellow"}>
  {r.defaultPolicy}: {POLICY_DESC[r.defaultPolicy]}
</span>
{!r.installed && (
  <span className="pill-amber inline-flex items-center gap-1">
    <AlertCircle className="w-3 h-3" /> not installed
  </span>
)}
```
Apply verbatim for status/drift pills:
- `status === "draft"` → `pill-muted` text `DRAFT`
- `status === "deployed"` → `pill-green` text `DEPLOYED`
- `status === "drift"` → `pill-amber inline-flex items-center gap-1` + `<RefreshCw className="w-3 h-3" />` + `DRIFT`
- `enabled === false && deployed` → `pill-muted` text `DISABLED`

---

### `dashboard/app/routines/_components/save-to-repo-modal.tsx` (client, two-stage form)

**Analog:** `editor-client.tsx` Section composition + `draft-recovery-banner.tsx` overlay

**Form state + stage transition pattern** (net-new, but compose from editor):

From `editor-client.tsx` lines 67-84 (Section primitive):
```typescript
function Section({ title, desc, children }: { ... }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      <p className="text-xs text-moon-400 mb-3">{desc}</p>
      <div>{children}</div>
    </section>
  );
}
```
Apply inside modal for Review-stage heading + Confirm-stage heading.

**textarea with INPUT_OPT_OUT** (from `editor-client.tsx` lines 88-97, 377-386):
```typescript
const INPUT_OPT_OUT = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-bwignore": "",
} as const;

<textarea
  name="prompt"
  rows={30}
  placeholder="..."
  value={prompt}
  onChange={(e) => setPrompt(e.target.value)}
  className="w-full bg-ink-900 border border-ink-600 rounded-md px-4 py-3 text-sm font-mono resize-y"
  {...INPUT_OPT_OUT}
/>
```
Apply same opt-out bag for commit-message textarea.

**Backdrop + motion modal** (compose from `page-header.tsx` motion usage + UI-SPEC lines 319-342):
```tsx
{open && (
  <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40" onClick={onClose} />
)}
<motion.div
  initial={{ opacity: 0, scale: 0.98 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.18, ease: "easeOut" }}
  className="panel-raised max-w-2xl ..."
>
```

---

### `dashboard/app/_components/health-badge-row.tsx` (client, event-driven)

**Analog:** `dashboard/app/editor/_components/draft-recovery-banner.tsx` (exact — useEffect + storage + SSR guard)

**SSR-safe mount + storage read** (from `draft-recovery-banner.tsx` lines 48-76):
```typescript
export function DraftRecoveryBanner({ onRestore, onStartFresh }: Props) {
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Pitfall #3 SSR guard — localStorage only exists in the browser.
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      if (parsed && parsed.version === 1 && parsed.fields && typeof parsed.updatedAt === "string") {
        setDraft(parsed as StoredDraft);
      }
    } catch {
      /* malformed — ignore */
    }
  }, []);

  if (!draft || dismissed) return null;
  // ... render
}
```
Apply to `HealthBadgeRow`:
- Swap `localStorage` → `sessionStorage` (per 04-UI-SPEC §Health badge row)
- Add TTL check: parse `{checkedAt, statuses}`, compute age, invalidate if > 60s
- On mount: if cache hit AND fresh → render; else `fetch("/api/health/all")` + set cache
- `window.addEventListener("focus", refetchIfStale)` — mirrors `beforeunload` handler pattern from `editor-client.tsx` lines 195-205

**Window event listener pattern** (from `editor-client.tsx` lines 195-205):
```typescript
useEffect(() => {
  function handler(e: BeforeUnloadEvent) {
    if (!dirtyRef.current) return;
    e.preventDefault();
    e.returnValue = "";
  }
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, []);
```
Apply: `window.addEventListener("focus", onFocus)` inside useEffect with `[]` deps; cleanup on unmount.

**Storage quota try/catch guard** (from `editor-client.tsx` lines 164-186):
```typescript
try {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ... }));
} catch {
  /* storage disabled or quota exceeded */
}
```
Apply: wrap every `sessionStorage.setItem` / `getItem` in try/catch — Safari Private Mode + storage-disabled envs never crash the page.

---

### `dashboard/app/_components/health-badge.tsx` (client, presentational)

**Analog:** `routines-client.tsx` pill usage (lines 51-59)

**State → pill variant map** (04-UI-SPEC §Health badge states):
```tsx
const { state, runtime, version, warning, reason } = props;
const RUNTIME_LABEL: Record<Runtime, string> = {
  "claude-routines": "Claude Routines",
  "claude-desktop": "Claude Desktop",
  "codex": "Codex",
  "gemini": "Gemini",
};

if (state === "loading") {
  return (
    <span className="pill-muted inline-flex items-center gap-1">
      <Loader2 className="w-3 h-3 animate-spin" />
      {RUNTIME_LABEL[runtime]} · checking…
    </span>
  );
}
if (state === "green") {
  return (
    <span className="pill-green font-mono">
      {RUNTIME_LABEL[runtime]} · {version}
    </span>
  );
}
// amber, grey analogous to routines-client `!r.installed` branch (line 55-58)
```

**Lucide icon usage** (from `routines-client.tsx` line 4 + 56):
```typescript
import { AlertCircle } from "lucide-react";
// ...
<AlertCircle className="w-3 h-3" />
```
Apply 04-UI-SPEC additions: `Loader2`, `AlertCircle`, `RefreshCw`, `ShieldCheck`.

---

### `dashboard/app/routines/_components/runtime-toggle.tsx` (client, user-action dispatch)

**Analog:** `dashboard/app/routines/routines-client.tsx::Toggle` (DIRECT reuse — do NOT redesign per 04-UI-SPEC line 220)

**Toggle verbatim** (from `routines-client.tsx` lines 86-112):
```typescript
function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-dawn-400" : "bg-ink-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
```
**Directive:** Extract into `runtime-toggle.tsx` verbatim. Add confirm-on-disable dialog wrapper only; do NOT modify the pill geometry.

---

### `dashboard/tests/deploy-state.test.ts` (test, unit + node)

**Analog:** `dashboard/tests/atomic-write.test.ts` (exact — tmp-dir + fs isolation)

**Setup/teardown pattern** (from `atomic-write.test.ts` lines 6-27):
```typescript
describe("atomicWriteBundle", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sw-aw-"));
  });
  afterEach(() => {
    try {
      for (const entry of fs.readdirSync(base)) {
        const p = path.join(base, entry);
        try { fs.chmodSync(p, 0o755); } catch { /* noop */ }
      }
    } catch { /* noop */ }
    fs.rmSync(base, { recursive: true, force: true });
  });
```
Apply: use `makeTempHome()` from `helpers.ts:11-23` so `deployStateFile(slug)` resolves under temp `$HOME/.sleepwalker/deploys/`.

**Dynamic import after env setup** (from `atomic-write.test.ts` lines 30):
```typescript
const { atomicWriteBundle } = await import("@/lib/atomic-write");
```
Apply: `await import("@/lib/deploy-state")` AFTER `makeTempHome()` in beforeEach.

**Atomic + error assertion pattern** (from `atomic-write.test.ts` lines 59-78, 91-109):
```typescript
it("returns collision without creating tmp when finalDir exists", async () => {
  const { atomicWriteBundle } = await import("@/lib/atomic-write");
  const finalDir = path.join(base, "routines-codex", "already-here");
  fs.mkdirSync(finalDir, { recursive: true });
  fs.writeFileSync(path.join(finalDir, "marker"), "existing");

  const res = atomicWriteBundle(finalDir, { "config.json": "{}" });
  expect(res.ok).toBe(false);
  expect(res.errorCode).toBe("collision");
  expect(fs.readFileSync(path.join(finalDir, "marker"), "utf8")).toBe("existing");
});
```
Apply: test that mid-write crash leaves no partial `{slug}.state.json` (simulate via mocking `fs.renameSync` to throw mid-operation; verify no partial file).

---

### `dashboard/tests/deploy-routine-action.test.ts` (test, Server Action + adapter mocks)

**Analog:** `dashboard/tests/save-routine-action.test.ts` + `dashboard/tests/codex.test.ts` (execFile mock composition)

**FormData-free Server Action testing** (from `save-routine-action.test.ts` lines 44-54):
```typescript
let env: ReturnType<typeof makeTempHome>;
let tmpRepo: string;

beforeEach(() => {
  env = makeTempHome();
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-act-"));
  process.chdir(tmpRepo);
});

afterEach(() => {
  process.chdir(ORIG_CWD);
  env.restore();
  fs.rmSync(tmpRepo, { recursive: true, force: true });
});
```
Apply: same `makeTempHome + process.chdir + cleanup` triad. Then `await import("@/app/routines/actions")`.

**Adapter mock pattern** (from `codex.test.ts` lines 29-42):
```typescript
function installExecFileMock(handler: Handler, calls: Array<{ cmd: string; args: string[] }>) {
  vi.doMock("node:child_process", () => ({
    execFile: (cmd: string, args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
      const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as ExecCb;
      calls.push({ cmd, args });
      const { err, stdout = "", stderr = "" } = handler(cmd, args);
      if (typeof cb === "function") cb(err, { stdout, stderr });
      return { unref: () => undefined };
    },
    spawn: (_cmd: string, _args: string[], _opts?: unknown) => ({ unref: () => undefined }),
  }));
}
```
**Prefer module-level `vi.doMock`** on `@/lib/runtime-adapters` to inject a fake adapter that returns controlled `{ok, error}`:
```typescript
vi.doMock("@/lib/runtime-adapters", () => ({
  getAdapter: () => ({
    runtime: "codex",
    deploy: vi.fn(async () => ({ ok: true, artifact: "/tmp/x.plist" })),
    undeploy: vi.fn(async () => ({ ok: true })),
    runNow: vi.fn(async () => ({ ok: true, runId: "x" })),
  }),
}));
```

**Rollback assertion pattern** (new — test that undeploy is called on any step failure):
```typescript
it("rollback on writing failure", async () => {
  const undeploySpy = vi.fn(async () => ({ ok: true }));
  vi.doMock("@/lib/runtime-adapters", () => ({
    getAdapter: () => ({
      deploy: vi.fn(async () => ({ ok: false, error: "plist lint failed" })),
      undeploy: undeploySpy,
      // ...
    }),
  }));
  const { deployRoutine } = await import("@/app/routines/actions");
  const res = await deployRoutine({ runtime: "codex", slug: "test" });
  expect(res.ok).toBe(false);
  expect(undeploySpy).toHaveBeenCalled();
  // Assert no orphaned state file:
  expect(fs.existsSync(path.join(env.home, ".sleepwalker", "deploys", "test.state.json"))).toBe(false);
});
```

---

### `dashboard/tests/deploy-progress-drawer.test.tsx` (test, jsdom + fake timers)

**Analog:** `dashboard/tests/draft-recovery-banner.test.tsx` (exact — `@vitest-environment jsdom`)

**jsdom annotation + cleanup** (from `draft-recovery-banner.test.tsx` lines 1-6):
```typescript
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { DraftRecoveryBanner } from "@/app/editor/_components/draft-recovery-banner";

afterEach(cleanup);
```
Apply verbatim. Import `DeployProgressDrawer` from `@/app/routines/_components/deploy-progress-drawer`.

**Fake timers for polling test** (Vitest built-in — `vi.useFakeTimers()`):
```typescript
it("stops polling on terminal state", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ step: "planning", ... })
    .mockResolvedValueOnce({ step: "verified", verifiedAt: Date.now() });
  globalThis.fetch = fetchMock as typeof fetch;
  render(<DeployProgressDrawer runtime="codex" slug="x" open onClose={() => {}} />);
  await vi.advanceTimersByTimeAsync(500);
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchMock).toHaveBeenCalledTimes(2);  // stops after "verified"
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchMock).toHaveBeenCalledTimes(2);  // no further poll
  vi.useRealTimers();
});
```

---

### `dashboard/tests/save-to-repo.test.ts` (test, real tmp git repo)

**Analog (tmp-dir):** `atomic-write.test.ts`. **Analog (subprocess-assertion):** `codex.test.ts`.

**Real git repo setup** (new, but reuse tmp-dir pattern):
```typescript
import { execSync } from "node:child_process";

beforeEach(() => {
  env = makeTempHome();
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-repo-"));
  process.chdir(tmpRepo);
  execSync("git init", { cwd: tmpRepo });
  execSync('git config user.email "test@test.com"', { cwd: tmpRepo });
  execSync('git config user.name "Test"', { cwd: tmpRepo });
  // Seed initial commit
  fs.writeFileSync(path.join(tmpRepo, "README.md"), "# test");
  execSync("git add README.md && git commit -m 'initial'", { cwd: tmpRepo });
});
```

**Never-push invariant assertion pattern** (from `codex.test.ts` lines 97-105 — command ordering):
```typescript
const cmds = execCalls.map((c) => `${c.cmd} ${c.args[0] ?? ""}`);
expect(cmds).toEqual(
  expect.arrayContaining(["plutil -lint", "launchctl bootout", "launchctl bootstrap"]),
);
```
Apply inverse (never-contains):
```typescript
it("never pushes", async () => {
  const pushSpy = vi.fn();
  vi.doMock("simple-git", () => ({
    simpleGit: () => ({
      add: vi.fn(async () => {}),
      diff: vi.fn(async () => "..."),
      commit: vi.fn(async () => ({ commit: "abc123" })),
      push: pushSpy,  // ← should never be called
      reset: vi.fn(async () => {}),
    }),
  }));
  const { commitSaveToRepo } = await import("@/lib/save-to-repo");
  await commitSaveToRepo({ message: "feat: x" });
  expect(pushSpy).not.toHaveBeenCalled();
});
```

**Never-sweep invariant (out-of-subpath file stays unstaged):**
```typescript
it("never sweeps unrelated uncommitted work", async () => {
  fs.mkdirSync(path.join(tmpRepo, "routines-codex", "x"), { recursive: true });
  fs.writeFileSync(path.join(tmpRepo, "routines-codex", "x", "config.json"), "{}");
  fs.writeFileSync(path.join(tmpRepo, "unrelated.txt"), "dirty");
  const { previewSaveToRepo } = await import("@/lib/save-to-repo");
  await previewSaveToRepo({ runtime: "codex", slug: "x" });
  const status = execSync("git status --porcelain unrelated.txt", { cwd: tmpRepo }).toString();
  expect(status).toContain("?? unrelated.txt");  // still untracked, never staged
});
```

---

### `dashboard/tests/health-route.test.ts` (test, Route Handler + mocked adapters)

**Analog:** `dashboard/tests/adapter-registry.test.ts::healthCheckAll` (lines 56-108)

**Module-level mock of child_process** (from `adapter-registry.test.ts` lines 70-91):
```typescript
vi.doMock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
    const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as (
      err: Error | null,
      out: { stdout: string; stderr: string },
    ) => void;
    if (typeof cb === "function") {
      cb(new Error("probe mocked"), { stdout: "", stderr: "" });
    }
    return { unref: () => undefined };
  },
  spawn: (_cmd: string, _args: string[], _opts?: unknown) => ({
    unref: () => undefined,
  }),
}));
```
Apply: invoke Route Handler's `GET` export directly (Next.js 15 Route Handlers are plain exports):
```typescript
const { GET } = await import("@/app/api/health/all/route");
const res = await GET();
const json = await res.json();
expect(json.statuses).toHaveLength(4);
expect(json.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
```

**Timeout assertion** (new — use fake timers):
```typescript
it("timeout per adapter is 2000ms", async () => {
  vi.useFakeTimers();
  vi.doMock("@/lib/runtime-adapters", () => ({
    healthCheckAll: async () => [/* simulate hanging adapter */],
    ADAPTERS: {
      codex: { healthCheck: () => new Promise(() => {/* never */}), runtime: "codex" },
      // ...
    },
  }));
  const { GET } = await import("@/app/api/health/all/route");
  const resPromise = GET();
  await vi.advanceTimersByTimeAsync(2100);
  const res = await resPromise;
  const json = await res.json();
  const codexStatus = json.statuses.find((s: any) => s.runtime === "codex");
  expect(codexStatus.available).toBe(false);
  expect(codexStatus.reason).toMatch(/timed out/);
});
```

---

### `dashboard/tests/health-badge-row.test.tsx` (test, jsdom + fetch mock)

**Analog:** `dashboard/tests/draft-recovery-banner.test.tsx` (sessionStorage mirrors localStorage stub pattern)

**Storage stub** (from `draft-recovery-banner.test.tsx` lines 14-34):
```typescript
const makeStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  } satisfies Storage;
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: makeStorage(),
});
```
Apply verbatim but for `window.sessionStorage`:
```typescript
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: makeStorage(),
});
```

**Fetch mock** (from `fire-routine.test.ts` — TESTING.md lines 150-159):
```typescript
globalThis.fetch = vi.fn(async (url, init) => {
  return new Response(JSON.stringify({
    statuses: [{ runtime: "codex", available: true, version: "0.118.0" }, /* ... */],
    checkedAt: new Date().toISOString(),
  }), { status: 200 });
}) as typeof fetch;
```

**Click + assertion** (from `draft-recovery-banner.test.tsx` lines 81-96):
```typescript
it("calls onRestore with draft fields when Restore draft clicked", () => {
  window.localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
  const onRestore = vi.fn();
  render(<DraftRecoveryBanner onRestore={onRestore} onStartFresh={() => {}} />);
  fireEvent.click(screen.getByText("Restore draft"));
  expect(onRestore).toHaveBeenCalledTimes(1);
  const arg = onRestore.mock.calls[0][0];
  expect(arg.name).toBe("Test");
});
```
Apply: `fireEvent.focus(window)` to trigger refetch; assert fetch call count increments.

---

### `dashboard/tests/routines-page.test.ts` (test, integration, node)

**Analog:** `dashboard/tests/bundles.test.ts` (lines 1-80 — process.chdir + seed pattern)

**Seed helper** (from `bundles.test.ts` lines 27-37):
```typescript
function seed(
  runtimeDir: string,
  slug: string,
  files: Record<string, string>,
): void {
  const dir = path.join(tmpRepo, runtimeDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}
```
Apply verbatim. Then seed a bundle + write a deploy-state with `verifiedAt` older than bundle mtime → assert `status === "drift"`.

**Drift detection test shape**:
```typescript
it("mtime(bundle) > verifiedAt returns status=drift", async () => {
  seed("routines-codex", "old-deploy", { "config.json": "{}", "prompt.md": "v2" });
  // Write deploy state with verifiedAt from 1 hour ago
  const stateDir = path.join(env.home, ".sleepwalker", "deploys");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "old-deploy.state.json"),
    JSON.stringify({ step: "verified", verifiedAt: Date.now() - 3600_000 }),
  );
  // Touch the prompt.md so its mtime is newer than verifiedAt
  const promptPath = path.join(tmpRepo, "routines-codex", "old-deploy", "prompt.md");
  fs.utimesSync(promptPath, new Date(), new Date());
  const { listRoutines } = await import("@/lib/routines"); // extended in Phase 4
  const routines = await listRoutines();
  const target = routines.find((r) => r.slug === "old-deploy");
  expect(target?.status).toBe("drift");
});
```

---

### `dashboard/app/routines/page.tsx` (MODIFIED — Server Component)

**Analog:** `dashboard/app/editor/page.tsx` (exact — already composes `healthCheckAll` + `listBundles`)

**Full current editor page pattern** (from `editor/page.tsx` lines 1-30):
```typescript
import { healthCheckAll } from "@/lib/runtime-adapters";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";
import { listBundles } from "@/lib/bundles";
import { PageHeader } from "../_components/page-header";
import { EditorClient } from "./editor-client";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const healthArray = await healthCheckAll();
  const healthStatuses = healthArray.reduce<Record<Runtime, HealthStatus>>(
    (acc, status) => { acc[status.runtime] = status; return acc; },
    {} as Record<Runtime, HealthStatus>,
  );
  const existingSlugs = listBundles().map((b) => `${b.runtime}/${b.slug}`);

  return (
    <>
      <PageHeader eyebrow="AUTHORING" title="Author a routine" subtitle="..." />
      <EditorClient healthStatuses={healthStatuses} existingSlugs={existingSlugs} />
    </>
  );
}
```
**For Phase 4**: Extend `listRoutines` (in `dashboard/lib/routines.ts`, existing) to ALSO read deploy-state per bundle + compute drift flag. The page.tsx shape stays the same — only adds per-bundle `status: "draft" | "deployed" | "drift"` and `deployState` props. DO NOT block on `healthCheckAll()` in `/routines` page — health row is on landing page only.

**Preserve v0.1 visual** (per 04-UI-SPEC line 272-288): existing `page.tsx` currently uses `listRoutines()` (v0.1 local-only from `dashboard/lib/routines.ts`). Phase 4 amends `listRoutines` to ALSO return v0.2 codex/gemini via `listBundles` + drift math, while keeping v0.1 routine card visual unchanged.

---

### `dashboard/app/page.tsx` (MODIFIED — landing page)

**Analog:** Existing `dashboard/app/page.tsx` (lines 17-23 — meta slot composition)

**Current meta-slot pattern**:
```typescript
const meta: React.ReactNode[] = [];
if (!githubConfigured) {
  meta.push(<span key="cloud-off" className="pill-amber">cloud queue inactive · configure GitHub in Settings</span>);
}
if (queue.cloudError) {
  meta.push(<span key="cloud-err" className="pill-red">cloud poll failed · {queue.cloudError}</span>);
}

return (
  <>
    <PageHeader
      eyebrow="07:00 / Today"
      title="Morning Queue"
      subtitle={pendingText}
      meta={meta.length > 0 ? meta : null}
    />
    ...
  </>
);
```
**Phase 4 amendment**: prepend `<HealthBadgeRow key="health" />` to `meta` array. Do NOT `await healthCheckAll()` server-side (UI-SPEC line 350: blocking SSR is unacceptable; `HealthBadgeRow` is a client component that fetches on mount).

```typescript
const meta: React.ReactNode[] = [
  <HealthBadgeRow key="health" />,  // client component — fetches /api/health/all on mount
];
if (!githubConfigured) { /* ... existing ... */ }
```

---

## Shared Patterns

### Result-object error returns (no throws for control flow)

**Source:** `dashboard/lib/runtime-adapters/types.ts` lines 45-71 + `dashboard/lib/atomic-write.ts` lines 16-21
**Apply to:** Every new lib function (`deploy-state.ts`, `save-to-repo.ts`) and every new Server Action in `routines/actions.ts`.

```typescript
// Canonical shape — always a discriminated union on `ok`
export interface DeployResult {
  ok: boolean;
  artifact?: string;
  handoffUrl?: string;
  error?: string;
  warning?: string;
}
// OR, TS-stricter discriminated-union:
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### Server-Action step composition with early-return

**Source:** `dashboard/app/editor/actions.ts` lines 139-214
**Apply to:** All 7 new actions in `dashboard/app/routines/actions.ts` — each step returns early on failure BEFORE the next step runs.

Canonical shape:
```typescript
export async function action(args): Promise<ActionResult> {
  // Step 1: validate — return {ok:false, error:"invalid"} if fail
  // Step 2: lookup — return {ok:false, error:"not-found"} if fail
  // Step 3: mutate — return {ok:false, error:"..."} if fail
  // Step 4: persist — return {ok:false, error:"..."} if fail
  return { ok: true, ... };  // only on success
}
```

### Adapter registry dispatch (never direct imports)

**Source:** `dashboard/lib/runtime-adapters/index.ts` lines 19-28
**Apply to:** `deployRoutine`, `runNowRoutine`, `setRoutineEnabled` — ALL go through `getAdapter(runtime)`.

```typescript
import { getAdapter } from "@/lib/runtime-adapters";
const adapter = getAdapter(bundle.runtime);
const result = await adapter.deploy(bundle);
```
Rationale (from CLAUDE.md): "every consumer uses lookups, no direct adapter imports."

### SSR-safe window access

**Source:** `dashboard/app/editor/_components/draft-recovery-banner.tsx` lines 52-60
**Apply to:** `health-badge-row.tsx`, `deploy-progress-drawer.tsx`, `save-to-repo-modal.tsx` — any component touching `window`, `localStorage`, `sessionStorage`, or `document`.

```typescript
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return;  // storage disabled / quota
  }
  // ...
}, []);
```

### makeTempHome test isolation

**Source:** `dashboard/tests/helpers.ts` lines 11-23
**Apply to:** Every new test file that touches `~/.sleepwalker/` or `~/Library/LaunchAgents/`.

```typescript
beforeEach(() => {
  env = makeTempHome();  // overrides HOME → temp dir
});
afterEach(() => {
  env.restore();  // restores HOME + rm -rf temp
});
```
For tests that also need isolated `cwd` (git repo + routines-*), compose with `process.chdir(tmpRepo)` as in `save-routine-action.test.ts` lines 44-54.

### Dynamic import after env setup

**Source:** `dashboard/tests/queue.test.ts` + TESTING.md lines 332-342
**Apply to:** Every test — import modules INSIDE `it()` body AFTER `beforeEach()` has set env vars.

```typescript
it("works", async () => {
  const { fn } = await import("@/lib/module");  // reads HOME lazily
  expect(fn()).toBe("x");
});
```

### Framer-motion inherited from Phase 3

**Source:** `dashboard/app/_components/page-header.tsx` lines 3-30
**Apply to:** `deploy-progress-drawer.tsx` (slide-in), `save-to-repo-modal.tsx` (scale+fade).

```typescript
import { motion } from "framer-motion";
<motion.aside
  initial={{ x: 420 }}
  animate={{ x: 0 }}
  transition={{ type: "spring", damping: 25, stiffness: 200 }}
>
```

### Lucide icon add-ons (no new icon library)

**Source:** `dashboard/app/routines/routines-client.tsx` line 4 + 04-UI-SPEC §Design System
**Apply to:** All Phase 4 components. Allowed additions: `Rocket`, `Play`, `GitCommit`, `RefreshCw`, `Power`, `ShieldCheck`, `AlertTriangle`, `CheckCircle2`, `Loader2`, `ExternalLink`, `FileDiff`.

```typescript
import { Rocket, Play, GitCommit, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
```

### INPUT_OPT_OUT autofill bag

**Source:** `dashboard/app/editor/editor-client.tsx` lines 88-97
**Apply to:** Commit-message textarea in `save-to-repo-modal.tsx` (and any other new input/textarea).

```typescript
const INPUT_OPT_OUT = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-bwignore": "",
} as const;
```

### Path-alias imports only

**Source:** `.planning/codebase/CONVENTIONS.md` §Import Organization
**Apply to:** Every new file. Never use `../` — always `@/lib/...`, `@/app/...`.

---

## No Analog Found

None. All 20 new/modified Phase 4 files have at least a role-match analog in the existing codebase.

The closest to "no analog" is `dashboard/lib/save-to-repo.ts` because `simple-git` + `proper-lockfile` are net-new dependencies. However, the structural pattern (result-object + async subprocess + try/catch rollback) maps directly onto `dashboard/lib/runtime-adapters/launchd-writer.ts::installPlist` (lines 173-207), so planner should treat `launchd-writer.ts` as the structural analog and defer library-specific idioms to simple-git/proper-lockfile docs cited in `04-RESEARCH.md` §Save-to-Repo.

---

## Metadata

**Analog search scope:**
- `dashboard/app/` (all routes + components)
- `dashboard/lib/` (all libs)
- `dashboard/tests/` (all existing tests, 29 files)
- Prior phase CONTEXT.md / RESEARCH.md for convention grounding
- `.planning/codebase/{ARCHITECTURE,CONVENTIONS,TESTING}.md`

**Files scanned:** ~45 existing files read in full or partial; 20 new/modified files classified.

**Pattern extraction date:** 2026-04-19

**Primary analog hub (most-referenced):**
1. `dashboard/app/editor/actions.ts` — Server Action composition template for all 7 new actions
2. `dashboard/lib/atomic-write.ts` — atomic file-I/O + error-code result object
3. `dashboard/app/editor/_components/draft-recovery-banner.tsx` — SSR-safe storage + mount-time fetch
4. `dashboard/app/routines/routines-client.tsx` — card layout + Toggle primitive (preserve, extend)
5. `dashboard/tests/codex.test.ts` — execFile mock + call-ordering assertion pattern
