// @vitest-environment jsdom
//
// Integration tests for DeployProgressDrawer (Plan 04-07 task 3). Covers
// VALIDATION.md row 4 — "Polling stops on terminal state" (DEPL-01) — plus
// the rollback banner (role=alert), success + rollback footer CTAs, and the
// Q1 warning surface for claude-desktop successful deploy.
//
// Why we mock `@/app/routines/actions`: the drawer's real Server Actions
// touch `node:child_process`, `node:fs`, and the runtime-adapter registry,
// none of which are jsdom-compatible. The mock surfaces a controlled
// getDeployState sequence that drives the component through its lifecycle
// deterministically.
//
// Pattern mirrors dashboard/tests/health-badge-row.test.tsx (fetch mock +
// dynamic component import) and dashboard/tests/editor-client.test.tsx
// (vi.mock of Server Actions module).

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
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { DeployState, DeployStep } from "@/lib/deploy-state";

// Shared mock refs. vi.mock below re-uses these handles so tests can tweak
// resolved values on a per-it() basis without re-registering the mock.
const deployRoutineMock = vi.fn();
const getDeployStateMock = vi.fn();
const runNowRoutineMock = vi.fn();

vi.mock("@/app/routines/actions", () => ({
  deployRoutine: (args: unknown) => deployRoutineMock(args),
  getDeployState: (args: unknown) => getDeployStateMock(args),
  runNowRoutine: (args: unknown) => runNowRoutineMock(args),
}));

// Lazy-load the component inside each `it()` so the vi.mock above is applied
// before the module graph resolves `@/app/routines/actions`.
let DeployProgressDrawer: typeof import("@/app/routines/_components/deploy-progress-drawer").DeployProgressDrawer;

function succeededState(overrides: Partial<DeployState> = {}): DeployState {
  return {
    fleet: "codex/x",
    runtime: "codex",
    slug: "x",
    startedAt: new Date().toISOString(),
    steps: {
      planning: { startedAt: 0, completedAt: 100, elapsedMs: 100 },
      writing: { startedAt: 100, completedAt: 340, elapsedMs: 240 },
      loading: { startedAt: 340, completedAt: 500, elapsedMs: 160 },
      verified: { startedAt: 500, completedAt: 500, elapsedMs: 0 },
    },
    phase: { kind: "succeeded" },
    verifiedAt: Date.now(),
    ...overrides,
  };
}

function rolledBackState(
  failedStep: DeployStep,
  error: string,
): DeployState {
  return {
    fleet: "codex/x",
    runtime: "codex",
    slug: "x",
    startedAt: new Date().toISOString(),
    steps: {
      planning: { startedAt: 0, completedAt: 100, elapsedMs: 100 },
      writing: { startedAt: 100 },
    },
    phase: {
      kind: "rolled-back",
      failedStep,
      error,
      rollbackActions: [{ action: "adapter.undeploy", ok: true }],
    },
  };
}

function runningState(): DeployState {
  return {
    fleet: "codex/x",
    runtime: "codex",
    slug: "x",
    startedAt: new Date().toISOString(),
    steps: { planning: { startedAt: Date.now() } },
    phase: {
      kind: "running",
      step: "planning",
      stepStartedAt: Date.now(),
    },
  };
}

describe("DeployProgressDrawer", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ DeployProgressDrawer } = await import(
      "@/app/routines/_components/deploy-progress-drawer"
    ));
    deployRoutineMock.mockReset();
    getDeployStateMock.mockReset();
    runNowRoutineMock.mockReset();
    deployRoutineMock.mockResolvedValue({ ok: true, state: succeededState() });
    runNowRoutineMock.mockResolvedValue({ ok: true, runId: "r1" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stops polling on terminal state (VALIDATION row 4)", async () => {
    vi.useFakeTimers();
    getDeployStateMock
      .mockResolvedValueOnce(runningState())
      .mockResolvedValueOnce(succeededState());

    render(
      <DeployProgressDrawer
        runtime="codex"
        slug="x"
        open
        onClose={() => {}}
      />,
    );

    // First poll at 500ms returns running; second at 1000ms returns
    // succeeded and clears the interval. A third advance verifies the
    // interval was actually cleared — the mock count stays at 2.
    await vi.advanceTimersByTimeAsync(550);
    await vi.advanceTimersByTimeAsync(550);
    expect(getDeployStateMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(550);
    expect(getDeployStateMock).toHaveBeenCalledTimes(2);
  });

  it("renders rollback banner with role=alert on rolled-back state", async () => {
    getDeployStateMock.mockResolvedValue(
      rolledBackState("writing", "plist lint failed"),
    );
    render(
      <DeployProgressDrawer
        runtime="codex"
        slug="x"
        open
        onClose={() => {}}
      />,
    );
    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain(
      "Deploy rolled back — writing failed",
    );
    expect(alert.textContent).toContain("plist lint failed");
  });

  it("renders Close + Run now footer on succeeded state", async () => {
    getDeployStateMock.mockResolvedValue(succeededState());
    render(
      <DeployProgressDrawer
        runtime="codex"
        slug="x"
        open
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Deployment verified/)).toBeTruthy(),
    );
    // Close (ghost) in footer
    expect(screen.getByTestId("deploy-drawer-close-footer").textContent).toBe(
      "Close",
    );
    // RunNowButton rendered inline in the success footer
    expect(screen.getByTestId("run-now-button")).toBeTruthy();
  });

  it("renders Dismiss + Retry deploy footer on rolled-back state", async () => {
    getDeployStateMock.mockResolvedValue(
      rolledBackState("loading", "launchctl print failed"),
    );
    render(
      <DeployProgressDrawer
        runtime="codex"
        slug="x"
        open
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("deploy-drawer-close-footer").textContent).toBe(
        "Dismiss",
      ),
    );
    expect(screen.getByTestId("deploy-drawer-retry")).toBeTruthy();
    expect(
      screen.getByTestId("deploy-drawer-retry").textContent,
    ).toContain("Retry deploy");
  });

  it("surfaces state.warning as pill-amber on succeeded claude-desktop deploy", async () => {
    const warning =
      "Copy SKILL.md into Claude Desktop's Schedule tab — Desktop 1.3109 does not watch the directory.";
    getDeployStateMock.mockResolvedValue(
      succeededState({ warning, runtime: "claude-desktop" }),
    );
    render(
      <DeployProgressDrawer
        runtime="claude-desktop"
        slug="x"
        open
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("deploy-warning-pill")).toBeTruthy(),
    );
    expect(screen.getByTestId("deploy-warning-pill").textContent).toContain(
      "Copy SKILL.md",
    );
  });
});
