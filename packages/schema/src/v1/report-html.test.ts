import { describe, expect, it } from 'vitest';

import { validMinimal } from './__tests__/fixtures/valid-minimal';
import {
  base64ToBytes,
  bytesToBase64,
  escapeJsonForScript,
  parseInlineReportPayload,
  WINDOW_REPORT_KEY,
} from './report-html';

const report = validMinimal;

describe('base64 helpers', () => {
  it('round-trips binary bytes including a >64 KB buffer', () => {
    const big = new Uint8Array(70_000);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
    const small = new Uint8Array([0, 255, 13, 10, 128]);
    expect(base64ToBytes(bytesToBase64(small))).toEqual(small);
  });
});

describe('escapeJsonForScript', () => {
  it('neutralizes </script>, >, and &', () => {
    const out = escapeJsonForScript('{"x":"</script>&<!--"}');
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c'); // < escaped
    expect(out).toContain('\\u003e'); // > escaped
    expect(out).toContain('\\u0026'); // & escaped
  });

  it('escapes U+2028 / U+2029 line separators', () => {
    const ls = String.fromCharCode(0x2028);
    const ps = String.fromCharCode(0x2029);
    const out = escapeJsonForScript(`{"x":"a${ls}b${ps}c"}`);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toContain(ls);
    expect(out).not.toContain(ps);
  });
});

describe('parseInlineReportPayload', () => {
  it('accepts a valid payload', () => {
    const parsed = parseInlineReportPayload({ report, assets: { 'a.png': 'AAAA' } });
    expect(parsed?.assets['a.png']).toBe('AAAA');
    expect(parsed?.report).toEqual(report);
  });

  it('rejects null / non-object / bad report / non-string assets', () => {
    expect(parseInlineReportPayload(null)).toBeNull();
    expect(parseInlineReportPayload({ report: { nope: true }, assets: {} })).toBeNull();
    expect(parseInlineReportPayload({ report, assets: { 'a.png': 5 } })).toBeNull();
  });
});

describe('WINDOW_REPORT_KEY', () => {
  it('is the injected global name', () => {
    expect(WINDOW_REPORT_KEY).toBe('__BUG_REPORT__');
  });
});
