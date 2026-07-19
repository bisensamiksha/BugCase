// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivacyPane } from './panes/PrivacyPane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeReport(metadata: Record<string, unknown>): BugReportV1 {
  return { schemaVersion: 'v1', metadata } as unknown as BugReportV1;
}

const FULL = makeReport({
  page: {
    origin: 'https://app.example.com',
    capturedAt: '2026-07-19T12:00:00.000Z',
  },
  scrubbersApplied: [
    { id: 'dom-passwords', description: 'Mask password inputs', hits: 3 },
    { id: 'cookies', description: 'Mask cookie values', hits: 2 },
  ],
  permissionsAtCapture: [
    { name: 'cookies', grantedAtCapture: true },
    { name: 'debugger', grantedAtCapture: false },
  ],
});

let container: HTMLElement;
let root: Root;

function render(report: BugReportV1): void {
  act(() => {
    root.render(<PrivacyPane report={report} reportId="report-1" />);
  });
}

const q = (testid: string) => container.querySelector(`[data-testid="${testid}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('PrivacyPane', () => {
  it('renders the recorded scrubber rules with hit counts and a total', () => {
    render(FULL);
    expect(q('privacy-scrubber-total')?.textContent).toContain('5 values scrubbed across 2 rules');
    const scrubbers = q('privacy-scrubbers');
    expect(scrubbers?.textContent).toContain('dom-passwords');
    expect(scrubbers?.textContent).toContain('Mask password inputs');
    expect(scrubbers?.textContent).toContain('cookies');
    expect(scrubbers?.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('renders schema version and capture facts', () => {
    render(FULL);
    const facts = q('privacy-facts')?.textContent ?? '';
    expect(facts).toContain('v1');
    expect(facts).toContain('2026-07-19T12:00:00.000Z');
    expect(facts).toContain('https://app.example.com');
  });

  it('renders permissions with granted state', () => {
    render(FULL);
    const permissions = q('privacy-permissions');
    expect(permissions?.textContent).toContain('cookies');
    expect(permissions?.textContent).toContain('Granted');
    expect(permissions?.textContent).toContain('debugger');
    expect(permissions?.textContent).toContain('Not granted');
  });

  it('shows an honest empty state when no scrubber activity was recorded', () => {
    render(makeReport({ scrubbersApplied: [], permissionsAtCapture: [] }));
    expect(q('privacy-scrubbers')?.textContent).toMatch(/no scrubber activity was recorded/i);
  });

  it('discloses that screenshots and element crops are NOT automatically scrubbed', () => {
    render(FULL);
    const note = q('privacy-image-disclosure');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/screenshots and element crops/i);
    expect(note?.textContent).toMatch(/not (?:automatically )?scrubbed/i);
    expect(note?.textContent).toMatch(/redact/i);
  });

  it('downloads the privacy summary as JSON on click', async () => {
    let captured: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:mock-url';
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(FULL);
    act(() => {
      (q('privacy-download') as HTMLButtonElement).click();
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    const parsed = JSON.parse(await captured!.text()) as {
      schemaVersion: string;
      totalScrubberHits: number;
      scrubbers: unknown[];
      permissions: unknown[];
      pageOrigin: string;
      console?: unknown;
      network?: unknown;
    };
    expect(parsed.schemaVersion).toBe('v1');
    expect(parsed.totalScrubberHits).toBe(5);
    expect(parsed.scrubbers).toHaveLength(2);
    expect(parsed.permissions).toHaveLength(2);
    expect(parsed.pageOrigin).toBe('https://app.example.com');
    // Evidence only — no captured report content leaks into the export.
    expect(parsed.console).toBeUndefined();
    expect(parsed.network).toBeUndefined();
  });

  it('has no axe violations', async () => {
    render(FULL);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
