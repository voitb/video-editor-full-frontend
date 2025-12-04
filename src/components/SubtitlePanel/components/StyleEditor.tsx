/**
 * Style Editor Component
 * Editor for subtitle style properties (font, size, color, background).
 */

import type { SubtitleStyle } from '../../../core/types';
import { TIMELINE_COLORS } from '../../../constants';

interface StyleEditorProps {
  style: SubtitleStyle;
  onChange: (updates: Partial<SubtitleStyle>) => void;
}

export function StyleEditor({ style, onChange }: StyleEditorProps) {
  return (
    <div
      style={{
        padding: '12px',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Font family */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ width: 60, fontSize: 11, color: TIMELINE_COLORS.textMuted }}>
          Font
        </label>
        <select
          value={style.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          style={{
            flex: 1,
            padding: '4px',
            backgroundColor: '#333',
            color: '#fff',
            border: `1px solid ${TIMELINE_COLORS.border}`,
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <option value="Arial, sans-serif">Arial</option>
          <option value="Helvetica, sans-serif">Helvetica</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', serif">Times</option>
          <option value="'Courier New', monospace">Courier</option>
        </select>
      </div>

      {/* Font size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ width: 60, fontSize: 11, color: TIMELINE_COLORS.textMuted }}>
          Size
        </label>
        <input
          type="number"
          value={style.fontSize}
          onChange={(e) => onChange({ fontSize: parseInt(e.target.value) || 48 })}
          min={12}
          max={120}
          style={{
            width: 60,
            padding: '4px',
            backgroundColor: '#333',
            color: '#fff',
            border: `1px solid ${TIMELINE_COLORS.border}`,
            borderRadius: 4,
            fontSize: 11,
          }}
        />
        <span style={{ fontSize: 11, color: TIMELINE_COLORS.textMuted }}>px</span>
      </div>

      {/* Text color */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ width: 60, fontSize: 11, color: TIMELINE_COLORS.textMuted }}>
          Color
        </label>
        <input
          type="color"
          value={style.color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{
            width: 32,
            height: 24,
            padding: 0,
            border: `1px solid ${TIMELINE_COLORS.border}`,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Background */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ width: 60, fontSize: 11, color: TIMELINE_COLORS.textMuted }}>
          Background
        </label>
        <input
          type="checkbox"
          checked={style.showBackground}
          onChange={(e) => onChange({ showBackground: e.target.checked })}
        />
      </div>
    </div>
  );
}
