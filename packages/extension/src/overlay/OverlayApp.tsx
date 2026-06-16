import { useEffect, useState, type CSSProperties } from 'react';

import {
  ORIGIN_ALLOWLIST_MESSAGE,
  type OriginAllowlistRequest,
  type OriginAllowlistResponse,
} from '../background/origin-allowlist-handler';
import browser from '../lib/browser';
import { normalizeOrigin } from '../storage/origin-allowlist';

import { CaptureButton } from './CaptureButton';
import { OriginOptInModal } from './components/OriginOptInModal';

export interface OverlayAppProps {
  readonly onClose: () => void;
  /** Origin to evaluate for the passive-monitoring opt-in; defaults to the page origin. */
  readonly origin?: string;
  /** Checks whether the origin is already allowlisted; defaults to the service-worker bridge. */
  readonly checkAllowed?: (origin: string) => Promise<boolean>;
}

/** Ask the service worker whether the origin is already opted into passive monitoring. */
async function isOriginAllowedViaBridge(origin: string): Promise<boolean> {
  const message: OriginAllowlistRequest = {
    type: ORIGIN_ALLOWLIST_MESSAGE,
    action: 'isAllowed',
    origin,
  };
  const result = await browser.runtime.sendMessage<OriginAllowlistRequest, OriginAllowlistResponse>(
    message,
  );
  return result.ok && result.allowed === true;
}

// Inline styles keep the overlay self-contained inside the Shadow DOM; a Tailwind-in-shadow
// stylesheet is deferred to a later UI ticket. The host element handles positioning/z-index.
const panelStyle: CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '320px',
  padding: '16px',
  borderRadius: '12px',
  background: '#ffffff',
  color: '#0f172a',
  boxShadow: '0 10px 30px rgba(2, 6, 23, 0.25)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const closeStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '20px',
  lineHeight: 1,
  color: '#475569',
};

export function OverlayApp({ onClose, origin, checkAllowed }: OverlayAppProps) {
  const pageOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const [showOptIn, setShowOptIn] = useState(false);

  useEffect(() => {
    // Passive monitoring only applies to real web origins. Skip the lookup for opaque
    // origins (about:blank, file:, extension pages) so we never prompt where it can't apply.
    if (normalizeOrigin(pageOrigin) === null) {
      return;
    }
    let cancelled = false;
    const check = checkAllowed ?? isOriginAllowedViaBridge;
    void check(pageOrigin)
      .then((allowed) => {
        if (!cancelled && !allowed) {
          setShowOptIn(true);
        }
      })
      .catch(() => {
        // A failed lookup must not block the capture UI; just skip the opt-in prompt.
      });
    return () => {
      cancelled = true;
    };
  }, [pageOrigin, checkAllowed]);

  return (
    <div
      role="dialog"
      aria-label="BugCase capture overlay"
      data-testid="bugcase-overlay"
      style={panelStyle}
    >
      <header style={headerStyle}>
        <strong>Bug Reporter</strong>
        <button
          type="button"
          aria-label="Close overlay"
          data-testid="bugcase-overlay-close"
          onClick={onClose}
          style={closeStyle}
        >
          ×
        </button>
      </header>
      {showOptIn ? (
        <div style={{ marginBottom: '12px' }}>
          <OriginOptInModal
            origin={pageOrigin}
            onResult={(result) => {
              if (result.ok) {
                setShowOptIn(false);
              }
            }}
            onDismiss={() => {
              setShowOptIn(false);
            }}
          />
        </div>
      ) : null}
      <p style={{ margin: '0 0 8px', color: '#475569' }}>
        Capture the visible tab and download a bug report ZIP.
      </p>
      <CaptureButton onComplete={onClose} />
    </div>
  );
}
