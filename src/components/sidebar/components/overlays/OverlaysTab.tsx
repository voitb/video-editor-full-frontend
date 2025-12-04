/**
 * Overlays Tab
 * Overlay editing tab content with position controls and style editor.
 */

import { useState } from 'react';
import type { Track } from '../../../../core/Track';
import type { OverlayClip } from '../../../../core/OverlayClip';
import { TIMELINE_COLORS } from '../../../../constants';
import { OverlayStyleEditor } from './OverlayStyleEditor';
import { useOverlayClipSelection, useOverlayHandlers } from './hooks';

export interface OverlaysTabProps {
  tracks: readonly Track[];
  selectedClipId?: string;
  currentTimeUs: number;
  onOverlayClipUpdate?: (clipId: string, clip: OverlayClip) => void;
  onAddOverlayClip?: (trackId: string, clip: OverlayClip) => void;
  onRefresh?: () => void;
  onTrackAdd?: (type: 'overlay') => void;
}

export function OverlaysTab(props: OverlaysTabProps) {
  const {
    tracks,
    selectedClipId,
    currentTimeUs,
    onOverlayClipUpdate,
    onAddOverlayClip,
    onRefresh,
    onTrackAdd,
  } = props;

  const [showStyleEditor, setShowStyleEditor] = useState(false);

  // Find selected overlay clip
  const { selectedOverlay, overlayTracks, firstOverlayTrack } = useOverlayClipSelection({
    tracks,
    selectedClipId,
  });

  // Overlay manipulation handlers
  const {
    handleAddOverlay,
    handleContentUpdate,
    handleContentTypeChange,
    handlePositionUpdate,
    handleStyleUpdate,
  } = useOverlayHandlers({
    selectedOverlay,
    firstOverlayTrack,
    currentTimeUs,
    onOverlayClipUpdate,
    onAddOverlayClip,
    onRefresh,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <OverlaysHeader
        overlayTracks={overlayTracks}
        selectedOverlay={selectedOverlay}
        onTrackAdd={onTrackAdd}
        onAddOverlay={handleAddOverlay}
      />

      {/* Content - Selected Overlay Editor */}
      {selectedOverlay && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {/* Content type selector */}
          <ContentTypeSelector
            selectedType={selectedOverlay.clip.contentType}
            onTypeChange={handleContentTypeChange}
          />

          {/* Content editor */}
          <ContentEditor
            content={selectedOverlay.clip.content}
            contentType={selectedOverlay.clip.contentType}
            onContentUpdate={handleContentUpdate}
          />

          {/* Position controls */}
          <PositionControls
            position={selectedOverlay.clip.position}
            onPositionUpdate={handlePositionUpdate}
          />

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
// HEADER SECTION
// ============================================================================

interface OverlaysHeaderProps {
  overlayTracks: Track[];
  selectedOverlay: { clip: OverlayClip; track: Track } | null;
  onTrackAdd?: (type: 'overlay') => void;
  onAddOverlay: () => void;
}

function OverlaysHeader({
  overlayTracks,
  selectedOverlay,
  onTrackAdd,
  onAddOverlay,
}: OverlaysHeaderProps) {
  if (overlayTracks.length === 0) {
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
          <div style={{ marginBottom: 12 }}>No overlay tracks yet</div>
          {onTrackAdd && (
            <button
              onClick={() => onTrackAdd('overlay')}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                backgroundColor: TIMELINE_COLORS.clipOverlay,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              + Add Overlay Track
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!selectedOverlay) {
    return (
      <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
            Select an overlay clip to edit
          </div>
          <button
            onClick={onAddOverlay}
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
      </div>
    );
  }

  return (
    <div style={{ padding: 12, borderBottom: `1px solid ${TIMELINE_COLORS.border}` }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAddOverlay}
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
    </div>
  );
}

// ============================================================================
// CONTENT TYPE SELECTOR
// ============================================================================

interface ContentTypeSelectorProps {
  selectedType: 'text' | 'html' | 'widget';
  onTypeChange: (type: 'text' | 'html' | 'widget') => void;
}

function ContentTypeSelector({ selectedType, onTypeChange }: ContentTypeSelectorProps) {
  return (
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
          onClick={() => onTypeChange(type)}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            backgroundColor: selectedType === type ? '#3b82f6' : 'transparent',
            color: selectedType === type ? '#fff' : '#888',
            border: `1px solid ${selectedType === type ? '#3b82f6' : TIMELINE_COLORS.border}`,
            borderRadius: 4,
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// CONTENT EDITOR
// ============================================================================

interface ContentEditorProps {
  content: string;
  contentType: 'text' | 'html' | 'widget';
  onContentUpdate: (content: string) => void;
}

function ContentEditor({ content, contentType, onContentUpdate }: ContentEditorProps) {
  const placeholder =
    contentType === 'text'
      ? 'Enter text...'
      : contentType === 'html'
        ? 'Enter HTML...'
        : 'Widget identifier...';

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
        Content
      </label>
      <textarea
        value={content}
        onChange={(e) => onContentUpdate(e.target.value)}
        placeholder={placeholder}
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
          fontFamily: contentType === 'html' ? 'monospace' : 'inherit',
        }}
      />
    </div>
  );
}

// ============================================================================
// POSITION CONTROLS
// ============================================================================

interface PositionControlsProps {
  position: { xPercent: number; yPercent: number };
  onPositionUpdate: (position: Partial<{ xPercent: number; yPercent: number }>) => void;
}

function PositionControls({ position, onPositionUpdate }: PositionControlsProps) {
  return (
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
            X: {position.xPercent.toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={position.xPercent}
            onChange={(e) => onPositionUpdate({ xPercent: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: '#666' }}>
            Y: {position.yPercent.toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={position.yPercent}
            onChange={(e) => onPositionUpdate({ yPercent: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
