// @vitest-environment jsdom
import { useRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFocusable, useFocusRestore, useFocusTrap } from './focus';

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

function Trapped({ onEscape }: { onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { onEscape });
  return (
    // tabIndex={-1} makes the container itself focusable via script, matching how Lightbox's
    // sectionRef focuses its own container on mount (Lightbox.tsx:100) — that is the normal
    // starting state for the component this hook is written for.
    <div ref={ref} data-testid="trap" tabIndex={-1}>
      <button data-testid="first">first</button>
      <button data-testid="last">last</button>
    </div>
  );
}

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function tab(shift = false) {
  act(() => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }),
    );
  });
}

describe('getFocusable', () => {
  it('finds interactive descendants in DOM order', () => {
    const root2 = document.createElement('div');
    root2.innerHTML = `<a href="#a">a</a><button>b</button><input /><div>plain</div>`;
    document.body.appendChild(root2);

    expect(getFocusable(root2).map((el) => el.tagName)).toEqual(['A', 'BUTTON', 'INPUT']);
    root2.remove();
  });

  it('skips disabled controls, negative tabindex and hidden subtrees', () => {
    const root2 = document.createElement('div');
    root2.innerHTML = `
      <button disabled>no</button>
      <button tabindex="-1">no</button>
      <div hidden><button>no</button></div>
      <button>yes</button>`;
    document.body.appendChild(root2);

    expect(getFocusable(root2)).toHaveLength(1);
    root2.remove();
  });
});

describe('useFocusTrap', () => {
  it('wraps Tab from the last element back to the first', () => {
    act(() => root.render(<Trapped />));
    q('last')!.focus();

    tab();

    expect(document.activeElement).toBe(q('first'));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    act(() => root.render(<Trapped />));
    q('first')!.focus();

    tab(true);

    expect(document.activeElement).toBe(q('last'));
  });

  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    act(() => root.render(<Trapped onEscape={onEscape} />));
    q('first')!.focus();

    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('does not throw when the container holds nothing focusable', () => {
    function Empty() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref);
      return <div ref={ref} data-testid="trap" />;
    }
    act(() => root.render(<Empty />));

    expect(() => tab()).not.toThrow();
  });

  it('wraps Shift+Tab from the container itself to the last focusable', () => {
    // Lightbox focuses its own container on mount (Lightbox.tsx:100), so "focus is on the
    // container" is the normal starting state for the component that consumes this hook, not an
    // edge case.
    act(() => root.render(<Trapped />));
    q('trap')!.focus();
    expect(document.activeElement).toBe(q('trap'));

    tab(true);

    expect(document.activeElement).toBe(q('last'));
  });

  it('leaves plain Tab from the container to native tab order', () => {
    // A tabIndex={-1} container is skipped by the browser's own tab order, so native Tab already
    // lands on the first tabbable descendant without any help from the trap. Intercepting it here
    // would fight the browser rather than assist it — do not "fix" this by adding an
    // active === container branch to the non-shift arm.
    act(() => root.render(<Trapped />));
    q('trap')!.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      q('trap')!.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('useFocusRestore', () => {
  it('returns focus to the previously focused element when it closes', () => {
    const opener = document.createElement('button');
    opener.dataset.testid = 'opener';
    document.body.appendChild(opener);
    opener.focus();

    function Modal({ open }: { open: boolean }) {
      useFocusRestore(open);
      return open ? <button data-testid="inside">inside</button> : null;
    }

    act(() => root.render(<Modal open />));
    q('inside')!.focus();
    expect(document.activeElement).toBe(q('inside'));

    act(() => root.render(<Modal open={false} />));

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('does not steal focus when the opener has left the document', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    function Modal({ open }: { open: boolean }) {
      useFocusRestore(open);
      return null;
    }

    act(() => root.render(<Modal open />));
    opener.remove();

    expect(() => act(() => root.render(<Modal open={false} />))).not.toThrow();
  });
});
