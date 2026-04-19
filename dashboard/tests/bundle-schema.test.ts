// dashboard/tests/bundle-schema.test.ts
//
// Accept / reject matrix for RoutineBundleInput.
//
// Error-message source of truth: .planning/phases/03-editor/03-UI-SPEC.md
// §Validation messages (lines 164-180). Every message assertion here is the
// literal UI string — if zod defaults leak to the UI, these tests fail first.
//
// EDIT-02 + EDIT-04 rows in 03-VALIDATION.md (4, 14, 15, 16, 17).

import { describe, it, expect } from "vitest";
import { RoutineBundleInput } from "@/lib/bundle-schema";

const baseValid = {
  name: "Morning brief",
  slug: "morning-brief",
  runtime: "codex",
  prompt: "You are the overnight brief agent.",
  schedule: "0 6 * * 1-5",
  reversibility: "yellow",
  budget: "40000",
};

describe("RoutineBundleInput — accept", () => {
  it("parses a valid full input and coerces budget to number", () => {
    const r = RoutineBundleInput.safeParse(baseValid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.budget).toBe(40000);
      expect(typeof r.data.budget).toBe("number");
    }
  });

  it("accepts v0.1-prefixed slug sleepwalker-inbox-triage", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      slug: "sleepwalker-inbox-triage",
    });
    expect(r.success).toBe(true);
  });

  it.each(["claude-routines", "claude-desktop", "codex", "gemini"])(
    "accepts runtime %s",
    (runtime) => {
      const r = RoutineBundleInput.safeParse({ ...baseValid, runtime });
      expect(r.success).toBe(true);
    },
  );

  it.each(["green", "yellow", "red"])(
    "accepts reversibility %s",
    (reversibility) => {
      const r = RoutineBundleInput.safeParse({ ...baseValid, reversibility });
      expect(r.success).toBe(true);
    },
  );

  it("accepts a 5-field cron", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      schedule: "0 6 * * 1-5",
    });
    expect(r.success).toBe(true);
  });
});

describe("RoutineBundleInput — reject slug (EDIT-04)", () => {
  const invalidSlugs = ["../../../evil", "Has Spaces", "UPPERCASE", "1-start"];

  it.each(invalidSlugs)("rejects slug %s with regex message", (slug) => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, slug });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors.slug?.[0] ?? "";
      expect(msg).toContain("Slug must match ^[a-z][a-z0-9-]{0,63}$");
    }
  });
});

describe("RoutineBundleInput — reject other fields", () => {
  it("rejects empty name with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, name: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.name?.[0]).toBe(
        "Name is required.",
      );
    }
  });

  it("rejects 61-char name with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      name: "x".repeat(61),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.name?.[0]).toBe(
        "Name must be 60 characters or fewer.",
      );
    }
  });

  it("rejects unknown runtime with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, runtime: "amp" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.runtime?.[0]).toBe(
        "Pick a runtime.",
      );
    }
  });

  it("rejects empty prompt with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, prompt: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.prompt?.[0]).toBe(
        "Prompt is required.",
      );
    }
  });

  it("rejects 16_001-char prompt with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      prompt: "x".repeat(16_001),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.prompt?.[0]).toBe(
        "Prompt exceeds 16,000 characters. Split into multiple routines or reduce scope.",
      );
    }
  });

  it("rejects 4-field cron with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      schedule: "0 6 * *",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.schedule?.[0]).toBe(
        "Invalid cron — 5 fields required (minute hour day month weekday).",
      );
    }
  });

  it("rejects empty schedule with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, schedule: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.schedule?.[0]).toBe(
        "Invalid cron — 5 fields required (minute hour day month weekday).",
      );
    }
  });

  it("rejects unknown reversibility with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      reversibility: "purple",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.reversibility?.[0]).toBe(
        "Pick a reversibility level.",
      );
    }
  });

  it("rejects budget below 1000 with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({ ...baseValid, budget: "500" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.budget?.[0]).toBe(
        "Budget must be at least 1,000 characters.",
      );
    }
  });

  it("rejects budget above 200000 with UI-SPEC message", () => {
    const r = RoutineBundleInput.safeParse({
      ...baseValid,
      budget: "300000",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.budget?.[0]).toBe(
        "Budget above 200,000 characters — consider splitting into multiple routines.",
      );
    }
  });
});
