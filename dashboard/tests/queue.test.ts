import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("queue lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(async () => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
  });

  it("readLocalQueue returns empty when no file exists", async () => {
    const { readLocalQueue } = await import("@/lib/queue");
    expect(readLocalQueue()).toEqual([]);
  });

  it("readLocalQueue parses jsonl entries and tags them as local source", async () => {
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      [
        JSON.stringify({ id: "q_1", ts: "2026-04-18T01:00:00Z", fleet: "x", status: "pending" }),
        JSON.stringify({ id: "q_2", ts: "2026-04-18T02:00:00Z", fleet: "y", status: "approved" }),
      ].join("\n") + "\n"
    );
    const { readLocalQueue } = await import("@/lib/queue");
    const entries = readLocalQueue();
    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe("local");
    expect(entries[0].id).toBe("q_1");
    expect(entries[1].status).toBe("approved");
  });

  it("readLocalQueue skips malformed lines without throwing", async () => {
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      [
        JSON.stringify({ id: "q_ok", ts: "x", fleet: "y", status: "pending" }),
        "{this is not valid json",
        "",
        JSON.stringify({ id: "q_ok2", ts: "x", fleet: "y", status: "pending" }),
      ].join("\n")
    );
    const { readLocalQueue } = await import("@/lib/queue");
    const entries = readLocalQueue();
    expect(entries.map((e) => e.id)).toEqual(["q_ok", "q_ok2"]);
  });

  it("appendQueueEntry adds a line", async () => {
    const { appendQueueEntry, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({ id: "q_a", ts: "2026-04-18T00:00:00Z", fleet: "f", status: "pending" });
    appendQueueEntry({ id: "q_b", ts: "2026-04-18T00:01:00Z", fleet: "f", status: "pending" });
    expect(readLocalQueue().map((e) => e.id)).toEqual(["q_a", "q_b"]);
  });

  it("updateLocalStatus updates a known id and returns true", async () => {
    const { appendQueueEntry, updateLocalStatus, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({ id: "q_x", ts: "2026-04-18T00:00:00Z", fleet: "f", status: "pending" });
    expect(updateLocalStatus("q_x", "approved")).toBe(true);
    expect(readLocalQueue()[0].status).toBe("approved");
  });

  it("updateLocalStatus waits on the same flock sidecar used by shell hooks", async () => {
    if (!fs.existsSync("/usr/bin/flock") && !process.env.PATH?.split(":").some((p) => fs.existsSync(path.join(p, "flock")))) {
      return;
    }
    const { appendQueueEntry, updateLocalStatus, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({ id: "q_lock", ts: "2026-04-18T00:00:00Z", fleet: "f", status: "pending" });

    const lockPath = path.join(dir, "queue.jsonl.lock");
    const holder = spawn("flock", ["-x", lockPath, "sleep", "0.4"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 100));

    const started = Date.now();
    expect(updateLocalStatus("q_lock", "approved")).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(readLocalQueue()[0].status).toBe("approved");
    await new Promise((resolve) => holder.on("exit", resolve));
  });

  it("updateLocalStatus returns false for unknown id", async () => {
    const { updateLocalStatus } = await import("@/lib/queue");
    expect(updateLocalStatus("q_doesnt_exist", "approved")).toBe(false);
  });

  it("pendingCount counts only pending entries", async () => {
    const { pendingCount } = await import("@/lib/queue");
    expect(
      pendingCount([
        { id: "1", ts: "x", fleet: "f", status: "pending" },
        { id: "2", ts: "x", fleet: "f", status: "approved" },
        { id: "3", ts: "x", fleet: "f", status: "pending" },
      ])
    ).toBe(2);
  });

  it("round-trips source:'codex' and status:'complete' through append + read", async () => {
    const { appendQueueEntry, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({
      id: "q_codex_test_1",
      ts: "2026-04-21T00:00:00Z",
      fleet: "codex/daily-brief",
      status: "complete",
      source: "codex",
      kind: "supervisor-run",
      payload: { event: "completed" },
    });
    const found = readLocalQueue().find((e) => e.id === "q_codex_test_1");
    // readLocalQueue eagerly re-tags source:"local" (queue.ts:58) — that is v0.1
    // behavior preserved by this widen plan. This assertion proves the widened
    // status literal survives the JSON round-trip; source:"codex" entries flow
    // through readSupervisorRuns in Plan 05-03, not readLocalQueue.
    expect(found?.status).toBe("complete");
    expect(found?.kind).toBe("supervisor-run");
  });

  it("round-trips status:'failed' with source:'gemini' through parseLines", async () => {
    const { appendQueueEntry, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({
      id: "q_gemini_test_1",
      ts: "2026-04-21T00:01:00Z",
      fleet: "gemini/news",
      status: "failed",
      source: "gemini",
      payload: { event: "failed", exit_code: 1 },
    });
    const found = readLocalQueue().find((e) => e.id === "q_gemini_test_1");
    expect(found?.status).toBe("failed");
  });

  it("appendQueueEntry accepts source:'gemini' with status:'complete' combined", async () => {
    const { appendQueueEntry, readLocalQueue } = await import("@/lib/queue");
    appendQueueEntry({
      id: "q_combo_1",
      ts: "2026-04-21T00:02:00Z",
      fleet: "gemini/triage",
      status: "complete",
      source: "gemini",
      kind: "supervisor-run",
    });
    const found = readLocalQueue().find((e) => e.id === "q_combo_1");
    expect(found?.status).toBe("complete");
    expect(found?.fleet).toBe("gemini/triage");
  });
});
