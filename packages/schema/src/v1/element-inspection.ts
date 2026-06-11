export interface BoundingClientRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ElementAncestor {
  readonly tag: string;
  readonly id: string | null;
  readonly classes: readonly string[];
}

export interface ElementInspection {
  readonly id: string;
  readonly outerHtml: string;
  readonly computedStyles: Readonly<Record<string, string>>;
  readonly boundingClientRect: BoundingClientRect;
  readonly ancestors: readonly ElementAncestor[];
  readonly screenshotCropPath: string;
}

export interface ElementInspectionsManifest {
  readonly schemaVersion: 'v1';
  readonly inspections: readonly ElementInspection[];
}
