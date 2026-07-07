import type { BugReportV1, ReproductionRecording, UserInput, UserOptions } from '@bugcase/schema';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';

import type { CropRect } from '../background/element-crop';
import type { CaptureElementInspection } from '../background/element-inspection-finalize';
import {
  CROP_ELEMENT,
  isDebuggerActivityMessage,
  type CaptureReportResponse,
  type CropElementRequest,
  type CropElementResult,
} from '../background/messages';
import {
  ORIGIN_ALLOWLIST_MESSAGE,
  type OriginAllowlistRequest,
  type OriginAllowlistResponse,
} from '../background/origin-allowlist-handler';
import { buildElementInspection } from '../capture/element-inspection';
import { toReproductionRecording } from '../capture/reproduction-log';
import { installElementPicker } from '../injected/element-picker';
import browser from '../lib/browser';
import { hasOptionalPermissions } from '../permissions/optional-permissions';
import { PreviewApp } from '../preview/PreviewApp';
import type { ArtifactId } from '../preview/artifact-list';
import { createVerifierToken, isRecorderStep } from '../shared/bridge-protocol';
import { normalizeOrigin } from '../storage/origin-allowlist';
import type { RecordedStep, RecordingSession } from '../storage/recording-session';
import { getSettings } from '../storage/settings';

import { CaptureButton } from './CaptureButton';
import { CaptureOptions } from './CaptureOptions';
import { ElementPickerControls } from './ElementPickerControls';
import { ReproductionControls } from './ReproductionControls';
import { UserReportForm } from './UserReportForm';
import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';
import { CookiesWarning } from './components/CookiesWarning';
import { DebuggerBanner } from './components/DebuggerBanner';
import { OriginOptInModal } from './components/OriginOptInModal';
import {
  ELEMENT_INSPECTION_SESSION_INITIAL,
  elementInspectionSessionReducer,
} from './element-inspection-session';
import {
  appendRecordingStep,
  clearRecording,
  getRecording,
  startRecording,
  stopRecording,
} from './recording-sync';
import { sendRecorderControl } from './reproduction-control-bridge';
import { REPRODUCTION_SESSION_INITIAL, reproductionSessionReducer } from './reproduction-session';
import { requestCapture } from './request-capture';
import { USER_REPORT_DEFAULTS } from './user-report-state';

/** The durable-recording operations the overlay drives (S3-12 Part B); injectable for tests. */
export interface RecordingClient {
  readonly start: (startedAt: string, url: string) => Promise<void>;
  readonly appendStep: (step: RecordedStep) => Promise<void>;
  readonly stop: (endedAt: string) => Promise<void>;
  readonly get: () => Promise<RecordingSession | null>;
  readonly clear: () => Promise<void>;
}

const DEFAULT_RECORDING_CLIENT: RecordingClient = {
  start: (startedAt, url) => startRecording(startedAt, url),
  appendStep: (step) => appendRecordingStep(step),
  stop: (endedAt) => stopRecording(endedAt),
  get: () => getRecording(),
  clear: () => clearRecording(),
};

/** Drives the element inspector picker (S3-13); injectable for tests. */
export interface ElementPickerController {
  /** Start picking; `onPick` receives a fully-built inspection per pick. Returns a stop handle. */
  readonly start: (
    onPick: (inspection: CaptureElementInspection) => void,
    onCancel: () => void,
  ) => { stop: () => void };
}

/** Ask the service worker to capture the viewport + crop the picked element's box; `null` on failure. */
function requestElementCrop(rect: CropRect, devicePixelRatio: number): Promise<string | null> {
  const message: CropElementRequest = { type: CROP_ELEMENT, rect, devicePixelRatio };
  return browser.runtime
    .sendMessage<CropElementRequest, CropElementResult>(message)
    .then((res) => (res.ok ? (res.dataUrl ?? null) : null))
    .catch(() => null);
}

const DEFAULT_ELEMENT_PICKER: ElementPickerController = {
  start(onPick, onCancel) {
    if (typeof document === 'undefined') {
      return { stop: () => {} };
    }
    return installElementPicker(document, {
      onPick: (el) => {
        const raw = buildElementInspection(el);
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        void requestElementCrop(raw.boundingClientRect, dpr).then((cropDataUrl) => {
          onPick({ ...raw, cropDataUrl });
        });
      },
      onCancel,
    });
  },
};

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
  /** Loads the user's stored default capture options; defaults to reading persisted settings. */
  readonly loadDefaultCaptureOptions?: () => Promise<UserOptions>;
  /** Runs the capture; defaults to the real overlay → service-worker flow. Injectable for tests. */
  readonly onCapture?: (input: {
    userOptions: UserOptions;
    userInput: UserInput;
    /** A completed reproduction recording (S3-12), assembled from the durable session when present. */
    reproduction?: ReproductionRecording | null;
    /** Elements the user inspected with the picker (S3-13). */
    elementInspections?: readonly CaptureElementInspection[] | null;
  }) => Promise<CaptureReportResponse>;
  /** Durable-recording operations (S3-12 Part B); defaults to the real service-worker relay. */
  readonly recordingClient?: RecordingClient;
  /** Element inspector picker controller (S3-13); defaults to the real picker + crop. Injectable for tests. */
  readonly elementPicker?: ElementPickerController;
  /** The page url used to detect a navigation-interrupted recording; defaults to the live location. */
  readonly currentUrl?: string;
}

type OverlayPhase = 'form' | 'preview';

interface PreviewPayload {
  readonly reportId: string;
  readonly report: BugReportV1;
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
}

/** Structural equality over the flat boolean UserOptions, so seeding can bail out when unchanged. */
function optionsEqual(a: UserOptions, b: UserOptions): boolean {
  return (Object.keys(a) as (keyof UserOptions)[]).every((key) => a[key] === b[key]);
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

// While recording, the panel collapses to this small pill so the page underneath stays interactive.
const pillStyle: CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  maxWidth: '260px',
  padding: '12px 16px',
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
  loadDefaultCaptureOptions,
  onCapture,
  recordingClient = DEFAULT_RECORDING_CLIENT,
  elementPicker = DEFAULT_ELEMENT_PICKER,
  currentUrl,
}: OverlayAppProps) {
  const pageUrl = currentUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  const pageOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const host = hostNameOf(pageOrigin);
  const [showOptIn, setShowOptIn] = useState(false);
  const [cookiesGranted, setCookiesGranted] = useState(false);
  const [captureOptions, setCaptureOptions] = useState<UserOptions>(CAPTURE_OPTION_DEFAULTS);
  const [userReport, setUserReport] = useState<UserInput>(USER_REPORT_DEFAULTS);
  const [phase, setPhase] = useState<OverlayPhase>('form');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [reproSession, dispatchRepro] = useReducer(
    reproductionSessionReducer,
    REPRODUCTION_SESSION_INITIAL,
  );
  const [elementSession, dispatchElement] = useReducer(
    elementInspectionSessionReducer,
    ELEMENT_INSPECTION_SESSION_INITIAL,
  );
  const pickerHandleRef = useRef<{ stop: () => void } | null>(null);
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
    // Seed the capture options from the user's stored defaults (S3-06 settings page). A failed read
    // keeps the static defaults; the bail-out equality check avoids a needless re-render when the
    // stored defaults match, and a manual toggle before the read resolves is preserved.
    let cancelled = false;
    const load =
      loadDefaultCaptureOptions ??
      (() => getSettings().then((settings) => settings.defaultCaptureOptions));
    void load()
      .then((loaded) => {
        // Only touch state when the stored defaults actually differ from the static ones — this
        // keeps a no-op read from scheduling a needless re-render. The overlay has only just
        // mounted, so there is no user selection to clobber.
        if (!cancelled && !optionsEqual(loaded, CAPTURE_OPTION_DEFAULTS)) {
          setCaptureOptions(loaded);
        }
      })
      .catch(() => {
        // A failed settings read must not block capture; keep the static defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [loadDefaultCaptureOptions]);

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

  const pageWindow = typeof window !== 'undefined' ? window : undefined;

  const handleStartRecording = (): void => {
    const token = createVerifierToken();
    const startedAt = new Date().toISOString();
    dispatchRepro({ type: 'start', token, at: startedAt });
    sendRecorderControl(pageWindow, 'start', token);
    // Persist the session so it survives a navigation (the in-page buffer does not).
    void recordingClient.start(startedAt, pageUrl);
  };

  const handleStopRecording = (): void => {
    const { sessionToken } = reproSession;
    const endedAt = new Date().toISOString();
    dispatchRepro({ type: 'stop', at: endedAt });
    if (sessionToken) {
      sendRecorderControl(pageWindow, 'stop', sessionToken);
    }
    void recordingClient.stop(endedAt);
  };

  // Relay each recorded step (pushed from the MAIN-world recorder) to the durable session while
  // recording, so a navigation keeps everything captured up to that point.
  useEffect(() => {
    if (reproSession.status !== 'recording' || !pageWindow) {
      return;
    }
    const token = reproSession.sessionToken;
    const onMessage = (event: MessageEvent): void => {
      const data: unknown = event.data;
      if (isRecorderStep(data) && data.token === token) {
        void recordingClient.appendStep(data.step as RecordedStep);
      }
    };
    pageWindow.addEventListener('message', onMessage);
    return () => pageWindow.removeEventListener('message', onMessage);
  }, [reproSession.status, reproSession.sessionToken, recordingClient, pageWindow]);

  // On open, recover a recording persisted on a prior page load. If it is still recording (the worker
  // re-injected us to continue across a navigation), resume: re-arm the recorder on this page and keep
  // the pill. If it was stopped, show it as a completed recording ready to capture.
  useEffect(() => {
    let cancelled = false;
    void recordingClient.get().then((session) => {
      if (cancelled || !session) {
        return;
      }
      if (session.status === 'recording') {
        const token = createVerifierToken();
        dispatchRepro({ type: 'start', token, at: session.startedAt });
        sendRecorderControl(pageWindow, 'start', token);
      } else {
        dispatchRepro({
          type: 'restore',
          startedAt: session.startedAt,
          endedAt: session.endedAt ?? new Date().toISOString(),
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount; recordingClient/pageWindow are stable for the overlay's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Assemble the reproduction recording from the durable session for a capture (S3-12 Part B). */
  const buildReproduction = async (): Promise<ReproductionRecording | null> => {
    const session = await recordingClient.get();
    if (!session || session.steps.length === 0) {
      return null;
    }
    return toReproductionRecording(session.steps, {
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? new Date().toISOString(),
    });
  };

  const handleStopPicking = (): void => {
    pickerHandleRef.current?.stop();
    pickerHandleRef.current = null;
    dispatchElement({ type: 'stopPicking' });
  };

  const handleStartPicking = (): void => {
    dispatchElement({ type: 'startPicking' });
    pickerHandleRef.current = elementPicker.start(
      (inspection) => dispatchElement({ type: 'add', inspection }),
      handleStopPicking,
    );
  };

  // Tear the picker down if the overlay unmounts mid-pick, so no listeners/highlight are left behind.
  useEffect(() => {
    return () => {
      pickerHandleRef.current?.stop();
      pickerHandleRef.current = null;
    };
  }, []);

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
        onComplete={() => {
          // The recording has been folded into the downloaded report; drop the durable session.
          void recordingClient.clear();
          onClose();
        }}
      />
    );
  }

  if (reproSession.status === 'recording') {
    // Collapse to a small pill so the user can interact with the page while the MAIN-world recorder
    // captures steps; the full capture form is restored on Stop.
    return (
      <div
        role="dialog"
        aria-label="BugCase recording"
        data-testid="bugcase-recording-pill"
        style={pillStyle}
      >
        <ReproductionControls
          status="recording"
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      </div>
    );
  }

  if (elementSession.status === 'picking') {
    // Collapse to a small toolbar so the user can hover + click page elements; Done restores the form.
    return (
      <div
        role="dialog"
        aria-label="BugCase element inspector"
        data-testid="bugcase-picker-pill"
        style={pillStyle}
      >
        <ElementPickerControls
          status="picking"
          count={elementSession.inspections.length}
          onStartPicking={handleStartPicking}
          onStopPicking={handleStopPicking}
        />
      </div>
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
      {captureOptions.reproductionSteps ? (
        <ReproductionControls
          status={reproSession.status}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      ) : null}
      {captureOptions.elementInspections ? (
        <ElementPickerControls
          status={elementSession.status}
          count={elementSession.inspections.length}
          onStartPicking={handleStartPicking}
          onStopPicking={handleStopPicking}
        />
      ) : null}
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
        onCapture={async () => {
          const reproduction = await buildReproduction();
          return (onCapture ?? requestCapture)({
            userOptions: captureOptions,
            userInput: userReport,
            ...(reproduction ? { reproduction } : {}),
            ...(elementSession.inspections.length > 0
              ? { elementInspections: elementSession.inspections }
              : {}),
          });
        }}
      />
    </div>
  );
}
