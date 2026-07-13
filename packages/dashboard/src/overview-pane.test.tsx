// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OverviewPane } from './panes/OverviewPane';

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

function render(report: BugReportV1, reportId: string): void {
  act(() => {
    root.render(<OverviewPane report={report} reportId={reportId} />);
  });
}

function q(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

const fullReport = (): BugReportV1 =>
  ({
    schemaVersion: 'v1',
    metadata: {
      id: 'cap-42',
      tool: {
        name: 'bugcase',
        version: '0.1.0',
        schemaVersion: 'v1',
        browserBuildTarget: 'chrome',
      },
      page: {
        url: 'https://app.example.com/login',
        title: 'Login',
        origin: 'https://app.example.com',
        capturedAt: '2026-07-13T10:00:00.000Z',
        referrer: null,
      },
      viewport: {
        innerWidth: 1280,
        innerHeight: 720,
        outerWidth: 1280,
        outerHeight: 800,
        devicePixelRatio: 2,
        zoomEstimate: 1,
        screenWidth: 2560,
        screenHeight: 1440,
        orientation: 'landscape-primary',
      },
    },
    userInput: {
      schemaVersion: 'v1',
      title: 'Login button broken',
      stepsToReproduce: '1. click',
      severity: 'critical',
      notes: '**Important** detail <script>alert(1)</script>',
    },
    screenshots: {
      schemaVersion: 'v1',
      viewport: {
        path: 'screenshots/viewport.png',
        width: 1280,
        height: 720,
        devicePixelRatio: 2,
        captureMethod: 'visibleTab',
        hasAnnotations: false,
      },
      elementCrops: [],
    },
    browser: {
      schemaVersion: 'v1',
      userAgent: 'UA',
      userAgentData: null,
      languages: ['en-US'],
      timezone: 'UTC',
      installedExtensions: null,
    },
    console: {
      schemaVersion: 'v1',
      capturedFromRingBuffer: true,
      capturedFromDebugger: false,
      bufferSize: 3,
      truncated: false,
      entries: [
        { id: 'c0', timestamp: 't', level: 'error', args: [{ type: 'string', preview: 'boom' }] },
        { id: 'c1', timestamp: 't', level: 'error', args: [{ type: 'string', preview: 'bang' }] },
        { id: 'c2', timestamp: 't', level: 'log', args: [{ type: 'string', preview: 'ok' }] },
      ],
    },
    network: {
      schemaVersion: 'v1',
      capturedFromRingBuffer: true,
      capturedFromDebugger: false,
      entries: [
        { id: 'n0', url: 'https://x', method: 'GET', status: 200, failed: false },
        { id: 'n1', url: 'https://y', method: 'GET', status: 500, failed: false },
      ],
    },
  }) as unknown as BugReportV1;

describe('OverviewPane', () => {
  it('renders the report title, capture id, and severity badge', () => {
    render(fullReport(), 'cap-42');
    expect(q('overview-pane')).not.toBeNull();
    expect(q('overview-pane')?.textContent).toContain('Login button broken');
    expect(q('overview-capture-id')?.textContent).toContain('cap-42');
    expect(q('overview-severity')?.textContent?.toLowerCase()).toContain('critical');
  });

  it('renders the page metadata card', () => {
    render(fullReport(), 'cap-42');
    const card = q('overview-card-page');
    expect(card?.textContent).toContain('https://app.example.com/login');
    expect(card?.textContent).toContain('https://app.example.com');
  });

  it('renders console and network metric tiles from the logs', () => {
    render(fullReport(), 'cap-42');
    expect(q('overview-metric-console-errors')?.textContent).toContain('2');
    expect(q('overview-metric-network-total')?.textContent).toContain('2');
    expect(q('overview-metric-network-failed')?.textContent).toContain('1');
  });

  it('renders notes as sanitized HTML (formatting kept, scripts removed)', () => {
    render(fullReport(), 'cap-42');
    const notes = q('overview-notes');
    expect(notes?.querySelector('strong')?.textContent).toBe('Important');
    expect(notes?.innerHTML).not.toContain('<script');
    expect(notes?.textContent).not.toContain('alert(1)');
  });

  it('links the hero screenshot card to the screenshots pane for this report', () => {
    render(fullReport(), 'cap-42');
    expect(q('overview-hero-link')?.getAttribute('href')).toBe('#/screenshots/cap-42');
  });

  it('renders a minimal/partial report without throwing and still shows the capture id', () => {
    const partial = { schemaVersion: 'v1', metadata: { id: 'abc-123' } } as unknown as BugReportV1;
    expect(() => render(partial, 'abc-123')).not.toThrow();
    expect(q('overview-pane')?.textContent).toContain('abc-123');
    expect(q('overview-hero-empty')).not.toBeNull();
    expect(q('overview-notes-empty')).not.toBeNull();
  });
});
