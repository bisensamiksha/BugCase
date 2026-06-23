import { BrowserInfoSchema } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import { collectBrowserInfo, type BrowserInfoSource } from './browser-info';

const chromium: BrowserInfoSource = {
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
  languages: ['en-US', 'en'],
  timezone: 'Europe/Stockholm',
  getHighEntropyValues: () =>
    Promise.resolve({
      brands: [{ brand: 'Chromium', version: '120' }],
      fullVersionList: [{ brand: 'Chromium', version: '120.0.6099.109' }],
      mobile: false,
      platform: 'macOS',
      platformVersion: '14.0.0',
      architecture: 'arm',
      bitness: '64',
    }),
};

const firefox: BrowserInfoSource = {
  userAgent: 'Mozilla/5.0 (Macintosh) Firefox/120.0',
  languages: ['en-GB'],
  timezone: 'Europe/London',
  // no getHighEntropyValues — Firefox has no navigator.userAgentData
};

describe('collectBrowserInfo', () => {
  it('collects UA-CH high-entropy values on Chromium', async () => {
    const info = await collectBrowserInfo({ source: chromium });
    expect(info.userAgent).toBe(chromium.userAgent);
    expect(info.languages).toEqual(['en-US', 'en']);
    expect(info.timezone).toBe('Europe/Stockholm');
    expect(info.userAgentData).toEqual({
      brands: [{ brand: 'Chromium', version: '120.0.6099.109' }], // prefers fullVersionList
      platform: 'macOS',
      platformVersion: '14.0.0',
      mobile: false,
      architecture: 'arm',
      bitness: '64',
    });
    expect(info.installedExtensions).toBeNull(); // S2-16
    expect(() => BrowserInfoSchema.parse(info)).not.toThrow();
  });

  it('falls back to userAgent only when UA-CH is unavailable (e.g. Firefox)', async () => {
    const info = await collectBrowserInfo({ source: firefox });
    expect(info.userAgent).toBe(firefox.userAgent);
    expect(info.userAgentData).toBeNull();
    expect(info.languages).toEqual(['en-GB']);
    expect(info.timezone).toBe('Europe/London');
    expect(() => BrowserInfoSchema.parse(info)).not.toThrow();
  });

  it('uses low-entropy brands when no fullVersionList is provided', async () => {
    const info = await collectBrowserInfo({
      source: {
        ...firefox,
        getHighEntropyValues: () =>
          Promise.resolve({ brands: [{ brand: 'Chromium', version: '120' }], mobile: true }),
      },
    });
    expect(info.userAgentData?.brands).toEqual([{ brand: 'Chromium', version: '120' }]);
    expect(info.userAgentData?.mobile).toBe(true);
    expect(info.userAgentData?.platform).toBeNull();
  });

  it('never throws when getHighEntropyValues rejects — userAgentData is null', async () => {
    const source: BrowserInfoSource = {
      ...firefox,
      getHighEntropyValues: vi.fn(() => Promise.reject(new Error('NotAllowed'))),
    };
    const info = await collectBrowserInfo({ source });
    expect(info.userAgentData).toBeNull();
    expect(info.userAgent).toBe(firefox.userAgent);
  });
});
