import { createRoot } from 'react-dom/client';

import { KonvaAnnotationCanvas } from '../src/annotation/AnnotationCanvas';
import { PreviewApp } from '../src/preview/PreviewApp';
import { resolveScreenshot } from '../src/preview/screenshot-source';

import { FIXED_SCREENSHOT_PNG, buildFixtureReport } from './fixture';

/**
 * Standalone render harness for the preview screen (S3-17), mounted with deterministic fixture data and
 * fully no-op injected deps so `toHaveScreenshot` snapshots the real components without the extension
 * runtime. Loaded as a classic script over `file://`.
 *
 * TD-03 moved the Konva annotation canvas into an on-demand injected bundle, so clicking "Annotate" in
 * PreviewApp now asks the (absent-here) service worker to inject it. The `?view=annotate` mode renders
 * the real `KonvaAnnotationCanvas` directly — the same component + fixture that produced the annotation
 * baseline — so the visual snapshot keeps its coverage without a service worker.
 */
const container = document.getElementById('root');
const wantAnnotate = new URLSearchParams(window.location.search).get('view') === 'annotate';

if (container && wantAnnotate) {
  const report = buildFixtureReport();
  const screenshot = resolveScreenshot(report);
  if (screenshot) {
    createRoot(container).render(
      <KonvaAnnotationCanvas
        reportId="visual-harness"
        screenshot={screenshot}
        peekAsset={() => Promise.resolve({ ok: true, dataUrl: FIXED_SCREENSHOT_PNG })}
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
  }
} else if (container) {
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
