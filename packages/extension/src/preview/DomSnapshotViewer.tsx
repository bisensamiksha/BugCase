import type { DomSnapshot } from '@bugcase/schema';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { requestPeekAsset } from '../overlay/request-capture';

import type { PeekAssetFn } from './Lightbox';
import { DOM_SANDBOX, buildSandboxSrcDoc, decodeDataUrlText } from './sandbox-html';

export interface SandboxedDomSnapshotViewerProps {
  readonly reportId?: string;
  /** The report's `dom` manifest entry; `contentPath` is the held HTML asset to peek. */
  readonly snapshot: DomSnapshot;
  /** Drives `aria-busy` and gates interactions (matches the ticket contract). */
  readonly disabled?: boolean;
  /** Close the viewer (Escape / ×). */
  readonly onCancel?: () => void;
  /** Reserved by the ticket contract; a read-only viewer has no separate commit action. */
  readonly onComplete?: () => void;
  /** Fetches the held asset as a data URL; defaults to the real SW bridge. Injectable for tests. */
  readonly peekAsset?: PeekAssetFn;
  /** Writes text to the clipboard; defaults to `navigator.clipboard.writeText`. Injectable for tests. */
  readonly copyText?: (text: string) => Promise<void>;
}

type LoadStatus = 'loading' | 'loaded' | 'error';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#ffffff',
  color: '#0f172a',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 2,
};

const splitStyle: CSSProperties = {
  display: 'flex',
  gap: '16px',
  flex: 1,
  minHeight: 0,
  marginTop: '12px',
};

const iframeStyle: CSSProperties = {
  flex: 2,
  minWidth: 0,
  border: '1px solid #e2e8f0',
  borderRadius: '4px',
  background: '#ffffff',
};

const rawPanelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid #e2e8f0',
  borderRadius: '4px',
  overflow: 'hidden',
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: '12px',
  overflow: 'auto',
  flex: 1,
  fontFamily: 'monospace',
  fontSize: '12px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#f8fafc',
};

export function SandboxedDomSnapshotViewer({
  reportId,
  snapshot,
  disabled,
  onCancel,
  peekAsset,
  copyText,
}: SandboxedDomSnapshotViewerProps) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [html, setHtml] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setHtml(null);
    if (!reportId) {
      setStatus('error');
      return;
    }
    const peek = peekAsset ?? requestPeekAsset;
    void peek(reportId, snapshot.contentPath)
      .then((res) => {
        if (cancelled) {
          return;
        }
        if (!res.ok || !res.dataUrl) {
          setStatus('error');
          return;
        }
        try {
          setHtml(decodeDataUrlText(res.dataUrl));
          setStatus('loaded');
        } catch {
          setStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, snapshot.contentPath, peekAsset]);

  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (disabled) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel?.();
    }
  }

  function handleCopy(): void {
    if (html === null) {
      return;
    }
    const write = copyText ?? ((text: string) => navigator.clipboard.writeText(text));
    void write(html)
      .then(() => setCopyStatus('Copied'))
      .catch(() => setCopyStatus('Copy failed'));
  }

  return (
    <section
      ref={sectionRef}
      role="dialog"
      aria-modal="true"
      aria-label="DOM snapshot viewer"
      aria-busy={disabled ?? false}
      data-testid="sandboxed-dom-snapshot-viewer"
      tabIndex={-1}
      style={overlayStyle}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>DOM snapshot</h2>
          <p style={{ margin: '4px 0 0', color: '#475569' }}>
            Rendered in a locked sandbox (no scripts, no network). Inputs were scrubbed
            {snapshot.scrubberHits > 0 ? ` (${snapshot.scrubberHits} masked).` : '.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            data-testid="dom-copy"
            disabled={status !== 'loaded'}
            onClick={handleCopy}
          >
            Copy HTML
          </button>
          {copyStatus ? (
            <span data-testid="dom-copy-status" style={{ alignSelf: 'center', color: '#475569' }}>
              {copyStatus}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Close viewer"
            data-testid="dom-close"
            onClick={() => onCancel?.()}
          >
            ×
          </button>
        </div>
      </div>

      {status === 'loading' ? (
        <p data-testid="dom-loading" style={{ color: '#475569' }}>
          Loading…
        </p>
      ) : null}
      {status === 'error' ? (
        <p data-testid="dom-error" role="alert" style={{ color: '#b91c1c' }}>
          Couldn’t load this DOM snapshot. It may have expired — capture again.
        </p>
      ) : null}
      {status === 'loaded' && html !== null ? (
        <div style={splitStyle}>
          <iframe
            data-testid="dom-iframe"
            title="DOM snapshot preview"
            sandbox={DOM_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={buildSandboxSrcDoc(html)}
            style={iframeStyle}
          />
          <div style={rawPanelStyle}>
            <div
              style={{ padding: '6px 12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}
            >
              Raw HTML
            </div>
            <pre data-testid="dom-raw" style={preStyle}>
              {html}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
