import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

/**
 * Mock node:child_process so execFile invocations are deterministic. The
 * `execMock.impl` indirection lets each it() block swap the implementation
 * without re-wiring the module mock (vi.mock is hoisted — cannot capture
 * per-test closures directly).
 */
type ExecCb = (
  err: Error | null,
  result: { stdout: string; stderr: string },
) => void;

const execMock = vi.hoisted(() => ({
  impl: (
    _file: string,
    _args: readonly string[],
    _opts: unknown,
    cb: ExecCb,
  ) => {
    cb(null, { stdout: "ok\n", stderr: "" });
  },
}));

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>(
      "node:child_process",
    );
  return {
    ...actual,
    execFile: (
      file: string,
      args: readonly string[],
      opts: unknown,
      cb: ExecCb,
    ) => execMock.impl(file, args, opts, cb),
  };
});

describe("gatherDiagnostics", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
    // Happy-path default: every probe returns plausible macOS output.
    execMock.impl = (file, args, _opts, cb) => {
      let stdout = "";
      if (file === "sw_vers") stdout = "26.4.1\n";
      else if (file === "uname") stdout = "arm64\n";
      else if (file === "brew") stdout = "/opt/homebrew\n";
      else if (file === "stat") stdout = "0700\n";
      else if (file === "/bin/zsh") {
        const arg = (args[2] ?? "").toString();
        if (arg.includes("claude"))
          stdout = "/usr/local/bin/claude\n2.1.117\n";
        else if (arg.includes("codex"))
          stdout = "/opt/homebrew/bin/codex\n0.118.0\n";
        else if (arg.includes("gemini"))
          stdout = "/opt/homebrew/bin/gemini\n0.31.0\n";
        else if (arg.includes("flock"))
          stdout = "/opt/homebrew/bin/flock\nflock 0.4.0\n";
        else if (arg.includes("jq")) stdout = "/opt/homebrew/bin/jq\njq-1.7\n";
      } else if (file === "git") stdout = "abc1234\n";
      cb(null, { stdout, stderr: "" });
    };
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("returns DiagnosticsSnapshot with capturedAt + 11 probe rows (happy path)", async () => {
    const { gatherDiagnostics } = await import("@/lib/diagnostics");
    const snap = await gatherDiagnostics();
    expect(snap.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(snap.rows).length).toBe(11);
    expect(snap.rows.macos).toEqual({ ok: true, value: "26.4.1" });
    expect(snap.rows.arch).toEqual({ ok: true, value: "arm64" });
    expect(snap.rows.brew).toEqual({ ok: true, value: "/opt/homebrew" });
    // launchAgents returns the stat mode string directly.
    expect(snap.rows.launchAgents).toEqual({ ok: true, value: "0700" });
  });

  it("fail-soft: brew missing → brew row ok:false but other probes survive", async () => {
    execMock.impl = (file, args, _opts, cb) => {
      if (file === "brew") {
        cb(new Error("ENOENT: brew not found"), { stdout: "", stderr: "" });
        return;
      }
      if (file === "sw_vers") {
        cb(null, { stdout: "26.4.1\n", stderr: "" });
        return;
      }
      if (file === "uname") {
        cb(null, { stdout: "arm64\n", stderr: "" });
        return;
      }
      if (file === "stat") {
        cb(null, { stdout: "0700\n", stderr: "" });
        return;
      }
      if (file === "/bin/zsh") {
        cb(null, { stdout: "/path\nv\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    };
    const { gatherDiagnostics } = await import("@/lib/diagnostics");
    const snap = await gatherDiagnostics();
    expect(snap.rows.brew.ok).toBe(false);
    // Sibling probes unaffected — the fail-soft invariant.
    expect(snap.rows.macos.ok).toBe(true);
    expect(snap.rows.arch.ok).toBe(true);
    expect(snap.rows.launchAgents.ok).toBe(true);
  });

  it("fail-soft: LaunchAgents missing → launchAgents row ok:false, error preserved", async () => {
    execMock.impl = (file, _args, _opts, cb) => {
      if (file === "stat") {
        cb(new Error("stat: No such file or directory"), {
          stdout: "",
          stderr: "",
        });
        return;
      }
      if (file === "sw_vers") {
        cb(null, { stdout: "26.4.1\n", stderr: "" });
        return;
      }
      if (file === "uname") {
        cb(null, { stdout: "arm64\n", stderr: "" });
        return;
      }
      if (file === "brew") {
        cb(null, { stdout: "/opt/homebrew\n", stderr: "" });
        return;
      }
      if (file === "/bin/zsh") {
        cb(null, { stdout: "/path\nv\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    };
    const { gatherDiagnostics } = await import("@/lib/diagnostics");
    const snap = await gatherDiagnostics();
    expect(snap.rows.launchAgents.ok).toBe(false);
    if (!snap.rows.launchAgents.ok) {
      expect(snap.rows.launchAgents.error).toContain("No such file");
    }
  });

  it("probeShell: $SHELL env set → ok:true with the literal shell path", async () => {
    process.env.SHELL = "/bin/zsh";
    const { gatherDiagnostics } = await import("@/lib/diagnostics");
    const snap = await gatherDiagnostics();
    expect(snap.rows.shell).toEqual({ ok: true, value: "/bin/zsh" });
  });

  it("probeSleepwalkerState: audit.jsonl.lock present → 'installed (v0.2)'", async () => {
    fs.writeFileSync(path.join(dir, "audit.jsonl.lock"), "");
    const { gatherDiagnostics } = await import("@/lib/diagnostics");
    const snap = await gatherDiagnostics();
    expect(snap.rows.sleepwalkerState).toEqual({
      ok: true,
      value: "installed (v0.2)",
    });
  });

  it("formatAsIssueBody uses explicit field allowlist (Pitfall 1 canary)", async () => {
    const { formatAsIssueBody } = await import("@/lib/diagnostics");
    const fakeSnap = {
      capturedAt: "2026-04-22T00:00:00.000Z",
      rows: {
        macos: { ok: true, value: "26.4.1" },
        arch: { ok: true, value: "arm64" },
        brew: { ok: true, value: "/opt/homebrew" },
        shell: { ok: true, value: "/bin/zsh" },
        claude: { ok: true, value: "v1" },
        codex: { ok: true, value: "v2" },
        gemini: { ok: true, value: "v3" },
        flock: { ok: true, value: "v4" },
        jq: { ok: true, value: "v5" },
        launchAgents: { ok: true, value: "0700" },
        sleepwalkerState: { ok: true, value: "installed (v0.2)" },
      },
    } as const;
    const body = formatAsIssueBody(fakeSnap);
    // Positive — every allowlisted field must surface.
    expect(body).toContain("26.4.1");
    expect(body).toContain("arm64");
    expect(body).toContain("/opt/homebrew");
    expect(body).toContain("/bin/zsh");
    expect(body).toContain("installed (v0.2)");
    // Fenced code block + heading shape.
    expect(body).toContain("```text");
    expect(body).toContain("## Environment");
    expect(body).toContain("Captured:");
  });
});
