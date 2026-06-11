import type { IsoTimestamp, Permission, ScrubberRuleApplied } from './common';

export interface PageMetadata {
  readonly url: string;
  readonly title: string;
  readonly origin: string;
  readonly capturedAt: IsoTimestamp;
  readonly referrer: string | null;
}

export interface ViewportMetadata {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly devicePixelRatio: number;
  readonly zoomEstimate: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly orientation: string | null;
}

export interface ToolMetadata {
  readonly name: 'bugcase';
  readonly version: string;
  readonly schemaVersion: 'v1';
  readonly browserBuildTarget: 'chrome' | 'firefox' | 'edge' | 'brave' | 'unknown';
}

export interface UserOptions {
  readonly fullPageScreenshot: boolean;
  readonly viewportScreenshot: boolean;
  readonly domSnapshot: boolean;
  readonly navigationHistory: boolean;
  readonly consoleLogs: boolean;
  readonly networkLog: boolean;
  readonly browserInfo: boolean;
  readonly screenInfo: boolean;
  readonly installedExtensions: boolean;
  readonly cookies: boolean;
  readonly localStorage: boolean;
  readonly sessionStorage: boolean;
  readonly reproductionSteps: boolean;
  readonly elementInspections: boolean;
}

export interface CaptureMetadata {
  readonly id: string;
  readonly tool: ToolMetadata;
  readonly page: PageMetadata;
  readonly viewport: ViewportMetadata;
  readonly permissionsAtCapture: readonly Permission[];
  readonly scrubbersApplied: readonly ScrubberRuleApplied[];
  readonly userOptions: UserOptions;
}
