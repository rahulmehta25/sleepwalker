// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { DraftRecoveryBanner } from "@/app/editor/_components/draft-recovery-banner";

afterEach(cleanup);

// Node 25 ships an experimental `globalThis.localStorage` that leaks into
// jsdom's Window, leaving `window.localStorage` as a plain {} without a
// Storage prototype (no .getItem / .setItem / .clear). Install a Map-backed
// Storage-compatible stub so the component and assertions exercise the same
// object. This only affects this test file — production code runs in real
// browsers where window.localStorage is the real Storage.
const makeStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  } satisfies Storage;
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: makeStorage(),
});

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
    // Node 25 ships an experimental localStorage global that can shadow
    // jsdom's implementation. Always go through window.localStorage so
    // tests exercise the same object the component sees.
    window.localStorage.clear();
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
    window.localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
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
    window.localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
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
    window.localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
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
    window.localStorage.setItem("sleepwalker.draft.v1", "{bad json");
    const { container } = render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("disappears after user clicks Start fresh and clears localStorage", () => {
    window.localStorage.setItem("sleepwalker.draft.v1", JSON.stringify(validDraft));
    const { container } = render(
      <DraftRecoveryBanner
        onRestore={() => {}}
        onStartFresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Start fresh"));
    expect(container.innerHTML).toBe("");
    expect(window.localStorage.getItem("sleepwalker.draft.v1")).toBeNull();
  });
});
