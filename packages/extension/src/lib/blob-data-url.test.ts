import { describe, expect, it } from 'vitest';

import { blobToDataUrl } from './blob-data-url';

describe('blobToDataUrl', () => {
  it('encodes a typed blob as a base64 data URL', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    expect(await blobToDataUrl(blob)).toBe(`data:image/png;base64,${btoa('\x01\x02\x03')}`);
  });

  it('falls back to application/octet-stream when the blob has no type', async () => {
    const blob = new Blob([new Uint8Array([255])]);
    expect(await blobToDataUrl(blob)).toBe(`data:application/octet-stream;base64,${btoa('\xff')}`);
  });
});
