import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("atomicWriteBundle", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sw-aw-"));
  });
  afterEach(() => {
    // Best-effort restore: if any test left a chmod 0o555 directory, relax it first.
    try {
      for (const entry of fs.readdirSync(base)) {
        const p = path.join(base, entry);
        try {
          fs.chmodSync(p, 0o755);
        } catch {
          /* noop */
        }
      }
    } catch {
      /* noop */
    }
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("writes both files atomically on happy path", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-codex", "morning-brief");
    const res = atomicWriteBundle(finalDir, {
      "config.json": '{"name":"Morning"}',
      "prompt.md": "You are the overnight agent.",
    });
    expect(res.ok).toBe(true);
    expect(res.path).toBe(finalDir);
    expect(fs.existsSync(path.join(finalDir, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(finalDir, "prompt.md"))).toBe(true);
    expect(fs.readFileSync(path.join(finalDir, "config.json"), "utf8")).toBe(
      '{"name":"Morning"}',
    );
    expect(fs.readFileSync(path.join(finalDir, "prompt.md"), "utf8")).toBe(
      "You are the overnight agent.",
    );
  });

  it("writes utf8 content correctly (multibyte + newlines)", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-gemini", "weekly");
    const content = "Line 1\nLine 2 — em-dash ✓\nLine 3";
    const res = atomicWriteBundle(finalDir, { "prompt.md": content });
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(path.join(finalDir, "prompt.md"), "utf8")).toBe(
      content,
    );
  });

  it("returns collision without creating tmp when finalDir exists", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-codex", "already-here");
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, "marker"), "existing");

    const res = atomicWriteBundle(finalDir, { "config.json": "{}" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("collision");
    // existing file untouched
    expect(fs.readFileSync(path.join(finalDir, "marker"), "utf8")).toBe(
      "existing",
    );
    // no tmp dirs in parent
    const parent = path.dirname(finalDir);
    const siblings = fs.readdirSync(parent);
    expect(siblings.filter((s) => s.startsWith(".already-here.tmp-"))).toEqual(
      [],
    );
  });

  it("auto-creates missing parent directory", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "deeply", "nested", "routines-codex", "x");
    const res = atomicWriteBundle(finalDir, { "config.json": "{}" });
    expect(res.ok).toBe(true);
    expect(fs.existsSync(finalDir)).toBe(true);
    expect(fs.readFileSync(path.join(finalDir, "config.json"), "utf8")).toBe(
      "{}",
    );
  });

  it("cleans up tmp dir on io failure mid-write", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-codex", "badfile");
    // File name with null byte triggers write failure on Node (ERR_INVALID_ARG_VALUE).
    const res = atomicWriteBundle(finalDir, {
      "config.json": "{}",
      "bad\0name": "x",
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("io");
    // no tmp dirs remain in parent
    const parent = path.dirname(finalDir);
    if (fs.existsSync(parent)) {
      const siblings = fs.readdirSync(parent);
      expect(siblings.filter((s) => s.startsWith(".badfile.tmp-"))).toEqual([]);
    }
    // finalDir should not exist — atomic guarantee
    expect(fs.existsSync(finalDir)).toBe(false);
  });

  it("reports permission error when parent is unwritable", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const lockedParent = path.join(base, "locked");
    fs.mkdirSync(lockedParent);
    fs.chmodSync(lockedParent, 0o555);
    try {
      // finalDir parent will be "locked/routines-codex" — mkdirSync recursive
      // on read-only ancestor fails with EACCES.
      const finalDir = path.join(lockedParent, "routines-codex", "x");
      const res = atomicWriteBundle(finalDir, { "config.json": "{}" });
      expect(res.ok).toBe(false);
      // Some kernels surface this as EACCES/EPERM (permission), others as
      // EIO/ENOENT (io). Test accepts either — contract is just "not ok".
      expect(["permission", "io"]).toContain(res.errorCode);
      expect(res.error).toBeTruthy();
    } finally {
      fs.chmodSync(lockedParent, 0o755); // restore for cleanup
    }
  });

  it("populates error string on any failure", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-codex", "exists");
    fs.mkdirSync(finalDir, { recursive: true });
    const res = atomicWriteBundle(finalDir, { "config.json": "{}" });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.error?.length ?? 0).toBeGreaterThan(0);
  });

  it("writes non-executable files with 0644 perms (mode bits)", async () => {
    const { atomicWriteBundle } = await import("@/lib/atomic-write");
    const finalDir = path.join(base, "routines-codex", "modebits");
    const res = atomicWriteBundle(finalDir, {
      "config.json": "{}",
      "prompt.md": "hi",
    });
    expect(res.ok).toBe(true);
    // Default umask on most systems is 022, which yields 0644 on mode 0666.
    // writeFileSync without an explicit mode uses 0o666 & ~umask.
    const cfgMode = fs.statSync(path.join(finalDir, "config.json")).mode & 0o777;
    const prmMode = fs.statSync(path.join(finalDir, "prompt.md")).mode & 0o777;
    // Accept 0644 (typical) or anything without executable bits set.
    expect(cfgMode & 0o111).toBe(0);
    expect(prmMode & 0o111).toBe(0);
  });
});
