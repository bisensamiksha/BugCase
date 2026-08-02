export interface JsonTreeProps {
  readonly data: unknown;
  readonly name?: string;
  readonly defaultOpen?: boolean;
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function formatPrimitive(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return `"${value}"`;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return JSON.stringify(value) ?? 'undefined';
  }
}

/** Minimal collapsible JSON tree. Objects/arrays use native `<details>` so no client state is needed. */
export function JsonTree({ data, name, defaultOpen = true }: JsonTreeProps) {
  if (isPrimitive(data)) {
    return (
      <div className="font-mono text-sm leading-6">
        {name !== undefined ? <span className="text-[var(--bc-syntax-key)]">{name}: </span> : null}
        <span className="text-[var(--bc-syntax-value)]">{formatPrimitive(data)}</span>
      </div>
    );
  }

  const entries: readonly (readonly [string, unknown])[] = Array.isArray(data)
    ? (data as readonly unknown[]).map((value, index) => [String(index), value] as const)
    : Object.entries(data as Record<string, unknown>);

  const label = Array.isArray(data) ? `Array(${entries.length})` : `Object(${entries.length})`;

  return (
    <details open={defaultOpen} className="font-mono text-sm leading-6">
      <summary className="cursor-pointer text-[var(--bc-syntax-summary)]">
        {name !== undefined ? `${name}: ` : ''}
        {label}
      </summary>
      <div className="ml-4 border-l border-[var(--bc-syntax-guide)] pl-3">
        {entries.map(([key, value]) => (
          <JsonTree key={key} name={key} data={value} defaultOpen={false} />
        ))}
      </div>
    </details>
  );
}
