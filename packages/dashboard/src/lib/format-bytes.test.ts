import { describe, expect, it } from 'vitest';

import { formatByteSize } from './format-bytes';

describe('formatByteSize', () => {
  it('renders bytes under 1 KiB as B', () => {
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(340)).toBe('340 B');
    expect(formatByteSize(1023)).toBe('1023 B');
  });

  it('renders KiB with one decimal', () => {
    expect(formatByteSize(1024)).toBe('1.0 KB');
    expect(formatByteSize(1536)).toBe('1.5 KB');
  });

  it('renders MiB with one decimal', () => {
    expect(formatByteSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatByteSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });
});
