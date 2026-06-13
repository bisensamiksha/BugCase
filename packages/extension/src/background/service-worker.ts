import browser from 'webextension-polyfill';

import { captureVisibleViewport } from '../capture';

import {
  isCaptureVisibleTabRequest,
  isOverlayInjectRequest,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
} from './messages';
import { createOverlayController } from './overlay-controller';

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

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isCaptureVisibleTabRequest(message)) {
    return handleCaptureRequest(message);
  }
  if (isOverlayInjectRequest(message)) {
    return overlay.injectActiveTab();
  }
  return undefined;
});
