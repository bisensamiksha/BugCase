// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OverlayApp's children reach lib/browser; stub the polyfill so import succeeds. The opt-in
// check is injected in every test, so the real runtime bridge is never invoked.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { CaptureElementInspection } from '../background/element-inspection-finalize';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import { OVERLAY_HOST_ID } from '../shared/overlay-host';
import type { RecordingSession } from '../storage/recording-session';

import { OverlayApp, type ElementPickerController, type RecordingClient } from './OverlayApp';

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

function queryTestId(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe('OverlayApp stored capture defaults', () => {
  it('seeds the capture options from the stored default capture options', async () => {
    const defaults = { ...DEFAULT_USER_OPTIONS, consoleLogs: true };
    const loadDefaultCaptureOptions = vi.fn(() => Promise.resolve(defaults));
    await act(async () => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          subscribeDebuggerActivity={() => () => {}}
          loadDefaultCaptureOptions={loadDefaultCaptureOptions}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadDefaultCaptureOptions).toHaveBeenCalled();
    // consoleLogs is off by default; the stored default flips it on.
    expect((queryTestId('capture-option-consoleLogs') as HTMLInputElement).checked).toBe(true);
  });
});

describe('OverlayApp passive-monitoring opt-in', () => {
  it('prompts to enable monitoring on an origin that is not yet allowlisted', async () => {
    const promise = Promise.resolve(false);
    const checkAllowed = vi.fn(() => promise);

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="https://example.com" checkAllowed={checkAllowed} />,
      );
    });
    await act(async () => {
      await promise;
    });

    expect(checkAllowed).toHaveBeenCalledWith('https://example.com');
    expect(queryTestId('origin-opt-in')).not.toBeNull();
    // The capture UI is always present too.
    expect(queryTestId('bugcase-overlay')).not.toBeNull();
  });

  it('does not prompt when the origin is already allowlisted', async () => {
    const promise = Promise.resolve(true);
    const checkAllowed = vi.fn(() => promise);

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="https://example.com" checkAllowed={checkAllowed} />,
      );
    });
    await act(async () => {
      await promise;
    });

    expect(queryTestId('origin-opt-in')).toBeNull();
  });

  it('shows the debugger banner only while a debugger-activity message reports active', () => {
    let handler: ((active: boolean, hostName?: string) => void) | undefined;
    const subscribeDebuggerActivity = vi.fn((cb: typeof handler) => {
      handler = cb;
      return () => {};
    });

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          subscribeDebuggerActivity={subscribeDebuggerActivity}
        />,
      );
    });
    expect(queryTestId('debugger-banner')).toBeNull();

    act(() => {
      handler?.(true, 'example.com');
    });
    const banner = queryTestId('debugger-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('example.com');

    act(() => {
      handler?.(false);
    });
    expect(queryTestId('debugger-banner')).toBeNull();
  });

  it('never prompts for a non-http(s) origin and skips the lookup', () => {
    const checkAllowed = vi.fn(() => Promise.resolve(false));

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="about:blank" checkAllowed={checkAllowed} />,
      );
    });

    expect(checkAllowed).not.toHaveBeenCalled();
    expect(queryTestId('origin-opt-in')).toBeNull();
  });
});

describe('OverlayApp cookies warning', () => {
  it('warns that cookies are captured when the cookies permission is granted', async () => {
    const granted = Promise.resolve(true);
    const checkCookiesGranted = vi.fn(() => granted);

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={checkCookiesGranted}
        />,
      );
    });
    await act(async () => {
      await granted;
    });

    expect(checkCookiesGranted).toHaveBeenCalled();
    const warning = queryTestId('cookies-warning');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('example.com');
  });

  it('does not warn when the cookies permission is not granted', async () => {
    const denied = Promise.resolve(false);

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => denied}
        />,
      );
    });
    await act(async () => {
      await denied;
    });

    expect(queryTestId('cookies-warning')).toBeNull();
  });
});

describe('OverlayApp capture options', () => {
  it('renders the grouped capture-options checkboxes', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    expect(queryTestId('capture-options')).not.toBeNull();
    expect(queryTestId('capture-option-viewportScreenshot')).not.toBeNull();
  });

  it('renders the severity + steps + notes form', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    expect(queryTestId('user-report-form')).not.toBeNull();
    expect(queryTestId('user-report-severity')).not.toBeNull();
    expect(queryTestId('user-report-steps')).not.toBeNull();
    expect(queryTestId('user-report-notes')).not.toBeNull();
  });
});

describe('OverlayApp layout', () => {
  it('pins the header and scrolls the body so controls below the fold stay reachable', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    const panel = queryTestId('bugcase-overlay');
    expect(panel).not.toBeNull();
    // The panel is capped to the viewport; the body (not the panel) scrolls, so the pinned header
    // (drag handle + close) stays put while notes/capture below the fold remain reachable.
    expect(panel?.style.maxHeight).not.toBe('');
    const body = queryTestId('bugcase-overlay-body');
    expect(body?.style.overflowY).toBe('auto');
  });

  it('moves the panel when its header is dragged, and clamps it on-screen', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    const header = queryTestId('bugcase-overlay-header')!;
    act(() => {
      header.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 80 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', {}));
    });
    const panel = queryTestId('bugcase-overlay');
    // Dragging switches the panel to an explicit left/top position (no longer right-anchored).
    expect(panel?.style.left).not.toBe('');
    expect(panel?.style.right).toBe('auto');
  });
});

describe('OverlayApp capture → preview', () => {
  function previewReport(): BugReportV1 {
    return {
      schemaVersion: 'v1',
      metadata: { page: { origin: 'https://example.com' } },
      userInput: {
        schemaVersion: 'v1',
        title: '',
        stepsToReproduce: '',
        severity: 'minor',
        notes: '',
      },
      screenshots: { schemaVersion: 'v1', elementCrops: [] },
      browser: null,
      console: null,
      network: null,
      dom: null,
      storage: null,
      cookies: null,
      navigation: null,
      reproduction: null,
      elementInspections: null,
    } as unknown as BugReportV1;
  }

  it('switches from the capture form to the preview after a successful capture', async () => {
    const response = { ok: true, reportId: 'r1', report: previewReport() };
    const onCapture = vi.fn(() => Promise.resolve(response));
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={onCapture}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve(response);
    });

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(queryTestId('preview-review-screen-scaffold')).not.toBeNull();
    expect(queryTestId('capture-button')).toBeNull();
  });

  it('returns to the capture form when preview is cancelled', async () => {
    const onCapture = vi.fn(() =>
      Promise.resolve({ ok: true, reportId: 'r1', report: previewReport() }),
    );
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={onCapture}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    act(() => {
      queryTestId('preview-cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(queryTestId('capture-button')).not.toBeNull();
    expect(queryTestId('preview-review-screen-scaffold')).toBeNull();
  });
});

describe('OverlayApp reproduction recorder', () => {
  function previewReport(): BugReportV1 {
    return {
      schemaVersion: 'v1',
      metadata: { page: { origin: 'https://example.com' } },
      userInput: {
        schemaVersion: 'v1',
        title: '',
        stepsToReproduce: '',
        severity: 'minor',
        notes: '',
      },
      screenshots: { schemaVersion: 'v1', elementCrops: [] },
      browser: null,
      console: null,
      network: null,
      dom: null,
      storage: null,
      cookies: null,
      navigation: null,
      reproduction: null,
      elementInspections: null,
    } as unknown as BugReportV1;
  }

  const withOption = () => Promise.resolve({ ...DEFAULT_USER_OPTIONS, reproductionSteps: true });

  function fakeRecordingClient(initial: RecordingSession | null = null) {
    let session: RecordingSession | null = initial;
    const client: RecordingClient = {
      start: vi.fn((startedAt: string, url: string) => {
        session = { status: 'recording', startedAt, endedAt: null, url, steps: [] };
        return Promise.resolve();
      }),
      appendStep: vi.fn((step) => {
        if (session) session = { ...session, steps: [...session.steps, step] };
        return Promise.resolve();
      }),
      stop: vi.fn((endedAt: string) => {
        if (session) session = { ...session, status: 'stopped', endedAt };
        return Promise.resolve();
      }),
      get: vi.fn(() => Promise.resolve(session)),
      clear: vi.fn(() => {
        session = null;
        return Promise.resolve();
      }),
    };
    return client;
  }

  async function renderWithRecorder(
    options: {
      onCapture?: ReturnType<typeof vi.fn>;
      recordingClient?: RecordingClient;
      currentUrl?: string;
    } = {},
  ): Promise<{ onCapture: ReturnType<typeof vi.fn>; recordingClient: RecordingClient }> {
    const onCapture =
      options.onCapture ??
      vi.fn(() => Promise.resolve({ ok: true, reportId: 'r1', report: previewReport() }));
    const recordingClient = options.recordingClient ?? fakeRecordingClient();
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          subscribeDebuggerActivity={() => () => {}}
          loadDefaultCaptureOptions={withOption}
          onCapture={onCapture}
          recordingClient={recordingClient}
          {...(options.currentUrl ? { currentUrl: options.currentUrl } : {})}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return { onCapture, recordingClient };
  }

  it('hides the recorder until the reproduction-steps option is enabled', async () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          loadDefaultCaptureOptions={() => Promise.resolve(DEFAULT_USER_OPTIONS)}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryTestId('reproduction-controls')).toBeNull();
  });

  it('collapses to a pill and starts a durable recording on Start', async () => {
    const recordingClient = fakeRecordingClient();
    await renderWithRecorder({ recordingClient, currentUrl: 'https://example.com/page1' });
    expect(queryTestId('reproduction-start')).not.toBeNull();
    act(() => {
      queryTestId('reproduction-start')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Collapsed: the full form (capture options + capture button) is hidden; only Stop remains.
    expect(queryTestId('reproduction-stop')).not.toBeNull();
    expect(queryTestId('capture-options')).toBeNull();
    // The recording is persisted with the current page url so it can survive a navigation.
    expect(recordingClient.start).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/page1',
    );
  });

  it('threads the durable reproduction recording into the capture', async () => {
    const session: RecordingSession = {
      status: 'stopped',
      startedAt: '2026-07-05T10:00:00.000Z',
      endedAt: '2026-07-05T10:00:30.000Z',
      url: 'https://example.com/page1',
      steps: [
        {
          type: 'click',
          selector: '#save',
          description: 'Clicked #save',
          timestamp: Date.parse('2026-07-05T10:00:05.000Z'),
          metadata: { tag: 'button' },
        },
      ],
    };
    const { onCapture } = await renderWithRecorder({
      recordingClient: fakeRecordingClient(session),
      currentUrl: 'https://example.com/page1',
    });
    // Recovered as a recorded session.
    expect(queryTestId('reproduction-status')?.textContent).toMatch(/recorded/i);

    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const arg = onCapture.mock.calls[0]?.[0] as {
      reproduction?: { steps?: Array<{ selector?: unknown }> };
    };
    expect(arg.reproduction?.steps?.[0]?.selector).toBe('#save');
  });

  it('resumes a recording that is still in progress (re-injected after a navigation)', async () => {
    const session: RecordingSession = {
      status: 'recording',
      startedAt: '2026-07-05T10:00:00.000Z',
      endedAt: null,
      url: 'https://example.com/page1',
      steps: [],
    };
    await renderWithRecorder({
      recordingClient: fakeRecordingClient(session),
      currentUrl: 'https://example.com/page2',
    });
    // Resumed on the new page: the recording pill (with Stop) is shown, not the completed summary.
    expect(queryTestId('bugcase-recording-pill')).not.toBeNull();
    expect(queryTestId('reproduction-stop')).not.toBeNull();
  });
});

describe('OverlayApp passive error badge', () => {
  it('shows the dismiss banner when the tab logged errors and clears it on dismiss', async () => {
    const dismissPassiveErrors = vi.fn(() => Promise.resolve());
    await act(async () => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          subscribeDebuggerActivity={() => () => {}}
          loadPassiveErrorCount={() => Promise.resolve(3)}
          dismissPassiveErrors={dismissPassiveErrors}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryTestId('dismiss-error-badge-count')?.textContent).toMatch(/3 errors/);

    act(() => {
      queryTestId('dismiss-error-badge')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dismissPassiveErrors).toHaveBeenCalledTimes(1);
    // The banner disappears immediately after dismiss.
    expect(queryTestId('dismiss-error-badge-banner')).toBeNull();
  });

  it('shows no banner when the tab logged no errors', async () => {
    await act(async () => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          subscribeDebuggerActivity={() => () => {}}
          loadPassiveErrorCount={() => Promise.resolve(0)}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryTestId('dismiss-error-badge-banner')).toBeNull();
  });
});

describe('OverlayApp element inspector', () => {
  function previewReport(): BugReportV1 {
    return {
      schemaVersion: 'v1',
      metadata: { page: { origin: 'https://example.com' } },
      userInput: {
        schemaVersion: 'v1',
        title: '',
        stepsToReproduce: '',
        severity: 'minor',
        notes: '',
      },
      screenshots: { schemaVersion: 'v1', elementCrops: [] },
      browser: null,
      console: null,
      network: null,
      dom: null,
      storage: null,
      cookies: null,
      navigation: null,
      reproduction: null,
      elementInspections: null,
    } as unknown as BugReportV1;
  }

  const withPickerOption = () =>
    Promise.resolve({ ...DEFAULT_USER_OPTIONS, elementInspections: true });

  const sampleInspection = (html: string): CaptureElementInspection => ({
    outerHtml: html,
    computedStyles: {},
    boundingClientRect: { x: 0, y: 0, width: 1, height: 1 },
    ancestors: [],
    cropDataUrl: null,
  });

  /** A fake picker whose `onPick` is captured so a test can simulate a pick. */
  function fakePicker() {
    let onPick: ((i: CaptureElementInspection) => void) | undefined;
    const stop = vi.fn();
    const controller: ElementPickerController = {
      start: (pick) => {
        onPick = pick;
        return { stop };
      },
    };
    return { controller, stop, pick: (i: CaptureElementInspection) => onPick?.(i) };
  }

  async function renderPicker(
    picker: ElementPickerController,
    onCapture = vi.fn(() => Promise.resolve({ ok: true, reportId: 'r1', report: previewReport() })),
  ): Promise<ReturnType<typeof vi.fn>> {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          subscribeDebuggerActivity={() => () => {}}
          loadDefaultCaptureOptions={withPickerOption}
          onCapture={onCapture}
          elementPicker={picker}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return onCapture;
  }

  it('shows the picker controls only when the element-inspections option is on', async () => {
    const { controller } = fakePicker();
    await renderPicker(controller);
    expect(queryTestId('element-picker-controls')).not.toBeNull();
    expect(queryTestId('element-picker-start')).not.toBeNull();
  });

  it('gives the picker pill a drag grip so it can be moved instead of hidden (BUG-04)', async () => {
    const picker = fakePicker();
    await renderPicker(picker.controller);
    act(() => {
      queryTestId('element-picker-start')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const grip = queryTestId('bugcase-picker-pill-grip');
    expect(grip).not.toBeNull();
    expect(grip!.getAttribute('aria-label')).toBe('Move the element inspector');
  });

  it('collapses to a picker toolbar on Start and counts a pick', async () => {
    const picker = fakePicker();
    await renderPicker(picker.controller);
    act(() => {
      queryTestId('element-picker-start')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    // Collapsed to the picker pill with a Done button; the full form is hidden.
    expect(queryTestId('bugcase-picker-pill')).not.toBeNull();
    expect(queryTestId('element-picker-done')).not.toBeNull();
    expect(queryTestId('capture-button')).toBeNull();

    act(() => picker.pick(sampleInspection('<a/>')));
    expect(queryTestId('element-picker-status')?.textContent).toMatch(/1/);

    act(() => {
      queryTestId('element-picker-done')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(picker.stop).toHaveBeenCalled();
    expect(queryTestId('capture-button')).not.toBeNull();
  });

  it('threads picked inspections into the capture', async () => {
    const picker = fakePicker();
    const onCapture = await renderPicker(picker.controller);
    act(() => {
      queryTestId('element-picker-start')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    act(() => picker.pick(sampleInspection('<button/>')));
    act(() => {
      queryTestId('element-picker-done')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const arg = onCapture.mock.calls[0]?.[0] as {
      elementInspections?: CaptureElementInspection[];
    };
    expect(arg.elementInspections).toHaveLength(1);
    expect(arg.elementInspections?.[0]?.outerHtml).toBe('<button/>');
  });
});

describe('OverlayApp capture hygiene (BUG-03)', () => {
  it('hides the overlay host while capturing so the panel is not in the screenshot', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      cb(0);
      return 0;
    });
    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.style.visibility = 'visible';
    document.body.appendChild(host);

    let visibilityDuringCapture = '';
    const onCapture = vi.fn(() => {
      visibilityDuringCapture = host.style.visibility;
      return Promise.resolve({ ok: true });
    });

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={onCapture}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onCapture).toHaveBeenCalledTimes(1);
    // The host was hidden at the moment the capture ran, and restored afterwards.
    expect(visibilityDuringCapture).toBe('hidden');
    expect(host.style.visibility).toBe('visible');

    host.remove();
    vi.unstubAllGlobals();
  });

  it('minimizes the panel to a pill and expands back', async () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={() => Promise.resolve({ ok: true })}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Full panel is showing.
    expect(queryTestId('capture-button')).not.toBeNull();

    // Minimize → a pill with an Expand control; the capture form is gone.
    await act(async () => {
      queryTestId('bugcase-overlay-minimize')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });
    expect(queryTestId('bugcase-overlay-expand')).not.toBeNull();
    expect(queryTestId('capture-button')).toBeNull();

    // Expand → the full panel is restored.
    await act(async () => {
      queryTestId('bugcase-overlay-expand')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });
    expect(queryTestId('capture-button')).not.toBeNull();
  });
});

describe('OverlayApp draft restore (BUG-06)', () => {
  it('restores severity and inspections saved before a navigation', async () => {
    const draft = {
      captureOptions: { ...DEFAULT_USER_OPTIONS, elementInspections: true },
      userReport: {
        schemaVersion: 'v1' as const,
        title: '',
        stepsToReproduce: '',
        severity: 'major' as const,
        notes: 'nearly there',
      },
      inspections: [
        {
          outerHtml: '<button>Pay</button>',
          computedStyles: {},
          boundingClientRect: { x: 0, y: 0, width: 1, height: 1 },
          ancestors: [],
          cropDataUrl: null,
        },
      ],
      ui: { minimized: false, panelPos: null },
    };
    const draftClient = {
      get: () => Promise.resolve(draft),
      save: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };

    await act(async () => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          loadDefaultCaptureOptions={() => Promise.resolve(DEFAULT_USER_OPTIONS)}
          loadPassiveErrorCount={() => Promise.resolve(0)}
          draftClient={draftClient}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const severity = queryTestId('user-report-severity') as HTMLSelectElement | null;
    expect(severity?.value).toBe('major');
    expect(queryTestId('element-picker-status')?.textContent).toContain('1 element');
  });

  it('opens with defaults when there is no stored draft', async () => {
    const draftClient = {
      get: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };

    await act(async () => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => Promise.resolve(false)}
          loadDefaultCaptureOptions={() => Promise.resolve(DEFAULT_USER_OPTIONS)}
          loadPassiveErrorCount={() => Promise.resolve(0)}
          draftClient={draftClient}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const severity = queryTestId('user-report-severity') as HTMLSelectElement | null;
    expect(severity?.value).toBe('minor');
  });
});

/** Resolves to `value` after `hops` extra microtask turns, so a promise can be made to settle
 *  deliberately later than another otherwise-immediate promise (used to pin down ordering below). */
function delayedResolve<T>(value: T, hops: number): Promise<T> {
  let p: Promise<T> = Promise.resolve(value);
  for (let i = 0; i < hops; i += 1) {
    p = p.then((v) => v);
  }
  return p;
}

describe('OverlayApp draft-restore / stored-defaults ordering guard (BUG-06 review fix)', () => {
  it(
    'still seeds the stored capture-option defaults when there is no draft, even if the ' +
      'no-draft check settles before the stored-defaults read resolves (regression guard: a ' +
      'draftLoadedRef that flips on a null draft would silently block this seed)',
    async () => {
      const nonDefaultOptions = { ...DEFAULT_USER_OPTIONS, consoleLogs: true };
      const draftClient = {
        // Resolves immediately — settles (and, on the old buggy code, would flip the ref) well
        // before the deliberately-delayed stored-defaults read below.
        get: () => Promise.resolve(null),
        save: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };
      const loadDefaultCaptureOptions = (): Promise<typeof nonDefaultOptions> =>
        delayedResolve(nonDefaultOptions, 6);

      await act(async () => {
        root.render(
          <OverlayApp
            onClose={() => {}}
            checkAllowed={() => Promise.resolve(true)}
            checkCookiesGranted={() => Promise.resolve(false)}
            loadDefaultCaptureOptions={loadDefaultCaptureOptions}
            loadPassiveErrorCount={() => Promise.resolve(0)}
            draftClient={draftClient}
          />,
        );
        for (let i = 0; i < 12; i += 1) {
          await Promise.resolve();
        }
      });

      // The stored (non-default) capture option must still be applied — a null draft must never
      // permanently suppress the stored-defaults seed, no matter which promise settles first.
      expect((queryTestId('capture-option-consoleLogs') as HTMLInputElement).checked).toBe(true);
    },
  );

  it(
    'applies the stored capture-option defaults under ordinary (non-adversarial) timing when ' +
      'there is no draft',
    async () => {
      const nonDefaultOptions = { ...DEFAULT_USER_OPTIONS, consoleLogs: true };
      const draftClient = {
        get: () => Promise.resolve(null),
        save: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };

      await act(async () => {
        root.render(
          <OverlayApp
            onClose={() => {}}
            checkAllowed={() => Promise.resolve(true)}
            checkCookiesGranted={() => Promise.resolve(false)}
            loadDefaultCaptureOptions={() => Promise.resolve(nonDefaultOptions)}
            loadPassiveErrorCount={() => Promise.resolve(0)}
            draftClient={draftClient}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect((queryTestId('capture-option-consoleLogs') as HTMLInputElement).checked).toBe(true);
    },
  );
});
