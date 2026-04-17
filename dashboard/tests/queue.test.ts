import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
});
