import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsSync from "node:fs";
import path from "node:path";
import { makeTempHome } from "./helpers";

function fixtureBundle(slug: string): import("@/lib/runtime-adapters/types").RoutineBundle {
  return {
    slug,
    runtime: "codex",
    name: slug,
    prompt: `[sleepwalker:codex/${slug}]\nDo it.`,
    schedule: "0 6 * * *",
    reversibility: "yellow",
    budget: 40000,
    bundlePath: `/tmp/routines-codex/${slug}`,
  };
}

/**
 * execFile mock that handles both overloads:
 *   execFile(cmd, args, cb)
 *   execFile(cmd, args, opts, cb)
 * Returns a minimal child-like object with .unref() so spawn()-style callers
 * (the runNow detached handle) don't crash even though we're mocking execFile here.
 */
type ExecCb = (err: Error | null, out: { stdout: string; stderr: string }) => void;
type Handler = (cmd: string, args: string[]) => { err: Error | null; stdout?: string; stderr?: string };

function installExecFileMock(handler: Handler, calls: Array<{ cmd: string; args: string[] }>) {
  vi.doMock("node:child_process", () => ({
    execFile: (cmd: string, args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
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

describe("codexAdapter.deploy", () => {
  let env: ReturnType<typeof makeTempHome>;
  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });
  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/supervisor-staging");
    vi.doUnmock("@/lib/runtime-adapters/bundle-staging");
  });

  it("full deploy flow: zsh path resolve → plutil lint → bootout (ignored) → bootstrap → success", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v codex")) {
        return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
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
    // Stub supervisor-staging so deploy() doesn't try to read a real binary
    // out of process.cwd() + /.. — which is the host repo on the CI path.
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    // Plan 02-12: stub bundle-staging so deploy() doesn't try to read a real
    // bundle from /tmp/routines-codex/ fixtures. Staging behavior itself is
    // covered by bundle-staging.test.ts with real fs.
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.deploy(fixtureBundle("morning-brief"));
    expect(result.ok).toBe(true);
    expect(result.artifact).toMatch(/com\.sleepwalker\.codex\.morning-brief\.plist$/);
    // Plan 02-11: non-TCC bundlePath (/tmp/...) must NOT carry a warning
    expect(result.warning).toBeUndefined();
    // Plist file actually written to disk
    expect(fsSync.existsSync(result.artifact!)).toBe(true);
    const stat = fsSync.statSync(result.artifact!);
    expect(stat.mode & 0o777).toBe(0o644);
    // Plist content excludes OPENAI_API_KEY (Pitfall #2) and points
    // programArguments[0] at the staged supervisor (Plan 02-11).
    // Plan 02-12: programArguments[3] AND WorkingDirectory both point at
    // the STAGED bundle path (not bundle.bundlePath) so launchd's sandbox
    // never touches TCC-protected paths.
    const xml = fsSync.readFileSync(result.artifact!, "utf8");
    expect(xml).not.toContain("OPENAI_API_KEY");
    expect(xml).toContain("<key>NO_COLOR</key>");
    expect(xml).toContain("/tmp/stubbed-supervisor");
    expect(xml).toContain("<string>codex</string>");
    expect(xml).toContain("<string>morning-brief</string>");
    // Plan 02-12: 4th programArguments entry is the STAGED bundle path
    expect(xml).toContain("<string>/tmp/stubbed-staged-bundle</string>");
    // Plan 02-12: WorkingDirectory is ALSO the staged bundle path (root fix)
    expect(xml).toContain(
      "<key>WorkingDirectory</key><string>/tmp/stubbed-staged-bundle</string>",
    );
    // And it is NOT the original (potentially TCC-protected) bundle.bundlePath
    expect(xml).not.toContain(
      "<key>WorkingDirectory</key><string>/tmp/routines-codex/morning-brief</string>",
    );
    // Call ordering: plutil → bootout → bootstrap
    const cmds = execCalls.map((c) => `${c.cmd} ${c.args[0] ?? ""}`);
    expect(cmds).toEqual(
      expect.arrayContaining(["plutil -lint", "launchctl bootout", "launchctl bootstrap"]),
    );
    const plutilIdx = cmds.indexOf("plutil -lint");
    const bootoutIdx = cmds.indexOf("launchctl bootout");
    const bootstrapIdx = cmds.indexOf("launchctl bootstrap");
    expect(plutilIdx).toBeLessThan(bootoutIdx);
    expect(bootoutIdx).toBeLessThan(bootstrapIdx);
  });

  it("emits TCC warning when bundlePath is under ~/Desktop/", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v codex")) {
        return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
      }
      if (cmd === "plutil" && args[0] === "-lint") return { err: null, stdout: "OK" };
      if (cmd === "launchctl" && args[0] === "bootout") return { err: new Error("Not loaded") };
      if (cmd === "launchctl" && args[0] === "bootstrap") return { err: null };
      return { err: null };
    }, execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    // Plan 02-12: stub bundle-staging so deploy() doesn't try to read a
    // fictitious ~/Desktop/ fixture path.
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const bundle = fixtureBundle("desktop-tcc");
    bundle.bundlePath = "/Users/someone/Desktop/Projects/myrepo/routines-codex/desktop-tcc";
    const result = await codexAdapter.deploy(bundle);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/TCC-protected/);
    expect(result.warning).toContain("/Desktop");
  });

  it("emits TCC warning when bundlePath is under iCloud (~/Library/Mobile Documents)", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v codex")) {
        return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
      }
      if (cmd === "plutil" && args[0] === "-lint") return { err: null, stdout: "OK" };
      if (cmd === "launchctl" && args[0] === "bootout") return { err: new Error("Not loaded") };
      if (cmd === "launchctl" && args[0] === "bootstrap") return { err: null };
      return { err: null };
    }, execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    // Plan 02-12: stub bundle-staging for TCC-path fixture.
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const bundle = fixtureBundle("icloud-tcc");
    bundle.bundlePath =
      "/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/routines-codex/icloud-tcc";
    const result = await codexAdapter.deploy(bundle);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/TCC-protected/);
    expect(result.warning).toContain("Mobile Documents");
  });

  it("returns {ok:false, error} when codex CLI not on login-shell PATH", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") return { err: new Error("command not found: codex") };
      return { err: null };
    }, execCalls);

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.deploy(fixtureBundle("missing-cli"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("codex CLI not found");
  });
});

describe("codexAdapter.undeploy", () => {
  let env: ReturnType<typeof makeTempHome>;
  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });
  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/bundle-staging");
  });

  it("calls uninstallPlist with com.sleepwalker.codex.<slug> label", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "launchctl" && args[0] === "bootout") return { err: null };
      return { err: null };
    }, execCalls);

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.undeploy(fixtureBundle("teardown-test"));
    expect(result.ok).toBe(true);
    expect(result.artifact).toBe("com.sleepwalker.codex.teardown-test");
  });

  it("calls removeStagedBundle('codex', <slug>) after uninstallPlist (Plan 02-12 cleanup)", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "launchctl" && args[0] === "bootout") return { err: null };
      return { err: null };
    }, execCalls);
    // Plan 02-12: spy on removeStagedBundle to verify adapter calls it with
    // the correct (runtime, slug) pair after uninstallPlist succeeds.
    const removeSpy = vi.fn(async () => undefined);
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: removeSpy,
    }));

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.undeploy(fixtureBundle("cleanup-test"));
    expect(result.ok).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith("codex", "cleanup-test");
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("codexAdapter.healthCheck", () => {
  let env: ReturnType<typeof makeTempHome>;
  let origEnvKey: string | undefined;
  beforeEach(() => {
    env = makeTempHome();
    origEnvKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
  });
  afterEach(() => {
    if (origEnvKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origEnvKey;
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("happy path: codex available, no auth conflict, no warning", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd, args) => {
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v codex")) {
        return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
      }
      if (cmd === "/opt/homebrew/bin/codex" && args[0] === "--version") {
        return { err: null, stdout: "codex-cli 0.118.0\n" };
      }
      return { err: null };
    }, execCalls);

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.healthCheck();
    expect(result.runtime).toBe("codex");
    expect(result.available).toBe(true);
    expect(result.version).toBe("codex-cli 0.118.0");
    expect(result.reason).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it("warn-but-allow on auth conflict: ~/.codex/auth.json + OPENAI_API_KEY both present", async () => {
    // Stage fixture: ~/.codex/auth.json + config.toml WITHOUT preferred_auth_method
    fsSync.mkdirSync(path.join(env.home, ".codex"), { recursive: true });
    fsSync.writeFileSync(path.join(env.home, ".codex/auth.json"), `{"token":"xxx"}`);
    fsSync.writeFileSync(path.join(env.home, ".codex/config.toml"), `model = "gpt-5"\n`);
    process.env.OPENAI_API_KEY = "sk-test-fixture";

    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
      if (cmd === "/opt/homebrew/bin/codex") return { err: null, stdout: "codex-cli 0.118.0\n" };
      return { err: null };
    }, execCalls);

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.healthCheck();
    expect(result.available).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("OPENAI_API_KEY");
    expect(result.reason).toBeUndefined();  // reason is for unavailable; warning is for available+warning (Plan 09 amendment)
  });

  it("reports unavailable when codex --version fails", async () => {
    const execCalls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock((cmd) => {
      if (cmd === "/bin/zsh") return { err: null, stdout: "/opt/homebrew/bin/codex\n" };
      if (cmd === "/opt/homebrew/bin/codex") return { err: new Error("segfault") };
      return { err: null };
    }, execCalls);

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.healthCheck();
    expect(result.available).toBe(false);
    expect(result.reason).toContain("--version failed");
  });
});
