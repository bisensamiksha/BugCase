import type { BugReportV1, ScreenshotRef } from '@bugcase/schema';
import { palette } from '@bugcase/shared-tokens';
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
import { RedactTextPanel } from './RedactTextPanel';
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
    annotations?: FinalizeAnnotationPayload | readonly FinalizeAnnotationPayload[],
    deps?: unknown,
    removedInspectionIds?: readonly string[],
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
  background: palette.white,
  color: palette.slate900,
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
  borderBottom: `1px solid ${palette.slate200}`,
};

const footerStyle: CSSProperties = { display: 'flex', gap: '12px', marginTop: '16px' };

/** Artifacts that open a viewer inside the preview: the screenshot lightbox, the DOM snapshot
 * sandbox, or the JSON tree viewer for everything else. */
/** Short human label for an inspection row: the opening tag, e.g. `input#password.form-text-input`. */
function describeInspection(inspection: { readonly outerHtml: string }): string {
  const match = /<([a-z][\w-]*)([^>]*)>/i.exec(inspection.outerHtml);
  const tag = match?.[1]?.toLowerCase() ?? 'element';
  const attrs = match?.[2] ?? '';
  const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
  const cls = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.split(/\s+/)[0];
  return `${tag}${id ? `#${id}` : ''}${!id && cls ? `.${cls}` : ''}`;
}

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
  // Element crops are separate images with their own marks, so each inspection gets its own row
  // (BUG-05). Pairing by `screenshotCropPath` keeps the crop and its metadata together.
  const inspectionRows = useMemo(() => {
    const inspections = report.elementInspections?.inspections ?? [];
    return inspections.map((inspection, index) => ({
      inspection,
      index,
      crop:
        report.screenshots.elementCrops.find((c) => c.path === inspection.screenshotCropPath) ??
        null,
    }));
  }, [report]);
  const privacySummary = useMemo(() => summarizePrivacy(report), [report]);
  const [viewing, setViewing] = useState<ArtifactId | null>(null);
  // Keyed by the annotated screenshot's ZIP path: the primary shot and every element crop can each
  // carry their own marks (BUG-05).
  const [annotations, setAnnotations] = useState<ReadonlyMap<string, AnnotationResult>>(new Map());
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [removedInspections, setRemovedInspections] = useState<ReadonlySet<string>>(new Set());
  const [viewingCrop, setViewingCrop] = useState<ScreenshotRef | null>(null);
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

  async function handleAnnotate(target: ScreenshotRef): Promise<void> {
    setError(null);
    setAnnotating(target.path);
    try {
      const run = annotate ?? requestAnnotation;
      const existing = annotations.get(target.path);
      // Re-annotate reloads the existing marks (BUG-02) so the user can edit/delete individual ones.
      const request: AnnotationRequest = {
        reportId,
        screenshot: target,
        ...(existing && existing.shapes.length > 0 ? { initialShapes: existing.shapes } : {}),
      };
      const result = await run(request);
      // A null result means the user cancelled; leave any prior annotation untouched. A result with no
      // marks means they cleared everything — drop the annotation so the download uses the original and
      // the "Annotated" badge disappears (fixes the stale-badge confusion).
      if (result) {
        setAnnotations((prev) => {
          const next = new Map(prev);
          if (result.shapes.length > 0) {
            next.set(target.path, result);
          } else {
            next.delete(target.path);
          }
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annotation failed');
    } finally {
      setAnnotating(null);
    }
  }

  function toggleRemoveInspection(id: string): void {
    setRemovedInspections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDownload(): Promise<void> {
    setConsenting(false);
    setBusy(true);
    setError(null);
    try {
      const run = finalize ?? requestFinalize;
      const annotationPayloads: FinalizeAnnotationPayload[] = [...annotations].map(
        ([path, value]) => ({
          konvaJson: value.konvaJson,
          screenshotDataUrl: value.pngDataUrl,
          screenshotPath: path,
        }),
      );
      const result = await run(
        reportId,
        [...removed],
        annotationPayloads.length > 0 ? annotationPayloads : undefined,
        undefined,
        removedInspections.size > 0 ? [...removedInspections] : undefined,
      );
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
    const primaryAnnotation = annotations.get(screenshot.path);
    const annotatedPeek: PeekAssetFn | undefined = primaryAnnotation
      ? () => Promise.resolve({ ok: true, dataUrl: primaryAnnotation.pngDataUrl })
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

  if (viewingCrop) {
    const cropAnnotation = annotations.get(viewingCrop.path);
    const cropPeek: PeekAssetFn | undefined = cropAnnotation
      ? () => Promise.resolve({ ok: true, dataUrl: cropAnnotation.pngDataUrl })
      : peekAsset;
    return (
      <LightboxScreenshotViewer
        reportId={reportId}
        screenshot={viewingCrop}
        onCancel={() => setViewingCrop(null)}
        onComplete={() => setViewingCrop(null)}
        {...(cropPeek ? { peekAsset: cropPeek } : {})}
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
      <p style={{ color: palette.slate600 }}>
        Choose what to include, then download. Nothing leaves your browser.
      </p>
      <ImageDisclosure testId="review-image-disclosure">
        Use <strong>Annotate</strong> to black out any sensitive areas of the screenshot before
        downloading.
      </ImageDisclosure>
      {/* Text counterpart to Annotate: strip a secret the scrubbers could not know about (BUG-04). */}
      <RedactTextPanel reportId={reportId} {...(disabled === undefined ? {} : { disabled })} />
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
              <span style={{ color: palette.slate600, minWidth: '80px', textAlign: 'right' }}>
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
              {a.id === 'screenshot' && a.present && screenshot ? (
                <button
                  type="button"
                  data-testid="annotate-screenshot"
                  disabled={annotating !== null || busy}
                  onClick={() => void handleAnnotate(screenshot)}
                >
                  {annotating === screenshot.path
                    ? 'Annotating…'
                    : annotations.has(screenshot.path)
                      ? 'Re-annotate'
                      : 'Annotate'}
                </button>
              ) : null}
              {a.id === 'screenshot' && screenshot && annotations.has(screenshot.path) ? (
                <>
                  <span
                    data-testid="screenshot-annotated"
                    style={{ color: palette.green600, fontSize: '12px' }}
                  >
                    Annotated
                  </span>
                  <button
                    type="button"
                    data-testid="remove-annotation"
                    disabled={annotating !== null || busy}
                    title="Discard the annotation and restore the original screenshot"
                    onClick={() =>
                      setAnnotations((prev) => {
                        const next = new Map(prev);
                        if (screenshot) next.delete(screenshot.path);
                        return next;
                      })
                    }
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
      {inspectionRows.length > 0 ? (
        <div data-testid="element-inspection-rows" style={{ marginTop: '8px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: palette.slate600 }}>
            Each inspected element also stores a cropped screenshot. Those are raw pixels. Annotate
            or remove any that show something sensitive.
          </p>
          {inspectionRows.map(({ inspection, crop, index }) => {
            const isRemoved = removedInspections.has(inspection.id);
            const isAnnotated = crop ? annotations.has(crop.path) : false;
            return (
              <div
                key={inspection.id}
                data-testid={`inspection-${inspection.id}`}
                style={{ ...rowStyle, opacity: isRemoved ? 0.5 : 1 }}
              >
                <span
                  style={{ flex: 1, textDecoration: isRemoved ? 'line-through' : 'none' }}
                  data-testid={`inspection-label-${inspection.id}`}
                >
                  {`#${index + 1} ${describeInspection(inspection)}`}
                </span>
                {isAnnotated ? (
                  <span
                    data-testid={`inspection-annotated-${inspection.id}`}
                    style={{ color: palette.green600, fontSize: '12px' }}
                  >
                    Annotated
                  </span>
                ) : null}
                <button
                  type="button"
                  data-testid={`inspection-view-${inspection.id}`}
                  disabled={!crop || isRemoved || busy}
                  onClick={() => crop && setViewingCrop(crop)}
                >
                  View
                </button>
                <button
                  type="button"
                  data-testid={`inspection-annotate-${inspection.id}`}
                  disabled={!crop || isRemoved || annotating !== null || busy}
                  onClick={() => crop && void handleAnnotate(crop)}
                >
                  {crop && annotating === crop.path
                    ? 'Annotating…'
                    : isAnnotated
                      ? 'Re-annotate'
                      : 'Annotate'}
                </button>
                <button
                  type="button"
                  data-testid={`inspection-remove-${inspection.id}`}
                  disabled={busy}
                  onClick={() => toggleRemoveInspection(inspection.id)}
                >
                  {isRemoved ? 'Restore' : 'Remove'}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <p data-testid="preview-error" role="alert" style={{ color: palette.red700 }}>
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
