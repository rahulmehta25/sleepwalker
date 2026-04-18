import { describe, it, expect } from "vitest";
import {
  validateSlug,
  isRuntime,
  toFleetKey,
  parseFleetKey,
  toLaunchdLabel,
  toMarkerTag,
  toBranchPrefix,
  toPlistPath,
  toBundleDir,
  RUNTIMES,
} from "@/lib/runtime-adapters/slug";

describe("validateSlug", () => {
  it("accepts canonical kebab-case", () => {
    expect(validateSlug("morning-brief")).toBe(true);
    expect(validateSlug("a")).toBe(true);
    expect(validateSlug("a-b-c-1-2-3")).toBe(true);
  });

  it("rejects leading digits, uppercase, spaces, path segments", () => {
    expect(validateSlug("1-start")).toBe(false);
    expect(validateSlug("Morning-Brief")).toBe(false);
    expect(validateSlug("has spaces")).toBe(false);
    expect(validateSlug("../etc/passwd")).toBe(false);
    expect(validateSlug("_test-zen")).toBe(false);
  });

  it("rejects slugs over 64 chars", () => {
    expect(validateSlug("a".repeat(64))).toBe(true);
    expect(validateSlug("a".repeat(65))).toBe(false);
  });
});

describe("isRuntime", () => {
  it("accepts all four authorized runtimes", () => {
    for (const r of RUNTIMES) expect(isRuntime(r)).toBe(true);
  });
  it("rejects v0.3 candidates", () => {
    expect(isRuntime("amp")).toBe(false);
    expect(isRuntime("devin")).toBe(false);
    expect(isRuntime("")).toBe(false);
  });
});

describe("identifier builders", () => {
  it("toFleetKey produces <runtime>/<slug>", () => {
    expect(toFleetKey("codex", "morning-brief")).toBe("codex/morning-brief");
  });
  it("toLaunchdLabel produces com.sleepwalker.<runtime>.<slug>", () => {
    expect(toLaunchdLabel("gemini", "repo-scout")).toBe("com.sleepwalker.gemini.repo-scout");
  });
  it("toMarkerTag produces [sleepwalker:<runtime>/<slug>]", () => {
    expect(toMarkerTag("claude-desktop", "inbox-triage")).toBe("[sleepwalker:claude-desktop/inbox-triage]");
  });
  it("toBranchPrefix produces claude/sleepwalker/<runtime>/<slug>/", () => {
    expect(toBranchPrefix("claude-routines", "pr-reviewer")).toBe("claude/sleepwalker/claude-routines/pr-reviewer/");
  });
  it("toPlistPath includes $HOME/Library/LaunchAgents/", () => {
    const p = toPlistPath("codex", "morning-brief");
    expect(p).toContain("Library/LaunchAgents/com.sleepwalker.codex.morning-brief.plist");
  });
  it("toBundleDir preserves v0.1 paths for Claude runtimes", () => {
    expect(toBundleDir("claude-desktop", "inbox-triage")).toBe("routines-local/inbox-triage");
    expect(toBundleDir("claude-routines", "pr-reviewer")).toBe("routines-cloud/pr-reviewer");
    expect(toBundleDir("codex", "morning-brief")).toBe("routines-codex/morning-brief");
    expect(toBundleDir("gemini", "daily-brief")).toBe("routines-gemini/daily-brief");
  });
});

describe("parseFleetKey", () => {
  it("parses valid keys", () => {
    expect(parseFleetKey("codex/morning-brief")).toEqual({ runtime: "codex", slug: "morning-brief" });
  });
  it("returns null for bad runtime, bad slug, or no slash", () => {
    expect(parseFleetKey("amp/foo")).toBeNull();
    expect(parseFleetKey("codex/1-bad")).toBeNull();
    expect(parseFleetKey("no-slash-here")).toBeNull();
    expect(parseFleetKey("/leading-slash")).toBeNull();
  });
});
