import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { QueueEntry } from "./queue";

function inboxDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "approved");
}

/**
 * When a deferred action is approved in the Morning Queue, write a task file
 * for `bin/sleepwalker-execute` to pick up. The file contains the original
 * action so the executor can re-run it via a fresh `claude -p` invocation.
 *
 * Returns the task file path on success, null if the entry isn't a deferable
 * local action (cloud entries don't go through this path — they're PRs).
 */
export function enqueueForExecution(entry: QueueEntry): string | null {
  // Only local entries with a tool + args (i.e. originally deferred by the
  // PreToolUse hook) need re-execution. Notification/draft entries don't.
  if (entry.source === "cloud") return null;
  if (!entry.tool || !entry.args) return null;

  const dir = inboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.id}.task`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      id: entry.id,
      ts: entry.ts,
      fleet: entry.fleet,
      tool: entry.tool,
      args: entry.args,
      reversibility: entry.reversibility,
      session: entry.session,
      approvedAt: new Date().toISOString(),
    }, null, 2)
  );
  return file;
}

/**
 * How many tasks are currently waiting for the executor to pick them up.
 */
export function pendingExecutionCount(): number {
  const dir = inboxDir();
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(".task")).length;
}
