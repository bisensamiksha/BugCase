import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { useFocusRestore, useFocusTrap } from './a11y/focus';
import { useZoomPan } from './useZoomPan';

export interface LightboxProps {
  /** Resolves the image URL (data: or object:), or null on failure. Called inside an effect. */
  readonly load: () => Promise<string | null>;
  /** Re-run `load()` whenever this key changes (e.g. the screenshot path). */
  readonly loadKey?: string;
  /** Alt text for the image (required for a11y). */
  readonly alt: string;
  /** Drives `aria-busy` and gates interactions. */
  readonly disabled?: boolean;
  /** Close the viewer (Escape / × / backdrop). */
  readonly onCancel?: () => void;
  /** Message shown on load failure. Neutral default; surfaces may override. */
  readonly errorMessage?: string;
}

const PAN_STEP = 40;
const WHEEL_STEP = 1.1;
const DEFAULT_ERROR = 'Couldn’t load this image.';
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

/**
 * Presentational screenshot lightbox: modal shell, zoom/pan toolbar, keyboard + pointer-drag pan, and
 * loading/error/loaded rendering. It is loader-agnostic — the image URL is resolved by an injected
 * {@link LightboxProps.load} callback (the extension feeds it a SW-peek data URL, the dashboard feeds
 * it a `ReportSource` object URL), so the one viewer serves both surfaces.
 */
export function Lightbox({ load, loadKey, alt, disabled, onCancel, errorMessage }: LightboxProps) {
  const zoom = useZoomPan();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [src, setSrc] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  // The dialog is modal: Tab must not reach the page behind it, and closing must not strand focus
  // on <body>. `useFocusTrap` is called *without* `onEscape` on purpose — `handleKeyDown` below
  // already owns Escape (along with the zoom and pan keys), and passing it here would call
  // `onCancel` twice. `useFocusRestore(true)` is unconditional because this component only ever
  // renders while open; the caller unmounts it to close, which is what triggers the restore.
  useFocusTrap(sectionRef);
  useFocusRestore(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Keep the latest loader without making it an effect dep (it is a fresh closure each render);
  // `loadKey` is the explicit re-run trigger.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSrc(null);
    void loadRef
      .current()
      .then((url) => {
        if (cancelled) {
          return;
        }
        if (url) {
          setSrc(url);
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
  }, [loadKey]);

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
          {errorMessage ?? DEFAULT_ERROR}
        </p>
      ) : null}
      {status === 'loaded' && src ? (
        <img
          src={src}
          alt={alt}
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
