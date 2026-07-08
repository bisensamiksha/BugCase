export interface AnnotationFile {
  readonly schemaVersion: 'v1';
  readonly screenshotPath: string;
  readonly konvaJson: string;
}

/**
 * All saved annotations in a report (S3-15) — one {@link AnnotationFile} per annotated screenshot.
 * Mirrors the reproduction/element-inspection manifests: a single, additively-versioned list a
 * consumer can read to find every annotation, alongside the per-screenshot `annotationsPath` flag.
 */
export interface AnnotationsManifest {
  readonly schemaVersion: 'v1';
  readonly annotations: readonly AnnotationFile[];
}
