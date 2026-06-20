import { useEffect, useMemo, useState } from 'react';

import { getDebuggerCaptureSettings, setDebuggerCaptureEnabled } from '../debugger/config';

export interface DebuggerCapturePrefProps {
  /** Reads the current opt-in flag; defaults to stored settings. Injectable for tests. */
  readonly getEnabled?: () => Promise<boolean>;
  /** Persists the opt-in flag; defaults to stored settings. Injectable for tests. */
  readonly setEnabled?: (enabled: boolean) => Promise<void>;
}

/**
 * Popup control for the opt-in `chrome.debugger` network capture.
 *
 * `debugger` is a required permission (Chrome forbids requesting it at runtime), so the opt-in is a
 * stored flag — toggling it just writes `chrome.storage` (no permission prompt). The capture flow
 * attaches the debugger and shows a banner only while this is on; default off.
 */
export function DebuggerCapturePref({ getEnabled, setEnabled }: DebuggerCapturePrefProps) {
  const getFn = useMemo(
    () => getEnabled ?? (async () => (await getDebuggerCaptureSettings()).enabled),
    [getEnabled],
  );
  const setFn = useMemo(
    () => setEnabled ?? ((value: boolean) => setDebuggerCaptureEnabled(value)),
    [setEnabled],
  );

  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFn()
      .then((value) => {
        if (!cancelled) {
          setEnabledState(value);
        }
      })
      .catch(() => {
        // A failed read just leaves the toggle off.
      });
    return () => {
      cancelled = true;
    };
  }, [getFn]);

  function handleToggle(): void {
    const next = !enabled;
    setEnabledState(next); // optimistic — storage writes are fast and never throw
    setBusy(true);
    void setFn(next)
      .catch(() => {
        // setDebuggerCaptureEnabled is best-effort; nothing to surface.
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-3 text-sm text-slate-700">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          data-testid="debugger-capture-pref"
          checked={enabled}
          disabled={busy}
          onChange={handleToggle}
        />
        <span>Capture network response bodies (uses the browser debugger)</span>
      </label>
      <p className="ml-6 mt-1 text-xs text-slate-500">
        Attaches Chrome&apos;s debugger only during capture and shows a banner the whole time.
      </p>
    </div>
  );
}
