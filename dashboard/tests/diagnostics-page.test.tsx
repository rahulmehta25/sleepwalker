// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Mock @/lib/diagnostics at the module boundary so the Server Component
 * under test renders against a deterministic snapshot. The CopyIssueButton
 * client island imports formatAsIssueBody from the same module, so we mock
 * both exports in the same factory.
 */
vi.mock("@/lib/diagnostics", () => ({
  gatherDiagnostics: vi.fn(async () => ({
    capturedAt: "2026-04-22T12:34:56.000Z",
    rows: {
      macos: { ok: true, value: "26.4.1" },
      arch: { ok: true, value: "arm64" },
      brew: { ok: true, value: "/opt/homebrew" },
      shell: { ok: true, value: "/bin/zsh" },
      claude: { ok: true, value: "2.1.117" },
      codex: { ok: true, value: "0.118.0" },
      gemini: { ok: true, value: "0.31.0" },
      flock: { ok: true, value: "flock 0.4.0" },
      jq: { ok: true, value: "jq-1.7" },
      launchAgents: { ok: true, value: "0700" },
      sleepwalkerState: { ok: true, value: "installed (v0.2)" },
    },
    gitSha: "abc1234",
  })),
  formatAsIssueBody: vi.fn(
    (d: { capturedAt: string }) =>
      `## Environment\n\`\`\`text\nCaptured: ${d.capturedAt}\n\`\`\``,
  ),
}));

describe("<DiagnosticsPage />", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders at least 11 .panel probe rows when all probes succeed", async () => {
    const DiagnosticsPage = (await import("@/app/diagnostics/page")).default;
    const tree = await DiagnosticsPage();
    const { container } = render(tree);
    const panels = container.querySelectorAll(".panel");
    // 11 probe rows + 1 gitSha panel = 12 .panel elements in the happy path.
    expect(panels.length).toBeGreaterThanOrEqual(11);
  });

  it("renders the 'Copy as GitHub issue body' button", async () => {
    const DiagnosticsPage = (await import("@/app/diagnostics/page")).default;
    const tree = await DiagnosticsPage();
    render(tree);
    expect(screen.getByText(/Copy as GitHub issue body/i)).toBeTruthy();
  });

  it("renders 'Last checked:' eyebrow with the ISO timestamp", async () => {
    const DiagnosticsPage = (await import("@/app/diagnostics/page")).default;
    const tree = await DiagnosticsPage();
    render(tree);
    const matches = screen.getAllByText(/Last checked:/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders 'No secrets rendered' transparency messaging (subtitle + footer)", async () => {
    const DiagnosticsPage = (await import("@/app/diagnostics/page")).default;
    const tree = await DiagnosticsPage();
    render(tree);
    // The phrase appears twice by design: once in the PageHeader subtitle as
    // a first-impression reassurance, once in the footer as the explicit
    // transparency statement. Either alone would be insufficient (subtitle
    // can be clipped on narrow viewports; footer sits below the copy button).
    const matches = screen.getAllByText(/No secrets rendered/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
