/**
 * Frame Renderer
 * Handles rendering and compositing video frames.
 */

import type { ActiveClip } from '../../core/types';
import type { WorkerContext } from './types';
import type { CompositorLayer } from '../../renderer/Compositor';
import { WebGLRenderer } from '../../renderer/WebGLRenderer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('FrameRenderer');

/**
 * Check if a clip is active at the given timeline time
 */
export function isClipActiveAt(clip: ActiveClip, timelineTimeUs: number): boolean {
  const clipDuration = clip.sourceEndUs - clip.sourceStartUs;
  const clipEnd = clip.timelineStartUs + clipDuration;
  return timelineTimeUs >= clip.timelineStartUs && timelineTimeUs < clipEnd;
}

/**
 * Render the current frame at the given timeline time
 * Returns true if a frame was successfully rendered
 */
export function renderFrame(ctx: WorkerContext, timelineTimeUs: number): boolean {
  if (!ctx.compositor) {
    logger.debug('Render skipped - no compositor', { timelineTimeUs });
    return false;
  }

  const layers: CompositorLayer[] = [];
  let hasVideoClipsAtTime = false;

  for (const clip of ctx.activeClips) {
    if (clip.trackType !== 'video') continue;
    if (!isClipActiveAt(clip, timelineTimeUs)) continue;

    hasVideoClipsAtTime = true;

    const sourceState = ctx.sources.get(clip.sourceId);
    if (!sourceState) continue;

    const sourceTimeUs = timelineTimeUs - clip.timelineStartUs + clip.sourceStartUs;
    const frame = sourceState.frameBuffer.getFrameAtTime(sourceTimeUs);

    if (frame) {
      layers.push({ frame, clip });
    }
  }

  if (layers.length > 0) {
    logger.info('Rendering composed frame', {
      timelineTimeUs,
      layers: layers.map(l => ({
        clipId: l.clip.clipId,
        trackIndex: l.clip.trackIndex,
        sourceId: l.clip.sourceId,
        frameTs: l.frame.timestamp,
      })),
    });

    ctx.compositor.composite(layers);

    for (const { frame } of layers) {
      frame.close();
    }
    return true;
  }

  if (!hasVideoClipsAtTime) {
    logger.info('Render clearing - no video at this time', {
      timelineTimeUs,
      hasClipsAtCurrentTime: ctx.hasClipsAtCurrentTime,
      hasVideoClipsAtTime,
    });
    ctx.compositor.clear();
    return true;
  }

  logger.info('Render skipped - buffering video', {
    timelineTimeUs,
    activeClips: ctx.activeClips.length,
    hasVideoClipsAtTime,
    queues: Array.from(ctx.sources.entries()).map(([id, s]) => ({
      sourceId: id,
      queue: s.frameBuffer.length,
      samples: s.demuxer.sampleCount,
    })),
  });

  return false;
}

/**
 * Request and send the first frame of a source as an image blob
 */
export async function requestFirstFrame(ctx: WorkerContext, sourceId: string): Promise<void> {
  const sourceState = ctx.sources.get(sourceId);
  if (!sourceState || !sourceState.frameBuffer.hasFrames()) return;

  const frame = sourceState.frameBuffer.getFirstFrame();
  if (!frame) return;

  if (ctx.renderer) {
    const tempCanvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const tempRenderer = new WebGLRenderer(tempCanvas);
    tempRenderer.drawWithoutClose(frame);

    const blob = await tempCanvas.convertToBlob({ type: 'image/png' });
    ctx.postResponse(
      {
        type: 'FIRST_FRAME',
        sourceId,
        blob,
        width: frame.displayWidth,
        height: frame.displayHeight,
      },
      []
    );

    tempRenderer.dispose();
  }

  frame.close();
}
