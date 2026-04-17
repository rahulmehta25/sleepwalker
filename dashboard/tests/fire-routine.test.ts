import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("cloud credentials storage", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => env.restore());

  it("hasCloudCredential returns false when nothing configured", async () => {
    const { hasCloudCredential } = await import("@/lib/settings");
    expect(hasCloudCredential("pr-reviewer")).toBe(false);
  });

  it("setCloudCredential round-trips through readAllCloudCreds", async () => {
    const { setCloudCredential, getCloudCredential, hasCloudCredential } = await import("@/lib/settings");
    setCloudCredential("pr-reviewer", "https://api.anthropic.com/v1/x/fire", "sk-ant-oat01-test");
    expect(hasCloudCredential("pr-reviewer")).toBe(true);
    const cred = getCloudCredential("pr-reviewer");
    expect(cred?.url).toBe("https://api.anthropic.com/v1/x/fire");
    expect(cred?.token).toBe("sk-ant-oat01-test");
    expect(cred?.configuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("cloud-credentials.json is mode 0600", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("x", "https://api.anthropic.com/v1/x/fire", "tok");
    const stat = fs.statSync(path.join(dir, "cloud-credentials.json"));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("clearCloudCredential removes a single routine without affecting others", async () => {
    const { setCloudCredential, clearCloudCredential, hasCloudCredential } = await import("@/lib/settings");
    setCloudCredential("a", "https://x/a/fire", "t1");
    setCloudCredential("b", "https://x/b/fire", "t2");
    clearCloudCredential("a");
    expect(hasCloudCredential("a")).toBe(false);
    expect(hasCloudCredential("b")).toBe(true);
  });

  it("getCloudCredentialPublic never returns the token", async () => {
    const { setCloudCredential, getCloudCredentialPublic } = await import("@/lib/settings");
    setCloudCredential("pr-reviewer", "https://api.anthropic.com/v1/foo/fire", "sk-ant-oat01-secret");
    const pub = getCloudCredentialPublic("pr-reviewer");
    expect(pub.configured).toBe(true);
    expect(pub.host).toBe("api.anthropic.com");
    expect(JSON.stringify(pub)).not.toContain("sk-ant-oat01-secret");
  });
});

describe("fireRoutine", () => {
  let env: ReturnType<typeof makeTempHome>;

  beforeEach(() => {
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("returns no-credentials-configured when not set up", async () => {
    const { fireRoutine } = await import("@/lib/fire-routine");
    const result = await fireRoutine("pr-reviewer");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no-credentials-configured");
  });

  it("POSTs to the configured URL with bearer + beta headers", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("pr-reviewer", "https://api.anthropic.com/v1/test/fire", "sk-ant-oat01-test");

    const fetchMock = vi.fn(async (url, init) => {
      const initObj = init as RequestInit;
      const headers = initObj.headers as Record<string, string>;
      expect(url).toBe("https://api.anthropic.com/v1/test/fire");
      expect(headers["Authorization"]).toBe("Bearer sk-ant-oat01-test");
      expect(headers["anthropic-beta"]).toBe("experimental-cc-routine-2026-04-01");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["Content-Type"]).toBe("application/json");
      return new Response(JSON.stringify({
        type: "routine_fire",
        claude_code_session_id: "session_01TEST",
        claude_code_session_url: "https://claude.ai/code/session_01TEST",
      }), { status: 200 });
    }) as typeof fetch;
    globalThis.fetch = fetchMock;

    const { fireRoutine } = await import("@/lib/fire-routine");
    const result = await fireRoutine("pr-reviewer");
    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe("session_01TEST");
    expect(result.sessionUrl).toBe("https://claude.ai/code/session_01TEST");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes text payload when provided", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("alert-triage", "https://x/fire", "t");

    let receivedBody: string | null = null;
    globalThis.fetch = vi.fn(async (_url, init) => {
      receivedBody = (init as RequestInit).body as string;
      return new Response(JSON.stringify({ claude_code_session_id: "s1" }), { status: 200 });
    }) as typeof fetch;

    const { fireRoutine } = await import("@/lib/fire-routine");
    await fireRoutine("alert-triage", "Sentry alert: prod is down");
    expect(receivedBody).not.toBeNull();
    expect(JSON.parse(receivedBody!)).toEqual({ text: "Sentry alert: prod is down" });
  });

  it("omits body when no text provided", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("morning-brief", "https://x/fire", "t");

    let receivedBody: string | null = null;
    globalThis.fetch = vi.fn(async (_url, init) => {
      receivedBody = (init as RequestInit).body as string;
      return new Response(JSON.stringify({ claude_code_session_id: "s2" }), { status: 200 });
    }) as typeof fetch;

    const { fireRoutine } = await import("@/lib/fire-routine");
    await fireRoutine("morning-brief");
    expect(JSON.parse(receivedBody!)).toEqual({});
  });

  it("returns error on non-2xx response", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("x", "https://x/fire", "bad-token");

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
    ) as typeof fetch;

    const { fireRoutine } = await import("@/lib/fire-routine");
    const result = await fireRoutine("x");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("HTTP 401");
  });

  it("returns error on network failure", async () => {
    const { setCloudCredential } = await import("@/lib/settings");
    setCloudCredential("x", "https://x/fire", "t");

    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const { fireRoutine } = await import("@/lib/fire-routine");
    const result = await fireRoutine("x");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toBe("ECONNREFUSED");
  });
});
