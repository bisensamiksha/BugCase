import { createRoot } from 'react-dom/client';

import { PreviewApp } from '../src/preview/PreviewApp';

import { FIXED_SCREENSHOT_PNG, buildFixtureReport } from './fixture';

/**
 * Standalone render harness for the preview screen (S3-17), mounted with deterministic fixture data and
 * fully no-op injected deps so `toHaveScreenshot` snapshots the real PreviewApp (and its Konva
 * annotation canvas) without the extension runtime. Loaded as a classic script over `file://`.
 */
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <PreviewApp
      reportId="visual-harness"
      report={buildFixtureReport()}
      onCancel={() => {}}
      onComplete={() => {}}
      // Never actually invoked in snapshots, but injected so no real SW bridge is reached.
      finalize={() =>
        Promise.resolve({ ok: true, filename: 'bugcase.zip', byteSize: 1, downloadId: 1 })
      }
      peekAsset={() => Promise.resolve({ ok: true, dataUrl: FIXED_SCREENSHOT_PNG })}
      saveHistory={() => Promise.resolve()}
      keepAlive={() => ({ stop: () => {} })}
    />,
  );
}
