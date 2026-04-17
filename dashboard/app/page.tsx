import { aggregateQueue } from "@/lib/queue-aggregator";
import { hasGithubConfig } from "@/lib/settings";
import { QueueClient } from "./queue-client";
import { PageHeader } from "./_components/page-header";

export const dynamic = "force-dynamic";

export default async function MorningQueuePage() {
  const githubConfigured = hasGithubConfig();
  const queue = await aggregateQueue({ fetchCloud: githubConfigured });

  const pendingText =
    queue.pending.length === 0
      ? "Inbox zero. Sleep well."
      : `${queue.pending.length} pending action${queue.pending.length === 1 ? "" : "s"} from overnight — ${queue.localCount} local, ${queue.cloudCount} cloud.`;

  const meta: React.ReactNode[] = [];
  if (!githubConfigured) {
    meta.push(<span key="cloud-off" className="pill-amber">cloud queue inactive · configure GitHub in Settings</span>);
  }
  if (queue.cloudError) {
    meta.push(<span key="cloud-err" className="pill-red">cloud poll failed · {queue.cloudError}</span>);
  }

  return (
    <>
      <PageHeader
        eyebrow="07:00 / Today"
        title="Morning Queue"
        subtitle={pendingText}
        meta={meta.length > 0 ? meta : null}
      />
      <QueueClient initialPending={queue.pending} initialRecent={queue.recent} />
    </>
  );
}
