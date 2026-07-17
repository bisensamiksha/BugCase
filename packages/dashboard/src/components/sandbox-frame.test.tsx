// @vitest-environment jsdom
import { SNAPSHOT_CSP } from '@bugcase/shared-ui';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SandboxFrame } from './SandboxFrame';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderFrame(ui: React.ReactElement): HTMLIFrameElement {
  act(() => root.render(ui));
  const frame = container.querySelector('iframe');
  expect(frame).not.toBeNull();
  return frame!;
}

describe('SandboxFrame', () => {
  it('renders the only dashboard iframe allowed to hold captured HTML — fully locked down', () => {
    const frame = renderFrame(<SandboxFrame html="<p>captured</p>" title="DOM snapshot preview" />);
    expect(frame.title).toBe('DOM snapshot preview');
    // Empty sandbox = every restriction (opaque origin, no scripts). Never any allow-* token.
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('wraps the HTML with the shared network-blocking CSP in srcDoc', () => {
    const frame = renderFrame(<SandboxFrame html="<p>captured</p>" title="preview" />);
    expect(frame.getAttribute('srcdoc')).toContain(SNAPSHOT_CSP);
    expect(frame.getAttribute('srcdoc')).toContain('<p>captured</p>');
  });

  it('passes through a test id and className for layout', () => {
    const frame = renderFrame(
      <SandboxFrame html="x" title="p" data-testid="dom-preview-frame" className="h-full" />,
    );
    expect(frame.getAttribute('data-testid')).toBe('dom-preview-frame');
    expect(frame.className).toBe('h-full');
  });
});
