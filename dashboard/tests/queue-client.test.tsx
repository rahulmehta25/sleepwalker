// @vitest-environment jsdom
//
// jsdom coverage for Plan 05-07 Task 3 — QUEU-02 pill consumer wiring +
// SAFE-01 "approximate" copy in supervisor-run ActionDetail branch. Renders
// the inline helpers (SourcePill) and ActionDetail directly because
// queue-client.tsx exports them for testability (mirrors Phase 4
// DeployProgressDrawer export pattern).
//
// No module mocks required: SourcePill + ActionDetail are pure renderers.
// Pattern mirrors runtime-radio-grid.test.tsx (static import, cleanup per
// test, querySelector + toBeTruthy / not.toBeNull assertions — the repo
// does not use @testing-library/jest-dom).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SourcePill, ActionDetail } from "@/app/queue-client";
import type { QueueEntry } from "@/lib/queue";

afterEach(cleanup);

describe("queue-client pill + supervisor-run rendering (QUEU-02 + SAFE-01)", () => {
  it("SourcePill renders pill-codex for source='codex'", () => {
    const { container } = render(<SourcePill source="codex" />);
    const pill = container.querySelector(".pill-codex");
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("codex");
  });

  it("SourcePill renders pill-gemini for source='gemini'", () => {
    const { container } = render(<SourcePill source="gemini" />);
    const pill = container.querySelector(".pill-gemini");
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("gemini");
  });

  it("SourcePill renders pill-aurora for source='cloud' (regression guard)", () => {
    const { container } = render(<SourcePill source="cloud" />);
    expect(container.querySelector(".pill-aurora")).not.toBeNull();
    expect(container.querySelector(".pill-codex")).toBeNull();
    expect(container.querySelector(".pill-gemini")).toBeNull();
    expect(container.textContent).toBe("cloud");
  });

  it("SourcePill renders local variant for source='local'", () => {
    const { container } = render(<SourcePill source="local" />);
    const pill = container.querySelector("span");
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("local");
    // local has no branded codex/gemini/aurora class
    expect(container.querySelector(".pill-codex")).toBeNull();
    expect(container.querySelector(".pill-gemini")).toBeNull();
    expect(container.querySelector(".pill-aurora")).toBeNull();
  });

  it("renders 'approximate' copy for budget_exceeded supervisor-run entry (SAFE-01)", () => {
    const entry: QueueEntry = {
      id: "q_sup_codex_codex__test_20260421T0000_budget_exceeded",
      ts: "2026-04-21T00:00:00Z",
      fleet: "codex/test",
      kind: "supervisor-run",
      source: "codex",
      status: "failed",
      payload: {
        event: "budget_exceeded",
        chars_consumed: 42000,
        chars_limit: 40000,
        preview: "truncated content",
      },
    };
    const { container } = render(<ActionDetail entry={entry} />);
    const text = container.textContent ?? "";
    expect(text).toContain("approximate");
    expect(text).toContain("Stopped at");
    expect(text).toContain("budget");
    expect(text).toMatch(/42[,\.]?000/);
    expect(text).toMatch(/40[,\.]?000/);
    // Negative: the SAFE-01 ban — the budget-context string must never mention
    // "tokens".
    expect(text).not.toMatch(/budget.*tokens|tokens.*budget/);
  });

  it("supervisor-run ActionDetail renders preview + reason + exit code labels when present", () => {
    const entry: QueueEntry = {
      id: "q_sup_gemini_gemini__news_20260421T0100_failed",
      ts: "2026-04-21T01:00:00Z",
      fleet: "gemini/news",
      kind: "supervisor-run",
      source: "gemini",
      status: "failed",
      payload: {
        event: "failed",
        preview: "Error: network timeout",
        reason: "unrecoverable",
        exit_code: 1,
      },
    };
    const { container } = render(<ActionDetail entry={entry} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Event");
    expect(text).toContain("failed");
    expect(text).toContain("Preview");
    expect(text).toContain("Error: network timeout");
    expect(text).toContain("Reason");
    expect(text).toContain("unrecoverable");
    expect(text).toContain("Exit code");
    expect(text).toContain("1");
  });
});
