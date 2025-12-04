/**
 * TimelineContextMenu - Context menu for track headers
 */

import { ContextMenu, MenuItem, MenuSeparator, MenuHeader } from '../../ui';
import { TIMELINE_COLORS, TRACK_COLOR_OPTIONS } from '../../../constants';
import type { Track } from '../../../core/Track';
import type { TrackType } from '../../../core/types';

interface TrackHeaderMenuState {
  trackId: string;
  x: number;
  y: number;
}

interface TimelineContextMenuProps {
  trackHeaderMenu: TrackHeaderMenuState | null;
  tracks: readonly Track[];
  onClose: () => void;
  onTrackAdd?: (type: TrackType) => void;
  onTrackInsert?: (type: TrackType, referenceTrackId: string, position: 'above' | 'below') => void;
  onTrackColorChange?: (trackId: string, color: string | undefined) => void;
  onTrackRename?: (trackId: string, newLabel: string) => void;
  onTrackRemove?: (trackId: string) => void;
}

export function TimelineContextMenu({
  trackHeaderMenu,
  tracks,
  onClose,
  onTrackAdd,
  onTrackInsert,
  onTrackColorChange,
  onTrackRename,
  onTrackRemove,
}: TimelineContextMenuProps) {
  return (
    <ContextMenu
      open={trackHeaderMenu !== null}
      onClose={onClose}
      x={trackHeaderMenu?.x ?? 0}
      y={trackHeaderMenu?.y ?? 0}
    >
      {onTrackAdd && trackHeaderMenu && (
        <>
          <MenuHeader>Add Track</MenuHeader>
          {[
            { type: 'video' as const, label: 'Video Track Above' },
            { type: 'audio' as const, label: 'Audio Track Above' },
            { type: 'subtitle' as const, label: 'Subtitle Track Above' },
            { type: 'overlay' as const, label: 'Overlay Track Above' },
          ].map((item) => (
            <MenuItem
              key={item.type}
              onClick={() => {
                onTrackInsert?.(item.type, trackHeaderMenu.trackId, 'above');
                onClose();
              }}
            >
              {item.label}
            </MenuItem>
          ))}
          <MenuSeparator />
        </>
      )}

      {onTrackColorChange && trackHeaderMenu && (
        <>
          <MenuHeader>Track Color</MenuHeader>
          <div
            style={{
              padding: '4px 12px 8px',
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {TRACK_COLOR_OPTIONS.map((option) => (
              <button
                key={option.name}
                onClick={() => {
                  onTrackColorChange(trackHeaderMenu.trackId, option.value);
                  onClose();
                }}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  backgroundColor: option.value || '#333',
                  border: option.value ? 'none' : `1px dashed ${TIMELINE_COLORS.border}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
                title={option.name}
              />
            ))}
          </div>
          <MenuSeparator />
        </>
      )}

      {onTrackRename && trackHeaderMenu && (
        <MenuItem
          onClick={() => {
            const track = tracks.find(t => t.id === trackHeaderMenu.trackId);
            const newLabel = window.prompt('Enter new track name:', track?.label || '');
            if (newLabel && newLabel.trim()) {
              onTrackRename(trackHeaderMenu.trackId, newLabel.trim());
            }
            onClose();
          }}
        >
          Rename Track
        </MenuItem>
      )}

      {onTrackRemove && trackHeaderMenu && (
        <MenuItem
          onClick={() => {
            onTrackRemove(trackHeaderMenu.trackId);
            onClose();
          }}
          danger
        >
          Delete Track
        </MenuItem>
      )}
    </ContextMenu>
  );
}
