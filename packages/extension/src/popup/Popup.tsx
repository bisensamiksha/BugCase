import { OVERLAY_INJECT, type OverlayInjectRequest } from '../background/messages';
import browser from '../lib/browser';

import { DebuggerCapturePref } from './DebuggerCapturePref';
import { PermissionGrants } from './PermissionGrants';

function openOverlay(): void {
  // Fire-and-forget: the service worker resolves the active tab and injects the overlay there.
  void browser.runtime.sendMessage({ type: OVERLAY_INJECT } satisfies OverlayInjectRequest);
}

export function Popup() {
  const { name, version } = browser.runtime.getManifest();

  return (
    <main className="w-80 p-4 font-sans">
      <h1 className="rounded bg-blue-500 px-2 py-1 text-lg font-bold text-white">
        Bug Reporter — ready
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {name} v{version}
      </p>
      <button
        type="button"
        data-testid="open-overlay"
        onClick={openOverlay}
        className="mt-3 w-full rounded bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"
      >
        Open overlay
      </button>
      <PermissionGrants />
      <DebuggerCapturePref />
    </main>
  );
}
