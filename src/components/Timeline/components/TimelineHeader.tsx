/**
 * TimelineHeader Component
 * Header row containing zoom controls, fit button, add track dropdown, and time ruler.
 */

import { TIMELINE, TIMELINE_COLORS } from '../../../constants';
import { Dropdown, MenuItem } from '../../ui';
import { ZoomSlider, TimeRuler } from './index';
import type { TimeMarker } from './TimeRuler';

export interface TimelineHeaderProps {
  viewport: {
    zoomLevel: number;
  };
  totalTimelineWidth: number;
  timeToPixel: (timeUs: number) => number;
  timeMarkers: TimeMarker[];
  isRulerDragging: boolean;
  onRulerMouseDown: (e: React.MouseEvent) => void;
  timeRulerScrollRef: React.RefObject<HTMLDivElement | null>;
  addTrackDropdownOpen: boolean;
  setAddTrackDropdownOpen: (open: boolean) => void;
  onZoomChange?: (zoom: number) => void;
  onFitToView?: () => void;
  onTrackAdd?: (type: 'video' | 'audio' | 'subtitle' | 'overlay') => void;
}

export function TimelineHeader({
  viewport,
  totalTimelineWidth,
  timeToPixel,
  timeMarkers,
  isRulerDragging,
  onRulerMouseDown,
  timeRulerScrollRef,
  addTrackDropdownOpen,
  setAddTrackDropdownOpen,
  onZoomChange,
  onFitToView,
  onTrackAdd,
}: TimelineHeaderProps) {
  const trackOptions = [
    { type: 'video' as const, label: 'Video Track', color: '#2a4a7a' },
    { type: 'audio' as const, label: 'Audio Track', color: '#2a7a4a' },
    { type: 'subtitle' as const, label: 'Subtitle Track', color: TIMELINE_COLORS.clipSubtitle },
    { type: 'overlay' as const, label: 'Overlay Track', color: TIMELINE_COLORS.clipOverlay },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        height: TIMELINE.TIME_RULER_HEIGHT,
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
      }}
    >
      {/* Left corner with zoom slider, fit button, and add track dropdown */}
      <div
        style={{
          width: TIMELINE.TRACK_HEADER_WIDTH,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
          gap: 4,
          boxSizing: 'border-box',
          overflow: 'visible',
          backgroundColor: TIMELINE_COLORS.trackHeaderBg,
          borderRight: `1px solid ${TIMELINE_COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onZoomChange && (
            <ZoomSlider
              zoomLevel={viewport.zoomLevel}
              minZoom={1}
              maxZoom={TIMELINE.MAX_ZOOM_LEVEL}
              onChange={onZoomChange}
            />
          )}
          {onFitToView && (
            <button
              onClick={onFitToView}
              style={{
                padding: '2px 6px',
                fontSize: 10,
                backgroundColor: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Fit timeline to view"
            >
              Fit
            </button>
          )}
        </div>
        {onTrackAdd && (
          <Dropdown
            open={addTrackDropdownOpen}
            onOpenChange={setAddTrackDropdownOpen}
            placement="bottom-start"
            trigger={
              <button
                type="button"
                onClick={() => setAddTrackDropdownOpen(!addTrackDropdownOpen)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor: '#2a4a7a',
                  color: '#fff',
                  border: `1px solid ${TIMELINE_COLORS.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                + Track
              </button>
            }
          >
            {trackOptions.map((item) => (
              <MenuItem
                key={item.type}
                onClick={() => {
                  onTrackAdd(item.type);
                  setAddTrackDropdownOpen(false);
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: item.color,
                    flexShrink: 0,
                  }}
                />
                {item.label}
              </MenuItem>
            ))}
          </Dropdown>
        )}
      </div>

      {/* Time ruler */}
      <TimeRuler
        timeMarkers={timeMarkers}
        totalTimelineWidth={totalTimelineWidth}
        timeToPixel={timeToPixel}
        isRulerDragging={isRulerDragging}
        onMouseDown={onRulerMouseDown}
        scrollRef={timeRulerScrollRef}
      />
    </div>
  );
}
