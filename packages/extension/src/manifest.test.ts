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
