/**
 * Overlays Tab
 * Overlay editing tab content with position controls and style editor.
 */

import { useState, useCallback } from 'react';
import type { Track } from '../../../core/Track';
import type { OverlayClip } from '../../../core/OverlayClip';
import type { OverlayPosition, OverlayStyle } from '../../../core/types';
import { isOverlayClip } from '../../../core/Track';
import { TIMELINE_COLORS } from '../../../constants';

interface OverlaysTabProps {
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

    const { OverlayClip } = await import('../../../core/OverlayClip');
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
