import { readAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const entries = readAudit(200);

  const byFleet = new Map<string, number>();
  for (const e of entries) {
    byFleet.set(e.fleet, (byFleet.get(e.fleet) ?? 0) + 1);
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Audit Log</h1>
        <p className="text-sw-muted text-sm">
          Last {entries.length} action{entries.length === 1 ? "" : "s"} from all fleet members.
        </p>
      </header>

      {byFleet.size > 0 && (
        <div className="panel p-4 mb-6 flex flex-wrap gap-2">
          {[...byFleet.entries()].map(([fleet, count]) => (
            <span key={fleet} className="pill-muted">
              {fleet}: {count}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="panel p-8 text-center text-sw-muted">
            No audit entries yet. Routines will populate this once they run.
          </div>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="panel p-3 flex items-center gap-3">
              <span className="text-sw-muted w-40 truncate">{e.ts}</span>
              <span className="text-sw-accent w-44 truncate">{e.fleet}</span>
              {e.event && <span className="pill-red">{e.event}</span>}
              {e.tool && <span className="pill-muted">{e.tool}</span>}
              <span className="text-sw-text truncate flex-1">
                {e.output_preview ?? `total: ${e.total} / budget: ${e.budget}`}
              </span>
              {e.output_length !== undefined && (
                <span className="text-sw-muted whitespace-nowrap">{e.output_length} bytes</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
