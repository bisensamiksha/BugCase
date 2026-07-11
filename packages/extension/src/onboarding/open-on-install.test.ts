import { describe, expect, it, vi } from 'vitest';

import { openOnboardingOnInstall } from './open-on-install';

describe('openOnboardingOnInstall', () => {
  it('opens the options page on a fresh install', async () => {
    const openOptionsPage = vi.fn(() => Promise.resolve());
    await openOnboardingOnInstall('install', { openOptionsPage });
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('does nothing on update or other reasons', async () => {
    const openOptionsPage = vi.fn(() => Promise.resolve());
    await openOnboardingOnInstall('update', { openOptionsPage });
    await openOnboardingOnInstall('browser_update', { openOptionsPage });
    await openOnboardingOnInstall('chrome_update', { openOptionsPage });
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('never throws when opening the options page rejects', async () => {
    const openOptionsPage = vi.fn(() => Promise.reject(new Error('no options page')));
    await expect(openOnboardingOnInstall('install', { openOptionsPage })).resolves.toBeUndefined();
  });
});
