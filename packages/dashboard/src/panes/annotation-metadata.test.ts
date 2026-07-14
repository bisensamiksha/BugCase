import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  annotationSummaryFor,
  formatAnnotationSummary,
  summarizeKonva,
} from './annotation-metadata';

const stage = (children: unknown) => JSON.stringify({ attrs: {}, className: 'Stage', children });
const layer = (children: unknown) => ({ attrs: {}, className: 'Layer', children });
const shape = (className: string) => ({ attrs: {}, className });

describe('summarizeKonva', () => {
  it('counts leaf shapes by className, descending into layers and groups', () => {
    const json = stage([
      layer([
        shape('Rect'),
        shape('Rect'),
        shape('Arrow'),
        { attrs: {}, className: 'Group', children: [shape('Line')] },
      ]),
    ]);
    expect(summarizeKonva(json)).toEqual({ total: 4, byKind: { Rect: 2, Arrow: 1, Line: 1 } });
  });

  it('returns null for malformed JSON', () => {
    expect(summarizeKonva('{not json')).toBeNull();
  });

  it('returns null for JSON that is not a konva stage object', () => {
    expect(summarizeKonva('42')).toBeNull();
    expect(summarizeKonva('"x"')).toBeNull();
  });

  it('returns null when there are no shapes', () => {
    expect(summarizeKonva(stage([layer([])]))).toBeNull();
    expect(summarizeKonva('{"attrs":{}}')).toBeNull();
  });
});

describe('annotationSummaryFor', () => {
  const report = {
    annotations: {
      schemaVersion: 'v1',
      annotations: [
        {
          schemaVersion: 'v1',
          screenshotPath: 'screenshots/viewport.png',
          konvaJson: stage([layer([shape('Rect')])]),
        },
      ],
    },
  } as unknown as BugReportV1;

  it('summarizes the matching screenshot annotation', () => {
    expect(annotationSummaryFor(report, 'screenshots/viewport.png')).toEqual({
      total: 1,
      byKind: { Rect: 1 },
    });
  });

  it('returns null when no annotation matches the path', () => {
    expect(annotationSummaryFor(report, 'screenshots/full.png')).toBeNull();
  });

  it('returns null when the report has no annotations manifest', () => {
    const none = { annotations: null } as unknown as BugReportV1;
    expect(annotationSummaryFor(none, 'screenshots/viewport.png')).toBeNull();
  });
});

describe('formatAnnotationSummary', () => {
  it('pluralizes and orders by count then name', () => {
    expect(formatAnnotationSummary({ total: 4, byKind: { Rect: 2, Arrow: 1, Line: 1 } })).toBe(
      '4 annotations · 2 rectangles, 1 arrow, 1 line',
    );
  });

  it('uses the singular noun for a single annotation', () => {
    expect(formatAnnotationSummary({ total: 1, byKind: { Rect: 1 } })).toBe(
      '1 annotation · 1 rectangle',
    );
  });

  it('falls back to a lowercased className for unknown shapes', () => {
    expect(formatAnnotationSummary({ total: 2, byKind: { Star: 2 } })).toBe(
      '2 annotations · 2 stars',
    );
  });
});
