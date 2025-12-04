/**
 * EditorPreview Component
 * Preview panel with video canvas and overlay components.
 */

import { forwardRef, type RefObject } from 'react';
import { VideoPreview, type VideoPreviewHandle } from '../../VideoPreview';
import { SubtitleOverlay } from '../../SubtitleOverlay';
import { HtmlOverlay } from '../../HtmlOverlay';
import type { Track } from '../../../core/Track';
import type { OverlayPosition } from '../../../core/types';

export interface EditorPreviewProps {
  previewRef: RefObject<VideoPreviewHandle | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  previewWidth: number;
  previewHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  actualContainerSize: { width: number; height: number };
  currentTimeUs: number;
  tracks: readonly Track[];
  selectedClipId?: string;
  isPlaying: boolean;
  onOverlayPositionChange?: (clipId: string, position: OverlayPosition) => void;
}

export const EditorPreview = forwardRef<HTMLDivElement, EditorPreviewProps>(
  function EditorPreview(props, _ref) {
    const {
      previewRef,
      previewContainerRef,
      previewWidth,
      previewHeight,
      compositionWidth,
      compositionHeight,
      actualContainerSize,
      currentTimeUs,
      tracks,
      selectedClipId,
      isPlaying,
      onOverlayPositionChange,
    } = props;

    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: previewWidth,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {/* Canvas container */}
        <div
          ref={previewContainerRef}
          style={{
            position: 'relative',
            width: '100%',
            maxHeight: `calc(100% - 60px)`,
            aspectRatio: `${previewWidth} / ${previewHeight}`,
            backgroundColor: '#000',
            borderRadius: 4,
            overflow: 'hidden',
            flexShrink: 1,
          }}
        >
          <VideoPreview
            ref={previewRef}
            width={previewWidth}
            height={previewHeight}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          <SubtitleOverlay
            currentTimeUs={currentTimeUs}
            tracks={tracks}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            containerWidth={actualContainerSize.width}
            containerHeight={actualContainerSize.height}
          />
          <HtmlOverlay
            currentTimeUs={currentTimeUs}
            tracks={tracks}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            containerWidth={actualContainerSize.width}
            containerHeight={actualContainerSize.height}
            selectedClipId={selectedClipId}
            onPositionChange={onOverlayPositionChange}
            isInteractive={!isPlaying}
          />
        </div>
      </div>
    );
  }
);
