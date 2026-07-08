import type { AnnotationsManifest } from './annotation';
import type { BrowserInfo } from './browser';
import type { ConsoleLog } from './console';
import type { CookiesDump } from './cookies';
import type { DomSnapshot } from './dom';
import type { ElementInspectionsManifest } from './element-inspection';
import type { CaptureMetadata } from './metadata';
import type { NavigationLog } from './navigation';
import type { NetworkLog } from './network';
import type { ReproductionRecording } from './reproduction';
import type { ScreenshotsManifest } from './screenshots';
import type { StorageDump } from './storage';
import type { UserInput } from './user-input';

export interface BugReportV1 {
  readonly schemaVersion: 'v1';
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
  readonly screenshots: ScreenshotsManifest;
  readonly browser: BrowserInfo | null;
  readonly console: ConsoleLog | null;
  readonly network: NetworkLog | null;
  readonly dom: DomSnapshot | null;
  readonly storage: StorageDump | null;
  readonly cookies: CookiesDump | null;
  readonly navigation: NavigationLog | null;
  readonly reproduction: ReproductionRecording | null;
  readonly elementInspections: ElementInspectionsManifest | null;
  readonly annotations: AnnotationsManifest | null;
}
