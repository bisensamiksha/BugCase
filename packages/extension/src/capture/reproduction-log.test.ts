import { ReproductionRecordingSchema } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { toReproductionRecording } from './reproduction-log';

const WINDOW = {
  startedAt: '2026-07-04T10:00:00.000Z',
  endedAt: '2026-07-04T10:00:30.000Z',
};

function rawStep(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'click',
    selector: '#save',
    description: 'Clicked #save',
    timestamp: Date.parse('2026-07-04T10:00:05.000Z'),
    metadata: { tag: 'button' },
    ...overrides,
  };
}

describe('toReproductionRecording', () => {
  it('maps a raw step to a schema step with an ISO timestamp and generated id', () => {
    let n = 0;
    const rec = toReproductionRecording([rawStep()], { ...WINDOW, newId: () => `id-${n++}` });
    expect(rec.steps).toHaveLength(1);
    expect(rec.steps[0]).toEqual({
      id: 'id-0',
      type: 'click',
      selector: '#save',
      description: 'Clicked #save',
      timestamp: '2026-07-04T10:00:05.000Z',
      metadata: { tag: 'button' },
    });
    expect(rec.startedAt).toBe(WINDOW.startedAt);
    expect(rec.endedAt).toBe(WINDOW.endedAt);
    expect(rec.schemaVersion).toBe('v1');
  });

  it('skips malformed entries without throwing', () => {
    const rec = toReproductionRecording(
      [
        null,
        'nope',
        { type: 'click' }, // missing fields
        { type: 'not-a-type', selector: '#x', description: 'd', timestamp: 1, metadata: {} },
        rawStep(),
      ],
      WINDOW,
    );
    expect(rec.steps).toHaveLength(1);
  });

  it('returns an empty-but-valid recording for no entries', () => {
    const rec = toReproductionRecording([], WINDOW);
    expect(rec.steps).toEqual([]);
    expect(() => ReproductionRecordingSchema.parse(rec)).not.toThrow();
  });

  it('produces a schema-valid recording', () => {
    const rec = toReproductionRecording(
      [
        rawStep(),
        rawStep({ type: 'keydown-modifier', metadata: { key: 'c', ctrl: true, shift: false } }),
        rawStep({ type: 'scroll', metadata: {} }),
      ],
      WINDOW,
    );
    expect(() => ReproductionRecordingSchema.parse(rec)).not.toThrow();
  });

  it('drops non-primitive metadata values so the step stays schema-valid', () => {
    const rec = toReproductionRecording(
      [rawStep({ metadata: { tag: 'button', nested: { a: 1 }, fn: () => 1 } })],
      WINDOW,
    );
    expect(rec.steps[0]?.metadata).toEqual({ tag: 'button' });
    expect(() => ReproductionRecordingSchema.parse(rec)).not.toThrow();
  });

  it('caps the number of steps, keeping the most recent', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      rawStep({ selector: `#s${i}`, description: `d${i}` }),
    );
    const rec = toReproductionRecording(many, { ...WINDOW, maxSteps: 2 });
    expect(rec.steps).toHaveLength(2);
    expect(rec.steps.map((s) => s.selector)).toEqual(['#s3', '#s4']);
  });
});
