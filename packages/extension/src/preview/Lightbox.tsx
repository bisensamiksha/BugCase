import type { ScreenshotRef } from '@bugcase/schema';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { requestPeekAsset } from '../overlay/request-capture';

import { useZoomPan } from './useZoomPan';

export interface PeekAssetResult {
  readonly ok: boolean;
  readonly dataUrl?: string;
  readonly reason?: string;
}

export type PeekAssetFn = (reportId: string, path: string) => Promise<PeekAssetResult>;

export interface LightboxScreenshotViewerProps {
  readonly reportId?: string;
  readonly screenshot: ScreenshotRef;
  /** Drives `aria-busy` and gates interactions (matches the ticket contract). */
  readonly disabled?: boolean;
  /** Close the viewer (Escape / × / backdrop). */
  readonly onCancel?: () => void;
  /** Reserved by the ticket contract; a read-only viewer has no separate commit action. */
  readonly onComplete?: () => void;
  /** Fetches the held asset as a data URL; defaults to the real SW bridge. Injectable for tests. */
  readonly peekAsset?: PeekAssetFn;
}

const PAN_STEP = 40;
const WHEEL_STEP = 1.1;
type LoadStatus = 'loading' | 'loaded' | 'error';

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.92)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  zIndex: 2,
  outline: 'none',
};

const barStyle: CSSProperties = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  display: 'flex',
  gap: '8px',
  zIndex: 3,
};

const imgStyle: CSSProperties = {
  position: 'relative',
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  userSelect: 'none',
  cursor: 'grab',
};

export function LightboxScreenshotViewer({
  reportId,
  screenshot,
  disabled,
  onCancel,
  peekAsset,
}: LightboxScreenshotViewerProps) {
  const zoom = useZoomPan();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setDataUrl(null);
    if (!reportId) {
      setStatus('error');
      return;
    }
    const peek = peekAsset ?? requestPeekAsset;
    void peek(reportId, screenshot.path)
      .then((res) => {
        if (cancelled) {
          return;
        }
        if (res.ok && res.dataUrl) {
          setDataUrl(res.dataUrl);
          setStatus('loaded');
        } else {
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
  }, [reportId, screenshot.path, peekAsset]);

  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) {
      return;
    }
    switch (event.key) {
      case 'Escape':
        onCancel?.();
        break;
      case '+':
      case '=':
        zoom.zoomIn();
        break;
      case '-':
        zoom.zoomOut();
        break;
      case '0':
        zoom.reset();
        break;
      case 'ArrowUp':
        zoom.panBy(0, PAN_STEP);
        break;
      case 'ArrowDown':
        zoom.panBy(0, -PAN_STEP);
        break;
      case 'ArrowLeft':
        zoom.panBy(PAN_STEP, 0);
        break;
      case 'ArrowRight':
        zoom.panBy(-PAN_STEP, 0);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      ref={sectionRef}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      aria-busy={disabled ?? false}
      data-testid="lightbox-screenshot-viewer"
      tabIndex={-1}
      style={backdropStyle}
      onKeyDown={handleKeyDown}
    >
      <div
        data-testid="lightbox-backdrop"
        style={{ position: 'absolute', inset: 0 }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !disabled) {
            onCancel?.();
          }
        }}
        onWheel={(event) => {
          if (disabled) {
            return;
          }
          event.preventDefault();
          zoom.zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
        }}
      />
      <div style={barStyle}>
        <button
          type="button"
          aria-label="Zoom in"
          data-testid="lightbox-zoom-in"
          onClick={() => zoom.zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          data-testid="lightbox-zoom-out"
          disabled={zoom.isMin}
          onClick={() => zoom.zoomOut()}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          data-testid="lightbox-reset"
          disabled={zoom.isMin}
          onClick={() => zoom.reset()}
        >
          ⟲
        </button>
        <button
          type="button"
          aria-label="Close viewer"
          data-testid="lightbox-close"
          onClick={() => onCancel?.()}
        >
          ×
        </button>
      </div>
      {status === 'loading' ? (
        <p data-testid="lightbox-loading" style={{ color: '#e2e8f0' }}>
          Loading…
        </p>
      ) : null}
      {status === 'error' ? (
        <p data-testid="lightbox-error" role="alert" style={{ color: '#fca5a5' }}>
          Couldn’t load this screenshot. It may have expired — capture again.
        </p>
      ) : null}
      {status === 'loaded' && dataUrl ? (
        <img
          src={dataUrl}
          alt="Captured screenshot"
          draggable={false}
          data-testid="lightbox-image"
          style={{ ...imgStyle, transform: zoom.transform }}
          onPointerDown={(event) => {
            if (zoom.isMin || disabled) {
              return;
            }
            drag.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) {
              return;
            }
            zoom.panBy(event.clientX - drag.current.x, event.clientY - drag.current.y);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
          }}
        />
      ) : null}
    </div>
  );
}
