import type { NetworkLog } from '@bugcase/schema';

export interface NetworkTableProps {
  /** Parsed `report.network`; `null` when no network log was captured. */
  readonly log: NetworkLog | null;
}

const DASH = '—';

/** Format a nullable number (status, duration) without ever rendering the string "null". */
function orDash(value: number | null): string {
  return value === null ? DASH : String(value);
}

/**
 * Plain network table (S2-24). Renders captured network entries as a no-frills table; a richer,
 * filterable viewer is deferred to sprint 4. Null/empty logs render a quiet empty state, and
 * failed entries (null status/duration) show a dash rather than "null".
 */
export function NetworkTable({ log }: NetworkTableProps) {
  const entries = log?.entries ?? [];

  return (
    <section data-testid="network-table" aria-label="Network entries">
      <h2 className="text-sm font-semibold text-slate-700">Network ({entries.length})</h2>
      {entries.length === 0 ? (
        <p data-testid="network-empty" className="mt-1 text-sm text-slate-400">
          No network entries captured.
        </p>
      ) : (
        <table className="mt-1 w-full table-fixed text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="w-16 font-medium">Method</th>
              <th className="w-16 font-medium">Status</th>
              <th className="font-medium">URL</th>
              <th className="w-16 font-medium">Type</th>
              <th className="w-20 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} data-testid="network-row" className="align-top">
                <td className="font-mono text-slate-600">{entry.method}</td>
                <td className={`font-mono ${entry.failed ? 'text-red-600' : 'text-slate-600'}`}>
                  {entry.failed ? 'failed' : orDash(entry.status)}
                </td>
                <td className="break-all font-mono text-slate-800">{entry.url}</td>
                <td className="font-mono text-slate-500">{entry.initiator}</td>
                <td className="font-mono text-slate-500">
                  {entry.durationMs === null ? DASH : `${entry.durationMs} ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
