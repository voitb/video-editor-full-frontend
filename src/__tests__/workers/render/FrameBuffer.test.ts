import { describe, it, expect, beforeEach } from 'vitest';
import { FrameBuffer } from '../../../workers/render/FrameBuffer';

// Mock VideoFrame since it's not available in Node.js
class MockVideoFrame {
  timestamp: number;
  displayWidth = 1920;
  displayHeight = 1080;
  closed = false;

  constructor(timestamp: number) {
    this.timestamp = timestamp;
  }

  clone(): MockVideoFrame {
    return new MockVideoFrame(this.timestamp);
  }

  close(): void {
    this.closed = true;
  }
}

describe('FrameBuffer', () => {
  let frameBuffer: FrameBuffer;

  beforeEach(() => {
    frameBuffer = new FrameBuffer(8, 100000); // Max 8 frames, 100ms lag
  });

  describe('push', () => {
    it('adds frames to the queue', () => {
      const frame = new MockVideoFrame(0) as unknown as VideoFrame;
      frameBuffer.push(frame, 0);
      expect(frameBuffer.length).toBe(1);
    });

    it('respects max queue size', () => {
      // Add 10 frames, should only keep 8
      for (let i = 0; i < 10; i++) {
        const frame = new MockVideoFrame(i * 33333) as unknown as VideoFrame;
        frameBuffer.push(frame, i * 33333);
      }

      expect(frameBuffer.length).toBe(8);
    });

    it('closes oldest frames when exceeding max size', () => {
      const frames: MockVideoFrame[] = [];
      for (let i = 0; i < 10; i++) {
        const frame = new MockVideoFrame(i * 33333);
        frames.push(frame);
        frameBuffer.push(frame as unknown as VideoFrame, i * 33333);
      }

      // First 2 frames should be closed
      expect(frames[0]!.closed).toBe(true);
      expect(frames[1]!.closed).toBe(true);
      // Rest should still be open
      expect(frames[9]!.closed).toBe(false);
    });
  });

  describe('getFrameAtTime', () => {
    it('returns null for empty buffer', () => {
      expect(frameBuffer.getFrameAtTime(50000)).toBe(null);
    });

    it('returns frame at or before target time', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);
      frameBuffer.push(new MockVideoFrame(66666) as unknown as VideoFrame, 66666);

      const frame = frameBuffer.getFrameAtTime(50000);
      expect(frame).not.toBe(null);
      expect(frame!.timestamp).toBe(33333);
      frame!.close();
    });

    it('returns cloned frame', () => {
      const originalFrame = new MockVideoFrame(0);
      frameBuffer.push(originalFrame as unknown as VideoFrame, 0);

      const clonedFrame = frameBuffer.getFrameAtTime(50000);
      expect(clonedFrame).not.toBe(null);

      // Close the cloned frame
      clonedFrame!.close();

      // Original should still be in buffer
      expect(frameBuffer.length).toBe(1);
    });

    it('falls back to nearest frame if nothing before target', () => {
      // Only have frames in the future
      frameBuffer.push(new MockVideoFrame(100000) as unknown as VideoFrame, 100000);
      frameBuffer.push(new MockVideoFrame(133333) as unknown as VideoFrame, 133333);

      const frame = frameBuffer.getFrameAtTime(50000);
      expect(frame).not.toBe(null);
      expect(frame!.timestamp).toBe(100000);
      frame!.close();
    });

    it('prunes old frames beyond max lag', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);
      frameBuffer.push(new MockVideoFrame(200000) as unknown as VideoFrame, 200000);

      // Get frame at 200000, should prune frames older than 100000μs behind
      const frame = frameBuffer.getFrameAtTime(200000);
      frame!.close();

      // Frames at 0 and 33333 should be pruned (more than 100000μs behind 200000)
      expect(frameBuffer.length).toBe(1);
    });
  });

  describe('peekFrameAtTime', () => {
    it('returns null for empty buffer', () => {
      expect(frameBuffer.peekFrameAtTime(50000)).toBe(null);
    });

    it('returns frame info without cloning', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);

      const frameInfo = frameBuffer.peekFrameAtTime(50000);
      expect(frameInfo).not.toBe(null);
      expect(frameInfo!.timestampUs).toBe(33333);
    });

    it('returns null if no frame at or before target', () => {
      frameBuffer.push(new MockVideoFrame(100000) as unknown as VideoFrame, 100000);

      const frameInfo = frameBuffer.peekFrameAtTime(50000);
      expect(frameInfo).toBe(null);
    });
  });

  describe('getFirstFrame', () => {
    it('returns null for empty buffer', () => {
      expect(frameBuffer.getFirstFrame()).toBe(null);
    });

    it('returns cloned first frame', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);

      const frame = frameBuffer.getFirstFrame();
      expect(frame).not.toBe(null);
      expect(frame!.timestamp).toBe(0);
      frame!.close();
    });
  });

  describe('clear', () => {
    it('removes all frames', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);

      frameBuffer.clear();
      expect(frameBuffer.length).toBe(0);
    });

    it('closes all frames', () => {
      const frames: MockVideoFrame[] = [];
      for (let i = 0; i < 3; i++) {
        const frame = new MockVideoFrame(i * 33333);
        frames.push(frame);
        frameBuffer.push(frame as unknown as VideoFrame, i * 33333);
      }

      frameBuffer.clear();

      for (const frame of frames) {
        expect(frame.closed).toBe(true);
      }
    });
  });

  describe('getTimestamps', () => {
    it('returns empty array for empty buffer', () => {
      expect(frameBuffer.getTimestamps()).toEqual([]);
    });

    it('returns all timestamps in order', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      frameBuffer.push(new MockVideoFrame(33333) as unknown as VideoFrame, 33333);
      frameBuffer.push(new MockVideoFrame(66666) as unknown as VideoFrame, 66666);

      expect(frameBuffer.getTimestamps()).toEqual([0, 33333, 66666]);
    });
  });

  describe('hasFrames', () => {
    it('returns false for empty buffer', () => {
      expect(frameBuffer.hasFrames()).toBe(false);
    });

    it('returns true when frames exist', () => {
      frameBuffer.push(new MockVideoFrame(0) as unknown as VideoFrame, 0);
      expect(frameBuffer.hasFrames()).toBe(true);
    });
  });
});
