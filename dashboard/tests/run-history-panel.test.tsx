// @vitest-environment jsdom
//
// Component tests for RunHistoryPanel — the Ship #1 per-routine run
// history disclosure. Verifies:
//
//   1. Starts collapsed; does not fire the Server Action on mount.
//   2. Opens on toggle click, fires getRunHistory({runtime, slug}) exactly once.
//   3. Renders a row per RunRecord with correct status pill, relative time,
//      and truncated preview.
//   4. Empty state for supervisor-backed runtimes renders helpful copy.
//   5. Runtime-gated empty state (claude-routines / claude-desktop) surfaces
//      the advisory `reason` string from the Server Action.
//   6. Error response renders role=alert with the error text.
//   7. Refresh button triggers a second Server Action call.
//   8. Re-toggling open→closed→open does NOT refetch (cached).
//
// Server Action is mocked per the vi.mock pattern established by
// deploy-progress-drawer.test.tsx — @/app/routines/actions touches
// node:fs + runtime adapters and is not jsdom-compatible without it.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { RunRecord } from "@/lib/runtime-adapters/types";

const getRunHistoryMock = vi.fn();

vi.mock("@/app/routines/actions", () => ({
  getRunHistory: (args: unknown) => getRunHistoryMock(args),
}));

let RunHistoryPanel: typeof import("@/app/routines/_components/run-history-panel").RunHistoryPanel;

beforeEach(async () => {
  getRunHistoryMock.mockReset();
  // Dynamic import AFTER vi.mock registration so the component's import of
  // @/app/routines/actions resolves to the mock.
  RunHistoryPanel = (
    await import("@/app/routines/_components/run-history-panel")
  ).RunHistoryPanel;
});

afterEach(cleanup);

function buildRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ts: "2026-04-21T00:00:00Z",
    runId: "2026-04-21T00:00:00Z:codex/x",
    status: "succeeded",
    preview: "hello world",
    ...overrides,
  };
}

describe("RunHistoryPanel", () => {
  it("starts collapsed and does not call the Server Action on mount", () => {
    getRunHistoryMock.mockResolvedValue({ ok: true, runs: [] });
    render(<RunHistoryPanel runtime="codex" slug="alpha" />);
    expect(screen.queryByTestId("run-history-body")).toBeNull();
    expect(getRunHistoryMock).not.toHaveBeenCalled();
  });

  it("opens on toggle click and renders rows with correct status labels", async () => {
    getRunHistoryMock.mockResolvedValue({
      ok: true,
      runs: [
        buildRun({ ts: new Date(Date.now() - 60_000).toISOString(),   status: "succeeded", preview: "green run",  runId: "r1" }),
        buildRun({ ts: new Date(Date.now() - 120_000).toISOString(),  status: "failed",    preview: "fail run",   runId: "r2" }),
        buildRun({ ts: new Date(Date.now() - 180_000).toISOString(),  status: "deferred",  preview: undefined,    runId: "r3" }),
      ],
    });

    render(<RunHistoryPanel runtime="codex" slug="alpha" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-table")).toBeTruthy(),
    );

    expect(getRunHistoryMock).toHaveBeenCalledTimes(1);
    expect(getRunHistoryMock).toHaveBeenCalledWith({
      runtime: "codex",
      slug: "alpha",
      limit: 10,
    });

    const rows = screen.getAllByTestId("run-history-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute("data-status")).toBe("succeeded");
    expect(rows[1].getAttribute("data-status")).toBe("failed");
    expect(rows[2].getAttribute("data-status")).toBe("deferred");

    // Status labels
    expect(rows[0].textContent).toContain("OK");
    expect(rows[1].textContent).toContain("FAIL");
    expect(rows[2].textContent).toContain("DEFER");

    // Previews — third row has no preview, should show the muted placeholder
    expect(rows[0].textContent).toContain("green run");
    expect(rows[1].textContent).toContain("fail run");
    expect(rows[2].textContent).toContain("(no output)");
  });

  it("renders relative time, not raw ISO, in the 'when' column", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    getRunHistoryMock.mockResolvedValue({
      ok: true,
      runs: [buildRun({ ts: fiveMinutesAgo, runId: "r-time" })],
    });

    render(<RunHistoryPanel runtime="codex" slug="t" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-table")).toBeTruthy(),
    );

    const row = screen.getByTestId("run-history-row");
    // Should read "5m ago" or similar, NOT the ISO string
    expect(row.textContent).toMatch(/\d+(s|m|h|d) ago/);
    expect(row.textContent).not.toContain("2026-04-21T00:00:00Z");
    // The full ISO should still be available as a tooltip (title attr)
    const whenCell = row.querySelector("td[title]");
    expect(whenCell?.getAttribute("title")).toBe(fiveMinutesAgo);
  });

  it("truncates long previews to 140 chars + ellipsis", async () => {
    const huge = "x".repeat(500);
    getRunHistoryMock.mockResolvedValue({
      ok: true,
      runs: [buildRun({ preview: huge, runId: "r-huge" })],
    });

    render(<RunHistoryPanel runtime="codex" slug="t" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-table")).toBeTruthy(),
    );

    const row = screen.getByTestId("run-history-row");
    // Extract only the preview cell to avoid noise from other columns
    const previewCell = row.querySelectorAll("td")[2];
    expect(previewCell.textContent!.length).toBeLessThan(huge.length);
    expect(previewCell.textContent).toContain("…");
  });

  it("renders an empty-state message for supervisor-backed runtime with no runs", async () => {
    getRunHistoryMock.mockResolvedValue({ ok: true, runs: [] });
    render(<RunHistoryPanel runtime="codex" slug="no-runs" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-empty")).toBeTruthy(),
    );
    expect(screen.getByTestId("run-history-empty").textContent).toContain(
      "No runs yet",
    );
    expect(screen.queryByTestId("run-history-table")).toBeNull();
  });

  it("renders runtime-gated advisory text for claude-routines / claude-desktop", async () => {
    getRunHistoryMock.mockResolvedValue({
      ok: true,
      runs: [],
      reason: "Claude Routines runs live on api.anthropic.com; open the session to inspect.",
    });

    render(<RunHistoryPanel runtime="claude-routines" slug="anything" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-reason")).toBeTruthy(),
    );
    expect(screen.getByTestId("run-history-reason").textContent).toMatch(
      /api\.anthropic\.com/,
    );
    expect(screen.queryByTestId("run-history-table")).toBeNull();
    expect(screen.queryByTestId("run-history-empty")).toBeNull();
  });

  it("renders role=alert error banner on {ok:false}", async () => {
    getRunHistoryMock.mockResolvedValue({
      ok: false,
      runs: [],
      error: "Bundle not found: codex/ghost",
    });

    render(<RunHistoryPanel runtime="codex" slug="ghost" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-error")).toBeTruthy(),
    );
    const err = screen.getByTestId("run-history-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Bundle not found: codex/ghost");
  });

  it("refresh button triggers a second Server Action call", async () => {
    getRunHistoryMock
      .mockResolvedValueOnce({ ok: true, runs: [buildRun({ runId: "r-first",  preview: "first" })] })
      .mockResolvedValueOnce({ ok: true, runs: [buildRun({ runId: "r-second", preview: "second" })] });

    render(<RunHistoryPanel runtime="codex" slug="refresh" />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("run-history-row").textContent).toContain("first"),
    );

    fireEvent.click(screen.getByTestId("run-history-refresh"));
    await waitFor(() =>
      expect(screen.getByTestId("run-history-row").textContent).toContain("second"),
    );

    expect(getRunHistoryMock).toHaveBeenCalledTimes(2);
    expect(getRunHistoryMock).toHaveBeenNthCalledWith(1, { runtime: "codex", slug: "refresh", limit: 10 });
    expect(getRunHistoryMock).toHaveBeenNthCalledWith(2, { runtime: "codex", slug: "refresh", limit: 10 });
  });

  it("toggling open->closed->open does NOT refetch (cached until refresh clicked)", async () => {
    getRunHistoryMock.mockResolvedValue({
      ok: true,
      runs: [buildRun({ runId: "cache-r" })],
    });

    render(<RunHistoryPanel runtime="codex" slug="cached" />);
    const toggle = screen.getByTestId("run-history-toggle");
    fireEvent.click(toggle); // open
    await waitFor(() =>
      expect(screen.getByTestId("run-history-table")).toBeTruthy(),
    );
    expect(getRunHistoryMock).toHaveBeenCalledTimes(1);

    fireEvent.click(toggle); // close
    expect(screen.queryByTestId("run-history-body")).toBeNull();

    fireEvent.click(toggle); // reopen — must not refetch
    expect(screen.getByTestId("run-history-table")).toBeTruthy();
    expect(getRunHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("passes caller-supplied limit through to the Server Action", async () => {
    getRunHistoryMock.mockResolvedValue({ ok: true, runs: [] });
    render(<RunHistoryPanel runtime="gemini" slug="limit" limit={25} />);
    fireEvent.click(screen.getByTestId("run-history-toggle"));
    await waitFor(() => expect(getRunHistoryMock).toHaveBeenCalled());
    expect(getRunHistoryMock).toHaveBeenCalledWith({
      runtime: "gemini",
      slug: "limit",
      limit: 25,
    });
  });

  it("emits data-runtime and data-slug attributes for downstream queries", () => {
    getRunHistoryMock.mockResolvedValue({ ok: true, runs: [] });
    render(<RunHistoryPanel runtime="gemini" slug="tagged" />);
    const panel = screen.getByTestId("run-history-panel");
    expect(panel.getAttribute("data-runtime")).toBe("gemini");
    expect(panel.getAttribute("data-slug")).toBe("tagged");
  });
});
