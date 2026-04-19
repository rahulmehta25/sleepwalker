"use server";
// dashboard/app/editor/actions.ts
//
// Server Actions for the editor route. Two exports:
//   - saveRoutine(prevState, formData) — React 19 useActionState-compatible
//     signature. Composes the Wave 0/1 primitives in this LOCKED order:
//        1. zod validation       (@/lib/bundle-schema)
//        2. server-authoritative secret scan (@/lib/secret-scan)
//        3. cross-runtime slug collision pre-flight (@/lib/bundles)
//        4. atomic directory-swap write (@/lib/atomic-write)
//     Any step that fails returns a `{status: "error", ...}` discriminated
//     union BEFORE the next step runs. In particular, a secret match means
//     atomicWriteBundle is never called — disk is never touched.
//
//   - checkSlugAvailability(runtime, slug) — async utility for the client's
//     debounced on-blur collision preview. Never writes anything.
//
// Authoritative sources:
//   - 03-RESEARCH.md §Server Action Pattern (lines 663-729)
//   - 03-UI-SPEC.md §Validation messages + §Slug collision + §Secret detected
//   - 02-SUMMARY.md Q1 smoke — Claude Desktop does NOT watch
//     ~/.claude/scheduled-tasks/ at 1.3109.0; saveRoutine returns a warning
//     so the editor can show the manual-add instruction after a successful
//     claude-desktop save.

import path from "node:path";
import matter from "gray-matter";

import { RoutineBundleInput } from "@/lib/bundle-schema";
import { scanForSecrets } from "@/lib/secret-scan";
import { hasBundleAnyRuntime, RUNTIME_ROOT } from "@/lib/bundles";
import { atomicWriteBundle } from "@/lib/atomic-write";
import type { Runtime } from "@/lib/runtime-adapters/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by saveRoutine. Wire-compatible with
 * React 19's useActionState — the UI rerenders off `status`.
 */
export type SaveRoutineState =
  | { status: "idle" }
  | {
      status: "ok";
      bundlePath: string;
      runtime: Runtime;
      slug: string;
      /**
       * Non-blocking advisory for claude-desktop saves. Claude Desktop
       * 1.3109.0 does NOT watch ~/.claude/scheduled-tasks/, so a
       * successful SKILL.md write is not sufficient to deploy the
       * routine — the user must paste it into Desktop's Schedule tab
       * manually. Populated ONLY for runtime === "claude-desktop".
       */
      warning?: string;
    }
  | {
      status: "error";
      fieldErrors: Record<string, string[]>;
      formError?: string;
    };

/**
 * Shape returned by checkSlugAvailability. Consumed by the editor
 * client's debounced preview; message is the exact UI-SPEC copy.
 */
export type SlugAvailability =
  | { available: true }
  | { available: false; existsIn: Runtime; message: string };

// ---------------------------------------------------------------------------
// UI-SPEC copy (authoritative — do not change without updating 03-UI-SPEC.md)
// ---------------------------------------------------------------------------

function secretMsg(name: string, line: number, column: number): string {
  return `Prompt appears to contain a secret (${name} at line ${line}, column ${column}). Replace with \${VAR} and document the env var in AUTHORING.md. Save blocked.`;
}

function sameRuntimeCollisionMsg(runtime: Runtime, slug: string): string {
  return `A routine at ${RUNTIME_ROOT[runtime]}/${slug}/ already exists. Choose a different slug.`;
}

function crossRuntimeCollisionMsg(otherRuntime: Runtime, slug: string): string {
  return `A ${otherRuntime} routine with slug ${slug} exists. Slugs must be unique across runtimes.`;
}

const CLAUDE_DESKTOP_MANUAL_ADD_WARNING =
  "Claude Desktop does not auto-detect routines. Open Desktop → Schedule → Add and paste the generated SKILL.md content.";

// ---------------------------------------------------------------------------
// File-set builders
// ---------------------------------------------------------------------------

type BuildInput = {
  runtime: Runtime;
  name: string;
  slug: string;
  prompt: string;
  schedule: string;
  reversibility: "green" | "yellow" | "red";
  budget: number;
};

function buildFiles(input: BuildInput): Record<string, string> {
  if (
    input.runtime === "claude-desktop" ||
    input.runtime === "claude-routines"
  ) {
    // v0.1 shape: SKILL.md with YAML frontmatter + markdown body prompt.
    const frontmatter = {
      name: input.name,
      schedule: input.schedule,
      reversibility: input.reversibility,
      budget: input.budget,
    };
    return { "SKILL.md": matter.stringify(input.prompt, frontmatter) };
  }
  // v0.2 codex / gemini shape: config.json + prompt.md.
  const cfg = {
    name: input.name,
    runtime: input.runtime,
    slug: input.slug,
    schedule: input.schedule,
    reversibility: input.reversibility,
    budget: input.budget,
  };
  return {
    "config.json": JSON.stringify(cfg, null, 2),
    "prompt.md": input.prompt,
  };
}

// ---------------------------------------------------------------------------
// saveRoutine
// ---------------------------------------------------------------------------

export async function saveRoutine(
  _prevState: SaveRoutineState,
  formData: FormData,
): Promise<SaveRoutineState> {
  // Step 1 — FormData coercion + zod validation. Zod's `z.coerce.number()`
  // on `budget` handles the string→number conversion inherent to FormData.
  const raw = Object.fromEntries(formData);
  const parsed = RoutineBundleInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<
      string,
      string[]
    >;
    return { status: "error", fieldErrors };
  }
  const input = parsed.data;

  // Step 2 — Authoritative server-side secret scan. Client may also run
  // this same scanner (Pitfall #5 defeated by single module), but this
  // invocation is the one that actually BLOCKS the write.
  const matches = scanForSecrets(input.prompt);
  if (matches.length > 0) {
    const m = matches[0];
    return {
      status: "error",
      fieldErrors: {
        prompt: [secretMsg(m.patternName, m.line, m.column)],
      },
    };
  }

  // Step 3 — Cross-runtime slug collision pre-flight.
  const occupiedBy = hasBundleAnyRuntime(input.slug);
  if (occupiedBy) {
    const message =
      occupiedBy === input.runtime
        ? sameRuntimeCollisionMsg(input.runtime, input.slug)
        : crossRuntimeCollisionMsg(occupiedBy, input.slug);
    return { status: "error", fieldErrors: { slug: [message] } };
  }

  // Step 4 — Build file set + atomic directory-swap write.
  const finalDir = path.join(RUNTIME_ROOT[input.runtime], input.slug);
  const files = buildFiles(input);
  const result = atomicWriteBundle(finalDir, files);
  if (!result.ok) {
    if (result.errorCode === "collision") {
      // TOCTOU backstop: hasBundleAnyRuntime said "clear" but another
      // process raced us to the directory. Map to the same UI copy the
      // pre-flight check would have used.
      return {
        status: "error",
        fieldErrors: {
          slug: [sameRuntimeCollisionMsg(input.runtime, input.slug)],
        },
      };
    }
    return {
      status: "error",
      fieldErrors: {},
      formError: result.error ?? "Write failed.",
    };
  }

  // Success. claude-desktop adds the manual-add advisory; all other
  // runtimes write + schedule without user intervention.
  const base: Extract<SaveRoutineState, { status: "ok" }> = {
    status: "ok",
    bundlePath: result.path!,
    runtime: input.runtime,
    slug: input.slug,
  };
  if (input.runtime === "claude-desktop") {
    base.warning = CLAUDE_DESKTOP_MANUAL_ADD_WARNING;
  }
  return base;
}

// ---------------------------------------------------------------------------
// checkSlugAvailability
// ---------------------------------------------------------------------------

/**
 * Async availability probe for the editor's debounced on-blur preview.
 * Permissive on empty slug (zod will surface the real error at save time).
 * Never writes anything; read-only against the routines-* directories.
 */
export async function checkSlugAvailability(
  runtime: Runtime,
  slug: string,
): Promise<SlugAvailability> {
  if (!slug) return { available: true };
  const occupiedBy = hasBundleAnyRuntime(slug);
  if (!occupiedBy) return { available: true };
  const message =
    occupiedBy === runtime
      ? sameRuntimeCollisionMsg(runtime, slug)
      : crossRuntimeCollisionMsg(occupiedBy, slug);
  return { available: false, existsIn: occupiedBy, message };
}
