// @vitest-environment jsdom
import { bytesToBase64, type InlineReportPayload } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import { createInlineReportSource } from './inline-report-source';

const report = { schemaVersion: 'v1' } as InlineReportPayload['report'];

function payload(): InlineReportPayload {
  return {
    report,
    assets: {
      'raw/dom-snapshot.html': bytesToBase64(new TextEncoder().encode('<html>x</html>')),
      'screenshots/viewport.png': bytesToBase64(new Uint8Array([1, 2, 3])),
    },
  };
}

describe('createInlineReportSource', () => {
  it('reads text and blob bytes and returns null for absent paths', async () => {
    const src = createInlineReportSource(payload());
    expect(await src.readText('raw/dom-snapshot.html')).toBe('<html>x</html>');
    const blob = await src.readBlob('screenshots/viewport.png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await src.readText('missing')).toBeNull();
    expect(await src.readBlob('missing')).toBeNull();
  });

  it('caches + revokes object URLs on dispose', async () => {
    // jsdom lacks URL.createObjectURL; install fakes (mirrors report-source.test.ts).
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:x');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;

    const src = createInlineReportSource(payload());
    expect(await src.objectUrl('screenshots/viewport.png')).toBe('blob:x');
    await src.objectUrl('screenshots/viewport.png');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    src.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(await src.objectUrl('screenshots/viewport.png')).toBeNull();
  });
});
