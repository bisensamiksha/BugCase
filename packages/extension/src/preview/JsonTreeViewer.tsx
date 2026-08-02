import { palette } from '@bugcase/shared-tokens';
import { compileSearch, filterJson, primitiveText } from '@bugcase/shared-ui';
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export interface JsonTreeViewerProps {
  readonly title: string;
  readonly data: unknown;
  /** Drives `aria-busy` and gates interactions (ticket contract). */
  readonly disabled?: boolean;
  /** Close the viewer (Escape / ×). */
  readonly onCancel?: () => void;
  /** Reserved by the ticket contract; a read-only viewer has no separate commit action. */
  readonly onComplete?: () => void;
  /** Writes text to the clipboard; defaults to `navigator.clipboard.writeText`. Injectable for tests. */
  readonly copyText?: (text: string) => Promise<void>;
}

/** Sentinel for "search produced no matches" / "invalid regex" (no tree to render). */
const NO_MATCH = Symbol('no-match');

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: palette.white,
  color: palette.slate900,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  padding: '24px',
  overflow: 'auto',
  zIndex: 2,
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '12px 0',
  flexWrap: 'wrap',
};

const isPrimitive = (value: unknown): boolean => value === null || typeof value !== 'object';

function JsonNode({
  name,
  value,
  open,
  nestedOpen,
}: {
  readonly name?: string;
  readonly value: unknown;
  /** Whether this node's `<details>` starts open. */
  readonly open: boolean;
  /** Whether descendant `<details>` start open (true while searching → fully expanded). */
  readonly nestedOpen: boolean;
}) {
  if (isPrimitive(value)) {
    return (
      <div style={{ fontFamily: 'monospace', lineHeight: 1.6 }}>
        {name !== undefined ? <span style={{ color: palette.slate500 }}>{name}: </span> : null}
        <span style={{ color: palette.emerald700 }}>
          {typeof value === 'string' ? `"${value}"` : primitiveText(value)}
        </span>
      </div>
    );
  }
  const entries: readonly (readonly [string, unknown])[] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const label = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`;
  return (
    <details open={open} style={{ fontFamily: 'monospace', lineHeight: 1.6 }}>
      <summary style={{ cursor: 'pointer', color: palette.slate600 }}>
        {name !== undefined ? `${name}: ` : ''}
        {label}
      </summary>
      <div
        style={{
          marginLeft: '16px',
          borderLeft: `1px solid ${palette.slate200}`,
          paddingLeft: '12px',
        }}
      >
        {entries.map(([key, child]) => (
          <JsonNode key={key} name={key} value={child} open={nestedOpen} nestedOpen={nestedOpen} />
        ))}
      </div>
    </details>
  );
}

export function JsonTreeViewer({ title, data, disabled, onCancel, copyText }: JsonTreeViewerProps) {
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const compiled = useMemo(
    () => (query ? compileSearch(query, useRegex) : null),
    [query, useRegex],
  );
  const view = useMemo<unknown>(() => {
    if (!compiled) {
      return data;
    }
    if (!compiled.valid) {
      return NO_MATCH;
    }
    const filtered = filterJson(data, compiled.match);
    return filtered === undefined ? NO_MATCH : filtered;
  }, [compiled, data]);

  const searching = compiled !== null;
  const invalidRegex = compiled !== null && !compiled.valid;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (disabled) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel?.();
    }
  }

  function handleCopy(): void {
    const write = copyText ?? ((text: string) => navigator.clipboard.writeText(text));
    void write(JSON.stringify(data, null, 2))
      .then(() => setCopyStatus('Copied'))
      .catch(() => setCopyStatus('Copy failed'));
  }

  return (
    <section
      ref={sectionRef}
      role="dialog"
      aria-modal="true"
      aria-label="JSON viewer"
      aria-busy={disabled ?? false}
      data-testid="json-tree-viewer"
      tabIndex={-1}
      style={overlayStyle}
      onKeyDown={handleKeyDown}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button
          type="button"
          aria-label="Close viewer"
          data-testid="json-close"
          onClick={() => onCancel?.()}
        >
          ×
        </button>
      </div>
      <div style={toolbarStyle}>
        <input
          type="search"
          placeholder="Search…"
          aria-label="Search JSON"
          data-testid="json-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: '160px', padding: '4px 8px' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            data-testid="json-regex-toggle"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
          />
          Regex
        </label>
        <button type="button" data-testid="json-copy" onClick={handleCopy}>
          Copy JSON
        </button>
        {copyStatus ? (
          <span data-testid="json-copy-status" style={{ color: palette.slate600 }}>
            {copyStatus}
          </span>
        ) : null}
      </div>
      {invalidRegex ? (
        <p data-testid="json-invalid-regex" role="alert" style={{ color: palette.red700 }}>
          Invalid regular expression.
        </p>
      ) : (
        <div data-testid="json-tree">
          {view === NO_MATCH ? (
            <p data-testid="json-no-matches" style={{ color: palette.slate600 }}>
              No matches.
            </p>
          ) : (
            <JsonNode
              key={`${query}|${String(useRegex)}`}
              value={view}
              open
              nestedOpen={searching}
            />
          )}
        </div>
      )}
    </section>
  );
}
