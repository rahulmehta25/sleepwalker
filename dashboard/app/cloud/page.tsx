import { listCloudRoutines } from "@/lib/cloud";
import { hasGithubConfig, readSettings } from "@/lib/settings";
import { CloudClient } from "./cloud-client";

export const dynamic = "force-dynamic";

export default function CloudRoutinesPage() {
  const routines = listCloudRoutines();
  const githubConfigured = hasGithubConfig();
  const trackedRepos = readSettings().tracked_repos;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Cloud Routines</h1>
        <p className="text-sw-muted text-sm">
          {routines.length} fleet member{routines.length === 1 ? "" : "s"} that run on Anthropic cloud (Claude Code Routines).
        </p>
        <div className="text-xs text-sw-muted mt-3 flex flex-wrap gap-2">
          {githubConfigured ? (
            <span className="pill-green">GitHub configured</span>
          ) : (
            <span className="pill-amber">GitHub not configured — see Settings</span>
          )}
          <span className="pill-muted">
            {trackedRepos.length} tracked repo{trackedRepos.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <CloudClient routines={routines} githubConfigured={githubConfigured} />
    </div>
  );
}
