import { describe, it, expect } from 'vitest';
import { mixAudioTracks, type AudioMixerConfig } from '../../../workers/export/AudioMixer';
import type { TrackJSON, ClipJSON } from '../../../core/types';
import type { ExportSourceState } from '../../../workers/export/types';

// Helper to create a source with decoded audio
function createSource(
  sourceId: string,
  audioData: Float32Array[],
  sampleRate = 48000,
  channels = 2
): ExportSourceState {
  return {
    sourceId,
    mp4File: {} as ExportSourceState['mp4File'],
    videoDecoder: null,
    audioDecoder: null,
    videoTrack: null,
    audioTrack: null,
    videoSamples: [],
    audioSamples: [],
    keyframeIndices: [],
    durationUs: 10_000_000, // 10 seconds
    width: 1920,
    height: 1080,
    isReady: true,
    decodedAudio: audioData,
    audioSampleRate: sampleRate,
    audioChannels: channels,
  };
}

// Helper to create an audio track with clips
function createAudioTrack(clips: ClipJSON[]): TrackJSON {
  return {
    id: 'track-1',
    type: 'audio',
    label: 'Audio',
    clips,
    subtitleClips: [],
    overlayClips: [],
  };
}

// Helper to create an audio clip
function createAudioClip(
  sourceId: string,
  startUs: number,
  trimIn: number,
  trimOut: number,
  volume = 1.0
): ClipJSON {
  return {
    id: `clip-${sourceId}-${startUs}`,
    sourceId,
    startUs,
    trimIn,
    trimOut,
    opacity: 1,
    volume,
    label: `Clip ${sourceId}`,
  };
}

describe('AudioMixer', () => {
  describe('mixAudioTracks', () => {
    it('returns empty buffer for empty tracks', () => {
      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 1_000_000, // 1 second
      };

      const result = mixAudioTracks([], new Map(), config);

      // 1 second at 48kHz stereo = 48000 * 2 = 96000 samples
      expect(result.totalSamples).toBe(48000);
      expect(result.buffer.length).toBe(96000);
      // Buffer should be all zeros
      expect(result.buffer.every((v) => v === 0)).toBe(true);
    });

    it('returns empty buffer for video-only tracks', () => {
      const tracks: TrackJSON[] = [
        {
          id: 'video-track',
          type: 'video',
          label: 'Video',
          clips: [],
          subtitleClips: [],
          overlayClips: [],
        },
      ];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 1_000_000,
      };

      const result = mixAudioTracks(tracks, new Map(), config);
      expect(result.buffer.every((v) => v === 0)).toBe(true);
    });

    it('mixes single audio clip correctly', () => {
      // Create source with constant audio (0.5 for left, 0.25 for right)
      const numSourceSamples = 48000; // 1 second worth at 48kHz
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      for (let i = 0; i < numSourceSamples; i++) {
        sourceAudio[i * 2] = 0.5; // left
        sourceAudio[i * 2 + 1] = 0.25; // right
      }

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));

      const clip = createAudioClip('source-1', 0, 0, 500_000); // 0.5 second clip
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 1_000_000, // 1 second export
      };

      const result = mixAudioTracks(tracks, sources, config);

      // First 0.5 seconds should have audio
      const samplesWithAudio = 24000; // 0.5 seconds at 48kHz
      for (let i = 0; i < samplesWithAudio; i++) {
        expect(result.buffer[i * 2]).toBeCloseTo(0.5, 5);
        expect(result.buffer[i * 2 + 1]).toBeCloseTo(0.25, 5);
      }

      // Second 0.5 seconds should be silent
      for (let i = samplesWithAudio; i < result.totalSamples; i++) {
        expect(result.buffer[i * 2]).toBe(0);
        expect(result.buffer[i * 2 + 1]).toBe(0);
      }
    });

    it('applies volume correctly', () => {
      // Create source with constant 1.0 audio
      const numSourceSamples = 48000;
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      sourceAudio.fill(1.0);

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));

      const clip = createAudioClip('source-1', 0, 0, 500_000, 0.5); // volume = 0.5
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 500_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // All samples should be 0.5 (1.0 * 0.5 volume)
      for (let i = 0; i < result.buffer.length; i++) {
        expect(result.buffer[i]).toBeCloseTo(0.5, 5);
      }
    });

    it('mixes multiple overlapping clips by summing', () => {
      // Create two sources with different constant values
      const numSourceSamples = 48000;

      const sourceAudio1 = new Float32Array(numSourceSamples * 2);
      sourceAudio1.fill(0.3);

      const sourceAudio2 = new Float32Array(numSourceSamples * 2);
      sourceAudio2.fill(0.4);

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio1]));
      sources.set('source-2', createSource('source-2', [sourceAudio2]));

      // Two clips that overlap for the full duration
      const clip1 = createAudioClip('source-1', 0, 0, 500_000);
      const clip2 = createAudioClip('source-2', 0, 0, 500_000);

      // Use two separate tracks
      const tracks: TrackJSON[] = [
        createAudioTrack([clip1]),
        {
          id: 'track-2',
          type: 'audio',
          label: 'Audio 2',
          clips: [clip2],
          subtitleClips: [],
          overlayClips: [],
        },
      ];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 500_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // Mixed value should be 0.3 + 0.4 = 0.7
      for (let i = 0; i < result.buffer.length; i++) {
        expect(result.buffer[i]).toBeCloseTo(0.7, 5);
      }
    });

    it('clamps output to [-1, 1] range', () => {
      // Create source with high amplitude that will clip when mixed
      const numSourceSamples = 48000;
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      sourceAudio.fill(0.8);

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));
      sources.set('source-2', createSource('source-2', [sourceAudio]));

      // Two loud clips that together exceed 1.0
      const clip1 = createAudioClip('source-1', 0, 0, 500_000);
      const clip2 = createAudioClip('source-2', 0, 0, 500_000);

      const tracks: TrackJSON[] = [
        createAudioTrack([clip1]),
        {
          id: 'track-2',
          type: 'audio',
          label: 'Audio 2',
          clips: [clip2],
          subtitleClips: [],
          overlayClips: [],
        },
      ];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 500_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // All values should be clamped to 1.0 (0.8 + 0.8 = 1.6 -> clamped to 1.0)
      for (let i = 0; i < result.buffer.length; i++) {
        expect(result.buffer[i]).toBe(1.0);
      }
    });

    it('respects inPointUs and outPointUs', () => {
      const numSourceSamples = 48000 * 2; // 2 seconds
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      for (let i = 0; i < numSourceSamples; i++) {
        sourceAudio[i * 2] = 0.5;
        sourceAudio[i * 2 + 1] = 0.5;
      }

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));

      // Clip starts at 0, plays for 2 seconds
      const clip = createAudioClip('source-1', 0, 0, 2_000_000);
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      // Export only the middle 0.5 seconds (500ms to 1000ms)
      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 500_000,
        outPointUs: 1_000_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // Should be 0.5 seconds of audio = 24000 samples
      expect(result.totalSamples).toBe(24000);
      // All samples should have audio
      for (let i = 0; i < result.buffer.length; i++) {
        expect(result.buffer[i]).toBeCloseTo(0.5, 5);
      }
    });

    it('handles clip offset correctly (startUs)', () => {
      const numSourceSamples = 48000;
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      sourceAudio.fill(0.5);

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));

      // Clip starts at 250ms on timeline
      const clip = createAudioClip('source-1', 250_000, 0, 500_000);
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 1_000_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // First 250ms should be silent (12000 samples)
      const silentSamples = 12000;
      for (let i = 0; i < silentSamples; i++) {
        expect(result.buffer[i * 2]).toBe(0);
        expect(result.buffer[i * 2 + 1]).toBe(0);
      }

      // Next 500ms should have audio (24000 samples)
      const audioSamples = 24000;
      for (let i = silentSamples; i < silentSamples + audioSamples; i++) {
        expect(result.buffer[i * 2]).toBeCloseTo(0.5, 5);
        expect(result.buffer[i * 2 + 1]).toBeCloseTo(0.5, 5);
      }

      // Remaining should be silent
      for (let i = silentSamples + audioSamples; i < result.totalSamples; i++) {
        expect(result.buffer[i * 2]).toBe(0);
        expect(result.buffer[i * 2 + 1]).toBe(0);
      }
    });

    it('handles trimIn correctly', () => {
      const numSourceSamples = 48000 * 2; // 2 seconds
      const sourceAudio = new Float32Array(numSourceSamples * 2);
      // First second: 0.2, second second: 0.8
      for (let i = 0; i < 48000; i++) {
        sourceAudio[i * 2] = 0.2;
        sourceAudio[i * 2 + 1] = 0.2;
      }
      for (let i = 48000; i < numSourceSamples; i++) {
        sourceAudio[i * 2] = 0.8;
        sourceAudio[i * 2 + 1] = 0.8;
      }

      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', [sourceAudio]));

      // Clip with trimIn = 1 second (skip first second of source)
      const clip = createAudioClip('source-1', 0, 1_000_000, 2_000_000);
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 1_000_000,
      };

      const result = mixAudioTracks(tracks, sources, config);

      // Should get the second part of source audio (0.8)
      for (let i = 0; i < result.buffer.length; i++) {
        expect(result.buffer[i]).toBeCloseTo(0.8, 5);
      }
    });

    it('handles missing source gracefully', () => {
      const clip = createAudioClip('missing-source', 0, 0, 500_000);
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 500_000,
      };

      // Should not throw, just return silent buffer
      const result = mixAudioTracks(tracks, new Map(), config);
      expect(result.buffer.every((v) => v === 0)).toBe(true);
    });

    it('handles source with empty decoded audio', () => {
      const sources = new Map<string, ExportSourceState>();
      sources.set('source-1', createSource('source-1', []));

      const clip = createAudioClip('source-1', 0, 0, 500_000);
      const tracks: TrackJSON[] = [createAudioTrack([clip])];

      const config: AudioMixerConfig = {
        sampleRate: 48000,
        channels: 2,
        inPointUs: 0,
        outPointUs: 500_000,
      };

      // Should not throw, just return silent buffer
      const result = mixAudioTracks(tracks, sources, config);
      expect(result.buffer.every((v) => v === 0)).toBe(true);
    });
  });
});
