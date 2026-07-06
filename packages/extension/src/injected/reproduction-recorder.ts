/**
 * MAIN-world reproduction-steps recorder (S3-12).
 *
 * Installed at document_start from `main-entry.ts`, it stays idle until the overlay arms it (an
 * explicit user Start, relayed as a `recorder-control` message over the S2-05 bridge). While armed it
 * listens — in the capture phase, so page `stopPropagation` can't hide interactions — for
 * click / input / change / scroll / modifier-keydown, and buffers a privacy-safe step for each into a
 * bounded FIFO. The isolated content script pulls the buffer over the `reproduction` bridge channel at
 * capture time.
 *
 * Privacy is the whole point: a step records only *where* and *what kind* of interaction happened
 * (a stable selector + coarse control metadata), never typed text, input values, or plain keystrokes.
 * Only modifier chords (Ctrl/Cmd/Alt + key) are kept, as commands rather than content. Events from the
 * BugCase overlay itself are ignored so operating the recorder never becomes a step.
 */

import type { ReproStepType } from '@bugcase/schema';

import { isRecorderControl } from '../shared/bridge-protocol';
import { OVERLAY_HOST_ID } from '../shared/overlay-host';
import { RingBuffer } from '../shared/ring-buffer';

import { computeStableSelector } from './selector';

/** Default cap on retained steps. */
export const DEFAULT_MAX_REPRO_STEPS = 200;

/** A single buffered interaction. `metadata`/`selector` describe *where*, never captured content. */
export interface RawReproStep {
  readonly type: ReproStepType;
  readonly selector: string;
  readonly description: string;
  /** Capture time in epoch ms. */
  readonly timestamp: number;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

/** The slice of an event target the recorder attaches to (narrowed for test fakes; `window` fits). */
export interface RecorderScope {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
}

export interface ReproductionRecorderOptions {
  /** Selector builder; defaults to the stable-selector algorithm. Injectable for tests. */
  readonly computeSelector?: (el: Element) => string;
  /** Clock injection; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Max retained steps; defaults to {@link DEFAULT_MAX_REPRO_STEPS}. */
  readonly maxSteps?: number;
  /** Whether an event came from the BugCase overlay (ignored). Defaults to an overlay-host check. */
  readonly isOverlayEvent?: (event: Event) => boolean;
  /**
   * Called with each recorded step (and the arming session token) as it happens, so the overlay can
   * relay it to durable storage — the in-page buffer is lost on navigation (S3-12, Part B).
   */
  readonly onStep?: (step: RawReproStep, token: string) => void;
}

export interface ReproductionRecorderHandle {
  /** Begin a recording session: clear the buffer and start listening. */
  arm(token: string): void;
  /** End the session (only for the matching token): stop listening but keep the buffer. */
  disarm(token: string): void;
  isArmed(): boolean;
  /** Defensive copy of the buffered steps, oldest → newest. */
  snapshot(): readonly RawReproStep[];
  /** Detach everything permanently. */
  dispose(): void;
}

/** The DOM events we observe while armed. Clicks only, by product choice — no scroll/typing/keys. */
const OBSERVED_EVENTS = ['click'] as const;

/** Elements that are the real target of a click (so a click on an inner icon records the control). */
const INTERACTIVE_SELECTOR =
  'a, button, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
  '[role="option"], [role="checkbox"], [role="radio"], [role="switch"], [onclick], [tabindex]';

function defaultIsOverlayEvent(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node instanceof Element && node.id === OVERLAY_HOST_ID) {
      return true;
    }
  }
  // Fallback for environments without composedPath: walk the target's ancestors.
  let el = event.target instanceof Element ? event.target : null;
  while (el) {
    if (el.id === OVERLAY_HOST_ID) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Max length of a captured element label. */
const MAX_LABEL = 80;

function truncate(value: string): string {
  return value.length > MAX_LABEL ? `${value.slice(0, MAX_LABEL)}…` : value;
}

/** A friendly noun for the kind of element clicked, or '' when it isn't a recognizable control. */
function elementKind(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return 'dropdown';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'radio') return 'radio';
    if (el.type === 'submit' || el.type === 'button') return 'button';
    return 'field';
  }
  const role = el.getAttribute('role');
  if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') {
    return role;
  }
  return '';
}

/**
 * The element a click really targets: the nearest interactive ancestor (so clicking an icon inside a
 * button records the button), or failing that the nearest ancestor with an accessible name (so a click
 * on a graphic inside a labeled node records the node, e.g. an SVG diagram node labeled "Introduction").
 * Falls back to the clicked element itself.
 */
function resolveInteractionTarget(el: Element): Element {
  const interactive = typeof el.closest === 'function' ? el.closest(INTERACTIVE_SELECTOR) : null;
  if (interactive) {
    return interactive;
  }
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 4) {
    if (accessibleLabel(current)) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }
  return el;
}

/** Build a readable click description, e.g. `Clicked "Save" (button)`, `Clicked link`, `Clicked #x`. */
function describeClick(kind: string, label: string | undefined, selector: string): string {
  if (label) {
    return kind ? `Clicked "${label}" (${kind})` : `Clicked "${label}"`;
  }
  return kind ? `Clicked ${kind}` : `Clicked ${selector}`;
}

/**
 * A short human-readable label for an element — its accessible name, so a developer can tell *what*
 * was interacted with (not just a CSS path). Never reads a form control's text/value: for
 * inputs/selects/textareas it uses only aria-label / title / name, never `textContent` (which for a
 * `<select>` is its option list) and never the typed value.
 */
function accessibleLabel(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) {
    return truncate(aria.trim());
  }

  const tag = el.tagName.toLowerCase();
  const isFormControl = tag === 'input' || tag === 'select' || tag === 'textarea';
  if (!isFormControl) {
    const text = el.textContent?.replace(/\s+/g, ' ').trim();
    if (text) {
      return truncate(text);
    }
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return truncate(title.trim());
  }
  const alt = el.getAttribute('alt');
  if (alt && alt.trim()) {
    return truncate(alt.trim());
  }
  const name = el.getAttribute('name');
  if (name && name.trim()) {
    return truncate(name.trim());
  }
  return undefined;
}

/** The path of the link an element sits in, if any — query string + hash dropped (may hold tokens). */
function linkHrefPath(el: Element): string | undefined {
  const anchor = typeof el.closest === 'function' ? el.closest('a') : null;
  const href = anchor instanceof HTMLAnchorElement ? anchor.href : '';
  if (!href) {
    return undefined;
  }
  try {
    return new URL(href).pathname || '/';
  } catch {
    return undefined;
  }
}

export function installReproductionRecorder(
  scope: RecorderScope,
  options: ReproductionRecorderOptions = {},
): ReproductionRecorderHandle {
  const computeSelector = options.computeSelector ?? computeStableSelector;
  const now = options.now ?? Date.now;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_REPRO_STEPS;
  const isOverlayEvent = options.isOverlayEvent ?? defaultIsOverlayEvent;
  const onStep = options.onStep;

  const buffer = new RingBuffer<RawReproStep>(maxSteps);
  let armed = false;
  let sessionToken: string | null = null;
  let disposed = false;

  function targetElement(event: Event): Element | null {
    return event.target instanceof Element ? event.target : null;
  }

  function push(step: RawReproStep): void {
    buffer.push(step);
    if (onStep) {
      try {
        onStep(step, sessionToken ?? '');
      } catch {
        // A relay failure must not break recording; the in-page buffer still holds the step.
      }
    }
  }

  function selectorFor(el: Element | null): string {
    if (!el) {
      return 'window';
    }
    try {
      return computeSelector(el);
    } catch {
      return el.tagName ? el.tagName.toLowerCase() : 'unknown';
    }
  }

  function recordClick(event: Event): void {
    const clicked = targetElement(event);
    const el = clicked ? resolveInteractionTarget(clicked) : null;
    const selector = selectorFor(el);
    const metadata: Record<string, string | number | boolean> = {
      tag: el ? el.tagName.toLowerCase() : 'unknown',
    };
    const label = el ? accessibleLabel(el) : undefined;
    const href = el ? linkHrefPath(el) : undefined;
    if (label) {
      metadata.label = label;
    }
    if (href) {
      metadata.href = href;
    }
    push({
      type: 'click',
      selector,
      description: describeClick(el ? elementKind(el) : '', label, selector),
      timestamp: now(),
      metadata,
    });
  }

  const handleEvent = (event: Event): void => {
    if (!armed || isOverlayEvent(event)) {
      return;
    }
    try {
      if (event.type === 'click') {
        recordClick(event);
      }
    } catch {
      // Recording must never break the page's own event handling.
    }
  };

  function attach(): void {
    for (const type of OBSERVED_EVENTS) {
      // Capture phase + passive: we only read, never preventDefault, and want to see events even if
      // the page stops propagation on the way up.
      scope.addEventListener(type, handleEvent, { capture: true, passive: true });
    }
  }

  function detach(): void {
    for (const type of OBSERVED_EVENTS) {
      scope.removeEventListener(type, handleEvent, { capture: true });
    }
  }

  return {
    arm(token) {
      if (disposed) {
        return;
      }
      if (armed) {
        detach();
      }
      buffer.clear();
      sessionToken = token;
      armed = true;
      attach();
    },
    disarm(token) {
      if (!armed || token !== sessionToken) {
        return;
      }
      armed = false;
      sessionToken = null;
      detach();
    },
    isArmed: () => armed,
    snapshot: () => buffer.snapshot(),
    dispose() {
      if (armed) {
        detach();
      }
      armed = false;
      disposed = true;
      buffer.clear();
    },
  };
}

/** Minimal slice of `window` needed to receive recorder-control messages. */
export interface RecorderControlTarget {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/**
 * Bridge overlay `recorder-control` messages (S3-12) to a recorder's arm/disarm. Runs in the MAIN
 * world where the recorder lives; the overlay (isolated world) posts control over the shared page
 * `window`. Returns a disposer. Control is a distinct message kind from flush-requests, so it never
 * pins the capture-time flush token.
 */
export function installRecorderControlListener(
  win: RecorderControlTarget,
  recorder: Pick<ReproductionRecorderHandle, 'arm' | 'disarm'>,
): () => void {
  const onMessage = (event: MessageEvent): void => {
    const data: unknown = event.data;
    if (!isRecorderControl(data)) {
      return;
    }
    if (data.action === 'start') {
      recorder.arm(data.token);
    } else {
      recorder.disarm(data.token);
    }
  };
  win.addEventListener('message', onMessage);
  return () => win.removeEventListener('message', onMessage);
}
