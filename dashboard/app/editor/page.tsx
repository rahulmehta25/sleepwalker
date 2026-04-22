import { healthCheckAll } from "@/lib/runtime-adapters";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";
import { PageHeader } from "../_components/page-header";
import { EditorClient } from "./editor-client";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const healthArray = await healthCheckAll();
  const healthStatuses = healthArray.reduce<Record<Runtime, HealthStatus>>(
    (acc, status) => {
      acc[status.runtime] = status;
      return acc;
    },
    {} as Record<Runtime, HealthStatus>,
  );
  return (
    <>
      <PageHeader
        eyebrow="AUTHORING"
        title="Author a routine"
        subtitle="Write a prompt, pick a runtime, pick a schedule. Save writes a validated bundle to disk."
      />
      <EditorClient healthStatuses={healthStatuses} />
    </>
  );
}
