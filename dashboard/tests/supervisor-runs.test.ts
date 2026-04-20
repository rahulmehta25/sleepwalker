import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

/**
 * Covers the RESEARCH §6.1 matrix for `readSupervisorRuns()`:
 * 1.  empty-file / missing-file graceful paths
 * 2.  runtime filter  (codex + gemini only; v0.1 hook entries dropped)
 * 3.  event filter    (started dropped; 4 terminal events retained)
 * 4.  mapper contract (completed -> complete, failed -> failed,
 *                      budget_exceeded -> failed, deferred -> rejected)
 * 5.  24-hour cutoff
 * 6.  malformed-line recovery (never throws)
 *
 * Fixtures are real files written via fs.writeFileSync into a temp HOME
 * (per TESTING.md "What NOT to Mock" — fs is never mocked).
 */
describe("readSupervisorRuns", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
  });

  function writeAudit(lines: Array<object | string>): void {
    const serialized =
      lines
        .map((l) => (typeof l === "string" ? l : JSON.stringify(l)))
        .join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "audit.jsonl"), serialized);
  }

  function nowIso(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString();
  }

  it("returns empty when audit.jsonl does not exist", async () => {
    // No writeAudit() call — directory exists but file does not.
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    expect(readSupervisorRuns()).toEqual([]);
  });

  it("returns empty when audit.jsonl is empty", async () => {
    fs.writeFileSync(path.join(dir, "audit.jsonl"), "");
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    expect(readSupervisorRuns()).toEqual([]);
  });

  it("filters out v0.1 hook entries that lack a runtime field", async () => {
    writeAudit([
      // v0.1 PostToolUse hook audit shape — no runtime, no event.
      { ts: nowIso(), fleet: "inbox-triage", tool: "Read", input: {}, output_preview: "x" },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    expect(readSupervisorRuns()).toEqual([]);
  });

  it("filters to codex and gemini runtimes only", async () => {
    writeAudit([
      // v0.1 hook entry (no runtime)
      { ts: nowIso(), fleet: "inbox-triage", tool: "Read" },
      // codex terminal — keep
      { ts: nowIso(), fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 },
      // gemini terminal — keep
      { ts: nowIso(), fleet: "gemini/news", runtime: "gemini", event: "failed", exit_code: 1, reason: "cli crash" },
      // Hypothetical future runtime — drop until explicitly whitelisted
      { ts: nowIso(), fleet: "claude-desktop/foo", runtime: "claude-desktop", event: "completed" },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.source).sort()).toEqual(["codex", "gemini"]);
  });

  it("filters out 'started' events (paired with terminal events later)", async () => {
    writeAudit([
      { ts: nowIso(), fleet: "codex/daily-brief", runtime: "codex", event: "started", cli: "/usr/local/bin/codex", budget: 40000 },
      { ts: nowIso(), fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect((entries[0].payload as { event: string }).event).toBe("completed");
  });

  it("maps completed event to status complete with full payload", async () => {
    writeAudit([
      { ts: nowIso(), fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("complete");
    expect(entries[0].kind).toBe("supervisor-run");
    expect(entries[0].source).toBe("codex");
    expect(entries[0].fleet).toBe("codex/daily-brief");
    expect((entries[0].payload as { chars_consumed: number }).chars_consumed).toBe(500);
    expect((entries[0].payload as { event: string }).event).toBe("completed");
    expect((entries[0].payload as { preview: string }).preview).toBe("done");
    expect((entries[0].payload as { exit_code: number }).exit_code).toBe(0);
  });

  it("maps failed event to status failed with reason in payload", async () => {
    writeAudit([
      { ts: nowIso(), fleet: "gemini/news", runtime: "gemini", event: "failed", exit_code: 1, reason: "cli crash" },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("failed");
    expect(entries[0].source).toBe("gemini");
    expect((entries[0].payload as { reason: string }).reason).toBe("cli crash");
    expect((entries[0].payload as { exit_code: number }).exit_code).toBe(1);
  });

  it("maps budget_exceeded to status failed with chars_consumed + chars_limit in payload", async () => {
    writeAudit([
      {
        ts: nowIso(),
        fleet: "codex/long-runner",
        runtime: "codex",
        event: "budget_exceeded",
        chars_consumed: 42000,
        chars_limit: 40000,
        partial_output_bytes: 42100,
        preview: "truncated output",
        exit_code: 143,
      },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("failed");
    const payload = entries[0].payload as {
      event: string;
      chars_consumed: number;
      chars_limit: number;
      partial_output_bytes: number;
    };
    expect(payload.event).toBe("budget_exceeded");
    expect(payload.chars_consumed).toBe(42000);
    expect(payload.chars_limit).toBe(40000);
    expect(payload.partial_output_bytes).toBe(42100);
  });

  it("maps deferred to status rejected with reason + hour in payload", async () => {
    writeAudit([
      { ts: nowIso(), fleet: "gemini/overnight", runtime: "gemini", event: "deferred", reason: "sleep window", hour: 2 },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("rejected");
    expect(entries[0].source).toBe("gemini");
    const payload = entries[0].payload as { reason: string; hour: number; event: string };
    expect(payload.event).toBe("deferred");
    expect(payload.reason).toBe("sleep window");
    expect(payload.hour).toBe(2);
  });

  it("drops entries older than the 24h cutoff", async () => {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    writeAudit([
      { ts: fortyEightHoursAgo, fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "stale", exit_code: 0 },
      // Fresh entry — should survive
      { ts: nowIso(), fleet: "gemini/news", runtime: "gemini", event: "completed", chars_consumed: 200, preview: "fresh", exit_code: 0 },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("gemini");
  });

  it("skips malformed JSON lines without throwing", async () => {
    writeAudit([
      "not-json-at-all",
      { ts: nowIso(), fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 },
      "{\"unterminated: ",
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("complete");
  });

  it("generates deterministic q_sup_* ids from runtime + fleet + ts + event", async () => {
    const ts = "2026-04-21T03:00:00Z";
    writeAudit([
      { ts, fleet: "codex/daily-brief", runtime: "codex", event: "completed", chars_consumed: 500, preview: "done", exit_code: 0 },
    ]);
    const { readSupervisorRuns } = await import("@/lib/queue-aggregator");
    const entries = readSupervisorRuns();
    expect(entries).toHaveLength(1);
    // Prefix marks this as a supervisor run; munged fleet uses __ for '/'
    expect(entries[0].id).toMatch(/^q_sup_codex_codex__daily-brief_\d+_completed$/);
  });
});
