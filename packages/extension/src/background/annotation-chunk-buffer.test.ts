import { describe, expect, it } from 'vitest';

import { AnnotationChunkBuffer } from './annotation-chunk-buffer';

describe('AnnotationChunkBuffer', () => {
  it('reassembles slices in order regardless of arrival order', () => {
    const buf = new AnnotationChunkBuffer();
    buf.add('r1', 2, 3, 'C');
    buf.add('r1', 0, 3, 'A');
    buf.add('r1', 1, 3, 'B');
    expect(buf.take('r1')).toBe('ABC');
  });

  it('take clears the buffer (a second take is empty)', () => {
    const buf = new AnnotationChunkBuffer();
    buf.add('r1', 0, 1, 'X');
    expect(buf.take('r1')).toBe('X');
    expect(buf.take('r1')).toBe('');
  });

  it('take returns an empty string when nothing was buffered', () => {
    const buf = new AnnotationChunkBuffer();
    expect(buf.take('missing')).toBe('');
  });

  it('clear discards buffered slices', () => {
    const buf = new AnnotationChunkBuffer();
    buf.add('r1', 0, 2, 'A');
    buf.clear('r1');
    expect(buf.take('r1')).toBe('');
  });

  it('keeps separate buffers per reportId', () => {
    const buf = new AnnotationChunkBuffer();
    buf.add('a', 0, 1, 'AA');
    buf.add('b', 0, 1, 'BB');
    expect(buf.take('a')).toBe('AA');
    expect(buf.take('b')).toBe('BB');
  });
});
