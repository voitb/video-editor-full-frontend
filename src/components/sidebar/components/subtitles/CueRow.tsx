/**
 * Cue Row
 * Individual subtitle cue with editing, timing, and delete controls.
 */

import { useState } from 'react';
import type { SubtitleCue } from '../../../../core/types';
import { formatTime } from '../../../../utils/subtitle';
import { TIMELINE_COLORS } from '../../../../constants';

export interface CueRowProps {
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
  const [text, setText] = useState(cue.text);

  const handleSave = () => {
    onUpdate({ text });
    onSave();
  };

  return (
    <div
      style={{
        marginBottom: 8,
        padding: 10,
        backgroundColor: '#1e1e1e',
        borderRadius: 6,
        border: `1px solid ${TIMELINE_COLORS.border}`,
      }}
    >
      {/* Time range */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          onClick={() => onSeek?.(clipStartUs + cue.startUs)}
          style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer' }}
        >
          {formatTime(cue.startUs)} - {formatTime(cue.endUs)}
        </span>
        <button
          onClick={onDelete}
          style={{
            padding: '2px 6px',
            fontSize: 10,
            backgroundColor: 'transparent',
            color: '#ff4444',
            border: '1px solid #ff4444',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      {/* Text */}
      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13,
              backgroundColor: '#0a0a0a',
              border: `1px solid ${TIMELINE_COLORS.border}`,
              borderRadius: 4,
              color: '#fff',
              resize: 'vertical',
              minHeight: 60,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSave}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <div
          onClick={onEdit}
          style={{
            fontSize: 13,
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'pre-wrap',
          }}
        >
          {cue.text}
        </div>
      )}
    </div>
  );
}
