export type ScreenshotCaptureMethod = 'visibleTab' | 'cdpFullPage' | 'scrollStitch';

export interface ScreenshotRef {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly captureMethod: ScreenshotCaptureMethod;
  readonly hasAnnotations: boolean;
  readonly annotationsPath?: string;
}

export interface ScreenshotsManifest {
  readonly schemaVersion: 'v1';
  readonly viewport?: ScreenshotRef;
  readonly fullPage?: ScreenshotRef;
  readonly elementCrops: readonly ScreenshotRef[];
}
