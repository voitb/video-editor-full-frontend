/**
 * Overlay Style Editor
 * Style controls for overlay appearance (font, colors, alignment).
 */

import type { OverlayStyle } from '../../../../core/types';
import { TIMELINE_COLORS } from '../../../../constants';

export interface OverlayStyleEditorProps {
  style: OverlayStyle;
  onStyleUpdate: (updates: Partial<OverlayStyle>) => void;
}

export function OverlayStyleEditor({ style, onStyleUpdate }: OverlayStyleEditorProps) {
  return (
    <div
      style={{
        padding: 12,
        backgroundColor: '#1e1e1e',
        borderRadius: 6,
        border: `1px solid ${TIMELINE_COLORS.border}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Font Size */}
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
            Font Size: {style.fontSize}px
          </label>
          <input
            type="range"
            min={12}
            max={120}
            value={style.fontSize}
            onChange={(e) => onStyleUpdate({ fontSize: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Opacity */}
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
            Opacity: {(style.opacity * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={style.opacity * 100}
            onChange={(e) => onStyleUpdate({ opacity: Number(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Colors */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
              Text Color
            </label>
            <input
              type="color"
              value={style.color}
              onChange={(e) => onStyleUpdate({ color: e.target.value })}
              style={{ width: '100%', height: 32 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
              Background
            </label>
            <input
              type="color"
              value={style.backgroundColor.startsWith('rgba') ? '#000000' : style.backgroundColor}
              onChange={(e) => onStyleUpdate({ backgroundColor: e.target.value })}
              style={{ width: '100%', height: 32 }}
            />
          </div>
        </div>

        {/* Text alignment */}
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
            Text Align
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => onStyleUpdate({ textAlign: align })}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 11,
                  backgroundColor: style.textAlign === align ? '#3b82f6' : 'transparent',
                  color: style.textAlign === align ? '#fff' : '#888',
                  border: `1px solid ${style.textAlign === align ? '#3b82f6' : TIMELINE_COLORS.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {align}
              </button>
            ))}
          </div>
        </div>

        {/* Font weight */}
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
            Font Weight
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['normal', 'bold'] as const).map((weight) => (
              <button
                key={weight}
                onClick={() => onStyleUpdate({ fontWeight: weight })}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 11,
                  backgroundColor: style.fontWeight === weight ? '#3b82f6' : 'transparent',
                  color: style.fontWeight === weight ? '#fff' : '#888',
                  border: `1px solid ${style.fontWeight === weight ? '#3b82f6' : TIMELINE_COLORS.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {weight}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
