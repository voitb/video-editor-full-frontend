/**
 * Subtitles Tab
 * Subtitle editing tab content with cue list and style editor.
 */

import { useState } from 'react';
import type { Track } from '../../../../core/Track';
import type { SubtitleClip } from '../../../../core/SubtitleClip';
import { TIMELINE_COLORS } from '../../../../constants';
import { SubtitleStyleEditor } from './SubtitleStyleEditor';
import { CueRow } from './CueRow';
import {
  useSubtitleClipSelection,
  useSubtitleCueHandlers,
  useSubtitleImportExport,
} from './hooks';

export interface SubtitlesTabProps {
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

  // Find selected subtitle clip
  const { selectedClip, subtitleTracks, firstSubtitleTrack } = useSubtitleClipSelection({
    tracks,
    selectedClipId,
  });

  // Cue manipulation handlers
  const { handleAddCue, handleUpdateCue, handleDeleteCue, handleStyleUpdate } =
    useSubtitleCueHandlers({
      selectedClip,
      currentTimeUs,
      onSubtitleClipUpdate,
      onRefresh,
      setEditingCueId,
    });

  // Import/export handlers
  const { fileInputRef, handleImport, handleExport, triggerImport } = useSubtitleImportExport({
    selectedClip,
    firstSubtitleTrack,
    currentTimeUs,
    onSubtitleClipUpdate,
    onAddSubtitleClip,
    onRefresh,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <SubtitlesHeader
        subtitleTracks={subtitleTracks}
        selectedClip={selectedClip}
        onTrackAdd={onTrackAdd}
        onAddCue={handleAddCue}
        onTriggerImport={triggerImport}
      />

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
          <ExportButtons onExport={handleExport} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HEADER SECTION
// ============================================================================

interface SubtitlesHeaderProps {
  subtitleTracks: Track[];
  selectedClip: { clip: SubtitleClip; track: Track } | null;
  onTrackAdd?: (type: 'subtitle') => void;
  onAddCue: () => void;
  onTriggerImport: () => void;
}

function SubtitlesHeader({
  subtitleTracks,
  selectedClip,
  onTrackAdd,
  onAddCue,
  onTriggerImport,
}: SubtitlesHeaderProps) {
  if (subtitleTracks.length === 0) {
    return (
      <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
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
      </div>
    );
  }

  if (!selectedClip) {
    return (
      <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
        <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
          Select a subtitle clip to edit
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAddCue}
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
          onClick={onTriggerImport}
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
    </div>
  );
}

// ============================================================================
// EXPORT BUTTONS
// ============================================================================

interface ExportButtonsProps {
  onExport: (format: 'srt' | 'vtt') => void;
}

function ExportButtons({ onExport }: ExportButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button
        onClick={() => onExport('srt')}
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
        onClick={() => onExport('vtt')}
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
  );
}
