import { readSettings, readGithubToken } from "@/lib/settings";
import { listRoutines } from "@/lib/routines";
import { SettingsClient } from "./settings-client";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = readSettings();
  const tokenSet = Boolean(readGithubToken());
  const routines = listRoutines();

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Sleep window, per-fleet defer policies, token budgets, GitHub credentials, tracked repositories. All stored under ~/.sleepwalker/."
      />
      <SettingsClient initial={settings} tokenSet={tokenSet} routines={routines} />
    </>
  );
}
