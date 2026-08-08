export interface OptionalPermission {
  /** Manifest token, e.g. `debugger` or `<all_urls>`. */
  readonly name: string;
  /** Human-facing label used in the policy page. */
  readonly label: string;
  /** Plain-language explanation of when and why it is used. */
  readonly why: string;
}

export const PRIVACY_POLICY_VERSION = 'v2';
export const PRIVACY_POLICY_LAST_UPDATED = '2026-07-23';

/** Canonical hosted URLs (GitHub Pages; S5-05 may later add a custom-domain redirect). */
export const CANONICAL_BASE_URL = 'https://bisensamiksha.github.io/BugCase/';
export const PRIVACY_POLICY_URL = 'https://bisensamiksha.github.io/BugCase/legal/privacy-policy';
export const TERMS_URL = 'https://bisensamiksha.github.io/BugCase/legal/terms';

/**
 * Permissions BugCase requests only at runtime, with explicit consent. Every entry here must be
 * explained on the privacy page (enforced by `privacy-policy.test.ts`).
 */
export const OPTIONAL_PERMISSIONS: readonly OptionalPermission[] = [
  {
    name: 'debugger',
    label: 'Debugger access',
    why: 'Attaches to the current tab briefly during a capture to record network response bodies and a full-page screenshot, then detaches immediately. A banner is shown while it is active.',
  },
  {
    name: 'cookies',
    label: 'Cookies',
    why: "Reads the current page's cookies only when you explicitly add them to a report. Values are masked by default.",
  },
  {
    name: 'management',
    label: 'Installed extensions',
    why: 'Lists your installed extensions only when you choose to include them, to help reproduce conflicts.',
  },
  {
    name: 'history',
    label: 'Browsing history',
    why: 'Includes recent navigation for the current site only when you opt in.',
  },
  {
    name: '<all_urls>',
    label: 'All sites',
    why: 'Lets you capture pages on any site. Granted per-site at runtime, never required at install.',
  },
];
