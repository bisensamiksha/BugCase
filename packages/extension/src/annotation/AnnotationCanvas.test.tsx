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

  it('completes with the serialized annotation JSON', async () => {
    const onComplete = vi.fn();
    await render({ onComplete, serialize: () => 'STAGE_JSON' });
    act(() => {
      q('annotation-done')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledWith('STAGE_JSON');
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
