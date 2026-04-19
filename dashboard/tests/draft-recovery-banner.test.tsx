// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { DraftRecoveryBanner } from "@/app/editor/_components/draft-recovery-banner";

afterEach(cleanup);

const validDraft = {
  version: 1,
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  fields: {
    name: "Test",
    slug: "test",
    runtime: "codex",
    prompt: "p",
    schedule: "0 6 * * *",
    reversibility: "yellow",
    budget: 40000,
  },
};

describe("DraftRecoveryBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders null when no draft in localStorage", () => {
    const { container } = render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders banner when valid draft present", () => {
    localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
    render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    expect(screen.getByText(/You have an unsaved draft from/)).toBeTruthy();
    expect(screen.getByText("Restore draft")).toBeTruthy();
    expect(screen.getByText("Start fresh")).toBeTruthy();
  });

  it("calls onRestore with draft fields when Restore draft clicked", () => {
    localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
    const onRestore = vi.fn();
    render(
      <DraftRecoveryBanner
        onRestore={onRestore}
        onStartFresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Restore draft"));
    expect(onRestore).toHaveBeenCalledTimes(1);
    const arg = onRestore.mock.calls[0][0];
    expect(arg.name).toBe("Test");
    expect(arg.slug).toBe("test");
    expect(arg.runtime).toBe("codex");
  });

  it("calls onStartFresh when Start fresh clicked", () => {
    localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
    const onStartFresh = vi.fn();
    render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={onStartFresh}
      />,
    );
    fireEvent.click(screen.getByText("Start fresh"));
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });

  it("renders null when localStorage has malformed JSON", () => {
    localStorage.setItem("sleepwalker.draft.v1", "{bad json");
    const { container } = render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("disappears after user clicks Start fresh and clears localStorage", () => {
    localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
    const { container } = render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Start fresh"));
    expect(container.innerHTML).toBe("");
    expect(localStorage.getItem("sleepwalker.draft.v1")).toBeNull();
  });
});
