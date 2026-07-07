// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import { PICKER_HIGHLIGHT_ID, installElementPicker } from './element-picker';

let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
});

function move(el: Element): void {
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}
function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('installElementPicker', () => {
  it('shows a highlight over the hovered element', () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    const handle = installElementPicker(document, { onPick: () => {} });
    stop = handle.stop;
    const highlight = document.getElementById(PICKER_HIGHLIGHT_ID);
    expect(highlight).not.toBeNull();
    move(document.getElementById('go') as Element);
    expect(highlight?.style.display).toBe('block');
  });

  it('calls onPick with the clicked element', () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    const onPick = vi.fn();
    const handle = installElementPicker(document, { onPick });
    stop = handle.stop;
    click(document.getElementById('go') as Element);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toBe(document.getElementById('go'));
  });

  it('keeps picking after a click (multiple inspections)', () => {
    document.body.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    const onPick = vi.fn();
    const handle = installElementPicker(document, { onPick });
    stop = handle.stop;
    click(document.getElementById('a') as Element);
    click(document.getElementById('b') as Element);
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it('ignores clicks on BugCase’s own UI', () => {
    document.body.innerHTML = `<div id="${OVERLAY_HOST_ID}"><button id="done">Done</button></div>`;
    const onPick = vi.fn();
    const handle = installElementPicker(document, { onPick });
    stop = handle.stop;
    click(document.getElementById('done') as Element);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    const handle = installElementPicker(document, { onPick: () => {}, onCancel });
    stop = handle.stop;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('removes the highlight and stops picking on stop()', () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    const onPick = vi.fn();
    const handle = installElementPicker(document, { onPick });
    handle.stop();
    stop = undefined;
    expect(document.getElementById(PICKER_HIGHLIGHT_ID)).toBeNull();
    click(document.getElementById('go') as Element);
    expect(onPick).not.toHaveBeenCalled();
  });
});
