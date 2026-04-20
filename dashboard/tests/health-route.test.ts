/**
 * /api/health/all Route Handler — direct GET invocation matrix.
 *
 * Strategy: `vi.doMock("@/lib/runtime-adapters", ...)` substitutes a fake
 * ADAPTERS map with per-test healthCheck overrides, then imports the route
 * module fresh (vi.resetModules before each it() block). This reaches
 * through the Next.js dev-server boundary — we invoke the exported GET
 * function directly, parse the NextResponse JSON, and assert shape.
 *
 * Covers 04-VALIDATION.md rows 28 (shape), 29 (timeout), 30 (adapter
 * throws) plus two additional blocks for full-runtime-set coverage and
 * successful-adapter preservation.
 *
 * No real child_process, no real Route Handler caching concerns — the
 * handler is a pure function of ADAPTERS + time, both of which we control.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

type HealthCheckFn = () => Promise<HealthStatus>;

function makeAdapter(runtime: Runtime, healthCheck?: HealthCheckFn) {
  return {
    runtime,
    deploy: async () => ({ ok: true }),
    undeploy: async () => ({ ok: true }),
    runNow: async () => ({ ok: true }),
    listRuns: async () => [],
    healthCheck:
      healthCheck ??
      (async () => ({
        runtime,
        available: false,
        reason: "mocked default",
      })),
  };
}

function mockAdapters(overrides: Partial<Record<Runtime, HealthCheckFn>>) {
  vi.doMock("@/lib/runtime-adapters", () => ({
    ADAPTERS: {
      "claude-routines": makeAdapter(
        "claude-routines",
        overrides["claude-routines"],
      ),
      "claude-desktop": makeAdapter(
        "claude-desktop",
        overrides["claude-desktop"],
      ),
      codex: makeAdapter("codex", overrides.codex),
      gemini: makeAdapter("gemini", overrides.gemini),
    },
  }));
}

describe("/api/health/all Route Handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.doUnmock("@/lib/runtime-adapters");
  });

  it("shape — returns {statuses, checkedAt} with 4 entries", async () => {
    mockAdapters({});
    const { GET } = await import("@/app/api/health/all/route");
    const res = await GET();
    const json = await res.json();
    expect(json).toHaveProperty("statuses");
    expect(json).toHaveProperty("checkedAt");
    expect(json.statuses).toHaveLength(4);
    expect(json.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Sanity: the ISO timestamp parses back to a valid Date
    expect(Number.isNaN(Date.parse(json.checkedAt))).toBe(false);
  });

  it("each runtime appears exactly once in statuses", async () => {
    mockAdapters({});
    const { GET } = await import("@/app/api/health/all/route");
    const res = await GET();
    const json = await res.json();
    const runtimes = json.statuses.map((s: HealthStatus) => s.runtime).sort();
    expect(runtimes).toEqual([
      "claude-desktop",
      "claude-routines",
      "codex",
      "gemini",
    ]);
  });

  it("timeout — hung adapter times out at 2000ms", async () => {
    vi.useFakeTimers();
    mockAdapters({
      codex: () => new Promise<HealthStatus>(() => undefined), // never resolves
    });
    const { GET } = await import("@/app/api/health/all/route");
    const resPromise = GET();
    // Advance past the 2000ms timeout so the withTimeout race resolves
    await vi.advanceTimersByTimeAsync(2100);
    const res = await resPromise;
    const json = await res.json();
    const codex = json.statuses.find(
      (s: HealthStatus) => s.runtime === "codex",
    );
    expect(codex).toBeDefined();
    expect(codex.available).toBe(false);
    expect(codex.reason).toMatch(/timed out/);
    expect(codex.reason).toMatch(/2000ms/);
  });

  it("adapter throws — Promise.allSettled captures throw without crashing", async () => {
    mockAdapters({
      gemini: async () => {
        throw new Error("boom");
      },
    });
    const { GET } = await import("@/app/api/health/all/route");
    const res = await GET();
    const json = await res.json();
    expect(json.statuses).toHaveLength(4);
    const gemini = json.statuses.find(
      (s: HealthStatus) => s.runtime === "gemini",
    );
    expect(gemini).toBeDefined();
    expect(gemini.available).toBe(false);
    expect(gemini.reason).toMatch(/healthCheck threw: boom/);
    // Other adapters still resolved — allSettled did not short-circuit
    const codex = json.statuses.find(
      (s: HealthStatus) => s.runtime === "codex",
    );
    expect(codex).toBeDefined();
  });

  it("successful adapter preserves available:true and version verbatim", async () => {
    mockAdapters({
      codex: async () => ({
        runtime: "codex",
        available: true,
        version: "codex 0.121.0",
      }),
    });
    const { GET } = await import("@/app/api/health/all/route");
    const res = await GET();
    const json = await res.json();
    const codex = json.statuses.find(
      (s: HealthStatus) => s.runtime === "codex",
    );
    expect(codex).toBeDefined();
    expect(codex.available).toBe(true);
    expect(codex.version).toBe("codex 0.121.0");
    expect(codex.reason).toBeUndefined();
  });

  it("Route Handler module exports force-dynamic + revalidate=0 (no caching)", async () => {
    mockAdapters({});
    const mod = await import("@/app/api/health/all/route");
    expect(mod.dynamic).toBe("force-dynamic");
    expect(mod.revalidate).toBe(0);
  });
});
