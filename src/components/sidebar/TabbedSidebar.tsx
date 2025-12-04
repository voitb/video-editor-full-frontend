/**
 * Video Editor V2 - Tabbed Sidebar Component
 * Container with tabs for Media, Subtitles, and Overlays panels.
 */

import type { TabbedSidebarProps } from './types';
import { SIDEBAR_WIDTH } from './types';
import { TIMELINE_COLORS } from '../../constants';
import { TabBar, MediaTab, SubtitlesTab, OverlaysTab } from './components';

export function TabbedSidebar(props: TabbedSidebarProps) {
  const { activeTab, onTabChange } = props;

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        backgroundColor: TIMELINE_COLORS.trackHeaderBg,
        borderLeft: `1px solid ${TIMELINE_COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'media' && (
          <MediaTab
            sources={props.sources}
            onLoadHls={props.onLoadHls}
            onLoadFile={props.onLoadFile}
            isLoading={props.isLoading}
            loadingProgress={props.loadingProgress}
          />
        )}
        {activeTab === 'subtitles' && (
          <SubtitlesTab
            tracks={props.tracks}
            selectedClipId={props.selectedClipId}
            currentTimeUs={props.currentTimeUs}
            onSeek={props.onSeek}
            onSubtitleClipUpdate={props.onSubtitleClipUpdate}
            onAddSubtitleClip={props.onAddSubtitleClip}
            onRefresh={props.onRefresh}
            onTrackAdd={props.onTrackAdd ? () => props.onTrackAdd?.('subtitle') : undefined}
          />
        )}
        {activeTab === 'overlays' && (
          <OverlaysTab
            tracks={props.tracks}
            selectedClipId={props.selectedClipId}
            currentTimeUs={props.currentTimeUs}
            onOverlayClipUpdate={props.onOverlayClipUpdate}
            onAddOverlayClip={props.onAddOverlayClip}
            onRefresh={props.onRefresh}
            onTrackAdd={props.onTrackAdd ? () => props.onTrackAdd?.('overlay') : undefined}
          />
        )}
      </div>
    </div>
  );
}
