/**
 * The two external destinations shown on the landing intro (S4-28).
 *
 * `store/shared/listing-copy.md` is the canonical link list (S4-23); these constants mirror it and
 * `landing-links.test.ts` gates the mirror, so the dashboard cannot drift from the store listing.
 *
 * The store slug's em-dash stays percent-encoded (`%E2%80%94`) — that is the form the store emits,
 * and the sync test compares strings.
 */
export const BUGCASE_STORE_URL =
  'https://chromewebstore.google.com/detail/bugcase-%E2%80%94-bug-reporter-to/inbgbkepikijkgeagehcbaofambgcdck';

export const BUGCASE_REPO_URL = 'https://github.com/bisensamiksha/BugCase';
