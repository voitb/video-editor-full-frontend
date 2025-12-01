import { useCallback, useRef, useEffect } from 'react';
import type { ActiveClip, SourceAudioData } from '../types/editor';

// ============================================================================
// AUDIO MANAGER HOOK
// ============================================================================
// Manages multi-clip audio playback using the Web Audio API.
// Each clip's audio is scheduled to play at the correct timeline time.

interface AudioClipState {
  clipId: string;
  sourceId: string;
  audioBuffer: AudioBuffer;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode;
  startTimeUs: number;      // When clip starts on timeline
  sourceStartUs: number;    // Trim in-point in source
  sourceEndUs: number;      // Trim out-point in source
}

interface AudioManagerState {
  audioContext: AudioContext | null;
  audioBuffers: Map<string, AudioBuffer>;  // sourceId -> AudioBuffer
  clipStates: Map<string, AudioClipState>; // clipId -> AudioClipState
  isPlaying: boolean;
  playbackStartTimeUs: number;
  playbackStartContextTime: number;
}

export interface AudioManagerControls {
  initAudio: () => Promise<void>;
  loadAudioSource: (data: SourceAudioData) => Promise<void>;
  removeAudioSource: (sourceId: string) => void;
  setActiveClips: (clips: ActiveClip[]) => void;
  play: (currentTimeUs: number) => void;
  pause: () => void;
  seek: (timeUs: number) => void;
  getCurrentTimeUs: () => number;
  dispose: () => void;
}

export function useAudioManager(): AudioManagerControls {
  const stateRef = useRef<AudioManagerState>({
    audioContext: null,
    audioBuffers: new Map(),
    clipStates: new Map(),
    isPlaying: false,
    playbackStartTimeUs: 0,
    playbackStartContextTime: 0,
  });

  // Initialize AudioContext (must be called from user gesture)
  const initAudio = useCallback(async () => {
    if (stateRef.current.audioContext) return;

    const audioContext = new AudioContext();

    // Resume if suspended (needed for browsers that require user interaction)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    stateRef.current.audioContext = audioContext;
  }, []);

  // Load audio data from a source into an AudioBuffer
  const loadAudioSource = useCallback(async (data: SourceAudioData) => {
    const state = stateRef.current;
    if (!state.audioContext) {
      await initAudio();
    }

    const ctx = state.audioContext!;

    try {
      // Decode the audio data
      const audioBuffer = await ctx.decodeAudioData(data.audioData.slice(0));
      state.audioBuffers.set(data.sourceId, audioBuffer);
    } catch (error) {
      console.error(`Failed to decode audio for source ${data.sourceId}:`, error);
    }
  }, [initAudio]);

  // Remove audio source
  const removeAudioSource = useCallback((sourceId: string) => {
    const state = stateRef.current;
    state.audioBuffers.delete(sourceId);

    // Stop and remove any playing clips from this source
    for (const [clipId, clipState] of state.clipStates.entries()) {
      if (clipState.sourceId === sourceId) {
        clipState.sourceNode?.stop();
        clipState.sourceNode?.disconnect();
        clipState.gainNode.disconnect();
        state.clipStates.delete(clipId);
      }
    }
  }, []);

  // Set active clips for audio playback
  const setActiveClips = useCallback((clips: ActiveClip[]) => {
    const state = stateRef.current;
    if (!state.audioContext) return;

    const ctx = state.audioContext;

    // Get current clip IDs
    const newClipIds = new Set(clips.map(c => c.clipId));

    // Remove clips that are no longer active
    for (const [clipId, clipState] of state.clipStates.entries()) {
      if (!newClipIds.has(clipId)) {
        clipState.sourceNode?.stop();
        clipState.sourceNode?.disconnect();
        clipState.gainNode.disconnect();
        state.clipStates.delete(clipId);
      }
    }

    // Add or update clips
    for (const clip of clips) {
      const audioBuffer = state.audioBuffers.get(clip.sourceId);
      if (!audioBuffer) continue;

      let clipState = state.clipStates.get(clip.clipId);

      if (!clipState) {
        // Create new clip state
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);

        clipState = {
          clipId: clip.clipId,
          sourceId: clip.sourceId,
          audioBuffer,
          sourceNode: null,
          gainNode,
          startTimeUs: clip.startTimeUs,
          sourceStartUs: clip.sourceStartUs,
          sourceEndUs: clip.sourceEndUs,
        };
        state.clipStates.set(clip.clipId, clipState);
      } else {
        // Update existing clip timing
        clipState.startTimeUs = clip.startTimeUs;
        clipState.sourceStartUs = clip.sourceStartUs;
        clipState.sourceEndUs = clip.sourceEndUs;
      }
    }
  }, []);

  // Start playback from a given timeline time
  const play = useCallback((currentTimeUs: number) => {
    const state = stateRef.current;
    if (!state.audioContext || state.isPlaying) return;

    const ctx = state.audioContext;

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    state.playbackStartTimeUs = currentTimeUs;
    state.playbackStartContextTime = now;
    state.isPlaying = true;

    // Schedule all clips
    for (const clipState of state.clipStates.values()) {
      startClipAudio(clipState, currentTimeUs, now);
    }
  }, []);

  // Start audio for a specific clip
  const startClipAudio = (
    clipState: AudioClipState,
    currentTimelineUs: number,
    contextNow: number
  ) => {
    const state = stateRef.current;
    if (!state.audioContext) return;

    const ctx = state.audioContext;

    // Stop existing source if any
    if (clipState.sourceNode) {
      clipState.sourceNode.stop();
      clipState.sourceNode.disconnect();
    }

    // Calculate timing
    const clipDurationUs = clipState.sourceEndUs - clipState.sourceStartUs;
    const clipEndTimeUs = clipState.startTimeUs + clipDurationUs;

    // Check if clip is relevant for current playback position
    if (currentTimelineUs >= clipEndTimeUs) {
      // Clip has already ended
      return;
    }

    // Create new source node
    const source = ctx.createBufferSource();
    source.buffer = clipState.audioBuffer;
    source.connect(clipState.gainNode);

    // Calculate when to start and from where in the audio
    const sourceOffsetSec = clipState.sourceStartUs / 1_000_000;
    const clipDurationSec = clipDurationUs / 1_000_000;

    if (currentTimelineUs < clipState.startTimeUs) {
      // Clip hasn't started yet - schedule it for the future
      const delayUs = clipState.startTimeUs - currentTimelineUs;
      const delaySec = delayUs / 1_000_000;
      source.start(contextNow + delaySec, sourceOffsetSec, clipDurationSec);
    } else {
      // We're in the middle of the clip - start immediately with offset
      const playedUs = currentTimelineUs - clipState.startTimeUs;
      const playedSec = playedUs / 1_000_000;
      const remainingDurationSec = clipDurationSec - playedSec;

      if (remainingDurationSec > 0) {
        source.start(contextNow, sourceOffsetSec + playedSec, remainingDurationSec);
      }
    }

    clipState.sourceNode = source;

    // Handle source ending
    source.onended = () => {
      if (clipState.sourceNode === source) {
        clipState.sourceNode = null;
      }
    };
  };

  // Pause playback
  const pause = useCallback(() => {
    const state = stateRef.current;
    if (!state.isPlaying) return;

    state.isPlaying = false;

    // Stop all playing sources
    for (const clipState of state.clipStates.values()) {
      if (clipState.sourceNode) {
        clipState.sourceNode.stop();
        clipState.sourceNode.disconnect();
        clipState.sourceNode = null;
      }
    }
  }, []);

  // Seek to a new position
  const seek = useCallback((timeUs: number) => {
    const state = stateRef.current;
    const wasPlaying = state.isPlaying;

    // Stop all current playback
    pause();

    // Update timeline position
    state.playbackStartTimeUs = timeUs;

    // Restart if was playing
    if (wasPlaying && state.audioContext) {
      state.playbackStartContextTime = state.audioContext.currentTime;
      state.isPlaying = true;

      for (const clipState of state.clipStates.values()) {
        startClipAudio(clipState, timeUs, state.playbackStartContextTime);
      }
    }
  }, [pause]);

  // Get current playback time based on AudioContext clock
  const getCurrentTimeUs = useCallback(() => {
    const state = stateRef.current;
    if (!state.audioContext || !state.isPlaying) {
      return state.playbackStartTimeUs;
    }

    const elapsed = state.audioContext.currentTime - state.playbackStartContextTime;
    return state.playbackStartTimeUs + elapsed * 1_000_000;
  }, []);

  // Cleanup on unmount
  const dispose = useCallback(() => {
    const state = stateRef.current;

    pause();

    // Disconnect all gain nodes
    for (const clipState of state.clipStates.values()) {
      clipState.gainNode.disconnect();
    }
    state.clipStates.clear();
    state.audioBuffers.clear();

    // Close audio context
    if (state.audioContext) {
      void state.audioContext.close();
      state.audioContext = null;
    }
  }, [pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return {
    initAudio,
    loadAudioSource,
    removeAudioSource,
    setActiveClips,
    play,
    pause,
    seek,
    getCurrentTimeUs,
    dispose,
  };
}
