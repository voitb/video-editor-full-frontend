/**
 * Subtitle Style Editor
 * Style controls for subtitle appearance (font size, color, background).
 */

import type { SubtitleStyle } from '../../../../core/types';
import { TIMELINE_COLORS } from '../../../../constants';

export interface SubtitleStyleEditorProps {
  style: SubtitleStyle;
  onStyleUpdate: (updates: Partial<SubtitleStyle>) => void;
}

export function SubtitleStyleEditor({ style, onStyleUpdate }: SubtitleStyleEditorProps) {
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
            min={16}
            max={96}
            value={style.fontSize}
            onChange={(e) => onStyleUpdate({ fontSize: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Color */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={style.showBackground}
                onChange={(e) => onStyleUpdate({ showBackground: e.target.checked })}
              />
              <span style={{ fontSize: 11, color: '#888' }}>Show</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
