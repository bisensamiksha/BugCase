// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OptionsApp transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { DEFAULT_SETTINGS, SCRUBBER_TOGGLE_DEFS, type BugCaseSettings } from '../storage/settings';

import { OptionsApp, type OptionsAppProps } from './OptionsApp';

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

function q(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}
function qa(id: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change, then dispatch `input` (mirrors JsonTreeViewer.test.tsx).
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
  const setNativeValue = descriptor?.set;
  setNativeValue?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function passingPersist(): (u: Partial<BugCaseSettings>) => Promise<BugCaseSettings> {
  return vi.fn((u: Partial<BugCaseSettings>) => Promise.resolve({ ...DEFAULT_SETTINGS, ...u }));
}

async function renderApp(props: Partial<OptionsAppProps> = {}): Promise<void> {
  await act(async () => {
    root.render(
      <OptionsApp
        loadSettings={() => Promise.resolve(DEFAULT_SETTINGS)}
        loadAllowlist={() => Promise.resolve(['https://a.com', 'https://b.com'])}
        loadHistory={() => Promise.resolve([])}
        {...props}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('OptionsApp', () => {
  it('loads settings + allowlist and renders every settings section', async () => {
    await renderApp();
    expect(q('options-app')).not.toBeNull();
    expect(q('capture-options')).not.toBeNull(); // reused default-capture-options component
    expect(q(`scrubber-toggle-${SCRUBBER_TOGGLE_DEFS[0]!.id}`)).not.toBeNull();
    expect(q('ring-buffer-size')).not.toBeNull();
    expect(q('blocked-headers')).not.toBeNull();
    expect(container.textContent).toContain('https://a.com');
  });

  it('renders the report history section from the injected loader', async () => {
    await renderApp({
      loadHistory: () =>
        Promise.resolve([
          {
            id: 'cap-1',
            capturedAt: '2026-07-02T10:00:00.000Z',
            url: 'https://example.com/page',
            title: 'Example page',
            origin: 'https://example.com',
            filename: 'bugcase-example-com.zip',
            byteSize: 1536,
            artifacts: ['screenshot', 'metadata'],
            downloadId: 7,
            toolVersion: '0.1.0',
          },
        ]),
    });
    expect(q('report-history')).not.toBeNull();
    expect(qa('history-row')).toHaveLength(1);
    expect(container.textContent).toContain('Example page');
  });

  it('persists a default capture-option toggle', async () => {
    const persistSettings = passingPersist();
    await renderApp({ persistSettings });
    act(() => {
      (q('capture-option-domSnapshot') as HTMLInputElement).click();
    });
    expect(persistSettings).toHaveBeenCalledWith({
      defaultCaptureOptions: { ...DEFAULT_SETTINGS.defaultCaptureOptions, domSnapshot: true },
    });
  });

  it('persists a scrubber toggle', async () => {
    const persistSettings = passingPersist();
    await renderApp({ persistSettings });
    const id = SCRUBBER_TOGGLE_DEFS[0]!.id;
    act(() => {
      (q(`scrubber-toggle-${id}`) as HTMLInputElement).click();
    });
    expect(persistSettings).toHaveBeenCalledWith({
      scrubbers: { ...DEFAULT_SETTINGS.scrubbers, [id]: false },
    });
  });

  it('persists the max ring-buffer size', async () => {
    const persistSettings = passingPersist();
    await renderApp({ persistSettings });
    act(() => {
      typeInto(q('ring-buffer-size') as HTMLInputElement, '250');
    });
    expect(persistSettings).toHaveBeenCalledWith(
      expect.objectContaining({ maxRingBufferSize: 250 }),
    );
  });

  it('persists edited blocked headers as trimmed non-empty lines', async () => {
    const persistSettings = passingPersist();
    await renderApp({ persistSettings });
    act(() => {
      typeInto(q('blocked-headers') as HTMLTextAreaElement, 'authorization\n x-api-key \n\n');
    });
    expect(persistSettings).toHaveBeenCalledWith(
      expect.objectContaining({ blockedHeaders: ['authorization', 'x-api-key'] }),
    );
  });

  it('removes an allowlisted origin', async () => {
    const removeOrigin = vi.fn(() => Promise.resolve(['https://b.com']));
    await renderApp({
      loadAllowlist: () => Promise.resolve(['https://a.com', 'https://b.com']),
      removeOrigin,
    });
    await act(async () => {
      qa('allowlist-remove')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(removeOrigin).toHaveBeenCalledWith('https://a.com');
    expect(container.textContent).not.toContain('https://a.com');
  });

  it('adds a new origin to the allowlist', async () => {
    const addOrigin = vi.fn(() => Promise.resolve(['https://a.com', 'https://new.com']));
    await renderApp({ loadAllowlist: () => Promise.resolve(['https://a.com']), addOrigin });
    act(() => {
      typeInto(q('allowlist-add-input') as HTMLInputElement, 'https://new.com');
    });
    await act(async () => {
      q('allowlist-add')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(addOrigin).toHaveBeenCalledWith('https://new.com');
    expect(container.textContent).toContain('https://new.com');
  });

  it('falls back to defaults without throwing when loading fails', async () => {
    await renderApp({
      loadSettings: () => Promise.reject(new Error('boom')),
      loadAllowlist: () => Promise.reject(new Error('boom')),
    });
    expect(q('options-app')).not.toBeNull();
    expect(q('ring-buffer-size')).not.toBeNull();
  });
});
