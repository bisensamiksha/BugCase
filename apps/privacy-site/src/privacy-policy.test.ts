import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { OPTIONAL_PERMISSIONS, PRIVACY_POLICY_VERSION } from './index';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const policy = readFileSync(new URL('./privacy-policy.md', import.meta.url), 'utf8');

describe('privacy policy content', () => {
  it('declares zero collection / no telemetry in both the page and the policy', () => {
    for (const text of [html, policy]) {
      expect(text).toMatch(/no telemetry/i);
      expect(text).toMatch(/does not collect|never collect|no data is collected/i);
      expect(text).toMatch(/your device|your browser/i);
    }
  });

  it('explains every optional permission the extension may request', () => {
    expect(OPTIONAL_PERMISSIONS.length).toBeGreaterThan(0);
    for (const permission of OPTIONAL_PERMISSIONS) {
      expect(html).toContain(permission.label);
      expect(policy).toContain(permission.label);
    }
  });

  it('states the policy version in the policy copy', () => {
    expect(policy).toContain(PRIVACY_POLICY_VERSION);
  });
});
