import type {
  BrowserInfo,
  CaptureMetadata,
  ConsoleLog,
  NetworkLog,
  ReproductionRecording,
  ScrubberRuleApplied,
  UserInput,
  UserOptions,
} from '@bugcase/schema';

import {
  CAPTURE_REPORT,
  FINALIZE_REPORT,
  PEEK_REPORT_ASSET,
  type CaptureReportRequest,
  type CaptureReportResponse,
  type FinalizeAnnotationPayload,
  type FinalizeReportRequest,
  type FinalizeReportResponse,
  type PeekReportAssetRequest,
  type PeekReportAssetResponse,
} from '../background/messages';
import { collectBrowserInfo } from '../capture/browser-info';
import { toConsoleLog } from '../capture/console-log';
import { collectCaptureMetadata, readMetadataSource } from '../capture/metadata';
import { toNetworkLog } from '../capture/network-log';
import { createPageBridge } from '../content/page-bridge';
import { DEFAULT_CONSOLE_BUFFER_SIZE } from '../injected/console-ring-buffer';
import browser from '../lib/browser';
import type { ArtifactId } from '../preview/artifact-list';
import type { FlushChannel } from '../shared/bridge-protocol';

import { USER_REPORT_DEFAULTS } from './user-report-state';

/** Pulls a ring-buffer channel's raw entries out of the MAIN world over the page bridge. */
export type FlushChannelFn = (channel: FlushChannel) => Promise<readonly unknown[]>;

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
  /** Flushes a ring-buffer channel across the page bridge; defaults to a real page-bridge flush. */
  readonly flushChannel?: FlushChannelFn;
  /**
   * A completed reproduction recording (S3-12), already assembled by the overlay from the durable
   * service-worker session; recorded as `report.reproduction` when present.
   */
  readonly reproduction?: ReproductionRecording | null;
}

interface RingBufferLogs {
  readonly console: ConsoleLog | null;
  readonly network: NetworkLog | null;
  /** Network header scrubber hits, to merge into `metadata.scrubbersApplied`. */
  readonly scrubbersApplied: readonly ScrubberRuleApplied[];
}

/**
 * Flush the console/network ring buffers (only the channels the user enabled), map them to schema
 * logs, and scrub network headers. Buffers exist only on passive-monitoring origins; elsewhere the
 * bridge flush resolves `[]`, yielding empty logs rather than an error.
 */
async function collectRingBufferLogs(
  userOptions: UserOptions | undefined,
  flush: FlushChannelFn,
): Promise<RingBufferLogs> {
  const wantConsole = userOptions?.consoleLogs === true;
  const wantNetwork = userOptions?.networkLog === true;
  if (!wantConsole && !wantNetwork) {
    return { console: null, network: null, scrubbersApplied: [] };
  }
  const [rawConsole, rawNetwork] = await Promise.all([
    wantConsole ? flush('console') : Promise.resolve<readonly unknown[]>([]),
    wantNetwork ? flush('network') : Promise.resolve<readonly unknown[]>([]),
  ]);
  const network = wantNetwork ? toNetworkLog(rawNetwork) : null;
  return {
    console: wantConsole
      ? toConsoleLog(rawConsole, { bufferSize: DEFAULT_CONSOLE_BUFFER_SIZE })
      : null,
    network: network?.log ?? null,
    scrubbersApplied: network?.scrubbersApplied ?? [],
  };
}

/**
 * Resolve the flush function for a single capture. Both ring-buffer channels (console/network) share
 * ONE page bridge, so they share ONE verifier token — the MAIN-world client pins the first
 * flush-request's token, and a per-channel bridge would have its later flushes rejected.
 */
function resolveFlush(injected?: FlushChannelFn): { flush: FlushChannelFn; dispose: () => void } {
  if (injected) {
    return { flush: injected, dispose: () => {} };
  }
  if (typeof window === 'undefined') {
    return { flush: () => Promise.resolve([]), dispose: () => {} };
  }
  const bridge = createPageBridge(window);
  return { flush: (channel) => bridge.flush(channel), dispose: () => bridge.dispose() };
}

/** Collect page metadata in the overlay context, then ask the service worker to run the capture flow. */
export async function requestCapture(
  deps: RequestCaptureDeps = {},
): Promise<CaptureReportResponse> {
  const collectMetadata = deps.collectMetadata ?? defaultCollectMetadata;
  const collectBrowser = deps.collectBrowserInfo ?? (() => collectBrowserInfo());
  const send = deps.send ?? defaultSend;
  const { flush, dispose } = resolveFlush(deps.flushChannel);

  try {
    const [metadata, browserInfo, rings] = await Promise.all([
      collectMetadata(deps.userOptions),
      collectBrowser(),
      collectRingBufferLogs(deps.userOptions, flush),
    ]);

    // Network header scrubbing happens during mapping; surface its hits in the report's scrub summary.
    const finalMetadata =
      rings.scrubbersApplied.length > 0
        ? {
            ...metadata,
            scrubbersApplied: [...metadata.scrubbersApplied, ...rings.scrubbersApplied],
          }
        : metadata;

    return await send({
      type: CAPTURE_REPORT,
      metadata: finalMetadata,
      userInput: deps.userInput ?? USER_REPORT_DEFAULTS,
      browser: browserInfo,
      console: rings.console,
      network: rings.network,
      ...(deps.reproduction ? { reproduction: deps.reproduction } : {}),
    });
  } finally {
    dispose();
  }
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

/** Sends a FINALIZE_REPORT message; defaults to the real runtime bridge. */
export type FinalizeSendFn = (message: FinalizeReportRequest) => Promise<FinalizeReportResponse>;

function defaultFinalizeSend(message: FinalizeReportRequest): Promise<FinalizeReportResponse> {
  return browser.runtime.sendMessage<FinalizeReportRequest, FinalizeReportResponse>(message);
}

/** Ask the service worker to ZIP + download a held report, minus the removed artifacts. */
export function requestFinalize(
  reportId: string,
  removedIds: readonly ArtifactId[],
  annotation?: FinalizeAnnotationPayload,
  send: FinalizeSendFn = defaultFinalizeSend,
): Promise<FinalizeReportResponse> {
  return send({
    type: FINALIZE_REPORT,
    reportId,
    removedIds,
    ...(annotation ? { annotation } : {}),
  });
}

/** Sends a PEEK_REPORT_ASSET message; defaults to the real runtime bridge. */
export type PeekSendFn = (message: PeekReportAssetRequest) => Promise<PeekReportAssetResponse>;

function defaultPeekSend(message: PeekReportAssetRequest): Promise<PeekReportAssetResponse> {
  return browser.runtime.sendMessage<PeekReportAssetRequest, PeekReportAssetResponse>(message);
}

/** Ask the service worker for a held report's asset (by ZIP path) as a data URL. */
export function requestPeekAsset(
  reportId: string,
  path: string,
  send: PeekSendFn = defaultPeekSend,
): Promise<PeekReportAssetResponse> {
  return send({ type: PEEK_REPORT_ASSET, reportId, path });
}
