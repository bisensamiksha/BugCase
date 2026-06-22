import { BUG_REPORT_ZIP_LAYOUT, DomSnapshotSchema } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import { collectDomSnapshot } from './dom-snapshot';

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

describe('collectDomSnapshot', () => {
  it('scrubs password inputs out of the collected outerHTML and counts hits', async () => {
    const raw = '<html><body><input type="password" value="hunter2"></body></html>';
    const result = await collectDomSnapshot({ readOuterHtml: () => Promise.resolve(raw) });

    expect(result).not.toBeNull();
    expect(result?.html).toContain('[scrubbed]');
    expect(result?.html).not.toContain('hunter2');
    expect(result?.snapshot.scrubberHits).toBe(1);
  });

  it('builds a schema-valid DomSnapshot at the raw dom-snapshot path', async () => {
    const raw = '<html><body><p>hi</p></body></html>';
    const result = await collectDomSnapshot({ readOuterHtml: () => Promise.resolve(raw) });

    expect(result).not.toBeNull();
    const snapshot = result!.snapshot;
    expect(() => DomSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.contentPath).toBe(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot);
    expect(snapshot.scrubbed).toBe(true);
    expect(snapshot.byteSize).toBe(byteLength(result!.html));
    expect(snapshot.scrubberHits).toBe(0); // nothing sensitive in this fixture
  });

  it('passes scrubber options through (e.g. strip scripts)', async () => {
    const raw = '<html><body><p>x</p><script>evil()</script></body></html>';
    const result = await collectDomSnapshot({
      readOuterHtml: () => Promise.resolve(raw),
      scrubberOptions: { stripScripts: true },
    });
    expect(result?.html).not.toContain('<script>');
    expect(result?.snapshot.scrubberHits).toBe(1);
  });

  it('returns null for empty outerHTML', async () => {
    expect(await collectDomSnapshot({ readOuterHtml: () => Promise.resolve('') })).toBeNull();
  });

  it('never throws when the in-page read fails, resolving null', async () => {
    const readOuterHtml = vi.fn(() => Promise.reject(new Error('executeScript failed')));
    await expect(collectDomSnapshot({ readOuterHtml })).resolves.toBeNull();
  });
});
