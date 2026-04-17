import { listRoutines } from "@/lib/routines";
import { RoutinesClient } from "./routines-client";

export const dynamic = "force-dynamic";

export default function RoutinesPage() {
  const routines = listRoutines();
  const installed = routines.filter((r) => r.installed).length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Local Routines</h1>
        <p className="text-sw-muted text-sm">
          {routines.length} fleet member{routines.length === 1 ? "" : "s"} ({installed} installed in <code className="font-mono">~/.claude/scheduled-tasks/</code>).
          Toggle to enable scheduled runs.
        </p>
      </header>

      <RoutinesClient initial={routines} />
    </div>
  );
}
