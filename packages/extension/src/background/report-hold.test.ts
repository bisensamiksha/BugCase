import type { BugReportV1, BugReportZipAssets } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { createReportHold } from './report-hold';

const held = {
  report: { schemaVersion: 'v1' } as unknown as BugReportV1,
  assets: { files: new Map() } as BugReportZipAssets,
};

describe('createReportHold', () => {
  it('returns the generated id on put and the same value on take', () => {
    const hold = createReportHold(() => 'id-1');
    const id = hold.put(held);
    expect(id).toBe('id-1');
    expect(hold.take('id-1')).toBe(held);
  });

  it('take is one-shot: a second take returns undefined', () => {
    const hold = createReportHold(() => 'id-1');
    hold.put(held);
    hold.take('id-1');
    expect(hold.take('id-1')).toBeUndefined();
  });

  it('take of an unknown id returns undefined', () => {
    const hold = createReportHold(() => 'id-1');
    expect(hold.take('nope')).toBeUndefined();
  });

  it('keeps separate entries for separate ids', () => {
    let n = 0;
    const hold = createReportHold(() => `id-${(n += 1)}`);
    const a = { ...held };
    const b = { ...held };
    const idA = hold.put(a);
    const idB = hold.put(b);
    expect(idA).not.toBe(idB);
    expect(hold.take(idB)).toBe(b);
    expect(hold.take(idA)).toBe(a);
  });
});
