// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RedactTextPanel → lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { REDACT_TEXT, type RedactTextRequest } from '../background/messages';

import { RedactTextPanel } from './RedactTextPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET = 'SUPERSECRET123';

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

function q<T extends HTMLElement>(testId: string): T {
  const el = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!el) {
    throw new Error(`missing [data-testid="${testId}"]`);
  }
  return el;
}

function mount(props: Parameters<typeof RedactTextPanel>[0]): void {
  act(() => {
    root.render(<RedactTextPanel {...props} />);
  });
}

/** Set a controlled input's value the way React's onChange expects. */
function type(value: string): void {
  const input = q<HTMLInputElement>('redact-text-input');
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const setValue = descriptor?.set?.bind(input);
  act(() => {
    setValue?.(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(testId: string): void {
  act(() => {
    q(testId).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('RedactTextPanel', () => {
  it('sends REDACT_TEXT with the typed string and the reportId', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, reportHits: 2, assetHits: 1 });
    mount({ reportId: 'r1', send });
    type(SECRET);
    click('redact-text-apply');
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual<RedactTextRequest>({
      type: REDACT_TEXT,
      reportId: 'r1',
      secret: SECRET,
    });
  });

  it('reports how many occurrences were removed', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, reportHits: 2, assetHits: 1 });
    mount({ reportId: 'r1', send });
    type(SECRET);
    click('redact-text-apply');
    await flush();

    expect(q('redact-text-status').textContent).toContain('3 occurrences');
  });

  it('clears the field afterwards so the secret does not linger on screen', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, reportHits: 1, assetHits: 0 });
    mount({ reportId: 'r1', send });
    type(SECRET);
    click('redact-text-apply');
    await flush();

    expect(q<HTMLInputElement>('redact-text-input').value).toBe('');
  });

  it('says so plainly when the string is not present', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, reportHits: 0, assetHits: 0 });
    mount({ reportId: 'r1', send });
    type('absent');
    click('redact-text-apply');
    await flush();

    expect(q('redact-text-status').textContent).toContain('Not found');
  });

  it('surfaces a handled failure as an alert', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, reason: 'This capture expired.' });
    mount({ reportId: 'r1', send });
    type(SECRET);
    click('redact-text-apply');
    await flush();

    const status = q('redact-text-status');
    expect(status.getAttribute('role')).toBe('alert');
    expect(status.textContent).toContain('expired');
  });

  it('surfaces a thrown error instead of leaving a stuck spinner', async () => {
    const send = vi.fn().mockRejectedValue(new Error('port closed'));
    mount({ reportId: 'r1', send });
    type(SECRET);
    click('redact-text-apply');
    await flush();

    expect(q('redact-text-status').textContent).toContain('port closed');
    expect(q<HTMLButtonElement>('redact-text-apply').textContent).toBe('Redact');
  });

  it('disables Redact until something non-blank is typed', () => {
    mount({ reportId: 'r1', send: vi.fn() });
    expect(q<HTMLButtonElement>('redact-text-apply').disabled).toBe(true);
    type('   ');
    expect(q<HTMLButtonElement>('redact-text-apply').disabled).toBe(true);
    type('x');
    expect(q<HTMLButtonElement>('redact-text-apply').disabled).toBe(false);
  });

  it('states that images are not covered (BUG-01 honesty)', () => {
    mount({ reportId: 'r1', send: vi.fn() });
    const text = q('redact-text-panel').textContent ?? '';
    expect(text).toContain('Annotate');
    expect(text).toContain('not');
  });

  it('never sends when the field is blank', () => {
    const send = vi.fn();
    mount({ reportId: 'r1', send });
    click('redact-text-apply');
    expect(send).not.toHaveBeenCalled();
  });
});
