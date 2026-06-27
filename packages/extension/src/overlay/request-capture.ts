import type { BrowserInfo, CaptureMetadata, UserInput, UserOptions } from '@bugcase/schema';

import {
  CAPTURE_REPORT,
  type CaptureReportRequest,
  type CaptureReportResponse,
} from '../background/messages';
import { collectBrowserInfo } from '../capture/browser-info';
import { collectCaptureMetadata, readMetadataSource } from '../capture/metadata';
import browser from '../lib/browser';

import { USER_REPORT_DEFAULTS } from './user-report-state';

export interface RequestCaptureDeps {
  /** Defaults to reading the live page DOM via the metadata collector. */
  readonly collectMetadata?: (userOptions?: UserOptions) => Promise<CaptureMetadata>;
  /** Defaults to reading navigator/UA-CH via the browser-info collector. */
  readonly collectBrowserInfo?: () => Promise<BrowserInfo>;
  /** Defaults to `browser.runtime.sendMessage`. */
  readonly send?: (message: CaptureReportRequest) => Promise<CaptureReportResponse>;
  readonly userInput?: UserInput;
  /** Capture options selected in the overlay; recorded as `metadata.userOptions`. */
  readonly userOptions?: UserOptions;
}

/** Collect page metadata in the overlay context, then ask the service worker to run the capture flow. */
export async function requestCapture(
  deps: RequestCaptureDeps = {},
): Promise<CaptureReportResponse> {
  const collectMetadata = deps.collectMetadata ?? defaultCollectMetadata;
  const collectBrowser = deps.collectBrowserInfo ?? (() => collectBrowserInfo());
  const send = deps.send ?? defaultSend;

  const [metadata, browserInfo] = await Promise.all([
    collectMetadata(deps.userOptions),
    collectBrowser(),
  ]);
  return send({
    type: CAPTURE_REPORT,
    metadata,
    userInput: deps.userInput ?? USER_REPORT_DEFAULTS,
    browser: browserInfo,
  });
}

function defaultCollectMetadata(userOptions?: UserOptions): Promise<CaptureMetadata> {
  return collectCaptureMetadata(
    { tabId: -1, url: window.location.href, title: document.title },
    {
      source: readMetadataSource(),
      toolVersion: browser.runtime.getManifest().version,
      ...(userOptions ? { userOptions } : {}),
    },
  );
}

function defaultSend(message: CaptureReportRequest): Promise<CaptureReportResponse> {
  return browser.runtime.sendMessage<CaptureReportRequest, CaptureReportResponse>(message);
}
