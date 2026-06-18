import { describe, expect, it } from 'vitest';

import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('keeps pushed items in insertion order', () => {
    const buffer = new RingBuffer<number>(10);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(buffer.snapshot()).toEqual([1, 2, 3]);
  });

  it('drops the oldest items once it exceeds maxSize (FIFO)', () => {
    const buffer = new RingBuffer<number>(3);
    for (const n of [1, 2, 3, 4, 5]) buffer.push(n);
    expect(buffer.snapshot()).toEqual([3, 4, 5]);
    expect(buffer.size).toBe(3);
  });

  it('reports its current size and can be cleared', () => {
    const buffer = new RingBuffer<string>(5);
    buffer.push('a');
    buffer.push('b');
    expect(buffer.size).toBe(2);
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.snapshot()).toEqual([]);
  });

  it('returns a defensive copy from snapshot (mutating it does not affect the buffer)', () => {
    const buffer = new RingBuffer<number>(5);
    buffer.push(1);
    const snap = buffer.snapshot() as number[];
    snap.push(99);
    expect(buffer.snapshot()).toEqual([1]);
  });

  it('treats a maxSize of 0 as never retaining anything', () => {
    const buffer = new RingBuffer<number>(0);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.snapshot()).toEqual([]);
    expect(buffer.size).toBe(0);
  });
});
