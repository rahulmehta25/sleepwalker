import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

// 14 v0.1 routine slugs — LOCAL_SLUGS + CLOUD_SLUGS from docs/ROUTINES.md.
// These are the backward-compat contract: removing any of the 14 below is a
// v0.1 regression. Phase 5's queue-aggregator.test.ts already covers v0.2
// supervisor-run shapes — this file intentionally covers ONLY v0.1 fields.
const LOCAL_SLUGS = [
  "sleepwalker-calendar-prep",
  "sleepwalker-disk-cleanup",
  "sleepwalker-downloads-organizer",
  "sleepwalker-inbox-triage",
  "sleepwalker-screenshot-reviewer",
  "sleepwalker-standup-writer",
] as const;

const CLOUD_SLUGS = [
  "alert-triage",
  "dead-code-pruner",
  "dependency-upgrader",
  "doc-drift-fixer",
  "library-port",
  "morning-brief",
  "pr-reviewer",
  "test-coverage-filler",
] as const;

describe("COMP-01: v0.1 queue aggregator round-trip (14 entries)", () => {
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

  it("surfaces all 14 v0.1 entries without dropping any", async () => {
    // Seed 6 local v0.1 entries in queue.jsonl. v0.1 fields only:
    // id / ts / fleet / status — no runtime, no supervisor kind discriminant.
    const localLines = LOCAL_SLUGS.map((slug, i) =>
      JSON.stringify({
        id: `q_local_${i}`,
        ts: `2026-04-22T${String(10 + i).padStart(2, "0")}:00:00Z`,
        fleet: slug,
        status: "pending" as const,
      })
    );
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      localLines.join("\n") + "\n"
    );

    // Seed 8 cloud v0.1 entries in cloud-cache.json. Shape mirrors the
    // cached output of cloud-cache.ts::fetchCloudQueue for v0.1 cloud PRs.
    const cloudEntries = CLOUD_SLUGS.map((slug, i) => ({
      id: `q_cloud_${i}`,
      ts: `2026-04-22T${String(i).padStart(2, "0")}:00:00Z`,
      fleet: slug,
      kind: "cloud-pr" as const,
      status: "pending" as const,
    }));
    fs.writeFileSync(
      path.join(dir, "cloud-cache.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        entries: cloudEntries,
      })
    );

    // fetchCloud: false -> aggregator reads from cloud-cache.json only.
    // No network I/O, no supervisor-run audit entries seeded.
    const { aggregateQueue } = await import("@/lib/queue-aggregator");
    const q = await aggregateQueue({ fetchCloud: false });

    // All 14 entries surface across pending ∪ recent
    const all = [...q.pending, ...q.recent];
    expect(all.length).toBe(14);

    // v0.1 counts preserved exactly
    expect(q.localCount).toBe(6);
    expect(q.cloudCount).toBe(8);

    // Every v0.1 local slug present in the result set
    for (const slug of LOCAL_SLUGS) {
      expect(
        all.some((e) => e.fleet === slug),
      ).toBe(true);
    }

    // Every v0.1 cloud slug present in the result set
    for (const slug of CLOUD_SLUGS) {
      expect(
        all.some((e) => e.fleet === slug),
      ).toBe(true);
    }
  });

  it("zero v0.1 entries carry supervisor-run discriminants (no v0.2 leakage)", async () => {
    // Same seed — identical 14-entry fixture.
    const localLines = LOCAL_SLUGS.map((slug, i) =>
      JSON.stringify({
        id: `q_local_${i}`,
        ts: `2026-04-22T${String(10 + i).padStart(2, "0")}:00:00Z`,
        fleet: slug,
        status: "pending" as const,
      })
    );
    fs.writeFileSync(
      path.join(dir, "queue.jsonl"),
      localLines.join("\n") + "\n"
    );
    fs.writeFileSync(
      path.join(dir, "cloud-cache.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        entries: CLOUD_SLUGS.map((slug, i) => ({
          id: `q_cloud_${i}`,
          ts: `2026-04-22T${String(i).padStart(2, "0")}:00:00Z`,
          fleet: slug,
          kind: "cloud-pr" as const,
          status: "pending" as const,
        })),
      })
    );

    const { aggregateQueue } = await import("@/lib/queue-aggregator");
    const q = await aggregateQueue({ fetchCloud: false });
    const all = [...q.pending, ...q.recent];

    // No v0.2-shape entries should leak through a v0.1-only seed. If any
    // of these fire, the aggregator has a cross-contamination bug (for
    // example, misattributing a cloud entry to the codex source).
    const anySupervisor = all.some(
      (e) =>
        e.kind === "supervisor-run" ||
        e.source === "codex" ||
        e.source === "gemini",
    );
    expect(anySupervisor).toBe(false);

    // supervisorCount should be 0 for a v0.1-only seed (no audit.jsonl).
    expect(q.supervisorCount).toBe(0);
  });
});
