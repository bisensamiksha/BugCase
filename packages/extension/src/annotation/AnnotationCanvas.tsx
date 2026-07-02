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

/** Minimal shape of the react-konva pointer event we read the stage pointer position from. */
interface KonvaPointerEvent {
  readonly target: { getStage: () => { getPointerPosition: () => Point | null } | null };
}

export interface KonvaAnnotationCanvasProps {
  readonly reportId?: string;
  readonly screenshot: ScreenshotRef;
  /** Drives `aria-busy` and gates interactions (matches the ticket contract). */
  readonly disabled?: boolean;
  /** Fetches the held screenshot as a data URL; defaults to the SW bridge (as in the Lightbox). */
  readonly peekAsset?: PeekAssetFn;
  readonly onCancel?: () => void;
  /** Receives the serialized annotations (Konva JSON) on Done; widened from the ticket's `() => void`. */
  readonly onComplete?: (annotationJson: string) => void;
  /** Serializes the stage; defaults to `stageRef.toJSON()`. Injectable so tests need no real canvas. */
  readonly serialize?: () => string;
}

type LoadStatus = 'loading' | 'loaded' | 'error';

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.92)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
  zIndex: 2,
  outline: 'none',
};

function pointerFrom(e: KonvaPointerEvent): Point | null {
  return e.target.getStage()?.getPointerPosition() ?? null;
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
  disabled,
  peekAsset,
  onCancel,
  onComplete,
  serialize,
}: KonvaAnnotationCanvasProps) {
  const [state, dispatch] = useReducer(annotationReducer, undefined, () =>
    initialAnnotationState(),
  );
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const drawing = useRef<DrawState | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
    const pos = pointerFrom(e);
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
    const pos = pointerFrom(e);
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
    const pos = pointerFrom(e) ?? active.start;
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
    const json = serialize ? serialize() : (stageRef.current?.toJSON() ?? '');
    onComplete?.(json);
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
        <div style={{ position: 'relative' }}>
          <Stage
            ref={stageRef}
            width={screenshot.width}
            height={screenshot.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <Layer>
              <KonvaImage
                image={image ?? undefined}
                width={screenshot.width}
                height={screenshot.height}
              />
              {state.shapes.map((shape, i) => renderShape(shape, `${shape.id}-${i}`))}
              {draft ? renderShape(draft, 'draft') : null}
            </Layer>
          </Stage>
          {textAt ? (
            <textarea
              data-testid="annotation-text-input"
              autoFocus
              defaultValue=""
              style={{
                position: 'absolute',
                left: `${textAt.x}px`,
                top: `${textAt.y}px`,
                font: `${DEFAULT_FONT_SIZE}px sans-serif`,
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
      ) : null}
    </div>
  );
}
