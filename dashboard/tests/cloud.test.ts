import { describe, it, expect } from "vitest";
import path from "node:path";

// cloud.ts reads from path.resolve(process.cwd(), "..", "routines-cloud")
// which means we need to chdir into dashboard/ for it to find ../routines-cloud
const ORIG_CWD = process.cwd();
const DASHBOARD_DIR = path.resolve(__dirname, "..");

describe("cloud routine bundles", () => {
  beforeAll(() => process.chdir(DASHBOARD_DIR));
  afterAll(() => process.chdir(ORIG_CWD));

  it("listCloudRoutines finds all 9 bundles (8 production + 1 integration test)", async () => {
    const { listCloudRoutines } = await import("@/lib/cloud");
    const routines = listCloudRoutines();
    expect(routines.length).toBe(9);
    const ids = routines.map((r) => r.id).sort();
    expect(ids).toEqual([
      "_test-zen",
      "alert-triage",
      "dead-code-pruner",
      "dependency-upgrader",
      "doc-drift-fixer",
      "library-port",
      "morning-brief",
      "pr-reviewer",
      "test-coverage-filler",
    ]);
  });

  it("each routine has required fields", async () => {
    const { listCloudRoutines } = await import("@/lib/cloud");
    for (const r of listCloudRoutines()) {
      expect(r.name).toBeTruthy();
      expect(r.tier).toBe("C");
      expect(r.triggers.length).toBeGreaterThanOrEqual(1);
      expect(r.prompt.length).toBeGreaterThan(100);
      expect(r.scheduleDeeplink).toContain("claude.ai/code/routines");
    }
  });

  it("schedule triggers have valid cron expressions", async () => {
    const { listCloudRoutines } = await import("@/lib/cloud");
    for (const r of listCloudRoutines()) {
      for (const t of r.triggers) {
        if (t.type === "schedule") {
          expect(t.cron).toMatch(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/);
        }
      }
    }
  });

  it("getCloudRoutine returns null for unknown id", async () => {
    const { getCloudRoutine } = await import("@/lib/cloud");
    expect(getCloudRoutine("does-not-exist")).toBeNull();
  });
});

// Vitest globals for beforeAll/afterAll
import { beforeAll, afterAll } from "vitest";
