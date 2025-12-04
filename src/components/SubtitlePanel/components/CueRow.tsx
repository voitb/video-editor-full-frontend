/**
 * Cue Row Component
 * Displays a single subtitle cue with time and editable text.
 */

import { useState, useCallback } from 'react';
import type { SubtitleCue } from '../../../core/types';
import { formatTime } from '../../../utils/subtitle';
import { TIMELINE_COLORS } from '../../../constants';

interface CueRowProps {
  cue: SubtitleCue;
  clipStartUs: number;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<Omit<SubtitleCue, 'id'>>) => void;
  onDelete: () => void;
  onSeek?: (timeUs: number) => void;
}

export function CueRow({
  cue,
  clipStartUs,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
  onSeek,
}: CueRowProps) {
  const [editText, setEditText] = useState(cue.text);

  const handleSave = useCallback(() => {
    onUpdate({ text: editText });
    onSave();
  }, [editText, onUpdate, onSave]);

  const handleSeek = useCallback(() => {
    onSeek?.(clipStartUs + cue.startUs);
  }, [clipStartUs, cue.startUs, onSeek]);

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        backgroundColor: isEditing ? 'rgba(255,255,255,0.05)' : 'transparent',
      }}
    >
      {/* Time row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <button
          onClick={handleSeek}
          style={{
            padding: '2px 4px',
            backgroundColor: 'transparent',
            color: TIMELINE_COLORS.clipSubtitle,
            border: 'none',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'monospace',
          }}
          title="Seek to this cue"
        >
          {formatTime(cue.startUs)}
        </button>
        <span style={{ color: TIMELINE_COLORS.textMuted, fontSize: 10 }}>-</span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            color: TIMELINE_COLORS.textMuted,
          }}
        >
          {formatTime(cue.endUs)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onDelete}
          style={{
            padding: '2px 6px',
            backgroundColor: 'transparent',
            color: TIMELINE_COLORS.playhead,
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
          }}
          title="Delete cue"
        >
          X
        </button>
      </div>

      {/* Text */}
      {isEditing ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              padding: '4px',
              backgroundColor: '#333',
              color: '#fff',
              border: `1px solid ${TIMELINE_COLORS.border}`,
              borderRadius: 4,
              fontSize: 11,
              resize: 'vertical',
              minHeight: 40,
            }}
          />
          <button
            onClick={handleSave}
            style={{
              padding: '4px 8px',
              backgroundColor: TIMELINE_COLORS.clipSubtitle,
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <div
          onClick={onEdit}
          style={{
            fontSize: 12,
            color: TIMELINE_COLORS.textPrimary,
            whiteSpace: 'pre-wrap',
            cursor: 'text',
            padding: '4px',
            borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.03)',
          }}
        >
          {cue.text || <em style={{ color: TIMELINE_COLORS.textMuted }}>Click to edit</em>}
        </div>
      )}
    </div>
  );
}
