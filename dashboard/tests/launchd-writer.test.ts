import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { makeTempHome } from "./helpers";

describe("generatePlist", () => {
  it("produces a valid plist for calendar schedule (minute=0, hour=6)", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.codex.morning-brief",
      programArguments: ["/abs/bin/sleepwalker-run-cli", "codex", "morning-brief"],
      schedule: { kind: "calendar", minute: 0, hour: 6 },
      stdoutPath: "/tmp/out.log",
      stderrPath: "/tmp/err.log",
    });
    expect(xml).toContain('<key>Label</key><string>com.sleepwalker.codex.morning-brief</string>');
    expect(xml).toContain('<string>codex</string>');
    expect(xml).toContain('<string>morning-brief</string>');
    expect(xml).toContain('<key>StartCalendarInterval</key>');
    expect(xml).toContain('<key>Hour</key><integer>6</integer>');
    expect(xml).toContain('<key>Minute</key><integer>0</integer>');
    expect(xml).toContain('<key>ThrottleInterval</key><integer>300</integer>');
    expect(xml).toContain('<key>RunAtLoad</key><false/>');
  });

  it("emits StartInterval (not StartCalendarInterval) for interval schedule", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.gemini.hourly",
      programArguments: ["/bin/runner", "gemini", "hourly"],
      schedule: { kind: "interval", seconds: 3600 },
      stdoutPath: "/o",
      stderrPath: "/e",
    });
    expect(xml).toContain('<key>StartInterval</key><integer>3600</integer>');
    expect(xml).not.toContain('<key>StartCalendarInterval</key>');
  });

  it("emits <array> (not <dict>) for calendar-array schedule", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.codex.weekdays",
      programArguments: ["/bin/runner"],
      schedule: { kind: "calendar-array", entries: [
        { hour: 9, weekday: 1 }, { hour: 9, weekday: 5 },
      ] },
      stdoutPath: "/o",
      stderrPath: "/e",
    });
    // After StartCalendarInterval must come <array>, NOT <dict>
    expect(xml).toMatch(/<key>StartCalendarInterval<\/key>\s*<array>/);
    expect(xml).toContain('<key>Weekday</key><integer>1</integer>');
    expect(xml).toContain('<key>Weekday</key><integer>5</integer>');
  });

  it("XML-escapes & < > in programArguments and paths", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const xml = generatePlist({
      label: "com.sleepwalker.codex.test",
      programArguments: ["/path/with & ampersand/bin"],
      schedule: { kind: "interval", seconds: 60 },
      stdoutPath: "/path/with<angle>.out",
      stderrPath: "/err.err",
    });
    expect(xml).toContain("with &amp; ampersand");
    expect(xml).toContain("with&lt;angle&gt;.out");
    expect(xml).not.toMatch(/with & ampersand/); // raw ampersand would be a parse error
  });

  it("omits EnvironmentVariables key when undefined; includes it when provided", async () => {
    const { generatePlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const noEnv = generatePlist({
      label: "l", programArguments: ["/b"], schedule: { kind: "interval", seconds: 1 },
      stdoutPath: "/o", stderrPath: "/e",
    });
    expect(noEnv).not.toContain("<key>EnvironmentVariables</key>");

    const withEnv = generatePlist({
      label: "l", programArguments: ["/b"], schedule: { kind: "interval", seconds: 1 },
      stdoutPath: "/o", stderrPath: "/e",
      environmentVariables: { PATH: "/opt/homebrew/bin:/usr/bin", NO_COLOR: "1" },
    });
    expect(withEnv).toContain("<key>EnvironmentVariables</key>");
    expect(withEnv).toContain("<key>PATH</key><string>/opt/homebrew/bin:/usr/bin</string>");
    expect(withEnv).toContain("<key>NO_COLOR</key><string>1</string>");
  });
});

describe("installPlist + uninstallPlist", () => {
  let env: ReturnType<typeof makeTempHome>;
  const execCalls: Array<{ cmd: string; args: string[] }> = [];

  beforeEach(() => {
    env = makeTempHome();
    execCalls.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("installPlist writes plist, runs plutil -lint, bootout, bootstrap in order", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (cmd: string, args: string[], cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
        execCalls.push({ cmd, args });
        if (cmd === "plutil") cb(null, { stdout: "OK", stderr: "" });
        else if (cmd === "launchctl" && args[0] === "bootout") cb(new Error("Not loaded"), { stdout: "", stderr: "" });
        else if (cmd === "launchctl" && args[0] === "bootstrap") cb(null, { stdout: "", stderr: "" });
        else cb(new Error(`unexpected cmd ${cmd}`), { stdout: "", stderr: "" });
      },
    }));

    const { installPlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const result = await installPlist({
      label: "com.sleepwalker.codex.test-install",
      programArguments: ["/bin/runner", "codex", "test-install"],
      schedule: { kind: "interval", seconds: 300 },
      stdoutPath: path.join(env.home, "out.log"),
      stderrPath: path.join(env.home, "err.log"),
    });

    expect(result.ok).toBe(true);
    expect(result.plistPath).toContain("Library/LaunchAgents");
    // Plist file was actually written to disk
    const stat = await fs.stat(result.plistPath!);
    expect(stat.mode & 0o777).toBe(0o644);
    // Call order: plutil first, then bootout, then bootstrap
    const cmds = execCalls.map((c) => `${c.cmd} ${c.args[0] ?? ""}`);
    expect(cmds[0]).toBe("plutil -lint");
    expect(cmds).toEqual(expect.arrayContaining(["launchctl bootout", "launchctl bootstrap"]));
    const bootoutIdx = cmds.indexOf("launchctl bootout");
    const bootstrapIdx = cmds.indexOf("launchctl bootstrap");
    expect(bootoutIdx).toBeLessThan(bootstrapIdx);
  });

  it("installPlist returns {ok:false, lintOutput} on plutil -lint failure and unlinks bad plist", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (cmd: string, _args: string[], cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
        if (cmd === "plutil") {
          const err = new Error("lint failed") as Error & { stderr: string };
          err.stderr = "line 3: malformed key";
          cb(err, { stdout: "", stderr: "line 3: malformed key" });
        } else cb(null, { stdout: "", stderr: "" });
      },
    }));

    const { installPlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const result = await installPlist({
      label: "com.sleepwalker.codex.test-lint-fail",
      programArguments: ["/bin/runner"],
      schedule: { kind: "interval", seconds: 60 },
      stdoutPath: "/o", stderrPath: "/e",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("plist lint failed");
    expect(result.lintOutput).toContain("line 3: malformed key");
    // plist file was unlinked (rollback)
    const plistPath = path.join(env.home, "Library/LaunchAgents/com.sleepwalker.codex.test-lint-fail.plist");
    await expect(fs.stat(plistPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installPlist rolls back (unlinks plist) when bootstrap fails", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (cmd: string, args: string[], cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
        if (cmd === "plutil") cb(null, { stdout: "OK", stderr: "" });
        else if (cmd === "launchctl" && args[0] === "bootout") cb(new Error("Not loaded"), { stdout: "", stderr: "" });
        else if (cmd === "launchctl" && args[0] === "bootstrap") cb(new Error("bootstrap failed: EX_CONFIG"), { stdout: "", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
      },
    }));

    const { installPlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const result = await installPlist({
      label: "com.sleepwalker.codex.test-bootstrap-fail",
      programArguments: ["/bin/runner"],
      schedule: { kind: "interval", seconds: 60 },
      stdoutPath: "/o", stderrPath: "/e",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("bootstrap failed");
    // plist was unlinked on bootstrap-failure rollback
    const plistPath = path.join(env.home, "Library/LaunchAgents/com.sleepwalker.codex.test-bootstrap-fail.plist");
    await expect(fs.stat(plistPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uninstallPlist is idempotent when plist is already absent", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (_cmd: string, _args: string[], cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
        // bootout on a never-installed plist: launchctl returns non-zero but we ignore
        cb(new Error("Not loaded"), { stdout: "", stderr: "" });
      },
    }));
    const { uninstallPlist } = await import("@/lib/runtime-adapters/launchd-writer");
    const result = await uninstallPlist("com.sleepwalker.codex.never-installed");
    expect(result.ok).toBe(true);
  });
});
