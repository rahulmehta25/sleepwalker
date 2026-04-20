// dashboard/tests/save-to-repo.test.ts
// REPO-01 test matrix for dashboard/lib/save-to-repo.ts.
//
// Two describe groups:
//   1. "save-to-repo (real git repo)"    — real mkdtempSync repo + real
//      simple-git; tests the REPO-01 never-sweep, stages-only-subpath,
//      diff-shape, lock-busy, and no-changes behaviors against actual git.
//   2. "save-to-repo (mocked simple-git)"  — vi.doMock("simple-git", ...)
//      + vi.doMock("proper-lockfile", ...) to assert the never-push invariant
//      and the release-resets invariant without exercising the filesystem.
//
// Anchor names match 04-VALIDATION.md rows 21-27 verbatim so plan 04-09's
// exit gate can query each with `-t "<anchor>"`.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome } from "./helpers";

function seedBundle(tmpRepo: string, runtime: string, slug: string): string {
  const dir = path.join(tmpRepo, `routines-${runtime}`, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({ name: slug, runtime, slug, schedule: "0 6 * * *" }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "prompt.md"), `[sleepwalker:${runtime}/${slug}]\nDo it.\n`);
  return dir;
}

describe("save-to-repo (real git repo)", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;
  let priorRepoRoot: string | undefined;

  beforeEach(() => {
    env = makeTempHome();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-repo-"));
    execSync("git init -q", { cwd: tmpRepo });
    execSync('git config user.email "test@test"', { cwd: tmpRepo });
    execSync('git config user.name "Test"', { cwd: tmpRepo });
    execSync("git config commit.gpgsign false", { cwd: tmpRepo });
    fs.writeFileSync(path.join(tmpRepo, "README.md"), "# seed\n");
    execSync("git add README.md", { cwd: tmpRepo });
    execSync("git commit -q -m 'seed'", { cwd: tmpRepo });
    priorRepoRoot = process.env.SLEEPWALKER_REPO_ROOT;
    process.env.SLEEPWALKER_REPO_ROOT = tmpRepo;
    // vi.resetModules so each test gets a fresh LOCK_REGISTRY Map (module-scope
    // state would otherwise leak between tests).
    vi.resetModules();
  });

  afterEach(() => {
    if (priorRepoRoot === undefined) delete process.env.SLEEPWALKER_REPO_ROOT;
    else process.env.SLEEPWALKER_REPO_ROOT = priorRepoRoot;
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("stages only subpath: routines-codex/<slug>/* on real git repo", async () => {
    seedBundle(tmpRepo, "codex", "morning-brief");
    fs.writeFileSync(path.join(tmpRepo, "UNRELATED.md"), "untracked\n");

    const { previewSaveToRepo, releaseSaveLock } = await import("@/lib/save-to-repo");
    const result = await previewSaveToRepo("codex", "morning-brief");
    expect(result.ok).toBe(true);

    const status = execSync("git status --porcelain", { cwd: tmpRepo }).toString();
    // Staged files should ALL be under routines-codex/morning-brief/
    const staged = status
      .split("\n")
      .filter((line) => line.match(/^A[ MD]/))
      .map((line) => line.slice(3));
    expect(staged.length).toBeGreaterThan(0);
    for (const s of staged) {
      expect(s).toMatch(/^routines-codex\/morning-brief\//);
    }
    // Untracked UNRELATED.md is still there, still untracked
    expect(status).toContain("?? UNRELATED.md");

    if (result.ok) await releaseSaveLock({ lockToken: result.lockToken });
  });

  it("diff shape: returns files[] totals suggestedMessage lockToken", async () => {
    seedBundle(tmpRepo, "gemini", "weekly");
    const { previewSaveToRepo, releaseSaveLock } = await import("@/lib/save-to-repo");
    const result = await previewSaveToRepo("gemini", "weekly");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files.length).toBeGreaterThanOrEqual(2); // config.json + prompt.md
    for (const f of result.files) {
      expect(typeof f.path).toBe("string");
      expect(typeof f.added).toBe("number");
      expect(typeof f.removed).toBe("number");
    }
    expect(result.totals.filesChanged).toBe(result.files.length);
    expect(typeof result.totals.added).toBe("number");
    expect(typeof result.totals.removed).toBe("number");
    expect(result.suggestedMessage).toBe("feat(routines): add gemini/weekly");
    expect(result.lockToken).toMatch(/^[0-9a-f]{32}$/);

    await releaseSaveLock({ lockToken: result.lockToken });
  });

  it("lock-busy: second concurrent preview returns {ok:false, kind:'lock-busy'} immediately", async () => {
    seedBundle(tmpRepo, "codex", "a");
    seedBundle(tmpRepo, "gemini", "b");
    const { previewSaveToRepo, releaseSaveLock } = await import("@/lib/save-to-repo");

    const first = await previewSaveToRepo("codex", "a");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // While the first holds the lock, a second must fail immediately.
    const second = await previewSaveToRepo("gemini", "b");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.kind).toBe("lock-busy");
    expect(second.error).toMatch(/Another save-to-repo is in progress/);

    // Release the first; the next preview now succeeds — lock is reclaimable.
    await releaseSaveLock({ lockToken: first.lockToken });

    const third = await previewSaveToRepo("gemini", "b");
    expect(third.ok).toBe(true);
    if (third.ok) await releaseSaveLock({ lockToken: third.lockToken });
  });

  it("never sweeps: uncommitted file outside subpath stays untracked", async () => {
    seedBundle(tmpRepo, "codex", "x");
    fs.writeFileSync(path.join(tmpRepo, "unrelated.txt"), "dirty\n");
    fs.writeFileSync(path.join(tmpRepo, "dashboard-like.ts"), "// not in any routines-*/\n");

    const { previewSaveToRepo, releaseSaveLock } = await import("@/lib/save-to-repo");
    const result = await previewSaveToRepo("codex", "x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // unrelated.txt must still be untracked (?? in porcelain)
    const status = execSync("git status --porcelain", { cwd: tmpRepo }).toString();
    expect(status).toContain("?? unrelated.txt");
    expect(status).toContain("?? dashboard-like.ts");

    // And neither is anywhere in the staged set
    const diffCachedNames = execSync("git diff --cached --name-only", { cwd: tmpRepo })
      .toString()
      .trim();
    expect(diffCachedNames).not.toContain("unrelated.txt");
    expect(diffCachedNames).not.toContain("dashboard-like.ts");

    await releaseSaveLock({ lockToken: result.lockToken });
  });

  it("no-changes: returns {ok:false, kind:'no-changes'} when subpath is in sync with HEAD", async () => {
    seedBundle(tmpRepo, "codex", "already-committed");
    // Commit the bundle first so there's nothing new to stage on the next preview.
    execSync("git add routines-codex/already-committed", { cwd: tmpRepo });
    execSync("git commit -q -m 'seed bundle'", { cwd: tmpRepo });

    const { previewSaveToRepo } = await import("@/lib/save-to-repo");
    const result = await previewSaveToRepo("codex", "already-committed");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("no-changes");
    expect(result.error).toMatch(/No changes to commit/);
  });
});

describe("save-to-repo (mocked simple-git)", () => {
  let env: ReturnType<typeof makeTempHome>;
  let priorRepoRoot: string | undefined;

  beforeEach(() => {
    env = makeTempHome();
    priorRepoRoot = process.env.SLEEPWALKER_REPO_ROOT;
    // Any writable path is fine for the mocked case — simple-git is mocked.
    process.env.SLEEPWALKER_REPO_ROOT = env.home;
    vi.resetModules();
  });

  afterEach(() => {
    if (priorRepoRoot === undefined) delete process.env.SLEEPWALKER_REPO_ROOT;
    else process.env.SLEEPWALKER_REPO_ROOT = priorRepoRoot;
    env.restore();
    vi.restoreAllMocks();
    vi.doUnmock("simple-git");
    vi.doUnmock("proper-lockfile");
  });

  it("never pushes: full preview → commit flow never calls simple-git push", async () => {
    const pushSpy = vi.fn();
    const addSpy = vi.fn(async () => undefined);
    const commitSpy = vi.fn(async () => ({ commit: "abc1234def5678900000000000000000000deadbe" }));
    const rawSpy = vi.fn(async () => "");
    const diffSpy = vi.fn(async () => ({
      files: [{ file: "routines-codex/x/config.json", insertions: 2, deletions: 0 }],
      insertions: 2,
      deletions: 0,
    }));

    vi.doMock("simple-git", () => ({
      simpleGit: () => ({
        add: addSpy,
        diffSummary: diffSpy,
        commit: commitSpy,
        raw: rawSpy,
        push: pushSpy,
      }),
    }));
    // Mock proper-lockfile so we don't need a real sentinel.
    vi.doMock("proper-lockfile", () => ({
      lock: vi.fn(async () => async () => undefined),
    }));

    const { previewSaveToRepo, commitSaveToRepo } = await import("@/lib/save-to-repo");
    const prev = await previewSaveToRepo("codex", "x");
    expect(prev.ok).toBe(true);
    if (!prev.ok) return;

    const committed = await commitSaveToRepo({
      lockToken: prev.lockToken,
      message: "feat(routines): add codex/x",
    });
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(committed.sha).toBe("abc1234def5678900000000000000000000deadbe");
      expect(committed.shortSha).toBe("abc1234");
    }

    // THE invariant: never-push
    expect(pushSpy).not.toHaveBeenCalled();
    // And just to be sure: commit WAS called
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith("feat(routines): add codex/x");
  });

  it("release resets: releaseSaveLock runs git reset HEAD -- subpath and git rm --cached", async () => {
    const addSpy = vi.fn(async () => undefined);
    const diffSpy = vi.fn(async () => ({
      files: [{ file: "routines-gemini/weekly/config.json", insertions: 1, deletions: 0 }],
      insertions: 1,
      deletions: 0,
    }));
    const rawCalls: string[][] = [];
    const rawSpy = vi.fn(async (args: string[]) => {
      rawCalls.push([...args]);
      return "";
    });
    const releaseMock = vi.fn(async () => undefined);

    vi.doMock("simple-git", () => ({
      simpleGit: () => ({
        add: addSpy,
        diffSummary: diffSpy,
        commit: vi.fn(),
        raw: rawSpy,
        push: vi.fn(),
      }),
    }));
    vi.doMock("proper-lockfile", () => ({
      lock: vi.fn(async () => releaseMock),
    }));

    const { previewSaveToRepo, releaseSaveLock } = await import("@/lib/save-to-repo");
    const prev = await previewSaveToRepo("gemini", "weekly");
    expect(prev.ok).toBe(true);
    if (!prev.ok) return;

    const released = await releaseSaveLock({ lockToken: prev.lockToken });
    expect(released.ok).toBe(true);

    // Assert ["reset", "HEAD", "--", "routines-gemini/weekly/"] was invoked
    const resetCall = rawCalls.find(
      (args) =>
        args[0] === "reset" &&
        args[1] === "HEAD" &&
        args[2] === "--" &&
        args[3] === "routines-gemini/weekly/",
    );
    expect(resetCall).toBeDefined();

    // Assert ["rm", "--cached", "--ignore-unmatch", "-r", "--", "routines-gemini/weekly/"]
    // was invoked (Pitfall #7 newly-added-paths coverage).
    const rmCachedCall = rawCalls.find(
      (args) =>
        args[0] === "rm" &&
        args.includes("--cached") &&
        args.includes("--ignore-unmatch") &&
        args.includes("routines-gemini/weekly/"),
    );
    expect(rmCachedCall).toBeDefined();

    // And the lockfile release was called.
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("stale lock reclaim: proper-lockfile ELOCKED on first call, then succeeds after release", async () => {
    // Simulate a stale lock by making proper-lockfile throw ELOCKED on the
    // first call and succeed on the second. This mirrors the production
    // behavior where proper-lockfile's own `stale: 30_000` check reclaims a
    // lock whose sentinel mtime has not been refreshed in >30s.
    let call = 0;
    const lockMock = vi.fn(async () => {
      call++;
      if (call === 1) {
        const err = new Error("Lock is already being held") as NodeJS.ErrnoException;
        err.code = "ELOCKED";
        throw err;
      }
      return async () => undefined;
    });
    const addSpy = vi.fn(async () => undefined);
    const diffSpy = vi.fn(async () => ({
      files: [{ file: "routines-codex/reclaim/config.json", insertions: 1, deletions: 0 }],
      insertions: 1,
      deletions: 0,
    }));
    vi.doMock("simple-git", () => ({
      simpleGit: () => ({
        add: addSpy,
        diffSummary: diffSpy,
        commit: vi.fn(),
        raw: vi.fn(async () => ""),
        push: vi.fn(),
      }),
    }));
    vi.doMock("proper-lockfile", () => ({ lock: lockMock }));

    const { previewSaveToRepo } = await import("@/lib/save-to-repo");

    // First attempt: lock-busy (simulated stale lock still held).
    const first = await previewSaveToRepo("codex", "reclaim");
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.kind).toBe("lock-busy");

    // Second attempt: proper-lockfile's stale-reclaim logic succeeds.
    const second = await previewSaveToRepo("codex", "reclaim");
    expect(second.ok).toBe(true);
    expect(lockMock).toHaveBeenCalledTimes(2);
  });
});
