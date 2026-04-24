import { NextResponse } from "next/server";
import {
  readSettings,
  writeSettings,
  writeGithubToken,
  clearGithubToken,
  SettingsSchema,
  type Settings,
} from "@/lib/settings";
import { pingGitHub } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (action === "ping-github") {
    const result = await pingGitHub();
    return NextResponse.json(result);
  }
  return NextResponse.json({ settings: readSettings() });
}

interface Body {
  settings?: Partial<Settings>;
  token?: string | null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (body.settings) {
    const parsed = SettingsSchema.safeParse(body.settings);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid settings", details: parsed.error.flatten() }, { status: 400 });
    }
    writeSettings(parsed.data);
  }
  if (body.token === null) {
    clearGithubToken();
  } else if (typeof body.token === "string" && body.token.length > 0) {
    writeGithubToken(body.token);
  }

  return NextResponse.json({ ok: true, settings: readSettings() });
}
