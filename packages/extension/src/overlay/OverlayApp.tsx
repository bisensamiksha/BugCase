import type { BugReportV1, UserInput, UserOptions } from '@bugcase/schema';
import { useEffect, useState, type CSSProperties } from 'react';

import { isDebuggerActivityMessage, type CaptureReportResponse } from '../background/messages';
import {
  ORIGIN_ALLOWLIST_MESSAGE,
  type OriginAllowlistRequest,
  type OriginAllowlistResponse,
} from '../background/origin-allowlist-handler';
import browser from '../lib/browser';
import { hasOptionalPermissions } from '../permissions/optional-permissions';
import { PreviewApp } from '../preview/PreviewApp';
import type { ArtifactId } from '../preview/artifact-list';
import { normalizeOrigin } from '../storage/origin-allowlist';

import { CaptureButton } from './CaptureButton';
import { CaptureOptions } from './CaptureOptions';
import { UserReportForm } from './UserReportForm';
import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';
import { CookiesWarning } from './components/CookiesWarning';
import { DebuggerBanner } from './components/DebuggerBanner';
import { OriginOptInModal } from './components/OriginOptInModal';
import { requestCapture } from './request-capture';
import { USER_REPORT_DEFAULTS } from './user-report-state';

/** Notified when the service worker reports the debugger attaching/detaching for this tab. */
export type DebuggerActivityHandler = (active: boolean, hostName?: string) => void;

/** Default subscription to the SW → tab debugger-activity broadcast; no-ops where unavailable. */
function subscribeDebuggerActivityViaRuntime(handler: DebuggerActivityHandler): () => void {
  const onMessage = browser.runtime?.onMessage;
  if (!onMessage) {
    return () => {};
  }
  const listener = (message: unknown): void => {
    if (isDebuggerActivityMessage(message)) {
      handler(message.active, message.hostName);
    }
  };
  onMessage.addListener(listener);
  return () => onMessage.removeListener(listener);
}

export interface OverlayAppProps {
  readonly onClose: () => void;
  /** Origin to evaluate for the passive-monitoring opt-in; defaults to the page origin. */
  readonly origin?: string;
  /** Checks whether the origin is already allowlisted; defaults to the service-worker bridge. */
  readonly checkAllowed?: (origin: string) => Promise<boolean>;
  /** Subscribes to debugger-activity broadcasts; defaults to the runtime message bridge. Injectable for tests. */
  readonly subscribeDebuggerActivity?: (handler: DebuggerActivityHandler) => () => void;
  /** Whether the optional `cookies` permission is granted; defaults to a live permissions check. */
  readonly checkCookiesGranted?: () => Promise<boolean>;
  /** Runs the capture; defaults to the real overlay → service-worker flow. Injectable for tests. */
  readonly onCapture?: (input: {
    userOptions: UserOptions;
    userInput: UserInput;
  }) => Promise<CaptureReportResponse>;
}

type OverlayPhase = 'form' | 'preview';

interface PreviewPayload {
  readonly reportId: string;
  readonly report: BugReportV1;
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
}

/** Best-effort host name for an origin (e.g. `https://example.com` → `example.com`). */
function hostNameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname || undefined;
  } catch {
    return undefined;
  }
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
  // The panel is fixed-position, so it can't ride the page scroll: cap it to the viewport (minus the
  // 16px top/bottom insets) and scroll its own overflow, or controls below the fold are unreachable.
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
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

export function OverlayApp({
  onClose,
  origin,
  checkAllowed,
  subscribeDebuggerActivity,
  checkCookiesGranted,
  onCapture,
}: OverlayAppProps) {
  const pageOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const host = hostNameOf(pageOrigin);
  const [showOptIn, setShowOptIn] = useState(false);
  const [cookiesGranted, setCookiesGranted] = useState(false);
  const [captureOptions, setCaptureOptions] = useState<UserOptions>(CAPTURE_OPTION_DEFAULTS);
  const [userReport, setUserReport] = useState<UserInput>(USER_REPORT_DEFAULTS);
  const [phase, setPhase] = useState<OverlayPhase>('form');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [debuggerActivity, setDebuggerActivity] = useState<{
    active: boolean;
    hostName?: string;
  }>({ active: false });

  useEffect(() => {
    const subscribe = subscribeDebuggerActivity ?? subscribeDebuggerActivityViaRuntime;
    return subscribe((active, hostName) => {
      setDebuggerActivity({ active, ...(hostName === undefined ? {} : { hostName }) });
    });
  }, [subscribeDebuggerActivity]);

  useEffect(() => {
    // Surface a warning whenever cookies will be captured. A failed/absent check just hides it.
    let cancelled = false;
    const check =
      checkCookiesGranted ?? (() => hasOptionalPermissions({ permissions: ['cookies'] }));
    void check()
      .then((granted) => {
        if (!cancelled && granted) {
          setCookiesGranted(true);
        }
      })
      .catch(() => {
        // A failed permission check must not block the capture UI; just skip the warning.
      });
    return () => {
      cancelled = true;
    };
  }, [checkCookiesGranted]);

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

  if (phase === 'preview' && preview) {
    return (
      <PreviewApp
        reportId={preview.reportId}
        report={preview.report}
        {...(preview.assetSizes ? { assetSizes: preview.assetSizes } : {})}
        onCancel={() => {
          setPhase('form');
          setPreview(null);
        }}
        onComplete={onClose}
      />
    );
  }

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
      {debuggerActivity.active ? (
        <div style={{ marginBottom: '12px' }}>
          <DebuggerBanner
            active
            {...(debuggerActivity.hostName === undefined
              ? {}
              : { hostName: debuggerActivity.hostName })}
          />
        </div>
      ) : null}
      {cookiesGranted ? (
        <div style={{ marginBottom: '12px' }}>
          <CookiesWarning active {...(host === undefined ? {} : { hostName: host })} />
        </div>
      ) : null}
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
        Choose what to capture, then download a bug report ZIP.
      </p>
      <CaptureOptions value={captureOptions} onChange={setCaptureOptions} />
      <UserReportForm value={userReport} onChange={setUserReport} />
      <CaptureButton
        onComplete={(result) => {
          if (result.ok && result.reportId && result.report) {
            setPreview({
              reportId: result.reportId,
              report: result.report,
              ...(result.assetSizes ? { assetSizes: result.assetSizes } : {}),
            });
            setPhase('preview');
          }
        }}
        onCapture={() =>
          (onCapture ?? requestCapture)({ userOptions: captureOptions, userInput: userReport })
        }
      />
    </div>
  );
}
