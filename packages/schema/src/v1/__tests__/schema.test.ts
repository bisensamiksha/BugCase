import { describe, expect, it } from 'vitest';

import { AnnotationFileSchema, AnnotationsManifestSchema } from '../schemas/annotation.schema';
import { ElementInspectionsManifestSchema } from '../schemas/element-inspection.schema';
import { BugReportV1Schema } from '../schemas/report.schema';
import { ReproductionRecordingSchema } from '../schemas/reproduction.schema';

import { validMinimal } from './fixtures/valid-minimal';

const validReproduction = {
  schemaVersion: 'v1',
  startedAt: '2026-07-08T10:00:00.000Z',
  endedAt: '2026-07-08T10:00:30.000Z',
  steps: [
    {
      id: 's1',
      timestamp: '2026-07-08T10:00:05.000Z',
      type: 'click',
      selector: '#go',
      description: 'Clicked "Go" (button)',
      metadata: { tag: 'button', label: 'Go' },
    },
  ],
} as const;

const validInspections = {
  schemaVersion: 'v1',
  inspections: [
    {
      id: 'e1',
      outerHtml: '<button id="go">Go</button>',
      computedStyles: { display: 'inline-flex' },
      boundingClientRect: { x: 1, y: 2, width: 100, height: 40 },
      ancestors: [{ tag: 'section', id: null, classes: ['a', 'b'] }],
      screenshotCropPath: 'screenshots/crops/element-1.png',
    },
  ],
} as const;

const validAnnotationFile = {
  schemaVersion: 'v1',
  screenshotPath: 'screenshots/viewport.png',
  konvaJson: '{"attrs":{},"className":"Stage"}',
} as const;

const validAnnotationsManifest = {
  schemaVersion: 'v1',
  annotations: [validAnnotationFile],
} as const;

describe('BugReportV1Schema', () => {
  it('accepts a valid minimal report', () => {
    expect(() => BugReportV1Schema.parse(validMinimal)).not.toThrow();
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...validMinimal, extra: 'nope' };
    expect(() => BugReportV1Schema.parse(bad)).toThrow(/Unrecognized key/i);
  });

  it('rejects wrong schemaVersion', () => {
    const bad = { ...validMinimal, schemaVersion: 'v2' };
    expect(() => BugReportV1Schema.parse(bad)).toThrow();
  });

  it('rejects negative viewport dimensions', () => {
    const bad = {
      ...validMinimal,
      metadata: {
        ...validMinimal.metadata,
        viewport: { ...validMinimal.metadata.viewport, innerWidth: -1 },
      },
    };
    expect(() => BugReportV1Schema.parse(bad)).toThrow(/innerWidth/);
  });

  it('rejects malformed UUID', () => {
    const bad = {
      ...validMinimal,
      metadata: { ...validMinimal.metadata, id: 'not-a-uuid' },
    };
    expect(() => BugReportV1Schema.parse(bad)).toThrow(/uuid/i);
  });

  it('rejects missing required field', () => {
    const partial: Record<string, unknown> = { ...validMinimal };
    delete partial.userInput;
    expect(() => BugReportV1Schema.parse(partial)).toThrow(/userInput/);
  });

  it('rejects wrong type for devicePixelRatio', () => {
    const bad = {
      ...validMinimal,
      metadata: {
        ...validMinimal.metadata,
        viewport: {
          ...validMinimal.metadata.viewport,
          devicePixelRatio: 'two' as unknown as number,
        },
      },
    };
    expect(() => BugReportV1Schema.parse(bad)).toThrow(/devicePixelRatio/);
  });

  it('parses to a typed object', () => {
    const parsed = BugReportV1Schema.parse(validMinimal);
    expect(parsed.schemaVersion).toBe('v1');
  });

  it('accepts a report with reproduction, elementInspections, and annotations all populated', () => {
    const full = {
      ...validMinimal,
      reproduction: validReproduction,
      elementInspections: validInspections,
      annotations: validAnnotationsManifest,
    };
    expect(() => BugReportV1Schema.parse(full)).not.toThrow();
  });

  it('rejects a report missing the annotations key', () => {
    const partial: Record<string, unknown> = { ...validMinimal };
    delete partial.annotations;
    expect(() => BugReportV1Schema.parse(partial)).toThrow(/annotations/);
  });
});

describe('ReproductionRecordingSchema', () => {
  it('round-trips a valid recording', () => {
    expect(() => ReproductionRecordingSchema.parse(validReproduction)).not.toThrow();
  });

  it('rejects an unknown key (strict)', () => {
    const bad = { ...validReproduction, extra: 1 };
    expect(() => ReproductionRecordingSchema.parse(bad)).toThrow(/Unrecognized key/i);
  });

  it('rejects a step with an unknown type', () => {
    const bad = {
      ...validReproduction,
      steps: [{ ...validReproduction.steps[0], type: 'teleport' }],
    };
    expect(() => ReproductionRecordingSchema.parse(bad)).toThrow();
  });

  it('rejects a non-ISO startedAt', () => {
    const bad = { ...validReproduction, startedAt: 'yesterday' };
    expect(() => ReproductionRecordingSchema.parse(bad)).toThrow(/startedAt/);
  });
});

describe('ElementInspectionsManifestSchema', () => {
  it('round-trips a valid manifest', () => {
    expect(() => ElementInspectionsManifestSchema.parse(validInspections)).not.toThrow();
  });

  it('accepts an empty inspections array', () => {
    expect(() =>
      ElementInspectionsManifestSchema.parse({ schemaVersion: 'v1', inspections: [] }),
    ).not.toThrow();
  });

  it('rejects a negative bounding-box width', () => {
    const bad = {
      ...validInspections,
      inspections: [
        {
          ...validInspections.inspections[0],
          boundingClientRect: { x: 0, y: 0, width: -1, height: 10 },
        },
      ],
    };
    expect(() => ElementInspectionsManifestSchema.parse(bad)).toThrow(/width/);
  });

  it('rejects an unknown key (strict)', () => {
    const bad = { ...validInspections, extra: true };
    expect(() => ElementInspectionsManifestSchema.parse(bad)).toThrow(/Unrecognized key/i);
  });
});

describe('AnnotationFileSchema', () => {
  it('round-trips a valid annotation file', () => {
    expect(() => AnnotationFileSchema.parse(validAnnotationFile)).not.toThrow();
  });

  it('rejects an empty screenshotPath', () => {
    const bad = { ...validAnnotationFile, screenshotPath: '' };
    expect(() => AnnotationFileSchema.parse(bad)).toThrow(/screenshotPath/);
  });

  it('rejects an unknown key (strict)', () => {
    const bad = { ...validAnnotationFile, extra: 'x' };
    expect(() => AnnotationFileSchema.parse(bad)).toThrow(/Unrecognized key/i);
  });
});

describe('AnnotationsManifestSchema', () => {
  it('round-trips a valid manifest', () => {
    expect(() => AnnotationsManifestSchema.parse(validAnnotationsManifest)).not.toThrow();
  });

  it('accepts an empty annotations array', () => {
    expect(() =>
      AnnotationsManifestSchema.parse({ schemaVersion: 'v1', annotations: [] }),
    ).not.toThrow();
  });

  it('rejects the wrong schemaVersion', () => {
    const bad = { ...validAnnotationsManifest, schemaVersion: 'v2' };
    expect(() => AnnotationsManifestSchema.parse(bad)).toThrow();
  });

  it('rejects a malformed nested annotation file', () => {
    const bad = {
      schemaVersion: 'v1',
      annotations: [{ ...validAnnotationFile, screenshotPath: '' }],
    };
    expect(() => AnnotationsManifestSchema.parse(bad)).toThrow();
  });
});
