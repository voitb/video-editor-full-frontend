import type { TimelineViewport } from '../types/editor';
import { TIME } from '../constants';

const { MICROSECONDS_PER_SECOND } = TIME;

interface TimelineSpritesProps {
  posterUrl?: string;
  duration: number; // seconds
  viewport: TimelineViewport;
}

export function TimelineSprites({ posterUrl, duration, viewport }: TimelineSpritesProps) {
  if (duration === 0 || !posterUrl) {
    return null;
  }

  const durationUs = duration * MICROSECONDS_PER_SECOND;
  const visibleDurationUs = Math.max(viewport.endTimeUs - viewport.startTimeUs, 1);

  const backgroundSize = `${(durationUs / visibleDurationUs) * 100}% 100%`;
  const backgroundPosition = `${(viewport.startTimeUs / durationUs) * 100}% 50%`;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: `url(${posterUrl})`,
          backgroundSize,
          backgroundPosition,
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#0f172a',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/30" />
    </div>
  );
}
