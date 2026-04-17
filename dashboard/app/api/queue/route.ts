import { NextResponse } from "next/server";
import { aggregateQueue } from "@/lib/queue-aggregator";
import { readLocalQueue, updateLocalStatus, appendQueueEntry, type QueueEntry } from "@/lib/queue";
import { hasGithubConfig } from "@/lib/settings";
import { enqueueForExecution } from "@/lib/approval";

export const dynamic = "force-dynamic";

export async function GET() {
  const githubConfigured = hasGithubConfig();
  const q = await aggregateQueue({ fetchCloud: githubConfigured });
  return NextResponse.json(q);
}

interface Body {
  id?: string;
  action?: "approve" | "reject" | "dismiss";
  source?: "local" | "cloud";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.id || !body.action) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const source = body.source ?? (body.id.startsWith("q_cloud_") ? "cloud" : "local");

  if (source === "local") {
    const status = body.action === "approve" ? "approved" : "rejected";

    // Look up the entry first so we can enqueue it for re-execution on approve.
    const entry = readLocalQueue().find((e) => e.id === body.id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ok = updateLocalStatus(body.id, status);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let queuedForExecution: string | null = null;
    if (status === "approved") {
      queuedForExecution = enqueueForExecution(entry);
    }

    return NextResponse.json({ ok: true, queuedForExecution });
  }

  // Cloud entries: log the dismiss/approve as a recorded decision in the local queue.
  // We don't auto-merge / auto-close PRs — that requires the human's GitHub action.
  const entry: QueueEntry = {
    id: `${body.id}__decision_${Date.now()}`,
    ts: new Date().toISOString(),
    fleet: "queue-bridge",
    tool: "cloud-decision",
    args: { original_id: body.id, action: body.action },
    reversibility: "green",
    status: body.action === "approve" ? "approved" : "rejected",
    source: "local",
  };
  appendQueueEntry(entry);
  return NextResponse.json({ ok: true });
}
