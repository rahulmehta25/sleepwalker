import { getCloudCredential } from "./settings";

const BETA_HEADER = "experimental-cc-routine-2026-04-01";
const ANTHROPIC_VERSION = "2023-06-01";

export interface FireResult {
  ok: boolean;
  status: number;
  /** Returned by the /fire endpoint when successful */
  sessionId?: string;
  /** Watch URL on claude.ai/code/<id> */
  sessionUrl?: string;
  /** Raw response body, for debugging when not ok */
  body?: unknown;
  error?: string;
}

/**
 * POST to the routine's /fire endpoint with the configured bearer token.
 * Optional `text` payload is freeform context for the routine (alert body etc.).
 */
export async function fireRoutine(routineId: string, text?: string): Promise<FireResult> {
  const cred = getCloudCredential(routineId);
  if (!cred) {
    return { ok: false, status: 0, error: "no-credentials-configured" };
  }

  let res: Response;
  try {
    res = await fetch(cred.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cred.token}`,
        "anthropic-beta": BETA_HEADER,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(text !== undefined ? { text } : {}),
    });
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }

  const raw = await res.text();
  let parsed: unknown = raw;
  try { parsed = JSON.parse(raw); } catch { /* leave as text */ }

  if (!res.ok) {
    return { ok: false, status: res.status, body: parsed, error: `HTTP ${res.status}` };
  }

  const body = parsed as { type?: string; claude_code_session_id?: string; claude_code_session_url?: string };
  return {
    ok: true,
    status: res.status,
    sessionId: body.claude_code_session_id,
    sessionUrl: body.claude_code_session_url,
    body: parsed,
  };
}
