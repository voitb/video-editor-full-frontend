/**
 * SnapIndicator - Displays the snap line when clips are being dragged
 */

import { TIMELINE, TIMELINE_COLORS } from '../../../constants';

interface SnapIndicatorProps {
  timeUs: number;
  timeToPixel: (timeUs: number) => number;
}

export function SnapIndicator({ timeUs, timeToPixel }: SnapIndicatorProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: TIMELINE.TRACK_HEADER_WIDTH + timeToPixel(timeUs),
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: TIMELINE_COLORS.snapLine,
        pointerEvents: 'none',
        zIndex: 90,
      }}
    />
  );
}
