import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, ensureSleepwalkerDir } from "./helpers";

describe("audit lib", () => {
  let env: ReturnType<typeof makeTempHome>;
  let dir: string;

  beforeEach(() => {
    env = makeTempHome();
    dir = ensureSleepwalkerDir(env.home);
  });

  afterEach(() => env.restore());

  it("readAudit returns empty when no file exists", async () => {
    const { readAudit } = await import("@/lib/audit");
    expect(readAudit()).toEqual([]);
  });

  it("readAudit parses entries and reverses to newest-first", async () => {
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        JSON.stringify({ ts: "2026-04-18T01:00:00Z", fleet: "a", tool: "Read" }),
        JSON.stringify({ ts: "2026-04-18T02:00:00Z", fleet: "b", tool: "Edit" }),
      ].join("\n") + "\n"
    );
    const { readAudit } = await import("@/lib/audit");
    const entries = readAudit();
    expect(entries).toHaveLength(2);
    expect(entries[0].fleet).toBe("b"); // newest first
    expect(entries[1].fleet).toBe("a");
  });

  it("readAudit limits to last N", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(JSON.stringify({ ts: `2026-04-18T00:${String(i).padStart(2, "0")}:00Z`, fleet: "f" }));
    }
    fs.writeFileSync(path.join(dir, "audit.jsonl"), lines.join("\n") + "\n");
    const { readAudit } = await import("@/lib/audit");
    const entries = readAudit(10);
    expect(entries).toHaveLength(10);
    // newest-first means we got the last 10 entries reversed
    expect(entries[0].ts).toBe("2026-04-18T00:49:00Z");
    expect(entries[9].ts).toBe("2026-04-18T00:40:00Z");
  });

  it("readAudit skips malformed lines", async () => {
    fs.writeFileSync(
      path.join(dir, "audit.jsonl"),
      [
        JSON.stringify({ ts: "x", fleet: "ok1" }),
        "garbage{",
        "",
        JSON.stringify({ ts: "y", fleet: "ok2" }),
      ].join("\n")
    );
    const { readAudit } = await import("@/lib/audit");
    expect(readAudit().map((e) => e.fleet)).toEqual(["ok2", "ok1"]);
  });
});
