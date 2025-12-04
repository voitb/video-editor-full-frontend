/**
 * Video Editor V2 - Playback Controls Component
 * Transport controls with play/pause, skip, and volume.
 */

import { useCallback, useState } from 'react';
import { formatTimecode } from '../utils/time';

export interface PlaybackControlsProps {
  /** Whether playback is active */
  isPlaying: boolean;
  /** Current playhead position (microseconds) */
  currentTimeUs: number;
  /** Total duration (microseconds) */
  durationUs: number;
  /** Current volume (0-1) */
  volume: number;
  /** Callback when play/pause is toggled */
  onPlayPause: () => void;
  /** Callback when skipping backward */
  onSkipBack: (deltaUs: number) => void;
  /** Callback when skipping forward */
  onSkipForward: (deltaUs: number) => void;
  /** Callback when volume changes */
  onVolumeChange: (volume: number) => void;
}

/** Skip amount: 10 seconds in microseconds */
const SKIP_AMOUNT_US = 10_000_000;

/**
 * Playback transport controls for the video editor.
 */
export function PlaybackControls(props: PlaybackControlsProps) {
  const {
    isPlaying,
    currentTimeUs,
    durationUs,
    volume,
    onPlayPause,
    onSkipBack,
    onSkipForward,
    onVolumeChange,
  } = props;

  const [isMuted, setIsMuted] = useState(false);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(1);

  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      onVolumeChange(volumeBeforeMute);
      setIsMuted(false);
    } else {
      setVolumeBeforeMute(volume);
      onVolumeChange(0);
      setIsMuted(true);
    }
  }, [isMuted, volume, volumeBeforeMute, onVolumeChange]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    onVolumeChange(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
    }
  }, [onVolumeChange]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 16px',
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
      }}
    >
      {/* Skip Back */}
      <button
        onClick={() => onSkipBack(SKIP_AMOUNT_US)}
        style={buttonStyle}
        title="Skip back 10 seconds"
      >
        <SkipBackIcon />
      </button>

      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        style={{ ...buttonStyle, ...primaryButtonStyle }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Skip Forward */}
      <button
        onClick={() => onSkipForward(SKIP_AMOUNT_US)}
        style={buttonStyle}
        title="Skip forward 10 seconds"
      >
        <SkipForwardIcon />
      </button>

      {/* Timecode */}
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#fff',
          minWidth: 160,
          textAlign: 'center',
        }}
      >
        {formatTimecode(currentTimeUs)} / {formatTimecode(durationUs)}
      </span>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={handleMuteToggle}
          style={{ ...buttonStyle, padding: 6 }}
          title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeIcon />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          style={{
            width: 80,
            height: 4,
            cursor: 'pointer',
            accentColor: '#3b82f6',
          }}
          title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
        />
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  padding: 8,
  backgroundColor: '#333',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'background-color 0.15s',
};

const primaryButtonStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  backgroundColor: '#3b82f6',
};

// ============================================================================
// ICONS (inline SVGs for simplicity)
// ============================================================================

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

function VolumeMuteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}
