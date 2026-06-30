import type { BugReportV1 } from '@bugcase/schema';

import type { ArtifactId } from './artifact-list';

/** JSON-backed artifacts that open in the JSON tree viewer (everything except screenshot + dom). */
export const JSON_VIEWABLE_IDS: ReadonlySet<ArtifactId> = new Set<ArtifactId>([
  'userInput',
  'browser',
  'console',
  'network',
  'storage',
  'cookies',
  'navigation',
  'metadata',
  'reproduction',
  'elementInspections',
]);

export function isJsonViewable(id: ArtifactId): boolean {
  return JSON_VIEWABLE_IDS.has(id);
}

/** The report's JSON value for a viewable id; `undefined` for non-JSON ids (screenshot, dom). */
export function selectArtifactJson(report: BugReportV1, id: ArtifactId): unknown {
  switch (id) {
    case 'metadata':
      return report.metadata;
    case 'userInput':
      return report.userInput;
    case 'browser':
      return report.browser;
    case 'console':
      return report.console;
    case 'network':
      return report.network;
    case 'storage':
      return report.storage;
    case 'cookies':
      return report.cookies;
    case 'navigation':
      return report.navigation;
    case 'reproduction':
      return report.reproduction;
    case 'elementInspections':
      return report.elementInspections;
    default:
      return undefined;
  }
}
