import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { OPTIONAL_PERMISSIONS, PRIVACY_POLICY_VERSION } from './index';

function read(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

const definitions = read('legal-definitions.md');
const policy = read('privacy-policy-v2.md');
const terms = read('terms.md');

describe('privacy policy v2 content', () => {
  it('states zero collection / no telemetry / on-device', () => {
    expect(policy).toMatch(/no telemetry/i);
    expect(policy).toMatch(/does not collect|never collect|no data is collected/i);
    expect(policy).toMatch(/your device|your browser/i);
  });

  it('carries the current policy version', () => {
    expect(policy).toContain(PRIVACY_POLICY_VERSION);
  });

  it('explains every optional permission the extension may request', () => {
    expect(OPTIONAL_PERMISSIONS.length).toBeGreaterThan(0);
    for (const permission of OPTIONAL_PERMISSIONS) {
      expect(policy).toContain(permission.label);
    }
  });

  it('states the BUG-01 image honesty (screenshots/crops are not auto-scrubbed)', () => {
    expect(policy).toMatch(/screenshots?/i);
    expect(policy).toMatch(/not (?:be )?(?:auto[- ]?)?scrubbed|are not scrubbed/i);
    expect(policy).toMatch(/element crops?/i);
  });

  it('links to the terms of use', () => {
    expect(policy).toContain('https://bisensamiksha.github.io/BugCase/legal/terms');
  });
});

describe('terms of use content', () => {
  it('names the PolyForm Small Business license for the extension', () => {
    expect(terms).toMatch(/PolyForm Small Business/i);
  });

  it('separates the extension license from future hosted-dashboard terms', () => {
    expect(terms).toMatch(/hosted[- ]dashboard|hosted service/i);
  });

  it('disclaims warranty / limits liability', () => {
    expect(terms).toMatch(/as is|no warranty|without any warranty/i);
    expect(terms).toMatch(/liab/i);
  });
});

describe('shared definitions', () => {
  it('define the shared vocabulary used by both documents', () => {
    expect(definitions).toMatch(/## Definitions/);
    expect(definitions).toMatch(/device[- ]local/i);
  });
});
