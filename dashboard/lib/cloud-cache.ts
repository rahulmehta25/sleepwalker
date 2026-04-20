import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSleepwalkerPRs, type GitHubPR } from "./github";
import type { QueueEntry } from "./queue";

function cacheFile(): string {
  return path.join(process.env.HOME || os.homedir(), ".sleepwalker", "cloud-cache.json");
}
const TTL_MS = 60_000; // 1 minute

interface CachedSnapshot {
  fetchedAt: string;
  entries: QueueEntry[];
}

function readCache(): CachedSnapshot | null {
  const f = cacheFile();
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(snap: CachedSnapshot): void {
  const f = cacheFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(snap, null, 2));
}

function fleetFromBranch(branch: string): string {
  const m = branch.match(/^claude\/sleepwalker\/([^/]+)/);
  return m ? m[1] : "cloud";
}

function prToQueueEntry(repo: string, pr: GitHubPR): QueueEntry {
  return {
    id: `q_cloud_${repo.replace("/", "__")}_${pr.number}`,
    ts: pr.created_at,
    fleet: fleetFromBranch(pr.head.ref),
    kind: "cloud-pr",
    payload: {
      repo,
      pr_number: pr.number,
      pr_url: pr.html_url,
      title: pr.title,
      body: pr.body?.slice(0, 800) ?? "",
      branch: pr.head.ref,
      base: pr.base.ref,
      author: pr.user?.login ?? "unknown",
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      draft: pr.draft,
    },
    reversibility: "green",
    status: "pending",
    source: "cloud",
  };
}

export async function fetchCloudQueue(force = false): Promise<QueueEntry[]> {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) {
      return cached.entries;
    }
  }

  const prs = await listSleepwalkerPRs();
  const entries = prs.map(({ repo, pr }) => prToQueueEntry(repo, pr));
  writeCache({ fetchedAt: new Date().toISOString(), entries });
  return entries;
}

export function readCachedCloudQueue(): QueueEntry[] {
  return readCache()?.entries ?? [];
}
