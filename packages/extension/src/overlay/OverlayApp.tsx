import type { BugReportV1, ReproductionRecording, UserInput, UserOptions } from '@bugcase/schema';
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { CropRect } from '../background/element-crop';
import type { CaptureElementInspection } from '../background/element-inspection-finalize';
import {
  CROP_ELEMENT,
  DISMISS_ERROR_BADGE,
  GET_PASSIVE_ERROR_COUNT,
  isDebuggerActivityMessage,
  type CaptureReportResponse,
  type CropElementRequest,
  type CropElementResult,
  type DismissErrorBadgeRequest,
  type GetPassiveErrorCountRequest,
  type GetPassiveErrorCountResponse,
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
import type { OverlayDraft } from '../storage/overlay-draft';
import type { RecordedStep, RecordingSession } from '../storage/recording-session';
import { getSettings } from '../storage/settings';
import { ErrorBoundary } from '../ui/ErrorBoundary';

import { CaptureButton } from './CaptureButton';
import { CaptureOptions } from './CaptureOptions';
import { DismissErrorBadgeButton } from './DismissErrorBadgeButton';
import { ElementPickerControls } from './ElementPickerControls';
import { ReproductionControls } from './ReproductionControls';
import { UserReportForm } from './UserReportForm';
import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';
import { CookiesWarning } from './components/CookiesWarning';
import { DebuggerBanner } from './components/DebuggerBanner';
import { OriginOptInModal } from './components/OriginOptInModal';
import { clearDraft, getDraft, saveDraft } from './draft-sync';
import { clampPanelPosition, type PanelPosition } from './draggable-panel';
import {
  ELEMENT_INSPECTION_SESSION_INITIAL,
  elementInspectionSessionReducer,
} from './element-inspection-session';
import { withHostHidden } from './hide-host-during-capture';
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

/** Durable overlay-draft operations (BUG-06); injectable for tests. */
export interface DraftClient {
  readonly get: () => Promise<OverlayDraft | null>;
  readonly save: (draft: OverlayDraft) => Promise<void>;
  readonly clear: () => Promise<void>;
}

const DEFAULT_DRAFT_CLIENT: DraftClient = {
  get: () => getDraft(),
  save: (draft) => saveDraft(draft),
  clear: () => clearDraft(),
};

/** Drives the element inspector picker (S3-13); injectable for tests. */
export interface ElementPickerController {
  /** Start picking; `onPick` receives a fully-built inspection per pick. Returns a stop handle. */
  readonly start: (
    onPick: (inspection: CaptureElementInspection) => void,
    onCancel: () => void,
  ) => { stop: () => void };
}

/** Ask the service worker to capture the viewport + crop the picked element's box; `null` on failure.
 *  The overlay host is hidden for the capture so the picker pill isn't baked into the crop (BUG-03) —
 *  but only when the pill actually overlaps the crop, so it no longer blinks on every pick (BUG-04). */
function requestElementCrop(rect: CropRect, devicePixelRatio: number): Promise<string | null> {
  const message: CropElementRequest = { type: CROP_ELEMENT, rect, devicePixelRatio };
  return withHostHidden(
    () =>
      browser.runtime
        .sendMessage<CropElementRequest, CropElementResult>(message)
        .then((res) => (res.ok ? (res.dataUrl ?? null) : null))
        .catch(() => null),
    document,
    { skipIfClearOf: rect },
  );
}

/** Read the passive error count for this tab (S3-14); defaults to the runtime bridge. */
function requestPassiveErrorCount(): Promise<number> {
  try {
    return browser.runtime
      .sendMessage<GetPassiveErrorCountRequest, GetPassiveErrorCountResponse>({
        type: GET_PASSIVE_ERROR_COUNT,
      })
      .then((res) => res?.count ?? 0)
      .catch(() => 0);
  } catch {
    // No runtime bridge available (e.g. a non-extension context) — treat as no errors.
    return Promise.resolve(0);
  }
}

/** Dismiss (clear) the passive error badge for this tab (S3-14). */
function requestDismissPassiveErrors(): Promise<void> {
  try {
    return browser.runtime
      .sendMessage<DismissErrorBadgeRequest, void>({ type: DISMISS_ERROR_BADGE })
      .then(() => undefined)
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
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
  /** Reads the current passive error count for this tab (S3-14); defaults to the runtime bridge. */
  readonly loadPassiveErrorCount?: () => Promise<number>;
  /** Dismisses the passive error badge for this tab (S3-14); defaults to the runtime bridge. */
  readonly dismissPassiveErrors?: () => Promise<void>;
  /** The page url used to detect a navigation-interrupted recording; defaults to the live location. */
  readonly currentUrl?: string;
  /** Durable overlay-draft operations (BUG-06); defaults to the real service-worker relay. */
  readonly draftClient?: DraftClient;
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
  // A flex column: the header stays pinned (drag handle + close) while the body scrolls, so the
  // controls below the fold (notes, capture button) are always reachable. Capped to the viewport.
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 32px)',
  padding: '16px',
  borderRadius: '12px',
  background: '#ffffff',
  color: '#0f172a',
  boxShadow: '0 10px 30px rgba(2, 6, 23, 0.25)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
};

// The scrollable body inside the panel; the pinned header sits above it.
const bodyStyle: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  paddingBottom: '8px',
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
  flexShrink: 0,
  cursor: 'move',
  userSelect: 'none',
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
  loadPassiveErrorCount = requestPassiveErrorCount,
  dismissPassiveErrors = requestDismissPassiveErrors,
  currentUrl,
  draftClient = DEFAULT_DRAFT_CLIENT,
}: OverlayAppProps) {
  const pageUrl = currentUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  const pageOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const host = hostNameOf(pageOrigin);
  const [showOptIn, setShowOptIn] = useState(false);
  const [cookiesGranted, setCookiesGranted] = useState(false);
  const [captureOptions, setCaptureOptions] = useState<UserOptions>(CAPTURE_OPTION_DEFAULTS);
  const [minimized, setMinimized] = useState(false);
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  // BUG-06: set once the draft-restore effect below has resolved (whether or not a draft existed),
  // so the stored-defaults effect can tell "not yet checked" from "checked, nothing to restore".
  const draftLoadedRef = useRef(false);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const [debuggerActivity, setDebuggerActivity] = useState<{
    active: boolean;
    hostName?: string;
  }>({ active: false });
  const [passiveErrorCount, setPassiveErrorCount] = useState(0);

  // Passive error badge (S3-14): read how many uncaught errors this page logged, so the overlay can
  // offer to dismiss the toolbar badge. Guarded against a late resolve after unmount.
  useEffect(() => {
    let active = true;
    void loadPassiveErrorCount().then((count) => {
      if (active) {
        setPassiveErrorCount(count);
      }
    });
    return () => {
      active = false;
    };
  }, [loadPassiveErrorCount]);

  const handleDismissPassiveErrors = (): void => {
    setPassiveErrorCount(0);
    void dismissPassiveErrors();
  };

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
        // BUG-06: also bail out once a draft has been restored — this effect and the draft-restore
        // effect below both call setCaptureOptions, and without this guard whichever resolves last
        // wins, so a restored draft could be silently overwritten by the stored defaults.
        if (
          !cancelled &&
          !draftLoadedRef.current &&
          !optionsEqual(loaded, CAPTURE_OPTION_DEFAULTS)
        ) {
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

  // BUG-06: restore the draft persisted on a prior page load. The overlay's state lives in this
  // document, which every navigation destroys; without this the form silently reopens with defaults
  // and the capture ships them. Merged over the canonical defaults so a partial stored blob cannot
  // leave a field undefined.
  useEffect(() => {
    let cancelled = false;
    void draftClient
      .get()
      .then((draft) => {
        if (cancelled) {
          return;
        }
        if (draft) {
          setCaptureOptions({ ...CAPTURE_OPTION_DEFAULTS, ...draft.captureOptions });
          setUserReport({ ...USER_REPORT_DEFAULTS, ...draft.userReport });
          dispatchElement({ type: 'restore', inspections: draft.inspections });
          setMinimized(draft.ui.minimized);
          setPanelPos(draft.ui.panelPos);
        }
      })
      .finally(() => {
        if (!cancelled) {
          draftLoadedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
    // Run once on mount; draftClient is stable for the overlay's lifetime.
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

  // Drag the panel by its header so it doesn't obscure the page. The position is clamped so a
  // grabbable strip always stays on-screen, and the max height tracks the top so the body still fits.
  const onHeaderMouseDown = (event: ReactMouseEvent): void => {
    const view = typeof window !== 'undefined' ? window : null;
    const panelEl = panelRef.current;
    if (event.button !== 0 || !view || !panelEl) {
      return;
    }
    const rect = panelEl.getBoundingClientRect();
    const startLeft = rect.left;
    const startTop = rect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    const size = { width: rect.width, height: rect.height };
    const onMove = (moveEvent: MouseEvent): void => {
      setPanelPos(
        clampPanelPosition(
          {
            left: startLeft + (moveEvent.clientX - startX),
            top: startTop + (moveEvent.clientY - startY),
          },
          size,
          { innerWidth: view.innerWidth, innerHeight: view.innerHeight },
        ),
      );
    };
    const onUp = (): void => {
      view.removeEventListener('mousemove', onMove);
      view.removeEventListener('mouseup', onUp);
    };
    view.addEventListener('mousemove', onMove);
    view.addEventListener('mouseup', onUp);
  };

  const draggedPanelStyle: CSSProperties = panelPos
    ? {
        ...panelStyle,
        top: `${panelPos.top}px`,
        left: `${panelPos.left}px`,
        right: 'auto',
        maxHeight: `${Math.max(
          160,
          (typeof window !== 'undefined' ? window.innerHeight : 800) - panelPos.top - 16,
        )}px`,
      }
    : panelStyle;

  // The picker pill is draggable too, so it can be moved off whatever you are trying to inspect
  // instead of vanishing (BUG-04). Same clamped position state as the main panel.
  const draggedPillStyle: CSSProperties = panelPos
    ? { ...pillStyle, top: `${panelPos.top}px`, left: `${panelPos.left}px`, right: 'auto' }
    : pillStyle;

  if (phase === 'preview' && preview) {
    const backToForm = (): void => {
      setPhase('form');
      setPreview(null);
    };
    return (
      // A render crash in the preview must not break the overlay; offer a way back to the form.
      <ErrorBoundary
        fallback={(reset) => (
          <div
            role="alert"
            data-testid="preview-error-fallback"
            style={{ padding: 16, fontSize: 13, color: '#b91c1c' }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>The preview couldn’t be displayed.</p>
            <button
              type="button"
              onClick={() => {
                reset();
                backToForm();
              }}
              style={{
                marginTop: 8,
                border: '1px solid #fca5a5',
                background: 'transparent',
                color: '#b91c1c',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Back to report
            </button>
          </div>
        )}
      >
        <PreviewApp
          reportId={preview.reportId}
          report={preview.report}
          {...(preview.assetSizes ? { assetSizes: preview.assetSizes } : {})}
          onCancel={backToForm}
          onComplete={() => {
            // The recording has been folded into the downloaded report; drop the durable session.
            void recordingClient.clear();
            onClose();
          }}
        />
      </ErrorBoundary>
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
    // Draggable by its grip, and it no longer hides itself during each crop (BUG-04).
    return (
      <div
        role="dialog"
        aria-label="BugCase element inspector"
        data-testid="bugcase-picker-pill"
        ref={panelRef}
        style={{ ...draggedPillStyle, display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <span
          data-testid="bugcase-picker-pill-grip"
          aria-label="Move the element inspector"
          role="button"
          tabIndex={-1}
          title="Drag to move"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: 'move', color: '#94a3b8', userSelect: 'none', lineHeight: 1 }}
        >
          ⠿
        </span>
        <ElementPickerControls
          status="picking"
          count={elementSession.inspections.length}
          onStartPicking={handleStartPicking}
          onStopPicking={handleStopPicking}
        />
      </div>
    );
  }

  if (minimized) {
    // Collapsed to a small pill (same look as the recording/picker pills) so the page underneath is
    // fully usable; Expand restores the capture form.
    return (
      <div
        role="dialog"
        aria-label="BugCase capture overlay (minimized)"
        data-testid="bugcase-overlay-minimized"
        style={pillStyle}
      >
        <div style={{ ...headerStyle, marginBottom: 0, cursor: 'default' }}>
          <strong>BugCase</strong>
          <span style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              aria-label="Expand overlay"
              data-testid="bugcase-overlay-expand"
              onClick={() => setMinimized(false)}
              style={closeStyle}
            >
              ⤢
            </button>
            <button
              type="button"
              aria-label="Close overlay"
              data-testid="bugcase-overlay-close-min"
              onClick={onClose}
              style={closeStyle}
            >
              ×
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="BugCase capture overlay"
      data-testid="bugcase-overlay"
      ref={panelRef}
      style={draggedPanelStyle}
    >
      <header
        style={headerStyle}
        data-testid="bugcase-overlay-header"
        onMouseDown={onHeaderMouseDown}
      >
        <strong>BugCase</strong>
        <span style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            aria-label="Minimize overlay"
            data-testid="bugcase-overlay-minimize"
            onClick={() => setMinimized(true)}
            onMouseDown={(event) => event.stopPropagation()}
            style={closeStyle}
          >
            –
          </button>
          <button
            type="button"
            aria-label="Close overlay"
            data-testid="bugcase-overlay-close"
            onClick={onClose}
            onMouseDown={(event) => event.stopPropagation()}
            style={closeStyle}
          >
            ×
          </button>
        </span>
      </header>
      <div style={bodyStyle} data-testid="bugcase-overlay-body">
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
        <DismissErrorBadgeButton count={passiveErrorCount} onDismiss={handleDismissPassiveErrors} />
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
        <div style={{ marginTop: '12px' }}>
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
              return withHostHidden(() =>
                (onCapture ?? requestCapture)({
                  userOptions: captureOptions,
                  userInput: userReport,
                  ...(reproduction ? { reproduction } : {}),
                  ...(elementSession.inspections.length > 0
                    ? { elementInspections: elementSession.inspections }
                    : {}),
                }),
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
