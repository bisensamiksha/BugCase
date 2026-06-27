import type { ConsoleEntry, ConsoleLog } from '@bugcase/schema';

export interface ConsoleTableProps {
  /** Parsed `report.console`; `null` when no console log was captured. */
  readonly log: ConsoleLog | null;
}

/** Join an entry's args into a single, plain message preview. */
function messageOf(entry: ConsoleEntry): string {
  return entry.args.map((arg) => arg.preview).join(' ');
}

const levelClass: Record<string, string> = {
  error: 'text-red-600',
  warn: 'text-amber-600',
};

/**
 * Plain console table (S2-24). Renders captured console entries as a no-frills table; a richer,
 * filterable viewer is deferred to sprint 4. Null/empty logs render a quiet empty state.
 */
export function ConsoleTable({ log }: ConsoleTableProps) {
  const entries = log?.entries ?? [];

  return (
    <section data-testid="console-table" aria-label="Console entries">
      <h2 className="text-sm font-semibold text-slate-700">Console ({entries.length})</h2>
      {entries.length === 0 ? (
        <p data-testid="console-empty" className="mt-1 text-sm text-slate-400">
          No console entries captured.
        </p>
      ) : (
        <table className="mt-1 w-full table-fixed text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="w-16 font-medium">Level</th>
              <th className="w-40 font-medium">Time</th>
              <th className="font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} data-testid="console-row" className="align-top">
                <td className={`font-mono ${levelClass[entry.level] ?? 'text-slate-600'}`}>
                  {entry.level}
                </td>
                <td className="font-mono text-slate-500">{entry.timestamp}</td>
                <td className="break-words font-mono text-slate-800">{messageOf(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
