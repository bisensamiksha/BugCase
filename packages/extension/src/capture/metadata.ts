import type {
  CaptureMetadata,
  PageMetadata,
  Permission,
  ScrubberRuleApplied,
  ToolMetadata,
  UserOptions,
  ViewportMetadata,
} from '@bugcase/schema';

import { detectBrowserBuildTarget } from './browser-target';

export interface MetadataInput {
  readonly tabId: number;
  readonly url: string;
  readonly title: string;
}

/** A snapshot of the ambient browser globals the collector needs. Injectable for tests. */
export interface MetadataSource {
  readonly userAgent: string;
  readonly brands?: readonly { readonly brand: string }[] | undefined;
  readonly isBrave?: (() => Promise<boolean>) | undefined;
  readonly language: string | null;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly devicePixelRatio: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly orientation: string | null;
  readonly referrer: string | null;
}

export interface CollectMetadataOptions {
  readonly source?: MetadataSource;
  /** Extension version; the caller should pass `runtime.getManifest().version`. */
  readonly toolVersion?: string;
  readonly now?: () => Date;
  readonly generateId?: () => string;
  readonly permissionsAtCapture?: readonly Permission[];
  readonly scrubbersApplied?: readonly ScrubberRuleApplied[];
  readonly userOptions?: UserOptions;
}

const FALLBACK_VERSION = '0.0.0';

/** Sprint-1 defaults: viewport screenshot + screen info on, everything else off. */
export const DEFAULT_USER_OPTIONS: UserOptions = {
  fullPageScreenshot: false,
  viewportScreenshot: true,
  domSnapshot: false,
  navigationHistory: false,
  consoleLogs: false,
  networkLog: false,
  browserInfo: false,
  screenInfo: true,
  installedExtensions: false,
  cookies: false,
  localStorage: false,
  sessionStorage: false,
  reproductionSteps: false,
  elementInspections: false,
};

function nonNegInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Rough zoom estimate from the window chrome ratio (per spec; refined in S2-19). */
function estimateZoom(source: MetadataSource): number {
  if (source.innerWidth > 0 && source.outerWidth > 0) {
    return positive(Math.round((source.outerWidth / source.innerWidth) * 100) / 100);
  }
  return 1;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

interface UADataLike {
  readonly brands?: readonly { readonly brand: string; readonly version: string }[];
}
interface BraveApi {
  readonly brave?: { readonly isBrave: () => Promise<boolean> };
}

/**
 * Read the ambient globals (navigator/window/screen/document). Safe in any context —
 * returns zeros/nulls where a global is missing (e.g. a service worker has no `window`).
 */
export function readMetadataSource(): MetadataSource {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const uaData = (nav as (Navigator & { userAgentData?: UADataLike }) | undefined)?.userAgentData;
  const brave = (nav as (Navigator & BraveApi) | undefined)?.brave;
  const win = typeof window === 'undefined' ? undefined : window;
  const scr = typeof screen === 'undefined' ? undefined : screen;
  const doc = typeof document === 'undefined' ? undefined : document;

  return {
    userAgent: nav?.userAgent ?? '',
    brands: uaData?.brands,
    isBrave: brave?.isBrave.bind(brave),
    language: nav?.language ?? null,
    innerWidth: win?.innerWidth ?? 0,
    innerHeight: win?.innerHeight ?? 0,
    outerWidth: win?.outerWidth ?? 0,
    outerHeight: win?.outerHeight ?? 0,
    devicePixelRatio: win?.devicePixelRatio ?? 1,
    screenWidth: scr?.width ?? 0,
    screenHeight: scr?.height ?? 0,
    orientation: scr?.orientation?.type ?? null,
    referrer: doc?.referrer ?? null,
  };
}

/**
 * Collect the `BugReportV1` capture metadata: page, viewport, tool, and the
 * permission/scrubber/user-option context. Runs in the page/overlay context where the
 * window and screen globals reflect the captured page (not the service worker).
 */
export async function collectCaptureMetadata(
  input: MetadataInput,
  options: CollectMetadataOptions = {},
): Promise<CaptureMetadata> {
  const source = options.source ?? readMetadataSource();
  const capturedAt = (options.now?.() ?? new Date()).toISOString();
  const id = options.generateId?.() ?? crypto.randomUUID();
  const version = options.toolVersion ?? FALLBACK_VERSION;

  const browserBuildTarget = await detectBrowserBuildTarget({
    userAgent: source.userAgent,
    brands: source.brands,
    isBrave: source.isBrave,
  });

  const page: PageMetadata = {
    url: input.url,
    title: input.title,
    origin: safeOrigin(input.url),
    capturedAt,
    referrer: source.referrer,
  };

  const viewport: ViewportMetadata = {
    innerWidth: nonNegInt(source.innerWidth),
    innerHeight: nonNegInt(source.innerHeight),
    outerWidth: nonNegInt(source.outerWidth),
    outerHeight: nonNegInt(source.outerHeight),
    devicePixelRatio: positive(source.devicePixelRatio),
    zoomEstimate: estimateZoom(source),
    screenWidth: nonNegInt(source.screenWidth),
    screenHeight: nonNegInt(source.screenHeight),
    orientation: source.orientation,
  };

  const tool: ToolMetadata = {
    name: 'bugcase',
    version,
    schemaVersion: 'v1',
    browserBuildTarget,
  };

  return {
    id,
    tool,
    page,
    viewport,
    permissionsAtCapture: options.permissionsAtCapture ?? [],
    scrubbersApplied: options.scrubbersApplied ?? [],
    userOptions: options.userOptions ?? DEFAULT_USER_OPTIONS,
  };
}
