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
import {
  OverlaysHeader,
  ContentTypeSelector,
  ContentEditor,
  PositionControls,
} from './components';

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
