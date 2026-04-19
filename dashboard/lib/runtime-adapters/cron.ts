// dashboard/lib/runtime-adapters/cron.ts
//
// Narrow cron-5 → LaunchdSchedule converter, shared by codex.ts + gemini.ts.
//
// Launchd's StartCalendarInterval does not natively support the */N step
// syntax; single-dict entries represent fixed times only. This helper promotes
// common step patterns to StartInterval equivalents so routines scheduled as
// "*\/5 * * * *" (every 5 minutes) don't silently regress to "every day at
// unspecified time" or — worse — emit NaN into the plist.
//
// Phase 3 editor layer is expected to validate user-facing cron input via
// cronstrue before it reaches this helper; this function is defense-in-depth.

import type { LaunchdSchedule } from "./launchd-writer";

const DAY_SECONDS = 86400;

/**
 * Convert a 5-field cron expression to a LaunchdSchedule.
 *
 * Supported inputs:
 *   - null / "" / malformed (wrong part count) → daily interval fallback
 *   - "* * * * *"                              → 60-second interval
 *   - "*\/N * * * *"  (1 ≤ N ≤ 59)             → N-minute interval
 *   - "0 *\/N * * *"  (1 ≤ N ≤ 23)             → N-hour interval
 *   - "M H D Mo W"  (any field * or \d+)       → calendar dict
 *
 * Unsupported cron features (ranges "1-5", lists "1,3,5", named aliases,
 * L/W extensions, "@yearly"/"@reboot"/etc.) drop the unparseable field to
 * undefined rather than NaN — the plist writer then omits the key entirely,
 * which launchd treats as "every" for that field.
 */
export function parseCron(cron: string | null): LaunchdSchedule {
  if (!cron) return { kind: "interval", seconds: DAY_SECONDS };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { kind: "interval", seconds: DAY_SECONDS };
  const [min, hr, day, mo, wkd] = parts;

  // All wildcards → fire every minute (expressed as interval, not calendar).
  if (min === "*" && hr === "*" && day === "*" && mo === "*" && wkd === "*") {
    return { kind: "interval", seconds: 60 };
  }

  // "*/N * * * *" → N-minute interval. Only the fast-path exists because
  // launchd's calendar dict has no step expression.
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hr === "*" && day === "*" && mo === "*" && wkd === "*") {
    const n = parseInt(minStep[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 59) {
      return { kind: "interval", seconds: n * 60 };
    }
  }

  // "0 */N * * *" → N-hour interval (e.g. */2 * * * fires every 2 hours on the :00).
  const hrStep = hr.match(/^\*\/(\d+)$/);
  if (min === "0" && hrStep && day === "*" && mo === "*" && wkd === "*") {
    const n = parseInt(hrStep[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 23) {
      return { kind: "interval", seconds: n * 3600 };
    }
  }

  // Calendar path: each field must be "*" (→ undefined) or a bare non-negative
  // integer. Anything else — unsupported step "*/N" outside the fast-paths,
  // ranges "1-5", lists "1,3,5", named aliases — drops to undefined. Never NaN.
  const num = (s: string): number | undefined => {
    if (s === "*") return undefined;
    if (!/^\d+$/.test(s)) return undefined;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    kind: "calendar",
    minute: num(min),
    hour: num(hr),
    day: num(day),
    month: num(mo),
    weekday: num(wkd),
  };
}
