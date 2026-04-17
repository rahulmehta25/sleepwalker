import { readSettings, readGithubToken } from "@/lib/settings";
import { listRoutines } from "@/lib/routines";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = readSettings();
  const tokenSet = Boolean(readGithubToken());
  const routines = listRoutines();

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-sw-muted text-sm">
          Sleep window, per-fleet policies, GitHub token, tracked repos.
        </p>
      </header>

      <SettingsClient initial={settings} tokenSet={tokenSet} routines={routines} />
    </div>
  );
}
