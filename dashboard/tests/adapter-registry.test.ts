import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempHome } from "./helpers";

describe("ADAPTERS registry shape", () => {
  it("has exactly 4 keys: claude-routines, claude-desktop, codex, gemini", async () => {
    const { ADAPTERS } = await import("@/lib/runtime-adapters");
    const keys = Object.keys(ADAPTERS).sort();
    expect(keys).toEqual(["claude-desktop", "claude-routines", "codex", "gemini"]);
  });

  it("each adapter's runtime discriminant matches its registry key", async () => {
    const { ADAPTERS } = await import("@/lib/runtime-adapters");
    expect(ADAPTERS["claude-routines"].runtime).toBe("claude-routines");
    expect(ADAPTERS["claude-desktop"].runtime).toBe("claude-desktop");
    expect(ADAPTERS["codex"].runtime).toBe("codex");
    expect(ADAPTERS["gemini"].runtime).toBe("gemini");
  });

  it("getAdapter returns the same reference as ADAPTERS[runtime]", async () => {
    const { getAdapter, ADAPTERS } = await import("@/lib/runtime-adapters");
    expect(getAdapter("codex")).toBe(ADAPTERS["codex"]);
    expect(getAdapter("gemini")).toBe(ADAPTERS["gemini"]);
    expect(getAdapter("claude-routines")).toBe(ADAPTERS["claude-routines"]);
    expect(getAdapter("claude-desktop")).toBe(ADAPTERS["claude-desktop"]);
  });

  it("no adapter still says 'not implemented' (Phase 1 stubs fully removed)", async () => {
    const { ADAPTERS } = await import("@/lib/runtime-adapters");
    // Run deploy() against a minimal fake bundle on each adapter; ensure no
    // "not implemented" error string. For adapters that need quota project /
    // fs / launchctl, we expect failure but with a *real* error message.
    const fakeBundle = {
      slug: "registry-probe",
      runtime: "codex" as const,
      name: "x",
      prompt: "x",
      schedule: null,
      reversibility: "yellow" as const,
      budget: 40000,
      bundlePath: "/tmp/x-registry-probe",
    };
    for (const [key, adapter] of Object.entries(ADAPTERS)) {
      const probedBundle = {
        ...fakeBundle,
        runtime: key as typeof fakeBundle.runtime,
      };
      const result = await adapter.deploy(probedBundle);
      // Result may be ok:false (e.g. CLI not found) — but error must NOT mention "not implemented"
      if (!result.ok && result.error) {
        expect(result.error).not.toMatch(/not implemented/i);
      }
    }
  });
});

describe("healthCheckAll", () => {
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

  it("returns exactly 4 HealthStatus objects (one per runtime)", async () => {
    // Mock execFile so probes don't hang/fail in CI; goal is shape, not behavior.
    vi.doMock("node:child_process", () => ({
      execFile: (
        _cmd: string,
        _args: string[],
        cbOrOpts: unknown,
        maybeCb?: unknown,
      ) => {
        const cb = (typeof cbOrOpts === "function"
          ? cbOrOpts
          : maybeCb) as (
          err: Error | null,
          out: { stdout: string; stderr: string },
        ) => void;
        // Return error for all probes — adapters should each emit {available:false, reason}
        if (typeof cb === "function") {
          cb(new Error("probe mocked"), { stdout: "", stderr: "" });
        }
        return { unref: () => undefined };
      },
      spawn: (_cmd: string, _args: string[], _opts?: unknown) => ({
        unref: () => undefined,
      }),
    }));
    const { healthCheckAll } = await import("@/lib/runtime-adapters");
    const statuses = await healthCheckAll();
    expect(statuses).toHaveLength(4);
    // Each has a runtime discriminant; the set covers all 4
    const runtimes = statuses.map((s) => s.runtime).sort();
    expect(runtimes).toEqual([
      "claude-desktop",
      "claude-routines",
      "codex",
      "gemini",
    ]);
    // None throw — all return result objects with available boolean
    for (const s of statuses) {
      expect(typeof s.available).toBe("boolean");
    }
  });

  it("HealthStatus.warning field exists and is optional (Plan 09 amendment)", async () => {
    // Type-level assertion: the field is part of the public API
    const status: import("@/lib/runtime-adapters").HealthStatus = {
      runtime: "codex",
      available: true,
      warning: "test warning",
    };
    expect(status.warning).toBe("test warning");
    // Without the field — also valid (optional)
    const noWarn: import("@/lib/runtime-adapters").HealthStatus = {
      runtime: "codex",
      available: true,
    };
    expect(noWarn.warning).toBeUndefined();
  });
});
