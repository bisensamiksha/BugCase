import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BUGCASE_REPO_URL, BUGCASE_STORE_URL } from './landing-links';

/**
 * `store/shared/listing-copy.md` is the repo's single source of truth for listing copy and links
 * (S4-23). The landing intro (S4-28) shows the same two URLs, so this asserts the constants are a
 * faithful mirror rather than a second, silently-diverging copy.
 */
const listingCopy = readFileSync(
  new URL('../../../store/shared/listing-copy.md', import.meta.url),
  'utf8',
);

describe('landing links', () => {
  it('mirror the canonical links in store/shared/listing-copy.md', () => {
    expect(listingCopy).toContain(BUGCASE_STORE_URL);
    expect(listingCopy).toContain(BUGCASE_REPO_URL);
  });

  it('use the percent-encoded store slug, not a literal em-dash', () => {
    // The store emits the em-dash in the slug as %E2%80%94. Both forms resolve in a browser, but
    // this test is a string comparison against the markdown — a literal em-dash in one file and the
    // encoded form in the other would fail it. Pin the encoded form on both sides.
    expect(BUGCASE_STORE_URL).toContain('%E2%80%94');
    expect(BUGCASE_STORE_URL).not.toContain('—');
  });

  it('point at https origins only', () => {
    expect(BUGCASE_STORE_URL.startsWith('https://')).toBe(true);
    expect(BUGCASE_REPO_URL.startsWith('https://')).toBe(true);
  });
});
