// dashboard/tests/deploy-routine-action.test.ts
//
// State-machine + rollback matrix for the `deployRoutine` Server Action.
// Every block exercises a distinct failure/success branch of the 4-stage
// state machine (planning → writing → loading → verified) and/or the
// rollback orchestrator (adapter.undeploy + deleteDeployState + 10s timeout
// wrapper). Block names match 04-VALIDATION.md rows 1, 5, 6, 7, 8 exactly
// so the exit-gate query (`pnpm test -t "state machine transitions"`,
// `"rollback on writing failure"`, etc.) lands on the canonical anchor.
//
// Isolation strategy:
//   - `makeTempHome()` overrides $HOME so writeDeployState lands under
//     temp dir/.sleepwalker/deploys/ and never touches real state.
//   - `process.chdir(tmpRepo)` so readBundle sees a seeded routines-codex/
//     bundle under the temp cwd.
//   - `vi.doMock("@/lib/runtime-adapters", ...)` swaps the live adapter
//     registry for a controlled fake. Per-test overrides for deploy,
//     undeploy, healthCheck, runNow.
//   - `vi.doMock("node:child_process", ...)` intercepts the launchctl
//     print retry loop so the loading step doesn't attempt a real
//     launchctl on the test host.
//   - `vi.resetModules()` in beforeEach so each it() picks up fresh
//     mocks (the Server Action imports adapters at module load, and
//     Vitest caches modules by default).

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

const ORIG_CWD = process.cwd();

function seedCodexBundle(tmpRepo: string, slug: string): void {
  const dir = path.join(tmpRepo, "routines-codex", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({
      name: `Test ${slug}`,
      runtime: "codex",
      slug,
      schedule: "0 3 * * *",
      reversibility: "green",
      budget: 50_000,
      enabled: true,
    }),
  );
  fs.writeFileSync(path.join(dir, "prompt.md"), `[sleepwalker:codex/${slug}]\nprompt body`);
}

function deployStateFile(home: string, runtime: string, slug: string): string {
  return path.join(home, ".sleepwalker", "deploys", `${runtime}-${slug}.state.json`);
}

/**
 * Install a minimal adapter mock with sensible defaults. Any handler can be
 * overridden to simulate failure modes for the specific it() block. The mock
 * stays stable across runtimes — tests pass `runtime: "codex"` throughout.
 */
function mockAdapter(overrides: Partial<{
  deploy: (...a: unknown[]) => Promise<unknown>;
  undeploy: (...a: unknown[]) => Promise<unknown>;
  healthCheck: (...a: unknown[]) => Promise<unknown>;
  runNow: (...a: unknown[]) => Promise<unknown>;
}> = {}): void {
  vi.doMock("@/lib/runtime-adapters", () => ({
    getAdapter: () => ({
      runtime: "codex",
      deploy: overrides.deploy ?? (async () => ({ ok: true, artifact: "/tmp/fake.plist" })),
      undeploy: overrides.undeploy ?? (async () => ({ ok: true })),
      runNow: overrides.runNow ?? (async () => ({ ok: true, runId: "r1" })),
      listRuns: async () => [],
      healthCheck: overrides.healthCheck ?? (async () => ({ runtime: "codex", available: true })),
    }),
    ADAPTERS: {},
    healthCheckAll: async () => [],
  }));
}

/**
 * Install a child_process mock with a provided handler. Default behavior:
 * every execFile call succeeds silently. Tests that need a failure inject
 * a handler that returns an Error for specific cmd/args combos.
 */
function mockChildProcess(
  handler: (cmd: string, args: string[]) => Error | null = () => null,
): void {
  vi.doMock("node:child_process", () => ({
    execFile: (cmd: string, args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
      const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as
        | ((err: Error | null, out: { stdout: string; stderr: string }) => void)
        | undefined;
      const err = handler(cmd, args);
      if (typeof cb === "function") cb(err, { stdout: "", stderr: "" });
      return { unref: () => undefined };
    },
    spawn: () => ({ unref: () => undefined }),
  }));
}

describe("deployRoutine Server Action", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    vi.resetModules();
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-deploy-act-"));
    process.chdir(tmpRepo);
    seedCodexBundle(tmpRepo, "test");
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/runtime-adapters");
    vi.doUnmock("node:child_process");
  });

  it("state machine transitions planning -> writing -> loading -> verified", async () => {
    // VALIDATION row 1: happy path, all 4 steps recorded, terminal succeeded.
    mockAdapter();
    mockChildProcess(); // launchctl print succeeds silently
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.phase.kind).toBe("succeeded");
      expect(res.state.verifiedAt).toBeGreaterThan(0);
      expect(res.state.steps.planning).toBeDefined();
      expect(res.state.steps.writing).toBeDefined();
      expect(res.state.steps.loading).toBeDefined();
      expect(res.state.steps.verified).toBeDefined();
      expect(res.state.artifact).toBe("/tmp/fake.plist");
    }
    // State file persisted under temp HOME
    const { readDeployState } = await import("@/lib/deploy-state");
    const persisted = await readDeployState("codex", "test");
    expect(persisted).not.toBeNull();
    expect(persisted!.phase.kind).toBe("succeeded");
  });

  it("rollback on writing failure", async () => {
    // VALIDATION row 5: adapter.deploy returns ok:false; undeploy is called;
    // state file is deleted (no orphan); result carries error + failedStep.
    const undeploySpy = vi.fn(async () => ({ ok: true }));
    mockAdapter({
      deploy: async () => ({ ok: false, error: "plist lint failed" }),
      undeploy: undeploySpy,
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("plist lint failed");
      expect(res.failedStep).toBe("writing");
    }
    expect(undeploySpy).toHaveBeenCalledTimes(1);
    // No orphan state file
    expect(fs.existsSync(deployStateFile(env.home, "codex", "test"))).toBe(false);
  });

  it("nested error captured in rollbackActions array", async () => {
    // VALIDATION row 6: deploy fails AND undeploy ALSO fails. rollbackActions
    // must capture both outcomes (undeploy.ok=false AND deleteDeployState.ok).
    mockAdapter({
      deploy: async () => ({ ok: false, error: "primary: plist lint failed" }),
      undeploy: async () => ({ ok: false, error: "nested: launchctl bootout refused" }),
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.rollbackActions.length).toBeGreaterThanOrEqual(2);
      const undeployEntry = res.rollbackActions.find((a) => a.action === "adapter.undeploy");
      expect(undeployEntry).toBeDefined();
      expect(undeployEntry!.ok).toBe(false);
      expect(undeployEntry!.error).toContain("nested");
      const deleteEntry = res.rollbackActions.find((a) => a.action === "deleteDeployState");
      expect(deleteEntry).toBeDefined();
      expect(deleteEntry!.ok).toBe(true); // deleteDeployState with force:true is idempotent
    }
  });

  it("no orphaned state after failed deploy", async () => {
    // VALIDATION row 7: zero-orphan invariant. After any failed deploy the
    // state file MUST NOT exist on disk.
    mockAdapter({
      deploy: async () => ({ ok: false, error: "simulated failure" }),
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    const stateFilePath = deployStateFile(env.home, "codex", "test");
    expect(fs.existsSync(stateFilePath)).toBe(false);
  });

  it("bootout timeout surfaces as rolled-back with timed out entry", async () => {
    // VALIDATION row 8: adapter.undeploy never resolves; 10s timeout wrapper
    // resolves with fallback {ok:false, error: /timed out/}. Strategy: only
    // fake setTimeout/clearTimeout so fs.promises.writeFile (which uses the
    // threadpool, not a timer) still settles microtasks synchronously. A
    // plain vi.useFakeTimers() would also fake setImmediate/nextTick and
    // the state-file writes inside deployRoutine would hang.
    // The 10s undeploy timeout is triggered by real setTimeout inside
    // withTimeout(). To exercise it within vitest's default 5s test timeout
    // we dial back the environment-controllable timeout via spy on the
    // internal UNDEPLOY_TIMEOUT_MS. Instead, we mock child_process so
    // launchctl bootout never returns; we DON'T need fake timers because
    // once the setTimeout fires in real time we get the rolled-back return
    // immediately. But 10s exceeds the 5s test timeout, so we have to fake.
    //
    // Approach: set the test's testTimeout to 15s (one shot override), use
    // real fs + real setTimeout, and let the 10s window actually elapse.
    // This is tolerable because only one test in the suite touches this
    // path. See 04-RESEARCH.md §Rollback Orchestration §Nested Error
    // Handling for why a resolve-never-reject timeout is load-bearing.
    const neverResolves = new Promise<unknown>(() => {
      // intentionally never resolve — simulate hung launchctl bootout
    });
    mockAdapter({
      deploy: async () => ({ ok: false, error: "primary failure" }),
      undeploy: async () => neverResolves as never,
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const undeployEntry = res.rollbackActions.find((a) => a.action === "adapter.undeploy");
      expect(undeployEntry).toBeDefined();
      expect(undeployEntry!.ok).toBe(false);
      expect(undeployEntry!.error).toMatch(/timed out/);
    }
  }, 15_000);

  it("planning step fails when adapter is unavailable", async () => {
    // Planning-step failure path: healthCheck returns available:false.
    // No undeploy should run (nothing was deployed yet), but state file
    // must still be cleaned up for the no-orphan invariant.
    const undeploySpy = vi.fn(async () => ({ ok: true }));
    mockAdapter({
      healthCheck: async () => ({
        runtime: "codex",
        available: false,
        reason: "codex CLI not in PATH",
      }),
      undeploy: undeploySpy,
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failedStep).toBe("planning");
      expect(res.error).toContain("not in PATH");
    }
    expect(fs.existsSync(deployStateFile(env.home, "codex", "test"))).toBe(false);
  });

  it("double-deploy guard: prior running state < 60s returns already in progress", async () => {
    // 04-RESEARCH.md Open Q#1: a prior in-flight deploy (phase.kind=running,
    // startedAt < 60s ago) short-circuits to prevent state corruption.
    mockAdapter();
    mockChildProcess();
    const { writeDeployState } = await import("@/lib/deploy-state");
    // Seed a running state started 2s ago
    await writeDeployState({
      fleet: "codex/test",
      runtime: "codex",
      slug: "test",
      startedAt: new Date(Date.now() - 2_000).toISOString(),
      steps: { planning: { startedAt: Date.now() - 2_000 } },
      phase: { kind: "running", step: "planning", stepStartedAt: Date.now() - 2_000 },
    });
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/already in progress/);
    }
    // The prior state was NOT overwritten
    const { readDeployState } = await import("@/lib/deploy-state");
    const still = await readDeployState("codex", "test");
    expect(still).not.toBeNull();
    expect(still!.phase.kind).toBe("running");
  });

  it("successful deploy preserves warning from adapter (claude-desktop Q1 surface)", async () => {
    // DeployResult.warning → DeployState.warning. Drawer's success toast
    // renders this alongside the Close + Run-now CTAs.
    const warningText = "Claude Desktop does not auto-detect routines. Open Desktop -> Schedule -> Add and paste the generated SKILL.md content.";
    mockAdapter({
      deploy: async () => ({
        ok: true,
        artifact: "/path/to/SKILL.md",
        warning: warningText,
      }),
    });
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "test" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.warning).toBe(warningText);
      expect(res.state.phase.kind).toBe("succeeded");
    }
  });

  it("bundle not found returns error without writing state", async () => {
    // Step 0 bail: readBundle returns null → no state file is written, no
    // rollback runs (nothing to roll back). Keeps the drawer empty.
    mockAdapter();
    mockChildProcess();
    const { deployRoutine } = await import("@/app/routines/actions");
    const res = await deployRoutine({ runtime: "codex", slug: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Bundle not found");
      expect(res.rollbackActions).toEqual([]);
    }
    expect(fs.existsSync(deployStateFile(env.home, "codex", "does-not-exist"))).toBe(false);
  });
});
