import { NextResponse } from "next/server";
import { fireRoutine } from "@/lib/fire-routine";
import { setCloudCredential, clearCloudCredential, getCloudCredentialPublic } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface FireBody {
  routineId?: string;
  text?: string;
}

interface ConfigBody {
  routineId?: string;
  url?: string;
  token?: string | null;
}

/**
 * GET /api/cloud/fire?routineId=xxx
 * Returns whether a routine's API trigger is configured (without revealing the token).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const routineId = url.searchParams.get("routineId");
  if (!routineId) return NextResponse.json({ error: "routineId required" }, { status: 400 });
  return NextResponse.json(getCloudCredentialPublic(routineId));
}

/**
 * POST /api/cloud/fire
 * Body: { routineId, text? } — fires the routine
 * OR    { routineId, url, token } — saves credentials (token=null clears)
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (FireBody & ConfigBody) | null;
  if (!body || !body.routineId) {
    return NextResponse.json({ error: "routineId required" }, { status: 400 });
  }

  // Configuration write: presence of `url` OR explicit `token === null`
  if (body.url !== undefined || body.token === null) {
    if (body.token === null) {
      clearCloudCredential(body.routineId);
      return NextResponse.json({ ok: true, configured: false });
    }
    if (!body.url || !body.token) {
      return NextResponse.json({ error: "url + token required" }, { status: 400 });
    }
    if (!/^https?:\/\//.test(body.url)) {
      return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
    }
    setCloudCredential(body.routineId, body.url, body.token);
    return NextResponse.json({ ok: true, configured: true });
  }

  // Otherwise: fire the routine
  const result = await fireRoutine(body.routineId, body.text);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
