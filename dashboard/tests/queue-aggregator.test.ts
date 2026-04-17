import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("queue aggregator", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("merges local + cloud and sorts pending newest-first", async () => {
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      [
        JSON.stringify({ id: "local_1", ts: "2026-04-18T05:00:00Z", fleet: "inbox", status: "pending" }),
        JSON.stringify({ id: "local_2", ts: "2026-04-18T01:00:00Z", fleet: "downloads", status: "approved" }),
      ].join("\n") + "\n"
    );

    fs.writeFileSync(
      path.join(dir, "cloud-cache.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        entries: [
          {
            id: "q_cloud_owner__repo_142",
            ts: "2026-04-18T04:00:00Z",
            fleet: "deps-upgrader",
            kind: "cloud-pr",
            payload: { pr_url: "https://github.com/owner/repo/pull/142" },
            reversibility: "green",
            status: "pending",
          },
        ],
      })
    );

    const { aggregateQueue } = await import("@/lib/queue-aggregator");
    const q = await aggregateQueue({ fetchCloud: false });
    expect(q.pending.length).toBe(2);
    // newest-first
    expect(q.pending[0].id).toBe("local_1");
    expect(q.pending[1].id).toBe("q_cloud_owner__repo_142");
    expect(q.recent.length).toBe(1);
    expect(q.recent[0].id).toBe("local_2");
    expect(q.localCount).toBe(2);
    expect(q.cloudCount).toBe(1);
  });

  it("falls back to cached cloud entries on fetch error", async () => {
    fs.writeFileSync(
      path.join(dir, "cloud-cache.json"),
      JSON.stringify({
        fetchedAt: "2020-01-01T00:00:00Z", // very stale, will trigger fetch
        entries: [
          {
            id: "q_cloud_cached",
            ts: "2026-04-17T01:00:00Z",
            fleet: "x",
            status: "pending",
          },
        ],
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const { writeGithubToken, writeSettings } = await import("@/lib/settings");
    writeGithubToken("ghp_test");
    writeSettings({ tracked_repos: ["owner/repo"] });

    const { aggregateQueue } = await import("@/lib/queue-aggregator");
    const q = await aggregateQueue({ fetchCloud: true });
    expect(q.cloudError).toBe("network down");
    // The cached entry should still surface
    expect(q.pending.find((e) => e.id === "q_cloud_cached")).toBeTruthy();

    globalThis.fetch = originalFetch;
  });
});
