// dashboard/tests/save-to-repo-action.test.ts
//
// Integration matrix for the Plan 04-05 Server Action wrappers around the
// Plan 04-02 save-to-repo library. These tests exercise the three Server
// Actions (previewSaveToRepoAction / commitSaveToRepoAction /
// releaseSaveLockAction) against a REAL mkdtempSync git repo, verifying
// the pass-through boundary does not lose fidelity from the lib-level
// coverage in tests/save-to-repo.test.ts.
//
// Authoritative source: .planning/phases/04-deploy/04-05-PLAN.md Task 2
// (>=4 it() blocks — preview ok, preview→commit round-trip, preview→release
// re-allows a subsequent preview, preview→preview-without-release returns
// lock-busy).
//
// Isolation strategy:
//   - `makeTempHome()` overrides $HOME so the library's
//     ~/.sleepwalker/git.lock.sentinel lands under a temp dir and never
//     touches real user state.
//   - `fs.mkdtempSync` + `git init -q` creates a fresh repo per block.
//   - `process.env.SLEEPWALKER_REPO_ROOT` overrides the library's repo-root
//     resolver so simple-git points at the tmp repo without chdir'ing the
//     process.
//   - No vi.doMock: the whole point of this test is to exercise the real
//     lib + real simple-git through the Server Action boundary. Library
//     behavior is unit-tested in tests/save-to-repo.test.ts with mocks
//     where appropriate; this file validates the wrapper.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome } from "./helpers";

describe("save-to-repo Server Actions (integration)", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;
  let priorRepoRoot: string | undefined;

  beforeEach(() => {
    env = makeTempHome();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-repo-act-"));
    execSync("git init -q", { cwd: tmpRepo });
    execSync('git config user.email "t@t"', { cwd: tmpRepo });
    execSync('git config user.name "t"', { cwd: tmpRepo });
    execSync("git config commit.gpgsign false", { cwd: tmpRepo });
    fs.writeFileSync(path.join(tmpRepo, "README.md"), "seed\n");
    execSync("git add README.md && git commit -q -m 'seed'", { cwd: tmpRepo });
    // Seed a routines-codex/x/ bundle so previewSaveToRepoAction has something
    // to stage. Keeping it minimal — 04-02's lib tests already exercise
    // rich-bundle diff shapes.
    fs.mkdirSync(path.join(tmpRepo, "routines-codex", "x"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, "routines-codex", "x", "config.json"), "{}");
    fs.writeFileSync(path.join(tmpRepo, "routines-codex", "x", "prompt.md"), "p");
    priorRepoRoot = process.env.SLEEPWALKER_REPO_ROOT;
    process.env.SLEEPWALKER_REPO_ROOT = tmpRepo;
  });

  afterEach(() => {
    if (priorRepoRoot === undefined) delete process.env.SLEEPWALKER_REPO_ROOT;
    else process.env.SLEEPWALKER_REPO_ROOT = priorRepoRoot;
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("preview action returns ok with lockToken on a real repo", async () => {
    const { previewSaveToRepoAction, releaseSaveLockAction } = await import(
      "@/app/routines/actions"
    );
    const res = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.lockToken).toMatch(/^[0-9a-f]{32}$/);
      expect(res.files.length).toBeGreaterThan(0);
      await releaseSaveLockAction({ lockToken: res.lockToken });
    }
  });

  it("preview -> commit round-trip produces a real git commit", async () => {
    const { previewSaveToRepoAction, commitSaveToRepoAction } = await import(
      "@/app/routines/actions"
    );
    const preview = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const commit = await commitSaveToRepoAction({
      lockToken: preview.lockToken,
      message: "feat(routines): add codex/x",
    });
    expect(commit.ok).toBe(true);
    if (commit.ok) {
      expect(commit.sha).toMatch(/^[0-9a-f]{7,40}$/);
      expect(commit.shortSha).toHaveLength(7);
      const log = execSync("git log --oneline -1", { cwd: tmpRepo }).toString();
      expect(log).toContain("feat(routines): add codex/x");
    }
  });

  it("preview -> release -> preview: lock is released", async () => {
    const { previewSaveToRepoAction, releaseSaveLockAction } = await import(
      "@/app/routines/actions"
    );
    const first = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await releaseSaveLockAction({ lockToken: first.lockToken });

    // Seed a fresh change so the second preview has something new to stage.
    // Without this, the second preview would return kind:"no-changes" (because
    // the first preview staged but did not commit, then released — the index
    // was reset, bundle is in sync with HEAD's absence, but wait: actually
    // the routines-codex/x/ dir is untracked so there IS still a change).
    // We still modify prompt.md to make the assertion robust if the lib ever
    // tightens its no-changes detection.
    fs.writeFileSync(path.join(tmpRepo, "routines-codex", "x", "prompt.md"), "p2");

    const second = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(second.ok).toBe(true);
    if (second.ok) await releaseSaveLockAction({ lockToken: second.lockToken });
  });

  it("second preview without release returns lock-busy", async () => {
    const { previewSaveToRepoAction, releaseSaveLockAction } = await import(
      "@/app/routines/actions"
    );
    const first = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(first.ok).toBe(true);

    const second = await previewSaveToRepoAction({ runtime: "codex", slug: "x" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.kind).toBe("lock-busy");

    if (first.ok) await releaseSaveLockAction({ lockToken: first.lockToken });
  });
});
