import type { BrowserInfo, CaptureMetadata, UserInput } from '@bugcase/schema';

import {
  CAPTURE_REPORT,
  type CaptureReportRequest,
  type CaptureReportResponse,
} from '../background/messages';
import { collectBrowserInfo } from '../capture/browser-info';
import { collectCaptureMetadata, readMetadataSource } from '../capture/metadata';
import browser from '../lib/browser';

const DEFAULT_USER_INPUT: UserInput = {
  schemaVersion: 'v1',
  title: '',
  stepsToReproduce: '',
  severity: 'minor',
  notes: '',
};

export interface RequestCaptureDeps {
  /** Defaults to reading the live page DOM via the metadata collector. */
  readonly collectMetadata?: () => Promise<CaptureMetadata>;
  /** Defaults to reading navigator/UA-CH via the browser-info collector. */
  readonly collectBrowserInfo?: () => Promise<BrowserInfo>;
  /** Defaults to `browser.runtime.sendMessage`. */
  readonly send?: (message: CaptureReportRequest) => Promise<CaptureReportResponse>;
  readonly userInput?: UserInput;
}

/** Collect page metadata in the overlay context, then ask the service worker to run the capture flow. */
export async function requestCapture(
  deps: RequestCaptureDeps = {},
): Promise<CaptureReportResponse> {
  const collectMetadata = deps.collectMetadata ?? defaultCollectMetadata;
  const collectBrowser = deps.collectBrowserInfo ?? (() => collectBrowserInfo());
  const send = deps.send ?? defaultSend;

  const [metadata, browserInfo] = await Promise.all([collectMetadata(), collectBrowser()]);
  return send({
    type: CAPTURE_REPORT,
    metadata,
    userInput: deps.userInput ?? DEFAULT_USER_INPUT,
    browser: browserInfo,
  });
}

function defaultCollectMetadata(): Promise<CaptureMetadata> {
  return collectCaptureMetadata(
    { tabId: -1, url: window.location.href, title: document.title },
    { source: readMetadataSource(), toolVersion: browser.runtime.getManifest().version },
  );
}

function defaultSend(message: CaptureReportRequest): Promise<CaptureReportResponse> {
  return browser.runtime.sendMessage<CaptureReportRequest, CaptureReportResponse>(message);
}
