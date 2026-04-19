/**
 * Frozen interface contract for Sleepwalker v0.2 runtime adapters.
 * Modifying shapes here forces every Phase 2 adapter and Phase 3/5 consumer
 * to re-compile. Any amendment must be negotiated openly, not silently.
 */

/**
 * Discriminant for the adapter registry. Exact four values — any fifth runtime
 * (Amp, Devin) is explicitly deferred to v0.3 per REQUIREMENTS.md out-of-scope.
 * These string values are duplicated in bin/sleepwalker-run-cli (Phase 2+); changes
 * must update both.
 */
export type Runtime = "claude-routines" | "claude-desktop" | "codex" | "gemini";

/**
 * Reversibility color driving hook/supervisor gating and queue colorization.
 * Declared here rather than imported from queue.ts because the dep graph points
 * queue.ts -> runtime-adapters in Phase 5, not the reverse.
 */
export type Reversibility = "green" | "yellow" | "red";

/**
 * Canonical representation of a routine on disk. One bundle per deployed
 * agent. The `runtime` field is the discriminant used by `getAdapter()`.
 */
export interface RoutineBundle {
  /** Slug (directory name under routines-<runtime>/); matches ^[a-z][a-z0-9-]{0,63}$ */
  slug: string;
  /** Runtime this bundle targets — the discriminant */
  runtime: Runtime;
  /** Human-readable name from config/frontmatter */
  name: string;
  /** Prompt body (from SKILL.md for claude-desktop; prompt.md for others) */
  prompt: string;
  /** Cron-5 expression (or null for event-triggered cloud routines) */
  schedule: string | null;
  /** Reversibility classification for hook/supervisor gating */
  reversibility: Reversibility;
  /** Approximate char/token budget for budget-cap enforcement */
  budget: number;
  /** Absolute path to the bundle directory on disk */
  bundlePath: string;
}

/** Outcome of deploy() or undeploy(). Never throws for adapter-level failures. */
export interface DeployResult {
  ok: boolean;
  /** Path of the artifact written (plist, symlink, deeplink file) — for debugging */
  artifact?: string;
  /** If the adapter needs a browser handoff (claude-routines), URL to open */
  handoffUrl?: string;
  /** User-facing error message if ok === false */
  error?: string;
  /**
   * Advisory non-blocking warning (e.g. "bundlePath is TCC-protected" or an
   * auth-conflict). Dashboard renders as yellow badge. Deploy still succeeded;
   * warning is user-facing guidance only. Added in Plan 02-11 so codex.ts +
   * gemini.ts can flag macOS TCC-protected bundlePath at deploy time instead
   * of letting the user discover the failure 30 minutes later via launchd.
   */
  warning?: string;
  /**
   * Bytes written to the deployed artifact, populated by the claude-desktop
   * adapter ONLY. Exposed so Phase 3 editor UI can offer clipboard copy
   * (pbcopy) without re-reading disk — the Claude Desktop 1.3109.0 Schedule
   * tab does NOT watch ~/.claude/scheduled-tasks/ (research Q1 outcome (c)),
   * so the user must manually paste SKILL.md content into Desktop's UI.
   * undefined for all other runtimes.
   */
  skillMdContent?: string;
}

/** Outcome of runNow(). */
export interface RunNowResult {
  ok: boolean;
  /** Session id (Claude Routines) or local pid (codex/gemini) */
  runId?: string;
  /** Optional URL to watch the run */
  watchUrl?: string;
  error?: string;
}

/** Individual run record returned by listRuns(). */
export interface RunRecord {
  ts: string;
  runId: string;
  status: "running" | "succeeded" | "failed" | "deferred";
  /** First ~500 chars of stdout for queue display */
  preview?: string;
}

/** Output of healthCheck() — drives the landing-page health badges. */
export interface HealthStatus {
  runtime: Runtime;
  /** CLI present on PATH (local) or credentials configured (cloud) */
  available: boolean;
  /** e.g. "codex 0.121.0" */
  version?: string;
  /** User-facing reason if unavailable, e.g. "codex not in PATH" */
  reason?: string;
  /**
   * Non-blocking warning when available=true. Used for auth conflicts
   * (subscription + env-key both configured), missing optional configs
   * (Gemini quota project), etc. Drives the yellow badge in the dashboard
   * landing page (green = available + no warning; yellow = available +
   * warning; grey = unavailable). Added in Phase 2 Plan 09 per CONTEXT.md
   * D-04 + D-08 Claude's Discretion (additive amendment to Phase 1 surface).
   */
  warning?: string;
}

/**
 * Every runtime adapter implements this interface. All methods MUST be async.
 * Methods MUST return result objects on adapter-level failures and MUST NOT
 * throw except for programmer bugs (null deref, bad input from a caller
 * bypassing the builders). The UI renders `{ok: false, error}` gracefully.
 */
export interface RuntimeAdapter {
  readonly runtime: Runtime;

  /** Wire the bundle into its runtime. Idempotent. */
  deploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Remove the bundle from its runtime. Idempotent (missing = success). */
  undeploy(bundle: RoutineBundle): Promise<DeployResult>;

  /** Fire the routine now. Optional freeform context (alert body, etc.). */
  runNow(bundle: RoutineBundle, context?: string): Promise<RunNowResult>;

  /** Recent runs for this bundle. May be empty. */
  listRuns(bundle: RoutineBundle, limit?: number): Promise<RunRecord[]>;

  /** Probe runtime availability (PATH check, credential probe, etc.). */
  healthCheck(): Promise<HealthStatus>;
}
