/**
 * Audio Processor
 * Handles audio chunk batching, sending, and flushing.
 */

import type { AudioDataEvent } from '../messages/renderMessages';
import type { SourceState, WorkerContext } from './types';
import { combineAudioChunks } from './AudioDecoderWrapper';

/**
 * Send batched audio chunks to the main thread
 */
export function sendAudioChunks(ctx: WorkerContext, sourceState: SourceState): void {
  if (!sourceState.audioDecoder) return;

  const chunks = sourceState.audioDecoder.takeChunks();
  if (chunks.length === 0) return;

  const combined = combineAudioChunks(chunks);
  if (!combined) return;

  const audioBuffer = combined.data.buffer as ArrayBuffer;
  const event: AudioDataEvent = {
    type: 'AUDIO_DATA',
    sourceId: sourceState.sourceId,
    audioData: audioBuffer,
    sampleRate: sourceState.audioDecoder.getSampleRate(),
    channels: sourceState.audioDecoder.getChannels(),
    timestampUs: combined.timestampUs,
    durationUs: combined.durationUs,
  };

  ctx.postResponse(event, [audioBuffer]);
}

/**
 * Flush remaining audio chunks and mark as complete
 */
export function flushAudioDecoder(ctx: WorkerContext, sourceState: SourceState): void {
  if (!sourceState.audioDecoder || sourceState.audioDecoder.state !== 'configured') {
    sourceState.audioDecodingComplete = true;
    return;
  }

  sourceState.audioDecoder.flush().then((chunks) => {
    if (chunks.length > 0) {
      const combined = combineAudioChunks(chunks);
      if (combined) {
        const audioBuffer = combined.data.buffer as ArrayBuffer;
        const event: AudioDataEvent = {
          type: 'AUDIO_DATA',
          sourceId: sourceState.sourceId,
          audioData: audioBuffer,
          sampleRate: sourceState.audioDecoder!.getSampleRate(),
          channels: sourceState.audioDecoder!.getChannels(),
          timestampUs: combined.timestampUs,
          durationUs: combined.durationUs,
        };
        ctx.postResponse(event, [audioBuffer]);
      }
    }

    sourceState.audioDecodingComplete = true;

    // Send completion marker
    ctx.postResponse({
      type: 'AUDIO_DATA',
      sourceId: sourceState.sourceId,
      audioData: new ArrayBuffer(0),
      sampleRate: sourceState.audioDecoder!.getSampleRate(),
      channels: sourceState.audioDecoder!.getChannels(),
      timestampUs: 0,
      durationUs: 0,
      isComplete: true,
    } as AudioDataEvent & { isComplete: boolean });
  });
}
