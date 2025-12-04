import { useEffect, useRef, useState } from 'react';
import type {
  ClipChange,
  ClipEdge,
  MediaTrack,
  TimelineViewport,
  TrackClip,
} from '../../types/editor';
import { TIME, TIMELINE } from '../../constants';
import { formatTime } from '../../utils/time';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

const { MICROSECONDS_PER_SECOND } = TIME;
const { MIN_TRIM_DURATION_US } = TIMELINE;

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
  trackRef: RefObject<HTMLDivElement | null>;
  visibleDurationUs: number;
  onClipChange?: (change: ClipChange) => void;
}

type DragState =
  | {
      mode: 'move';
      clip: TrackClip;
      trackId: string;
      startUs: number;
      startX: number;
    }
  | {
      mode: 'resize';
      clip: TrackClip;
      trackId: string;
      edge: ClipEdge;
      startUs: number;
      durationUs: number;
      startX: number;
    }
  | {
      mode: 'source-trim';
      clip: TrackClip;
      trackId: string;
      edge: ClipEdge;
      trimInUs: number;
      trimOutUs: number;
      startUs: number;
      durationUs: number;
      startX: number;
    };

export function TrackLanes({
  tracks,
  viewport,
  laneHeight,
  trackRef,
  visibleDurationUs,
  onClipChange,
}: TrackLanesProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const trackRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRectRef.current || visibleDurationUs <= 0) return;
      const deltaX = e.clientX - dragState.startX;
      const deltaUs = (deltaX / trackRectRef.current.width) * visibleDurationUs;

      if (dragState.mode === 'move') {
        const newStartUs = Math.max(0, dragState.startUs + deltaUs);
        onClipChange?.({
          type: 'move',
          trackId: dragState.trackId,
          clipId: dragState.clip.id,
          sourceId: dragState.clip.sourceId,
          newStartUs,
        });
      } else if (dragState.mode === 'resize') {
        // Resize handles adjust timeline position/duration but keep source trim proportional
        if (dragState.edge === 'start') {
          const proposedStart = Math.max(0, dragState.startUs + deltaUs);
          const startDelta = proposedStart - dragState.startUs;
          const proposedDuration = Math.max(
            MIN_TRIM_DURATION_US,
            dragState.durationUs - startDelta
          );
          // Adjust source trim-in proportionally
          const proposedTrimIn = Math.max(0, dragState.clip.trimInUs + startDelta);
          onClipChange?.({
            type: 'trim',
            trackId: dragState.trackId,
            clipId: dragState.clip.id,
            sourceId: dragState.clip.sourceId,
            edge: 'start',
            newStartUs: proposedStart,
            newDurationUs: proposedDuration,
            newTrimInUs: proposedTrimIn,
            newTrimOutUs: dragState.clip.trimOutUs,
          });
        } else {
          const proposedDuration = Math.max(
            MIN_TRIM_DURATION_US,
            dragState.durationUs + deltaUs
          );
          // Adjust source trim-out proportionally
          const durationDelta = proposedDuration - dragState.durationUs;
          const proposedTrimOut = Math.min(
            dragState.clip.sourceDurationUs,
            dragState.clip.trimOutUs + durationDelta
          );
          onClipChange?.({
            type: 'trim',
            trackId: dragState.trackId,
            clipId: dragState.clip.id,
            sourceId: dragState.clip.sourceId,
            edge: 'end',
            newStartUs: dragState.startUs,
            newDurationUs: proposedDuration,
            newTrimInUs: dragState.clip.trimInUs,
            newTrimOutUs: proposedTrimOut,
          });
        }
      } else if (dragState.mode === 'source-trim') {
        // Source trim handles adjust which portion of source is visible
        // Timeline position/duration stays the same
        if (dragState.edge === 'start') {
          const proposedTrimIn = Math.max(
            0,
            Math.min(dragState.trimInUs + deltaUs, dragState.trimOutUs - MIN_TRIM_DURATION_US)
          );
          const trimDelta = proposedTrimIn - dragState.trimInUs;
          onClipChange?.({
            type: 'trim',
            trackId: dragState.trackId,
            clipId: dragState.clip.id,
            sourceId: dragState.clip.sourceId,
            edge: 'start',
            newStartUs: dragState.startUs + trimDelta,
            newDurationUs: dragState.durationUs - trimDelta,
            newTrimInUs: proposedTrimIn,
            newTrimOutUs: dragState.trimOutUs,
          });
        } else {
          const proposedTrimOut = Math.max(
            dragState.trimInUs + MIN_TRIM_DURATION_US,
            Math.min(dragState.trimOutUs + deltaUs, dragState.clip.sourceDurationUs)
          );
          const trimDelta = proposedTrimOut - dragState.trimOutUs;
          onClipChange?.({
            type: 'trim',
            trackId: dragState.trackId,
            clipId: dragState.clip.id,
            sourceId: dragState.clip.sourceId,
            edge: 'end',
            newStartUs: dragState.startUs,
            newDurationUs: dragState.durationUs + trimDelta,
            newTrimInUs: dragState.trimInUs,
            newTrimOutUs: proposedTrimOut,
          });
        }
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
      trackRectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, onClipChange, visibleDurationUs]);

  const beginDrag = (e: ReactMouseEvent, state: DragState) => {
    e.preventDefault();
    e.stopPropagation();
    if (trackRef.current) {
      trackRectRef.current = trackRef.current.getBoundingClientRect();
    }
    setDragState(state);
  };

  return (
    <div className="absolute inset-0">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className={`absolute inset-x-0 ${index !== tracks.length - 1 ? 'border-b border-gray-800/60' : ''}`}
          style={{ top: index * laneHeight, height: laneHeight }}
        >
          <div className="absolute inset-0 bg-gray-900/40 pointer-events-none" />

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
            const isDraggingClip = dragState?.clip.id === clip.id;

            return (
              <div
                key={clip.id}
                className={`absolute rounded-md shadow-md overflow-hidden backdrop-blur-sm border ${styles.border} pointer-events-auto cursor-grab active:cursor-grabbing ${
                  isDraggingClip ? 'ring-2 ring-white/50' : ''
                }`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 1)}%`,
                  top: laneHeight * 0.15,
                  height: laneHeight * 0.7,
                }}
                title={`${clip.label} · ${formatTime(clip.durationUs / MICROSECONDS_PER_SECOND)}`}
                onMouseDown={(e) =>
                  beginDrag(e, {
                    mode: 'move',
                    clip,
                    trackId: track.id,
                    startUs: clip.startUs,
                    startX: e.clientX,
                  })
                }
              >
                <div
                  className="absolute inset-y-0 left-0 w-3 cursor-ew-resize bg-black/40 hover:bg-white/30"
                  onMouseDown={(e) =>
                    beginDrag(e, {
                      mode: 'resize',
                      edge: 'start',
                      clip,
                      trackId: track.id,
                      startUs: clip.startUs,
                      durationUs: clip.durationUs,
                      startX: e.clientX,
                    })
                  }
                  aria-label="Trim clip start"
                />

                <div
                  className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-black/40 hover:bg-white/30"
                  onMouseDown={(e) =>
                    beginDrag(e, {
                      mode: 'resize',
                      edge: 'end',
                      clip,
                      trackId: track.id,
                      startUs: clip.startUs,
                      durationUs: clip.durationUs,
                      startX: e.clientX,
                    })
                  }
                  aria-label="Trim clip end"
                />

                {/* Inner source trim handles */}
                {/* Trim In Handle - shows when there's source content before current in-point */}
                {clip.trimInUs > 0 && (
                  <div
                    className="absolute inset-y-1 w-1.5 cursor-ew-resize bg-yellow-400/70 hover:bg-yellow-300 rounded-sm z-10"
                    style={{ left: 12 }}
                    onMouseDown={(e) =>
                      beginDrag(e, {
                        mode: 'source-trim',
                        edge: 'start',
                        clip,
                        trackId: track.id,
                        trimInUs: clip.trimInUs,
                        trimOutUs: clip.trimOutUs,
                        startUs: clip.startUs,
                        durationUs: clip.durationUs,
                        startX: e.clientX,
                      })
                    }
                    aria-label="Trim source in-point"
                    title={`Source in: ${formatTime(clip.trimInUs / MICROSECONDS_PER_SECOND)}`}
                  />
                )}

                {/* Trim Out Handle - shows when there's source content after current out-point */}
                {clip.trimOutUs < clip.sourceDurationUs && (
                  <div
                    className="absolute inset-y-1 w-1.5 cursor-ew-resize bg-yellow-400/70 hover:bg-yellow-300 rounded-sm z-10"
                    style={{ right: 12 }}
                    onMouseDown={(e) =>
                      beginDrag(e, {
                        mode: 'source-trim',
                        edge: 'end',
                        clip,
                        trackId: track.id,
                        trimInUs: clip.trimInUs,
                        trimOutUs: clip.trimOutUs,
                        startUs: clip.startUs,
                        durationUs: clip.durationUs,
                        startX: e.clientX,
                      })
                    }
                    aria-label="Trim source out-point"
                    title={`Source out: ${formatTime(clip.trimOutUs / MICROSECONDS_PER_SECOND)}`}
                  />
                )}

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
