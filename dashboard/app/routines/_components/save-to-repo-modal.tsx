"use client";

/**
 * SaveToRepoModal — two-stage Review -> Confirm modal that drives the REPO-01
 * save-to-repo flow. Composes Plan 04-05's three Server Actions
 * (`previewSaveToRepoAction`, `commitSaveToRepoAction`, `releaseSaveLockAction`)
 * with DiffStatPanel (Task 1 of this plan) and ConfirmDialog (Task 1) to
 * deliver the diff-preview-before-confirm contract.
 *
 * Flock lifecycle (the invariant this component owns):
 *   - Stage 1 open → `previewSaveToRepoAction` acquires the flock, returns
 *     `{ok:true, ..., lockToken}`. The token is held in local state.
 *   - Stage 1 Cancel/Discard OR Stage 2 Back OR unmount →
 *     `releaseSaveLockAction({lockToken})` releases the flock.
 *   - Stage 2 Commit success → `commitSaveToRepoAction` returns ok; the lib
 *     already released the flock internally; we clear local state and close.
 *
 * UI-SPEC anchors (verbatim-locked copy):
 *   - Modal title:            line 201 — `Save to repo`
 *   - Stage 1 heading:        line 202 — `Review changes`
 *   - Stage 1 body:           line 203 — `These files will be staged and
 *                                         committed. Nothing else in your
 *                                         working tree is touched, and
 *                                         nothing is pushed.`
 *   - Stage 1 CTAs:           line 207 — `Continue` + `Cancel`
 *   - Stage 2 heading:        line 208 — `Commit message`
 *   - Stage 2 input label:    line 209 — `MESSAGE`
 *   - Stage 2 input helper:   line 211 — `Conventional commit format
 *                                         preferred (feat: / fix: / docs:).
 *                                         No emoji. No AI attribution.`
 *   - Stage 2 CTAs:           line 212 — `Commit` (GitCommit) + `Back`
 *   - Stage 2 never-push:     line 216 — `This writes a local commit. Push
 *                                         manually with \`git push\` when
 *                                         you're ready.`
 *   - Lock-busy copy:         line 214 — `Another save-to-repo is in
 *                                         progress. Wait a moment and try
 *                                         again.`
 *   - Post-commit toast:      line 213 — `Committed {shortSha} —
 *                                         {message.split('\n')[0]}`
 *
 * Keyboard (UI-SPEC §Keyboard shortcuts):
 *   - Esc in Stage 1 → Cancel flow (with Discard confirm if diff was shown)
 *   - Esc in Stage 2 → back to Stage 1
 *   - Cmd/Ctrl+Enter in Stage 2 textarea → submit commit
 *
 * EDIT-05 autofill opt-out: the commit-message textarea spreads
 * `INPUT_OPT_OUT` (identical to editor-client.tsx lines 88-97). Password
 * managers and autofill tooling must not interfere with the user's commit
 * text.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GitCommit, Loader2, X } from "lucide-react";
import {
  commitSaveToRepoAction,
  previewSaveToRepoAction,
  releaseSaveLockAction,
  type PreviewActionResult,
} from "@/app/routines/actions";
import type { Runtime } from "@/lib/runtime-adapters/types";
import { DiffStatPanel } from "./diff-stat-panel";
import { ConfirmDialog } from "@/app/_components/confirm-dialog";

export type SaveToastKind = "green" | "red" | "aurora";

export interface SaveToast {
  kind: SaveToastKind;
  message: string;
  ttl: number;
}

interface SaveToRepoModalProps {
  runtime: Runtime;
  slug: string;
  open: boolean;
  onClose: () => void;
  onToast?: (toast: SaveToast) => void;
}

// EDIT-05 (04-UI-SPEC line 255). Identical bag used in editor-client.tsx —
// centralized here for the commit-message textarea per 04-PATTERNS.md lines
// 1232-1246. Prevents 1Password, LastPass, Bitwarden, and the browser's own
// autofill from interfering.
const INPUT_OPT_OUT = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-bwignore": "",
} as const;

type Stage = "review" | "confirm";

export function SaveToRepoModal({
  runtime,
  slug,
  open,
  onClose,
  onToast,
}: SaveToRepoModalProps) {
  const [stage, setStage] = useState<Stage>("review");
  const [preview, setPreview] = useState<PreviewActionResult | null>(null);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [committed, setCommitted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const invokedRef = useRef(false);

  // Kick off the preview fetch when `open` transitions to true. invokedRef
  // guards against React 19 Strict Mode double-effect calls in dev (which
  // would acquire the flock twice and return lock-busy on the second call).
  useEffect(() => {
    if (!open) {
      invokedRef.current = false;
      setStage("review");
      setPreview(null);
      setMessage("");
      setCommitting(false);
      setConfirmDiscardOpen(false);
      setCommitted(false);
      return;
    }
    if (invokedRef.current) return;
    invokedRef.current = true;
    void (async () => {
      const res = await previewSaveToRepoAction({ runtime, slug });
      setPreview(res);
      if (res.ok) setMessage(res.suggestedMessage);
    })();
  }, [open, runtime, slug]);

  // Release the flock on unmount if we still hold the lockToken and the
  // commit has not yet succeeded. This handles both (a) external close (parent
  // flips `open` to false mid-flow) and (b) component unmount (route change,
  // parent re-render, HMR). The `committed` flag suppresses the release call
  // on the happy commit path where the lib already released the flock.
  useEffect(() => {
    return () => {
      if (preview?.ok && !committed) {
        void releaseSaveLockAction({ lockToken: preview.lockToken });
      }
    };
  }, [preview, committed]);

  // Focus management:
  //   - Stage 1 + preview.ok → focus Continue button once it becomes enabled.
  //   - Stage 1 loading / lock-busy / no-changes → focus the close (×) button.
  //   - Stage 2 → focus the textarea with the cursor at end of message.
  useEffect(() => {
    if (!open) return;
    if (stage === "review") {
      if (preview?.ok) {
        continueRef.current?.focus();
      } else {
        closeBtnRef.current?.focus();
      }
    } else if (stage === "confirm") {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }, [open, stage, preview]);

  const handleCancelStage1 = useCallback(() => {
    // If a diff was already shown (preview.ok), confirm via ConfirmDialog per
    // UI-SPEC line 260. Otherwise (still loading, lock-busy, no-changes,
    // git-error) close without confirm — there's nothing to discard.
    if (preview?.ok) {
      setConfirmDiscardOpen(true);
    } else {
      onClose();
    }
  }, [preview, onClose]);

  const handleDiscardConfirm = useCallback(async () => {
    setConfirmDiscardOpen(false);
    if (preview?.ok) {
      await releaseSaveLockAction({ lockToken: preview.lockToken });
    }
    setCommitted(true); // suppress duplicate unmount release (we just released)
    onClose();
  }, [preview, onClose]);

  const handleBack = useCallback(() => {
    setStage("review");
  }, []);

  const handleCommit = useCallback(async () => {
    if (!preview?.ok) return;
    if (!message.trim()) return;
    if (committing) return;
    setCommitting(true);
    try {
      const res = await commitSaveToRepoAction({
        lockToken: preview.lockToken,
        message,
      });
      if (res.ok) {
        setCommitted(true);
        const firstLine = message.split("\n")[0];
        onToast?.({
          kind: "green",
          message: `Committed ${res.shortSha} — ${firstLine}`,
          ttl: 6000,
        });
        onClose();
      } else {
        onToast?.({
          kind: "red",
          message: res.error,
          ttl: 8000,
        });
      }
    } catch (e) {
      onToast?.({
        kind: "red",
        message: e instanceof Error ? e.message : String(e),
        ttl: 8000,
      });
    } finally {
      setCommitting(false);
    }
  }, [preview, message, committing, onClose, onToast]);

  // Esc handling: Stage 2 → back to Stage 1. Stage 1 → cancel flow. The
  // ConfirmDialog ships its own Esc handler while it is open; skip here so
  // Esc does not fire in both listeners at once.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDiscardOpen) return;
      if (stage === "confirm") {
        setStage("review");
      } else {
        handleCancelStage1();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stage, confirmDiscardOpen, handleCancelStage1]);

  function handleTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleCommit();
    }
  }

  const stage1ContinueDisabled =
    !preview || !preview.ok || (preview.ok && preview.totals.filesChanged === 0);

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40"
              onClick={handleCancelStage1}
              data-testid="save-to-repo-modal-backdrop"
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="save-to-repo-modal-title"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              data-testid="save-to-repo-modal"
            >
              <div className="panel-raised max-w-2xl w-full pointer-events-auto p-0">
                <header className="flex items-start justify-between p-6 border-b border-ink-600">
                  <div className="min-w-0">
                    <h2
                      id="save-to-repo-modal-title"
                      className="text-sm font-semibold"
                    >
                      Save to repo
                    </h2>
                    <div className="font-mono text-xs text-moon-400 mt-1 truncate">
                      {runtime}/{slug}
                    </div>
                  </div>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={handleCancelStage1}
                    aria-label="Close Save to repo"
                    className="text-moon-400 hover:text-moon-200 flex-shrink-0"
                    data-testid="save-to-repo-modal-close"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </header>

                {stage === "review" ? (
                  <ReviewStage
                    preview={preview}
                    onCancel={handleCancelStage1}
                    onContinue={() => setStage("confirm")}
                    continueDisabled={stage1ContinueDisabled}
                    continueRef={continueRef}
                  />
                ) : (
                  <ConfirmStage
                    runtime={runtime}
                    slug={slug}
                    preview={preview}
                    message={message}
                    onMessageChange={setMessage}
                    onBack={handleBack}
                    onCommit={handleCommit}
                    committing={committing}
                    textareaRef={textareaRef}
                    onTextareaKeyDown={handleTextareaKeyDown}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard this save?"
        body="The diff preview closes. No changes are staged or committed."
        destructiveLabel="Discard"
        cancelLabel="Keep reviewing"
        onConfirm={handleDiscardConfirm}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage 1 — Review
// ---------------------------------------------------------------------------

interface ReviewStageProps {
  preview: PreviewActionResult | null;
  onCancel: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
  continueRef: React.RefObject<HTMLButtonElement | null>;
}

function ReviewStage({
  preview,
  onCancel,
  onContinue,
  continueDisabled,
  continueRef,
}: ReviewStageProps) {
  return (
    <>
      <div className="p-6 pb-2">
        <h3 className="text-sm font-semibold">Review changes</h3>
        <p className="text-xs text-moon-400 mt-1">
          These files will be staged and committed. Nothing else in your
          working tree is touched, and nothing is pushed.
        </p>
      </div>

      <div className="p-6">
        {preview === null ? (
          <div
            className="panel p-4 flex items-center justify-center gap-2 text-xs text-moon-400"
            data-testid="save-to-repo-modal-loading"
          >
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Reading diff…
          </div>
        ) : preview.ok ? (
          <DiffStatPanel files={preview.files} totals={preview.totals} />
        ) : preview.kind === "lock-busy" ? (
          <div
            className="panel border-signal-amber/50 bg-signal-amber/5 p-4 text-sm text-signal-amber"
            data-testid="save-to-repo-modal-lock-busy"
            role="alert"
          >
            Another save-to-repo is in progress. Wait a moment and try again.
          </div>
        ) : preview.kind === "no-changes" ? (
          <DiffStatPanel
            files={[]}
            totals={{ filesChanged: 0, added: 0, removed: 0 }}
          />
        ) : (
          <div
            className="panel border-signal-red/50 bg-signal-red/5 p-4 text-sm text-signal-red"
            data-testid="save-to-repo-modal-git-error"
            role="alert"
          >
            {preview.error}
          </div>
        )}
      </div>

      <footer className="p-6 border-t border-ink-600 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost"
          data-testid="save-to-repo-modal-cancel"
        >
          Cancel
        </button>
        <button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="save-to-repo-modal-continue"
        >
          Continue
        </button>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — Confirm
// ---------------------------------------------------------------------------

interface ConfirmStageProps {
  runtime: Runtime;
  slug: string;
  preview: PreviewActionResult | null;
  message: string;
  onMessageChange: (next: string) => void;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextareaKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

function ConfirmStage({
  runtime,
  slug,
  preview,
  message,
  onMessageChange,
  onBack,
  onCommit,
  committing,
  textareaRef,
  onTextareaKeyDown,
}: ConfirmStageProps) {
  // Stage 2 collapses the diff to a single-line summary per UI-SPEC line 342.
  const summary =
    preview?.ok
      ? `${preview.totals.filesChanged} file${preview.totals.filesChanged === 1 ? "" : "s"} · +${preview.totals.added} −${preview.totals.removed}`
      : "";

  const placeholder = `feat(routines): add ${runtime}/${slug}`;

  return (
    <>
      <div className="p-6 pb-2">
        <h3 className="text-sm font-semibold">Commit message</h3>
        {summary && (
          <div
            className="font-mono text-xs text-moon-400 mt-1"
            data-testid="save-to-repo-modal-diff-summary"
          >
            {summary}
          </div>
        )}
      </div>

      <div className="p-6">
        <label
          htmlFor="save-to-repo-message"
          className="label text-[11px] uppercase tracking-wider text-moon-400 mb-2 block"
        >
          MESSAGE
        </label>
        <textarea
          id="save-to-repo-message"
          ref={textareaRef}
          rows={3}
          value={message}
          placeholder={placeholder}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={onTextareaKeyDown}
          className="w-full bg-ink-900 border border-ink-600 rounded-md px-4 py-3 text-sm font-mono resize-y"
          data-testid="save-to-repo-modal-textarea"
          {...INPUT_OPT_OUT}
        />
        <p className="text-xs text-moon-400 mt-2">
          Conventional commit format preferred (feat: / fix: / docs:). No
          emoji. No AI attribution.
        </p>
        <p className="text-xs text-moon-400 mt-4">
          This writes a local commit. Push manually with{" "}
          <code className="font-mono">git push</code> when you&rsquo;re ready.
        </p>
      </div>

      <footer className="p-6 border-t border-ink-600 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost"
          data-testid="save-to-repo-modal-back"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={committing || !message.trim()}
          className="btn btn-primary inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="save-to-repo-modal-commit"
        >
          {committing ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <GitCommit className="w-4 h-4" aria-hidden="true" />
          )}
          Commit
        </button>
      </footer>
    </>
  );
}
