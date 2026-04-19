// @vitest-environment jsdom
//
// Integration tests for the full EditorClient state machine (Plan 03-08).
// Covers VALIDATION.md rows for EDIT-01 (7-field rendering), EDIT-03 (autosave
// + beforeunload + save clears draft), EDIT-05 (all 8 autofill opt-out attrs
// including spellcheck=false on the prompt textarea).
//
// Mocks the Server Actions (saveRoutine / checkSlugAvailability) so tests
// don't touch the filesystem and run deterministically under jsdom.
//
// localStorage stub: Node 25 ships an experimental `globalThis.localStorage`
// that leaves jsdom's `window.localStorage` as a plain {} without the Storage
// prototype. The DraftRecoveryBanner suite established this pattern; we reuse
// it verbatim so the component and test both read/write through the same
// Map-backed object.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

// Map-backed Storage — same pattern as tests/draft-recovery-banner.test.tsx.
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

// Mock Server Actions — the real implementations require a Node fs and the
// RSC server runtime; tests must run in jsdom without them.
vi.mock("@/app/editor/actions", () => ({
  saveRoutine: vi.fn(async (_prev: unknown, _fd: FormData) => ({
    status: "idle",
  })),
  checkSlugAvailability: vi.fn(async (_r: Runtime, _s: string) => ({
    available: true,
  })),
}));

const allHealthy: Record<Runtime, HealthStatus> = {
  "claude-routines": { runtime: "claude-routines", available: true },
  "claude-desktop": { runtime: "claude-desktop", available: true },
  codex: { runtime: "codex", available: true },
  gemini: { runtime: "gemini", available: true },
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// -----------------------------------------------------------------------------
// EDIT-01 — 7-field rendering
// -----------------------------------------------------------------------------

describe("EditorClient — rendering (EDIT-01)", () => {
  it("renders all 7 field labels (UI-SPEC §Field labels)", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    expect(screen.getByText("NAME")).toBeTruthy();
    expect(screen.getByText("SLUG")).toBeTruthy();
    expect(screen.getByText("RUNTIME")).toBeTruthy();
    expect(screen.getByText("PROMPT")).toBeTruthy();
    expect(screen.getAllByText("SCHEDULE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("REVERSIBILITY")).toBeTruthy();
    expect(screen.getByText("BUDGET (CHARS)")).toBeTruthy();
  });

  it("renders the exact UI-SPEC 'Save routine' primary button copy", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    expect(screen.getByRole("button", { name: /Save routine/i })).toBeTruthy();
  });

  it("mounts all 4 runtime cards", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    expect(screen.getByText("Claude Routines")).toBeTruthy();
    expect(screen.getByText("Claude Desktop")).toBeTruthy();
    expect(screen.getByText("Codex Pro")).toBeTruthy();
    expect(screen.getByText("Gemini CLI Pro")).toBeTruthy();
  });

  it("renders locked UI-SPEC placeholders on name + slug + schedule", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    expect(
      container.querySelector('input[name="name"]')?.getAttribute("placeholder"),
    ).toBe("Morning brief");
    expect(
      container.querySelector('input[name="slug"]')?.getAttribute("placeholder"),
    ).toBe("morning-brief");
    expect(
      container
        .querySelector('input[name="schedule"]')
        ?.getAttribute("placeholder"),
    ).toBe("0 6 * * 1-5");
  });
});

// -----------------------------------------------------------------------------
// EDIT-05 — autofill opt-out attributes (8 attrs, not 9)
// -----------------------------------------------------------------------------

describe("EditorClient — autofill opt-out attrs (EDIT-05)", () => {
  it("prompt textarea has rows=30 and spellcheck=false", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const textarea = container.querySelector(
      'textarea[name="prompt"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    expect(textarea!.getAttribute("rows")).toBe("30");
    expect(textarea!.getAttribute("spellcheck")).toBe("false");
  });

  it("prompt textarea carries all 8 autofill opt-out attributes", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const textarea = container.querySelector(
      'textarea[name="prompt"]',
    ) as HTMLTextAreaElement;
    expect(textarea.getAttribute("autocomplete")).toBe("off");
    expect(textarea.getAttribute("autocorrect")).toBe("off");
    expect(textarea.getAttribute("autocapitalize")).toBe("off");
    expect(textarea.getAttribute("spellcheck")).toBe("false");
    expect(textarea.hasAttribute("data-1p-ignore")).toBe(true);
    expect(textarea.getAttribute("data-lpignore")).toBe("true");
    expect(textarea.getAttribute("data-form-type")).toBe("other");
    expect(textarea.hasAttribute("data-bwignore")).toBe(true);
  });

  it("every text/number input carries autocomplete=off + 1p + lp + bw attrs", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const textInputs = container.querySelectorAll(
      'input[type="text"], input[type="number"]',
    );
    expect(textInputs.length).toBeGreaterThanOrEqual(4); // name, slug, schedule, budget
    textInputs.forEach((i) => {
      expect(i.getAttribute("autocomplete")).toBe("off");
      expect(i.getAttribute("autocorrect")).toBe("off");
      expect(i.getAttribute("autocapitalize")).toBe("off");
      expect(i.hasAttribute("data-1p-ignore")).toBe(true);
      expect(i.getAttribute("data-lpignore")).toBe("true");
      expect(i.getAttribute("data-form-type")).toBe("other");
      expect(i.hasAttribute("data-bwignore")).toBe(true);
    });
  });
});

// -----------------------------------------------------------------------------
// EDIT-03 — autosave + beforeunload + save clears draft
// -----------------------------------------------------------------------------

describe("EditorClient — autosave (EDIT-03)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes sleepwalker.draft.v1 after 500ms debounce", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const nameInput = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;

    act(() => {
      fireEvent.change(nameInput, { target: { value: "My routine" } });
    });

    // Not yet — debounce not elapsed.
    expect(window.localStorage.getItem("sleepwalker.draft.v1")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    const stored = window.localStorage.getItem("sleepwalker.draft.v1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.fields.name).toBe("My routine");
  });

  it("registers a beforeunload handler on mount", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const addSpy = vi.spyOn(window, "addEventListener");
    render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    expect(addSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
    addSpy.mockRestore();
  });
});

describe("EditorClient — save success clears draft (EDIT-03)", () => {
  it("removes sleepwalker.draft.v1 after a successful save", async () => {
    // Seed a draft before the component mounts.
    const seeded = {
      version: 1,
      updatedAt: new Date().toISOString(),
      fields: {
        name: "x",
        slug: "x",
        runtime: "codex",
        prompt: "p",
        schedule: "0 6 * * *",
        reversibility: "yellow",
        budget: 40000,
      },
    };
    window.localStorage.setItem(
      "sleepwalker.draft.v1",
      JSON.stringify(seeded),
    );

    // React 19 useActionState: rather than simulate FormData submission
    // through the whole action pipeline, we mutate the mocked module so the
    // next call returns ok. Then fire the form's submit which dispatches
    // through the mocked action and triggers the effect that clears the draft.
    const actionsModule = await import("@/app/editor/actions");
    (actionsModule.saveRoutine as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => ({
        status: "ok" as const,
        bundlePath: "routines-codex/x",
        runtime: "codex" as Runtime,
        slug: "x",
      }));

    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );

    const form = container.querySelector("form")!;

    await act(async () => {
      fireEvent.submit(form);
    });
    // Allow useActionState microtasks + effect to flush.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(window.localStorage.getItem("sleepwalker.draft.v1")).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Slug auto-derive + override (EDIT-04 friction reduction — covered by UI-SPEC
// interaction contract §Slug auto-derive)
// -----------------------------------------------------------------------------

describe("EditorClient — slug auto-derive", () => {
  it("derives slug from name while untouched", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const nameInput = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    const slugInput = container.querySelector(
      'input[name="slug"]',
    ) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "Morning Brief" } });
    expect(slugInput.value).toBe("morning-brief");
  });

  it("stops deriving slug once user manually edits the slug", async () => {
    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );
    const nameInput = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    const slugInput = container.querySelector(
      'input[name="slug"]',
    ) as HTMLInputElement;

    fireEvent.change(slugInput, { target: { value: "custom-slug" } });
    fireEvent.change(nameInput, { target: { value: "Something Else" } });
    expect(slugInput.value).toBe("custom-slug");
  });
});

// -----------------------------------------------------------------------------
// Claude-desktop Q1 smoke — manual-add warning must surface on save success
// -----------------------------------------------------------------------------

describe("EditorClient — claude-desktop manual-add warning (Q1 smoke)", () => {
  it("surfaces the warning string from saveRoutine when runtime=claude-desktop", async () => {
    const actionsModule = await import("@/app/editor/actions");
    const warning =
      "Claude Desktop does not auto-detect routines. Open Desktop → Schedule → Add and paste the generated SKILL.md content.";
    (actionsModule.saveRoutine as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => ({
        status: "ok" as const,
        bundlePath: "routines-claude-desktop/morning-brief",
        runtime: "claude-desktop" as Runtime,
        slug: "morning-brief",
        warning,
      }));

    const { EditorClient } = await import("@/app/editor/editor-client");
    const { container } = render(
      <EditorClient healthStatuses={allHealthy} existingSlugs={[]} />,
    );

    const form = container.querySelector("form")!;

    await act(async () => {
      fireEvent.submit(form);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(warning)).toBeTruthy();
  });
});
