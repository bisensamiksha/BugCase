// @vitest-environment jsdom
import type { UserInput } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserReportForm } from './UserReportForm';
import { USER_REPORT_DEFAULTS } from './user-report-state';

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

function field<T extends HTMLElement>(testId: string): T {
  const el = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!el) {
    throw new Error(`missing field ${testId}`);
  }
  return el;
}

/**
 * Type into a controlled textarea the way React expects: React installs a value tracker that
 * swallows a plain `.value` assignment, so set through the native prototype setter to make React
 * register the change, then dispatch the `input` event.
 */
function typeInto(el: HTMLTextAreaElement, next: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked below via .call with an explicit receiver
  const setNativeValue = descriptor?.set;
  setNativeValue?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function render(value: UserInput, onChange: (next: UserInput) => void, disabled = false): void {
  act(() => {
    root.render(<UserReportForm value={value} onChange={onChange} disabled={disabled} />);
  });
}

describe('UserReportForm', () => {
  it('reflects the current value in every control', () => {
    const value: UserInput = {
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: 'open the page',
      severity: 'major',
      notes: 'happens twice',
    };
    render(value, () => {});

    expect(field<HTMLSelectElement>('user-report-severity').value).toBe('major');
    expect(field<HTMLTextAreaElement>('user-report-steps').value).toBe('open the page');
    expect(field<HTMLTextAreaElement>('user-report-notes').value).toBe('happens twice');
  });

  it('emits the chosen severity on change', () => {
    const onChange = vi.fn();
    render(USER_REPORT_DEFAULTS, onChange);

    const select = field<HTMLSelectElement>('user-report-severity');
    act(() => {
      select.value = 'critical';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', notes: '', stepsToReproduce: '' }),
    );
  });

  it('emits typed steps on input', () => {
    const onChange = vi.fn();
    render(USER_REPORT_DEFAULTS, onChange);

    const steps = field<HTMLTextAreaElement>('user-report-steps');
    act(() => {
      typeInto(steps, '1. click');
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ stepsToReproduce: '1. click' }),
    );
  });

  it('emits typed notes on input', () => {
    const onChange = vi.fn();
    render(USER_REPORT_DEFAULTS, onChange);

    const notes = field<HTMLTextAreaElement>('user-report-notes');
    act(() => {
      typeInto(notes, 'extra context');
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notes: 'extra context' }));
  });

  it('disables every control when disabled', () => {
    render(USER_REPORT_DEFAULTS, () => {}, true);

    expect(field<HTMLSelectElement>('user-report-severity').disabled).toBe(true);
    expect(field<HTMLTextAreaElement>('user-report-steps').disabled).toBe(true);
    expect(field<HTMLTextAreaElement>('user-report-notes').disabled).toBe(true);
  });
});
