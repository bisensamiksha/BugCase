import type { ScreenshotRef } from '@bugcase/schema';
import type Konva from 'konva';
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { Arrow, Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';

import { requestPeekAsset } from '../overlay/request-capture';
import type { PeekAssetFn } from '../preview/Lightbox';

import { AnnotationToolbar } from './AnnotationToolbar';
import type { AnnotationResult } from './annotation-result';
import { computeFitScale, toImageSpace } from './canvas-fit';
import { flattenAnnotatedScreenshot, flattenRedactedScreenshot } from './export-annotations';
import { extractRedactions, scaleRedactions, type RedactionRect } from './redaction';
import {
  DEFAULT_FONT_SIZE,
  annotationReducer,
  canRedo,
  canUndo,
  createShape,
  growFreehand,
  initialAnnotationState,
  type Annotation,
  type Point,
} from './tools';

// Re-export so existing importers (`../preview/PreviewApp`, tests) can keep importing the result type
// from here; the canonical definition lives in `annotation-result.ts` (Konva-free) for TD-03.
export type { AnnotationResult } from './annotation-result';

/** Minimal shape of the react-konva pointer event we read the stage pointer position from. */
interface KonvaPointerEvent {
  readonly target: { getStage: () => { getPointerPosition: () => Point | null } | null };
}

export interface KonvaAnnotationCanvasProps {
  readonly reportId?: string;
  readonly screenshot: ScreenshotRef;
  /** Marks to preload (BUG-02): Re-annotate seeds the canvas with the prior shapes so they can be edited. */
  readonly initialShapes?: readonly Annotation[];
  /** Drives `aria-busy` and gates interactions (matches the ticket contract). */
  readonly disabled?: boolean;
  /** Fetches the held screenshot as a data URL; defaults to the SW bridge (as in the Lightbox). */
  readonly peekAsset?: PeekAssetFn;
  readonly onCancel?: () => void;
  /** On Done: the Konva JSON + the flattened annotated PNG (data URL) for the S3-10 export. */
  readonly onComplete?: (result: AnnotationResult) => void;
  /** Serializes the stage; defaults to `stageRef.toJSON()`. Injectable so tests need no real canvas. */
  readonly serialize?: () => string;
  /**
   * Flattens the stage to a PNG data URL at the given `pixelRatio`; defaults to `stage.toDataURL`.
   * Injectable for tests. `pixelRatio` restores native resolution after the fit-to-window down-scale.
   */
  readonly flatten?: (pixelRatio: number) => string;
  /**
   * Destructively flattens the stage with the redaction rects baked to opaque black; defaults to
   * {@link flattenRedactedScreenshot}. Used instead of {@link flatten} whenever the annotation contains
   * redactions. `rects` are already scaled into the exported PNG's pixel space. Injectable for tests.
   */
  readonly bakeRedacted?: (pixelRatio: number, rects: readonly RedactionRect[]) => string;
  /**
   * The box (already net of the toolbar) the canvas may occupy, in CSS px. Defaults to the window.
   * Injectable so tests can drive the fit-to-window scale deterministically.
   */
  readonly availableSize?: { readonly width: number; readonly height: number };
}

type LoadStatus = 'loading' | 'loaded' | 'error';

/** Vertical room the fixed, top-anchored toolbar needs (top offset + up to two wrapped rows + margin). */
const TOOLBAR_RESERVE = 96;
/** Breathing room around the canvas so it never butts against the window edges. */
const EDGE_MARGIN = 24;

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.92)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Top-anchor (not center) the canvas: a flex-*centered* child taller than the viewport clips its own
  // top and can't be scrolled to, which is what previously hid everything but the screenshot's bottom.
  justifyContent: 'flex-start',
  paddingTop: `${TOOLBAR_RESERVE}px`,
  paddingBottom: `${EDGE_MARGIN}px`,
  overflow: 'auto',
  zIndex: 2,
  outline: 'none',
};

/** Read the pointer in the scaled stage's pixels, then map it back to full-resolution image-space. */
function pointerFrom(e: KonvaPointerEvent, scale: number): Point | null {
  return toImageSpace(e.target.getStage()?.getPointerPosition() ?? null, scale);
}

// User zoom on top of the fit-to-window scale, so full-resolution captures can be enlarged to annotate
// fine detail (BUG-03). Zoom 1 = fit-to-window (the minimum); zooming in grows the canvas and pans by
// scrolling. Shapes stay in image-space, so the exported PNG is unaffected by zoom.
const ZOOM_STEP = 1.25;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

/** Generous hit region around thin strokes so the eraser (and click) can land on unfilled shapes,
 *  not just the exact 1–2px outline (BUG-03). Filled shapes (redactions) are already fully clickable. */
const HIT_STROKE_WIDTH = 20;

/** The box the canvas may occupy (net of the toolbar), derived from the current window. */
function windowAvailableSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  return {
    width: window.innerWidth - EDGE_MARGIN * 2,
    height: window.innerHeight - TOOLBAR_RESERVE - EDGE_MARGIN,
  };
}

/** Live-drawing geometry kept in a ref so pointer handlers never read stale React state. */
interface DrawState {
  readonly start: Point;
  readonly id: string;
  points: number[];
}

export function KonvaAnnotationCanvas({
  reportId,
  screenshot,
  initialShapes,
  disabled,
  peekAsset,
  onCancel,
  onComplete,
  serialize,
  flatten,
  bakeRedacted,
  availableSize,
}: KonvaAnnotationCanvasProps) {
  const [state, dispatch] = useReducer(annotationReducer, undefined, () =>
    initialAnnotationState(
      initialShapes && initialShapes.length > 0 ? { shapes: initialShapes } : {},
    ),
  );
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [autoSize, setAutoSize] = useState(windowAvailableSize);
  const [zoom, setZoom] = useState(1);
  const drawing = useRef<DrawState | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fit the whole screenshot into the available box (like the Lightbox's `object-fit: contain`) so
  // full-page captures don't overflow, and re-fit when the window resizes. An injected `availableSize`
  // pins the scale (tests, embedding) and skips the window listener.
  useEffect(() => {
    if (availableSize) {
      return;
    }
    const onResize = (): void => setAutoSize(windowAvailableSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [availableSize]);

  const avail = availableSize ?? autoSize;
  const scale = computeFitScale(screenshot.width, screenshot.height, avail.width, avail.height);
  // Effective on-screen scale = fit-to-window × user zoom. Everything display-related (stage size,
  // pointer mapping, text overlay, export raster) uses this so shapes land correctly at any zoom.
  const displayScale = scale * zoom;
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setImage(null);
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
          setStatus('loaded');
          const img = new Image();
          img.onload = () => {
            if (!cancelled) {
              setImage(img);
            }
          };
          img.src = res.dataUrl;
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
    rootRef.current?.focus();
  }, []);

  const style = { color: state.color, strokeWidth: state.strokeWidth };

  function handleMouseDown(e: KonvaPointerEvent): void {
    if (disabled || textAt) {
      return;
    }
    const pos = pointerFrom(e, displayScale);
    if (!pos || state.tool === 'select' || state.tool === 'eraser') {
      return;
    }
    if (state.tool === 'text') {
      setTextAt(pos);
      return;
    }
    const id = crypto.randomUUID();
    drawing.current = { start: pos, id, points: [pos.x, pos.y] };
    if (state.tool === 'freehand') {
      setDraft({ type: 'freehand', id, points: [pos.x, pos.y], ...style });
    } else {
      setDraft(null);
    }
  }

  function handleMouseMove(e: KonvaPointerEvent): void {
    const active = drawing.current;
    if (!active || disabled) {
      return;
    }
    const pos = pointerFrom(e, displayScale);
    if (!pos) {
      return;
    }
    if (state.tool === 'freehand') {
      active.points = growFreehand(active.points, pos.x, pos.y);
      setDraft({ type: 'freehand', id: active.id, points: active.points, ...style });
    } else {
      setDraft(createShape(state.tool, active.start, pos, style, active.id));
    }
  }

  function handleMouseUp(e: KonvaPointerEvent): void {
    const active = drawing.current;
    drawing.current = null;
    if (!active) {
      return;
    }
    const pos = pointerFrom(e, displayScale) ?? active.start;
    setDraft(null);
    if (state.tool === 'freehand') {
      if (active.points.length >= 4) {
        dispatch({
          type: 'addShape',
          shape: { type: 'freehand', id: active.id, points: active.points, ...style },
        });
      }
      return;
    }
    const shape = createShape(state.tool, active.start, pos, style, active.id);
    if (shape) {
      dispatch({ type: 'addShape', shape });
    }
  }

  function commitText(value: string): void {
    const at = textAt;
    setTextAt(null);
    if (!at || value.trim().length === 0) {
      return;
    }
    dispatch({
      type: 'addShape',
      shape: {
        type: 'text',
        id: crypto.randomUUID(),
        x: at.x,
        y: at.y,
        text: value,
        color: state.color,
        fontSize: DEFAULT_FONT_SIZE,
      },
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) {
      return;
    }
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      dispatch(e.shiftKey ? { type: 'redo' } : { type: 'undo' });
      e.preventDefault();
    } else if (meta && (e.key === 'y' || e.key === 'Y')) {
      dispatch({ type: 'redo' });
      e.preventDefault();
    }
  }

  function handleDone(): void {
    const konvaJson = serialize ? serialize() : (stageRef.current?.toJSON() ?? '');
    // The stage is drawn at `scale`, so raster at devicePixelRatio / scale to land back on the original
    // device dimensions (e.g. dpr 2 fitted to 0.5 → pixelRatio 4 → same pixels as the source screenshot).
    const exportPixelRatio = screenshot.devicePixelRatio / (displayScale > 0 ? displayScale : 1);
    // Redact shapes are stored in image-space; scale them into the exported PNG's pixel space, which is
    // image-space × devicePixelRatio (the fit `scale` and the export `pixelRatio` cancel out).
    const redactions = scaleRedactions(
      extractRedactions(state.shapes),
      screenshot.devicePixelRatio,
    );
    const pngDataUrl =
      redactions.length > 0
        ? bakeRedacted
          ? bakeRedacted(exportPixelRatio, redactions)
          : stageRef.current
            ? flattenRedactedScreenshot(stageRef.current, exportPixelRatio, redactions)
            : ''
        : flatten
          ? flatten(exportPixelRatio)
          : stageRef.current
            ? flattenAnnotatedScreenshot(stageRef.current, exportPixelRatio)
            : '';
    // Return the editable shape model too (BUG-02) so Re-annotate can reload and edit these exact marks.
    onComplete?.({ konvaJson, pngDataUrl, shapes: state.shapes });
  }

  function eraseOnClick(id: string): void {
    if (state.tool === 'eraser' && !disabled) {
      dispatch({ type: 'deleteShape', id });
    }
  }

  function renderShape(shape: Annotation, key: string): JSX.Element | null {
    const onClick = (): void => eraseOnClick(shape.id);
    switch (shape.type) {
      case 'rect':
        return (
          <Rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            hitStrokeWidth={HIT_STROKE_WIDTH}
            onClick={onClick}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            key={key}
            x={shape.x}
            y={shape.y}
            radiusX={shape.radiusX}
            radiusY={shape.radiusY}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            hitStrokeWidth={HIT_STROKE_WIDTH}
            onClick={onClick}
          />
        );
      case 'arrow':
        return (
          <Arrow
            key={key}
            points={shape.points}
            stroke={shape.color}
            fill={shape.color}
            strokeWidth={shape.strokeWidth}
            hitStrokeWidth={HIT_STROKE_WIDTH}
            onClick={onClick}
          />
        );
      case 'freehand':
        return (
          <Line
            key={key}
            points={shape.points}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.4}
            hitStrokeWidth={HIT_STROKE_WIDTH}
            onClick={onClick}
          />
        );
      case 'text':
        return (
          <Text
            key={key}
            x={shape.x}
            y={shape.y}
            text={shape.text}
            fill={shape.color}
            fontSize={shape.fontSize}
            onClick={onClick}
          />
        );
      case 'redact':
        return (
          <Rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill="#000000"
            onClick={onClick}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Annotate screenshot"
      aria-busy={disabled ?? false}
      data-testid="konva-annotation-canvas"
      tabIndex={-1}
      style={backdropStyle}
      onKeyDown={handleKeyDown}
    >
      <AnnotationToolbar
        tool={state.tool}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        onSelectTool={(tool) => dispatch({ type: 'selectTool', tool })}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onClear={() => dispatch({ type: 'clear' })}
        onDone={handleDone}
        onCancel={() => onCancel?.()}
        zoomPercent={Math.round(zoom * 100)}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP))}
        onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP))}
        onZoomReset={() => setZoom(1)}
      />

      {status === 'loading' ? (
        <p data-testid="annotation-canvas-loading" style={{ color: '#e2e8f0' }}>
          Loading…
        </p>
      ) : null}
      {status === 'error' ? (
        <p data-testid="annotation-canvas-error" role="alert" style={{ color: '#fca5a5' }}>
          Couldn’t load this screenshot. It may have expired — capture again.
        </p>
      ) : null}

      {status === 'loaded' ? (
        // Scroll-to-pan: when zoomed past fit, the content grows beyond this box and scrollbars appear.
        <div
          data-testid="annotation-canvas-scroll"
          style={{ maxWidth: `${avail.width}px`, maxHeight: `${avail.height}px`, overflow: 'auto' }}
        >
          <div
            data-testid="annotation-canvas-content"
            style={{
              position: 'relative',
              width: `${screenshot.width * displayScale}px`,
              height: `${screenshot.height * displayScale}px`,
            }}
          >
            <Stage
              ref={stageRef}
              width={screenshot.width * displayScale}
              height={screenshot.height * displayScale}
              scaleX={displayScale}
              scaleY={displayScale}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Background image on its own layer with hit-testing off: it never re-rasterises while
                  drawing, which is the multi-megapixel redraw that made annotation lag. */}
              <Layer listening={false}>
                <KonvaImage
                  image={image ?? undefined}
                  width={screenshot.width}
                  height={screenshot.height}
                />
              </Layer>
              <Layer>
                {state.shapes.map((shape, i) => renderShape(shape, `${shape.id}-${i}`))}
              </Layer>
              {/* Live draft on a dedicated layer so only this small layer repaints on every pointer move. */}
              <Layer>{draft ? renderShape(draft, 'draft') : null}</Layer>
            </Stage>
            {textAt ? (
              <textarea
                data-testid="annotation-text-input"
                autoFocus
                defaultValue=""
                style={{
                  position: 'absolute',
                  left: `${textAt.x * displayScale}px`,
                  top: `${textAt.y * displayScale}px`,
                  font: `${DEFAULT_FONT_SIZE * displayScale}px sans-serif`,
                  color: state.color,
                  background: 'rgba(255,255,255,0.9)',
                  border: '1px solid #2563eb',
                  resize: 'none',
                  zIndex: 4,
                }}
                onBlur={(e) => commitText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitText(e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    setTextAt(null);
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
