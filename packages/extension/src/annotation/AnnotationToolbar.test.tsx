// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationToolbar, type AnnotationToolbarProps } from './AnnotationToolbar';
import type { ToolId } from './tools';

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

function render(props: Partial<AnnotationToolbarProps> = {}): void {
  act(() => {
    root.render(
      <AnnotationToolbar
        tool="select"
        canUndo={false}
        canRedo={false}
        onSelectTool={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onClear={() => {}}
        onDone={() => {}}
        onCancel={() => {}}
        {...props}
      />,
    );
  });
}

function click(el: HTMLElement | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const TOOLS: ToolId[] = [
  'select',
  'arrow',
  'rect',
  'ellipse',
  'text',
  'freehand',
  'redact',
  'eraser',
];

describe('AnnotationToolbar', () => {
  it('renders a button for every tool', () => {
    render();
    for (const t of TOOLS) {
      expect(q(`tool-${t}`)).not.toBeNull();
    }
  });

  it('selecting a tool calls onSelectTool with its id', () => {
    const onSelectTool = vi.fn();
    render({ onSelectTool });
    click(q('tool-rect'));
    expect(onSelectTool).toHaveBeenCalledWith('rect');
  });

  it('marks the active tool with aria-pressed', () => {
    render({ tool: 'arrow' });
    expect(q('tool-arrow')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('tool-rect')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables undo/redo when there is no history', () => {
    render({ canUndo: false, canRedo: false });
    expect((q('annotation-undo') as HTMLButtonElement).disabled).toBe(true);
    expect((q('annotation-redo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables and fires undo/redo when history exists', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render({ canUndo: true, canRedo: true, onUndo, onRedo });
    expect((q('annotation-undo') as HTMLButtonElement).disabled).toBe(false);
    click(q('annotation-undo'));
    click(q('annotation-redo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('fires clear, done, and cancel', () => {
    const onClear = vi.fn();
    const onDone = vi.fn();
    const onCancel = vi.fn();
    render({ onClear, onDone, onCancel });
    click(q('annotation-clear'));
    click(q('annotation-done'));
    click(q('annotation-cancel'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
