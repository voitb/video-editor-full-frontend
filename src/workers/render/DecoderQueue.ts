/**
 * Decoder Queue
 * Handles feeding samples to video decoders.
 */

import type { WorkerContext } from './types';
import { PLAYBACK } from '../../constants';
import { findSampleAtTime, findKeyframeBefore } from './FrameSelector';
import { isClipActiveAt } from './FrameRenderer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DecoderQueue');

interface FeedOptions {
  reason?: string;
}

/**
 * Feed samples to decoders for all active video clips
 */
export function feedDecoders(
  ctx: WorkerContext,
  timelineTimeUs: number,
  opts?: FeedOptions
): void {
  const reason = opts?.reason ?? 'loop';

  for (const clip of ctx.activeClips) {
    if (clip.trackType !== 'video') continue;
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    const sourceState = ctx.sources.get(clip.sourceId);
    if (!sourceState) continue;

    const samples = sourceState.demuxer.getVideoSamples();
    const keyframeIndices = sourceState.demuxer.getKeyframeIndices();

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const targetSample = findSampleAtTime(samples, sourceTimeUs);
    if (targetSample < 0) continue;

    const keyframeIdx = findKeyframeBefore(keyframeIndices, targetSample);
    const lastQueued = sourceState.videoDecoder.getLastQueuedSample();
    const startIdx = Math.max(lastQueued + 1, keyframeIdx);
    const endIdx = Math.min(targetSample + PLAYBACK.MAX_QUEUE_SIZE, samples.length - 1);

    logger.info('Queue decode', {
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      reason,
      targetTimeUs: timelineTimeUs,
      sourceTimeUs,
      targetSample,
      keyframeIdx,
      startIdx,
      endIdx,
      lastQueuedSample: lastQueued,
      decoderState: sourceState.videoDecoder.state,
    });

    sourceState.videoDecoder.decodeSamples(samples, startIdx, endIdx);
  }
}

/**
 * Flush all video decoders to ensure queued samples are processed
 */
export async function flushAllDecoders(ctx: WorkerContext): Promise<void> {
  const flushPromises: Promise<void>[] = [];

  for (const sourceState of ctx.sources.values()) {
    if (sourceState.videoDecoder.state === 'configured') {
      flushPromises.push(sourceState.videoDecoder.flush());
    }
  }

  await Promise.all(flushPromises).catch((err) => {
    logger.error('Decoder flush failed', { err });
  });
}
