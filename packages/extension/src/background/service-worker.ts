import { writeBugReportZip } from '@bugcase/schema';
import browser, { type Runtime } from 'webextension-polyfill';

import { captureVisibleViewport } from '../capture';
import { runDebuggerNetworkCapture } from '../debugger';

import { runCaptureFlow } from './capture-flow';
import { syncPassiveContentScripts } from './content-script-registration';
import { downloadBlob } from './downloads';
import {
  DEBUGGER_ACTIVITY,
  isCaptureReportRequest,
  isCaptureVisibleTabRequest,
  isOverlayInjectRequest,
  type CaptureReportRequest,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
  type DebuggerActivityMessage,
} from './messages';
import { handleOriginAllowlist, isOriginAllowlistRequest } from './origin-allowlist-handler';
import { createOverlayController } from './overlay-controller';
import { handleRequestPermissions, isRequestPermissionsRequest } from './permissions-handler';

const overlay = createOverlayController();

// Reconcile passive-monitoring content-script registrations with the allowlist. Registrations
// persist across service-worker restarts, so syncing on install and startup repairs any drift
// (e.g. the allowlist changed while the worker was asleep). Sync is error-safe and never throws.
browser.runtime.onInstalled.addListener(() => {
  console.info('[BugCase] installed');
  void syncPassiveContentScripts();
});

browser.runtime.onStartup.addListener(() => {
  void syncPassiveContentScripts();
});

async function handleCaptureRequest(
  message: CaptureVisibleTabRequest,
): Promise<CaptureVisibleTabResponse> {
  const capture = await captureVisibleViewport({
    windowId: message.windowId,
    devicePixelRatio: message.devicePixelRatio,
  });
  return {
    dataUrl: capture.dataUrl,
    width: capture.width,
    height: capture.height,
    devicePixelRatio: capture.devicePixelRatio,
    captureMethod: capture.captureMethod,
  };
}

function safeHost(origin: string): string | undefined {
  try {
    return new URL(origin).host || undefined;
  } catch {
    return undefined;
  }
}

function handleCaptureReport(message: CaptureReportRequest, sender: Runtime.MessageSender) {
  // The on-demand debugger attaches to the sending tab (needs a tab id). It is opt-in via a stored
  // flag set in the popup; runDebuggerNetworkCapture skips it (no banner, straight to download)
  // whenever the opt-in is off or chrome.debugger is unavailable (e.g. Firefox).
  const tabId = sender.tab?.id;
  const hostName = safeHost(message.metadata.page.origin);
  const captureDebuggerNetwork =
    typeof tabId === 'number'
      ? () =>
          runDebuggerNetworkCapture(
            { tabId },
            {
              // Broadcast attach/detach so the overlay can show the banner (best-effort).
              onActiveChange: (active) => {
                const activity: DebuggerActivityMessage = {
                  type: DEBUGGER_ACTIVITY,
                  active,
                  ...(hostName ? { hostName } : {}),
                };
                void browser.tabs.sendMessage(tabId, activity).catch(() => {
                  // The overlay may not be listening; the banner broadcast is non-critical.
                });
              },
            },
          )
      : undefined;

  return runCaptureFlow(
    { metadata: message.metadata, userInput: message.userInput },
    {
      captureScreenshot: () =>
        captureVisibleViewport({ devicePixelRatio: message.metadata.viewport.devicePixelRatio }),
      writeZip: writeBugReportZip,
      download: downloadBlob,
      ...(captureDebuggerNetwork ? { captureDebuggerNetwork } : {}),
    },
  );
}

browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  if (isCaptureVisibleTabRequest(message)) {
    return handleCaptureRequest(message);
  }
  if (isOverlayInjectRequest(message)) {
    return overlay.injectActiveTab();
  }
  if (isCaptureReportRequest(message)) {
    return handleCaptureReport(message, sender);
  }
  if (isRequestPermissionsRequest(message)) {
    return handleRequestPermissions(message);
  }
  if (isOriginAllowlistRequest(message)) {
    return handleOriginAllowlist(message).then(async (response) => {
      // A successful opt-in/opt-out changes which origins should be monitored, so re-register.
      if (response.ok && (message.action === 'add' || message.action === 'remove')) {
        await syncPassiveContentScripts();
      }
      return response;
    });
  }
  return undefined;
});
