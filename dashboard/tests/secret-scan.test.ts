// dashboard/tests/secret-scan.test.ts
//
// Positive/negative matrix for scanForSecrets.
//
// 11-pattern source: dashboard/lib/secret-patterns.ts
// Pitfall #5 (Client/Server Scan Drift) is defeated ONLY when both the editor
// client preview and actions.ts saveRoutine import this same scanner. These
// tests pin the shared contract.
//
// EDIT-02 row in 03-VALIDATION.md (row 5).

import { describe, it, expect } from "vitest";
import { scanForSecrets, type SecretMatch } from "@/lib/secret-scan";

describe("scanForSecrets — negative", () => {
  it("returns [] for empty string", () => {
    expect(scanForSecrets("")).toEqual([]);
  });

  it("returns [] for safe prose", () => {
    expect(
      scanForSecrets("You are the overnight brief agent. Read ~/Downloads."),
    ).toEqual([]);
  });

  it("returns [] when user uses ${VAR} placeholder", () => {
    expect(scanForSecrets("use ${OPENAI_API_KEY} from env")).toEqual([]);
  });
});

describe("scanForSecrets — positive per pattern", () => {
  it.each([
    ["stripe-live-key",  "sk_live_" + "a".repeat(32)],
    ["stripe-test-key",  "sk_test_" + "b".repeat(32)],
    ["github-pat",       "ghp_" + "c".repeat(40)],
    ["github-oauth",     "gho_" + "d".repeat(40)],
    ["aws-access-key",   "AKIAABCDEFGHIJKLMNOP"],
    ["slack-token",      "xoxb-1234567890abc-defghij"],
    ["anthropic-key",    "sk-ant-" + "x".repeat(40)],
    ["google-api-key",   "AIza" + "y".repeat(35)],
    ["generic-40-hex",   "abcdef0123456789abcdef0123456789abcdef01"],
  ] as const)("detects %s", (expectedName, sample) => {
    const matches = scanForSecrets(`prefix ${sample} suffix`);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.patternName === expectedName)).toBe(true);
  });

  it("detects OpenAI key with T3BlbkFJ infix", () => {
    const sample = "sk-" + "A".repeat(20) + "T3BlbkFJ" + "B".repeat(20);
    const matches = scanForSecrets(sample);
    expect(matches.some((m) => m.patternName === "openai-key")).toBe(true);
  });

  it("detects PEM header", () => {
    const matches = scanForSecrets(
      "-----BEGIN RSA PRIVATE KEY-----\nbody\n-----END RSA PRIVATE KEY-----",
    );
    expect(matches.some((m) => m.patternName === "pem-private-key")).toBe(true);
  });
});

describe("scanForSecrets — location accuracy", () => {
  it("reports line=3 when secret is on third line", () => {
    const text = "line one\nline two\nAKIAABCDEFGHIJKLMNOP";
    const hits = scanForSecrets(text).filter(
      (m) => m.patternName === "aws-access-key",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].line).toBe(3);
    expect(hits[0].column).toBeGreaterThan(0);
  });

  it("returns multiple matches when multiple secrets present", () => {
    const text = "AKIAABCDEFGHIJKLMNOP and ghp_" + "a".repeat(40);
    const matches = scanForSecrets(text);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("populates matched and description fields", () => {
    const m = scanForSecrets("AKIAABCDEFGHIJKLMNOP").find(
      (x) => x.patternName === "aws-access-key",
    ) as SecretMatch;
    expect(m).toBeDefined();
    expect(m.matched).toBe("AKIAABCDEFGHIJKLMNOP");
    expect(m.description).toContain("AWS");
  });

  it("sorts matches by line then column", () => {
    const text =
      "ghp_" + "a".repeat(40) + "\nAKIAABCDEFGHIJKLMNOP AKIAZZZZZZZZZZZZZZZZ";
    const matches = scanForSecrets(text);
    for (let i = 1; i < matches.length; i++) {
      const prev = matches[i - 1];
      const curr = matches[i];
      const prevKey = prev.line * 1_000_000 + prev.column;
      const currKey = curr.line * 1_000_000 + curr.column;
      expect(currKey).toBeGreaterThanOrEqual(prevKey);
    }
  });
});
