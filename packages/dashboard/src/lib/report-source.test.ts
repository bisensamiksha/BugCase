import type { BugReportV1 } from '@bugcase/schema';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReportSource } from './report-source';

const report = { schemaVersion: 'v1' } as unknown as BugReportV1;

const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

beforeEach(() => {
  let n = 0;
  createObjectURL.mockImplementation(() => `blob:mock-${n++}`);
  revokeObjectURL.mockReset();
  // Node/jsdom don't implement the object-URL APIs; install deterministic stubs.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  createObjectURL.mockReset();
});

/** A round-tripped ZIP so entries behave like a read (loaded) archive. */
async function buildZip(): Promise<JSZip> {
  const zip = new JSZip();
  zip.file('report.json', '{"schemaVersion":"v1"}');
  zip.file('raw/console.json', 'console-bytes');
  zip.file('screenshots/viewport.png', new Uint8Array([1, 2, 3, 4]));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return JSZip.loadAsync(bytes);
}

describe('createReportSource', () => {
  it('exposes the parsed report and reads entry text on demand', async () => {
    const source = createReportSource(await buildZip(), report);
    expect(source.report).toBe(report);
    expect(await source.readText('raw/console.json')).toBe('console-bytes');
    expect(await source.readText('does/not/exist')).toBeNull();
  });

  it('reads entry blobs on demand and returns null for a missing entry', async () => {
    const source = createReportSource(await buildZip(), report);
    const blob = await source.readBlob('screenshots/viewport.png');
    expect(blob).toBeInstanceOf(Blob);
    expect(await source.readBlob('missing.png')).toBeNull();
  });

  it('creates an object URL lazily and caches it per path', async () => {
    const source = createReportSource(await buildZip(), report);
    const a = await source.objectUrl('screenshots/viewport.png');
    const b = await source.objectUrl('screenshots/viewport.png');
    expect(a).toBe(b);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // A missing entry yields null and never creates a URL.
    expect(await source.objectUrl('missing.png')).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes every created object URL on dispose (idempotent) and reads null afterwards', async () => {
    const source = createReportSource(await buildZip(), report);
    const url = await source.objectUrl('screenshots/viewport.png');
    source.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    source.dispose(); // idempotent — no further revokes
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(await source.readText('raw/console.json')).toBeNull();
  });
});
