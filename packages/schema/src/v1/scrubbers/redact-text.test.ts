import { describe, expect, it } from 'vitest';

import { ScrubberRuleAppliedSchema } from '../schemas/common.schema';

import {
  MANUAL_TEXT_REDACTION_RULE_ID,
  REDACTED_PLACEHOLDER,
  redactTextDeep,
  redactTextInAssets,
  redactTextInReport,
} from './redact-text';

const SECRET = 'SUPERSECRET123';

describe('redactTextDeep', () => {
  it('replaces every occurrence in nested strings and counts them', () => {
    const input = {
      a: `x ${SECRET} y`,
      b: { c: [SECRET, 'clean', `${SECRET}${SECRET}`] },
    };
    const result = redactTextDeep(input, SECRET);
    expect(JSON.stringify(result.value)).not.toContain(SECRET);
    expect(result.hits).toBe(4);
    expect(result.value.b.c[1]).toBe('clean');
  });

  it('leaves the input untouched when the secret is absent', () => {
    const input = { a: 'nothing here' };
    const result = redactTextDeep(input, SECRET);
    expect(result.hits).toBe(0);
    expect(result.value).toEqual(input);
  });

  it('does not mutate the original object', () => {
    const input = { a: SECRET };
    redactTextDeep(input, SECRET);
    expect(input.a).toBe(SECRET);
  });

  it('preserves non-string leaves (numbers, booleans, null)', () => {
    const input = { n: 1, b: true, z: null, s: SECRET };
    const result = redactTextDeep(input, SECRET);
    expect(result.value.n).toBe(1);
    expect(result.value.b).toBe(true);
    expect(result.value.z).toBeNull();
    expect(result.value.s).toBe(REDACTED_PLACEHOLDER);
  });

  it('is case-sensitive so an unrelated casing is not destroyed', () => {
    const result = redactTextDeep({ a: 'supersecret123' }, SECRET);
    expect(result.hits).toBe(0);
    expect(result.value.a).toBe('supersecret123');
  });

  it('treats the secret literally, not as a regular expression', () => {
    const result = redactTextDeep({ a: 'a.c and abc' }, 'a.c');
    expect(result.hits).toBe(1);
    expect(result.value.a).toBe(`${REDACTED_PLACEHOLDER} and abc`);
  });

  it('rejects an empty or whitespace-only secret without changing anything', () => {
    expect(redactTextDeep({ a: 'x' }, '').hits).toBe(0);
    expect(redactTextDeep({ a: 'x' }, '   ').hits).toBe(0);
    expect(redactTextDeep({ a: 'x' }, '').value.a).toBe('x');
  });
});

describe('redactTextInReport', () => {
  // Minimal but real-shaped: the fields a leaked secret actually lands in.
  const report = {
    schemaVersion: 'v1',
    metadata: {
      page: { url: `https://x.test/?t=${SECRET}`, title: 'Sign in' },
      scrubbersApplied: [],
    },
    userInput: { title: 'bug', stepsToReproduce: `typed ${SECRET}`, notes: '', severity: 'minor' },
    console: { entries: [{ args: [{ type: 'string', preview: SECRET }] }] },
    network: {
      entries: [{ url: 'https://x.test/api', requestHeaders: [{ name: 'X', value: SECRET }] }],
    },
    storage: { local: [{ key: 'k', value: SECRET }] },
    elementInspections: { items: [{ outerHtml: `<input value="${SECRET}">` }] },
  } as unknown as Parameters<typeof redactTextInReport>[0];

  it('removes the secret from every text field in the report', () => {
    const result = redactTextInReport(report, SECRET);
    expect(JSON.stringify(result.report)).not.toContain(SECRET);
    expect(result.hits).toBe(6);
  });

  it('records a manual-text-redaction entry in scrubbersApplied', () => {
    const result = redactTextInReport(report, SECRET);
    const applied = result.report.metadata.scrubbersApplied;
    const entry = applied.find((a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID);
    expect(entry).toBeDefined();
    expect(entry?.hits).toBe(6);
    expect(() => ScrubberRuleAppliedSchema.parse(entry)).not.toThrow();
  });

  it('never writes the secret itself into scrubbersApplied', () => {
    const result = redactTextInReport(report, SECRET);
    expect(JSON.stringify(result.report.metadata.scrubbersApplied)).not.toContain(SECRET);
  });

  it('accumulates hits when applied repeatedly for different secrets', () => {
    const once = redactTextInReport(report, SECRET);
    const twice = redactTextInReport(once.report, 'Sign in');
    const entries = twice.report.metadata.scrubbersApplied.filter(
      (a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.hits).toBe(7);
  });

  it('folds additionalHits (text assets) into the recorded total', () => {
    const result = redactTextInReport(report, SECRET, { additionalHits: 98 });
    const entry = result.report.metadata.scrubbersApplied.find(
      (a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID,
    );
    // 6 in the report + 98 in the DOM snapshot html.
    expect(entry?.hits).toBe(104);
    // `hits` still reports only the report-side count for the caller.
    expect(result.hits).toBe(6);
  });

  it('records a redaction that happened only in the assets', () => {
    const result = redactTextInReport(report, 'ABSENT-FROM-REPORT', { additionalHits: 5 });
    const entry = result.report.metadata.scrubbersApplied.find(
      (a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID,
    );
    expect(entry?.hits).toBe(5);
  });

  it('ignores a negative additionalHits', () => {
    const result = redactTextInReport(report, SECRET, { additionalHits: -10 });
    const entry = result.report.metadata.scrubbersApplied.find(
      (a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID,
    );
    expect(entry?.hits).toBe(6);
  });

  it('adds no scrubber entry when the secret is absent', () => {
    const result = redactTextInReport(report, 'NOT-PRESENT');
    expect(result.hits).toBe(0);
    expect(
      result.report.metadata.scrubbersApplied.some((a) => a.id === MANUAL_TEXT_REDACTION_RULE_ID),
    ).toBe(false);
  });
});

describe('redactTextInAssets', () => {
  it('redacts text assets such as the DOM snapshot html', () => {
    const files = new Map<string, Blob | string | Uint8Array>([
      ['raw/dom-snapshot.html', `<input value="${SECRET}">`],
      ['raw/notes.txt', 'clean'],
    ]);
    const result = redactTextInAssets(files, SECRET);
    expect(result.files.get('raw/dom-snapshot.html')).toBe(
      `<input value="${REDACTED_PLACEHOLDER}">`,
    );
    expect(result.files.get('raw/notes.txt')).toBe('clean');
    expect(result.hits).toBe(1);
  });

  it('leaves binary assets (screenshots) untouched — images are Annotate-only', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const files = new Map<string, Blob | string | Uint8Array>([['raw/screenshot.png', bytes]]);
    const result = redactTextInAssets(files, SECRET);
    expect(result.files.get('raw/screenshot.png')).toBe(bytes);
    expect(result.hits).toBe(0);
  });

  it('counts every occurrence across multiple text assets', () => {
    const files = new Map<string, Blob | string | Uint8Array>([
      ['a.html', `${SECRET} ${SECRET}`],
      ['b.html', SECRET],
    ]);
    expect(redactTextInAssets(files, SECRET).hits).toBe(3);
  });
});
