import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("ensureStagedSupervisor", () => {
  let tempHome: string;
  let tempRepo: string;
  let origHome: string | undefined;
  let origRoot: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "sw-home-"));
    tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), "sw-repo-"));
    await fs.mkdir(path.join(tempRepo, "bin"), { recursive: true });
    // Write a canonical dev supervisor (content doesn't matter for test —
    // just needs stable bytes so hash is deterministic across test runs).
    await fs.writeFile(
      path.join(tempRepo, "bin", "sleepwalker-run-cli"),
      "#!/bin/bash\necho 'test supervisor'\n",
      { mode: 0o755 },
    );
    origHome = process.env.HOME;
    origRoot = process.env.SLEEPWALKER_REPO_ROOT;
    process.env.HOME = tempHome;
    process.env.SLEEPWALKER_REPO_ROOT = tempRepo;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    if (origRoot !== undefined) process.env.SLEEPWALKER_REPO_ROOT = origRoot;
    else delete process.env.SLEEPWALKER_REPO_ROOT;
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempRepo, { recursive: true, force: true });
  });

  it("stages the supervisor to ~/.sleepwalker/bin/sleepwalker-run-cli-<hash>", async () => {
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    const staged = await ensureStagedSupervisor();
    // macOS often realpath-resolves /var/folders/... to /private/var/folders/...
    // so allow either the tempHome-as-given or its /private-prefixed form.
    const expectedSuffix = /\/\.sleepwalker\/bin\/sleepwalker-run-cli-[0-9a-f]{8}$/;
    expect(staged).toMatch(expectedSuffix);
    const stat = await fs.stat(staged);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o777).toBe(0o755);
  });

  it("is idempotent when source has not changed", async () => {
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    const first = await ensureStagedSupervisor();
    const firstStat = await fs.stat(first);
    // Sleep 10ms so mtime would differ if a re-copy happened.
    await new Promise((r) => setTimeout(r, 10));
    const second = await ensureStagedSupervisor();
    expect(second).toBe(first);
    const secondStat = await fs.stat(second);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("produces a new versioned filename when source content changes", async () => {
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    const first = await ensureStagedSupervisor();
    await fs.writeFile(
      path.join(tempRepo, "bin", "sleepwalker-run-cli"),
      "#!/bin/bash\necho 'updated'\n",
      { mode: 0o755 },
    );
    const second = await ensureStagedSupervisor();
    expect(second).not.toBe(first);
    // Concurrent-deploy safety: old version still exists on disk
    await expect(fs.stat(first)).resolves.toBeDefined();
    await expect(fs.stat(second)).resolves.toBeDefined();
  });

  it("creates ~/.sleepwalker/bin/ when it does not exist", async () => {
    const binDir = path.join(tempHome, ".sleepwalker", "bin");
    await expect(fs.stat(binDir)).rejects.toThrow(/ENOENT/);
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    await ensureStagedSupervisor();
    const stat = await fs.stat(binDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("throws a clear error when source is missing", async () => {
    await fs.unlink(path.join(tempRepo, "bin", "sleepwalker-run-cli"));
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    await expect(ensureStagedSupervisor()).rejects.toThrow(
      /Supervisor source not found/,
    );
  });

  it("throws when source is a directory, not a file", async () => {
    await fs.unlink(path.join(tempRepo, "bin", "sleepwalker-run-cli"));
    await fs.mkdir(path.join(tempRepo, "bin", "sleepwalker-run-cli"));
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    await expect(ensureStagedSupervisor()).rejects.toThrow(/not a regular file/);
  });

  it("forces staged mode to 0o755 even if source is 0o600", async () => {
    await fs.chmod(path.join(tempRepo, "bin", "sleepwalker-run-cli"), 0o600);
    const { ensureStagedSupervisor } = await import(
      "@/lib/runtime-adapters/supervisor-staging"
    );
    const staged = await ensureStagedSupervisor();
    const stat = await fs.stat(staged);
    expect(stat.mode & 0o777).toBe(0o755);
  });
});
