/**
 * Sync Manager
 * Handles audio-video synchronization and drift detection.
 */

import type { Composition } from '../../core/Composition';
import type { AudioController } from '../AudioController';
import { TIME, PLAYBACK } from '../../constants';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SyncManager');

export interface SyncManagerDeps {
  composition: Composition;
  audio: AudioController;
  getCurrentTimeUs: () => number;
  getIsPlaying: () => boolean;
  isSeekInProgress: () => boolean;
  updateActiveClips: () => void;
  pause: () => void;
  seek: (timeUs: number) => void;
}

/**
 * Manages audio-video synchronization.
 */
export class SyncManager {
  private deps: SyncManagerDeps;
  private syncIntervalId: number | null = null;

  constructor(deps: SyncManagerDeps) {
    this.deps = deps;
  }

  /**
   * Start the sync interval for checking drift.
   */
  start(): void {
    if (this.syncIntervalId !== null) return;

    this.syncIntervalId = window.setInterval(() => {
      this.check();
    }, PLAYBACK.SYNC_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the sync interval.
   */
  stop(): void {
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Perform a sync check.
   * Detects end of composition and audio-video drift.
   */
  private check(): void {
    const { composition, audio, getCurrentTimeUs, getIsPlaying, isSeekInProgress, updateActiveClips, pause, seek } = this.deps;

    const currentTimeUs = getCurrentTimeUs();

    // Check for end of composition
    if (currentTimeUs >= composition.durationUs) {
      pause();
      seek(composition.durationUs);
      return;
    }

    if (isSeekInProgress()) return;

    updateActiveClips();

    // Check for audio-video drift
    const minStablePlaybackMs = 200;
    const { atTimeUs, atAudioContextTime } = audio.scheduledTiming;
    const playbackElapsedMs = audio.currentTime
      ? (audio.currentTime - atAudioContextTime) * 1000
      : 0;

    if (
      getIsPlaying() &&
      audio.playingNodeCount > 0 &&
      atAudioContextTime > 0 &&
      playbackElapsedMs > minStablePlaybackMs
    ) {
      const expectedVideoTimeUs = currentTimeUs;
      const audioElapsed = audio.currentTime - atAudioContextTime;
      const expectedAudioTimeUs = atTimeUs + audioElapsed * TIME.US_PER_SECOND;
      const driftUs = Math.abs(expectedVideoTimeUs - expectedAudioTimeUs);

      if (driftUs > PLAYBACK.AUDIO_DRIFT_THRESHOLD_US) {
        logger.warn('Audio drift detected, rescheduling', {
          driftUs,
          expectedVideoTimeUs,
          expectedAudioTimeUs,
          playbackElapsedMs,
        });
        audio.stopAll();
        const clips = composition.getActiveClipsAt(currentTimeUs);
        audio.scheduleAll(clips, currentTimeUs);
      }
    }
  }
}
