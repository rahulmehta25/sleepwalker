import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";
import type { RoutineBundle } from "@/lib/runtime-adapters/types";

/**
 * End-to-end routine lifecycle tests.
 *
 * Validates the complete flow: write bundle to disk → deploy via adapter →
 * verify deploy state written → runNow → verify audit → queue aggregation.
 *
 * Each test operates in an isolated $HOME with mocked child_process so no
 * real launchctl/codex/gemini binaries are invoked.
 */

function makeBundle(
  runtime: RoutineBundle["runtime"],
  slug: string,
  overrides: Partial<RoutineBundle> = {},
): RoutineBundle {
  return {
    slug,
    runtime,
    name: slug,
    prompt: `[sleepwalker:${runtime}/${slug}]\nDo the thing.`,
    schedule: "0 6 * * *",
    reversibility: "yellow",
    budget: 40000,
    bundlePath: `/tmp/routines-${runtime}/${slug}`,
    ...overrides,
  };
}

type ExecCb = (err: Error | null, out: { stdout: string; stderr: string }) => void;

function installGlobalExecMock(calls: Array<{ cmd: string; args: string[] }>) {
  vi.doMock("node:child_process", () => ({
    execFile: (cmd: string, args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
      const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as ExecCb;
      calls.push({ cmd, args });
      if (cmd === "/bin/zsh" && args.join(" ").includes("command -v codex")) {
        cb(null, { stdout: "/opt/homebrew/bin/codex\n", stderr: "" });
      } else if (cmd === "/bin/zsh" && args.join(" ").includes("command -v gemini")) {
        cb(null, { stdout: "/opt/homebrew/bin/gemini\n", stderr: "" });
      } else if (cmd === "/bin/zsh" && args.join(" ").includes("claude --version")) {
        cb(null, { stdout: "claude-cli 1.0.45\n", stderr: "" });
      } else if (cmd === "plutil" && args[0] === "-lint") {
        cb(null, { stdout: "OK", stderr: "" });
      } else if (cmd === "launchctl" && args[0] === "bootout") {
        cb(new Error("Not loaded"), { stdout: "", stderr: "" });
      } else if (cmd === "launchctl" && args[0] === "bootstrap") {
        cb(null, { stdout: "", stderr: "" });
      } else if (cmd.includes("codex") && args[0] === "--version") {
        cb(null, { stdout: "codex-cli 0.118.0\n", stderr: "" });
      } else if (cmd.includes("gemini") && args[0] === "--version") {
        cb(null, { stdout: "0.31.0\n", stderr: "" });
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
      return { unref: () => undefined };
    },
    spawn: (_cmd: string, _args: string[], _opts?: unknown) => ({
      unref: () => undefined,
    }),
  }));
}

describe("routine lifecycle: codex", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;
  const execCalls: Array<{ cmd: string; args: string[] }> = [];

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
    execCalls.length = 0;
    vi.resetModules();
    installGlobalExecMock(execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));
    fs.mkdirSync(path.join(env.home, ".sleepwalker"), { recursive: true });
    fs.writeFileSync(
      path.join(env.home, ".sleepwalker", "settings.json"),
      JSON.stringify({ runtime_config: { gemini_quota_project: "test-proj" } }),
    );
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/supervisor-staging");
    vi.doUnmock("@/lib/runtime-adapters/bundle-staging");
  });

  it("deploy → writeDeployState → readDeployState → status=deployed", async () => {
    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const { writeDeployState, readDeployState } = await import("@/lib/deploy-state");

    const bundle = makeBundle("codex", "lifecycle-test");

    const deployResult = await codexAdapter.deploy(bundle);
    expect(deployResult.ok).toBe(true);

    const now = Date.now();
    await writeDeployState({
      fleet: "codex/lifecycle-test",
      runtime: "codex",
      slug: "lifecycle-test",
      startedAt: new Date().toISOString(),
      steps: {
        planning: { startedAt: now - 100, completedAt: now - 90, elapsedMs: 10 },
        writing: { startedAt: now - 90, completedAt: now - 50, elapsedMs: 40 },
        loading: { startedAt: now - 50, completedAt: now - 10, elapsedMs: 40 },
        verified: { startedAt: now - 10, completedAt: now, elapsedMs: 10 },
      },
      phase: { kind: "succeeded" },
      artifact: deployResult.artifact,
      verifiedAt: now + 10000,
    });

    const state = await readDeployState("codex", "lifecycle-test");
    expect(state).not.toBeNull();
    expect(state?.phase.kind).toBe("succeeded");
    expect(state?.artifact).toBe(deployResult.artifact);
  });

  it("runNow returns ok with a runId", async () => {
    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const bundle = makeBundle("codex", "run-now-test");
    const result = await codexAdapter.runNow(bundle);
    expect(result.ok).toBe(true);
    expect(result.runId).toMatch(/^codex:run-now-test:\d+$/);
  });

  it("listRuns returns empty array (Phase 5 stub)", async () => {
    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const bundle = makeBundle("codex", "list-runs-test");
    const runs = await codexAdapter.listRuns(bundle);
    expect(runs).toEqual([]);
  });
});

describe("routine lifecycle: gemini", () => {
  let env: ReturnType<typeof makeTempHome>;
  const execCalls: Array<{ cmd: string; args: string[] }> = [];

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
    execCalls.length = 0;
    vi.resetModules();
    installGlobalExecMock(execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));
    fs.writeFileSync(
      path.join(env.home, ".sleepwalker", "settings.json"),
      JSON.stringify({ runtime_config: { gemini_quota_project: "test-proj" } }),
    );
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/supervisor-staging");
    vi.doUnmock("@/lib/runtime-adapters/bundle-staging");
  });

  it("deploy + undeploy lifecycle is idempotent", async () => {
    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const bundle = makeBundle("gemini", "lifecycle-gemini");

    const deploy1 = await geminiAdapter.deploy(bundle);
    expect(deploy1.ok).toBe(true);

    const deploy2 = await geminiAdapter.deploy(bundle);
    expect(deploy2.ok).toBe(true);

    const undeploy = await geminiAdapter.undeploy(bundle);
    expect(undeploy.ok).toBe(true);

    const undeploy2 = await geminiAdapter.undeploy(bundle);
    expect(undeploy2.ok).toBe(true);
  });

  it("runNow returns ok with a runId", async () => {
    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const bundle = makeBundle("gemini", "run-now-gemini");
    const result = await geminiAdapter.runNow(bundle);
    expect(result.ok).toBe(true);
    expect(result.runId).toMatch(/^gemini:run-now-gemini:\d+$/);
  });
});

describe("routine lifecycle: claude-desktop", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("deploy writes SKILL.md, undeploy removes it, re-deploy recreates", async () => {
    const { claudeDesktopAdapter } = await import("@/lib/runtime-adapters/claude-desktop");
    const bundle = makeBundle("claude-desktop", "lifecycle-desktop", {
      prompt: "Hello lifecycle",
      schedule: null,
    });

    const deploy = await claudeDesktopAdapter.deploy(bundle);
    expect(deploy.ok).toBe(true);
    const skillPath = path.join(env.home, ".claude/scheduled-tasks/lifecycle-desktop/SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);

    const undeploy = await claudeDesktopAdapter.undeploy(bundle);
    expect(undeploy.ok).toBe(true);
    expect(fs.existsSync(skillPath)).toBe(false);

    const redeploy = await claudeDesktopAdapter.deploy(bundle);
    expect(redeploy.ok).toBe(true);
    expect(fs.existsSync(skillPath)).toBe(true);
  });
});

describe("routine lifecycle: claude-routines", () => {
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

  it("deploy returns handoffUrl, runNow uses fireRoutine", async () => {
    const { claudeRoutinesAdapter } = await import("@/lib/runtime-adapters/claude-routines");
    const bundle = makeBundle("claude-routines", "lifecycle-cloud", {
      schedule: "0 6 * * *",
    });

    const deploy = await claudeRoutinesAdapter.deploy(bundle);
    expect(deploy.ok).toBe(true);
    expect(deploy.handoffUrl).toContain("https://claude.ai/code/routines/new");
    expect(deploy.artifact).toBe("browser-handoff:lifecycle-cloud");

    const run = await claudeRoutinesAdapter.runNow(bundle);
    expect(run.ok).toBe(false);
    expect(run.error).toBe("no-credentials-configured");
  });
});

describe("audit → queue aggregation integration", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("supervisor audit entries surface in queue aggregation with correct status mapping", async () => {
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        JSON.stringify({ ts: now, fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 1000, preview: "done", exit_code: 0 }),
        JSON.stringify({ ts: now, fleet: "gemini/news", runtime: "gemini", event: "failed", exit_code: 1, reason: "crash" }),
        JSON.stringify({ ts: now, fleet: "codex/budget-test", runtime: "codex", event: "budget_exceeded", chars_consumed: 50000, chars_limit: 40000, exit_code: 137 }),
        JSON.stringify({ ts: now, fleet: "gemini/deferred", runtime: "gemini", event: "deferred", reason: "outside sleep window", hour: 14 }),
        JSON.stringify({ ts: now, fleet: "inbox-triage", tool: "Read", input: {}, output_preview: "ok" }),
        JSON.stringify({ ts: now, fleet: "codex/started-only", runtime: "codex", event: "started", cli: "/usr/bin/codex", budget: 40000 }),
      ].join("\n") + "\n",
    );

    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const runs = readSupervisorRuns();

    expect(runs).toHaveLength(4);

    const completed = runs.find((r) => r.fleet === "codex/daily-brief");
    expect(completed?.status).toBe("complete");
    expect(completed?.source).toBe("codex");
    expect(completed?.kind).toBe("supervisor-run");

    const failed = runs.find((r) => r.fleet === "gemini/news");
    expect(failed?.status).toBe("failed");
    expect(failed?.source).toBe("gemini");

    const budgetExceeded = runs.find((r) => r.fleet === "codex/budget-test");
    expect(budgetExceeded?.status).toBe("failed");

    const deferred = runs.find((r) => r.fleet === "gemini/deferred");
    expect(deferred?.status).toBe("rejected");
  });

  it("readSupervisorRuns filters entries older than 24h", async () => {
    const staleTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const freshTs = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        JSON.stringify({ ts: staleTs, fleet: "codex/old", runtime: "codex", event: "completed", exit_code: 0 }),
        JSON.stringify({ ts: freshTs, fleet: "codex/new", runtime: "codex", event: "completed", exit_code: 0 }),
      ].join("\n") + "\n",
    );

    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const runs = readSupervisorRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].fleet).toBe("codex/new");
  });

  it("readSupervisorRuns gracefully handles missing audit file", async () => {
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const runs = readSupervisorRuns();
    expect(runs).toEqual([]);
  });

  it("readSupervisorRuns skips malformed JSON lines", async () => {
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        "not json at all",
        JSON.stringify({ ts: now, fleet: "codex/valid", runtime: "codex", event: "completed", exit_code: 0 }),
        "{broken json",
      ].join("\n") + "\n",
    );

    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const runs = readSupervisorRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].fleet).toBe("codex/valid");
  });
});

describe("cross-adapter contract compliance", () => {
  let env: ReturnType<typeof makeTempHome>;
  const execCalls: Array<{ cmd: string; args: string[] }> = [];

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
    execCalls.length = 0;
    vi.resetModules();
    installGlobalExecMock(execCalls);
    vi.doMock("@/lib/runtime-adapters/supervisor-staging", () => ({
      ensureStagedSupervisor: vi.fn(async () => "/tmp/stubbed-supervisor"),
    }));
    vi.doMock("@/lib/runtime-adapters/bundle-staging", () => ({
      ensureStagedBundle: vi.fn(async () => "/tmp/stubbed-staged-bundle"),
      removeStagedBundle: vi.fn(async () => undefined),
    }));
    fs.writeFileSync(
      path.join(env.home, ".sleepwalker", "settings.json"),
      JSON.stringify({ runtime_config: { gemini_quota_project: "test-proj" } }),
    );
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("@/lib/runtime-adapters/supervisor-staging");
    vi.doUnmock("@/lib/runtime-adapters/bundle-staging");
  });

  it("all 4 adapters implement RuntimeAdapter correctly (deploy returns DeployResult shape)", async () => {
    const { ADAPTERS } = await import("@/lib/runtime-adapters");

    for (const [runtimeKey, adapter] of Object.entries(ADAPTERS)) {
      const bundle = makeBundle(runtimeKey as RoutineBundle["runtime"], "contract-test");

      const deployResult = await adapter.deploy(bundle);
      expect(typeof deployResult.ok).toBe("boolean");
      if (!deployResult.ok) {
        expect(typeof deployResult.error).toBe("string");
      }

      const undeployResult = await adapter.undeploy(bundle);
      expect(typeof undeployResult.ok).toBe("boolean");

      const runResult = await adapter.runNow(bundle);
      expect(typeof runResult.ok).toBe("boolean");

      const runs = await adapter.listRuns(bundle);
      expect(Array.isArray(runs)).toBe(true);

      const health = await adapter.healthCheck();
      expect(health.runtime).toBe(runtimeKey);
      expect(typeof health.available).toBe("boolean");
    }
  });

  it("no adapter method throws — all return result objects", async () => {
    const { ADAPTERS } = await import("@/lib/runtime-adapters");

    for (const [runtimeKey, adapter] of Object.entries(ADAPTERS)) {
      const bundle = makeBundle(runtimeKey as RoutineBundle["runtime"], "no-throw-test");

      await expect(adapter.deploy(bundle)).resolves.toBeDefined();
      await expect(adapter.undeploy(bundle)).resolves.toBeDefined();
      await expect(adapter.runNow(bundle)).resolves.toBeDefined();
      await expect(adapter.listRuns(bundle)).resolves.toBeDefined();
      await expect(adapter.healthCheck()).resolves.toBeDefined();
    }
  });
});
