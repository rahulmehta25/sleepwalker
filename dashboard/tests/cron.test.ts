import { describe, it, expect } from "vitest";
import { parseCron } from "@/lib/runtime-adapters/cron";

// Regression: parseInt("*/5", 10) returns NaN; the previous inline parsers in
// codex.ts and gemini.ts let NaN pass an `!== undefined` guard, which caused
// launchd-writer to emit `<integer>NaN</integer>` and plutil -lint to reject
// the plist. The shared cron.ts parser must never let NaN escape.

describe("parseCron — fallback behavior", () => {
  it("null input → daily interval (86400s)", () => {
    expect(parseCron(null)).toEqual({ kind: "interval", seconds: 86400 });
  });

  it("empty string → daily interval", () => {
    expect(parseCron("")).toEqual({ kind: "interval", seconds: 86400 });
  });

  it("wrong part count → daily interval", () => {
    expect(parseCron("0 3 *")).toEqual({ kind: "interval", seconds: 86400 });
    expect(parseCron("0 3 * * * *")).toEqual({ kind: "interval", seconds: 86400 });
  });
});

describe("parseCron — step-syntax fast paths", () => {
  it("*/5 * * * * → 300s interval", () => {
    expect(parseCron("*/5 * * * *")).toEqual({ kind: "interval", seconds: 300 });
  });

  it("*/15 * * * * → 900s interval", () => {
    expect(parseCron("*/15 * * * *")).toEqual({ kind: "interval", seconds: 900 });
  });

  it("*/30 * * * * → 1800s interval", () => {
    expect(parseCron("*/30 * * * *")).toEqual({ kind: "interval", seconds: 1800 });
  });

  it("0 */2 * * * → 7200s (2-hour) interval", () => {
    expect(parseCron("0 */2 * * *")).toEqual({ kind: "interval", seconds: 7200 });
  });

  it("0 */6 * * * → 21600s (6-hour) interval", () => {
    expect(parseCron("0 */6 * * *")).toEqual({ kind: "interval", seconds: 21600 });
  });

  it("* * * * * → 60s interval (every minute)", () => {
    expect(parseCron("* * * * *")).toEqual({ kind: "interval", seconds: 60 });
  });

  it("*/0 minute (invalid step) falls through to calendar with undefined minute", () => {
    const r = parseCron("*/0 * * * *");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") {
      expect(r.minute).toBeUndefined();
      expect(r.minute as unknown as number).not.toBe(NaN);
    }
  });

  it("*/60 minute (out of range) falls through to calendar with undefined minute", () => {
    const r = parseCron("*/60 * * * *");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") {
      expect(r.minute).toBeUndefined();
    }
  });
});

describe("parseCron — standard calendar path", () => {
  it("0 3 * * * → daily at 03:00", () => {
    expect(parseCron("0 3 * * *")).toEqual({
      kind: "calendar",
      minute: 0,
      hour: 3,
      day: undefined,
      month: undefined,
      weekday: undefined,
    });
  });

  it("30 7 1 * * → 07:30 on day-of-month 1", () => {
    expect(parseCron("30 7 1 * *")).toEqual({
      kind: "calendar",
      minute: 30,
      hour: 7,
      day: 1,
      month: undefined,
      weekday: undefined,
    });
  });

  it("0 9 * * 1 → Mondays at 09:00", () => {
    expect(parseCron("0 9 * * 1")).toEqual({
      kind: "calendar",
      minute: 0,
      hour: 9,
      day: undefined,
      month: undefined,
      weekday: 1,
    });
  });
});

describe("parseCron — never leaks NaN", () => {
  // This is the blocking regression: every numeric field of the returned
  // schedule, regardless of input, must satisfy `Number.isFinite(v) || v === undefined`.
  const inputs = [
    null,
    "",
    "garbage",
    "*/5 * * * *",
    "*/15 * * * *",
    "0 3 * * *",
    "* * * * *",
    "1-5 * * * *",    // range: unsupported → undefined, not NaN
    "1,3,5 * * * *",  // list: unsupported → undefined
    "MON * * * *",    // named alias: unsupported → undefined
    "*/abc * * * *",  // malformed step: undefined
    "*/0 * * * *",    // invalid step value: undefined
    "0 */999 * * *",  // out-of-range hour step: undefined
  ];

  for (const input of inputs) {
    it(`does not leak NaN for input: ${JSON.stringify(input)}`, () => {
      const r = parseCron(input);
      if (r.kind === "interval") {
        expect(Number.isFinite(r.seconds)).toBe(true);
      } else if (r.kind === "calendar") {
        for (const k of ["minute", "hour", "day", "month", "weekday"] as const) {
          const v = r[k];
          expect(v === undefined || Number.isFinite(v)).toBe(true);
        }
      }
    });
  }
});

describe("parseCron — unsupported cron features drop to undefined", () => {
  it("range (1-5) in minute drops to undefined", () => {
    const r = parseCron("1-5 * * * *");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") expect(r.minute).toBeUndefined();
  });

  it("list (1,3,5) in minute drops to undefined", () => {
    const r = parseCron("1,3,5 * * * *");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") expect(r.minute).toBeUndefined();
  });

  it("named alias (MON) in weekday drops to undefined", () => {
    const r = parseCron("0 9 * * MON");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") expect(r.weekday).toBeUndefined();
  });

  it("negative number drops to undefined", () => {
    const r = parseCron("-1 * * * *");
    expect(r.kind).toBe("calendar");
    if (r.kind === "calendar") expect(r.minute).toBeUndefined();
  });
});
