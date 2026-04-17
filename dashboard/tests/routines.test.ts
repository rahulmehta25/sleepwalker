import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

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

  it("listRoutines returns the 6 local templates from the repo (uninstalled)", async () => {
    const { listRoutines } = await import("@/lib/routines");
    const list = listRoutines();
    expect(list.length).toBe(6);
    expect(list.every((r) => !r.installed)).toBe(true);
    expect(list.every((r) => r.source === "repo-template")).toBe(true);
    expect(list.map((r) => r.id).sort()).toEqual([
      "sleepwalker-calendar-prep",
      "sleepwalker-disk-cleanup",
      "sleepwalker-downloads-organizer",
      "sleepwalker-inbox-triage",
      "sleepwalker-screenshot-reviewer",
      "sleepwalker-standup-writer",
    ]);
  });

  it("marks routines as installed when present in ~/.claude/scheduled-tasks/", async () => {
    const installed = path.join(env.home, ".claude", "scheduled-tasks", "sleepwalker-inbox-triage");
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, "SKILL.md"), "---\nname: sleepwalker-inbox-triage\ndescription: x\n---\n");

    const { listRoutines } = await import("@/lib/routines");
    const list = listRoutines();
    const triager = list.find((r) => r.id === "sleepwalker-inbox-triage");
    expect(triager?.installed).toBe(true);
  });

  it("setEnabled updates settings.json", async () => {
    const { setEnabled } = await import("@/lib/routines");
    const { readSettings } = await import("@/lib/settings");
    setEnabled("sleepwalker-inbox-triage", true);
    expect(readSettings().enabled_routines).toContain("sleepwalker-inbox-triage");
    setEnabled("sleepwalker-inbox-triage", false);
    expect(readSettings().enabled_routines).not.toContain("sleepwalker-inbox-triage");
  });
});
