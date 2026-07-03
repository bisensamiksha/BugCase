import { writeBugReportZip } from '@bugcase/schema';
import browser, { type Runtime } from 'webextension-polyfill';

import { captureVisibleViewport } from '../capture';
import { collectDomSnapshot } from '../capture/dom-snapshot';
import { collectPageStorage } from '../capture/page-storage';
import { captureScreenshotWithStrategy } from '../capture/screenshot-strategy';
import { readDomOuterHtml } from '../content/dom-snapshot-runner';
import { runDebuggerNetworkCapture } from '../debugger';
import { readPageStorage, type RawPageStorage } from '../injected/storage-reader';

import { buildAnnotationExport } from './annotation-finalize';
import { captureReport, finalizeReport } from './capture-flow';
import { syncPassiveContentScripts } from './content-script-registration';
import { createCookiesCollector } from './cookies-handler';
import { downloadBlob } from './downloads';
import { createNavigationHistoryCollector } from './history-handler';
import { createInstalledExtensionsCollector } from './management-handler';
import {
  DEBUGGER_ACTIVITY,
  KEEPALIVE_PORT_NAME,
  finalizeResponseFrom,
  isCaptureReportRequest,
  isCaptureVisibleTabRequest,
  isFinalizeReportRequest,
  isOverlayInjectRequest,
  isPeekReportAssetRequest,
  type CaptureReportRequest,
  type CaptureReportResponse,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
  type DebuggerActivityMessage,
  type FinalizeReportRequest,
  type FinalizeReportResponse,
} from './messages';
import { handleOriginAllowlist, isOriginAllowlistRequest } from './origin-allowlist-handler';
import { createOverlayController } from './overlay-controller';
import {
  handleContainsPermissions,
  handleRequestPermissions,
  isContainsPermissionsRequest,
  isRequestPermissionsRequest,
} from './permissions-handler';
import { handlePeekReportAsset } from './report-asset-handler';
import { createReportHold } from './report-hold';
import { runScrollStitchCapture } from './scroll-stitch-runner';

const overlay = createOverlayController();

// Holds the assembled report + assets between CAPTURE_REPORT (assemble) and FINALIZE_REPORT
// (ZIP + download), keyed by reportId. The worker may be evicted between the two; a missing
// reportId is reported as `expired` so the overlay can offer a re-capture.
const reportHold = createReportHold();

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

// The overlay opens a keepalive port while it holds a report for preview/annotation. Accepting the
// connection and its pings resets the worker's idle timer, so a long annotation session doesn't
// evict the in-memory reportHold (which the user would otherwise hit as an "expired" download).
browser.runtime.onConnect.addListener((port) => {
  if (port.name === KEEPALIVE_PORT_NAME) {
    // The connection + messages are what keep the worker alive; nothing else to do on receipt.
    port.onMessage.addListener(() => {});
  }
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

  // Read the page's outerHTML in-page (executeScript), then scrub + package it as report.dom.
  const collectDom =
    typeof tabId === 'number'
      ? () =>
          collectDomSnapshot({
            readOuterHtml: async () => {
              const [injection] = await browser.scripting.executeScript({
                target: { tabId },
                func: readDomOuterHtml,
              });
              const html: unknown = injection?.result;
              return typeof html === 'string' ? html : '';
            },
          })
      : undefined;

  // Local/session storage (S2-18): read in the page (executeScript, MAIN world), then mask +
  // bound it into report.storage. Gated only on a tab id — same access level as the DOM snapshot.
  const collectStorage =
    typeof tabId === 'number'
      ? () =>
          collectPageStorage({
            readStorage: async () => {
              const [injection] = await browser.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: readPageStorage,
              });
              const result = injection?.result as RawPageStorage | undefined;
              return result ?? { localStorage: null, sessionStorage: null };
            },
          })
      : undefined;

  // Navigation history (S2-15): collected only if the optional `history` permission is granted.
  const collectNavigation = createNavigationHistoryCollector();

  // Installed extensions (S2-16): collected only if the optional `management` permission is granted.
  const collectExtensions = createInstalledExtensionsCollector();

  // Cookies (S2-17): the captured origin's cookies, collected only if the optional `cookies`
  // permission is granted. Scoped to the page url and value-masked inside the collector.
  const collectCookies = createCookiesCollector();

  return captureAndHold(message, {
    captureScreenshot,
    ...(captureDebuggerNetwork ? { captureDebuggerNetwork } : {}),
    ...(collectDom ? { collectDom } : {}),
    ...(collectStorage ? { collectStorage } : {}),
    collectNavigation,
    collectExtensions,
    collectCookies,
  });
}

/** Assemble the report, hold it under a reportId, and return the JSON report (no download yet). */
async function captureAndHold(
  message: CaptureReportRequest,
  deps: Parameters<typeof captureReport>[1],
): Promise<CaptureReportResponse> {
  const captured = await captureReport(
    {
      metadata: message.metadata,
      userInput: message.userInput,
      browser: message.browser,
      console: message.console ?? null,
      network: message.network ?? null,
    },
    deps,
  );
  if (!captured.ok || !captured.report || !captured.assets) {
    return { ok: false, ...(captured.reason ? { reason: captured.reason } : {}) };
  }
  const reportId = reportHold.put({ report: captured.report, assets: captured.assets });
  return {
    ok: true,
    reportId,
    report: captured.report,
    ...(captured.assetSizes ? { assetSizes: captured.assetSizes } : {}),
  };
}

/** ZIP + download a held report minus the removed artifacts; `expired` if the hold is gone. */
async function handleFinalizeReport(
  message: FinalizeReportRequest,
): Promise<FinalizeReportResponse> {
  const held = reportHold.take(message.reportId);
  if (!held) {
    return { ok: false, reason: 'expired' };
  }
  const annotation = message.annotation
    ? (buildAnnotationExport(held.report, message.annotation) ?? undefined)
    : undefined;
  const result = await finalizeReport(
    held.report,
    held.assets,
    message.removedIds,
    { writeZip: writeBugReportZip, download: downloadBlob },
    annotation,
  );
  return finalizeResponseFrom(result);
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
  if (isFinalizeReportRequest(message)) {
    return handleFinalizeReport(message);
  }
  if (isPeekReportAssetRequest(message)) {
    return handlePeekReportAsset(message, { peek: (id) => reportHold.peek(id) });
  }
  if (isRequestPermissionsRequest(message)) {
    return handleRequestPermissions(message);
  }
  if (isContainsPermissionsRequest(message)) {
    return handleContainsPermissions(message);
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
