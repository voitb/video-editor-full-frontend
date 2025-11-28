import { useMemo, useEffect, useRef } from 'react';
import type { SpriteData } from '../hooks/useSpriteWorker';
import type { TimelineViewport } from '../types/editor';
import { getSpriteConfig } from '../worker/spriteTypes';
import { TIME } from '../constants';

const { MICROSECONDS_PER_SECOND } = TIME;

interface TimelineSpritesProps {
  sprites: SpriteData[];
  duration: number; // seconds
  isGenerating: boolean;
  progress: { generated: number; total: number } | null;
  viewport: TimelineViewport;
  /** Callback when visible range changes (for progressive loading) */
  onVisibleRangeChange?: (startTimeUs: number, endTimeUs: number) => void;
}

export function TimelineSprites({
  sprites,
  duration,
  isGenerating,
  progress,
  viewport,
  onVisibleRangeChange,
}: TimelineSpritesProps) {
  // Calculate visible duration from viewport
  const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;
  const durationUs = duration * MICROSECONDS_PER_SECOND;

  // Track last notified range to avoid excessive callbacks
  const lastNotifiedRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Notify parent when viewport changes (for progressive loading)
  useEffect(() => {
    if (!onVisibleRangeChange) return;

    const lastRange = lastNotifiedRangeRef.current;
    const significantChange =
      !lastRange ||
      Math.abs(lastRange.start - viewport.startTimeUs) > MICROSECONDS_PER_SECOND ||
      Math.abs(lastRange.end - viewport.endTimeUs) > MICROSECONDS_PER_SECOND;

    if (significantChange) {
      lastNotifiedRangeRef.current = {
        start: viewport.startTimeUs,
        end: viewport.endTimeUs,
      };
      onVisibleRangeChange(viewport.startTimeUs, viewport.endTimeUs);
    }
  }, [viewport.startTimeUs, viewport.endTimeUs, onVisibleRangeChange]);

  // Calculate sprite positions relative to viewport with culling
  const spriteElements = useMemo(() => {
    if (sprites.length === 0 || duration === 0 || visibleDurationUs === 0) return [];

    // Filter and map sprites to visible range
    return sprites
      .map((sprite, index) => {
        // Calculate sprite end time (next sprite's time or video end)
        const nextSprite = sprites[index + 1];
        const spriteEndUs = nextSprite ? nextSprite.timeUs : durationUs;

        // Viewport culling: skip sprites entirely outside viewport
        // Include sprites that overlap with viewport (partial visibility)
        if (spriteEndUs < viewport.startTimeUs || sprite.timeUs > viewport.endTimeUs) {
          return null;
        }

        // Calculate position as percentage of VIEWPORT (not total duration)
        const leftPercent = ((sprite.timeUs - viewport.startTimeUs) / visibleDurationUs) * 100;

        // Calculate width based on interval between sprites, relative to viewport
        const widthPercent = ((spriteEndUs - sprite.timeUs) / visibleDurationUs) * 100;

        return {
          key: `sprite-${sprite.timeUs}`,
          leftPercent,
          widthPercent: Math.max(0, Math.min(widthPercent, 100 - leftPercent)),
          sprite,
        };
      })
      .filter((element): element is NonNullable<typeof element> => element !== null);
  }, [sprites, duration, viewport.startTimeUs, viewport.endTimeUs, visibleDurationUs, durationUs]);

  if (duration === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Sprite thumbnails */}
      {spriteElements.map(({ key, leftPercent, widthPercent, sprite }) => (
        <div
          key={key}
          className="absolute top-0 h-full"
          style={{
            left: `${leftPercent}%`,
            width: `${widthPercent}%`,
            minWidth: '1px',
          }}
        >
          <div
            className="h-full w-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${sprite.blobUrl})`,
              backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
              backgroundSize: `${getSpriteConfig().sheetWidth}px ${getSpriteConfig().sheetHeight}px`,
            }}
          />
        </div>
      ))}

      {/* Loading overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-24 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{
                  width: progress ? `${(progress.generated / progress.total) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="text-[10px] text-gray-400">
              {progress ? `${progress.generated}/${progress.total}` : 'Loading...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
