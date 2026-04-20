// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HealthBadgeRow } from "@/app/_components/health-badge-row";

// Node 25 ships an experimental `globalThis.sessionStorage` that leaks into
// jsdom's Window, leaving `window.sessionStorage` as a plain {} without a
// Storage prototype (no .getItem / .setItem / .clear). Install the same
// Map-backed Storage-compatible stub used by draft-recovery-banner.test.tsx.
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

const mixedResponse = {
  statuses: [
    { runtime: "claude-routines", available: true, version: "1.0" },
    { runtime: "claude-desktop", available: true, warning: "manual add" },
    { runtime: "codex", available: false, reason: "not installed" },
    { runtime: "gemini", available: true, version: "2.0" },
  ],
  checkedAt: new Date().toISOString(),
};

describe("HealthBadgeRow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: makeStorage(),
    });
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(mixedResponse), { status: 200 }),
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("render states — loading initially, then green/amber/grey after fetch", async () => {
    render(<HealthBadgeRow />);
    // Initial render — all four badges in loading state (status === null)
    expect(screen.getAllByText(/checking…/i).length).toBe(4);

    // After fetch resolves, mixed states render per their status shape
    await waitFor(() => {
      expect(screen.getByText(/Claude Routines · 1\.0/)).toBeTruthy();
    });
    expect(screen.getByText(/Codex · not installed/)).toBeTruthy();
    // Amber badge for claude-desktop (warning) renders with its label
    expect(screen.getByText(/^Claude Desktop$/)).toBeTruthy();
    // Gemini renders green with version
    expect(screen.getByText(/Gemini · 2\.0/)).toBeTruthy();
  });

  it("cache hit — second mount within 60s uses cache, no new fetch", async () => {
    window.sessionStorage.setItem(
      "sleepwalker:health:v1",
      JSON.stringify({
        statuses: [
          { runtime: "claude-routines", available: true, version: "1.0" },
          { runtime: "claude-desktop", available: true, version: "1.0" },
          { runtime: "codex", available: true, version: "1.0" },
          { runtime: "gemini", available: true, version: "1.0" },
        ],
        checkedAt: Date.now(),
      }),
    );
    render(<HealthBadgeRow />);
    // Wait until the cached state is rendered (no more loading pills)
    await waitFor(() =>
      expect(screen.queryAllByText(/checking…/i).length).toBe(0),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache expiry — stale entry (>60s) triggers fresh fetch", async () => {
    window.sessionStorage.setItem(
      "sleepwalker:health:v1",
      JSON.stringify({
        statuses: [
          { runtime: "claude-routines", available: true, version: "old" },
        ],
        checkedAt: Date.now() - 65_000,
      }),
    );
    render(<HealthBadgeRow />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("focus refetch — window focus event with stale cache triggers fetch", async () => {
    render(<HealthBadgeRow />);
    // Initial mount fetches once
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Expire the cache by overwriting with an old timestamp
    window.sessionStorage.setItem(
      "sleepwalker:health:v1",
      JSON.stringify({ statuses: [], checkedAt: Date.now() - 65_000 }),
    );

    await act(async () => {
      fireEvent.focus(window);
    });

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("manual refresh — RefreshCw click clears cache + re-fetches", async () => {
    render(<HealthBadgeRow />);
    // Wait for first fetch + resolved state so the Codex grey badge + its
    // refresh button exist in the DOM.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/Codex · not installed/)).toBeTruthy(),
    );

    // Codex is !available so its badge has a RefreshCw button
    const refreshBtn = screen.getByLabelText(/Refresh Codex health/i);

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
