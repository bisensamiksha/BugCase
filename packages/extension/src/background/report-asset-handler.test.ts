import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { PEEK_REPORT_ASSET } from './messages';
import { handlePeekReportAsset } from './report-asset-handler';
import type { HeldReport } from './report-hold';

function heldWith(path: string, data: Blob | string | Uint8Array): HeldReport {
  return {
    report: { schemaVersion: 'v1' } as unknown as BugReportV1,
    assets: { files: new Map([[path, data]]) },
  };
}

describe('handlePeekReportAsset', () => {
  it('returns the asset as a data URL when the hold and path exist', async () => {
    const held = heldWith(
      'raw/s.png',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    const res = await handlePeekReportAsset(
      { type: PEEK_REPORT_ASSET, reportId: 'r1', path: 'raw/s.png' },
      { peek: () => held },
    );
    expect(res.ok).toBe(true);
    expect(res.dataUrl).toBe(`data:image/png;base64,${btoa('\x01\x02\x03')}`);
  });

  it('reports expired when the hold is gone', async () => {
    const res = await handlePeekReportAsset(
      { type: PEEK_REPORT_ASSET, reportId: 'r1', path: 'raw/s.png' },
      { peek: () => undefined },
    );
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('reports not-found when the path is not in the held assets', async () => {
    const held = heldWith('raw/s.png', new Blob([new Uint8Array([1])]));
    const res = await handlePeekReportAsset(
      { type: PEEK_REPORT_ASSET, reportId: 'r1', path: 'raw/other.png' },
      { peek: () => held },
    );
    expect(res).toEqual({ ok: false, reason: 'not-found' });
  });

  it('never throws; a converter error resolves to a handled failure', async () => {
    const held = heldWith('raw/s.png', new Blob([new Uint8Array([1])]));
    const res = await handlePeekReportAsset(
      { type: PEEK_REPORT_ASSET, reportId: 'r1', path: 'raw/s.png' },
      { peek: () => held, toDataUrl: () => Promise.reject(new Error('boom')) },
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('boom');
  });
});
