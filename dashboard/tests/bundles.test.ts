import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeTempHome } from "./helpers";

const ORIG_CWD = process.cwd();

describe("bundles lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    env = makeTempHome();
    // Use a fresh tmp repo root as cwd so routines-* enumeration is isolated
    // from the real repo (which has v0.1 routines-local/ + routines-cloud/).
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-bundles-"));
    process.chdir(tmpRepo);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  function seed(
    runtimeDir: string,
    slug: string,
    files: Record<string, string>,
  ): void {
    const dir = path.join(tmpRepo, runtimeDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
  }

  describe("listBundles", () => {
    it("returns [] when no routines-* dirs exist", async () => {
      const { listBundles } = await import("@/lib/bundles");
      expect(listBundles()).toEqual([]);
    });

    it("enumerates codex + gemini bundles", async () => {
      seed("routines-codex", "morning-brief", {
        "config.json":
          '{"name":"Morning","schedule":"0 6 * * *","prompt":"hi"}',
        "prompt.md": "hi",
      });
      seed("routines-gemini", "weekly-sync", {
        "config.json":
          '{"name":"Weekly","schedule":"0 9 * * 1","prompt":"ok"}',
        "prompt.md": "ok",
      });
      const { listBundles } = await import("@/lib/bundles");
      const bundles = listBundles();
      expect(bundles.map((b) => `${b.runtime}/${b.slug}`).sort()).toEqual([
        "codex/morning-brief",
        "gemini/weekly-sync",
      ]);
    });

    it("maps routines-local/sleepwalker-inbox-triage to claude-desktop runtime", async () => {
      seed("routines-local", "sleepwalker-inbox-triage", {
        "SKILL.md": "---\nname: Inbox Triage\n---\nbody",
      });
      const { listBundles } = await import("@/lib/bundles");
      const b = listBundles();
      expect(b).toEqual([
        {
          runtime: "claude-desktop",
          slug: "sleepwalker-inbox-triage",
          bundleDir: "routines-local/sleepwalker-inbox-triage",
        },
      ]);
    });

    it("maps routines-cloud/daily-brief to claude-routines runtime", async () => {
      seed("routines-cloud", "daily-brief", {
        "SKILL.md": "---\nname: Daily\n---\nbody",
      });
      const { listBundles } = await import("@/lib/bundles");
      const b = listBundles();
      expect(b).toEqual([
        {
          runtime: "claude-routines",
          slug: "daily-brief",
          bundleDir: "routines-cloud/daily-brief",
        },
      ]);
    });

    it("preserves v0.1 _test-zen slug in routines-cloud (no validateSlug on read)", async () => {
      // Phase 2 CONTEXT.md lines 89-91: reader trusts v0.1 directory names as-authored.
      // _test-zen starts with an underscore — would FAIL SLUG_REGEX in write-path.
      seed("routines-cloud", "_test-zen", {
        "SKILL.md": "---\nname: Test Zen\n---\nbody",
      });
      const { listBundles } = await import("@/lib/bundles");
      const b = listBundles();
      expect(b).toEqual([
        {
          runtime: "claude-routines",
          slug: "_test-zen",
          bundleDir: "routines-cloud/_test-zen",
        },
      ]);
    });

    it("ignores non-directory entries in roots (e.g. .DS_Store)", async () => {
      fs.mkdirSync(path.join(tmpRepo, "routines-codex"));
      fs.writeFileSync(
        path.join(tmpRepo, "routines-codex", ".DS_Store"),
        "trash",
      );
      const { listBundles } = await import("@/lib/bundles");
      expect(listBundles()).toEqual([]);
    });
  });

  describe("hasBundle", () => {
    it.each([
      ["codex", "routines-codex"],
      ["gemini", "routines-gemini"],
      ["claude-routines", "routines-cloud"],
      ["claude-desktop", "routines-local"],
    ] as const)(
      "returns true when %s/<slug> exists",
      async (runtime, dir) => {
        seed(dir, "present", {});
        const { hasBundle } = await import("@/lib/bundles");
        expect(hasBundle(runtime, "present")).toBe(true);
      },
    );

    it("returns false when slug missing", async () => {
      const { hasBundle } = await import("@/lib/bundles");
      expect(hasBundle("codex", "ghost")).toBe(false);
    });
  });

  describe("hasBundleAnyRuntime", () => {
    it("returns the matching runtime when slug exists in one", async () => {
      seed("routines-codex", "morning-brief", {});
      const { hasBundleAnyRuntime } = await import("@/lib/bundles");
      expect(hasBundleAnyRuntime("morning-brief")).toBe("codex");
    });

    it("returns null when slug exists in no runtime", async () => {
      const { hasBundleAnyRuntime } = await import("@/lib/bundles");
      expect(hasBundleAnyRuntime("zzz")).toBe(null);
    });

    it("returns first runtime (RUNTIMES tuple order) when multiple have same slug", async () => {
      seed("routines-cloud", "x", {});
      seed("routines-codex", "x", {});
      const { hasBundleAnyRuntime } = await import("@/lib/bundles");
      // RUNTIMES order: claude-routines, claude-desktop, codex, gemini
      expect(hasBundleAnyRuntime("x")).toBe("claude-routines");
    });
  });

  describe("readBundle", () => {
    it("parses codex config.json + prompt.md", async () => {
      seed("routines-codex", "morning-brief", {
        "config.json": JSON.stringify({
          name: "Morning",
          schedule: "0 6 * * *",
          reversibility: "yellow",
          budget: 40000,
        }),
        "prompt.md": "You are the overnight agent.",
      });
      const { readBundle } = await import("@/lib/bundles");
      const b = readBundle("codex", "morning-brief");
      expect(b?.runtime).toBe("codex");
      expect(b?.slug).toBe("morning-brief");
      expect(b?.name).toBe("Morning");
      expect(b?.prompt).toBe("You are the overnight agent.");
      expect(b?.schedule).toBe("0 6 * * *");
      expect(b?.reversibility).toBe("yellow");
      expect(b?.budget).toBe(40000);
      expect(b?.bundleDir).toBe("routines-codex/morning-brief");
    });

    it("returns null on malformed config.json", async () => {
      seed("routines-codex", "bad", { "config.json": "not json {" });
      const { readBundle } = await import("@/lib/bundles");
      expect(readBundle("codex", "bad")).toBe(null);
    });

    it("parses claude-desktop SKILL.md via gray-matter", async () => {
      seed("routines-local", "sleepwalker-test", {
        "SKILL.md": "---\nname: Test\n---\nbody prompt text",
      });
      const { readBundle } = await import("@/lib/bundles");
      const b = readBundle("claude-desktop", "sleepwalker-test");
      expect(b?.runtime).toBe("claude-desktop");
      expect(b?.name).toBe("Test");
      expect(b?.prompt).toBe("body prompt text");
      expect(b?.bundleDir).toBe("routines-local/sleepwalker-test");
    });

    it("returns null when bundle dir missing", async () => {
      const { readBundle } = await import("@/lib/bundles");
      expect(readBundle("gemini", "missing")).toBe(null);
    });
  });
});
