import { describe, expect, it } from 'vitest';

import { BUG_REPORT_ZIP_LAYOUT, listZipPaths } from './zip-layout';

describe('BUG_REPORT_ZIP_LAYOUT', () => {
  it('represents every required canonical path', () => {
    expect(BUG_REPORT_ZIP_LAYOUT.manifest).toBe('manifest.json');
    expect(BUG_REPORT_ZIP_LAYOUT.report).toBe('report.json');
    expect(BUG_REPORT_ZIP_LAYOUT.metadata).toBe('metadata.json');
    expect(BUG_REPORT_ZIP_LAYOUT.reportHtml).toBe('report.html');

    expect(BUG_REPORT_ZIP_LAYOUT.screenshots.dir).toBe('screenshots');
    expect(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport).toBe('screenshots/viewport.png');
    expect(BUG_REPORT_ZIP_LAYOUT.screenshots.fullPage).toBe('screenshots/full-page.png');

    expect(BUG_REPORT_ZIP_LAYOUT.annotations.dir).toBe('annotations');

    expect(BUG_REPORT_ZIP_LAYOUT.raw.dir).toBe('raw');
    expect(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot).toBe('raw/dom-snapshot.html');
    expect(BUG_REPORT_ZIP_LAYOUT.raw.console).toBe('raw/console.json');
    expect(BUG_REPORT_ZIP_LAYOUT.raw.network).toBe('raw/network.json');
  });

  it('is frozen at runtime so the shared constants cannot drift', () => {
    expect(Object.isFrozen(BUG_REPORT_ZIP_LAYOUT)).toBe(true);
    expect(Object.isFrozen(BUG_REPORT_ZIP_LAYOUT.screenshots)).toBe(true);
    expect(Object.isFrozen(BUG_REPORT_ZIP_LAYOUT.raw)).toBe(true);
  });
});

describe('listZipPaths', () => {
  it('returns every canonical path as a flat, non-empty list', () => {
    const paths = listZipPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('metadata.json');
    expect(paths).toContain('report.json');
    expect(paths).toContain('report.html');
    expect(paths).toContain('screenshots/viewport.png');
    expect(paths).toContain('annotations');
    expect(paths).toContain('raw/network.json');
  });

  it('returns no duplicate paths', () => {
    const paths = listZipPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('returns an empty list for an empty layout without throwing', () => {
    expect(() => listZipPaths({})).not.toThrow();
    expect(listZipPaths({})).toEqual([]);
  });

  it('handles a nested empty layout without throwing', () => {
    expect(listZipPaths({ a: {}, b: { c: {} } })).toEqual([]);
  });
});

describe('canonical path hygiene', () => {
  const paths = listZipPaths();

  it('has no path with a leading slash', () => {
    const offenders = paths.filter((p) => p.startsWith('/'));
    expect(offenders).toEqual([]);
  });

  it('has no path with a duplicate separator', () => {
    const offenders = paths.filter((p) => p.includes('//'));
    expect(offenders).toEqual([]);
  });

  it('has no path with a trailing slash', () => {
    const offenders = paths.filter((p) => p.endsWith('/'));
    expect(offenders).toEqual([]);
  });

  it('uses forward slashes only (POSIX zip entry names)', () => {
    const offenders = paths.filter((p) => p.includes('\\'));
    expect(offenders).toEqual([]);
  });

  it('nests file paths under their declared directory', () => {
    const { screenshots, raw } = BUG_REPORT_ZIP_LAYOUT;
    expect(screenshots.viewport.startsWith(`${screenshots.dir}/`)).toBe(true);
    expect(screenshots.fullPage.startsWith(`${screenshots.dir}/`)).toBe(true);
    expect(raw.domSnapshot.startsWith(`${raw.dir}/`)).toBe(true);
    expect(raw.console.startsWith(`${raw.dir}/`)).toBe(true);
    expect(raw.network.startsWith(`${raw.dir}/`)).toBe(true);
  });
});
