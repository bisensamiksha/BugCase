// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useZoomPan } from './useZoomPan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

function Harness() {
  const zp = useZoomPan();
  return (
    <div>
      <span data-testid="scale">{zp.scale}</span>
      <span data-testid="transform">{zp.transform}</span>
      <span data-testid="ismin">{String(zp.isMin)}</span>
      <button data-testid="in" onClick={() => zp.zoomIn()} />
      <button data-testid="out" onClick={() => zp.zoomOut()} />
      <button data-testid="reset" onClick={() => zp.reset()} />
      <button data-testid="pan" onClick={() => zp.panBy(10, 5)} />
      <button data-testid="wheelin" onClick={() => zp.zoomBy(2)} />
    </div>
  );
}

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const click = (id: string) =>
  act(() => {
    q(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useZoomPan', () => {
  it('starts at fit (scale 1, isMin true, identity transform)', () => {
    expect(q('scale').textContent).toBe('1');
    expect(q('ismin').textContent).toBe('true');
    expect(q('transform').textContent).toBe('translate(0px, 0px) scale(1)');
  });

  it('zoomIn multiplies by the step and clears isMin', () => {
    click('in');
    expect(q('scale').textContent).toBe('1.25');
    expect(q('ismin').textContent).toBe('false');
  });

  it('does not zoom out below fit', () => {
    click('out');
    expect(q('scale').textContent).toBe('1');
  });

  it('clamps zoom-in at MAX_SCALE', () => {
    for (let i = 0; i < 12; i += 1) click('in');
    expect(q('scale').textContent).toBe('8');
  });

  it('pans only when zoomed in', () => {
    click('pan'); // at fit → no-op
    expect(q('transform').textContent).toBe('translate(0px, 0px) scale(1)');
    click('in');
    click('pan');
    expect(q('transform').textContent).toBe('translate(10px, 5px) scale(1.25)');
  });

  it('reset returns to fit and clears the offset', () => {
    click('in');
    click('pan');
    click('reset');
    expect(q('transform').textContent).toBe('translate(0px, 0px) scale(1)');
  });

  it('zoomBy zooms by an arbitrary factor (wheel)', () => {
    click('wheelin');
    expect(q('scale').textContent).toBe('2');
  });
});
