import { useMemo } from 'react';
import type { SpriteData } from '../hooks/useSpriteWorker';
import { SPRITE_CONFIG } from '../worker/spriteTypes';

interface TimelineSpritesProps {
  sprites: SpriteData[];
  duration: number; // seconds
  isGenerating: boolean;
  progress: { generated: number; total: number } | null;
}

export function TimelineSprites({
  sprites,
  duration,
  isGenerating,
  progress,
}: TimelineSpritesProps) {
  // Calculate sprite positions along the timeline
  const spriteElements = useMemo(() => {
    if (sprites.length === 0 || duration === 0) return [];

    const durationUs = duration * 1_000_000;

    return sprites.map((sprite, index) => {
      // Calculate position as percentage of timeline
      const leftPercent = (sprite.timeUs / durationUs) * 100;

      // Calculate width based on interval between sprites
      const nextSprite = sprites[index + 1];
      const widthPercent = nextSprite
        ? ((nextSprite.timeUs - sprite.timeUs) / durationUs) * 100
        : ((durationUs - sprite.timeUs) / durationUs) * 100;

      return {
        key: `sprite-${sprite.timeUs}`,
        leftPercent,
        widthPercent: Math.min(widthPercent, 100 - leftPercent),
        sprite,
      };
    });
  }, [sprites, duration]);

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
              backgroundSize: `${SPRITE_CONFIG.sheetWidth}px ${SPRITE_CONFIG.sheetHeight}px`,
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
