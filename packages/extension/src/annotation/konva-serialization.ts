import { BUG_REPORT_ZIP_LAYOUT, type AnnotationFile } from '@bugcase/schema';

/** Wrap a Konva stage's serialized JSON as the schema's {@link AnnotationFile}, written into the ZIP. */
export function buildAnnotationFile(screenshotPath: string, konvaJson: string): AnnotationFile {
  return { schemaVersion: 'v1', screenshotPath, konvaJson };
}

/**
 * The ZIP path for a screenshot's saved annotations, e.g.
 * `screenshots/viewport.png` → `annotations/viewport.konva.json`.
 */
export function annotationFilePath(screenshotPath: string): string {
  const base = (screenshotPath.split('/').pop() ?? screenshotPath).replace(/\.[^.]+$/, '');
  return `${BUG_REPORT_ZIP_LAYOUT.annotations.dir}/${base}.konva.json`;
}
