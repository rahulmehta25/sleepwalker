import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { RoutineBundleInput } from "@/lib/bundle-schema";

const RUNTIMES = [
  "claude-routines",
  "claude-desktop",
  "codex",
  "gemini",
] as const;

type Runtime = (typeof RUNTIMES)[number];

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,63}$/;

function templatePath(runtime: Runtime): string {
  return path.join(
    __dirname,
    "..",
    "..",
    "templates",
    `routine-${runtime}.md`,
  );
}

function assertRoundTrip(runtime: Runtime): void {
  const p = templatePath(runtime);
  expect(fs.existsSync(p)).toBe(true);

  const raw = fs.readFileSync(p, "utf8");
  const { data, content } = matter(raw);

  // Per-runtime frontmatter sanity
  expect(data.runtime).toBe(runtime);
  expect(typeof data.name).toBe("string");
  expect((data.name as string).length).toBeGreaterThan(0);
  expect(typeof data.slug).toBe("string");
  expect(SLUG_REGEX.test(data.slug as string)).toBe(true);
  expect(typeof data.schedule).toBe("string");
  expect((data.schedule as string).trim().split(/\s+/).length).toBe(5);
  expect(["green", "yellow", "red"]).toContain(data.reversibility);
  expect(typeof data.budget).toBe("number");
  expect(Number.isFinite(data.budget as number)).toBe(true);

  // v0.2 fleet marker present in body
  expect(content).toMatch(
    new RegExp(`\\[sleepwalker:${runtime}/[a-z][a-z0-9-]*\\]`),
  );

  // Full zod round-trip — this is the load-bearing assertion
  const formLike = { ...data, prompt: content.trim() };
  const parsed = RoutineBundleInput.safeParse(formLike);
  if (!parsed.success) {
    throw new Error(
      `templates/routine-${runtime}.md failed RoutineBundleInput.safeParse:\n` +
        JSON.stringify(parsed.error.issues, null, 2),
    );
  }
  expect(parsed.success).toBe(true);
}

describe("DOCS-02 templates round-trip through gray-matter + zod", () => {
  it("templates/routine-claude-routines.md parses + validates against RoutineBundleInput", () => {
    assertRoundTrip("claude-routines");
  });

  it("templates/routine-claude-desktop.md parses + validates against RoutineBundleInput", () => {
    assertRoundTrip("claude-desktop");
  });

  it("templates/routine-codex.md parses + validates against RoutineBundleInput", () => {
    assertRoundTrip("codex");
  });

  it("templates/routine-gemini.md parses + validates against RoutineBundleInput", () => {
    assertRoundTrip("gemini");
  });

  it("no template uses the v0.1 SKILL.md description key (negative invariant)", () => {
    for (const runtime of RUNTIMES) {
      const raw = fs.readFileSync(templatePath(runtime), "utf8");
      const { data } = matter(raw);
      // v0.1 SKILL.md uses {name, description}; v0.2 templates MUST NOT carry
      // description — using it by accident would signal a regression back to
      // v0.1 SKILL.md casing which the zod schema doesn't accept.
      expect((data as Record<string, unknown>).description).toBeUndefined();
    }
  });
});
