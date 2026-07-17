import { describe, expect, it } from 'vitest';

import { DOM_SANDBOX, SNAPSHOT_CSP, buildSandboxSrcDoc } from './sandbox-html';

describe('DOM_SANDBOX', () => {
  it('grants neither scripts nor same-origin (maximally restrictive)', () => {
    expect(DOM_SANDBOX).toBe('');
    expect(DOM_SANDBOX).not.toContain('allow-scripts');
    expect(DOM_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('SNAPSHOT_CSP', () => {
  it('blocks every network fetch, allowing only inline styles and data: assets', () => {
    expect(SNAPSHOT_CSP).toContain("default-src 'none'");
    expect(SNAPSHOT_CSP).toContain("style-src 'unsafe-inline'");
    expect(SNAPSHOT_CSP).toContain('img-src data:');
    expect(SNAPSHOT_CSP).not.toContain('http');
    expect(SNAPSHOT_CSP).not.toContain('*');
  });
});

describe('buildSandboxSrcDoc', () => {
  it('injects a network-blocking CSP into an existing <head>', () => {
    const out = buildSandboxSrcDoc('<html><head><title>t</title></head><body>x</body></html>');
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain("default-src 'none'");
    // The CSP lands inside <head>, before the title it should govern.
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('<head'));
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title'));
  });

  it('prepends the CSP when there is no <head>', () => {
    const out = buildSandboxSrcDoc('<div>x</div>');
    expect(out).toContain("default-src 'none'");
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<div'));
  });
});
