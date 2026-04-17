import { readAudit } from "@/lib/audit";
import { PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const entries = readAudit(200);

  const byFleet = new Map<string, number>();
  for (const e of entries) {
    byFleet.set(e.fleet, (byFleet.get(e.fleet) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow={`Last ${entries.length} action${entries.length === 1 ? "" : "s"}`}
        title="Audit Log"
        subtitle="Every tool call from every fleet member, captured by the PostToolUse hook. Newest first."
      />

      {byFleet.size > 0 && (
        <div className="panel p-4 mb-6 flex flex-wrap gap-2">
          {[...byFleet.entries()].map(([fleet, count]) => (
            <span key={fleet} className="pill-muted">
              {fleet}: {count}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1 data text-xs">
        {entries.length === 0 ? (
          <div className="panel p-12 text-center text-moon-400">
            <p className="mb-1">No audit entries yet.</p>
            <p className="text-xs data text-moon-600">Routines will populate this once they run.</p>
          </div>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="panel p-3 flex items-center gap-3">
              <span className="text-moon-600 w-44 truncate tabular-nums">{e.ts}</span>
              <span className="text-dawn-400 w-44 truncate">{e.fleet}</span>
              {e.event && <span className="pill-red">{e.event}</span>}
              {e.tool && <span className="pill-muted">{e.tool}</span>}
              <span className="text-moon-200 truncate flex-1">
                {e.output_preview ?? `total: ${e.total} / budget: ${e.budget}`}
              </span>
              {e.output_length !== undefined && (
                <span className="text-moon-600 whitespace-nowrap text-[10px]">{e.output_length}b</span>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
