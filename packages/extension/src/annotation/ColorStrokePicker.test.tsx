// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ColorStrokePicker, type ColorStrokePickerProps } from './ColorStrokePicker';
import { PRESET_COLORS, STROKE_WIDTHS } from './palette';

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
function qa(sel: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(sel)];
}

function render(props: Partial<ColorStrokePickerProps> = {}): void {
  act(() => {
    root.render(
      <ColorStrokePicker
        color={PRESET_COLORS[0]!}
        strokeWidth={STROKE_WIDTHS[1]!}
        onColorChange={() => {}}
        onStrokeWidthChange={() => {}}
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

describe('ColorStrokePicker', () => {
  it('renders a swatch for every preset color and a button for every width', () => {
    render();
    expect(q('color-stroke-pickers')).not.toBeNull();
    expect(qa('[data-testid^="color-swatch-"]')).toHaveLength(PRESET_COLORS.length);
    expect(qa('[data-testid^="stroke-width-"]')).toHaveLength(STROKE_WIDTHS.length);
  });

  it('reports the picked color', () => {
    const onColorChange = vi.fn();
    render({ onColorChange });
    click(q(`color-swatch-${PRESET_COLORS[3]!}`));
    expect(onColorChange).toHaveBeenCalledWith(PRESET_COLORS[3]);
  });

  it('marks the active color with aria-pressed', () => {
    render({ color: PRESET_COLORS[2]! });
    expect(q(`color-swatch-${PRESET_COLORS[2]!}`)?.getAttribute('aria-pressed')).toBe('true');
    expect(q(`color-swatch-${PRESET_COLORS[0]!}`)?.getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the picked stroke width', () => {
    const onStrokeWidthChange = vi.fn();
    render({ onStrokeWidthChange });
    click(q(`stroke-width-${STROKE_WIDTHS[2]!}`));
    expect(onStrokeWidthChange).toHaveBeenCalledWith(STROKE_WIDTHS[2]);
  });

  it('marks the active stroke width with aria-pressed', () => {
    render({ strokeWidth: STROKE_WIDTHS[0]! });
    expect(q(`stroke-width-${STROKE_WIDTHS[0]!}`)?.getAttribute('aria-pressed')).toBe('true');
    expect(q(`stroke-width-${STROKE_WIDTHS[2]!}`)?.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables every button when disabled', () => {
    render({ disabled: true });
    for (const btn of qa('button')) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
