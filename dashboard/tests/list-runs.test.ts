import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";
import { listRunsFromAudit } from "@/lib/runtime-adapters/run-history";
import type { RoutineBundle } from "@/lib/runtime-adapters/types";

/**
 * listRuns() is the adapter-level window into ~/.sleepwalker/audit.jsonl
 * scoped to a single fleet. The shared mapper in run-history.ts is the
 * only place where the event -> status contract lives, so these tests
 * pin that contract + the fleet filter + defensive-parse behaviors.
 *
 * Matrix:
 *   1. empty / missing file -> [] (never throws)
 *   2. fleet filter: entries for other fleets are excluded
 *   3. event filter: `started` is dropped, terminal events retained
 *   4. status mapping: completed→succeeded, failed→failed,
 *      budget_exceeded→failed, deferred→deferred
 *   5. preview precedence: preview wins over reason; deferred without
 *      preview falls back to "deferred: <reason>"
 *   6. limit + ordering: newest first, capped at `limit`, and the
 *      filter-then-slice order does not starve the result set when the
 *      audit is dominated by started/other-fleet entries
 *   7. malformed line recovery (never throws, bad line skipped)
 *   8. runtime symmetry (codex + gemini both map identically)
 */

function writeAudit(home: string, lines: Array<Record<string, unknown>>) {
  const dir = ensureSleepwalkerDir(home);
  const file = path.join(dir, "audit.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

// Helper: build a minimal RoutineBundle just for the slug field used by
// listRuns. The other fields don't matter — listRuns only reads slug.
function mkBundle(slug: string, runtime: "codex" | "gemini" = "codex"): RoutineBundle {
  return {
    slug,
    runtime,
    name: `Test ${slug}`,
    prompt: "noop",
    schedule: "0 7 * * *",
    reversibility: "yellow",
    budget: 40000,
    bundlePath: "/tmp/unused",
  };
}

describe("listRunsFromAudit", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
  });

  afterEach(() => {
    env.restore();
  });

  it("returns [] when audit.jsonl does not exist", () => {
    expect(listRunsFromAudit("codex", "missing")).toEqual([]);
  });

  it("returns [] when audit.jsonl is empty", () => {
    ensureSleepwalkerDir(env.home);
    fs.writeFileSync(path.join(env.home, ".sleepwalker", "audit.jsonl"), "");
    expect(listRunsFromAudit("codex", "missing")).toEqual([]);
  });

  it("filters by fleet — other fleet's runs are excluded", () => {
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/a",      runtime: "codex",  event: "completed", preview: "A done" },
      { ts: "2026-04-22T01:01:00Z", fleet: "codex/b",      runtime: "codex",  event: "completed", preview: "B done" },
      { ts: "2026-04-22T01:02:00Z", fleet: "gemini/a",     runtime: "gemini", event: "completed", preview: "G done" },
    ]);
    const runs = listRunsFromAudit("codex", "a");
    expect(runs).toHaveLength(1);
    expect(runs[0].preview).toBe("A done");
    expect(runs[0].runId).toBe("2026-04-22T01:00:00Z:codex/a");
  });

  it("drops `started` events and retains only terminal events", () => {
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/x", runtime: "codex", event: "started",        cli: "/x/codex" },
      { ts: "2026-04-22T01:01:00Z", fleet: "codex/x", runtime: "codex", event: "completed",      preview: "ok" },
      { ts: "2026-04-22T02:00:00Z", fleet: "codex/x", runtime: "codex", event: "started",        cli: "/x/codex" },
      { ts: "2026-04-22T02:01:00Z", fleet: "codex/x", runtime: "codex", event: "failed",         preview: "boom", exit_code: 1 },
    ]);
    const runs = listRunsFromAudit("codex", "x");
    expect(runs.map((r) => r.status)).toEqual(["failed", "succeeded"]);
  });

  it("maps completed -> succeeded, failed + budget_exceeded -> failed, deferred -> deferred", () => {
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/m", runtime: "codex", event: "completed",       preview: "c"  },
      { ts: "2026-04-22T02:00:00Z", fleet: "codex/m", runtime: "codex", event: "failed",          preview: "f"  },
      { ts: "2026-04-22T03:00:00Z", fleet: "codex/m", runtime: "codex", event: "budget_exceeded", preview: "be" },
      { ts: "2026-04-22T04:00:00Z", fleet: "codex/m", runtime: "codex", event: "deferred",        reason:  "outside sleep window", hour: 13 },
    ]);
    const runs = listRunsFromAudit("codex", "m");
    // Newest first: deferred, budget_exceeded, failed, completed
    expect(runs.map((r) => [r.status, r.preview])).toEqual([
      ["deferred",  "deferred: outside sleep window"],
      ["failed",    "be"],
      ["failed",    "f"],
      ["succeeded", "c"],
    ]);
  });

  it("preview precedence: preview field wins over reason; reason is used as deferred fallback", () => {
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/p", runtime: "codex", event: "failed",   preview: "stdout preview", reason: "ignored-reason" },
      { ts: "2026-04-22T02:00:00Z", fleet: "codex/p", runtime: "codex", event: "deferred", reason: "policy balanced red" },
      { ts: "2026-04-22T03:00:00Z", fleet: "codex/p", runtime: "codex", event: "deferred" /* no preview, no reason */ },
    ]);
    const runs = listRunsFromAudit("codex", "p");
    // Newest first
    expect(runs[0].preview).toBeUndefined();           // deferred, no reason
    expect(runs[1].preview).toBe("deferred: policy balanced red");
    expect(runs[2].preview).toBe("stdout preview");    // preview beats reason
  });

  it("respects `limit` and returns newest-first ordering", () => {
    // Write 20 terminal events for the target fleet, interleaved with
    // other-fleet noise to exercise the filter-before-slice path.
    const lines: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 20; i++) {
      lines.push({
        ts: `2026-04-22T${String(i).padStart(2, "0")}:00:00Z`,
        fleet: "codex/lim",
        runtime: "codex",
        event: "completed",
        preview: `run-${i}`,
      });
      // Noise — different fleet and started events
      lines.push({
        ts: `2026-04-22T${String(i).padStart(2, "0")}:00:30Z`,
        fleet: "codex/other",
        runtime: "codex",
        event: "completed",
      });
      lines.push({
        ts: `2026-04-22T${String(i).padStart(2, "0")}:00:45Z`,
        fleet: "codex/lim",
        runtime: "codex",
        event: "started",
      });
    }
    writeAudit(env.home, lines);

    const runs = listRunsFromAudit("codex", "lim", 5);
    expect(runs).toHaveLength(5);
    // Newest first: run-19, run-18, run-17, run-16, run-15
    expect(runs.map((r) => r.preview)).toEqual([
      "run-19", "run-18", "run-17", "run-16", "run-15",
    ]);
  });

  it("does not throw on malformed JSON lines; skips them", () => {
    const dir = ensureSleepwalkerDir(env.home);
    const file = path.join(dir, "audit.jsonl");
    const good1 = JSON.stringify({
      ts: "2026-04-22T01:00:00Z", fleet: "codex/q", runtime: "codex", event: "completed", preview: "g1",
    });
    const good2 = JSON.stringify({
      ts: "2026-04-22T02:00:00Z", fleet: "codex/q", runtime: "codex", event: "failed", preview: "g2",
    });
    // Deliberately malformed middle line + a half-truncated tail line
    fs.writeFileSync(
      file,
      [good1, "{not json at all", `{"partial": tru`, good2].join("\n") + "\n",
    );

    const runs = listRunsFromAudit("codex", "q");
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.preview)).toEqual(["g2", "g1"]);
  });

  it("works identically for the gemini runtime (fleet prefix is the only difference)", () => {
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/shared",  runtime: "codex",  event: "completed", preview: "C" },
      { ts: "2026-04-22T01:01:00Z", fleet: "gemini/shared", runtime: "gemini", event: "completed", preview: "G" },
    ]);
    const codex  = listRunsFromAudit("codex",  "shared");
    const gemini = listRunsFromAudit("gemini", "shared");
    expect(codex).toHaveLength(1);
    expect(gemini).toHaveLength(1);
    expect(codex[0].preview).toBe("C");
    expect(gemini[0].preview).toBe("G");
    expect(gemini[0].runId).toBe("2026-04-22T01:01:00Z:gemini/shared");
  });

  it("drops entries without the supervisor shape (v0.1 hook audit lines)", () => {
    writeAudit(env.home, [
      // v0.1 hook-style entry — has fleet + tool + output_preview but no runtime/event
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/h", tool: "WebFetch", output_preview: "x" },
      // Supervisor entry
      { ts: "2026-04-22T02:00:00Z", fleet: "codex/h", runtime: "codex", event: "completed", preview: "real" },
    ]);
    const runs = listRunsFromAudit("codex", "h");
    expect(runs).toHaveLength(1);
    expect(runs[0].preview).toBe("real");
  });
});

describe("listRuns on real adapter objects", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
  });
  afterEach(() => {
    env.restore();
  });

  it("codex adapter returns runs filtered by fleet", async () => {
    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/alpha",  runtime: "codex",  event: "completed", preview: "α" },
      { ts: "2026-04-22T01:01:00Z", fleet: "codex/beta",   runtime: "codex",  event: "completed", preview: "β" },
      { ts: "2026-04-22T01:02:00Z", fleet: "gemini/alpha", runtime: "gemini", event: "completed", preview: "γ" },
    ]);
    const runs = await codexAdapter.listRuns(mkBundle("alpha", "codex"));
    expect(runs).toHaveLength(1);
    expect(runs[0].preview).toBe("α");
  });

  it("gemini adapter returns runs filtered by fleet", async () => {
    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    writeAudit(env.home, [
      { ts: "2026-04-22T01:00:00Z", fleet: "codex/alpha",  runtime: "codex",  event: "completed", preview: "α" },
      { ts: "2026-04-22T01:01:00Z", fleet: "gemini/alpha", runtime: "gemini", event: "completed", preview: "γ" },
      { ts: "2026-04-22T01:02:00Z", fleet: "gemini/beta",  runtime: "gemini", event: "failed",    preview: "δ" },
    ]);
    const runs = await geminiAdapter.listRuns(mkBundle("alpha", "gemini"));
    expect(runs).toHaveLength(1);
    expect(runs[0].preview).toBe("γ");
    expect(runs[0].status).toBe("succeeded");
  });

  it("respects caller-supplied limit on both adapters", async () => {
    const { codexAdapter } = await import("@/lib/runtime-adapters/codex");
    const { geminiAdapter } = await import("@/lib/runtime-adapters/gemini");
    const lines: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 10; i++) {
      lines.push({
        ts: `2026-04-22T0${i}:00:00Z`,
        fleet: "codex/L",
        runtime: "codex",
        event: "completed",
        preview: `c${i}`,
      });
      lines.push({
        ts: `2026-04-22T0${i}:00:30Z`,
        fleet: "gemini/L",
        runtime: "gemini",
        event: "completed",
        preview: `g${i}`,
      });
    }
    writeAudit(env.home, lines);

    const codexRuns  = await codexAdapter.listRuns(mkBundle("L", "codex"), 3);
    const geminiRuns = await geminiAdapter.listRuns(mkBundle("L", "gemini"), 3);
    expect(codexRuns).toHaveLength(3);
    expect(geminiRuns).toHaveLength(3);
    expect(codexRuns[0].preview).toBe("c9");
    expect(geminiRuns[0].preview).toBe("g9");
  });
});
