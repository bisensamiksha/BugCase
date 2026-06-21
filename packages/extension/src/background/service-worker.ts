import { writeBugReportZip } from '@bugcase/schema';
import browser, { type Runtime } from 'webextension-polyfill';

import { captureVisibleViewport } from '../capture';
import { captureScreenshotWithStrategy } from '../capture/screenshot-strategy';
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
import { runScrollStitchCapture } from './scroll-stitch-runner';

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

/** Broadcast debugger attach/detach to the tab so the overlay can show its banner (best-effort). */
function bannerBroadcaster(tabId: number, hostName: string | undefined): (active: boolean) => void {
  return (active) => {
    const activity: DebuggerActivityMessage = {
      type: DEBUGGER_ACTIVITY,
      active,
      ...(hostName ? { hostName } : {}),
    };
    void browser.tabs.sendMessage(tabId, activity).catch(() => {
      // The overlay may not be listening; the banner broadcast is non-critical.
    });
  };
}

function handleCaptureReport(message: CaptureReportRequest, sender: Runtime.MessageSender) {
  // The screenshot is always a scroll-stitch full-page capture (with a viewport fallback). The
  // on-demand debugger attaches to the sending tab only for network response bodies — opt-in via a
  // stored flag set in the popup, and shown with a banner while active. Without a tab id, with the
  // opt-in off, or where chrome.debugger is unavailable (e.g. Firefox), the network step is skipped.
  const tabId = sender.tab?.id;
  const hostName = safeHost(message.metadata.page.origin);
  const { devicePixelRatio } = message.metadata.viewport;
  const onActiveChange = typeof tabId === 'number' ? bannerBroadcaster(tabId, hostName) : undefined;

  const captureScreenshot = () =>
    captureScreenshotWithStrategy({
      captureScrollStitch: () =>
        typeof tabId === 'number'
          ? runScrollStitchCapture(tabId, devicePixelRatio)
          : Promise.reject(new Error('no tab id for scroll-stitch capture')),
      captureViewport: () => captureVisibleViewport({ devicePixelRatio }),
    });

  const captureDebuggerNetwork =
    typeof tabId === 'number'
      ? () => runDebuggerNetworkCapture({ tabId }, onActiveChange ? { onActiveChange } : {})
      : undefined;

  return runCaptureFlow(
    { metadata: message.metadata, userInput: message.userInput },
    {
      captureScreenshot,
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
