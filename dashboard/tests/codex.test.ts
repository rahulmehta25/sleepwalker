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

    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const result = await codexAdapter.deploy(fixtureBundle("morning-brief"));
    expect(result.ok).toBe(true);
    expect(result.artifact).toMatch(/com\.sleepwalker\.codex\.morning-brief\.plist$/);
    // Plist file actually written to disk
    expect(fsSync.existsSync(result.artifact!)).toBe(true);
    const stat = fsSync.statSync(result.artifact!);
    expect(stat.mode & 0o777).toBe(0o644);
    // Plist content excludes OPENAI_API_KEY (Pitfall #2)
    const xml = fsSync.readFileSync(result.artifact!, "utf8");
    expect(xml).not.toContain("OPENAI_API_KEY");
    expect(xml).toContain("<key>NO_COLOR</key>");
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
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/^WARN: /);
    expect(result.reason).toContain("OPENAI_API_KEY");
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
