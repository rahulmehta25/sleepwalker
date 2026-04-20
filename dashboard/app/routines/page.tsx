import { listRoutinesAsync } from "@/lib/routines";
import { RoutinesClient } from "./routines-client";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const routines = await listRoutinesAsync();
  const installed = routines.filter((r) => r.installed).length;

  return (
    <>
      <PageHeader
        eyebrow="Fleet / Multi-runtime"
        title="Routines"
        subtitle={
          <>
            {routines.length} fleet member{routines.length === 1 ? "" : "s"} — {installed} installed. Deploy, run, and save each routine from its card.
          </>
        }
      />
      <RoutinesClient initial={routines} />
    </>
  );
}
