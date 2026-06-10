import { defineManifest } from '@crxjs/vite-plugin';

import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Bug Reporter Tool',
  short_name: 'BugCase',
  description: 'Privacy-first bug report capture. No backend, no telemetry.',
  version: pkg.version || '0.0.1',
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Capture bug report',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['activeTab', 'storage', 'scripting', 'downloads', 'tabs'],
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
});
