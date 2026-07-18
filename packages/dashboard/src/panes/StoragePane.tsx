import type { CookiesDump, StorageDump } from '@bugcase/schema';
import { useState } from 'react';

import { MaskedValue } from '../components/MaskedValue';

import { cookieRows, cookieSummary, storageRows, storageSummary } from './storage-tables';

export interface StoragePaneProps {
  /** `report.cookies`; null when the cookies collector was denied/off. */
  readonly cookies: CookiesDump | null;
  /** `report.storage`; null when the storage collector was denied/off. */
  readonly storage: StorageDump | null;
}

const HEADING = 'text-sm font-semibold text-[var(--bc-fg)]';
const SUMMARY = 'text-xs text-[var(--bc-fg-muted)]';
const MUTED = 'text-sm text-[var(--bc-fg-muted)]';
const TH = 'px-2 py-1 text-left text-xs font-semibold text-[var(--bc-fg-muted)]';
const TD = 'px-2 py-1 align-top text-xs text-[var(--bc-fg)]';
const FILTER =
  'rounded border border-[var(--bc-border)] bg-[var(--bc-bg)] px-2 py-1 text-sm text-[var(--bc-fg)]';

function FilterInput({
  id,
  value,
  onChange,
  label,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filter keys…"
        className={FILTER}
      />
    </span>
  );
}

/**
 * Storage pane (S4-12): Cookies / Local storage / Session storage tables. All data comes from
 * report.json — no ReportSource. Values are masked by default (privacy-first); a single reveal model
 * (`revealAll` + `overrides`) drives both the header "Reveal all" toggle and per-row toggles.
 */
export function StoragePane({ cookies, storage }: StoragePaneProps) {
  const [revealAll, setRevealAll] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(() => new Set());
  const [cookieFilter, setCookieFilter] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');

  const isRevealed = (id: string): boolean => (revealAll ? !overrides.has(id) : overrides.has(id));

  function toggle(id: string): void {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll(): void {
    setRevealAll((prev) => !prev);
    setOverrides(new Set());
  }

  const storageSections =
    storage === null
      ? []
      : [
          {
            key: 'local' as const,
            title: 'Local storage',
            entries: storage.localStorage,
            filter: localFilter,
            setFilter: setLocalFilter,
            nullMsg: 'Local storage was not captured.',
            emptyMsg: 'No local storage entries.',
          },
          {
            key: 'session' as const,
            title: 'Session storage',
            entries: storage.sessionStorage,
            filter: sessionFilter,
            setFilter: setSessionFilter,
            nullMsg: 'Session storage was not captured.',
            emptyMsg: 'No session storage entries.',
          },
        ];

  return (
    <section
      data-testid="storage-pane"
      aria-label="Storage"
      className="flex h-full flex-col gap-5 overflow-auto p-4"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--bc-fg)]">Storage</h2>
        <button
          type="button"
          data-testid="storage-reveal-all"
          aria-pressed={revealAll}
          onClick={toggleAll}
          className="rounded border border-[var(--bc-border)] px-2 py-1 text-sm text-[var(--bc-fg)]"
        >
          {revealAll ? 'Hide all values' : 'Reveal all values'}
        </button>
      </header>

      {/* Cookies */}
      <section data-testid="storage-cookies" aria-label="Cookies" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={HEADING}>Cookies</h3>
            {cookies !== null ? <p className={SUMMARY}>{cookieSummary(cookies.entries)}</p> : null}
          </div>
          {cookies !== null && cookies.entries.length > 0 ? (
            <FilterInput
              id="cookie-filter"
              value={cookieFilter}
              onChange={setCookieFilter}
              label="Filter cookies by name"
            />
          ) : null}
        </div>
        {cookies === null ? (
          <p data-testid="cookies-empty" className={MUTED}>
            Cookies were not captured.
          </p>
        ) : cookies.entries.length === 0 ? (
          <p data-testid="cookies-empty" className={MUTED}>
            No cookies.
          </p>
        ) : (
          (() => {
            const rows = cookieRows(cookies.entries, cookieFilter);
            if (rows.length === 0) {
              return (
                <p data-testid="cookies-nomatch" className={MUTED}>
                  No cookies match “{cookieFilter}”.
                </p>
              );
            }
            return (
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Cookies</caption>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Name
                    </th>
                    <th scope="col" className={TH}>
                      Value
                    </th>
                    <th scope="col" className={TH}>
                      Domain
                    </th>
                    <th scope="col" className={TH}>
                      Path
                    </th>
                    <th scope="col" className={TH}>
                      Expires
                    </th>
                    <th scope="col" className={TH}>
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="border-t border-[var(--bc-border)]">
                      <td className={`${TD} font-mono`}>{row.name}</td>
                      <td className={TD}>
                        <MaskedValue
                          value={row.value}
                          revealed={isRevealed(row.id)}
                          onToggle={() => toggle(row.id)}
                          label={row.name}
                          testId={`cookie-value-${index}`}
                        />
                      </td>
                      <td className={`${TD} font-mono`}>{row.domain}</td>
                      <td className={`${TD} font-mono`}>{row.path}</td>
                      <td className={`${TD} font-mono`}>{row.expires}</td>
                      <td className={TD}>
                        {row.flags.length > 0
                          ? row.flags.map((flag) => (
                              <span
                                key={flag}
                                className="mr-1 inline-block rounded bg-[var(--bc-surface)] px-1 py-0.5 text-[var(--bc-fg-muted)]"
                              >
                                {flag}
                              </span>
                            ))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()
        )}
      </section>

      {/* Local / session storage */}
      {storage === null ? (
        <p data-testid="storage-empty" className={MUTED}>
          Storage was not captured.
        </p>
      ) : (
        <>
          {storageSections.map((sec) => (
            <section
              key={sec.key}
              data-testid={`storage-${sec.key}`}
              aria-label={sec.title}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className={HEADING}>{sec.title}</h3>
                  {sec.entries !== null ? (
                    <p className={SUMMARY}>{storageSummary(sec.entries)}</p>
                  ) : null}
                </div>
                {sec.entries !== null && sec.entries.length > 0 ? (
                  <FilterInput
                    id={`${sec.key}-filter`}
                    value={sec.filter}
                    onChange={sec.setFilter}
                    label={`Filter ${sec.title} by key`}
                  />
                ) : null}
              </div>
              {sec.entries === null ? (
                <p data-testid={`${sec.key}-empty`} className={MUTED}>
                  {sec.nullMsg}
                </p>
              ) : sec.entries.length === 0 ? (
                <p data-testid={`${sec.key}-empty`} className={MUTED}>
                  {sec.emptyMsg}
                </p>
              ) : (
                (() => {
                  const rows = storageRows(sec.entries, sec.filter);
                  if (rows.length === 0) {
                    return (
                      <p data-testid={`${sec.key}-nomatch`} className={MUTED}>
                        No keys match “{sec.filter}”.
                      </p>
                    );
                  }
                  return (
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">{sec.title}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className={TH}>
                            Key
                          </th>
                          <th scope="col" className={TH}>
                            Value
                          </th>
                          <th scope="col" className={TH}>
                            Size
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={row.id} className="border-t border-[var(--bc-border)]">
                            <td className={`${TD} font-mono`}>{row.key}</td>
                            <td className={TD}>
                              <MaskedValue
                                value={row.value}
                                revealed={isRevealed(row.id)}
                                onToggle={() => toggle(row.id)}
                                label={row.key}
                                testId={`${sec.key}-value-${index}`}
                              />
                            </td>
                            <td className={`${TD} font-mono`}>{row.size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </section>
          ))}
          {storage.note ? (
            <p data-testid="storage-note" className={MUTED}>
              {storage.note}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
