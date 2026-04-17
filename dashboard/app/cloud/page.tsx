import { listCloudRoutines } from "@/lib/cloud";
import { hasGithubConfig, readSettings } from "@/lib/settings";
import { CloudClient } from "./cloud-client";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function CloudRoutinesPage() {
  const routines = listCloudRoutines();
  const githubConfigured = hasGithubConfig();
  const trackedRepos = readSettings().tracked_repos;

  const meta: React.ReactNode[] = [
    githubConfigured ? (
      <span key="gh" className="pill-green">GitHub configured</span>
    ) : (
      <span key="gh" className="pill-amber">GitHub not configured · see Settings</span>
    ),
    <span key="tracked" className="pill-muted">{trackedRepos.length} tracked repo{trackedRepos.length === 1 ? "" : "s"}</span>,
  ];

  return (
    <>
      <PageHeader
        eyebrow="Tier C / Anthropic Cloud"
        title="Cloud Routines"
        subtitle={`${routines.length} fleet members built on Claude Code Routines. Triggered by schedule, GitHub event, or per-routine HTTPS endpoint. Each output lands as a claude/sleepwalker/* PR for review.`}
        meta={meta}
      />
      <CloudClient routines={routines} githubConfigured={githubConfigured} />
    </>
  );
}
