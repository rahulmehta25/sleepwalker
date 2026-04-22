"use client";

// Full EditorClient state machine — replaces the Plan 03-06 stub. See
// .planning/phases/03-editor/03-08-PLAN.md for the full contract.
//
// Responsibilities:
//   1. Bind a 7-field form to the React 19 useActionState hook against the
//      saveRoutine Server Action.
//   2. Autosave to localStorage (key `sleepwalker.draft.v1`) after a 500ms
//      debounce; clear on successful save; warn on browser close when dirty.
//   3. Debounced (250ms) client-side secret scan preview via the shared
//      scanForSecrets module — defeats Pitfall #5 (Client/Server Scan Drift)
//      by construction since the server uses the same module.
//   4. Debounced (400ms) slug collision probe via checkSlugAvailability.
//   5. Auto-derive slug from name while untouched; stop once user edits slug.
//   6. Compose the five presentational subcomponents shipped in Plans 03-06
//      and 03-07 (RuntimeRadioGrid, CronPreview, SecretScanPanel,
//      DraftRecoveryBanner, PreviewPanel).
//   7. On a successful claude-desktop save, surface the Q1-smoke manual-add
//      warning string returned by saveRoutine so the user knows Desktop does
//      NOT auto-pickup and they must paste SKILL.md into the Schedule tab.
//
// EDIT-05 (autofill opt-out): every <input> and the <textarea> spread the
// INPUT_OPT_OUT constant which applies the 8 attributes locked in UI-SPEC
// line 255: autocomplete, autocorrect, autocapitalize, spellcheck, data-1p-
// ignore, data-lpignore, data-form-type, data-bwignore.
//
// Pitfall #3 safety: every localStorage call is inside useEffect or a try/
// catch; we never touch window during render.

import { useActionState, useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import {
  checkSlugAvailability,
  saveRoutine,
  type SaveRoutineState,
  type SlugAvailability,
} from "./actions";
import { RuntimeRadioGrid } from "./_components/runtime-radio-grid";
import { CronPreview } from "./_components/cron-preview";
import { SecretScanPanel } from "./_components/secret-scan-panel";
import { DraftRecoveryBanner } from "./_components/draft-recovery-banner";
import { PreviewPanel } from "./_components/preview-panel";
import { scanForSecrets, type SecretMatch } from "@/lib/secret-scan";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

const DRAFT_KEY = "sleepwalker.draft.v1";

interface Props {
  healthStatuses: Record<Runtime, HealthStatus>;
}

// Slug derivation mirrors the Phase 1 SLUG_REGEX (^[a-z][a-z0-9-]{0,63}$):
// lowercase, replace non-alphanumeric runs with a single hyphen, strip leading
// and trailing hyphens, truncate to 64. See 03-UI-SPEC.md §Slug auto-derive.
function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// Duplicated from settings-client.tsx per UI-SPEC line 234 — "do not extract
// yet, Phase 4 or 6 can converge once multiple pages need it."
function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      <p className="text-xs text-moon-400 mb-3">{desc}</p>
      <div>{children}</div>
    </section>
  );
}

// Eight autofill-opt-out attributes per UI-SPEC line 255 (EDIT-05).
// React prop names differ from DOM attributes: `autoComplete` -> autocomplete,
// `spellCheck` -> spellcheck. The `data-*` attrs pass through by design.
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

const INITIAL_SAVE_STATE: SaveRoutineState = { status: "idle" };

export function EditorClient({ healthStatuses }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [runtime, setRuntime] = useState<Runtime | "">("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("0 6 * * 1-5");
  const [reversibility, setReversibility] = useState<
    "green" | "yellow" | "red"
  >("yellow");
  const [budget, setBudget] = useState("40000");

  const [secretMatches, setSecretMatches] = useState<SecretMatch[]>([]);
  const [availability, setAvailability] = useState<SlugAvailability | null>(
    null,
  );

  const [saveState, formAction, isSaving] = useActionState<
    SaveRoutineState,
    FormData
  >(saveRoutine, INITIAL_SAVE_STATE);

  // Refs keep debounce timers stable across renders without causing re-renders.
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-derive slug while the user hasn't touched it. Once the slug input
  // receives a user edit, `slugTouched` flips true and further name edits
  // stop propagating to the slug. A `↺ Re-derive from name` affordance is
  // mentioned in UI-SPEC §Slug auto-derive; we surface it inline.
  function onNameChange(next: string) {
    setName(next);
    if (!slugTouched) setSlug(deriveSlug(next));
  }
  function onSlugChange(next: string) {
    setSlug(next);
    setSlugTouched(true);
  }
  function reDeriveFromName() {
    setSlug(deriveSlug(name));
    setSlugTouched(false);
  }

  // Track dirtiness — used by the beforeunload handler. We look at every
  // user-observable field; pre-populated defaults (schedule, budget) don't
  // count as dirty until the user actually interacts.
  useEffect(() => {
    dirtyRef.current = Boolean(
      name ||
        slug ||
        runtime ||
        prompt ||
        slugTouched ||
        reversibility !== "yellow",
    );
  }, [name, slug, runtime, prompt, slugTouched, reversibility]);

  // Autosave (500ms debounce). UI-SPEC §Autosave + REQUIREMENTS.md EDIT-03.
  // Writing is wrapped in try/catch because Safari Private Mode sets quota
  // to 0 and setItem throws — we silently drop the save rather than crash.
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            fields: {
              name,
              slug,
              runtime,
              prompt,
              schedule,
              reversibility,
              budget,
            },
          }),
        );
      } catch {
        /* storage disabled or quota exceeded */
      }
    }, 500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [name, slug, runtime, prompt, schedule, reversibility, budget]);

  // beforeunload prompt while dirty. The handler is registered once on mount
  // and reads dirtyRef.current at call time so we don't have to re-bind when
  // dirtiness flips.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      // Chrome/Firefox ignore custom messages for security, but the presence
      // of `returnValue` is what triggers the native prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Secret scan preview (250ms debounce). Uses the SAME module as the server
  // action — see dashboard/lib/secret-scan.ts comment about Pitfall #5.
  useEffect(() => {
    if (secretTimer.current) clearTimeout(secretTimer.current);
    secretTimer.current = setTimeout(() => {
      setSecretMatches(scanForSecrets(prompt));
    }, 250);
    return () => {
      if (secretTimer.current) clearTimeout(secretTimer.current);
    };
  }, [prompt]);

  // Slug availability probe (400ms debounce). Server Action returns a
  // SlugAvailability union; we render its message inline under the slug field.
  useEffect(() => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (!runtime || !slug) {
      setAvailability(null);
      return;
    }
    slugTimer.current = setTimeout(() => {
      checkSlugAvailability(runtime as Runtime, slug)
        .then(setAvailability)
        .catch(() => setAvailability(null));
    }, 400);
    return () => {
      if (slugTimer.current) clearTimeout(slugTimer.current);
    };
  }, [runtime, slug]);

  // On successful save, clear the draft from localStorage. dirtyRef also
  // flips false so the beforeunload handler no longer prompts.
  useEffect(() => {
    if (saveState.status === "ok") {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      dirtyRef.current = false;
    }
  }, [saveState]);

  const fieldErr =
    saveState.status === "error" ? saveState.fieldErrors : {};
  const blockedBySecret = secretMatches.length > 0;

  // Wired to DraftRecoveryBanner — replays stored fields into our state.
  function handleDraftRestore(fields: {
    name: string;
    slug: string;
    runtime: string;
    prompt: string;
    schedule: string;
    reversibility: string;
    budget: number | string;
  }) {
    setName(fields.name);
    setSlug(fields.slug);
    setSlugTouched(true);
    setRuntime((fields.runtime || "") as Runtime | "");
    setPrompt(fields.prompt);
    setSchedule(fields.schedule);
    setReversibility(
      (fields.reversibility || "yellow") as "green" | "yellow" | "red",
    );
    setBudget(String(fields.budget ?? "40000"));
  }

  return (
    <div>
      <DraftRecoveryBanner
        onRestore={handleDraftRestore}
        onStartFresh={() => {
          /* Banner clears localStorage itself; nothing else to do. */
        }}
      />

      <div className="flex gap-8">
        <form action={formAction} className="flex-1 max-w-[640px]">
          <Section
            title="Identity"
            desc="A short, human name shown in the dashboard. Slug auto-derives from name."
          >
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="label">NAME</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Morning brief"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  maxLength={60}
                  className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm"
                  {...INPUT_OPT_OUT}
                />
                {fieldErr.name?.[0] && (
                  <span className="text-xs text-signal-red">
                    {fieldErr.name[0]}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="label flex items-center justify-between">
                  <span>SLUG</span>
                  {slugTouched && (
                    <button
                      type="button"
                      onClick={reDeriveFromName}
                      className="text-xs text-aurora-400 normal-case tracking-normal font-normal"
                    >
                      ↺ Re-derive
                    </button>
                  )}
                </span>
                <input
                  type="text"
                  name="slug"
                  placeholder="morning-brief"
                  value={slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm font-mono"
                  {...INPUT_OPT_OUT}
                />
                {fieldErr.slug?.[0] && (
                  <span className="text-xs text-signal-red">
                    {fieldErr.slug[0]}
                  </span>
                )}
                {availability &&
                  availability.available === false &&
                  !fieldErr.slug?.[0] && (
                    <span className="text-xs text-signal-red">
                      {availability.message}
                    </span>
                  )}
                {availability &&
                  availability.available === true &&
                  slug &&
                  runtime && (
                    <span className="text-xs text-signal-green">
                      Available — will write to routines-{runtime}/{slug}/
                    </span>
                  )}
              </label>
            </div>
          </Section>

          <Section
            title="Runtime"
            desc="Where this routine will run. Unavailable runtimes are dimmed."
          >
            <span className="label mb-2 block">RUNTIME</span>
            <RuntimeRadioGrid
              value={runtime}
              onChange={(r) => setRuntime(r)}
              healthStatuses={healthStatuses}
            />
            {fieldErr.runtime?.[0] && (
              <span className="text-xs text-signal-red">
                {fieldErr.runtime[0]}
              </span>
            )}
          </Section>

          <Section
            title="Prompt"
            desc="The full instruction the agent receives. No secrets — use ${VAR} and document in AUTHORING.md."
          >
            <span className="label mb-2 block">PROMPT</span>
            <textarea
              name="prompt"
              rows={30}
              placeholder="You are the overnight brief agent. Read ~/Downloads, summarize new files under 100KB, and write a markdown digest to ~/Desktop/brief-<date>.md."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-ink-900 border border-ink-600 rounded-md px-4 py-3 text-sm font-mono resize-y"
              {...INPUT_OPT_OUT}
            />
            <div
              className={`text-xs text-right mt-1 ${
                prompt.length >= 16000
                  ? "text-signal-red"
                  : prompt.length >= 12800
                    ? "text-signal-amber"
                    : "text-moon-600"
              }`}
            >
              {prompt.length.toLocaleString()} / 16,000
            </div>
            {fieldErr.prompt?.[0] && (
              <span className="text-xs text-signal-red block mt-1">
                {fieldErr.prompt[0]}
              </span>
            )}
            <SecretScanPanel match={secretMatches[0] ?? null} />
          </Section>

          <Section
            title="Schedule"
            desc="Standard 5-field cron. See the preview below."
          >
            <label className="flex flex-col gap-1 max-w-[300px]">
              <span className="label">SCHEDULE</span>
              <input
                type="text"
                name="schedule"
                placeholder="0 6 * * 1-5"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm font-mono"
                {...INPUT_OPT_OUT}
              />
            </label>
            <div className="mt-2">
              <CronPreview expression={schedule} />
            </div>
            {fieldErr.schedule?.[0] && (
              <span className="text-xs text-signal-red block mt-1">
                {fieldErr.schedule[0]}
              </span>
            )}
          </Section>

          <Section
            title="Safety"
            desc="Green = read-only. Yellow = local writes. Red = external effects (deferred for approval overnight)."
          >
            <div className="flex gap-6 flex-wrap">
              <div className="flex flex-col gap-1">
                <span className="label">REVERSIBILITY</span>
                <div className="flex gap-3">
                  {(["green", "yellow", "red"] as const).map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-1 text-sm"
                    >
                      <input
                        type="radio"
                        name="reversibility"
                        value={r}
                        checked={reversibility === r}
                        onChange={() => setReversibility(r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
                {fieldErr.reversibility?.[0] && (
                  <span className="text-xs text-signal-red">
                    {fieldErr.reversibility[0]}
                  </span>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="label">BUDGET (CHARS)</span>
                <input
                  type="number"
                  name="budget"
                  placeholder="40000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  min={1000}
                  max={200000}
                  className="bg-ink-900 border border-ink-600 rounded-md px-3 py-1.5 text-sm w-32"
                  {...INPUT_OPT_OUT}
                />
                {fieldErr.budget?.[0] && (
                  <span className="text-xs text-signal-red">
                    {fieldErr.budget[0]}
                  </span>
                )}
                <p className="text-xs text-moon-400">
                  Approximate character cap. Tokens vary by ±40% depending on output format.
                </p>
              </label>
            </div>
          </Section>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="submit"
              disabled={isSaving || blockedBySecret}
              className={`btn-primary flex items-center gap-2 ${
                blockedBySecret ? "ring-1 ring-signal-red" : ""
              }`}
              title={
                blockedBySecret
                  ? "Remove the matched secret above to save."
                  : undefined
              }
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving…" : "Save routine"}
            </button>
            {saveState.status === "ok" && (
              <span className="pill-green">
                saved {saveState.slug}
              </span>
            )}
            {saveState.status === "ok" && saveState.warning && (
              <span className="pill-amber text-xs max-w-[520px]">
                {saveState.warning}
              </span>
            )}
            {saveState.status === "error" && saveState.formError && (
              <span className="text-xs text-signal-red">
                {saveState.formError}
              </span>
            )}
          </div>
        </form>

        <div className="hidden lg:block">
          <PreviewPanel
            runtime={runtime}
            slug={slug}
            schedule={schedule}
            healthStatus={runtime ? healthStatuses[runtime] : null}
          />
        </div>
      </div>
    </div>
  );
}
