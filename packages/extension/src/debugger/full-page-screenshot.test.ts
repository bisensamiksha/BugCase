import { describe, expect, it, vi } from 'vitest';

// Transitively imports lib/browser (via capture-visible-tab); stub the polyfill for node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { DebuggerSession } from './debugger-session';
import { captureFullPageScreenshot } from './full-page-screenshot';

/** Build a minimal valid PNG (signature + IHDR width/height) as base64, no encoder needed. */
function fakePngBase64(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG signature
  bytes.set([0, 0, 0, 13], 8); // IHDR chunk length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fakeSession(sendCommand: DebuggerSession['sendCommand']): DebuggerSession {
  return {
    target: { tabId: 1 },
    drainMs: 0,
    sendCommand,
    on: () => () => {},
  };
}

describe('captureFullPageScreenshot', () => {
  it('issues Page.captureScreenshot beyond the viewport from the surface', async () => {
    const sendCommand = vi.fn(() =>
      Promise.resolve({ data: fakePngBase64(800, 600) }),
    ) as unknown as DebuggerSession['sendCommand'];
    await captureFullPageScreenshot(fakeSession(sendCommand), { devicePixelRatio: 2 });
    expect(sendCommand).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    });
  });

  it('decodes the screenshot into a sized blob with the cdpFullPage method', async () => {
    const session = fakeSession(() => Promise.resolve({ data: fakePngBase64(1280, 4000) }));
    const shot = await captureFullPageScreenshot(session, { devicePixelRatio: 2 });
    expect(shot.width).toBe(1280);
    expect(shot.height).toBe(4000);
    expect(shot.devicePixelRatio).toBe(2);
    expect(shot.captureMethod).toBe('cdpFullPage');
    expect(shot.blob).toBeInstanceOf(Blob);
    expect(shot.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('throws when the CDP command returns no image data', async () => {
    const session = fakeSession(() => Promise.resolve({}));
    await expect(captureFullPageScreenshot(session, { devicePixelRatio: 1 })).rejects.toThrow(
      /no.*data/i,
    );
  });
});
