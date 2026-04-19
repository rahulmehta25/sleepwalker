import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("ensureStagedBundle", () => {
  let tempHome: string;
  let tempBundleDir: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "sw-bundle-home-"));
    tempBundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-bundle-src-"));
    await fs.writeFile(
      path.join(tempBundleDir, "prompt.md"),
      "Test prompt content\n",
      { mode: 0o644 },
    );
    await fs.writeFile(
      path.join(tempBundleDir, "config.json"),
      '{"name":"test"}\n',
      { mode: 0o644 },
    );
    origHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempBundleDir, { recursive: true, force: true });
  });

  it("copies prompt.md and config.json to ~/.sleepwalker/staged-bundles/<runtime>/<slug>/", async () => {
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    const staged = await ensureStagedBundle(tempBundleDir, "codex", "my-slug");
    // macOS often realpath-resolves /var/folders/... to /private/var/folders/...
    // so match via suffix rather than exact equality.
    expect(staged).toMatch(
      /\/\.sleepwalker\/staged-bundles\/codex\/my-slug$/,
    );
    const promptContent = await fs.readFile(
      path.join(staged, "prompt.md"),
      "utf8",
    );
    const configContent = await fs.readFile(
      path.join(staged, "config.json"),
      "utf8",
    );
    expect(promptContent).toBe("Test prompt content\n");
    expect(configContent).toBe('{"name":"test"}\n');
    const promptStat = await fs.stat(path.join(staged, "prompt.md"));
    expect(promptStat.mode & 0o777).toBe(0o644);
  });

  it("is idempotent when source files are unchanged", async () => {
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    const staged = await ensureStagedBundle(tempBundleDir, "gemini", "idem");
    const firstStat = await fs.stat(path.join(staged, "prompt.md"));
    // Sleep 10ms so mtime would differ if a re-copy happened.
    await new Promise((r) => setTimeout(r, 10));
    await ensureStagedBundle(tempBundleDir, "gemini", "idem");
    const secondStat = await fs.stat(path.join(staged, "prompt.md"));
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("re-copies when source content changes", async () => {
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    const staged = await ensureStagedBundle(tempBundleDir, "codex", "change");
    await fs.writeFile(
      path.join(tempBundleDir, "prompt.md"),
      "Updated prompt\n",
      { mode: 0o644 },
    );
    await ensureStagedBundle(tempBundleDir, "codex", "change");
    const content = await fs.readFile(
      path.join(staged, "prompt.md"),
      "utf8",
    );
    expect(content).toBe("Updated prompt\n");
  });

  it("creates nested staged-bundles directory tree when missing", async () => {
    const root = path.join(tempHome, ".sleepwalker", "staged-bundles");
    await expect(fs.stat(root)).rejects.toThrow(/ENOENT/);
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    await ensureStagedBundle(tempBundleDir, "codex", "nested");
    const stat = await fs.stat(path.join(root, "codex", "nested"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("throws clear error when prompt.md is missing from source", async () => {
    await fs.unlink(path.join(tempBundleDir, "prompt.md"));
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    await expect(
      ensureStagedBundle(tempBundleDir, "codex", "bad"),
    ).rejects.toThrow(/prompt.md not found/);
  });

  it("removes stale staged config.json when source no longer has one", async () => {
    const { ensureStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    const staged = await ensureStagedBundle(tempBundleDir, "codex", "opt");
    await expect(
      fs.stat(path.join(staged, "config.json")),
    ).resolves.toBeDefined();
    // Simulate source losing its config.json
    await fs.unlink(path.join(tempBundleDir, "config.json"));
    await ensureStagedBundle(tempBundleDir, "codex", "opt");
    await expect(
      fs.stat(path.join(staged, "config.json")),
    ).rejects.toThrow(/ENOENT/);
  });
});

describe("removeStagedBundle", () => {
  let tempHome: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "sw-rmbundle-"));
    origHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("removes the staged bundle directory recursively", async () => {
    const staged = path.join(
      tempHome,
      ".sleepwalker",
      "staged-bundles",
      "codex",
      "rm-test",
    );
    await fs.mkdir(staged, { recursive: true });
    await fs.writeFile(path.join(staged, "prompt.md"), "x");
    await fs.writeFile(path.join(staged, "config.json"), "y");
    const { removeStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    await removeStagedBundle("codex", "rm-test");
    await expect(fs.stat(staged)).rejects.toThrow(/ENOENT/);
  });

  it("is idempotent when staged bundle is already absent", async () => {
    const { removeStagedBundle } = await import(
      "@/lib/runtime-adapters/bundle-staging"
    );
    await expect(
      removeStagedBundle("codex", "never-staged"),
    ).resolves.toBeUndefined();
  });
});
