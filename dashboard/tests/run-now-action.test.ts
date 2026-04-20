// dashboard/tests/run-now-action.test.ts
//
// Per-runtime runNow dispatch matrix for the `runNowRoutine` Server Action.
// The action is a thin wrapper around `getAdapter(runtime).runNow(bundle)`
// (Phase 2 adapters implement the per-runtime mechanics); this file asserts
// that the wrapper:
//   - hands the bundle through unchanged
//   - surfaces `handoffUrl` for claude-routines (watchUrl → handoffUrl shim)
//   - propagates `{runId, watchUrl}` for codex/gemini/claude-desktop
//   - maps adapter.ok=false into {ok:false, error}
//
// Block names match 04-VALIDATION.md rows 13 (claude-routines), 14
// (claude-desktop), 15 (codex detached), 16 (gemini detached).

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
import { makeTempHome } from "./helpers";

const ORIG_CWD = process.cwd();

function seedBundle(
  tmpRepo: string,
  runtimeDir: string,
  slug: string,
  kind: "codex" | "gemini" | "claude",
): void {
  const dir = path.join(tmpRepo, runtimeDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  if (kind === "claude") {
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${slug}\nschedule: "0 3 * * *"\nreversibility: green\nbudget: 50000\n---\n\nprompt body`,
    );
    return;
  }
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({
      name: slug,
      runtime: kind,
      slug,
      schedule: "0 3 * * *",
      reversibility: "green",
      budget: 50_000,
      enabled: true,
    }),
  );
  fs.writeFileSync(path.join(dir, "prompt.md"), `[sleepwalker:${kind}/${slug}]\nbody`);
}

/**
 * Install an adapter-registry mock with a per-runtime runNow behavior.
 * Default: {ok:true, runId:"default"}. Each test overrides the handler to
 * simulate claude-routines handoff URLs, adapter failures, etc.
 */
function mockAdapterRegistry(runNowByRuntime: Record<string, () => Promise<unknown>>): void {
  vi.doMock("@/lib/runtime-adapters", () => ({
    getAdapter: (runtime: string) => ({
      runtime,
      deploy: async () => ({ ok: true }),
      undeploy: async () => ({ ok: true }),
      runNow: runNowByRuntime[runtime] ?? (async () => ({ ok: true, runId: "default" })),
      listRuns: async () => [],
      healthCheck: async () => ({ runtime, available: true }),
    }),
    ADAPTERS: {},
    healthCheckAll: async () => [],
  }));
}

describe("runNowRoutine Server Action", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    vi.resetModules();
    env = makeTempHome();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-runnow-"));
    process.chdir(tmpRepo);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/runtime-adapters");
  });

  it("claude-routines: returns handoffUrl from adapter watchUrl", async () => {
    // VALIDATION row 13: claude-routines returns a browser-handoff URL that
    // the UI opens in a new tab. Phase 2's claude-routines adapter returns
    // the URL as `watchUrl`; this wrapper surfaces it as `handoffUrl` for
    // consistent UI semantics.
    seedBundle(tmpRepo, "routines-cloud", "morning-brief", "claude");
    mockAdapterRegistry({
      "claude-routines": async () => ({
        ok: true,
        runId: "session-xyz",
        watchUrl: "https://claude.ai/code/routines/sessions/xyz",
      }),
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "claude-routines", slug: "morning-brief" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.handoffUrl).toBe("https://claude.ai/code/routines/sessions/xyz");
      expect(res.runId).toBe("session-xyz");
      expect(res.watchUrl).toBe("https://claude.ai/code/routines/sessions/xyz");
    }
  });

  it("claude-desktop: invokes adapter.runNow with the bundle and returns runId", async () => {
    // VALIDATION row 14: Phase 2's claude-desktop adapter shells out to
    // `claude -p <prompt>`; this wrapper must pass the bundle through
    // unmodified and surface the resulting runId.
    seedBundle(tmpRepo, "routines-local", "claude-task", "claude");
    const spy = vi.fn((..._args: unknown[]) => Promise.resolve({ ok: true, runId: "claude-pid-42" }));
    mockAdapterRegistry({
      "claude-desktop": spy,
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "claude-desktop", slug: "claude-task" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runId).toBe("claude-pid-42");
      // No handoffUrl for claude-desktop — that's claude-routines only
      expect(res.handoffUrl).toBeUndefined();
    }
    expect(spy).toHaveBeenCalledTimes(1);
    // Bundle passed through: slug and runtime match the seeded bundle
    const callArg = spy.mock.calls[0]?.[0] as { slug: string; runtime: string } | undefined;
    expect(callArg).toBeDefined();
    expect(callArg!.slug).toBe("claude-task");
    expect(callArg!.runtime).toBe("claude-desktop");
  });

  it("codex detached: adapter.runNow returns runId for fire-and-forget spawn", async () => {
    // VALIDATION row 15: Phase 2's codex adapter spawns the supervisor with
    // `detached:true, stdio:"ignore"` and calls `.unref()`. This wrapper
    // must return the `{ok:true, runId}` shape unchanged so the UI's toast
    // shows "Started <slug> on codex" and the Morning Queue can cross-ref
    // the audit.jsonl entry by runId.
    seedBundle(tmpRepo, "routines-codex", "nightly", "codex");
    mockAdapterRegistry({
      codex: async () => ({ ok: true, runId: "codex-pid-12345" }),
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "codex", slug: "nightly" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runId).toBe("codex-pid-12345");
      expect(res.handoffUrl).toBeUndefined();
    }
  });

  it("gemini detached: same shape as codex", async () => {
    // VALIDATION row 16: gemini's adapter shares the supervisor-spawn shape
    // with codex. The wrapper is runtime-agnostic — just a dispatcher.
    seedBundle(tmpRepo, "routines-gemini", "sync", "gemini");
    mockAdapterRegistry({
      gemini: async () => ({ ok: true, runId: "gemini-pid-67890" }),
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "gemini", slug: "sync" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runId).toBe("gemini-pid-67890");
      expect(res.handoffUrl).toBeUndefined();
    }
  });

  it("adapter.runNow error surfaces as {ok:false, error}", async () => {
    // Defensive path: adapter.runNow returns ok:false; wrapper propagates
    // the error string without masking or mutating it.
    seedBundle(tmpRepo, "routines-codex", "broken", "codex");
    mockAdapterRegistry({
      codex: async () => ({ ok: false, error: "codex CLI exited 127" }),
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "codex", slug: "broken" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("codex CLI exited 127");
    }
  });

  it("bundle not found returns {ok:false, error} without calling adapter", async () => {
    // Step 0 bail: readBundle returns null → no adapter dispatch. Keeps the
    // runtime adapter registry unburdened for a trivially-rejectable request.
    const spy = vi.fn(async () => ({ ok: true, runId: "should-not-be-called" }));
    mockAdapterRegistry({
      codex: spy,
    });
    const { runNowRoutine } = await import("@/app/routines/actions");
    const res = await runNowRoutine({ runtime: "codex", slug: "missing-slug" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Bundle not found");
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
