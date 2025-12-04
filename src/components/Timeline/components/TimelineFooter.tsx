/**
 * TimelineFooter Component
 * Footer row containing minimap label, minimap, and scrollbar.
 */

import { TIMELINE, TIMELINE_COLORS } from '../../../constants';
import { Minimap, Scrollbar } from './index';
import type { Track } from '../../../core/Track';
import type { TrackUIState } from '../../../core/types';

export interface TimelineFooterProps {
  tracks: readonly Track[];
  durationUs: number;
  currentTimeUs: number;
  viewport: {
    startTimeUs: number;
    endTimeUs: number;
    zoomLevel: number;
  };
  containerWidth: number;
  totalTimelineWidth: number;
  showScrollbar: boolean;
  scrollLeft: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  timeRulerScrollRef: React.RefObject<HTMLDivElement | null>;
  trackStates?: Record<string, TrackUIState>;
  getTrackHeight: (trackId: string) => number;
  onViewportScroll?: (scrollLeft: number, containerWidth: number, totalWidth: number) => void;
  onSeek?: (timeUs: number) => void;
}

export function TimelineFooter({
  tracks,
  durationUs,
  currentTimeUs,
  viewport,
  containerWidth,
  totalTimelineWidth,
  showScrollbar,
  scrollLeft,
  scrollContainerRef,
  timeRulerScrollRef,
  trackStates,
  getTrackHeight,
  onViewportScroll,
  onSeek,
}: TimelineFooterProps) {
  const handleViewportChange = onViewportScroll
    ? (startTimeUs: number) => {
        const effectiveDur = Math.max(durationUs, TIMELINE.MIN_VISIBLE_DURATION_US);
        const visibleDur = effectiveDur / viewport.zoomLevel;
        const maxStartTime = effectiveDur - visibleDur;
        if (maxStartTime > 0) {
          const scrollRatio = startTimeUs / maxStartTime;
          const newScrollLeft = scrollRatio * (totalTimelineWidth - containerWidth);
          onViewportScroll(newScrollLeft, containerWidth, totalTimelineWidth);
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = newScrollLeft;
          }
        }
      }
    : undefined;

  const handleScrollbarScroll = (newScrollLeft: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = newScrollLeft;
    }
    if (timeRulerScrollRef.current) {
      timeRulerScrollRef.current.scrollLeft = newScrollLeft;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0 }}>
      {/* Minimap label */}
      <div
        style={{
          width: TIMELINE.TRACK_HEADER_WIDTH,
          height: TIMELINE.MINIMAP_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: TIMELINE_COLORS.trackHeaderBg,
          borderTop: `1px solid ${TIMELINE_COLORS.border}`,
          borderRight: `1px solid ${TIMELINE_COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 9, color: TIMELINE_COLORS.textMuted }}>OVERVIEW</span>
      </div>

      {/* Minimap and scrollbar container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderTop: `1px solid ${TIMELINE_COLORS.border}`,
        }}
      >
        <Minimap
          tracks={tracks}
          durationUs={durationUs}
          currentTimeUs={currentTimeUs}
          viewport={viewport}
          containerWidth={containerWidth}
          onViewportChange={handleViewportChange}
          onSeek={onSeek}
          trackStates={trackStates}
          getTrackHeight={getTrackHeight}
        />

        {showScrollbar && (
          <Scrollbar
            containerWidth={containerWidth}
            totalWidth={totalTimelineWidth}
            scrollLeft={scrollLeft}
            onScroll={handleScrollbarScroll}
          />
        )}
      </div>
    </div>
  );
}
