// dashboard/tests/set-enabled-action.test.ts
//
// bootstrap/bootout + persist + first-enable invariant matrix for the
// `setRoutineEnabled` Server Action. Exercises the codex/gemini launchctl
// path directly (recording execFile calls into a shared array) and the
// config-file persistence contract.
//
// Block names match 04-VALIDATION.md rows 17 (disable bootout), 18 (enable
// bootstrap), 19 (persist flag), 20 (enable draft error).
//
// Isolation:
//   - makeTempHome() for $HOME so launchd plist paths resolve under temp
//   - process.chdir(tmpRepo) so config.json reads/writes happen in an
//     isolated routines-codex/ subtree
//   - vi.doMock("node:child_process", ...) intercepts execFile; every call
//     is pushed into `calls[]` so tests assert on cmd + args
//   - A pre-existing `~/.sleepwalker/deploys/codex-<slug>.state.json` in
//     `phase: {kind:"succeeded"}` is the precondition for enable=true (the
//     first-enable invariant); tests that exercise draft-error do NOT
//     seed that file.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

const ORIG_CWD = process.cwd();

function seedCodexBundle(tmpRepo: string, slug: string, enabled: boolean): string {
  const dir = path.join(tmpRepo, "routines-codex", slug);
  fs.mkdirSync(dir, { recursive: true });
  const cfgPath = path.join(dir, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        name: slug,
        runtime: "codex",
        slug,
        schedule: "0 3 * * *",
        reversibility: "green",
        budget: 50_000,
        enabled,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(dir, "prompt.md"), `[sleepwalker:codex/${slug}]\nbody`);
  return cfgPath;
}

function seedSucceededDeployState(home: string, runtime: string, slug: string): void {
  const dir = path.join(home, ".sleepwalker", "deploys");
  fs.mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, `${runtime}-${slug}.state.json`);
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      fleet: `${runtime}/${slug}`,
      runtime,
      slug,
      startedAt: "2026-04-19T00:00:00.000Z",
      steps: {
        planning: { startedAt: 0, completedAt: 1, elapsedMs: 1 },
        writing: { startedAt: 1, completedAt: 2, elapsedMs: 1 },
        loading: { startedAt: 2, completedAt: 3, elapsedMs: 1 },
        verified: { startedAt: 3, completedAt: 3, elapsedMs: 0 },
      },
      phase: { kind: "succeeded" },
      artifact: "/path/to/plist",
      verifiedAt: Date.now(),
    }),
  );
}

/**
 * Install a child_process mock that records every execFile invocation and
 * returns success by default. Tests share the `calls[]` array and assert
 * on specific cmd/args tuples.
 */
function installExecFileMock(
  calls: Array<{ cmd: string; args: string[] }>,
  handler: (cmd: string, args: string[]) => Error | null = () => null,
): void {
  vi.doMock("node:child_process", () => ({
    execFile: (cmd: string, args: string[], cbOrOpts: unknown, maybeCb?: unknown) => {
      const cb = (typeof cbOrOpts === "function" ? cbOrOpts : maybeCb) as
        | ((err: Error | null, out: { stdout: string; stderr: string }) => void)
        | undefined;
      calls.push({ cmd, args });
      const err = handler(cmd, args);
      if (typeof cb === "function") cb(err, { stdout: "", stderr: "" });
      return { unref: () => undefined };
    },
    spawn: () => ({ unref: () => undefined }),
  }));
}

describe("setRoutineEnabled Server Action", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    vi.resetModules();
    env = makeTempHome();
    ensureSleepwalkerDir(env.home);
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-enable-"));
    process.chdir(tmpRepo);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
  });

  it("disable bootout: launchctl bootout invoked with gui/<uid>/<label>", async () => {
    // VALIDATION row 17: setRoutineEnabled({enabled:false}) on codex must
    // invoke `launchctl bootout gui/<uid>/com.sleepwalker.codex.<slug>`.
    // The plist file stays on disk (no unlink) for fast re-enable.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    seedCodexBundle(tmpRepo, "nightly", true);
    seedSucceededDeployState(env.home, "codex", "nightly");
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    const res = await setRoutineEnabled({ runtime: "codex", slug: "nightly", enabled: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enabled).toBe(false);
    }
    const bootoutCall = calls.find(
      (c) => c.cmd === "launchctl" && c.args[0] === "bootout",
    );
    expect(bootoutCall).toBeDefined();
    // Domain string: gui/<uid>/com.sleepwalker.codex.nightly
    const domain = bootoutCall!.args[1];
    expect(domain).toMatch(/^gui\/\d+\/com\.sleepwalker\.codex\.nightly$/);
  });

  it("enable bootstrap: launchctl bootstrap invoked with gui/<uid> <plistPath>", async () => {
    // VALIDATION row 18: setRoutineEnabled({enabled:true}) on codex (with
    // a succeeded deploy state) must invoke `launchctl bootstrap gui/<uid>
    // <plistPath>`. The plist path is under $HOME/Library/LaunchAgents/.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    seedCodexBundle(tmpRepo, "daily", false);
    seedSucceededDeployState(env.home, "codex", "daily");
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    const res = await setRoutineEnabled({ runtime: "codex", slug: "daily", enabled: true });
    expect(res.ok).toBe(true);
    const bootstrapCall = calls.find(
      (c) => c.cmd === "launchctl" && c.args[0] === "bootstrap",
    );
    expect(bootstrapCall).toBeDefined();
    // args[1] = "gui/<uid>", args[2] = plist path (ends with <label>.plist)
    expect(bootstrapCall!.args[1]).toMatch(/^gui\/\d+$/);
    expect(bootstrapCall!.args[2]).toMatch(/com\.sleepwalker\.codex\.daily\.plist$/);
    expect(bootstrapCall!.args[2]).toContain(env.home);
  });

  it("persist flag: config.json enabled field flips after disable", async () => {
    // VALIDATION row 19: disabling a codex routine must rewrite
    // routines-codex/<slug>/config.json with enabled:false.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    const cfgPath = seedCodexBundle(tmpRepo, "pilot", true);
    seedSucceededDeployState(env.home, "codex", "pilot");
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    await setRoutineEnabled({ runtime: "codex", slug: "pilot", enabled: false });
    const rereadCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    expect(rereadCfg.enabled).toBe(false);
  });

  it("enable draft error: enabling a non-succeeded state returns error", async () => {
    // VALIDATION row 20: first-enable invariant. The UI-SPEC says "enable
    // toggle on Draft card opens Deploy drawer first" — the client should
    // intercept and not call setRoutineEnabled. This is the server-side
    // backstop: if the client bypasses that intercept, we refuse.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    seedCodexBundle(tmpRepo, "draft-slug", false);
    // NO deploy state seeded — this is a draft
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    const res = await setRoutineEnabled({ runtime: "codex", slug: "draft-slug", enabled: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Not deployed yet/);
    }
    // No launchctl calls were made
    const launchctlCalls = calls.filter((c) => c.cmd === "launchctl");
    expect(launchctlCalls).toHaveLength(0);
  });

  it("claude-routines: no launchctl invocation, archived_fleets toggles", async () => {
    // Per 04-RESEARCH.md §Enable/Disable Toggle §Storage, claude-routines
    // has NO local scheduling — the enable/disable toggle maps to
    // ~/.sleepwalker/routines.json::archived_fleets with INVERSE semantics
    // (disable = add fleet, enable = remove fleet). launchctl MUST NOT be
    // invoked.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    // Seed a claude-routines SKILL.md bundle
    const dir = path.join(tmpRepo, "routines-cloud", "inbox-triage");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: inbox-triage\nschedule: "0 5 * * 1-5"\nreversibility: yellow\nbudget: 50000\n---\n\nprompt body`,
    );
    seedSucceededDeployState(env.home, "claude-routines", "inbox-triage");
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    const res = await setRoutineEnabled({
      runtime: "claude-routines",
      slug: "inbox-triage",
      enabled: false,
    });
    expect(res.ok).toBe(true);
    // No launchctl invocation
    expect(calls.filter((c) => c.cmd === "launchctl")).toHaveLength(0);
    // archived_fleets has the fleet key
    const routinesPath = path.join(env.home, ".sleepwalker", "routines.json");
    expect(fs.existsSync(routinesPath)).toBe(true);
    const file = JSON.parse(fs.readFileSync(routinesPath, "utf8"));
    expect(file.archived_fleets).toContain("claude-routines/inbox-triage");
  });

  it("bundle not found returns {ok:false, error}", async () => {
    // Defensive path: readBundle null → early bail with UI-visible error.
    const calls: Array<{ cmd: string; args: string[] }> = [];
    installExecFileMock(calls);
    const { setRoutineEnabled } = await import("@/app/routines/actions");
    const res = await setRoutineEnabled({
      runtime: "codex",
      slug: "nonexistent",
      enabled: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Bundle not found");
    }
    // No launchctl calls
    expect(calls.filter((c) => c.cmd === "launchctl")).toHaveLength(0);
  });
});
