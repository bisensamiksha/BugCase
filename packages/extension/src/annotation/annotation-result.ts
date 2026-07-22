import type { Annotation } from './tools';

/**
 * What the annotation canvas hands back on Done. Defined in its own module (no Konva import) so the
 * overlay graph can reference the result type without pulling in the Konva runtime (TD-03).
 *
 * `shapes` is the app's own editable annotation model (BUG-02) — carried back so Re-annotate can reload
 * the exact marks and the user can move/delete individual ones (Konva's `konvaJson` serialization is for
 * the ZIP, not re-editing). `Annotation` is imported type-only, so this stays Konva-free.
 */
export interface AnnotationResult {
  readonly konvaJson: string;
  readonly pngDataUrl: string;
  readonly shapes: readonly Annotation[];
}
