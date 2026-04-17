import { NextResponse } from "next/server";
import { readAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 200);
  return NextResponse.json({ entries: readAudit(limit) });
}
