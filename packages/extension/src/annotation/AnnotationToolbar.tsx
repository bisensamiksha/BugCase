import type { CSSProperties } from 'react';

import type { ToolId } from './tools';

export interface AnnotationToolbarProps {
  readonly tool: ToolId;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onSelectTool: (tool: ToolId) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

/** Tool id → button label. Kept terse; icons are a later visual-polish concern. */
const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Select',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  freehand: 'Draw',
  redact: 'Redact',
  eraser: 'Eraser',
};

const TOOL_ORDER: readonly ToolId[] = [
  'select',
  'arrow',
  'rect',
  'ellipse',
  'text',
  'freehand',
  'redact',
  'eraser',
];

const barStyle: CSSProperties = {
  position: 'fixed',
  top: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  justifyContent: 'center',
  padding: '8px 12px',
  background: '#0f172a',
  borderRadius: '10px',
  zIndex: 3,
};

const buttonStyle: CSSProperties = {
  fontSize: '12px',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#e2e8f0',
  cursor: 'pointer',
};

const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#2563eb',
  border: '1px solid #3b82f6',
};

const dividerStyle: CSSProperties = { width: '1px', background: '#334155', margin: '0 2px' };

export function AnnotationToolbar({
  tool,
  canUndo,
  canRedo,
  onSelectTool,
  onUndo,
  onRedo,
  onClear,
  onDone,
  onCancel,
}: AnnotationToolbarProps) {
  return (
    <div
      data-testid="annotation-toolbar"
      role="toolbar"
      aria-label="Annotation tools"
      style={barStyle}
    >
      {TOOL_ORDER.map((id) => {
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            data-testid={`tool-${id}`}
            aria-pressed={active}
            style={active ? activeButtonStyle : buttonStyle}
            onClick={() => onSelectTool(id)}
          >
            {TOOL_LABELS[id]}
          </button>
        );
      })}
      <span style={dividerStyle} aria-hidden="true" />
      <button
        type="button"
        data-testid="annotation-undo"
        style={buttonStyle}
        disabled={!canUndo}
        onClick={onUndo}
      >
        Undo
      </button>
      <button
        type="button"
        data-testid="annotation-redo"
        style={buttonStyle}
        disabled={!canRedo}
        onClick={onRedo}
      >
        Redo
      </button>
      <button type="button" data-testid="annotation-clear" style={buttonStyle} onClick={onClear}>
        Clear
      </button>
      <span style={dividerStyle} aria-hidden="true" />
      <button type="button" data-testid="annotation-cancel" style={buttonStyle} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        data-testid="annotation-done"
        style={activeButtonStyle}
        onClick={onDone}
      >
        Done
      </button>
    </div>
  );
}
