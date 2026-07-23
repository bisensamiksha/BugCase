import { describe, expect, it } from 'vitest';

import { buildManifest, type Target } from './manifest';

function optionsUi(target: Target): { page?: string; open_in_tab?: boolean } | undefined {
  return (buildManifest(target) as { options_ui?: { page?: string; open_in_tab?: boolean } })
    .options_ui;
}

describe('buildManifest options_ui', () => {
  it.each(['chrome', 'firefox'] as const)('registers the settings page for %s', (target) => {
    const ui = optionsUi(target);
    expect(ui?.page).toBe('src/options/options.html');
    expect(ui?.open_in_tab).toBe(true);
  });
});

describe('buildManifest homepage_url', () => {
  it.each(['chrome', 'firefox'] as const)('links the canonical site for %s', (target) => {
    const manifest = buildManifest(target) as { homepage_url?: string };
    expect(manifest.homepage_url).toBe('https://bisensamiksha.github.io/BugCase/');
  });
});
