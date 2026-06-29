import type { BugReportV1 } from '@bugcase/schema';

/** Stable identifiers for every report artifact the preview lists and finalize can remove. */
export type ArtifactId =
  | 'screenshot'
  | 'userInput'
  | 'browser'
  | 'console'
  | 'network'
  | 'dom'
  | 'storage'
  | 'cookies'
  | 'navigation'
  | 'metadata'
  | 'reproduction'
  | 'elementInspections';

export interface ReportArtifact {
  readonly id: ArtifactId;
  readonly label: string;
  /** True when the section was collected (non-null) / the screenshot exists. */
  readonly present: boolean;
  /** Byte size: JSON byte length for sections, `assetSizes` for binary artifacts; 0 when absent. */
  readonly sizeBytes: number;
  readonly removable: boolean;
}

export interface ArtifactSource {
  readonly report: BugReportV1;
  /** Byte sizes for artifacts the report only references (screenshot PNG, DOM HTML). */
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
}

const LABELS: Record<ArtifactId, string> = {
  screenshot: 'Screenshot',
  userInput: 'Bug description',
  browser: 'Browser info',
  console: 'Console log',
  network: 'Network log',
  dom: 'DOM snapshot',
  storage: 'Local/session storage',
  cookies: 'Cookies',
  navigation: 'Navigation history',
  metadata: 'Capture metadata',
  reproduction: 'Reproduction recording',
  elementInspections: 'Element inspections',
};

/** Fixed display order. */
const ORDER: readonly ArtifactId[] = [
  'screenshot',
  'userInput',
  'browser',
  'console',
  'network',
  'dom',
  'storage',
  'cookies',
  'navigation',
  'metadata',
  'reproduction',
  'elementInspections',
];

/** Always part of the report's identity / the user's own text — never removable. */
const NON_REMOVABLE: ReadonlySet<ArtifactId> = new Set<ArtifactId>([
  'metadata',
  'userInput',
  'reproduction',
  'elementInspections',
]);

const encoder = new TextEncoder();

/** UTF-8 byte length of a value's JSON form; 0 for null/undefined. */
function jsonByteSize(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return encoder.encode(JSON.stringify(value)).length;
}

/** Human-readable byte size, e.g. 0 → "0 B", 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? 'GB'}`;
}

function screenshotPresent(report: BugReportV1): boolean {
  const s = report.screenshots;
  return Boolean(s.viewport ?? s.fullPage) || s.elementCrops.length > 0;
}

function presentSection(value: unknown): { present: boolean; sizeBytes: number } {
  const present = value !== null && value !== undefined;
  return { present, sizeBytes: present ? jsonByteSize(value) : 0 };
}

function describeArtifact(
  report: BugReportV1,
  id: ArtifactId,
  sizes: Partial<Record<ArtifactId, number>>,
): { present: boolean; sizeBytes: number } {
  switch (id) {
    case 'screenshot': {
      const present = screenshotPresent(report);
      return { present, sizeBytes: present ? (sizes.screenshot ?? 0) : 0 };
    }
    case 'dom': {
      const present = report.dom !== null;
      return { present, sizeBytes: present ? (sizes.dom ?? jsonByteSize(report.dom)) : 0 };
    }
    case 'userInput':
      return { present: true, sizeBytes: jsonByteSize(report.userInput) };
    case 'metadata':
      return { present: true, sizeBytes: jsonByteSize(report.metadata) };
    case 'browser':
      return presentSection(report.browser);
    case 'console':
      return presentSection(report.console);
    case 'network':
      return presentSection(report.network);
    case 'storage':
      return presentSection(report.storage);
    case 'cookies':
      return presentSection(report.cookies);
    case 'navigation':
      return presentSection(report.navigation);
    case 'reproduction':
      return presentSection(report.reproduction);
    case 'elementInspections':
      return presentSection(report.elementInspections);
  }
}

export function buildArtifactList({
  report,
  assetSizes,
}: ArtifactSource): readonly ReportArtifact[] {
  const sizes = assetSizes ?? {};
  return ORDER.map((id) => {
    const { present, sizeBytes } = describeArtifact(report, id, sizes);
    return {
      id,
      label: LABELS[id],
      present,
      sizeBytes,
      removable: present && !NON_REMOVABLE.has(id),
    };
  });
}
