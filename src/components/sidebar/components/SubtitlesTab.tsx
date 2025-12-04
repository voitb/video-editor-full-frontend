/**
 * Subtitles Tab
 * Subtitle editing tab content with cue list and style editor.
 */

import { useState, useCallback, useRef } from 'react';
import type { Track } from '../../../core/Track';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import type { SubtitleCue, SubtitleStyle } from '../../../core/types';
import { isSubtitleClip } from '../../../core/Track';
import { formatTime, parseSubtitles, exportToSRT, exportToWebVTT } from '../../../utils/subtitle';
import { SUBTITLE, TIMELINE_COLORS } from '../../../constants';

interface SubtitlesTabProps {
  tracks: readonly Track[];
  selectedClipId?: string;
  currentTimeUs: number;
  onSeek?: (timeUs: number) => void;
  onSubtitleClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onAddSubtitleClip?: (trackId: string, clip: SubtitleClip) => void;
  onRefresh?: () => void;
  onTrackAdd?: (type: 'subtitle') => void;
}

export function SubtitlesTab(props: SubtitlesTabProps) {
  const {
    tracks,
    selectedClipId,
    currentTimeUs,
    onSeek,
    onSubtitleClipUpdate,
    onAddSubtitleClip,
    onRefresh,
    onTrackAdd,
  } = props;

  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Find selected subtitle clip
  const selectedClip = (() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.id === selectedClipId && isSubtitleClip(clip)) {
          return { clip, track };
        }
      }
    }
    return null;
  })();

  const subtitleTracks = tracks.filter((t) => t.type === 'subtitle');
  const firstSubtitleTrack = subtitleTracks[0];

  const handleAddCue = useCallback(() => {
    if (!selectedClip) return;
    const { clip } = selectedClip;
    const relativeTime = Math.max(0, currentTimeUs - clip.startUs);

    const newCue = clip.addCue({
      startUs: relativeTime,
      endUs: relativeTime + SUBTITLE.DEFAULT_CUE_DURATION_US,
      text: 'New subtitle',
    });

    setEditingCueId(newCue.id);
    onSubtitleClipUpdate?.(clip.id, clip);
    onRefresh?.();
  }, [selectedClip, currentTimeUs, onSubtitleClipUpdate, onRefresh]);

  const handleUpdateCue = useCallback(
    (cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.updateCue(cueId, updates);
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  const handleDeleteCue = useCallback(
    (cueId: string) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.removeCue(cueId);
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  const handleStyleUpdate = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      clip.style = { ...clip.style, ...updates };
      onSubtitleClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onSubtitleClipUpdate, onRefresh]
  );

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      const cues = parseSubtitles(content);

      if (cues.length === 0) {
        alert('No subtitles found in file');
        return;
      }

      if (selectedClip) {
        const { clip } = selectedClip;
        for (const cue of cues) {
          clip.addCue(cue);
        }
        onSubtitleClipUpdate?.(clip.id, clip);
        onRefresh?.();
      } else if (firstSubtitleTrack && onAddSubtitleClip) {
        const { SubtitleClip } = await import('../../../core/SubtitleClip');
        const newClip = new SubtitleClip({
          startUs: currentTimeUs,
          cues,
          style: { ...SUBTITLE.DEFAULT_STYLE },
          label: file.name.replace(/\.(srt|vtt)$/i, ''),
        });
        onAddSubtitleClip(firstSubtitleTrack.id, newClip);
        onRefresh?.();
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedClip, firstSubtitleTrack, currentTimeUs, onSubtitleClipUpdate, onAddSubtitleClip, onRefresh]
  );

  const handleExport = useCallback(
    (format: 'srt' | 'vtt') => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      const content = format === 'srt' ? exportToSRT([...clip.cues]) : exportToWebVTT([...clip.cues]);

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clip.label || 'subtitles'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [selectedClip]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
        {subtitleTracks.length === 0 ? (
          <div
            style={{
              width: '100%',
              padding: '16px',
              fontSize: 12,
              color: TIMELINE_COLORS.textMuted,
              textAlign: 'center',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: 4,
              border: `1px dashed ${TIMELINE_COLORS.border}`,
            }}
          >
            <div style={{ marginBottom: 12 }}>No subtitle tracks yet</div>
            {onTrackAdd && (
              <button
                onClick={() => onTrackAdd('subtitle')}
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  backgroundColor: TIMELINE_COLORS.clipSubtitle,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                + Add Subtitle Track
              </button>
            )}
          </div>
        ) : !selectedClip ? (
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
            Select a subtitle clip to edit
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAddCue}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 12,
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              + Add Cue
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Import
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        onChange={handleImport}
        style={{ display: 'none' }}
      />

      {/* Content */}
      {selectedClip && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {/* Style toggle */}
          <button
            onClick={() => setShowStyleEditor(!showStyleEditor)}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: 12,
              fontSize: 12,
              backgroundColor: showStyleEditor ? '#333' : '#1e1e1e',
              color: '#fff',
              border: `1px solid ${TIMELINE_COLORS.border}`,
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {showStyleEditor ? '- Hide Style' : '+ Edit Style'}
          </button>

          {/* Style editor */}
          {showStyleEditor && (
            <SubtitleStyleEditor style={selectedClip.clip.style} onStyleUpdate={handleStyleUpdate} />
          )}

          {/* Cues list */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              {selectedClip.clip.cueCount} cue(s)
            </div>
            {selectedClip.clip.getVisibleCues().map((cue) => (
              <CueRow
                key={cue.id}
                cue={cue}
                clipStartUs={selectedClip.clip.startUs}
                isEditing={editingCueId === cue.id}
                onEdit={() => setEditingCueId(cue.id)}
                onSave={() => setEditingCueId(null)}
                onUpdate={(updates) => handleUpdateCue(cue.id, updates)}
                onDelete={() => handleDeleteCue(cue.id)}
                onSeek={onSeek}
              />
            ))}
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => handleExport('srt')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                backgroundColor: '#1e1e1e',
                color: '#888',
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Export SRT
            </button>
            <button
              onClick={() => handleExport('vtt')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                backgroundColor: '#1e1e1e',
                color: '#888',
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Export VTT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUBTITLE STYLE EDITOR
// ============================================================================

interface SubtitleStyleEditorProps {
  style: SubtitleStyle;
  onStyleUpdate: (updates: Partial<SubtitleStyle>) => void;
}

function SubtitleStyleEditor({ style, onStyleUpdate }: SubtitleStyleEditorProps) {
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

// ============================================================================
// CUE ROW
// ============================================================================

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

function CueRow({ cue, clipStartUs, isEditing, onEdit, onSave, onUpdate, onDelete, onSeek }: CueRowProps) {
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
