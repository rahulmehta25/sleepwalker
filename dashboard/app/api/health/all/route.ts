/**
 * GET /api/health/all — aggregated runtime health endpoint.
 *
 * Consumed by the landing-page HealthBadgeRow client component (Plan 04-06)
 * to render green/amber/grey pills per runtime. Wraps every adapter's
 * healthCheck() in a 2000ms Promise.race timeout and a settled-array mapper
 * so no single hung, throwing, or mis-authored adapter can delay or crash
 * the overall response. Never-caches: `dynamic = "force-dynamic"` +
 * `revalidate = 0` so each client fetch reflects live adapter state (the
 * client-side 60s cache lives in HealthBadgeRow, not here — HLTH-01).
 *
 * Rationale (see 04-RESEARCH.md §Health Badge Implementation §Route
 * Handler): healthCheckAll() from `@/lib/runtime-adapters` uses Promise.all
 * which would reject the whole batch if any adapter threw. This Route
 * Handler sits on top of the registry and applies bounded per-adapter
 * probes so the landing page always gets a length-4 statuses array.
 */

import { NextResponse } from "next/server";
import { ADAPTERS } from "@/lib/runtime-adapters";
import type { HealthStatus, Runtime } from "@/lib/runtime-adapters/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEOUT_MS = 2000;

function timeoutStatus(runtime: Runtime): HealthStatus {
  return {
    runtime,
    available: false,
    reason: `healthCheck timed out after ${TIMEOUT_MS}ms`,
  };
}

function withTimeout(
  p: Promise<HealthStatus>,
  runtime: Runtime,
): Promise<HealthStatus> {
  return Promise.race([
    p,
    new Promise<HealthStatus>((resolve) =>
      setTimeout(() => resolve(timeoutStatus(runtime)), TIMEOUT_MS),
    ),
  ]);
}

export async function GET() {
  const adapters = Object.values(ADAPTERS);
  const settled = await Promise.allSettled(
    adapters.map((a) => withTimeout(a.healthCheck(), a.runtime)),
  );
  const statuses: HealthStatus[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const reasonMsg =
      r.reason instanceof Error ? r.reason.message : String(r.reason);
    return {
      runtime: adapters[i].runtime,
      available: false,
      reason: `healthCheck threw: ${reasonMsg}`,
    };
  });
  return NextResponse.json({
    statuses,
    checkedAt: new Date().toISOString(),
  });
}
