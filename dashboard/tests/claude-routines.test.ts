import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("claudeRoutinesAdapter — pure deploy/undeploy", () => {
  it("deploy returns handoffUrl with name + prompt + cadence URL-encoded", async () => {
    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.deploy({
      slug: "morning-brief",
      runtime: "claude-routines",
      name: "Morning Brief",
      prompt: "Do a daily brief.",
      schedule: "0 6 * * *",
      reversibility: "yellow",
      budget: 40000,
      bundlePath: "/repo/routines-cloud/morning-brief",
    });
    expect(result.ok).toBe(true);
    expect(result.artifact).toBe("browser-handoff:morning-brief");
    expect(result.handoffUrl).toContain("https://claude.ai/code/routines/new");
    expect(result.handoffUrl).toContain("name=Morning%20Brief");
    expect(result.handoffUrl).toContain("prompt=Do%20a%20daily%20brief.");
    expect(result.handoffUrl).toContain("cadence=0%206%20*%20*%20*");
  });

  it("undeploy returns the routines-list URL", async () => {
    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.undeploy({
      slug: "x",
      runtime: "claude-routines",
      name: "x",
      prompt: "x",
      schedule: null,
      reversibility: "yellow",
      budget: 40000,
      bundlePath: "/x",
    });
    expect(result.ok).toBe(true);
    expect(result.handoffUrl).toBe("https://claude.ai/code/routines");
    expect(result.artifact).toBe("browser-handoff-undeploy");
  });
});

describe("claudeRoutinesAdapter.runNow — wraps fireRoutine", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("returns runId + watchUrl on successful /fire response", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            claude_code_session_id: "session_01TEST",
            claude_code_session_url: "https://claude.ai/code/session_01TEST",
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential(
      "morning-brief",
      "https://api.anthropic.com/v1/test/fire",
      "sk-ant-oat01-test",
    );

    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.runNow({
      slug: "morning-brief",
      runtime: "claude-routines",
      name: "x",
      prompt: "x",
      schedule: null,
      reversibility: "yellow",
      budget: 40000,
      bundlePath: "/x",
    });
    expect(result.ok).toBe(true);
    expect(result.runId).toBe("session_01TEST");
    expect(result.watchUrl).toBe("https://claude.ai/code/session_01TEST");
  });

  it("returns {ok:false, error} when no credential is configured", async () => {
    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.runNow({
      slug: "no-cred-routine",
      runtime: "claude-routines",
      name: "n",
      prompt: "x",
      schedule: null,
      reversibility: "yellow",
      budget: 40000,
      bundlePath: "/x",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no-credentials-configured");
  });
});

describe("claudeRoutinesAdapter.healthCheck — login-shell CLI probe", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("reports available + version on successful claude --version", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        cb: (
          err: Error | null,
          out: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (cmd === "/bin/zsh" && args.join(" ").includes("claude --version")) {
          cb(null, { stdout: "claude-cli 1.0.45\n", stderr: "" });
        } else {
          cb(new Error("unexpected"), { stdout: "", stderr: "" });
        }
      },
    }));
    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.healthCheck();
    expect(result.runtime).toBe("claude-routines");
    expect(result.available).toBe(true);
    expect(result.version).toBe("claude-cli 1.0.45");
  });

  it("reports unavailable on probe failure", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: (
        _cmd: string,
        _args: string[],
        cb: (
          err: Error | null,
          out: { stdout: string; stderr: string },
        ) => void,
      ) => {
        cb(new Error("command not found: claude"), { stdout: "", stderr: "" });
      },
    }));
    const { claudeRoutinesAdapter } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    const result = await claudeRoutinesAdapter.healthCheck();
    expect(result.runtime).toBe("claude-routines");
    expect(result.available).toBe(false);
    expect(result.reason).toContain("claude CLI not found");
  });
});

describe("CC_ROUTINE_BETA constant", () => {
  it("matches the BETA_HEADER hardcoded in fire-routine.ts (Pitfall #12)", async () => {
    const { CC_ROUTINE_BETA } = await import(
      "@/lib/runtime-adapters/claude-routines"
    );
    expect(CC_ROUTINE_BETA).toBe("experimental-cc-routine-2026-04-01");
  });
});
