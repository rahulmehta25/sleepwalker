import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("cloud-cache lib", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("readCachedCloudQueue returns empty when no cache exists", async () => {
    const { readCachedCloudQueue } = await import("@/lib/cloud-cache");
    expect(readCachedCloudQueue()).toEqual([]);
  });

  it("fetchCloudQueue returns entries shaped like QueueEntry", async () => {
    // Mock out github.ts's listSleepwalkerPRs by mocking the global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "tester" }), { status: 200 });
      }
      if (u.includes("/pulls?")) {
        return new Response(
          JSON.stringify([
            {
              number: 142,
              title: "[sleepwalker] dependency-upgrader: bump 12 deps",
              body: "Updated next 15.1.4 → 15.2.0",
              head: { ref: "claude/sleepwalker/deps/2026-04-18" },
              base: { ref: "main" },
              user: { login: "claude-bot" },
              html_url: "https://github.com/owner/repo/pull/142",
              created_at: "2026-04-18T04:00:00Z",
              updated_at: "2026-04-18T04:00:00Z",
              draft: false,
              state: "open",
              additions: 30,
              deletions: 18,
              changed_files: 2,
            },
            {
              // Should be filtered out — not a sleepwalker branch
              number: 143,
              title: "Random PR",
              body: "",
              head: { ref: "feature/foo" },
              base: { ref: "main" },
              user: { login: "human" },
              html_url: "https://github.com/owner/repo/pull/143",
              created_at: "2026-04-18T05:00:00Z",
              updated_at: "2026-04-18T05:00:00Z",
              draft: false,
              state: "open",
            },
          ]),
          { status: 200 }
        );
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    // Configure settings + token
    const { writeSettings, writeGithubToken } = await import("@/lib/settings");
    writeGithubToken("ghp_test");
    writeSettings({ tracked_repos: ["owner/repo"] });

    const { fetchCloudQueue } = await import("@/lib/cloud-cache");
    const entries = await fetchCloudQueue(true);
    expect(entries.length).toBe(1);
    // Fleet name is extracted from the second segment of the branch.
    // Routines push to short, friendly names like "deps" rather than full ids.
    expect(entries[0].fleet).toBe("deps");
    expect(entries[0].source).toBeUndefined(); // queue-aggregator tags this
    expect(entries[0].kind).toBe("cloud-pr");
    expect(entries[0].payload?.pr_url).toContain("/pull/142");

    globalThis.fetch = originalFetch;
  });
});
