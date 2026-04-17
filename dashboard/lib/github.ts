import { readGithubToken, readSettings } from "./settings";

const GITHUB_API = "https://api.github.com";

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  head: { ref: string };
  base: { ref: string };
  user: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  draft: boolean;
  state: "open" | "closed";
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

async function ghFetch<T>(pathName: string): Promise<T | null> {
  const token = readGithubToken();
  if (!token) return null;
  const res = await fetch(`${GITHUB_API}${pathName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * For each tracked repo, return open PRs whose head branch starts with `claude/sleepwalker/`.
 * These are the cloud-fleet's queue entries.
 */
export async function listSleepwalkerPRs(): Promise<{ repo: string; pr: GitHubPR }[]> {
  const repos = readSettings().tracked_repos;
  const out: { repo: string; pr: GitHubPR }[] = [];

  for (const repo of repos) {
    const prs = await ghFetch<GitHubPR[]>(`/repos/${repo}/pulls?state=open&per_page=50`);
    if (!prs) continue;
    for (const pr of prs) {
      if (pr.head.ref.startsWith("claude/sleepwalker/")) {
        out.push({ repo, pr });
      }
    }
  }

  return out;
}

/**
 * Test that the configured token can reach the GitHub API.
 */
export async function pingGitHub(): Promise<{ ok: boolean; user?: string; error?: string }> {
  const token = readGithubToken();
  if (!token) return { ok: false, error: "no token configured" };
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
  const data = (await res.json()) as { login?: string };
  return { ok: true, user: data.login };
}
