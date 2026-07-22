import type { BugReportV1 } from '@bugcase/schema';
import { summarizePrivacy } from '@bugcase/shared-ui';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type { AnnotationResult } from '../annotation/annotation-result';
import type { FinalizeAnnotationPayload, FinalizeReportResponse } from '../background/messages';
import type { AnnotationRequest } from '../content/annotation-channel';
import { startServiceWorkerKeepAlive, type KeepAliveHandle } from '../overlay/keepalive';
import { requestAnnotation } from '../overlay/request-annotation';
import { requestFinalize } from '../overlay/request-capture';

import { SandboxedDomSnapshotViewer } from './DomSnapshotViewer';
import { ImageDisclosure } from './ImageDisclosure';
import { JsonTreeViewer } from './JsonTreeViewer';
import { LightboxScreenshotViewer, type PeekAssetFn } from './Lightbox';
import { PrivacyNoticeModal } from './PrivacyNoticeModal';
import { isJsonViewable, selectArtifactJson } from './artifact-json';
import { buildArtifactList, formatBytes, type ArtifactId } from './artifact-list';
import { saveDownloadedReport, type DownloadedReportInput } from './save-history';
import { resolveScreenshot } from './screenshot-source';

export interface PreviewAppProps {
  readonly reportId: string;
  readonly report: BugReportV1;
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
  readonly onCancel: () => void;
  readonly onComplete: () => void;
  /** ZIP + download the held report minus removed artifacts; defaults to the SW bridge. */
  readonly finalize?: (
    reportId: string,
    removedIds: readonly ArtifactId[],
    annotation?: FinalizeAnnotationPayload,
  ) => Promise<FinalizeReportResponse>;
  /** Opens an artifact viewer not handled in-app (none remain after S3-04); kept as an escape hatch. */
  readonly onView?: (id: ArtifactId) => void;
  /** Fetches a held asset as a data URL for the screenshot lightbox; defaults to the SW bridge. */
  readonly peekAsset?: PeekAssetFn;
  /**
   * Opens the on-demand annotation surface (TD-03) and resolves the result, or null if the user
   * cancels; rejects if the surface fails to inject. Defaults to the SW bridge, so Konva is injected
   * on demand rather than bundled into the always-injected overlay. Injectable for tests/harness.
   */
  readonly annotate?: (request: AnnotationRequest) => Promise<AnnotationResult | null>;
  /** Records a metadata-only history entry after a successful download; defaults to `saveDownloadedReport`. */
  readonly saveHistory?: (input: DownloadedReportInput) => Promise<void>;
  /**
   * Keeps the service worker alive while this screen holds a report (the report + assets live only in
   * the worker's memory between capture and download; a long idle annotation session would otherwise
   * evict the worker and expire the hold). Defaults to `startServiceWorkerKeepAlive`.
   */
  readonly keepAlive?: () => KeepAliveHandle;
  readonly disabled?: boolean;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#ffffff',
  color: '#0f172a',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  padding: '24px',
  overflowY: 'auto',
  zIndex: 1,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '8px 0',
  borderBottom: '1px solid #e2e8f0',
};

const footerStyle: CSSProperties = { display: 'flex', gap: '12px', marginTop: '16px' };

/** Artifacts that open a viewer inside the preview: the screenshot lightbox, the DOM snapshot
 * sandbox, or the JSON tree viewer for everything else. */
function isInAppViewable(id: ArtifactId): boolean {
  return id === 'screenshot' || id === 'dom' || isJsonViewable(id);
}

export function PreviewApp({
  reportId,
  report,
  assetSizes,
  onCancel,
  onComplete,
  finalize,
  onView,
  peekAsset,
  annotate,
  saveHistory,
  keepAlive,
  disabled,
}: PreviewAppProps) {
  // Hold the worker awake for as long as this screen owns the in-memory report (across the annotation
  // sub-view too, since that stays within this component), so the download can't find an evicted hold.
  useEffect(() => {
    const handle = (keepAlive ?? startServiceWorkerKeepAlive)();
    return () => handle.stop();
  }, [keepAlive]);

  const artifacts = useMemo(
    () => buildArtifactList({ report, ...(assetSizes ? { assetSizes } : {}) }),
    [report, assetSizes],
  );
  const screenshot = useMemo(() => resolveScreenshot(report), [report]);
  const privacySummary = useMemo(() => summarizePrivacy(report), [report]);
  const [viewing, setViewing] = useState<ArtifactId | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationResult | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [removed, setRemoved] = useState<ReadonlySet<ArtifactId>>(new Set());
  const [consenting, setConsenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRemove(id: ArtifactId): void {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAnnotate(): Promise<void> {
    if (!screenshot) {
      return;
    }
    setError(null);
    setAnnotating(true);
    try {
      const run = annotate ?? requestAnnotation;
      // Re-annotate reloads the existing marks (BUG-02) so the user can edit/delete individual ones.
      const request: AnnotationRequest = {
        reportId,
        screenshot,
        ...(annotation && annotation.shapes.length > 0 ? { initialShapes: annotation.shapes } : {}),
      };
      const result = await run(request);
      // A null result means the user cancelled; leave any prior annotation untouched. A result with no
      // marks means they cleared everything — drop the annotation so the download uses the original and
      // the "Annotated" badge disappears (fixes the stale-badge confusion).
      if (result) {
        setAnnotation(result.shapes.length > 0 ? result : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annotation failed');
    } finally {
      setAnnotating(false);
    }
  }

  async function handleDownload(): Promise<void> {
    setConsenting(false);
    setBusy(true);
    setError(null);
    try {
      const run = finalize ?? requestFinalize;
      const annotationPayload: FinalizeAnnotationPayload | undefined = annotation
        ? { konvaJson: annotation.konvaJson, screenshotDataUrl: annotation.pngDataUrl }
        : undefined;
      const result = await run(reportId, [...removed], annotationPayload);
      if (result.ok) {
        // Record a metadata-only history entry — best-effort, never block or fail the download.
        const save = saveHistory ?? saveDownloadedReport;
        void save({
          report,
          removedIds: [...removed],
          filename: result.filename ?? '',
          byteSize: result.byteSize ?? 0,
          downloadId: result.downloadId ?? null,
        }).catch(() => {});
        onComplete();
      } else {
        setError(result.reason ?? 'Download failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  if (viewing === 'screenshot' && screenshot) {
    // When an annotation exists (BUG-02), View shows the flattened, redacted result the user will
    // download — not the held original — so they can confirm exactly what leaves the browser.
    const annotatedPeek: PeekAssetFn | undefined = annotation
      ? () => Promise.resolve({ ok: true, dataUrl: annotation.pngDataUrl })
      : undefined;
    const viewPeek = annotatedPeek ?? peekAsset;
    return (
      <LightboxScreenshotViewer
        reportId={reportId}
        screenshot={screenshot}
        onCancel={() => setViewing(null)}
        onComplete={() => setViewing(null)}
        {...(viewPeek ? { peekAsset: viewPeek } : {})}
      />
    );
  }

  if (viewing === 'dom' && report.dom) {
    return (
      <SandboxedDomSnapshotViewer
        reportId={reportId}
        snapshot={report.dom}
        onCancel={() => setViewing(null)}
        onComplete={() => setViewing(null)}
        {...(peekAsset ? { peekAsset } : {})}
      />
    );
  }

  if (viewing && isJsonViewable(viewing)) {
    return (
      <JsonTreeViewer
        title={artifacts.find((a) => a.id === viewing)?.label ?? ''}
        data={selectArtifactJson(report, viewing)}
        onCancel={() => setViewing(null)}
        onComplete={() => setViewing(null)}
      />
    );
  }

  if (consenting) {
    return (
      <PrivacyNoticeModal
        reportId={reportId}
        summary={privacySummary}
        disabled={busy}
        onCancel={() => setConsenting(false)}
        onComplete={() => void handleDownload()}
      />
    );
  }

  return (
    <section
      data-testid="preview-review-screen-scaffold"
      aria-busy={disabled ?? false}
      style={overlayStyle}
    >
      <h2 style={{ marginTop: 0 }}>Review report</h2>
      <p style={{ color: '#475569' }}>
        Choose what to include, then download. Nothing leaves your browser.
      </p>
      <ImageDisclosure testId="review-image-disclosure">
        Use <strong>Annotate</strong> to black out any sensitive areas of the screenshot before
        downloading.
      </ImageDisclosure>
      <div>
        {artifacts.map((a) => {
          const isRemoved = removed.has(a.id);
          return (
            <div
              key={a.id}
              data-testid={`artifact-${a.id}`}
              style={{ ...rowStyle, opacity: isRemoved || !a.present ? 0.5 : 1 }}
            >
              <span style={{ flex: 1, textDecoration: isRemoved ? 'line-through' : 'none' }}>
                {a.label}
              </span>
              <span style={{ color: '#475569', minWidth: '80px', textAlign: 'right' }}>
                {a.present ? formatBytes(a.sizeBytes) : 'Not captured'}
              </span>
              <button
                type="button"
                data-testid={`view-${a.id}`}
                disabled={!a.present || (!isInAppViewable(a.id) && !onView)}
                onClick={() => {
                  if (isInAppViewable(a.id)) {
                    setViewing(a.id);
                  } else {
                    onView?.(a.id);
                  }
                }}
              >
                View
              </button>
              {a.id === 'screenshot' && a.present ? (
                <button
                  type="button"
                  data-testid="annotate-screenshot"
                  disabled={annotating || busy}
                  onClick={() => void handleAnnotate()}
                >
                  {annotating ? 'Annotating…' : annotation ? 'Re-annotate' : 'Annotate'}
                </button>
              ) : null}
              {a.id === 'screenshot' && annotation ? (
                <>
                  <span
                    data-testid="screenshot-annotated"
                    style={{ color: '#16a34a', fontSize: '12px' }}
                  >
                    Annotated
                  </span>
                  <button
                    type="button"
                    data-testid="remove-annotation"
                    disabled={annotating || busy}
                    title="Discard the annotation and restore the original screenshot"
                    onClick={() => setAnnotation(null)}
                  >
                    Remove annotation
                  </button>
                </>
              ) : null}
              {a.removable ? (
                <button
                  type="button"
                  data-testid={`remove-${a.id}`}
                  onClick={() => toggleRemove(a.id)}
                >
                  {isRemoved ? 'Restore' : 'Remove'}
                </button>
              ) : (
                <span style={{ display: 'inline-block', width: '72px' }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
      {error ? (
        <p data-testid="preview-error" role="alert" style={{ color: '#b91c1c' }}>
          {error === 'expired'
            ? 'This capture expired before download. Please capture again.'
            : error}
        </p>
      ) : null}
      <div style={footerStyle}>
        <button type="button" data-testid="preview-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          data-testid="preview-download"
          onClick={() => setConsenting(true)}
          disabled={busy || (disabled ?? false)}
        >
          {busy ? 'Downloading…' : 'Download'}
        </button>
      </div>
    </section>
  );
}
