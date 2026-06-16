import { writeBugReportZip } from '@bugcase/schema';
import browser from 'webextension-polyfill';

import { captureVisibleViewport } from '../capture';

import { runCaptureFlow } from './capture-flow';
import { downloadBlob } from './downloads';
import {
  isCaptureReportRequest,
  isCaptureVisibleTabRequest,
  isOverlayInjectRequest,
  type CaptureReportRequest,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
} from './messages';
import { handleOriginAllowlist, isOriginAllowlistRequest } from './origin-allowlist-handler';
import { createOverlayController } from './overlay-controller';
import { handleRequestPermissions, isRequestPermissionsRequest } from './permissions-handler';

const overlay = createOverlayController();

browser.runtime.onInstalled.addListener(() => {
  console.info('[BugCase] installed');
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

function handleCaptureReport(message: CaptureReportRequest) {
  return runCaptureFlow(
    { metadata: message.metadata, userInput: message.userInput },
    {
      captureScreenshot: () =>
        captureVisibleViewport({ devicePixelRatio: message.metadata.viewport.devicePixelRatio }),
      writeZip: writeBugReportZip,
      download: downloadBlob,
    },
  );
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isCaptureVisibleTabRequest(message)) {
    return handleCaptureRequest(message);
  }
  if (isOverlayInjectRequest(message)) {
    return overlay.injectActiveTab();
  }
  if (isCaptureReportRequest(message)) {
    return handleCaptureReport(message);
  }
  if (isRequestPermissionsRequest(message)) {
    return handleRequestPermissions(message);
  }
  if (isOriginAllowlistRequest(message)) {
    return handleOriginAllowlist(message);
  }
  return undefined;
});
