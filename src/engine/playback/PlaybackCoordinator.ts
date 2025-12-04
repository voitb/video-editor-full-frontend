/**
 * Playback Coordinator
 * Handles play, pause, and seek operations.
 */

import type { Composition } from '../../core/Composition';
import type { ActiveClip } from '../../core/types';
import type { AudioController } from '../AudioController';
import type { WorkerBridge } from '../worker/WorkerBridge';
import type { RenderWorkerCommand } from '../../workers/messages/renderMessages';
import { TIME } from '../../constants';

export interface PlaybackCoordinatorDeps {
  composition: Composition;
  audio: AudioController;
  workerBridge: WorkerBridge;
  getCurrentTimeUs: () => number;
  setCurrentTimeUs: (timeUs: number) => void;
  getIsPlaying: () => boolean;
  onTimeUpdate: (timeUs: number) => void;
  onSeekStart: () => void;
  onSeekComplete: () => void;
  startSyncInterval: () => void;
  stopSyncInterval: () => void;
  updateActiveClips: () => void;
}

/**
 * Coordinates playback operations between audio and video.
 */
export class PlaybackCoordinator {
  private deps: PlaybackCoordinatorDeps;

  // Seek acknowledgment state
  private pendingSeekTimeUs: number | null = null;
  private isSeekingWhilePlaying = false;
  private seekInProgress = false;

  constructor(deps: PlaybackCoordinatorDeps) {
    this.deps = deps;
  }

  /**
   * Start playback.
   */
  play(): void {
    const { audio, workerBridge, composition, updateActiveClips, startSyncInterval, getCurrentTimeUs } = this.deps;

    if (!workerBridge.isInitialized) return;

    audio.ensureContext();
    audio.resume();
    updateActiveClips();

    const cmd: RenderWorkerCommand = { type: 'PLAY' };
    workerBridge.postCommand(cmd);

    const clips = composition.getActiveClipsAt(getCurrentTimeUs());
    audio.scheduleAll(clips, getCurrentTimeUs());
    startSyncInterval();
  }

  /**
   * Pause playback.
   */
  pause(): void {
    const { audio, workerBridge, stopSyncInterval } = this.deps;

    if (!workerBridge.isInitialized) return;

    const cmd: RenderWorkerCommand = { type: 'PAUSE' };
    workerBridge.postCommand(cmd);

    stopSyncInterval();
    audio.stopAll();
  }

  /**
   * Seek to a specific time.
   */
  seek(timeUs: number): void {
    const { audio, workerBridge, composition, setCurrentTimeUs, getIsPlaying, updateActiveClips, onTimeUpdate, onSeekStart } = this.deps;

    if (!workerBridge.isInitialized) return;

    this.seekInProgress = true;
    onSeekStart();

    const clampedTime = Math.max(0, Math.min(timeUs, composition.durationUs));
    setCurrentTimeUs(clampedTime);

    audio.stopAll();
    updateActiveClips();

    this.isSeekingWhilePlaying = getIsPlaying();
    this.pendingSeekTimeUs = clampedTime;

    const cmd: RenderWorkerCommand = {
      type: 'SEEK',
      timeUs: clampedTime,
    };
    workerBridge.postCommand(cmd);

    onTimeUpdate(clampedTime);
  }

  /**
   * Seek to a specific time in seconds.
   */
  seekSeconds(seconds: number): void {
    this.seek(Math.round(seconds * TIME.US_PER_SECOND));
  }

  /**
   * Toggle between play and pause.
   */
  togglePlayPause(): void {
    if (this.deps.getIsPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Handle seek completion from worker.
   */
  handleSeekComplete(timeUs: number): void {
    const { audio, composition, getCurrentTimeUs, getIsPlaying, onSeekComplete } = this.deps;

    this.seekInProgress = false;
    onSeekComplete();

    if (
      this.isSeekingWhilePlaying &&
      this.pendingSeekTimeUs === timeUs &&
      getIsPlaying()
    ) {
      const clips = composition.getActiveClipsAt(getCurrentTimeUs());
      audio.scheduleAll(clips, getCurrentTimeUs());
    }

    this.pendingSeekTimeUs = null;
    this.isSeekingWhilePlaying = false;
  }

  /**
   * Check if a seek is in progress.
   */
  get isSeekInProgress(): boolean {
    return this.seekInProgress;
  }
}
