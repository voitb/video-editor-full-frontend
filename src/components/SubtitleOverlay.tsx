/**
 * Video Editor V2 - Subtitle Overlay Component
 * Renders subtitles as HTML overlay for preview.
 * Uses HTML for crisp text rendering (vs WebGL texture for export).
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { Track } from '../core/Track';
import { isSubtitleClip } from '../core/Track';
import type { SubtitleCue, SubtitleStyle } from '../core/types';

interface SubtitleOverlayProps {
  /** Current playback time (microseconds) */
  currentTimeUs: number;
  /** All tracks (will filter for subtitle tracks) */
  tracks: readonly Track[];
  /** Composition width (for scaling) */
  compositionWidth: number;
  /** Composition height (for scaling) */
  compositionHeight: number;
  /** Container width (actual display size) */
  containerWidth: number;
  /** Container height (actual display size) */
  containerHeight: number;
}

interface ActiveCue {
  cue: SubtitleCue;
  style: SubtitleStyle;
}

export function SubtitleOverlay({
  currentTimeUs,
  tracks,
  compositionWidth,
  compositionHeight: _compositionHeight,
  containerWidth,
  containerHeight,
}: SubtitleOverlayProps) {
  // Get all active cues at current time
  const activeCues = useMemo(() => {
    const cues: ActiveCue[] = [];

    for (const track of tracks) {
      if (track.type !== 'subtitle') continue;

      for (const clip of track.clips) {
        if (!isSubtitleClip(clip)) continue;
        if (!clip.isActiveAt(currentTimeUs)) continue;

        const clipCues = clip.getActiveCuesAt(currentTimeUs);
        for (const cue of clipCues) {
          cues.push({ cue, style: clip.style });
        }
      }
    }

    return cues;
  }, [currentTimeUs, tracks]);

  // Don't render if no active cues
  if (activeCues.length === 0) return null;

  // Calculate scale factor for font size
  const scale = containerWidth / compositionWidth;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: containerWidth,
        height: containerHeight,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {activeCues.map(({ cue, style }, index) => (
        <SubtitleText
          key={`${cue.id}-${index}`}
          text={cue.text}
          style={style}
          scale={scale}
          containerHeight={containerHeight}
        />
      ))}
    </div>
  );
}

interface SubtitleTextProps {
  text: string;
  style: SubtitleStyle;
  scale: number;
  containerHeight: number;
}

function SubtitleText({ text, style, scale, containerHeight }: SubtitleTextProps) {
  const scaledFontSize = style.fontSize * scale;

  // Position at bottom (85% down)
  const bottom = containerHeight * 0.05;

  const textStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom,
    maxWidth: '90%',
    textAlign: 'center',
    fontFamily: style.fontFamily,
    fontSize: scaledFontSize,
    color: style.color,
    lineHeight: 1.3,
    whiteSpace: 'pre-wrap',
    // Text outline using text-shadow
    textShadow: `
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      1px 1px 0 #000,
      -2px 0 0 #000,
      2px 0 0 #000,
      0 -2px 0 #000,
      0 2px 0 #000
    `,
  };

  // Add background if enabled
  if (style.showBackground) {
    return (
      <span
        style={{
          ...textStyle,
          backgroundColor: style.backgroundColor,
          padding: `${scaledFontSize * 0.15}px ${scaledFontSize * 0.4}px`,
          borderRadius: scaledFontSize * 0.1,
        }}
      >
        {text}
      </span>
    );
  }

  return <span style={textStyle}>{text}</span>;
}
