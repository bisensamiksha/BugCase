import { palette } from '@bugcase/shared-tokens';
import { useEffect, useState, type CSSProperties } from 'react';

import { revealDownload, type RevealResult } from '../lib/reveal-download';
import { formatBytes } from '../preview/artifact-list';
import {
  clearReportHistory,
  getReportHistory,
  removeReportHistory,
  type ReportHistoryEntry,
} from '../storage/report-history';

export interface ReportHistoryProps {
  /** Loads persisted history; defaults to `storage/report-history.getReportHistory`. */
  readonly loadHistory?: () => Promise<ReportHistoryEntry[]>;
  /** Removes one entry by id; defaults to `removeReportHistory`. */
  readonly removeEntry?: (id: string) => Promise<ReportHistoryEntry[]>;
  /** Clears the whole history; defaults to `clearReportHistory`. */
  readonly clearHistory?: () => Promise<void>;
  /** Reveals a downloaded ZIP; defaults to `lib/reveal-download.revealDownload`. */
  readonly reveal?: (downloadId: number | null, filename: string) => Promise<RevealResult>;
}

const sectionStyle: CSSProperties = {
  border: `1px solid ${palette.slate200}`,
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 16px',
};
const legendStyle: CSSProperties = { fontSize: '13px', fontWeight: 600, margin: '0 0 8px' };
const mutedStyle: CSSProperties = { color: palette.slate600, margin: '0 0 8px' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 0',
  borderBottom: `1px solid ${palette.slate200}`,
};
const metaStyle: CSSProperties = { color: palette.slate600, fontSize: '12px' };

/** A readable local timestamp; falls back to the raw value when it isn't a parseable date. */
function formatCapturedAt(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString();
}

export function ReportHistory({
  loadHistory,
  removeEntry,
  clearHistory,
  reveal,
}: ReportHistoryProps) {
  const load = loadHistory ?? (() => getReportHistory());
  const removeOne = removeEntry ?? ((id: string) => removeReportHistory(id));
  const clearAll = clearHistory ?? (() => clearReportHistory());
  const revealOne = reveal ?? ((id, filename) => revealDownload(id, filename));

  const [entries, setEntries] = useState<ReportHistoryEntry[] | null>(null);
  const [revealMsg, setRevealMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load runs once on mount, like OptionsApp
  }, [loadHistory]);

  function handleReveal(entry: ReportHistoryEntry): void {
    setRevealMsg(null);
    void revealOne(entry.downloadId, entry.filename).then((result) => {
      if (!result.revealed) {
        setRevealMsg(`Find ${result.filename} in your Downloads folder.`);
      }
    });
  }

  function handleRemove(id: string): void {
    void removeOne(id).then((next) => setEntries(next));
  }

  function handleClear(): void {
    setRevealMsg(null);
    void clearAll().then(() => setEntries([]));
  }

  return (
    <fieldset data-testid="report-history" style={sectionStyle}>
      <legend style={legendStyle}>Report history</legend>
      <p style={mutedStyle}>
        Past downloads on this device. Only metadata is kept, never the report contents.
      </p>

      {entries === null ? (
        <p data-testid="report-history-loading" style={mutedStyle}>
          Loading history…
        </p>
      ) : entries.length === 0 ? (
        <p data-testid="report-history-empty" style={mutedStyle}>
          No captures yet.
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {entries.map((entry) => (
              <li key={entry.id} data-testid="history-row" style={rowStyle}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 500 }}>
                    {entry.title || entry.url}
                  </span>
                  <span style={metaStyle}>
                    {entry.origin} · {formatCapturedAt(entry.capturedAt)} ·{' '}
                    {formatBytes(entry.byteSize)} · {entry.artifacts.length} artifact
                    {entry.artifacts.length === 1 ? '' : 's'}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid={`history-reveal-${entry.id}`}
                  onClick={() => handleReveal(entry)}
                >
                  Reveal download
                </button>
                <button
                  type="button"
                  data-testid={`history-remove-${entry.id}`}
                  onClick={() => handleRemove(entry.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {revealMsg ? (
            <p
              data-testid="history-reveal-msg"
              role="status"
              style={{ ...mutedStyle, marginTop: '8px' }}
            >
              {revealMsg}
            </p>
          ) : null}
          <div style={{ marginTop: '8px' }}>
            <button type="button" data-testid="history-clear" onClick={handleClear}>
              Clear all
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}
