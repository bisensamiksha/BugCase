import { describe, expect, it } from 'vitest';

import { BugReportV1Schema } from '../schemas/report.schema';

import { validMinimal } from './fixtures/valid-minimal';

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
});
