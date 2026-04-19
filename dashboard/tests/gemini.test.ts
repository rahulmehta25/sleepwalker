import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsSync from "node:fs";
import path from "node:path";
import { makeTempHome } from "./helpers";

function fixtureBundle(
  slug: string,
): import("@/lib/runtime-adapters/types").RoutineBundle {
  return {
    slug,
    runtime: "gemini",
    name: slug,
    prompt: `[sleepwalker:gemini/${slug}]\nDo it.`,
    schedule: "0 7 * * *",
    reversibility: "yellow",
    budget: 40000,
    bundlePath: `/tmp/routines-gemini/${slug}`,
  };
}

function writeSettings(home: string, contents: object): void {
  fsSync.mkdirSync(path.join(home, ".sleepwalker"), { recursive: true });
  fsSync.writeFileSync(
    path.join(home, ".sleepwalker/settings.json"),
    JSON.stringify(contents),
  );
}

/**
 * execFile mock that handles both overloads:
 *   execFile(cmd, args, cb)
 *   execFile(cmd, args, opts, cb)
 * Returns a minimal child-like object with .unref() so spawn()-style callers
 * don't crash even when we're mocking execFile here. Matches codex.test.ts shape.
 */
type ExecCb = (err: Error | null, out: { stdout: string; stderr: string }) => void;
type Handler = (
  cmd: string,
  args: string[],
) => { err: Error | null; stdout?: string; stderr?: string };

function installExecFileMock(
  handler: Handler,
  calls: Array<{ cmd: string; args: string[] }>,
) {
  vi.doMock("node:child_process", () => ({
    execFile: (
      cmd: string,
      args: string[],
      cbOrOpts: unknown,
      maybeCb?: unknown,
    ) => {
      const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as ExecCb;
      calls.push({ cmd, args });
      const { err, stdout = "", stderr = "" } = handler(cmd, args);
      if (typeof cb === "function") cb(err, { stdout, stderr });
      return { unref: () => undefined };
    },
    spawn: (_cmd: string, _args: string[], _opts?: unknown) => ({
      unref: () => undefined,
    }),
  }));
}

describe("geminiAdapter.deploy", () => {
  let env: ReturnType<typeof makeTempHome>;
  let origSAC: string | undefined;
  beforeEach(() => {
    env = makeTempHome();
    origSAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    vi.resetModules();
  });
  afterEach(() => {
    if (origSAC === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = origSAC;
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/supervisor-staging");
  });

  it("BLOCKED when runtime_config.gemini_quota_project is missing", async () => {
    // settings.json present but without runtime_config — readQuotaProject → null
    writeSettings(env.home, { sleep_window: { start_hour: 0, end_hour: 24 } });

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.deploy(fixtureBundle("blocked-no-quota"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Gemini quota project not configured");
  });

  it("happy path with quota project: plist contains GOOGLE_CLOUD_PROJECT, excludes GEMINI_API_KEY", async () => {
    writeSettings(env.home, {
      sleep_window: { start_hour: 0, end_hour: 24 },
      runtime_config: { gemini_quota_project: "my-test-project" },
    });

    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v gemini")) {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "plutil" && args[0] === "-lint") {
        return { err: null, stdout: "OK" };
      }
      if (cmd === "launchctl" && args[0] === "bootout") {
        return { err: new Error("Not loaded") };
      }
      if (cmd === "launchctl" && args[0] === "bootstrap") {
        return { err: null };
      }
      return { err: null };
    }, execCalls);
    // Plan 02-11: stub supervisor-staging so unit tests don't read a real
    // binary out of process.cwd() + /.. — actual staging is exercised in
    // supervisor-staging.test.ts.
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.deploy(fixtureBundle("morning-summary"));
    expect(result.ok).toBe(true);
    expect(result.artifact).toMatch(
      /com\.sleepwalker\.gemini\.morning-summary\.plist$/,
    );
    // Plan 02-11: non-TCC bundlePath (/tmp/...) must NOT carry a warning
    expect(result.warning).toBeUndefined();
    expect(fsSync.existsSync(result.artifact!)).toBe(true);
    const stat = fsSync.statSync(result.artifact!);
    expect(stat.mode & 0o777).toBe(0o644);

    // Plist content must include GOOGLE_CLOUD_PROJECT and EXCLUDE GEMINI_API_KEY
    // (Pitfall #2 verified at bytes-on-disk — defense in depth beyond source grep).
    const xml = fsSync.readFileSync(result.artifact!, "utf8");
    expect(xml).toContain(
      "<key>GOOGLE_CLOUD_PROJECT</key><string>my-test-project</string>",
    );
    expect(xml).not.toContain("GEMINI_API_KEY");
    expect(xml).toContain("<key>NO_COLOR</key>");
    // Plan 02-11: programArguments[0] is now the staged supervisor path.
    // Follow-up: 4th arg is bundle absolute path so staged supervisor can
    // resolve prompt.md without $(dirname $0)/.. pointing at ~/.sleepwalker.
    expect(xml).toContain("/tmp/stubbed-supervisor");
    expect(xml).toContain("<string>gemini</string>");
    expect(xml).toMatch(/<string>[^<]*\/routines-gemini\/[^<]*<\/string>/);
  });

  it("emits TCC warning when bundlePath is under ~/Desktop/", async () => {
    writeSettings(env.home, {
      runtime_config: { gemini_quota_project: "p" },
    });
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v gemini")) {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "plutil" && args[0] === "-lint") return { err: null, stdout: "OK" };
      if (cmd === "launchctl" && args[0] === "bootout") return { err: new Error("Not loaded") };
      if (cmd === "launchctl" && args[0] === "bootstrap") return { err: null };
      return { err: null };
    }, execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const bundle = fixtureBundle("desktop-tcc");
    bundle.bundlePath = "/Users/someone/Desktop/Projects/myrepo/routines-gemini/desktop-tcc";
    const result = await geminiAdapter.deploy(bundle);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/TCC-protected/);
    expect(result.warning).toContain("/Desktop");
  });

  it("emits TCC warning when bundlePath is under ~/Documents/", async () => {
    writeSettings(env.home, {
      runtime_config: { gemini_quota_project: "p" },
    });
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v gemini")) {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "plutil" && args[0] === "-lint") return { err: null, stdout: "OK" };
      if (cmd === "launchctl" && args[0] === "bootout") return { err: new Error("Not loaded") };
      if (cmd === "launchctl" && args[0] === "bootstrap") return { err: null };
      return { err: null };
    }, execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const bundle = fixtureBundle("documents-tcc");
    bundle.bundlePath = "/Users/someone/Documents/routines-gemini/documents-tcc";
    const result = await geminiAdapter.deploy(bundle);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/TCC-protected/);
    expect(result.warning).toContain("/Documents");
  });

  it("returns error when gemini CLI not on login-shell PATH", async () => {
    writeSettings(env.home, {
      runtime_config: { gemini_quota_project: "p" },
    });
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") {
        return { err: new Error("command not found: gemini") };
      }
      return { err: null };
    }, execCalls);

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.deploy(fixtureBundle("missing-cli"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("gemini CLI not found");
  });
});

describe("geminiAdapter.undeploy", () => {
  let env: ReturnType<typeof makeTempHome>;
  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });
  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("calls uninstallPlist with com.sleepwalker.gemini.<slug> label", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "launchctl" && args[0] === "bootout") return { err: null };
      return { err: null };
    }, execCalls);

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.undeploy(fixtureBundle("teardown"));
    expect(result.ok).toBe(true);
    expect(result.artifact).toBe("com.sleepwalker.gemini.teardown");
  });
});

describe("geminiAdapter.healthCheck", () => {
  let env: ReturnType<typeof makeTempHome>;
  let origSAC: string | undefined;
  let origApiKey: string | undefined;
  beforeEach(() => {
    env = makeTempHome();
    origSAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    origApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
  });
  afterEach(() => {
    if (origSAC === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = origSAC;
    if (origApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origApiKey;
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("happy path: surfaces quota project + auth hint in version string, no warning", async () => {
    writeSettings(env.home, {
      runtime_config: { gemini_quota_project: "my-test-project" },
    });
    fsSync.mkdirSync(path.join(env.home, ".gemini"), { recursive: true });

    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "/opt/homebrew/bin/gemini") {
        return { err: null, stdout: "0.31.0\n" };
      }
      return { err: null };
    }, execCalls);

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.healthCheck();
    expect(result.runtime).toBe("gemini");
    expect(result.available).toBe(true);
    expect(result.version).toContain("(quota: my-test-project)");
    expect(result.version).toContain("[auth: google-signin]");
    expect(result.reason).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it("warns when GOOGLE_APPLICATION_CREDENTIALS and GEMINI_API_KEY both set", async () => {
    writeSettings(env.home, {
      runtime_config: { gemini_quota_project: "p" },
    });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/sa.json";
    process.env.GEMINI_API_KEY = "ak-test";

    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "/opt/homebrew/bin/gemini") {
        return { err: null, stdout: "0.31.0\n" };
      }
      return { err: null };
    }, execCalls);

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.healthCheck();
    expect(result.available).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("GOOGLE_APPLICATION_CREDENTIALS");
    expect(result.warning).toContain("GEMINI_API_KEY");
    expect(result.reason).toBeUndefined();  // Plan 09 amendment: warning field separates warn-but-allow from unavailable
  });

  it("warns when quota project unconfigured (no settings.json)", async () => {
    // No settings.json staged — readQuotaProject → null → warning branch
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") {
        return { err: null, stdout: "/opt/homebrew/bin/gemini\n" };
      }
      if (cmd === "/opt/homebrew/bin/gemini") {
        return { err: null, stdout: "0.31.0\n" };
      }
      return { err: null };
    }, execCalls);

    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const result = await geminiAdapter.healthCheck();
    expect(result.available).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("quota project");
    expect(result.reason).toBeUndefined();
  });
});
