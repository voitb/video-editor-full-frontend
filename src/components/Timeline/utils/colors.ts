/**
 * Timeline Color Utilities
 * Color helpers for tracks and clips.
 */

import type { TrackType } from '../../../core/types';
import { TIMELINE_COLORS } from '../../../constants';

/**
 * Get background color for a track based on type.
 */
export function getTrackBgColor(type: TrackType, isDropTarget: boolean): string {
  if (isDropTarget) {
    switch (type) {
      case 'video':
        return TIMELINE_COLORS.trackVideoDropBg;
      case 'audio':
        return TIMELINE_COLORS.trackAudioDropBg;
      case 'subtitle':
        return TIMELINE_COLORS.trackSubtitleDropBg;
      case 'overlay':
        return TIMELINE_COLORS.trackOverlayDropBg;
    }
  }
  switch (type) {
    case 'video':
      return TIMELINE_COLORS.trackVideoBg;
    case 'audio':
      return TIMELINE_COLORS.trackAudioBg;
    case 'subtitle':
      return TIMELINE_COLORS.trackSubtitleBg;
    case 'overlay':
      return TIMELINE_COLORS.trackOverlayBg;
  }
}

/**
 * Get clip color based on track type, selection, and hover state.
 */
export function getClipColor(
  type: TrackType,
  isSelected: boolean,
  isHovered: boolean
): string {
  if (type === 'subtitle') {
    if (isSelected) return TIMELINE_COLORS.clipSubtitleSelected;
    if (isHovered) return TIMELINE_COLORS.clipSubtitleHover;
    return TIMELINE_COLORS.clipSubtitle;
  }
  if (type === 'overlay') {
    if (isSelected) return TIMELINE_COLORS.clipOverlaySelected;
    if (isHovered) return TIMELINE_COLORS.clipOverlayHover;
    return TIMELINE_COLORS.clipOverlay;
  }
  if (type === 'audio') {
    if (isSelected) return TIMELINE_COLORS.clipAudioSelected;
    if (isHovered) return TIMELINE_COLORS.clipAudioHover;
    return TIMELINE_COLORS.clipAudio;
  }
  // video
  if (isSelected) return TIMELINE_COLORS.clipVideoSelected;
  if (isHovered) return TIMELINE_COLORS.clipVideoHover;
  return TIMELINE_COLORS.clipVideo;
}
