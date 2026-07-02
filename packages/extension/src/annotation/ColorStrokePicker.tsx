import type { CSSProperties } from 'react';

import { PRESET_COLORS, STROKE_WIDTHS } from './palette';

export interface ColorStrokePickerProps {
  readonly color: string;
  readonly strokeWidth: number;
  readonly onColorChange: (color: string) => void;
  readonly onStrokeWidthChange: (strokeWidth: number) => void;
  readonly disabled?: boolean;
}

const barStyle: CSSProperties = {
  position: 'fixed',
  top: '56px',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  justifyContent: 'center',
  padding: '6px 12px',
  background: '#0f172a',
  borderRadius: '10px',
  zIndex: 3,
};

const groupStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px' };
const dividerStyle: CSSProperties = { width: '1px', alignSelf: 'stretch', background: '#334155' };

const swatchBase: CSSProperties = {
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  padding: 0,
  cursor: 'pointer',
};

const widthBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '22px',
  borderRadius: '6px',
  border: '1px solid #334155',
  background: '#1e293b',
  cursor: 'pointer',
};

export function ColorStrokePicker({
  color,
  strokeWidth,
  onColorChange,
  onStrokeWidthChange,
  disabled,
}: ColorStrokePickerProps) {
  return (
    <div
      data-testid="color-stroke-pickers"
      role="toolbar"
      aria-label="Color and stroke width"
      style={barStyle}
    >
      <div style={groupStyle}>
        {PRESET_COLORS.map((preset) => {
          const active = preset === color;
          return (
            <button
              key={preset}
              type="button"
              data-testid={`color-swatch-${preset}`}
              aria-label={`Color ${preset}`}
              aria-pressed={active}
              disabled={disabled ?? false}
              onClick={() => onColorChange(preset)}
              style={{
                ...swatchBase,
                background: preset,
                border: active ? '2px solid #ffffff' : '1px solid #334155',
                outline: active ? '2px solid #3b82f6' : 'none',
              }}
            />
          );
        })}
      </div>

      <span style={dividerStyle} aria-hidden="true" />

      <div style={groupStyle}>
        {STROKE_WIDTHS.map((width) => {
          const active = width === strokeWidth;
          return (
            <button
              key={width}
              type="button"
              data-testid={`stroke-width-${width}`}
              aria-label={`Stroke width ${width}`}
              aria-pressed={active}
              disabled={disabled ?? false}
              onClick={() => onStrokeWidthChange(width)}
              style={{
                ...widthBase,
                borderColor: active ? '#3b82f6' : '#334155',
                background: active ? '#2563eb' : '#1e293b',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  width: '18px',
                  height: `${width}px`,
                  borderRadius: '2px',
                  background: '#e2e8f0',
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
