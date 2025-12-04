/**
 * Source Loader
 * Loads and decodes sources for export.
 */

import * as MP4Box from 'mp4box';
import type { MP4Info, MP4Sample } from 'mp4box';
import type { ExportSourceData } from '../messages/exportMessages';
import type { ExportSourceState, MP4ArrayBuffer } from './types';
import { getVideoCodecDescription, getAudioCodecDescription } from './FrameDecoder';
import { EXPORT, TIME } from '../../constants';

/**
 * Load multiple sources in parallel.
 */
export async function loadSources(
  sourcesData: ExportSourceData[],
  sources: Map<string, ExportSourceState>
): Promise<void> {
  const loadPromises = sourcesData.map((source) => loadSource(source, sources));
  await Promise.all(loadPromises);
}

/**
 * Load a single source, initialize decoders, and extract samples.
 */
export function loadSource(
  sourceData: ExportSourceData,
  sources: Map<string, ExportSourceState>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const mp4File = MP4Box.createFile();
    const sourceState: ExportSourceState = {
      sourceId: sourceData.sourceId,
      mp4File,
      videoDecoder: null,
      audioDecoder: null,
      videoTrack: null,
      audioTrack: null,
      videoSamples: [],
      audioSamples: [],
      keyframeIndices: [],
      durationUs: sourceData.durationUs,
      width: sourceData.width,
      height: sourceData.height,
      isReady: false,
      decodedAudio: [],
      audioSampleRate: EXPORT.DEFAULT_AUDIO_SAMPLE_RATE,
      audioChannels: EXPORT.AUDIO_CHANNELS,
    };

    sources.set(sourceData.sourceId, sourceState);

    // Track if audio config was validated
    let audioConfigPromise: Promise<void> | null = null;

    mp4File.onReady = (info: MP4Info) => {
      // Video track
      const videoTrack = info.videoTracks[0];
      if (videoTrack) {
        sourceState.videoTrack = videoTrack;
        sourceState.width = videoTrack.video.width;
        sourceState.height = videoTrack.video.height;

        // Initialize video decoder
        const codecDescription = getVideoCodecDescription(mp4File, videoTrack.id);
        sourceState.videoDecoder = new VideoDecoder({
          output: () => {}, // We'll decode on-demand
          error: (err) => console.error('Video decoder error:', err),
        });

        sourceState.videoDecoder.configure({
          codec: videoTrack.codec,
          codedWidth: videoTrack.video.width,
          codedHeight: videoTrack.video.height,
          description: codecDescription,
        });

        mp4File.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 10000 });
      }

      // Audio track - with async config validation
      const audioTrack = info.audioTracks[0];
      if (audioTrack) {
        sourceState.audioTrack = audioTrack;
        sourceState.audioSampleRate = audioTrack.audio.sample_rate;
        sourceState.audioChannels = audioTrack.audio.channel_count;

        const audioCodecDescription = getAudioCodecDescription(mp4File, audioTrack.id);

        const audioConfig: AudioDecoderConfig = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio.sample_rate,
          numberOfChannels: audioTrack.audio.channel_count,
          description: audioCodecDescription ?? undefined,
        };

        // Validate config before configuring
        audioConfigPromise = AudioDecoder.isConfigSupported(audioConfig).then((supported) => {
          if (!supported.supported) {
            throw new Error(
              `Unsupported audio codec: ${audioTrack.codec}. Please re-encode your source file with a supported audio format (AAC recommended).`
            );
          }

          sourceState.audioDecoder = new AudioDecoder({
            output: (audioData) => {
              const pcm = processAudioData(audioData);
              sourceState.decodedAudio.push(pcm);
              audioData.close();
            },
            error: (err) => console.error('Audio decoder error:', err),
          });

          sourceState.audioDecoder.configure(audioConfig);
          mp4File.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 10000 });
        });
      }

      mp4File.start();
    };

    mp4File.onSamples = (trackId: number, _ref: unknown, samples: MP4Sample[]) => {
      const isAudioTrack = sourceState.audioTrack && trackId === sourceState.audioTrack.id;

      for (const sample of samples) {
        if (isAudioTrack) {
          sourceState.audioSamples.push(sample);
          // Decode audio immediately
          if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: Math.round((sample.cts / sample.timescale) * TIME.US_PER_SECOND),
              duration: Math.round((sample.duration / sample.timescale) * TIME.US_PER_SECOND),
              data: sample.data,
            });
            sourceState.audioDecoder.decode(chunk);
          }
        } else {
          sourceState.videoSamples.push(sample);
          if (sample.is_sync) {
            sourceState.keyframeIndices.push(sourceState.videoSamples.length - 1);
          }
        }
      }
    };

    mp4File.onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`MP4Box error: ${message}`));
    };

    // Append buffer
    const ab = sourceData.buffer.slice(0) as MP4ArrayBuffer;
    ab.fileStart = 0;
    mp4File.appendBuffer(ab);
    mp4File.flush();

    // Wait for samples to be extracted and audio config to be validated
    setTimeout(async () => {
      try {
        // Wait for audio config validation if needed
        if (audioConfigPromise) {
          await audioConfigPromise;
        }
        // Flush audio decoder
        if (sourceState.audioDecoder && sourceState.audioDecoder.state === 'configured') {
          await sourceState.audioDecoder.flush();
        }
        sourceState.isReady = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 100);
  });
}

/**
 * Process AudioData into interleaved Float32Array.
 */
function processAudioData(audioData: AudioData): Float32Array {
  const numFrames = audioData.numberOfFrames;
  const numChannels = audioData.numberOfChannels;

  // Create interleaved buffer for all channels
  const pcm = new Float32Array(numFrames * numChannels);

  // Copy each channel and interleave
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = new Float32Array(numFrames);
    audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });

    // Interleave: place channel samples at correct positions
    for (let i = 0; i < numFrames; i++) {
      pcm[i * numChannels + ch] = channelData[i]!;
    }
  }

  return pcm;
}

/**
 * Close all decoders and clear sources.
 */
export function cleanupSources(sources: Map<string, ExportSourceState>): void {
  for (const source of sources.values()) {
    if (source.videoDecoder && source.videoDecoder.state !== 'closed') {
      source.videoDecoder.close();
    }
    if (source.audioDecoder && source.audioDecoder.state !== 'closed') {
      source.audioDecoder.close();
    }
  }
  sources.clear();
}
