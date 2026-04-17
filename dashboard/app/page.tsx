import { aggregateQueue } from "@/lib/queue-aggregator";
import { hasGithubConfig } from "@/lib/settings";
import { QueueClient } from "./queue-client";

export const dynamic = "force-dynamic";

export default async function MorningQueuePage() {
  const githubConfigured = hasGithubConfig();
  const queue = await aggregateQueue({ fetchCloud: githubConfigured });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Morning Queue</h1>
        <p className="text-sw-muted text-sm">
          {queue.pending.length === 0
            ? "Inbox zero. Sleep well."
            : `${queue.pending.length} pending action${queue.pending.length === 1 ? "" : "s"} from overnight (${queue.localCount} local, ${queue.cloudCount} cloud).`}
        </p>
        {!githubConfigured && (
          <p className="text-sw-muted text-xs mt-2">
            <span className="pill-amber">cloud queue inactive</span> Configure GitHub token in Settings to surface cloud-fleet PRs here.
          </p>
        )}
        {queue.cloudError && (
          <p className="text-sw-muted text-xs mt-2">
            <span className="pill-red">cloud poll failed</span> {queue.cloudError}
          </p>
        )}
      </header>

      <QueueClient initialPending={queue.pending} initialRecent={queue.recent} />
    </div>
  );
}
