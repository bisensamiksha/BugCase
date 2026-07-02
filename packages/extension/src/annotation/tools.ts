/**
 * Pure annotation model + reducer for the Konva annotation canvas (S3-08).
 *
 * All logic lives here so it can be unit-tested in node (Konva itself needs a real `<canvas>` and cannot
 * render in jsdom). The canvas component is a thin view over this state; the toolbar is presentational.
 */

/** The active drawing tool. `select` is the idle/no-draw tool. */
export type ToolId =
  | 'select'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'freehand'
  | 'redact'
  | 'eraser';

export interface ShapeStyle {
  readonly color: string;
  readonly strokeWidth: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Annotation =
  | { type: 'arrow'; id: string; points: number[]; color: string; strokeWidth: number }
  | {
      type: 'rect';
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      strokeWidth: number;
    }
  | {
      type: 'ellipse';
      id: string;
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
      color: string;
      strokeWidth: number;
    }
  | {
      type: 'text';
      id: string;
      x: number;
      y: number;
      text: string;
      color: string;
      fontSize: number;
    }
  | { type: 'freehand'; id: string; points: number[]; color: string; strokeWidth: number }
  | { type: 'redact'; id: string; x: number; y: number; width: number; height: number };

export interface AnnotationState {
  readonly tool: ToolId;
  readonly shapes: readonly Annotation[];
  /** Current stroke/fill color; the picker UI arrives in S3-09. */
  readonly color: string;
  /** Current stroke width; the picker UI arrives in S3-09. */
  readonly strokeWidth: number;
  readonly past: readonly (readonly Annotation[])[];
  readonly future: readonly (readonly Annotation[])[];
}

export type AnnotationAction =
  | { type: 'selectTool'; tool: ToolId }
  | { type: 'setColor'; color: string }
  | { type: 'setStrokeWidth'; strokeWidth: number }
  | { type: 'addShape'; shape: Annotation }
  | { type: 'updateShape'; id: string; patch: Partial<Annotation> }
  | { type: 'deleteShape'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' };

export const DEFAULT_COLOR = '#ef4444';
export const DEFAULT_STROKE_WIDTH = 4;
export const DEFAULT_FONT_SIZE = 20;

export function initialAnnotationState(overrides: Partial<AnnotationState> = {}): AnnotationState {
  return {
    tool: 'select',
    shapes: [],
    color: DEFAULT_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    past: [],
    future: [],
    ...overrides,
  };
}

export function canUndo(state: AnnotationState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: AnnotationState): boolean {
  return state.future.length > 0;
}

/** Commit new `shapes`, pushing the current shapes onto the undo stack and clearing the redo stack. */
function commit(state: AnnotationState, shapes: readonly Annotation[]): AnnotationState {
  return { ...state, shapes, past: [...state.past, state.shapes], future: [] };
}

export function annotationReducer(
  state: AnnotationState,
  action: AnnotationAction,
): AnnotationState {
  switch (action.type) {
    case 'selectTool':
      return { ...state, tool: action.tool };
    case 'setColor':
      return { ...state, color: action.color };
    case 'setStrokeWidth':
      return { ...state, strokeWidth: action.strokeWidth };
    case 'addShape':
      return commit(state, [...state.shapes, action.shape]);
    case 'updateShape':
      return commit(
        state,
        state.shapes.map((s) =>
          s.id === action.id ? ({ ...s, ...action.patch } as Annotation) : s,
        ),
      );
    case 'deleteShape':
      return commit(
        state,
        state.shapes.filter((s) => s.id !== action.id),
      );
    case 'clear':
      return state.shapes.length === 0 ? state : commit(state, []);
    case 'undo': {
      if (state.past.length === 0) {
        return state;
      }
      const previous = state.past[state.past.length - 1]!;
      return {
        ...state,
        shapes: previous,
        past: state.past.slice(0, -1),
        future: [state.shapes, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) {
        return state;
      }
      const next = state.future[0]!;
      return {
        ...state,
        shapes: next,
        past: [...state.past, state.shapes],
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

/**
 * Build a shape from a pointer drag (start→end). Handles the drag-drawn tools (`rect`, `ellipse`, `arrow`,
 * `redact`). Returns `null` for a degenerate zero-size drag or for tools whose shape is created another way
 * (`freehand` grows via {@link growFreehand}, `text` is committed on input, `select` draws nothing).
 */
export function createShape(
  tool: ToolId,
  start: Point,
  end: Point,
  style: ShapeStyle,
  id: string,
): Annotation | null {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  switch (tool) {
    case 'rect':
      return width === 0 || height === 0
        ? null
        : { type: 'rect', id, x: left, y: top, width, height, ...style };
    case 'ellipse':
      return width === 0 || height === 0
        ? null
        : {
            type: 'ellipse',
            id,
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
            radiusX: width / 2,
            radiusY: height / 2,
            ...style,
          };
    case 'arrow':
      return start.x === end.x && start.y === end.y
        ? null
        : { type: 'arrow', id, points: [start.x, start.y, end.x, end.y], ...style };
    case 'redact':
      return width === 0 || height === 0
        ? null
        : { type: 'redact', id, x: left, y: top, width, height };
    default:
      return null;
  }
}

/** Append a point pair to a freehand line's flat `[x0, y0, x1, y1, …]` points array. */
export function growFreehand(points: number[], x: number, y: number): number[] {
  return [...points, x, y];
}

/** Serialize the shape model to JSON — held by the preview for the S3-10 export pipeline. */
export function serializeShapes(shapes: readonly Annotation[]): string {
  return JSON.stringify(shapes);
}
