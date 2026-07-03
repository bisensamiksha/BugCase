// @vitest-environment jsdom
import type { ScreenshotRef } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The canvas default peekAsset reaches lib/browser; stub the polyfill so the import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

// Konva needs a real <canvas>, which jsdom lacks. Mock react-konva to plain divs; the Stage translates
// DOM mouse events into Konva-like events (target.getStage().getPointerPosition()) so we can drive drawing.
vi.mock('react-konva', async () => {
  const React = await import('react');
  const passthrough =
    (name: string) =>
    (props: { children?: React.ReactNode }): React.ReactElement =>
      React.createElement('div', { 'data-testid': `konva-${name}` }, props.children);
  const Stage = React.forwardRef(
    (
      props: {
        children?: React.ReactNode;
        onMouseDown?: (e: unknown) => void;
        onMouseMove?: (e: unknown) => void;
        onMouseUp?: (e: unknown) => void;
      },
      ref: React.Ref<HTMLDivElement>,
    ): React.ReactElement => {
      const wrap =
        (fn?: (e: unknown) => void) =>
        (e: { clientX: number; clientY: number }): void =>
          fn?.({
            target: {
              getStage: () => ({ getPointerPosition: () => ({ x: e.clientX, y: e.clientY }) }),
            },
          });
      return React.createElement(
        'div',
        {
          'data-testid': 'konva-stage',
          ref,
          onMouseDown: wrap(props.onMouseDown),
          onMouseMove: wrap(props.onMouseMove),
          onMouseUp: wrap(props.onMouseUp),
        },
        props.children,
      );
    },
  );
  return {
    Stage,
    Layer: passthrough('layer'),
    Image: passthrough('image'),
    Rect: passthrough('rect'),
    Ellipse: passthrough('ellipse'),
    Arrow: passthrough('arrow'),
    Line: passthrough('line'),
    Text: passthrough('text'),
    Group: passthrough('group'),
  };
});

import { KonvaAnnotationCanvas, type KonvaAnnotationCanvasProps } from './AnnotationCanvas';

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

const screenshot: ScreenshotRef = {
  path: 'raw/screenshot-viewport.png',
  width: 800,
  height: 600,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
};

const okPeek = () => Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });

async function render(props: Partial<KonvaAnnotationCanvasProps> = {}): Promise<void> {
  await act(async () => {
    root.render(
      <KonvaAnnotationCanvas
        reportId="r1"
        screenshot={screenshot}
        peekAsset={okPeek}
        onCancel={() => {}}
        onComplete={() => {}}
        {...props}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mouse(type: string, x: number, y: number): void {
  act(() => {
    q('konva-stage')?.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
    );
  });
}

describe('KonvaAnnotationCanvas', () => {
  it('renders the contract testid and reflects disabled via aria-busy', async () => {
    await render({ disabled: true });
    expect(q('konva-annotation-canvas')?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows the stage once the screenshot loads', async () => {
    await render();
    expect(q('konva-stage')).not.toBeNull();
    expect(q('konva-image')).not.toBeNull();
  });

  it('shows an error when the screenshot cannot be loaded', async () => {
    await render({ peekAsset: () => Promise.resolve({ ok: false, reason: 'expired' }) });
    expect(q('annotation-canvas-error')).not.toBeNull();
    expect(q('konva-stage')).toBeNull();
  });

  it('renders the toolbar and reflects the selected tool', async () => {
    await render();
    act(() => {
      q('tool-rect')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('tool-rect')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('draws a rectangle from a pointer drag', async () => {
    await render();
    act(() => {
      q('tool-rect')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(qa('konva-rect')).toHaveLength(0);
    mouse('mousedown', 10, 10);
    mouse('mousemove', 40, 30);
    mouse('mouseup', 40, 30);
    expect(qa('konva-rect')).toHaveLength(1);
  });

  it('completes with the Konva JSON and the flattened PNG data URL', async () => {
    const onComplete = vi.fn();
    await render({
      onComplete,
      serialize: () => 'STAGE_JSON',
      flatten: () => 'data:image/png;base64,FLAT',
    });
    act(() => {
      q('annotation-done')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledWith({
      konvaJson: 'STAGE_JSON',
      pngDataUrl: 'data:image/png;base64,FLAT',
    });
  });

  it('bakes redactions through the destructive compositor on Done', async () => {
    const onComplete = vi.fn();
    const bakeRedacted = vi.fn(() => 'data:image/png;base64,REDACTED');
    const flatten = vi.fn(() => 'data:image/png;base64,FLAT');
    await render({
      onComplete,
      screenshot: { ...screenshot, devicePixelRatio: 2 },
      availableSize: { width: 400, height: 300 }, // scale 0.5 → exportPixelRatio 2/0.5 = 4
      serialize: () => 'STAGE_JSON',
      flatten,
      bakeRedacted,
    });
    act(() => {
      q('tool-redact')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Pointer is in scaled-stage px; toImageSpace(/0.5) → image-space (20,20)→(80,60).
    mouse('mousedown', 10, 10);
    mouse('mousemove', 40, 30);
    mouse('mouseup', 40, 30);
    act(() => {
      q('annotation-done')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Redaction present → the destructive path runs, NOT the plain flatten.
    expect(flatten).not.toHaveBeenCalled();
    // Rects are dpr-scaled (×2) into the exported PNG's pixel space.
    expect(bakeRedacted).toHaveBeenCalledWith(4, [{ x: 40, y: 40, width: 120, height: 80 }]);
    expect(onComplete).toHaveBeenCalledWith({
      konvaJson: 'STAGE_JSON',
      pngDataUrl: 'data:image/png;base64,REDACTED',
    });
  });

  it('uses the plain flatten path when there are no redactions', async () => {
    const bakeRedacted = vi.fn(() => 'data:image/png;base64,REDACTED');
    await render({
      serialize: () => 'STAGE_JSON',
      flatten: () => 'data:image/png;base64,FLAT',
      bakeRedacted,
    });
    act(() => {
      q('annotation-done')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(bakeRedacted).not.toHaveBeenCalled();
  });

  it('keeps the background image on its own layer so drawing never redraws it', async () => {
    await render();
    act(() => {
      q('tool-rect')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    mouse('mousedown', 10, 10);
    mouse('mousemove', 40, 30);
    mouse('mouseup', 40, 30);

    const layers = qa('konva-layer');
    expect(layers.length).toBeGreaterThanOrEqual(2);
    const bgLayer = layers.find((l) => l.querySelector('[data-testid="konva-image"]'));
    expect(bgLayer).toBeTruthy();
    // The drawn rectangle must NOT live on the image's layer — that is what stops the multi-megapixel
    // screenshot from re-rasterising on every pointer move.
    expect(bgLayer!.querySelectorAll('[data-testid="konva-rect"]')).toHaveLength(0);
    expect(qa('konva-rect')).toHaveLength(1);
  });

  it('flattens at a pixel ratio that restores native resolution when scaled to fit', async () => {
    const flatten = vi.fn(() => 'data:image/png;base64,FLAT');
    await render({
      screenshot: { ...screenshot, devicePixelRatio: 2 },
      availableSize: { width: 400, height: 300 }, // scale = min(400/800, 300/600, 1) = 0.5
      serialize: () => 'STAGE_JSON', // the mock stage has no toJSON; inject to reach the flatten path
      flatten,
    });
    act(() => {
      q('annotation-done')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // devicePixelRatio / scale = 2 / 0.5 = 4 keeps the exported PNG at the original device dimensions.
    expect(flatten).toHaveBeenCalledWith(4);
  });

  it('cancels via the toolbar', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    act(() => {
      q('annotation-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('adds a text annotation via the text overlay', async () => {
    await render();
    act(() => {
      q('tool-text')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    mouse('mousedown', 20, 20);
    mouse('mouseup', 20, 20);
    const input = q('annotation-text-input') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();
    act(() => {
      const proto = HTMLTextAreaElement.prototype;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(input, 'Hello');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      // React maps onBlur to the bubbling native `focusout` event, not `blur`.
      input!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(qa('konva-text')).toHaveLength(1);
  });
});
