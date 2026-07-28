import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import { REDACT_TEXT, type RedactTextRequest } from './messages';
import { handleRedactText } from './redact-text-handler';
import type { HeldReport } from './report-hold';

const SECRET = 'SUPERSECRET123';

function heldReport(): HeldReport {
  return {
    report: {
      schemaVersion: 'v1',
      metadata: { scrubbersApplied: [] },
      userInput: { notes: `pasted ${SECRET}` },
      elementInspections: { items: [{ outerHtml: `<input value="${SECRET}">` }] },
    } as unknown as BugReportV1,
    assets: {
      files: new Map<string, Blob | string | Uint8Array>([
        ['raw/dom-snapshot.html', `<input value="${SECRET}">`],
        ['raw/screenshot.png', new Uint8Array([1, 2, 3])],
      ]),
    },
  };
}

function request(overrides: Partial<RedactTextRequest> = {}): RedactTextRequest {
  return { type: REDACT_TEXT, reportId: 'r1', secret: SECRET, ...overrides };
}

describe('handleRedactText', () => {
  it('removes the secret from both report.json and the DOM snapshot asset', async () => {
    const held = heldReport();
    const update = vi.fn().mockReturnValue(true);
    const result = await handleRedactText(request(), { peek: () => held, update });

    expect(result.ok).toBe(true);
    expect(result.reportHits).toBe(2);
    expect(result.assetHits).toBe(1);

    const saved = update.mock.calls[0]?.[1] as HeldReport;
    expect(JSON.stringify(saved.report)).not.toContain(SECRET);
    expect(saved.assets.files.get('raw/dom-snapshot.html')).not.toContain(SECRET);
  });

  it('records the combined report+asset total in scrubbersApplied', async () => {
    const update = vi.fn().mockReturnValue(true);
    await handleRedactText(request(), { peek: () => heldReport(), update });
    const saved = update.mock.calls[0]?.[1] as HeldReport;
    const entry = saved.report.metadata.scrubbersApplied.find(
      (a) => a.id === 'manual-text-redaction',
    );
    // 2 occurrences in report.json + 1 in the DOM snapshot asset.
    expect(entry?.hits).toBe(3);
  });

  it('writes back under the same reportId so finalize zips the redacted copy', async () => {
    const update = vi.fn().mockReturnValue(true);
    await handleRedactText(request(), { peek: () => heldReport(), update });
    expect(update.mock.calls[0]?.[0]).toBe('r1');
  });

  it('leaves binary assets untouched — images are Annotate-only (BUG-01)', async () => {
    const held = heldReport();
    const update = vi.fn().mockReturnValue(true);
    await handleRedactText(request(), { peek: () => held, update });
    const saved = update.mock.calls[0]?.[1] as HeldReport;
    expect(saved.assets.files.get('raw/screenshot.png')).toBeInstanceOf(Uint8Array);
  });

  it('reports expiry when the held report is gone', async () => {
    const result = await handleRedactText(request(), {
      peek: () => undefined,
      update: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('reports expiry when the write-back fails', async () => {
    const result = await handleRedactText(request(), {
      peek: () => heldReport(),
      update: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])('rejects a %s secret without touching the held report', async (_label, secret) => {
    const update = vi.fn().mockReturnValue(true);
    const result = await handleRedactText(request({ secret }), {
      peek: () => heldReport(),
      update,
    });
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('succeeds with zero hits when the secret is not present', async () => {
    const update = vi.fn().mockReturnValue(true);
    const result = await handleRedactText(request({ secret: 'ABSENT' }), {
      peek: () => heldReport(),
      update,
    });
    expect(result.ok).toBe(true);
    expect(result.reportHits).toBe(0);
    expect(result.assetHits).toBe(0);
  });

  it('never echoes the secret back in the response', async () => {
    const result = await handleRedactText(request(), {
      peek: () => heldReport(),
      update: () => true,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
