// dashboard/lib/bundle-schema.ts
//
// Zod schema for the write-side RoutineBundle input (what the editor form
// submits). Differs from RoutineBundle in @/lib/runtime-adapters/types by
// omitting bundlePath (computed server-side) and by typing budget as string
// input coerced to number (FormData carries everything as string).
//
// Authoritative shape: .planning/phases/03-editor/03-RESEARCH.md §Example 1.
// Error messages: .planning/phases/03-editor/03-UI-SPEC.md §Validation
// messages (lines 164-180) — every message override below is the LITERAL UI
// string; zod defaults must never leak to the editor.
//
// SLUG_REGEX is duplicated (not imported from runtime-adapters/slug) so this
// module has zero Phase-2 coupling and could ship independently if needed.
// The regex itself is the frozen Phase 1 contract — see slug.ts line 26.

import { z } from "zod";

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

export const RoutineBundleInput = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(60, "Name must be 60 characters or fewer."),
  slug: z
    .string()
    .min(1, "Slug is required.")
    .regex(
      SLUG_REGEX,
      "Slug must match ^[a-z][a-z0-9-]{0,63}$ — lowercase letters, digits, and hyphens, starting with a letter.",
    ),
  runtime: z.enum(["claude-routines", "claude-desktop", "codex", "gemini"], {
    message: "Pick a runtime.",
  }),
  prompt: z
    .string()
    .min(1, "Prompt is required.")
    .max(
      16_000,
      "Prompt exceeds 16,000 characters. Split into multiple routines or reduce scope.",
    ),
  schedule: z
    .string()
    .min(
      1,
      "Invalid cron — 5 fields required (minute hour day month weekday).",
    )
    .refine((s) => s.trim().split(/\s+/).length === 5, {
      message:
        "Invalid cron — 5 fields required (minute hour day month weekday).",
    }),
  reversibility: z.enum(["green", "yellow", "red"], {
    message: "Pick a reversibility level.",
  }),
  budget: z.coerce
    .number()
    .int()
    .min(1_000, "Budget must be at least 1,000 characters.")
    .max(
      200_000,
      "Budget above 200,000 characters — consider splitting into multiple routines.",
    ),
});

export type RoutineBundleInput = z.infer<typeof RoutineBundleInput>;
