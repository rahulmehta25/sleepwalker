import { readLocalQueue, type QueueEntry } from "./queue";
import { fetchCloudQueue, readCachedCloudQueue } from "./cloud-cache";

export interface AggregatedQueue {
  pending: QueueEntry[];
  recent: QueueEntry[];
  cloudFetchedAt: string | null;
  cloudError: string | null;
  localCount: number;
  cloudCount: number;
}

export async function aggregateQueue(opts: { fetchCloud: boolean }): Promise<AggregatedQueue> {
  const local = readLocalQueue();

  let cloud: QueueEntry[] = [];
  let cloudError: string | null = null;
  let cloudFetchedAt: string | null = null;

  if (opts.fetchCloud) {
    try {
      cloud = await fetchCloudQueue(false);
      cloudFetchedAt = new Date().toISOString();
    } catch (e) {
      cloudError = e instanceof Error ? e.message : String(e);
      cloud = readCachedCloudQueue();
    }
  } else {
    cloud = readCachedCloudQueue();
  }

  const all = [...local, ...cloud];
  const pending = all
    .filter((e) => e.status === "pending")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const recent = all
    .filter((e) => e.status !== "pending")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 20);

  return {
    pending,
    recent,
    cloudFetchedAt,
    cloudError,
    localCount: local.length,
    cloudCount: cloud.length,
  };
}
