import { NextResponse } from "next/server";
import { listRoutines, setEnabled } from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routines: listRoutines() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { id?: string; enabled?: boolean }
    | null;
  if (!body || !body.id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  setEnabled(body.id, body.enabled);
  return NextResponse.json({ ok: true });
}
