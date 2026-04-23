import { describe, it, expect } from "vitest";
import { readBundle, listBundles } from "@/lib/bundles";

describe("prebuilt routines sanity", () => {
  it("codex + gemini prebuilt bundles all load", () => {
    for (const runtime of ["codex","gemini"] as const) {
      const slugs = listBundles(runtime).map(b => b.slug);
      expect(slugs).toEqual(expect.arrayContaining(["inbox-triage","pr-reviewer","dependency-upgrader"]));
      for (const slug of ["inbox-triage","pr-reviewer","dependency-upgrader"]) {
        const b = readBundle(runtime, slug);
        expect(b).not.toBeNull();
        expect(b!.name.length).toBeGreaterThan(0);
        expect(b!.schedule).toMatch(/^\S+( \S+){4}$/);
        expect(["green","yellow","red"]).toContain(b!.reversibility);
        expect(b!.budget).toBeGreaterThanOrEqual(1000);
        expect(b!.prompt.length).toBeGreaterThan(200);
      }
    }
  });
});
