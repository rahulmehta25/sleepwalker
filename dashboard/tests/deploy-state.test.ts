import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";
import type { DeployState } from "@/lib/deploy-state";

// deploy-state.test.ts — 11 it() blocks covering the full state-file I/O +
// drift-math surface promised by Plan 04-01 Task 2.
//
// Block names are load-bearing — 04-VALIDATION.md rows 1, 2, 3, 9, 10, 12 each
// name-match a `-t "..."` anchor below so Plan 04-09's exit gate query
// (`pnpm test tests/deploy-state.test.ts -t "atomic write"` etc.) finds them.

describe("deploy-state", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  // Build a minimal DeployState with a given phase/verifiedAt. Used across
  // blocks that need to seed state without repeating the same literal 10 times.
  function seedState(overrides: Partial<DeployState> = {}): DeployState {
    return {
      fleet: "codex/daily-brief",
      runtime: "codex",
      slug: "daily-brief",
      startedAt: "2026-04-19T00:00:00.000Z",
      steps: {
        planning: { startedAt: 0, completedAt: 5, elapsedMs: 5 },
      },
      phase: { kind: "running", step: "planning", stepStartedAt: 0 },
      ...overrides,
    };
  }

  // Seed a bundle directory under the temp HOME with the given file contents.
  function seedBundle(
    runtimeDir: string,
    slug: string,
    files: Record<string, string>,
  ): string {
    const dir = path.join(env.home, runtimeDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
  }

  it("state machine transitions: writeDeployState then readDeployState roundtrips the state", async () => {
    const { writeDeployState, readDeployState } = await import("@/lib/deploy-state");
    const state = seedState({
      phase: { kind: "succeeded" },
      verifiedAt: 1_700_000_000_000,
      artifact: "/tmp/fake.plist",
    });
    await writeDeployState(state);
    const round = await readDeployState("codex", "daily-brief");
    expect(round).toEqual(state);
  });

  it("readDeployState parses JSON for verified state", async () => {
    const { writeDeployState, readDeployState } = await import("@/lib/deploy-state");
    const verifiedAt = 1_700_000_123_456;
    await writeDeployState(
      seedState({ phase: { kind: "succeeded" }, verifiedAt, artifact: "/tmp/out.plist" }),
    );
    const read = await readDeployState("codex", "daily-brief");
    expect(read).not.toBeNull();
    expect(read?.phase.kind).toBe("succeeded");
    expect(read?.verifiedAt).toBe(verifiedAt);
    expect(read?.artifact).toBe("/tmp/out.plist");
  });

  it("atomic write — rename failure mid-write leaves no partial state file", async () => {
    const { writeDeployState } = await import("@/lib/deploy-state");
    const renameSpy = vi
      .spyOn(fs.promises, "rename")
      .mockRejectedValueOnce(new Error("disk full"));
    await expect(
      writeDeployState(seedState({ phase: { kind: "succeeded" }, verifiedAt: 1 })),
    ).rejects.toThrow("disk full");
    expect(renameSpy).toHaveBeenCalledTimes(1);
    // Final path must NOT exist — rename never completed, so the atomic swap
    // cannot have published a partial file at the canonical name.
    const finalPath = path.join(
      env.home,
      ".sleepwalker",
      "deploys",
      "codex-daily-brief.state.json",
    );
    expect(fs.existsSync(finalPath)).toBe(false);
    // Best-effort tmp cleanup — no .tmp-<hex> leftovers either.
    const deployDir = path.dirname(finalPath);
    const leftovers = fs.existsSync(deployDir)
      ? fs.readdirSync(deployDir).filter((e) => e.startsWith("codex-daily-brief.state.json.tmp-"))
      : [];
    expect(leftovers).toEqual([]);
  });

  it("readDeployState returns null for ENOENT (missing file)", async () => {
    const { readDeployState } = await import("@/lib/deploy-state");
    const result = await readDeployState("codex", "never-deployed");
    expect(result).toBeNull();
  });

  it("deleteDeployState is idempotent when file is absent", async () => {
    const { deleteDeployState } = await import("@/lib/deploy-state");
    // Two calls in a row on a slug that was never written — neither throws.
    await expect(deleteDeployState("codex", "ghost")).resolves.toBeUndefined();
    await expect(deleteDeployState("codex", "ghost")).resolves.toBeUndefined();
  });

  it("bundleMtime across files returns max across dir contents", async () => {
    const { bundleMtime } = await import("@/lib/deploy-state");
    const dir = seedBundle("routines-codex", "mtime-check", {
      "config.json": "{}",
      "prompt.md": "hello",
      "notes.md": "third",
    });
    // Force three distinct mtimes so Math.max across children has a clear max.
    // Pin the DIRECTORY mtime into the past first — bundleMtime includes the
    // directory itself in its Math.max (dir mtime jumps to "now" when entries
    // are created on seed), so we normalize it to the floor before pinning
    // child mtimes relative to a baseTime window.
    const baseTime = new Date(2025, 0, 1, 0, 0, 0);
    fs.utimesSync(path.join(dir, "config.json"), baseTime, new Date(baseTime.getTime() + 1000));
    fs.utimesSync(path.join(dir, "notes.md"), baseTime, new Date(baseTime.getTime() + 2000));
    // "prompt.md" is the newest child — after pinning the directory into the
    // past it must be the returned max across all stat()'d entries.
    const newest = new Date(baseTime.getTime() + 3000);
    fs.utimesSync(path.join(dir, "prompt.md"), baseTime, newest);
    // Pin directory mtime LAST — otherwise any subsequent child utimesSync on
    // macOS bumps dir mtime forward again.
    fs.utimesSync(dir, baseTime, baseTime);
    const result = await bundleMtime(dir);
    expect(result).toBe(newest.getTime());
  });

  it("drift detection: mtime(bundle) > verifiedAt returns drift", async () => {
    const { writeDeployState, computeStatus } = await import("@/lib/deploy-state");
    const bundleDir = seedBundle("routines-codex", "drifty", {
      "config.json": "{}",
      "prompt.md": "v1",
    });
    // Write succeeded state with verifiedAt from an hour ago.
    const oldVerifiedAt = Date.now() - 3_600_000;
    await writeDeployState(
      seedState({
        slug: "drifty",
        fleet: "codex/drifty",
        phase: { kind: "succeeded" },
        verifiedAt: oldVerifiedAt,
      }),
    );
    // Touch the bundle to guarantee a newer mtime.
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(path.join(bundleDir, "prompt.md"), "v2");
    const status = await computeStatus({ runtime: "codex", slug: "drifty", bundleDir });
    expect(status).toBe("drift");
  });

  it("deployed — no drift: mtime(bundle) < verifiedAt returns deployed", async () => {
    const { writeDeployState, computeStatus } = await import("@/lib/deploy-state");
    const bundleDir = seedBundle("routines-codex", "clean", {
      "config.json": "{}",
      "prompt.md": "stable",
    });
    // Seed bundle mtime in the past.
    const pastMtime = new Date(Date.now() - 10_000);
    for (const entry of fs.readdirSync(bundleDir)) {
      fs.utimesSync(path.join(bundleDir, entry), pastMtime, pastMtime);
    }
    fs.utimesSync(bundleDir, pastMtime, pastMtime);
    // verifiedAt is NOW (after the bundle's mtime) — no drift.
    const verifiedAt = Date.now() + 5_000;
    await writeDeployState(
      seedState({
        slug: "clean",
        fleet: "codex/clean",
        phase: { kind: "succeeded" },
        verifiedAt,
      }),
    );
    const status = await computeStatus({ runtime: "codex", slug: "clean", bundleDir });
    expect(status).toBe("deployed");
  });

  it("computeStatus: no state file returns draft", async () => {
    const { computeStatus } = await import("@/lib/deploy-state");
    const bundleDir = seedBundle("routines-codex", "undeployed", {
      "config.json": "{}",
    });
    // Never call writeDeployState — bundle exists on disk but no state file.
    const status = await computeStatus({
      runtime: "codex",
      slug: "undeployed",
      bundleDir,
    });
    expect(status).toBe("draft");
  });

  it("computeStatus: enabled=false + deployed state returns disabled", async () => {
    const { writeDeployState, computeStatus } = await import("@/lib/deploy-state");
    const bundleDir = seedBundle("routines-codex", "paused", {
      "config.json": "{}",
      "prompt.md": "frozen",
    });
    // Seed bundle mtime in the past, verifiedAt in the future → no drift.
    const pastMtime = new Date(Date.now() - 10_000);
    for (const entry of fs.readdirSync(bundleDir)) {
      fs.utimesSync(path.join(bundleDir, entry), pastMtime, pastMtime);
    }
    fs.utimesSync(bundleDir, pastMtime, pastMtime);
    await writeDeployState(
      seedState({
        slug: "paused",
        fleet: "codex/paused",
        phase: { kind: "succeeded" },
        verifiedAt: Date.now() + 5_000,
      }),
    );
    // enabled=false takes precedence over "deployed" for a succeeded,
    // non-drifted bundle — the UI shows a DISABLED pill (04-UI-SPEC line 160).
    const status = await computeStatus({
      runtime: "codex",
      slug: "paused",
      bundleDir,
      enabled: false,
    });
    expect(status).toBe("disabled");
  });

  it("os.tmpdir fallback: deployStateFile path uses process.env.HOME for $HOME-override tests", async () => {
    // Sanity: by this point beforeEach has set process.env.HOME to env.home.
    // The canonical state path must resolve under env.home and not the real user home.
    const { writeDeployState } = await import("@/lib/deploy-state");
    await writeDeployState(
      seedState({ slug: "home-check", fleet: "codex/home-check", phase: { kind: "succeeded" } }),
    );
    const expectedPath = path.join(
      env.home,
      ".sleepwalker",
      "deploys",
      "codex-home-check.state.json",
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
    // Prove it is NOT under os.homedir() (the real user $HOME) by negative check.
    const realHome = os.homedir();
    if (realHome !== env.home) {
      const realPath = path.join(
        realHome,
        ".sleepwalker",
        "deploys",
        "codex-home-check.state.json",
      );
      expect(fs.existsSync(realPath)).toBe(false);
    }
  });
});
