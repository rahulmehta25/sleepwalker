import { listRoutines } from "@/lib/routines";
import { RoutinesClient } from "./routines-client";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function RoutinesPage() {
  const routines = listRoutines();
  const installed = routines.filter((r) => r.installed).length;

  return (
    <>
      <PageHeader
        eyebrow="Tier B / Desktop"
        title="Local Routines"
        subtitle={
          <>
            {routines.length} fleet member{routines.length === 1 ? "" : "s"} — {installed} installed in <code className="data text-moon-200">~/.claude/scheduled-tasks/</code>. Toggle a routine to enable it for scheduled runs.
          </>
        }
      />
      <RoutinesClient initial={routines} />
    </>
  );
}
