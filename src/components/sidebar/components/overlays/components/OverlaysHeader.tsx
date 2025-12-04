/**
 * Overlays Header
 * Header section with add track/overlay buttons based on state.
 */

import type { Track } from '../../../../../core/Track';
import type { OverlayClip } from '../../../../../core/OverlayClip';
import { TIMELINE_COLORS } from '../../../../../constants';

export interface OverlaysHeaderProps {
  overlayTracks: Track[];
  selectedOverlay: { clip: OverlayClip; track: Track } | null;
  onTrackAdd?: (type: 'overlay') => void;
  onAddOverlay: () => void;
}

export function OverlaysHeader({
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
