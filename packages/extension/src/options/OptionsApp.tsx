import type { UserOptions } from '@bugcase/schema';
import { useEffect, useState, type CSSProperties } from 'react';

import { CaptureOptions } from '../overlay/CaptureOptions';
import {
  addAllowedOrigin,
  getAllowedOrigins,
  removeAllowedOrigin,
} from '../storage/origin-allowlist';
import type { ReportHistoryEntry } from '../storage/report-history';
import {
  DEFAULT_SETTINGS,
  MAX_RING_BUFFER_SIZE,
  MIN_RING_BUFFER_SIZE,
  SCRUBBER_TOGGLE_DEFS,
  getSettings,
  saveSettings,
  type BugCaseSettings,
} from '../storage/settings';

import { ReportHistory } from './ReportHistory';

export interface OptionsAppProps {
  /** Loads persisted settings; defaults to `storage/settings.getSettings`. */
  readonly loadSettings?: () => Promise<BugCaseSettings>;
  /** Persists a partial settings update; defaults to `storage/settings.saveSettings`. */
  readonly persistSettings?: (update: Partial<BugCaseSettings>) => Promise<BugCaseSettings>;
  /** Loads the passive-monitoring allowlist; defaults to `storage/origin-allowlist.getAllowedOrigins`. */
  readonly loadAllowlist?: () => Promise<string[]>;
  /** Adds an origin to the allowlist; defaults to `addAllowedOrigin`. */
  readonly addOrigin?: (origin: string) => Promise<string[]>;
  /** Removes an origin from the allowlist; defaults to `removeAllowedOrigin`. */
  readonly removeOrigin?: (origin: string) => Promise<string[]>;
  /** Loads report history for the history section; defaults to `getReportHistory`. */
  readonly loadHistory?: () => Promise<ReportHistoryEntry[]>;
}

const pageStyle: CSSProperties = {
  maxWidth: '640px',
  margin: '0 auto',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  color: '#0f172a',
};
const sectionStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 16px',
};
const legendStyle: CSSProperties = { fontSize: '13px', fontWeight: 600, margin: '0 0 8px' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '4px 0',
};
const mutedStyle: CSSProperties = { color: '#475569', margin: '0 0 8px' };

/** Split a textarea's contents into trimmed, non-empty header names, preserving order. */
function parseHeaderLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function OptionsApp({
  loadSettings,
  persistSettings,
  loadAllowlist,
  addOrigin,
  removeOrigin,
  loadHistory,
}: OptionsAppProps) {
  const persist = persistSettings ?? ((update) => saveSettings(update));
  const addOne = addOrigin ?? ((origin) => addAllowedOrigin(origin));
  const removeOne = removeOrigin ?? ((origin) => removeAllowedOrigin(origin));

  const [settings, setSettings] = useState<BugCaseSettings | null>(null);
  const [origins, setOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  // Local text mirrors for the free-text fields, so controlled re-renders never fight typing.
  const [headerText, setHeaderText] = useState('');
  const [ringText, setRingText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const runLoad = loadSettings ?? (() => getSettings());
    const runOrigins = loadAllowlist ?? (() => getAllowedOrigins());
    void runLoad()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setHeaderText(loaded.blockedHeaders.join('\n'));
        setRingText(String(loaded.maxRingBufferSize));
      })
      .catch(() => {
        if (cancelled) return;
        setSettings(DEFAULT_SETTINGS);
        setHeaderText(DEFAULT_SETTINGS.blockedHeaders.join('\n'));
        setRingText(String(DEFAULT_SETTINGS.maxRingBufferSize));
      });
    void runOrigins()
      .then((loaded) => {
        if (!cancelled) setOrigins(loaded);
      })
      .catch(() => {
        if (!cancelled) setOrigins([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSettings, loadAllowlist]);

  function applyUpdate(update: Partial<BugCaseSettings>): void {
    setSettings((prev) => (prev ? { ...prev, ...update } : prev));
    void persist(update);
  }

  function handleAddOrigin(): void {
    const origin = newOrigin.trim();
    if (origin.length === 0) return;
    void addOne(origin).then((next) => {
      setOrigins(next);
      setNewOrigin('');
    });
  }

  return (
    <main data-testid="options-app" style={pageStyle}>
      <h1 style={{ fontSize: '18px' }}>BugCase settings</h1>
      <p style={mutedStyle}>
        These preferences stay on this device. Nothing is uploaded or synced to a server.
      </p>

      {settings ? (
        <>
          <fieldset style={sectionStyle}>
            <legend style={legendStyle}>Default capture options</legend>
            <p style={mutedStyle}>Pre-selected each time you open the capture overlay.</p>
            <CaptureOptions
              value={settings.defaultCaptureOptions}
              onChange={(next: UserOptions) => applyUpdate({ defaultCaptureOptions: next })}
              checkPermission={() => Promise.resolve(true)}
            />
          </fieldset>

          <fieldset style={sectionStyle}>
            <legend style={legendStyle}>Scrubbers</legend>
            <p style={mutedStyle}>
              Redaction rules applied before a report is saved. Turning one off keeps more data in
              the report.
            </p>
            {SCRUBBER_TOGGLE_DEFS.map((def) => (
              <div key={def.id} style={rowStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    data-testid={`scrubber-toggle-${def.id}`}
                    checked={settings.scrubbers[def.id] ?? true}
                    onChange={(e) =>
                      applyUpdate({
                        scrubbers: { ...settings.scrubbers, [def.id]: e.target.checked },
                      })
                    }
                  />
                  <span>{def.label}</span>
                </label>
              </div>
            ))}
          </fieldset>

          <fieldset style={sectionStyle}>
            <legend style={legendStyle}>Max ring-buffer size</legend>
            <p style={mutedStyle}>
              Console and network entries retained per capture ({MIN_RING_BUFFER_SIZE}–
              {MAX_RING_BUFFER_SIZE}).
            </p>
            <input
              type="number"
              data-testid="ring-buffer-size"
              min={MIN_RING_BUFFER_SIZE}
              max={MAX_RING_BUFFER_SIZE}
              value={ringText}
              onChange={(e) => {
                setRingText(e.target.value);
                const parsed = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(parsed)) {
                  applyUpdate({ maxRingBufferSize: parsed });
                }
              }}
            />
          </fieldset>

          <fieldset style={sectionStyle}>
            <legend style={legendStyle}>Blocked headers</legend>
            <p style={mutedStyle}>
              Header names whose values are masked in captured network data — one per line.
            </p>
            <textarea
              data-testid="blocked-headers"
              rows={5}
              style={{ width: '100%', fontFamily: 'monospace' }}
              value={headerText}
              onChange={(e) => {
                setHeaderText(e.target.value);
                applyUpdate({ blockedHeaders: parseHeaderLines(e.target.value) });
              }}
            />
          </fieldset>

          <fieldset style={sectionStyle}>
            <legend style={legendStyle}>Passive monitoring allowlist</legend>
            <p style={mutedStyle}>
              Origins where BugCase may passively buffer console/network activity before a capture.
            </p>
            {origins.length === 0 ? (
              <p style={mutedStyle}>No origins added yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
                {origins.map((origin) => (
                  <li key={origin} data-testid="allowlist-row" style={rowStyle}>
                    <span style={{ flex: 1 }}>{origin}</span>
                    <button
                      type="button"
                      data-testid="allowlist-remove"
                      onClick={() => {
                        void removeOne(origin).then(setOrigins);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={rowStyle}>
              <input
                type="url"
                data-testid="allowlist-add-input"
                placeholder="https://example.com"
                style={{ flex: 1 }}
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
              />
              <button type="button" data-testid="allowlist-add" onClick={handleAddOrigin}>
                Add
              </button>
            </div>
          </fieldset>

          <ReportHistory {...(loadHistory ? { loadHistory } : {})} />
        </>
      ) : (
        <p data-testid="options-loading">Loading settings…</p>
      )}
    </main>
  );
}
