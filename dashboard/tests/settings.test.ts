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

  it("readSettings returns defaults when no file exists", async () => {
    const { readSettings } = await import("@/lib/settings");
    const s = readSettings();
    expect(s.sleep_window.start_hour).toBe(23);
    expect(s.sleep_window.end_hour).toBe(7);
    expect(s.tracked_repos).toEqual([]);
  });

  it("writeSettings merges partial updates with existing", async () => {
    const { writeSettings, readSettings } = await import("@/lib/settings");
    writeSettings({ tracked_repos: ["a/b"] });
    expect(readSettings().tracked_repos).toEqual(["a/b"]);
    writeSettings({ enabled_routines: ["sleepwalker-x"] });
    expect(readSettings().tracked_repos).toEqual(["a/b"]); // preserved
    expect(readSettings().enabled_routines).toEqual(["sleepwalker-x"]);
  });

  it("writeGithubToken writes to the right path with mode 600", async () => {
    const { writeGithubToken, readGithubToken } = await import("@/lib/settings");
    writeGithubToken("ghp_test_token");
    expect(readGithubToken()).toBe("ghp_test_token");
    const stat = fs.statSync(path.join(dir, "github-token"));
    // Mode bits: lower 9 bits == permissions
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("clearGithubToken removes the file", async () => {
    const { writeGithubToken, clearGithubToken, readGithubToken } = await import("@/lib/settings");
    writeGithubToken("test");
    clearGithubToken();
    expect(readGithubToken()).toBeNull();
  });

  it("hasGithubConfig returns true only when token + tracked_repos both set", async () => {
    const { writeGithubToken, writeSettings, hasGithubConfig } = await import("@/lib/settings");
    expect(hasGithubConfig()).toBe(false);
    writeGithubToken("ghp_test");
    expect(hasGithubConfig()).toBe(false); // no repos
    writeSettings({ tracked_repos: ["a/b"] });
    expect(hasGithubConfig()).toBe(true);
  });

  it("readSettings tolerates corrupt JSON by returning defaults", async () => {
    fs.writeFileSync(path.join(dir, "settings.json"), "{ this is broken");
    const { readSettings } = await import("@/lib/settings");
    expect(readSettings().sleep_window.start_hour).toBe(23);
  });
});
