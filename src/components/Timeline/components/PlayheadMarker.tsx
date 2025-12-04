/**
 * PlayheadMarker - Displays the playhead indicator
 */

import { TIMELINE, TIMELINE_COLORS } from '../../../constants';

interface PlayheadMarkerProps {
  position: number;
}

export function PlayheadMarker({ position }: PlayheadMarkerProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: TIMELINE.TRACK_HEADER_WIDTH + position,
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: TIMELINE_COLORS.playhead,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -5,
          width: 12,
          height: 12,
          backgroundColor: TIMELINE_COLORS.playhead,
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />
    </div>
  );
}

interface InOutMarkerProps {
  position: number;
  type: 'in' | 'out';
}

export function InOutMarker({ position, type }: InOutMarkerProps) {
  const color = type === 'in' ? '#00ffff' : '#ff00ff';
  const label = type === 'in' ? 'I' : 'O';

  return (
    <div
      style={{
        position: 'absolute',
        left: TIMELINE.TRACK_HEADER_WIDTH + position,
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: color,
        pointerEvents: 'none',
        zIndex: 95,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -5,
          width: 12,
          height: 10,
          backgroundColor: color,
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: -4,
          fontSize: 9,
          fontWeight: 'bold',
          color: color,
          userSelect: 'none',
        }}
      >
        {label}
      </div>
    </div>
  );
}
