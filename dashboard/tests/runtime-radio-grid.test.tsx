// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuntimeRadioGrid } from "@/app/editor/_components/runtime-radio-grid";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

afterEach(cleanup);

const allAvailable: Record<Runtime, HealthStatus> = {
  "claude-routines": { runtime: "claude-routines", available: true },
  "claude-desktop": { runtime: "claude-desktop", available: true },
  codex: { runtime: "codex", available: true },
  gemini: { runtime: "gemini", available: true },
};

describe("RuntimeRadioGrid", () => {
  it("renders 4 cards with exact UI-SPEC titles", () => {
    render(
      <RuntimeRadioGrid
        value=""
        onChange={() => {}}
        healthStatuses={allAvailable}
      />,
    );
    expect(screen.getByText("Claude Routines")).toBeTruthy();
    expect(screen.getByText("Claude Desktop")).toBeTruthy();
    expect(screen.getByText("Codex Pro")).toBeTruthy();
    expect(screen.getByText("Gemini CLI Pro")).toBeTruthy();
  });

  it("marks unavailable runtime with opacity-40 and disabled input", () => {
    const statuses: Record<Runtime, HealthStatus> = {
      ...allAvailable,
      codex: {
        runtime: "codex",
        available: false,
        reason: "codex not on PATH — npm i -g @openai/codex",
      },
    };
    const { container } = render(
      <RuntimeRadioGrid
        value=""
        onChange={() => {}}
        healthStatuses={statuses}
      />,
    );
    const codexLabel = screen.getByText("Codex Pro").closest("label");
    expect(codexLabel?.className).toContain("opacity-40");
    const codexInput = container.querySelector(
      'input[name="runtime"][value="codex"]',
    ) as HTMLInputElement;
    expect(codexInput?.disabled).toBe(true);
    expect(screen.getByText(/codex not on PATH/)).toBeTruthy();
  });

  it("adds ring-1 ring-dawn-400 to selected card", () => {
    render(
      <RuntimeRadioGrid
        value="codex"
        onChange={() => {}}
        healthStatuses={allAvailable}
      />,
    );
    const codexLabel = screen.getByText("Codex Pro").closest("label");
    expect(codexLabel?.className).toMatch(/ring-1/);
    expect(codexLabel?.className).toMatch(/ring-dawn-400/);
  });

  it("renders pill-amber for HealthStatus.warning", () => {
    const statuses: Record<Runtime, HealthStatus> = {
      ...allAvailable,
      gemini: {
        runtime: "gemini",
        available: true,
        warning: "Auth conflict: both subscription + env",
      },
    };
    render(
      <RuntimeRadioGrid
        value=""
        onChange={() => {}}
        healthStatuses={statuses}
      />,
    );
    expect(screen.getByText(/Auth conflict/)).toBeTruthy();
  });

  it("calls onChange with runtime when available card clicked", () => {
    const onChange = vi.fn();
    const { container } = render(
      <RuntimeRadioGrid
        value=""
        onChange={onChange}
        healthStatuses={allAvailable}
      />,
    );
    const codexInput = container.querySelector(
      'input[name="runtime"][value="codex"]',
    ) as HTMLInputElement;
    fireEvent.click(codexInput);
    expect(onChange).toHaveBeenCalledWith("codex");
  });

  it("does not call onChange when disabled card clicked (user-event honors disabled)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const statuses: Record<Runtime, HealthStatus> = {
      ...allAvailable,
      codex: { runtime: "codex", available: false, reason: "n/a" },
    };
    const { container } = render(
      <RuntimeRadioGrid
        value=""
        onChange={onChange}
        healthStatuses={statuses}
      />,
    );
    const codexInput = container.querySelector(
      'input[name="runtime"][value="codex"]',
    ) as HTMLInputElement;
    // user-event models real browser behavior — disabled inputs do not fire
    // click/change events. fireEvent.click would bypass this in jsdom.
    await user.click(codexInput);
    expect(onChange).not.toHaveBeenCalled();
  });
});
