import type { MediaTrack, TimelineViewport } from '../../types/editor';
import { TIME } from '../../constants';
import { formatTime } from '../../utils/time';

const { MICROSECONDS_PER_SECOND } = TIME;

const TRACK_COLORS: Record<MediaTrack['type'], { badge: string; gradient: string; border: string }> = {
  video: {
    badge: 'bg-blue-500/20 text-blue-100 border border-blue-400/50',
    gradient: 'from-blue-500/50 via-blue-400/35 to-blue-300/20',
    border: 'border-blue-300/60',
  },
  audio: {
    badge: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/50',
    gradient: 'from-emerald-500/45 via-emerald-400/30 to-emerald-300/15',
    border: 'border-emerald-300/60',
  },
};

interface TrackLabelColumnProps {
  tracks: MediaTrack[];
  laneHeight: number;
  width: number;
}

export function TrackLabelColumn({ tracks, laneHeight, width }: TrackLabelColumnProps) {
  return (
    <div
      className="bg-gray-900/80 border border-gray-700/70 rounded-l-lg overflow-hidden"
      style={{ width }}
    >
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className={`flex items-center justify-between px-3 text-sm text-gray-100 ${
            index !== tracks.length - 1 ? 'border-b border-gray-800/70' : ''
          }`}
          style={{ height: laneHeight }}
        >
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight">{track.label}</span>
            <span className="text-[11px] text-gray-400">
              {track.type === 'video' ? 'Video track' : 'Audio track'}
            </span>
          </div>
          <span
            className={`text-[11px] px-2 py-1 rounded-full uppercase leading-none ${
              TRACK_COLORS[track.type].badge
            }`}
          >
            {track.type === 'video' ? 'V' : 'A'}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TrackLanesProps {
  tracks: MediaTrack[];
  viewport: TimelineViewport;
  laneHeight: number;
}

export function TrackLanes({ tracks, viewport, laneHeight }: TrackLanesProps) {
  const visibleDurationUs = Math.max(viewport.endTimeUs - viewport.startTimeUs, 1);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className={`absolute inset-x-0 ${index !== tracks.length - 1 ? 'border-b border-gray-800/60' : ''}`}
          style={{ top: index * laneHeight, height: laneHeight }}
        >
          <div className="absolute inset-0 bg-gray-900/40" />

          {track.clips.map((clip) => {
            const clipStartUs = clip.startUs;
            const clipEndUs = clip.startUs + clip.durationUs;

            // Skip clips that are completely out of view
            if (clipEndUs <= viewport.startTimeUs || clipStartUs >= viewport.endTimeUs) {
              return null;
            }

            const clampedStartUs = Math.max(clipStartUs, viewport.startTimeUs);
            const clampedEndUs = Math.min(clipEndUs, viewport.endTimeUs);
            const leftPercent = ((clampedStartUs - viewport.startTimeUs) / visibleDurationUs) * 100;
            const widthPercent = ((clampedEndUs - clampedStartUs) / visibleDurationUs) * 100;
            const styles = TRACK_COLORS[track.type];

            return (
              <div
                key={clip.id}
                className={`absolute rounded-md shadow-md overflow-hidden backdrop-blur-sm border ${styles.border}`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 1)}%`,
                  top: laneHeight * 0.15,
                  height: laneHeight * 0.7,
                }}
                title={`${clip.label} · ${formatTime(clip.durationUs / MICROSECONDS_PER_SECOND)}`}
              >
                <div className={`h-full bg-gradient-to-r ${styles.gradient}`}>
                  <div className="px-3 py-1 flex items-center justify-between text-[11px] text-white/90">
                    <span className="truncate font-semibold">{clip.label}</span>
                    <span className="opacity-70">
                      {formatTime(clip.durationUs / MICROSECONDS_PER_SECOND)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
