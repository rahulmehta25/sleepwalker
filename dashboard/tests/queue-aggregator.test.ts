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

  it("aggregateQueue merges all 4 sources: local + cloud + codex + gemini", async () => {
    // 1. Seed local queue.jsonl with one approved (recent) entry
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      JSON.stringify({
        id: "q_local_1",
        ts: "2026-04-21T00:00:00Z",
        fleet: "inbox-triage",
        tool: "Read",
        status: "approved",
      }) + "\n"
    );

    // 2. Seed cloud-cache.json with one pending PR entry
    fs.writeFileSync(
      path.join(dir, "cloud-cache.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        entries: [
          {
            id: "q_cloud_1",
            ts: "2026-04-21T00:01:00Z",
            fleet: "cloud/pr-review",
            kind: "cloud-pr",
            status: "pending",
            source: "cloud",
          },
        ],
      })
    );

    // 3. Seed audit.jsonl with a codex (completed) + a gemini (failed)
    //    terminal event — both within the 24h cutoff.
    const nowIso = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        JSON.stringify({
          ts: nowIso,
          fleet: "codex/daily-brief",
          runtime: "codex",
          event: "completed",
          chars_consumed: 500,
          preview: "done",
          exit_code: 0,
        }),
        JSON.stringify({
          ts: nowIso,
          fleet: "gemini/news",
          runtime: "gemini",
          event: "failed",
          exit_code: 1,
          reason: "cli crash",
        }),
      ].join("\n") + "\n"
    );

    const { aggregateQueue } = await import("@/lib/queue-aggregator");
    const q = await aggregateQueue({ fetchCloud: false });

    expect(q.localCount).toBe(1);
    expect(q.cloudCount).toBe(1);
    expect(q.supervisorCount).toBe(2);

    // Cloud pending -> q.pending; local approved + codex complete + gemini
    // failed -> q.recent. Every one of the 4 source literals surfaces.
    const allSources = new Set(
      [...q.pending, ...q.recent].map((e) => e.source ?? "local")
    );
    expect(allSources.has("local")).toBe(true);
    expect(allSources.has("cloud")).toBe(true);
    expect(allSources.has("codex")).toBe(true);
    expect(allSources.has("gemini")).toBe(true);

    // Supervisor-run entries carry kind:"supervisor-run"
    const supervisorEntries = q.recent.filter(
      (e) => e.kind === "supervisor-run"
    );
    expect(supervisorEntries).toHaveLength(2);
  });
});
