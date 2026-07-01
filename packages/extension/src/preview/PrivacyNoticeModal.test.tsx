// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivacyNoticeModal, type PrivacyNoticeModalProps } from './PrivacyNoticeModal';
import type { PrivacySummary } from './privacy-summary';

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

const summaryWithData: PrivacySummary = {
  permissions: ['cookies', 'downloads'],
  scrubbers: [
    { id: 'dom-password-input-mask', description: 'Mask password inputs', hits: 2 },
    { id: 'dom-all-input-mask', description: 'Mask input values', hits: 1 },
  ],
  totalScrubberHits: 3,
};

const emptySummary: PrivacySummary = { permissions: [], scrubbers: [], totalScrubberHits: 0 };

function render(props: Partial<PrivacyNoticeModalProps> = {}): void {
  act(() => {
    root.render(<PrivacyNoticeModal summary={summaryWithData} {...props} />);
  });
}

describe('PrivacyNoticeModal', () => {
  it('renders the modal and references the current scrubber + permission state', () => {
    render();
    expect(q('privacy-notice-modal')).not.toBeNull();
    expect(q('privacy-scrubber-summary')?.textContent).toContain('3');
    expect(q('privacy-notice-modal')?.textContent).toContain('Mask password inputs');
    expect(q('privacy-permissions')?.textContent).toContain('cookies');
    expect(q('privacy-permissions')?.textContent).toContain('downloads');
  });

  it('keeps the confirm button disabled until "I understand" is checked', () => {
    const onComplete = vi.fn();
    render({ onComplete });
    const confirm = q('privacy-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    expect((q('privacy-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onComplete only after consent is given and confirm is clicked', () => {
    const onComplete = vi.fn();
    render({ onComplete });

    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    act(() => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel from the cancel button', () => {
    const onCancel = vi.fn();
    render({ onCancel });
    act(() => {
      q('privacy-cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps confirm disabled while disabled=true even after consent', () => {
    const onComplete = vi.fn();
    render({ onComplete, disabled: true });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    expect((q('privacy-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders an empty summary without throwing and still gates on consent', () => {
    act(() => {
      root.render(<PrivacyNoticeModal summary={emptySummary} />);
    });
    expect(q('privacy-notice-modal')).not.toBeNull();
    expect((q('privacy-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(q('privacy-scrubber-summary')?.textContent).toMatch(/no sensitive/i);
  });
});
