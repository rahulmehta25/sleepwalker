// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CronPreview } from "@/app/editor/_components/cron-preview";

afterEach(cleanup);

describe("CronPreview", () => {
  it("renders pill-aurora with 'Runs …' on valid cron", () => {
    const { container } = render(<CronPreview expression="0 6 * * 1-5" />);
    const pill = container.querySelector(".pill-aurora");
    expect(pill).toBeTruthy();
    expect(pill?.textContent?.startsWith("Runs ")).toBe(true);
  });

  it("renders exact UI-SPEC error on empty expression", () => {
    const { container } = render(<CronPreview expression="" />);
    expect(
      screen.getByText(
        "Invalid cron — 5 fields required (minute hour day month weekday).",
      ),
    ).toBeTruthy();
    const err = container.querySelector(".text-signal-red");
    expect(err).toBeTruthy();
  });

  it("renders error on 4-field cron", () => {
    render(<CronPreview expression="0 6 * *" />);
    expect(
      screen.getByText(
        "Invalid cron — 5 fields required (minute hour day month weekday).",
      ),
    ).toBeTruthy();
  });

  it("renders Runs-prefix on midnight cron", () => {
    const { container } = render(<CronPreview expression="0 0 * * *" />);
    const pill = container.querySelector(".pill-aurora");
    expect(pill?.textContent?.startsWith("Runs ")).toBe(true);
  });
});
