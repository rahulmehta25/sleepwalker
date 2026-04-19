import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { makeTempHome } from "./helpers";

// Helper: build a minimal RoutineBundle for tests
function fixtureBundle(
  slug: string,
  prompt = "Test prompt body",
): import("@/lib/runtime-adapters/types").RoutineBundle {
  return {
    slug,
    runtime: "claude-desktop",
    name: slug,
    prompt,
    schedule: null,
    reversibility: "yellow",
    budget: 40000,
    bundlePath: `/tmp/${slug}`,
  };
}

describe("claudeDesktopAdapter.deploy", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("writes SKILL.md to ~/.claude/scheduled-tasks/<slug>/ with mode 0644", async () => {
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    const result = await claudeDesktopAdapter.deploy(
      fixtureBundle("morning-brief", "Hello world."),
    );
    expect(result.ok).toBe(true);
    expect(result.artifact).toContain(
      ".claude/scheduled-tasks/morning-brief/SKILL.md",
    );
    // File exists at the expected path with the prompt body verbatim
    const expectedPath = path.join(
      env.home,
      ".claude/scheduled-tasks/morning-brief/SKILL.md",
    );
    const content = await fs.readFile(expectedPath, "utf8");
    expect(content).toBe("Hello world.");
    const stat = fsSync.statSync(expectedPath);
    expect(stat.mode & 0o777).toBe(0o644);
  });

  it("returns claude:// deeplink with URL-encoded slug", async () => {
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    const result = await claudeDesktopAdapter.deploy(fixtureBundle("test-slug"));
    expect(result.handoffUrl).toBe(
      "claude://scheduled-tasks?slug=test-slug",
    );
  });
});

describe("claudeDesktopAdapter.undeploy", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("removes the scheduled-tasks/<slug>/ directory", async () => {
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    // Deploy first so there is something to tear down
    await claudeDesktopAdapter.deploy(fixtureBundle("temp-task"));
    const dir = path.join(env.home, ".claude/scheduled-tasks/temp-task");
    expect(fsSync.existsSync(dir)).toBe(true);
    // Undeploy removes the directory
    const result = await claudeDesktopAdapter.undeploy(fixtureBundle("temp-task"));
    expect(result.ok).toBe(true);
    expect(fsSync.existsSync(dir)).toBe(false);
  });

  it("is idempotent when target directory is absent", async () => {
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    // Never deployed — undeploy should still succeed (recursive + force)
    const result = await claudeDesktopAdapter.undeploy(
      fixtureBundle("never-deployed-x"),
    );
    expect(result.ok).toBe(true);
  });
});

describe("claudeDesktopAdapter.healthCheck", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    vi.resetModules();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("reports available + version when ~/.claude exists and claude --version succeeds", async () => {
    // Stage ~/.claude/ in temp HOME
    fsSync.mkdirSync(path.join(env.home, ".claude"), { recursive: true });
    vi.doMock("node:child_process", () => ({
      execFile: (
        cmd: string,
        args: string[],
        cb: (
          err: Error | null,
          out: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (cmd === "/bin/zsh" && args.join(" ").includes("claude --version")) {
          cb(null, { stdout: "claude-cli 1.0.45\n", stderr: "" });
        } else {
          cb(new Error("unexpected"), { stdout: "", stderr: "" });
        }
      },
    }));
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    const result = await claudeDesktopAdapter.healthCheck();
    expect(result.runtime).toBe("claude-desktop");
    expect(result.available).toBe(true);
    expect(result.version).toBe("claude-cli 1.0.45");
  });

  it("reports unavailable when ~/.claude is missing", async () => {
    // Do NOT mkdir ~/.claude in temp HOME — stat will fail
    const { claudeDesktopAdapter } = await import(
      "@/lib/runtime-adapters/claude-desktop"
    );
    const result = await claudeDesktopAdapter.healthCheck();
    expect(result.available).toBe(false);
    expect(result.reason).toContain("~/.claude/ not found");
  });
});
