import { describe, expect, it } from 'vitest';

import {
  annotationReducer,
  canRedo,
  canUndo,
  createShape,
  growFreehand,
  initialAnnotationState,
  serializeShapes,
  type Annotation,
  type AnnotationState,
} from './tools';

function rect(id = 's1'): Annotation {
  return { type: 'rect', id, x: 1, y: 2, width: 3, height: 4, color: '#ef4444', strokeWidth: 4 };
}

const STYLE = { color: '#ef4444', strokeWidth: 4 };

describe('initialAnnotationState', () => {
  it('starts on the select tool with no shapes or history', () => {
    const s = initialAnnotationState();
    expect(s.tool).toBe('select');
    expect(s.shapes).toEqual([]);
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
  });

  it('applies overrides', () => {
    expect(initialAnnotationState({ tool: 'rect' }).tool).toBe('rect');
  });
});

describe('annotationReducer — tool/style (no history)', () => {
  it('selectTool changes the tool without touching history', () => {
    const s = annotationReducer(initialAnnotationState(), { type: 'selectTool', tool: 'arrow' });
    expect(s.tool).toBe('arrow');
    expect(canUndo(s)).toBe(false);
  });

  it('setColor and setStrokeWidth update defaults without history', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'setColor', color: '#22c55e' });
    s = annotationReducer(s, { type: 'setStrokeWidth', strokeWidth: 8 });
    expect(s.color).toBe('#22c55e');
    expect(s.strokeWidth).toBe(8);
    expect(canUndo(s)).toBe(false);
  });
});

describe('annotationReducer — shapes + history', () => {
  it('addShape appends the shape and records an undo step', () => {
    const s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect() });
    expect(s.shapes).toHaveLength(1);
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it('undo restores the previous shapes and enables redo', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect() });
    s = annotationReducer(s, { type: 'undo' });
    expect(s.shapes).toEqual([]);
    expect(canRedo(s)).toBe(true);
  });

  it('redo re-applies an undone shape', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect('a') });
    s = annotationReducer(s, { type: 'undo' });
    s = annotationReducer(s, { type: 'redo' });
    expect(s.shapes.map((x) => x.id)).toEqual(['a']);
    expect(canRedo(s)).toBe(false);
  });

  it('a new shape after undo clears the redo stack', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect('a') });
    s = annotationReducer(s, { type: 'undo' });
    s = annotationReducer(s, { type: 'addShape', shape: rect('b') });
    expect(canRedo(s)).toBe(false);
    expect(s.shapes.map((x) => x.id)).toEqual(['b']);
  });

  it('deleteShape (eraser) removes a shape and records history', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect('a') });
    s = annotationReducer(s, { type: 'addShape', shape: rect('b') });
    s = annotationReducer(s, { type: 'deleteShape', id: 'a' });
    expect(s.shapes.map((x) => x.id)).toEqual(['b']);
    s = annotationReducer(s, { type: 'undo' });
    expect(s.shapes.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('updateShape patches a shape by id and records history', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect('a') });
    s = annotationReducer(s, { type: 'updateShape', id: 'a', patch: { width: 99 } });
    expect((s.shapes[0] as { width: number }).width).toBe(99);
    expect(canUndo(s)).toBe(true);
  });

  it('clear empties the shapes and can be undone', () => {
    let s = annotationReducer(initialAnnotationState(), { type: 'addShape', shape: rect('a') });
    s = annotationReducer(s, { type: 'clear' });
    expect(s.shapes).toEqual([]);
    s = annotationReducer(s, { type: 'undo' });
    expect(s.shapes.map((x) => x.id)).toEqual(['a']);
  });

  it('clear is a no-op when there are no shapes', () => {
    const s = annotationReducer(initialAnnotationState(), { type: 'clear' });
    expect(canUndo(s)).toBe(false);
  });

  it('undo/redo at the bounds are no-ops', () => {
    const s = initialAnnotationState();
    expect(annotationReducer(s, { type: 'undo' })).toEqual(s);
    expect(annotationReducer(s, { type: 'redo' })).toEqual(s);
  });
});

describe('createShape', () => {
  it('builds a rect from a drag (normalized origin + size)', () => {
    const shape = createShape('rect', { x: 30, y: 40 }, { x: 10, y: 20 }, STYLE, 'r');
    expect(shape).toEqual({
      type: 'rect',
      id: 'r',
      x: 10,
      y: 20,
      width: 20,
      height: 20,
      color: '#ef4444',
      strokeWidth: 4,
    });
  });

  it('builds an ellipse centered on the drag', () => {
    const shape = createShape('ellipse', { x: 0, y: 0 }, { x: 20, y: 40 }, STYLE, 'e');
    expect(shape).toMatchObject({ type: 'ellipse', x: 10, y: 20, radiusX: 10, radiusY: 20 });
  });

  it('builds an arrow from start→end points', () => {
    const shape = createShape('arrow', { x: 1, y: 2 }, { x: 3, y: 4 }, STYLE, 'a');
    expect(shape).toMatchObject({ type: 'arrow', points: [1, 2, 3, 4] });
  });

  it('builds a redact box without stroke style', () => {
    const shape = createShape('redact', { x: 0, y: 0 }, { x: 10, y: 5 }, STYLE, 'x');
    expect(shape).toEqual({ type: 'redact', id: 'x', x: 0, y: 0, width: 10, height: 5 });
  });

  it('returns null for a zero-size drag', () => {
    expect(createShape('rect', { x: 5, y: 5 }, { x: 5, y: 5 }, STYLE, 'z')).toBeNull();
    expect(createShape('arrow', { x: 5, y: 5 }, { x: 5, y: 5 }, STYLE, 'z')).toBeNull();
  });

  it('returns null for tools without a drag-built shape', () => {
    expect(createShape('select', { x: 0, y: 0 }, { x: 1, y: 1 }, STYLE, 'z')).toBeNull();
    expect(createShape('text', { x: 0, y: 0 }, { x: 1, y: 1 }, STYLE, 'z')).toBeNull();
  });
});

describe('growFreehand', () => {
  it('appends a point pair', () => {
    expect(growFreehand([1, 2], 3, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe('serializeShapes', () => {
  it('produces JSON that round-trips the shapes', () => {
    const shapes: Annotation[] = [rect('a')];
    const json = serializeShapes(shapes);
    expect(JSON.parse(json)).toEqual(shapes);
  });
});

// Type-level guard: state is readonly-friendly and usable as a value.
const _typecheck: AnnotationState = initialAnnotationState();
void _typecheck;
