import { CaptureMetadataSchema } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { detectBrowserBuildTarget } from './browser-target';
import { type MetadataSource, collectCaptureMetadata } from './metadata';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const baseSource: MetadataSource = {
  userAgent: CHROME_UA,
  brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
  isBrave: undefined,
  language: 'en-US',
  innerWidth: 1280,
  innerHeight: 800,
  outerWidth: 1280,
  outerHeight: 900,
  devicePixelRatio: 2,
  screenWidth: 1920,
  screenHeight: 1080,
  orientation: 'landscape-primary',
  referrer: 'https://ref.example/',
};

const fixedOpts = {
  toolVersion: '0.0.1',
  now: () => new Date('2026-06-13T12:00:00.000Z'),
  generateId: () => '00000000-0000-4000-8000-000000000000',
};

describe('collectCaptureMetadata', () => {
  it('produces metadata that validates against CaptureMetadataSchema', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/path', title: 'Example' },
      { source: baseSource, ...fixedOpts },
    );
    expect(() => CaptureMetadataSchema.parse(meta)).not.toThrow();
  });

  it('fills page metadata from input and the source', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/path?q=1', title: 'Example' },
      { source: baseSource, ...fixedOpts },
    );
    expect(meta.page).toEqual({
      url: 'https://example.com/path?q=1',
      title: 'Example',
      origin: 'https://example.com',
      capturedAt: '2026-06-13T12:00:00.000Z',
      referrer: 'https://ref.example/',
    });
  });

  it('captures viewport, screen, DPR, and a zoom estimate', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/', title: 'x' },
      { source: { ...baseSource, innerWidth: 1000, outerWidth: 1200 }, ...fixedOpts },
    );
    expect(meta.viewport.innerWidth).toBe(1000);
    expect(meta.viewport.screenWidth).toBe(1920);
    expect(meta.viewport.devicePixelRatio).toBe(2);
    expect(meta.viewport.zoomEstimate).toBeCloseTo(1.2);
    expect(meta.viewport.orientation).toBe('landscape-primary');
  });

  it('builds tool metadata with the detected build target', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/', title: 'x' },
      { source: baseSource, ...fixedOpts },
    );
    expect(meta.tool).toEqual({
      name: 'bugcase',
      version: '0.0.1',
      schemaVersion: 'v1',
      browserBuildTarget: 'chrome',
    });
  });

  it('defaults permissions, scrubbers, and user options', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/', title: 'x' },
      { source: baseSource, ...fixedOpts },
    );
    expect(meta.permissionsAtCapture).toEqual([]);
    expect(meta.scrubbersApplied).toEqual([]);
    expect(meta.userOptions.viewportScreenshot).toBe(true);
    expect(meta.userOptions.cookies).toBe(false);
  });

  it('passes through provided permissions and scrubbers', async () => {
    const meta = await collectCaptureMetadata(
      { tabId: 1, url: 'https://example.com/', title: 'x' },
      {
        source: baseSource,
        ...fixedOpts,
        permissionsAtCapture: [{ name: 'activeTab', grantedAtCapture: true }],
        scrubbersApplied: [{ id: 'r', description: 'd', hits: 2 }],
      },
    );
    expect(meta.permissionsAtCapture).toEqual([{ name: 'activeTab', grantedAtCapture: true }]);
    expect(meta.scrubbersApplied).toEqual([{ id: 'r', description: 'd', hits: 2 }]);
  });

  it('handles a zero/empty source without throwing and stays schema-valid', async () => {
    const empty: MetadataSource = {
      userAgent: '',
      language: null,
      innerWidth: 0,
      innerHeight: 0,
      outerWidth: 0,
      outerHeight: 0,
      devicePixelRatio: 0,
      screenWidth: 0,
      screenHeight: 0,
      orientation: null,
      referrer: null,
    };
    const meta = await collectCaptureMetadata(
      { tabId: 0, url: 'about:blank', title: '' },
      { source: empty, ...fixedOpts },
    );
    expect(meta.viewport.devicePixelRatio).toBe(1);
    expect(meta.viewport.zoomEstimate).toBe(1);
    expect(meta.tool.browserBuildTarget).toBe('unknown');
    expect(() => CaptureMetadataSchema.parse(meta)).not.toThrow();
  });
});

describe('detectBrowserBuildTarget', () => {
  it('detects Chrome', async () => {
    expect(await detectBrowserBuildTarget({ userAgent: CHROME_UA })).toBe('chrome');
  });

  it('detects Firefox', async () => {
    expect(
      await detectBrowserBuildTarget({
        userAgent: 'Mozilla/5.0 (X11) Gecko/20100101 Firefox/121.0',
      }),
    ).toBe('firefox');
  });

  it('detects Edge before Chrome', async () => {
    expect(await detectBrowserBuildTarget({ userAgent: `${CHROME_UA} Edg/120.0.0.0` })).toBe(
      'edge',
    );
  });

  it('detects Brave via the async isBrave() probe', async () => {
    expect(
      await detectBrowserBuildTarget({
        userAgent: CHROME_UA,
        isBrave: () => Promise.resolve(true),
      }),
    ).toBe('brave');
  });

  it('falls back to unknown for an unrecognized UA', async () => {
    expect(await detectBrowserBuildTarget({ userAgent: 'some weird agent' })).toBe('unknown');
  });
});
