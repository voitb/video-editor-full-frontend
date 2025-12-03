/**
 * Video Editor V2 - Subtitle Panel Component
 * Editor panel for managing subtitle cues and styles.
 */

import { useState, useCallback, useRef } from 'react';
import type { Track } from '../core/Track';
import { isSubtitleClip } from '../core/Track';
import type { SubtitleClip } from '../core/SubtitleClip';
import type { SubtitleCue, SubtitleStyle } from '../core/types';
import { formatTime, parseSubtitles, exportToSRT, exportToWebVTT } from '../utils/subtitle';
import { SUBTITLE, TIMELINE_COLORS } from '../constants';

interface SubtitlePanelProps {
  /** All tracks (will filter for subtitle tracks) */
  tracks: readonly Track[];
  /** Currently selected clip ID */
  selectedClipId?: string;
  /** Current playhead time (microseconds) */
  currentTimeUs: number;
  /** Callback when seeking to a time */
  onSeek?: (timeUs: number) => void;
  /** Callback when a subtitle clip is updated */
  onClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  /** Callback to create a new subtitle track */
  onCreateTrack?: () => void;
  /** Callback to add a new subtitle clip */
  onAddClip?: (trackId: string, clip: SubtitleClip) => void;
  /** Callback when clip is selected */
  onClipSelect?: (clipId: string, trackId: string) => void;
  /** Callback to trigger refresh */
  onRefresh?: () => void;
}

export function SubtitlePanel({
  tracks,
  selectedClipId,
  currentTimeUs,
  onSeek,
  onClipUpdate,
  onCreateTrack,
  onAddClip,
  onClipSelect: _onClipSelect,
  onRefresh,
}: SubtitlePanelProps) {
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Find the selected subtitle clip
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

  // Get all subtitle tracks
  const subtitleTracks = tracks.filter((t) => t.type === 'subtitle');

  // Get the first subtitle track (or null)
  const firstSubtitleTrack = subtitleTracks[0];

  // Handle adding a new cue
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
    onClipUpdate?.(clip.id, clip);
    onRefresh?.();
  }, [selectedClip, currentTimeUs, onClipUpdate, onRefresh]);

  // Handle updating a cue
  const handleUpdateCue = useCallback(
    (cueId: string, updates: Partial<Omit<SubtitleCue, 'id'>>) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.updateCue(cueId, updates);
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  // Handle deleting a cue
  const handleDeleteCue = useCallback(
    (cueId: string) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.removeCue(cueId);
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  // Handle style update
  const handleStyleUpdate = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      clip.style = { ...clip.style, ...updates };
      onClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedClip, onClipUpdate, onRefresh]
  );

  // Handle import
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

      // If we have a selected clip, add cues to it
      if (selectedClip) {
        const { clip } = selectedClip;
        for (const cue of cues) {
          clip.addCue(cue);
        }
        onClipUpdate?.(clip.id, clip);
        onRefresh?.();
      } else if (firstSubtitleTrack && onAddClip) {
        // Create a new clip with the imported cues
        const { SubtitleClip } = await import('../core/SubtitleClip');
        const newClip = new SubtitleClip({
          startUs: currentTimeUs,
          cues,
          style: { ...SUBTITLE.DEFAULT_STYLE },
          label: file.name.replace(/\.(srt|vtt)$/i, ''),
        });
        onAddClip(firstSubtitleTrack.id, newClip);
        onRefresh?.();
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedClip, firstSubtitleTrack, currentTimeUs, onClipUpdate, onAddClip, onRefresh]
  );

  // Handle export
  const handleExport = useCallback(
    (format: 'srt' | 'vtt') => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      const content =
        format === 'srt'
          ? exportToSRT([...clip.cues])
          : exportToWebVTT([...clip.cues]);

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
    <div
      style={{
        width: SUBTITLE.PANEL_WIDTH,
        height: '100%',
        backgroundColor: TIMELINE_COLORS.trackHeaderBg,
        borderLeft: `1px solid ${TIMELINE_COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: TIMELINE_COLORS.textPrimary }}>
          Subtitles
        </span>
        {subtitleTracks.length === 0 && (
          <button
            onClick={onCreateTrack}
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
            + Track
          </button>
        )}
      </div>

      {/* No subtitle track message */}
      {subtitleTracks.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: TIMELINE_COLORS.textMuted,
            fontSize: 12,
            textAlign: 'center',
            padding: 20,
          }}
        >
          No subtitle track.
          <br />
          Click "+ Track" to add one.
        </div>
      )}

      {/* No clip selected message */}
      {subtitleTracks.length > 0 && !selectedClip && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: TIMELINE_COLORS.textMuted,
            fontSize: 12,
            textAlign: 'center',
            padding: 20,
            gap: 12,
          }}
        >
          <span>Select a subtitle clip to edit, or import a file.</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '6px 12px',
              backgroundColor: TIMELINE_COLORS.clipSubtitle,
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Import SRT/VTT
          </button>
        </div>
      )}

      {/* Clip editor */}
      {selectedClip && (
        <>
          {/* Toolbar */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={handleAddCue}
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
              + Add Cue
            </button>
            <button
              onClick={() => setShowStyleEditor(!showStyleEditor)}
              style={{
                padding: '4px 8px',
                backgroundColor: showStyleEditor ? '#555' : 'transparent',
                color: TIMELINE_COLORS.textSecondary,
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Style
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,.vtt"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                color: TIMELINE_COLORS.textSecondary,
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Import
            </button>
            <button
              onClick={() => handleExport('srt')}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                color: TIMELINE_COLORS.textSecondary,
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Export SRT
            </button>
          </div>

          {/* Style editor (collapsible) */}
          {showStyleEditor && (
            <StyleEditor style={selectedClip.clip.style} onChange={handleStyleUpdate} />
          )}

          {/* Cue list */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '8px 0',
            }}
          >
            {selectedClip.clip.cues.length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: TIMELINE_COLORS.textMuted,
                  fontSize: 12,
                }}
              >
                No cues yet. Click "+ Add Cue" to create one.
              </div>
            )}
            {selectedClip.clip.cues.map((cue) => (
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
        </>
      )}
    </div>
  );
}

// ============================================================================
// STYLE EDITOR
// ============================================================================

interface StyleEditorProps {
  style: SubtitleStyle;
  onChange: (updates: Partial<SubtitleStyle>) => void;
}

function StyleEditor({ style, onChange }: StyleEditorProps) {
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

function CueRow({
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
    // Seek to the absolute timeline position
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
