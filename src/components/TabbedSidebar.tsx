/**
 * Video Editor V2 - Tabbed Sidebar Component
 * Container with tabs for Media, Subtitles, and Overlays panels.
 */

import { useState, useCallback, useRef } from 'react';
import type { Source } from '../core/Source';
import type { Track } from '../core/Track';
import { isSubtitleClip, isOverlayClip } from '../core/Track';
import type { SubtitleClip } from '../core/SubtitleClip';
import type { OverlayClip } from '../core/OverlayClip';
import type { SubtitleCue, SubtitleStyle, OverlayPosition, OverlayStyle } from '../core/types';
import { formatTimecode } from '../utils/time';
import { formatTime, parseSubtitles, exportToSRT, exportToWebVTT } from '../utils/subtitle';
import { SUBTITLE, TIMELINE_COLORS } from '../constants';

/** Tab type */
export type SidebarTab = 'media' | 'subtitles' | 'overlays';

/** Data type for drag-and-drop */
export const DRAG_DATA_TYPE = 'application/x-video-editor-source';

export interface TabbedSidebarProps {
  /** Active tab */
  activeTab: SidebarTab;
  /** Callback when tab changes */
  onTabChange: (tab: SidebarTab) => void;

  // Media tab props
  sources: ReadonlyMap<string, Source>;
  onLoadHls: (url: string) => Promise<void>;
  onLoadFile?: (file: File) => Promise<void>;
  isLoading: boolean;
  loadingProgress: number;

  // Subtitles tab props
  tracks: readonly Track[];
  selectedClipId?: string;
  currentTimeUs: number;
  onSeek?: (timeUs: number) => void;
  onSubtitleClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onCreateSubtitleTrack?: () => void;
  onAddSubtitleClip?: (trackId: string, clip: SubtitleClip) => void;
  onSubtitleClipSelect?: (clipId: string, trackId: string) => void;

  // Overlays tab props
  onOverlayClipUpdate?: (clipId: string, clip: OverlayClip) => void;
  onCreateOverlayTrack?: () => void;
  onAddOverlayClip?: (trackId: string, clip: OverlayClip) => void;
  onOverlayClipSelect?: (clipId: string, trackId: string) => void;

  // Common
  onRefresh?: () => void;
}

const SIDEBAR_WIDTH = 320;

export function TabbedSidebar(props: TabbedSidebarProps) {
  const { activeTab, onTabChange } = props;

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        backgroundColor: TIMELINE_COLORS.trackHeaderBg,
        borderLeft: `1px solid ${TIMELINE_COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'media' && <MediaTabContent {...props} />}
        {activeTab === 'subtitles' && <SubtitlesTabContent {...props} />}
        {activeTab === 'overlays' && <OverlaysTabContent {...props} />}
      </div>
    </div>
  );
}

// ============================================================================
// TAB BAR
// ============================================================================

interface TabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'media', label: 'Media' },
    { id: 'subtitles', label: 'Subtitles' },
    { id: 'overlays', label: 'Overlays' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        backgroundColor: TIMELINE_COLORS.background,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            flex: 1,
            padding: '10px 8px',
            fontSize: 12,
            fontWeight: activeTab === tab.id ? 600 : 400,
            color: activeTab === tab.id ? '#fff' : '#888',
            backgroundColor: activeTab === tab.id ? TIMELINE_COLORS.trackHeaderBg : 'transparent',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// MEDIA TAB CONTENT
// ============================================================================

function MediaTabContent(props: TabbedSidebarProps) {
  const { sources, onLoadHls, onLoadFile, isLoading, loadingProgress } = props;

  const [hlsUrl, setHlsUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = useCallback(async () => {
    if (!hlsUrl || isLoading) return;
    await onLoadHls(hlsUrl);
    setHlsUrl('');
  }, [hlsUrl, isLoading, onLoadHls]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLoadClick();
      }
    },
    [handleLoadClick]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !onLoadFile) return;

      for (const file of Array.from(files)) {
        await onLoadFile(file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onLoadFile]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const sourceList = Array.from(sources.values());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: '1px solid #333' }}>
        {/* HLS URL Input */}
        <input
          type="text"
          placeholder="Enter HLS URL (.m3u8)"
          value={hlsUrl}
          onChange={(e) => setHlsUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />

        {/* Load HLS Button */}
        <button
          onClick={handleLoadClick}
          disabled={isLoading || !hlsUrl}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '8px 16px',
            fontSize: 13,
            backgroundColor: isLoading ? '#333' : '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? `Loading... ${loadingProgress.toFixed(0)}%` : 'Load HLS'}
        </button>

        {/* Divider */}
        <div
          style={{
            margin: '12px 0',
            textAlign: 'center',
            color: '#666',
            fontSize: 12,
            position: 'relative',
          }}
        >
          <span style={{ backgroundColor: '#333', padding: '0 8px', position: 'relative', zIndex: 1 }}>
            or
          </span>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: '#444',
            }}
          />
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov,.m4v,audio/mpeg,audio/wav,.mp3,.wav"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Browse Files Button */}
        <button
          onClick={handleBrowseClick}
          disabled={isLoading || !onLoadFile}
          style={{
            width: '100%',
            padding: '8px 16px',
            fontSize: 13,
            backgroundColor: isLoading ? '#333' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isLoading || !onLoadFile ? 'not-allowed' : 'pointer',
            opacity: onLoadFile ? 1 : 0.5,
          }}
        >
          Upload Files (MP4/MOV/MP3/WAV)
        </button>
      </div>

      {/* Source List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {sourceList.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 13 }}>
            No media loaded.
            <br />
            Upload local files or enter an HLS URL to get started.
          </div>
        ) : (
          sourceList.map((source) => <MediaLibraryItem key={source.id} source={source} />)
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MEDIA LIBRARY ITEM
// ============================================================================

interface MediaLibraryItemProps {
  source: Source;
}

function MediaLibraryItem({ source }: MediaLibraryItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_DATA_TYPE, source.id);
      e.dataTransfer.effectAllowed = 'copy';
      setIsDragging(true);
    },
    [source.id]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const displayName =
    'fileName' in source && typeof source.fileName === 'string'
      ? source.fileName
      : `${source.type.toUpperCase()} Video`;

  const isAudioOnly = source.isAudioOnly;

  const resolution = isAudioOnly
    ? 'Audio Only'
    : source.width && source.height
      ? `${source.width}x${source.height}`
      : 'Unknown';

  const getStatusIndicator = () => {
    if (source.hasError) return { color: '#ff4444', text: 'Error' };
    if (source.isLoading) return { color: '#f59e0b', text: 'Loading' };
    if (source.isReady) return { color: '#10b981', text: 'Ready' };
    if (source.isPlayable) return { color: '#3b82f6', text: 'Playable' };
    return { color: '#666', text: 'Idle' };
  };

  const status = getStatusIndicator();
  const canDrag = source.isPlayable || source.isReady;

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 10,
        marginBottom: 8,
        backgroundColor: isDragging ? '#2a4a7a' : '#1e1e1e',
        borderRadius: 6,
        border: `1px solid ${isDragging ? '#3b82f6' : '#333'}`,
        cursor: canDrag ? 'grab' : 'default',
        opacity: canDrag ? 1 : 0.6,
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
      title={canDrag ? 'Drag to timeline to add' : 'Loading...'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{displayName}</span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            backgroundColor: status.color + '22',
            color: status.color,
            borderRadius: 4,
          }}
        >
          {status.text}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
        <span>{formatTimecode(source.durationUs)}</span>
        <span style={isAudioOnly ? { color: '#3b9858' } : undefined}>{resolution}</span>
        {!isAudioOnly && source.hasAudio && <span style={{ color: '#3b9858' }}>+Audio</span>}
      </div>

      {source.hasError && source.errorMessage && (
        <div style={{ fontSize: 11, color: '#ff4444', marginTop: 4 }}>{source.errorMessage}</div>
      )}
    </div>
  );
}

// ============================================================================
// SUBTITLES TAB CONTENT
// ============================================================================

function SubtitlesTabContent(props: TabbedSidebarProps) {
  const {
    tracks,
    selectedClipId,
    currentTimeUs,
    onSeek,
    onSubtitleClipUpdate,
    onCreateSubtitleTrack,
    onAddSubtitleClip,
    onRefresh,
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
        const { SubtitleClip } = await import('../core/SubtitleClip');
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
          <button
            onClick={onCreateSubtitleTrack}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 13,
              backgroundColor: TIMELINE_COLORS.clipSubtitle,
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            + Create Subtitle Track
          </button>
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

// ============================================================================
// OVERLAYS TAB CONTENT
// ============================================================================

function OverlaysTabContent(props: TabbedSidebarProps) {
  const {
    tracks,
    selectedClipId,
    currentTimeUs,
    onOverlayClipUpdate,
    onCreateOverlayTrack,
    onAddOverlayClip,
    onRefresh,
  } = props;

  const [showStyleEditor, setShowStyleEditor] = useState(false);

  // Find selected overlay clip
  const selectedOverlay = (() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.id === selectedClipId && isOverlayClip(clip)) {
          return { clip, track };
        }
      }
    }
    return null;
  })();

  const overlayTracks = tracks.filter((t) => t.type === 'overlay');
  const firstOverlayTrack = overlayTracks[0];

  const handleAddOverlay = useCallback(async () => {
    if (!firstOverlayTrack || !onAddOverlayClip) return;

    const { OverlayClip } = await import('../core/OverlayClip');
    const newClip = OverlayClip.createText(currentTimeUs, 'New Overlay');
    onAddOverlayClip(firstOverlayTrack.id, newClip);
    onRefresh?.();
  }, [firstOverlayTrack, currentTimeUs, onAddOverlayClip, onRefresh]);

  const handleContentUpdate = useCallback(
    (content: string) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.setContent(content);
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  const handlePositionUpdate = useCallback(
    (position: Partial<OverlayPosition>) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.setPosition(position);
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  const handleStyleUpdate = useCallback(
    (updates: Partial<OverlayStyle>) => {
      if (!selectedOverlay) return;
      const { clip } = selectedOverlay;
      clip.style = { ...clip.style, ...updates };
      onOverlayClipUpdate?.(clip.id, clip);
      onRefresh?.();
    },
    [selectedOverlay, onOverlayClipUpdate, onRefresh]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
        {overlayTracks.length === 0 ? (
          <button
            onClick={onCreateOverlayTrack}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 13,
              backgroundColor: TIMELINE_COLORS.clipOverlay,
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            + Create Overlay Track
          </button>
        ) : !selectedOverlay ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
              Select an overlay clip to edit
            </div>
            <button
              onClick={handleAddOverlay}
              style={{
                width: '100%',
                padding: '8px 16px',
                fontSize: 13,
                backgroundColor: TIMELINE_COLORS.clipOverlay,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              + Add Overlay at Playhead
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAddOverlay}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 12,
                backgroundColor: TIMELINE_COLORS.clipOverlay,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              + Add Overlay
            </button>
          </div>
        )}
      </div>

      {/* Content - Selected Overlay Editor */}
      {selectedOverlay && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {/* Content type indicator */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 12,
              padding: 8,
              backgroundColor: '#1e1e1e',
              borderRadius: 6,
            }}
          >
            {(['text', 'html', 'widget'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  selectedOverlay.clip.contentType = type;
                  onOverlayClipUpdate?.(selectedOverlay.clip.id, selectedOverlay.clip);
                  onRefresh?.();
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 11,
                  backgroundColor: selectedOverlay.clip.contentType === type ? '#3b82f6' : 'transparent',
                  color: selectedOverlay.clip.contentType === type ? '#fff' : '#888',
                  border: `1px solid ${
                    selectedOverlay.clip.contentType === type ? '#3b82f6' : TIMELINE_COLORS.border
                  }`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Content editor */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
              Content
            </label>
            <textarea
              value={selectedOverlay.clip.content}
              onChange={(e) => handleContentUpdate(e.target.value)}
              placeholder={
                selectedOverlay.clip.contentType === 'text'
                  ? 'Enter text...'
                  : selectedOverlay.clip.contentType === 'html'
                    ? 'Enter HTML...'
                    : 'Widget identifier...'
              }
              style={{
                width: '100%',
                padding: 10,
                fontSize: 13,
                backgroundColor: '#0a0a0a',
                border: `1px solid ${TIMELINE_COLORS.border}`,
                borderRadius: 4,
                color: '#fff',
                resize: 'vertical',
                minHeight: 80,
                boxSizing: 'border-box',
                fontFamily: selectedOverlay.clip.contentType === 'html' ? 'monospace' : 'inherit',
              }}
            />
          </div>

          {/* Position controls */}
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: '#1e1e1e',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Position</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: '#666' }}>
                  X: {selectedOverlay.clip.position.xPercent.toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedOverlay.clip.position.xPercent}
                  onChange={(e) => handlePositionUpdate({ xPercent: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: '#666' }}>
                  Y: {selectedOverlay.clip.position.yPercent.toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedOverlay.clip.position.yPercent}
                  onChange={(e) => handlePositionUpdate({ yPercent: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

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
            <OverlayStyleEditor style={selectedOverlay.clip.style} onStyleUpdate={handleStyleUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OVERLAY STYLE EDITOR
// ============================================================================

interface OverlayStyleEditorProps {
  style: OverlayStyle;
  onStyleUpdate: (updates: Partial<OverlayStyle>) => void;
}

function OverlayStyleEditor({ style, onStyleUpdate }: OverlayStyleEditorProps) {
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
