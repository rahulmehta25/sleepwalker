import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("approval lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => env.restore());

  it("enqueueForExecution writes a task file for local entries with tool+args", async () => {
    const { enqueueForExecution } = await import("@/lib/approval");
    const file = enqueueForExecution({
      id: "q_test_1",
      ts: "2026-04-18T01:00:00Z",
      fleet: "inbox-triage",
      tool: "WebFetch",
      args: { url: "https://example.com", prompt: "x" },
      reversibility: "red",
      session: "sess-1",
      status: "approved",
      source: "local",
    });
    expect(file).not.toBeNull();
    expect(file).toContain(".sleepwalker/approved/q_test_1.task");

    const content = JSON.parse(fs.readFileSync(file!, "utf8"));
    expect(content.fleet).toBe("inbox-triage");
    expect(content.tool).toBe("WebFetch");
    expect(content.args.url).toBe("https://example.com");
    expect(content.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("enqueueForExecution returns null for cloud entries (those are PRs)", async () => {
    const { enqueueForExecution } = await import("@/lib/approval");
    const file = enqueueForExecution({
      id: "q_cloud_1",
      ts: "2026-04-18T01:00:00Z",
      fleet: "deps",
      kind: "cloud-pr",
      payload: { pr_url: "https://github.com/x/y/pull/1" },
      status: "approved",
      source: "cloud",
    });
    expect(file).toBeNull();
  });

  it("enqueueForExecution returns null for entries without tool+args (notifications, drafts)", async () => {
    const { enqueueForExecution } = await import("@/lib/approval");
    const file = enqueueForExecution({
      id: "q_notif_1",
      ts: "2026-04-18T01:00:00Z",
      fleet: "morning-brief",
      kind: "notification",
      payload: { message: "brief ready" },
      status: "approved",
      source: "local",
    });
    expect(file).toBeNull();
  });

  it("pendingExecutionCount returns the inbox size", async () => {
    const { enqueueForExecution, pendingExecutionCount } = await import("@/lib/approval");
    expect(pendingExecutionCount()).toBe(0);
    enqueueForExecution({
      id: "q_a", ts: "x", fleet: "f", tool: "Edit", args: { x: 1 }, status: "approved", source: "local",
    });
    enqueueForExecution({
      id: "q_b", ts: "x", fleet: "f", tool: "Edit", args: { x: 2 }, status: "approved", source: "local",
    });
    expect(pendingExecutionCount()).toBe(2);
  });
});
