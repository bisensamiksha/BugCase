// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { LandingIntro } from './components/LandingIntro';
import { BUGCASE_REPO_URL, BUGCASE_STORE_URL } from './landing-links';
import { fakeReportSource } from './test-utils/fake-report-source';

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

function renderIntro(): void {
  act(() => {
    root.render(<LandingIntro />);
  });
}

const link = (testid: string) =>
  container.querySelector<HTMLAnchorElement>(`[data-testid="${testid}"]`);

describe('LandingIntro', () => {
  it('states the privacy claim the ticket names', () => {
    renderIntro();
    const text = container.textContent ?? '';
    expect(text).toMatch(/never leaves this tab/i);
    expect(text).toMatch(/nothing is uploaded/i);
  });

  it('does not claim images are redacted for you (BUG-01)', () => {
    renderIntro();
    const text = container.textContent ?? '';
    // Screenshots and element crops are raw pixels. The landing must say so, not round it up to
    // "your report is sanitized" — this is a sales surface, which is exactly where that rounding is
    // most tempting and most false.
    expect(text).toMatch(/screenshots and element crops/i);
    expect(text).toMatch(/redact them yourself/i);
  });

  it('links to the store and the repo with the canonical URLs', () => {
    renderIntro();
    expect(link('landing-store-link')?.getAttribute('href')).toBe(BUGCASE_STORE_URL);
    expect(link('landing-repo-link')?.getAttribute('href')).toBe(BUGCASE_REPO_URL);
  });

  it('opens external links safely and announces the new tab', () => {
    renderIntro();
    for (const testid of ['landing-store-link', 'landing-repo-link']) {
      const anchor = link(testid);
      expect(anchor?.getAttribute('target')).toBe('_blank');
      // noreferrer is a privacy choice as much as a security one: without it, clicking through
      // leaks the dashboard URL in the Referer header.
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchor?.textContent).toMatch(/opens in a new tab/i);
    }
  });

  it('starts at h2 so the shell keeps the only h1', () => {
    renderIntro();
    expect(container.querySelector('h1')).toBeNull();
    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    // The section is labelled by its own heading.
    const section = container.querySelector('[data-testid="landing-intro"]');
    expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id);
  });

  it('renders three value props', () => {
    renderIntro();
    expect(container.querySelectorAll('[data-testid^="landing-value-"]')).toHaveLength(3);
    expect(container.querySelectorAll('h3')).toHaveLength(3);
  });

  it('ships no remote asset', () => {
    renderIntro();
    // Guards the privacy constraint against a future "just use the official Add to Chrome badge"
    // edit: a CDN-hosted image would fire a third-party request on a page whose entire pitch is
    // that it makes none, and would render broken in the offline report.html.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('link, script, iframe')).toHaveLength(0);
  });

  it('is hidden from print, like the rest of the app chrome', () => {
    renderIntro();
    expect(
      container.querySelector('[data-testid="landing-intro"]')?.hasAttribute('data-print-hide'),
    ).toBe(true);
  });
});

describe('the landing intro in the app shell', () => {
  it('renders above the drop zone in the empty state', () => {
    act(() => {
      root.render(<App />);
    });

    const intro = container.querySelector('[data-testid="landing-intro"]');
    const drop = container.querySelector('[data-testid="dropzone"]');
    expect(intro).not.toBeNull();
    expect(drop).not.toBeNull();

    // "Above" is the ticket's actual requirement — asserting mere presence would pass with the
    // intro rendered underneath the drop zone. DOCUMENT_POSITION_FOLLOWING means `drop` comes
    // after `intro` in document order.
    expect(intro!.compareDocumentPosition(drop!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the existing empty-state status line', () => {
    act(() => {
      root.render(<App />);
    });
    // Four existing assertions across App.test.tsx and kitchen-sink-report.spec.ts depend on this.
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull();
  });

  it('disappears once a report is open', async () => {
    const report = { schemaVersion: 'v1', metadata: { id: 'landing1' } } as unknown as BugReportV1;
    act(() => {
      root.render(<App initialSource={fakeReportSource(report)} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="landing-intro"]')).toBeNull();
  });

  it('leaves the shell as the only h1 owner', () => {
    act(() => {
      root.render(<App />);
    });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});
