import type { BugReportV1 } from '@bugcase/schema';
import { useMemo, useState, type CSSProperties } from 'react';

import type { FinalizeReportResponse } from '../background/messages';
import { requestFinalize } from '../overlay/request-capture';

import { SandboxedDomSnapshotViewer } from './DomSnapshotViewer';
import { JsonTreeViewer } from './JsonTreeViewer';
import { LightboxScreenshotViewer, type PeekAssetFn } from './Lightbox';
import { PrivacyNoticeModal } from './PrivacyNoticeModal';
import { isJsonViewable, selectArtifactJson } from './artifact-json';
import { buildArtifactList, formatBytes, type ArtifactId } from './artifact-list';
import { summarizePrivacy } from './privacy-summary';
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
  ) => Promise<FinalizeReportResponse>;
  /** Opens an artifact viewer not handled in-app (none remain after S3-04); kept as an escape hatch. */
  readonly onView?: (id: ArtifactId) => void;
  /** Fetches a held asset as a data URL for the screenshot lightbox; defaults to the SW bridge. */
  readonly peekAsset?: PeekAssetFn;
  /** Records a metadata-only history entry after a successful download; defaults to `saveDownloadedReport`. */
  readonly saveHistory?: (input: DownloadedReportInput) => Promise<void>;
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
  saveHistory,
  disabled,
}: PreviewAppProps) {
  const artifacts = useMemo(
    () => buildArtifactList({ report, ...(assetSizes ? { assetSizes } : {}) }),
    [report, assetSizes],
  );
  const screenshot = useMemo(() => resolveScreenshot(report), [report]);
  const privacySummary = useMemo(() => summarizePrivacy(report), [report]);
  const [viewing, setViewing] = useState<ArtifactId | null>(null);
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

  async function handleDownload(): Promise<void> {
    setConsenting(false);
    setBusy(true);
    setError(null);
    try {
      const run = finalize ?? requestFinalize;
      const result = await run(reportId, [...removed]);
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
    return (
      <LightboxScreenshotViewer
        reportId={reportId}
        screenshot={screenshot}
        onCancel={() => setViewing(null)}
        onComplete={() => setViewing(null)}
        {...(peekAsset ? { peekAsset } : {})}
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
