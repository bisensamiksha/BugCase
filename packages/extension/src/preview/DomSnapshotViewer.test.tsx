// @vitest-environment jsdom
import type { DomSnapshot } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  SandboxedDomSnapshotViewer,
  type SandboxedDomSnapshotViewerProps,
} from './DomSnapshotViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HTML = '<html><head><title>t</title></head><body><h1>Hi café 🚀</h1></body></html>';

const snapshot: DomSnapshot = {
  schemaVersion: 'v1',
  contentPath: 'raw/dom-snapshot.html',
  byteSize: 123,
  scrubbed: true,
  scrubberHits: 2,
};

/** Build the same `data:text/plain;base64,…` URL the SW peek bridge returns for held HTML. */
function base64DataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return `data:text/plain;base64,${btoa(binary)}`;
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(props: Partial<SandboxedDomSnapshotViewerProps> = {}) {
  const peekAsset =
    props.peekAsset ?? (() => Promise.resolve({ ok: true, dataUrl: base64DataUrl(HTML) }));
  await act(async () => {
    root.render(
      <SandboxedDomSnapshotViewer
        reportId="r1"
        snapshot={snapshot}
        {...props}
        peekAsset={peekAsset}
      />,
    );
    await Promise.resolve();
    await Promise.resolve(); // flush peek → decode → setState
  });
}

function press(key: string) {
  act(() => {
    q('sandboxed-dom-snapshot-viewer')!.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SandboxedDomSnapshotViewer', () => {
  it('renders the decoded snapshot in the iframe and raw side panel', async () => {
    await render();
    const iframe = q('dom-iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('srcdoc')).toContain('Hi café 🚀');
    expect(q('dom-raw')?.textContent).toContain('<h1>Hi café 🚀</h1>');
  });

  it('locks the iframe sandbox: no scripts, no same-origin', async () => {
    await render();
    const iframe = q('dom-iframe') as HTMLIFrameElement;
    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('injects a network-blocking CSP into the iframe document', async () => {
    await render();
    const iframe = q('dom-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain("default-src 'none'");
  });

  it('shows a loading state until the asset resolves', async () => {
    await render({ peekAsset: () => new Promise(() => {}) });
    expect(q('dom-loading')).not.toBeNull();
    expect(q('dom-iframe')).toBeNull();
  });

  it('shows an error state when the hold expired (no throw)', async () => {
    await render({ peekAsset: () => Promise.resolve({ ok: false, reason: 'expired' }) });
    expect(q('dom-iframe')).toBeNull();
    expect(q('dom-error')).not.toBeNull();
  });

  it('shows an error state without peeking when there is no reportId', async () => {
    const peekAsset = vi.fn(() => Promise.resolve({ ok: true, dataUrl: base64DataUrl(HTML) }));
    await act(async () => {
      root.render(
        <SandboxedDomSnapshotViewer
          snapshot={snapshot}
          peekAsset={peekAsset}
          onCancel={() => {}}
        />,
      );
      await Promise.resolve();
    });
    expect(q('dom-error')).not.toBeNull();
    expect(peekAsset).not.toHaveBeenCalled();
  });

  it('shows an error state when the asset payload cannot be decoded', async () => {
    await render({ peekAsset: () => Promise.resolve({ ok: true, dataUrl: 'not-a-data-url' }) });
    expect(q('dom-error')).not.toBeNull();
    expect(q('dom-iframe')).toBeNull();
  });

  it('shows an error state when peekAsset rejects (no throw)', async () => {
    await render({ peekAsset: () => Promise.reject(new Error('boom')) });
    expect(q('dom-error')).not.toBeNull();
  });

  it('closes on Escape and from the × button', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    press('Escape');
    act(() => {
      q('dom-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('copies the raw HTML and reports success', async () => {
    const copyText = vi.fn(() => Promise.resolve());
    await render({ copyText });
    await act(async () => {
      q('dom-copy')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copyText).toHaveBeenCalledWith(HTML);
    expect(q('dom-copy-status')?.textContent).toMatch(/copied/i);
  });

  it('marks aria-busy and ignores Escape when disabled', async () => {
    const onCancel = vi.fn();
    await render({ disabled: true, onCancel });
    expect(q('sandboxed-dom-snapshot-viewer')?.getAttribute('aria-busy')).toBe('true');
    press('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
