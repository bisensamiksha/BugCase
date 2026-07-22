// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// React 18 needs this flag so act() flushes renders during tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  ANNOTATION_HOST_ID,
  isAnnotationMounted,
  mountAnnotation,
  removeAnnotation,
} from './annotation-root';

// The canvas's default peekAsset reaches lib/browser → runtime.sendMessage; stub the polyfill so the
// import succeeds in jsdom and the screenshot fetch resolves instead of throwing inside an effect.
vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false }) } },
}));

// Konva needs a real <canvas>; stub react-konva to plain divs so the surface mounts without a stage.
vi.mock('react-konva', async () => {
  const React = await import('react');
  const passthrough =
    (name: string) =>
    (props: { children?: React.ReactNode }): React.ReactElement =>
      React.createElement('div', { 'data-testid': `konva-${name}` }, props.children);
  return {
    Stage: passthrough('stage'),
    Layer: passthrough('layer'),
    Image: passthrough('image'),
    Rect: passthrough('rect'),
    Ellipse: passthrough('ellipse'),
    Arrow: passthrough('arrow'),
    Line: passthrough('line'),
    Text: passthrough('text'),
  };
});

const request = {
  reportId: 'r1',
  screenshot: {
    path: 'screenshots/viewport.png',
    width: 4,
    height: 4,
    devicePixelRatio: 1,
    captureMethod: 'visibleTab' as const,
    hasAnnotations: false,
  },
};

function stashRequest(): void {
  (window as unknown as Record<string, unknown>).__bugcaseAnnotationRequest = request;
}

afterEach(() => {
  removeAnnotation(document);
  delete (window as unknown as Record<string, unknown>).__bugcaseAnnotationRequest;
});

describe('annotation-root', () => {
  it('does nothing when there is no pending request', () => {
    expect(mountAnnotation(document)).toBe(false);
    expect(isAnnotationMounted(document)).toBe(false);
  });

  it('mounts its own host and renders the canvas from the stashed request', () => {
    stashRequest();
    act(() => {
      mountAnnotation(document);
    });
    const host = document.getElementById(ANNOTATION_HOST_ID);
    expect(host).not.toBeNull();
    expect(
      host?.shadowRoot?.querySelector('[data-testid="konva-annotation-canvas"]'),
    ).not.toBeNull();
  });

  it('is idempotent — a second mount while present is a no-op', () => {
    stashRequest();
    act(() => {
      mountAnnotation(document);
    });
    expect(mountAnnotation(document)).toBe(false);
  });

  it('reports the cancel outcome and removes the host on Cancel', () => {
    stashRequest();
    const outcomes: unknown[] = [];
    window.addEventListener('bugcase:annotation-result', (e) =>
      outcomes.push((e as CustomEvent).detail),
    );
    act(() => {
      mountAnnotation(document);
    });
    const shadow = document.getElementById(ANNOTATION_HOST_ID)!.shadowRoot!;
    act(() => {
      shadow
        .querySelector<HTMLButtonElement>('[data-testid="annotation-cancel"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(outcomes).toEqual([{ status: 'cancel' }]);
    expect(isAnnotationMounted(document)).toBe(false);
  });
});
