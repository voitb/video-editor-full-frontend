/**
 * TimeRuler - Displays time markers and handles scrubbing
 */

import { TIMELINE_COLORS } from '../../../constants';
import { formatTimecodeAdaptive } from '../../../utils/time';

interface TimeMarker {
  timeUs: number;
  label: string;
}

interface TimeRulerProps {
  timeMarkers: TimeMarker[];
  totalTimelineWidth: number;
  timeToPixel: (timeUs: number) => number;
  isRulerDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TimeRuler({
  timeMarkers,
  totalTimelineWidth,
  timeToPixel,
  isRulerDragging,
  onMouseDown,
  scrollRef,
}: TimeRulerProps) {
  return (
    <div
      ref={scrollRef}
      onMouseDown={onMouseDown}
      className="timeline-scroll-hide"
      style={{
        flex: 1,
        backgroundColor: TIMELINE_COLORS.rulerBg,
        overflowX: 'auto',
        overflowY: 'hidden',
        position: 'relative',
        zIndex: 5,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
        cursor: isRulerDragging ? 'grabbing' : 'pointer',
      }}
    >
      <div
        style={{
          width: totalTimelineWidth,
          height: '100%',
          position: 'relative',
        }}
      >
        {timeMarkers.map((marker, index) => {
          const isFirstMarker = index === 0 && marker.timeUs === 0;
          return (
            <div
              key={marker.timeUs}
              style={{
                position: 'absolute',
                left: timeToPixel(marker.timeUs),
                top: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isFirstMarker ? 'flex-start' : 'center',
                justifyContent: 'flex-end',
                paddingBottom: 2,
                transform: isFirstMarker ? 'none' : 'translateX(-50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 1,
                  height: '100%',
                  backgroundColor: TIMELINE_COLORS.gridMajor,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: TIMELINE_COLORS.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {marker.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Generate time markers from grid lines
 */
export function generateTimeMarkers(
  gridLines: Array<{ timeUs: number; type: string }>,
  effectiveVisibleDuration: number,
  timeToPixel: (timeUs: number) => number,
  totalTimelineWidth: number
): TimeMarker[] {
  return gridLines
    .filter(l => l.type === 'major')
    .map(l => ({
      timeUs: l.timeUs,
      label: formatTimecodeAdaptive(l.timeUs, effectiveVisibleDuration),
    }))
    .filter(m => timeToPixel(m.timeUs) < totalTimelineWidth - 40);
}
