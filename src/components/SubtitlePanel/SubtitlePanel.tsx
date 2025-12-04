/**
 * Video Editor V2 - Subtitle Panel Component
 * Editor panel for managing subtitle cues and styles.
 */

import { useState } from 'react';
import type { Track } from '../../core/Track';
import type { SubtitleClip } from '../../core/SubtitleClip';
import { SUBTITLE, TIMELINE_COLORS } from '../../constants';

import { StyleEditor, CueRow } from './components';
import { useCueManager, useFileOperations, useSelectedClip } from './hooks';

interface SubtitlePanelProps {
  tracks: readonly Track[];
  selectedClipId?: string;
  currentTimeUs: number;
  onSeek?: (timeUs: number) => void;
  onClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onCreateTrack?: () => void;
  onAddClip?: (trackId: string, clip: SubtitleClip) => void;
  onClipSelect?: (clipId: string, trackId: string) => void;
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

  const { selectedClip, subtitleTracks, firstSubtitleTrack } = useSelectedClip(
    tracks,
    selectedClipId
  );

  const { handleAddCue, handleUpdateCue, handleDeleteCue, handleStyleUpdate } = useCueManager({
    selectedClip,
    currentTimeUs,
    onClipUpdate,
    onRefresh,
  });

  const { fileInputRef, handleImport, handleExport, triggerFileInput } = useFileOperations({
    selectedClip,
    firstSubtitleTrack,
    currentTimeUs,
    onClipUpdate,
    onAddClip,
    onRefresh,
  });

  const onAddCueClick = () => {
    const newCueId = handleAddCue();
    if (newCueId) {
      setEditingCueId(newCueId);
    }
  };

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
            onClick={triggerFileInput}
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
              onClick={onAddCueClick}
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
              onClick={triggerFileInput}
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
