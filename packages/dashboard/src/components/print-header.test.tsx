// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrintHeader } from './PrintHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** A report carrying only the fields the print header reads. */
function reportWith(overrides: Record<string, unknown>): BugReportV1 {
  return overrides as unknown as BugReportV1;
}

const text = () => container.querySelector('[data-testid="print-header"]')?.textContent ?? '';

describe('PrintHeader', () => {
  it('renders the captured page URL, capture time and browser', () => {
    act(() => {
      root.render(
        <PrintHeader
          report={reportWith({
            metadata: {
              page: { url: 'https://example.com/checkout', capturedAt: '2026-08-02T14:22:00.000Z' },
              tool: { browserBuildTarget: 'chrome' },
            },
          })}
        />,
      );
    });

    expect(text()).toContain('https://example.com/checkout');
    expect(text()).toContain('2026-08-02T14:22:00.000Z');
    expect(text()).toContain('chrome');
  });

  it('is marked print-only so it never shows on screen', () => {
    act(() => {
      root.render(
        <PrintHeader
          report={reportWith({
            metadata: { page: { url: 'https://example.com', capturedAt: '' } },
          })}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="print-header"]')?.hasAttribute('data-print-only'),
    ).toBe(true);
  });

  it('renders nothing when no report is loaded', () => {
    act(() => {
      root.render(<PrintHeader report={null} />);
    });

    expect(container.querySelector('[data-testid="print-header"]')).toBeNull();
  });

  it('renders without throwing when metadata is missing', () => {
    // Partial reports reach the panes; the header must degrade like every other surface.
    act(() => {
      root.render(<PrintHeader report={reportWith({})} />);
    });

    expect(container.querySelector('[data-testid="print-header"]')).not.toBeNull();
    expect(text()).toContain('BugCase report');
  });

  it('falls back to an em dash for absent fields rather than printing "undefined"', () => {
    act(() => {
      root.render(<PrintHeader report={reportWith({ metadata: { page: null, tool: null } })} />);
    });

    expect(text()).not.toContain('undefined');
    expect(text()).toContain('—');
  });
});
