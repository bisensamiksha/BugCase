import type { BugReportV1 } from '@bugcase/schema';

/**
 * Pure, additive-display helpers for annotation metadata (S4-06). Annotations are already baked into
 * the screenshot PNG (S3-10); these derive a textual shape summary from the saved Konva JSON so the
 * Screenshots pane can show "3 annotations · 2 rectangles, 1 arrow" alongside the image. Never used to
 * reconstruct, peel, or redraw anything — text only. Every function tolerates malformed input.
 */

export interface KonvaShapeSummary {
  readonly total: number;
  readonly byKind: Readonly<Record<string, number>>;
}

/** Konva container node classNames: descend into their children but do not count them as shapes. */
const CONTAINER_CLASSES = new Set(['Stage', 'Layer', 'FastLayer', 'Group']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function countShapes(node: unknown, counts: Map<string, number>): void {
  if (!isRecord(node)) {
    return;
  }
  const className = typeof node.className === 'string' ? node.className : undefined;
  const children = Array.isArray(node.children) ? node.children : null;
  const isContainer =
    (className !== undefined && CONTAINER_CLASSES.has(className)) || children !== null;
  if (isContainer) {
    for (const child of children ?? []) {
      countShapes(child, counts);
    }
    return;
  }
  if (className !== undefined) {
    counts.set(className, (counts.get(className) ?? 0) + 1);
  }
}

/** Parse a Konva `Stage.toJSON()` string into a shape-count summary; null on malformed/empty input. */
export function summarizeKonva(konvaJson: string): KonvaShapeSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(konvaJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const counts = new Map<string, number>();
  countShapes(parsed, counts);
  let total = 0;
  const byKind: Record<string, number> = {};
  for (const [kind, n] of counts) {
    byKind[kind] = n;
    total += n;
  }
  return total > 0 ? { total, byKind } : null;
}

/** Find `report.annotations` for `path` and summarize its Konva JSON; null when absent/malformed. */
export function annotationSummaryFor(report: BugReportV1, path: string): KonvaShapeSummary | null {
  const entry = report.annotations?.annotations.find((a) => a.screenshotPath === path);
  return entry ? summarizeKonva(entry.konvaJson) : null;
}

/** Singular/plural labels for the shapes the annotation toolbar can produce. */
const SHAPE_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  Rect: ['rectangle', 'rectangles'],
  Arrow: ['arrow', 'arrows'],
  Line: ['line', 'lines'],
  Ellipse: ['ellipse', 'ellipses'],
  Circle: ['circle', 'circles'],
  Text: ['text', 'texts'],
  Path: ['path', 'paths'],
};

function shapeLabel(kind: string, n: number): string {
  const pair = SHAPE_LABELS[kind];
  if (pair) {
    return `${n} ${n === 1 ? pair[0] : pair[1]}`;
  }
  const base = kind.toLowerCase();
  return `${n} ${base}${n === 1 ? '' : 's'}`;
}

/** Human line, e.g. "3 annotations · 2 rectangles, 1 arrow". Order: count desc, then className. */
export function formatAnnotationSummary(summary: KonvaShapeSummary): string {
  const parts = Object.entries(summary.byKind)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => shapeLabel(kind, n));
  const noun = summary.total === 1 ? 'annotation' : 'annotations';
  return `${summary.total} ${noun} · ${parts.join(', ')}`;
}
