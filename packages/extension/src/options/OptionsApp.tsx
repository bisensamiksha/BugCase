import type { UserOptions } from '@bugcase/schema';
import { useEffect, useState, type CSSProperties } from 'react';

import { OnboardingTour } from '../onboarding/OnboardingTour';
import { CaptureOptions } from '../overlay/CaptureOptions';
import {
  hasOptionalPermissions,
  type OptionalPermissionName,
} from '../permissions/optional-permissions';
import { getOnboardingSeen } from '../storage/onboarding';
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
  /** Whether the first-install tour has been seen; defaults to `getOnboardingSeen`. Injectable for tests. */
  readonly loadOnboardingSeen?: () => Promise<boolean>;
  /** Checks one optional permission; defaults to `permissions.contains`. Injectable for tests. */
  readonly checkPermission?: (permission: OptionalPermissionName) => Promise<boolean>;
}

/** The optional permissions that gate a capture option. */
const GATED_PERMISSIONS: readonly OptionalPermissionName[] = ['cookies', 'management', 'history'];

/**
 * Default permission check. `OptionsApp` is a privileged extension page, so — unlike the overlay,
 * a content script that has to bridge through the service worker — it can call `permissions.contains`
 * directly via `hasOptionalPermissions` (which already treats a rejection, or a synchronous throw off
 * an unguarded `browser.*` access, as "not granted"). Declared at module scope, not inline as the
 * prop default, so the reference stays stable across renders: an inline arrow default is a fresh
 * function every render, which would retrigger the `[checkPermission]` effect below forever.
 */
function checkPermissionDirect(permission: OptionalPermissionName): Promise<boolean> {
  return hasOptionalPermissions({ permissions: [permission] });
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
const footerLegalStyle: CSSProperties = {
  marginTop: '24px',
  paddingTop: '12px',
  borderTop: '1px solid #e2e8f0',
  fontSize: '12px',
  color: '#475569',
};

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
  loadOnboardingSeen,
  checkPermission = checkPermissionDirect,
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
  // First-install tour (S3-18): overlay it on first run, until it's completed or skipped.
  const [showTour, setShowTour] = useState(false);
  // Which gated permissions are actually granted right now (BUG-06 permission-grant reconcile).
  // Settings does NOT reconcile against this — it only feeds CaptureOptions so a still-ticked,
  // now-ungranted option renders the amber "permission revoked" label. The stored default is left
  // untouched, so re-granting the permission restores the behaviour with no re-ticking needed.
  const [grantedPermissions, setGrantedPermissions] = useState<
    ReadonlySet<OptionalPermissionName> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const runSeen = loadOnboardingSeen ?? (() => getOnboardingSeen());
    void runSeen()
      .then((seen) => {
        if (!cancelled) setShowTour(!seen);
      })
      .catch(() => {
        // A read failure shouldn't pop the tour unexpectedly; leave it hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [loadOnboardingSeen]);

  // Read which optional permissions are actually granted, so the amber revoked label can render
  // next to a still-ticked option. A rejected check counts as not granted (the safe direction) and
  // can never crash the page — checkPermission always returns a promise even when its underlying
  // browser.* access throws synchronously (the default wraps hasOptionalPermissions, which already
  // catches that internally).
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      GATED_PERMISSIONS.map((permission) =>
        checkPermission(permission)
          .then((granted) => ({ permission, granted }))
          .catch(() => ({ permission, granted: false })),
      ),
    ).then((results) => {
      if (!cancelled) {
        setGrantedPermissions(new Set(results.filter((r) => r.granted).map((r) => r.permission)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkPermission]);

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
      {showTour ? <OnboardingTour onComplete={() => setShowTour(false)} /> : null}
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
              {...(grantedPermissions ? { grantedPermissions } : {})}
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

      <footer data-testid="legal-footer" style={footerLegalStyle}>
        <a
          href="https://bisensamiksha.github.io/BugCase/legal/privacy-policy"
          target="_blank"
          rel="noreferrer"
        >
          Privacy Policy
        </a>
        {' · '}
        <a
          href="https://bisensamiksha.github.io/BugCase/legal/terms"
          target="_blank"
          rel="noreferrer"
        >
          Terms of Use
        </a>
        {' · '}
        <a href="https://github.com/bisensamiksha/BugCase" target="_blank" rel="noreferrer">
          Source
        </a>
      </footer>
    </main>
  );
}
