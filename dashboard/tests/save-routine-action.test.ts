// dashboard/tests/save-routine-action.test.ts
//
// End-to-end Server Action test matrix for `saveRoutine` +
// `checkSlugAvailability`.
//
// Every test uses `makeTempHome()` + `process.chdir(tmpRepo)` so `routines-*/`
// enumeration is isolated from the real repo. The Server Actions are
// re-imported per test (Vitest fresh-module cache) so cwd-dependent reads
// see the tmp repo.
//
// Authoritative UI-SPEC copy references:
//   - Secret message (03-UI-SPEC §Secret-scan error panel body)
//   - Same-runtime collision (03-UI-SPEC §Slug collision copy)
//   - Cross-runtime collision (03-UI-SPEC §Slug collision copy)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome } from "./helpers";

const ORIG_CWD = process.cwd();

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

const validInput: Record<string, string> = {
  name: "Morning brief",
  slug: "morning-brief",
  runtime: "codex",
  prompt: "You are the overnight brief agent.",
  schedule: "0 6 * * 1-5",
  reversibility: "yellow",
  budget: "40000",
};

describe("saveRoutine Server Action", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    env = makeTempHome();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-act-"));
    process.chdir(tmpRepo);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("writes config.json + prompt.md on codex happy path", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine({ status: "idle" }, fd(validInput));
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(
        fs.existsSync(
          path.join(tmpRepo, "routines-codex", "morning-brief", "config.json"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpRepo, "routines-codex", "morning-brief", "prompt.md"),
        ),
      ).toBe(true);
      expect(res.bundlePath).toContain("routines-codex/morning-brief");
      expect(res.runtime).toBe("codex");
      expect(res.slug).toBe("morning-brief");
    }
  });

  it("writes SKILL.md with frontmatter + body on claude-desktop happy path", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, runtime: "claude-desktop", slug: "my-task" }),
    );
    expect(res.status).toBe("ok");
    const skillPath = path.join(
      tmpRepo,
      "routines-local",
      "my-task",
      "SKILL.md",
    );
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: Morning brief");
    expect(content).toContain("schedule: 0 6 * * 1-5");
    expect(content).toContain("You are the overnight brief agent.");
    expect(
      fs.existsSync(
        path.join(tmpRepo, "routines-local", "my-task", "config.json"),
      ),
    ).toBe(false);
  });

  it("returns a manual-add warning on claude-desktop success (Q1 smoke)", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, runtime: "claude-desktop", slug: "ql-warn" }),
    );
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.warning).toBeTruthy();
      expect(res.warning ?? "").toMatch(/Claude Desktop does not auto-detect/);
      expect(res.warning ?? "").toMatch(/Schedule/);
    }
  });

  it("returns fieldErrors on zod failure and does not touch disk", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, name: "" }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.fieldErrors.name?.[0]).toBe("Name is required.");
    }
    expect(
      fs.existsSync(path.join(tmpRepo, "routines-codex", "morning-brief")),
    ).toBe(false);
  });

  it("rejects invalid slug regex via zod", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, slug: "Bad_Slug" }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.fieldErrors.slug?.[0] ?? "").toMatch(/lowercase letters/);
    }
  });

  it("secret blocks write — AWS key in prompt — disk NEVER touched", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const poisoned = "instruction: use AKIAABCDEFGHIJKLMNOP for aws";
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, prompt: poisoned }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.fieldErrors.prompt?.[0] ?? "").toMatch(
        /^Prompt appears to contain a secret/,
      );
      expect(res.fieldErrors.prompt?.[0] ?? "").toMatch(/Save blocked\.$/);
    }
    expect(
      fs.existsSync(path.join(tmpRepo, "routines-codex", "morning-brief")),
    ).toBe(false);
  });

  it("secret blocks write — Stripe key in prompt — disk NEVER touched", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const poisoned = "use sk_live_" + "a".repeat(32);
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, prompt: poisoned }),
    );
    expect(res.status).toBe("error");
    expect(
      fs.existsSync(path.join(tmpRepo, "routines-codex", "morning-brief")),
    ).toBe(false);
  });

  it("collision same runtime returns UI-SPEC slug message", async () => {
    fs.mkdirSync(path.join(tmpRepo, "routines-codex", "morning-brief"), {
      recursive: true,
    });
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine({ status: "idle" }, fd(validInput));
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.fieldErrors.slug?.[0] ?? "").toContain(
        "routines-codex/morning-brief/",
      );
      expect(res.fieldErrors.slug?.[0] ?? "").toContain(
        "Choose a different slug.",
      );
    }
  });

  it("collision cross-runtime returns UI-SPEC cross-runtime message and leaves no partial writes", async () => {
    fs.mkdirSync(path.join(tmpRepo, "routines-codex", "morning-brief"), {
      recursive: true,
    });
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, runtime: "gemini" }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.fieldErrors.slug?.[0] ?? "").toContain("codex routine");
      expect(res.fieldErrors.slug?.[0] ?? "").toContain(
        "unique across runtimes",
      );
    }
    expect(
      fs.existsSync(path.join(tmpRepo, "routines-gemini", "morning-brief")),
    ).toBe(false);
  });

  it("returns status ok on gemini happy path", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, runtime: "gemini", slug: "sync" }),
    );
    expect(res.status).toBe("ok");
    expect(
      fs.existsSync(
        path.join(tmpRepo, "routines-gemini", "sync", "config.json"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpRepo, "routines-gemini", "sync", "prompt.md")),
    ).toBe(true);
  });

  it("returns status ok on claude-routines happy path (writes SKILL.md)", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, runtime: "claude-routines", slug: "cloudy" }),
    );
    expect(res.status).toBe("ok");
    expect(
      fs.existsSync(
        path.join(tmpRepo, "routines-cloud", "cloudy", "SKILL.md"),
      ),
    ).toBe(true);
    if (res.status === "ok") {
      // No manual-add warning for cloud routines — that is Desktop-specific.
      expect(res.warning).toBeUndefined();
    }
  });

  it("coerces FormData string budget through zod into numeric config", async () => {
    const { saveRoutine } = await import("@/app/editor/actions");
    const res = await saveRoutine(
      { status: "idle" },
      fd({ ...validInput, slug: "coerce-check", budget: "12345" }),
    );
    expect(res.status).toBe("ok");
    const cfgPath = path.join(
      tmpRepo,
      "routines-codex",
      "coerce-check",
      "config.json",
    );
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    expect(cfg.budget).toBe(12345);
    expect(typeof cfg.budget).toBe("number");
  });
});

describe("checkSlugAvailability", () => {
  let env: ReturnType<typeof makeTempHome>;
  let tmpRepo: string;

  beforeEach(() => {
    env = makeTempHome();
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sw-csa-"));
    process.chdir(tmpRepo);
  });

  afterEach(() => {
    process.chdir(ORIG_CWD);
    env.restore();
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("returns available when slug is in no runtime", async () => {
    const { checkSlugAvailability } = await import("@/app/editor/actions");
    const res = await checkSlugAvailability("codex", "free-slug");
    expect(res).toEqual({ available: true });
  });

  it("returns available when slug is empty (permissive)", async () => {
    const { checkSlugAvailability } = await import("@/app/editor/actions");
    const res = await checkSlugAvailability("codex", "");
    expect(res).toEqual({ available: true });
  });

  it("returns unavailable with same-runtime message", async () => {
    fs.mkdirSync(path.join(tmpRepo, "routines-codex", "taken"), {
      recursive: true,
    });
    const { checkSlugAvailability } = await import("@/app/editor/actions");
    const res = await checkSlugAvailability("codex", "taken");
    expect(res.available).toBe(false);
    if (!res.available) {
      expect(res.existsIn).toBe("codex");
      expect(res.message).toContain("already exists");
      expect(res.message).toContain("routines-codex/taken/");
    }
  });

  it("returns unavailable with cross-runtime message", async () => {
    fs.mkdirSync(path.join(tmpRepo, "routines-codex", "taken"), {
      recursive: true,
    });
    const { checkSlugAvailability } = await import("@/app/editor/actions");
    const res = await checkSlugAvailability("gemini", "taken");
    expect(res.available).toBe(false);
    if (!res.available) {
      expect(res.existsIn).toBe("codex");
      expect(res.message).toContain("codex routine");
      expect(res.message).toContain("unique across runtimes");
    }
  });
});
