// @vitest-environment jsdom
import { useRef, type RefObject } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DashboardPane } from '../router/hash-router';

import { useRouteFocus } from './focus';

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

function Harness({ pane }: { pane: DashboardPane }) {
  const mainRef = useRef<HTMLElement>(null);
  const announcement = useRouteFocus(pane, mainRef);
  return (
    <>
      <main ref={mainRef} tabIndex={-1} data-testid="main" />
      <p data-testid="live">{announcement}</p>
    </>
  );
}

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('useRouteFocus', () => {
  it('does not move focus or announce on first mount', () => {
    act(() => root.render(<Harness pane="overview" />));

    expect(document.activeElement).toBe(document.body);
    expect(q('live')!.textContent).toBe('');
  });

  it('moves focus to the target when the pane changes', () => {
    act(() => root.render(<Harness pane="overview" />));

    act(() => root.render(<Harness pane="console" />));

    expect(document.activeElement).toBe(q('main'));
  });

  it('announces the pane name when the pane changes', () => {
    act(() => root.render(<Harness pane="overview" />));

    act(() => root.render(<Harness pane="network" />));

    expect(q('live')!.textContent).toBe('Network');
  });

  it('does not re-announce when the pane is unchanged', () => {
    act(() => root.render(<Harness pane="overview" />));
    act(() => root.render(<Harness pane="console" />));
    q('main')!.blur();

    act(() => root.render(<Harness pane="console" />));

    expect(document.activeElement).toBe(document.body);
  });

  it('does not re-focus or re-announce when only the target ref identity changes for the same pane', () => {
    // `useRef` gives a stable ref identity, so re-rendering with the same pane never even re-runs
    // the effect (React bails out on the dependency array before the hook's own `previous === pane`
    // guard gets a chance to run). This harness hands the hook a brand-new ref object on every
    // render instead, forcing the effect to re-run on an unchanged pane so the guard is actually
    // exercised rather than masked by React's own bailout.
    function VolatileRefHarness({ pane }: { pane: DashboardPane }) {
      const freshRef: RefObject<HTMLElement> = { current: null };
      const announcement = useRouteFocus(pane, freshRef);
      return (
        <>
          <main ref={freshRef} tabIndex={-1} data-testid="main" />
          <p data-testid="live">{announcement}</p>
        </>
      );
    }

    act(() => root.render(<VolatileRefHarness pane="overview" />));
    act(() => root.render(<VolatileRefHarness pane="console" />));
    q('main')!.blur();

    act(() => root.render(<VolatileRefHarness pane="console" />));

    expect(document.activeElement).toBe(document.body);
    expect(q('live')!.textContent).toBe('Console');
  });

  it('does not throw when the target has not mounted', () => {
    function NoTarget({ pane }: { pane: DashboardPane }) {
      const ref = useRef<HTMLElement>(null);
      useRouteFocus(pane, ref);
      return null;
    }
    act(() => root.render(<NoTarget pane="overview" />));

    expect(() => act(() => root.render(<NoTarget pane="console" />))).not.toThrow();
  });
});
