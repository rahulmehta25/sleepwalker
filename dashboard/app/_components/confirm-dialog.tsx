"use client";

/**
 * ConfirmDialog — shared confirm modal for destructive / semi-destructive
 * actions. UI-SPEC §Confirmation copy (lines 256-263) locks two call sites:
 *
 *   1. Disable a deployed routine   → Plan 04-09 action bar
 *   2. Cancel Save-to-repo after    → Plan 04-08 SaveToRepoModal Stage 1
 *      the diff is shown (Discard)
 *
 * Plan 04-08 owns the component; Plan 04-09 consumes without modification.
 *
 * Layout:
 *   - Backdrop: `fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40`
 *     (UI-SPEC §Save-to-repo modal lines 321-322 + §Deploy progress drawer
 *     line 296 — same token across all modal surfaces)
 *   - Dialog: `.panel-raised max-w-md w-full` centered via a flex overlay
 *   - CTAs: cancel (`.btn-ghost`, less-destructive) + confirm (`.btn-danger`)
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at
 *     the title heading
 *   - On open, focus lands on the CANCEL button (the safe, less-destructive
 *     default). Restoring focus to the trigger is the caller's responsibility
 *     — the trigger still owns its ref; we do not mutate the external DOM.
 *   - Esc closes (fires `onCancel`). Backdrop click closes (fires `onCancel`).
 *
 * Animation uses framer-motion per UI-SPEC §Animation and motion — scale
 * 0.98 → 1 + opacity fade with 180ms easeOut.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  destructiveLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  destructiveLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Focus the cancel button on open, and wire Esc → onCancel.
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm z-40"
            onClick={onCancel}
            data-testid="confirm-dialog-backdrop"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            data-testid="confirm-dialog"
          >
            <div className="panel-raised max-w-md w-full pointer-events-auto p-6">
              <h2
                id="confirm-dialog-title"
                className="text-sm font-semibold mb-2"
              >
                {title}
              </h2>
              <p className="text-xs text-moon-400 mb-6">{body}</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={onCancel}
                  className="btn btn-ghost"
                  data-testid="confirm-dialog-cancel"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="btn btn-danger"
                  data-testid="confirm-dialog-confirm"
                >
                  {destructiveLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
