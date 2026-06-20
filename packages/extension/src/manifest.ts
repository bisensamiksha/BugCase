import { defineManifest, type ManifestV3Export } from '@crxjs/vite-plugin';

import pkg from '../package.json' with { type: 'json' };

export type Target = 'chrome' | 'firefox';

const COMMON = {
  manifest_version: 3 as const,
  name: 'Bug Reporter Tool',
  short_name: 'BugCase',
  description: 'Privacy-first bug report capture. No backend, no telemetry.',
  version: pkg.version,
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Capture bug report',
  },
  // `debugger` is required (install-time): Chrome forbids it in optional_permissions, so it cannot
  // be requested at runtime. Its on-demand use is gated by a stored opt-in (default off) + a banner.
  permissions: ['activeTab', 'storage', 'scripting', 'downloads', 'tabs', 'debugger'] as string[],
  optional_permissions: ['cookies', 'management', 'history'] as string[],
  optional_host_permissions: ['<all_urls>'] as string[],
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
};

export function buildManifest(target: Target): ManifestV3Export {
  if (target === 'firefox') {
    return defineManifest({
      ...COMMON,
      background: { scripts: ['src/background/service-worker.ts'] },
      browser_specific_settings: {
        gecko: {
          id: 'bugcase@bisensamiksha.dev',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    });
  }
  return defineManifest({
    ...COMMON,
    background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  });
}

export default buildManifest((process.env.BROWSER as Target) ?? 'chrome');
