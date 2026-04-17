import { NextResponse } from "next/server";
import { listCloudRoutines } from "@/lib/cloud";
import { fetchCloudQueue } from "@/lib/cloud-cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "true";

  const routines = listCloudRoutines();

  let queue: Awaited<ReturnType<typeof fetchCloudQueue>> = [];
  let error: string | null = null;
  if (refresh) {
    try {
      queue = await fetchCloudQueue(true);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({ routines, queue, error });
}
