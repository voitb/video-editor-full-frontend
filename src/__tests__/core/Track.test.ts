import { describe, it, expect } from 'vitest';
import { Track } from '../../core/Track';
import { Clip } from '../../core/Clip';

describe('Track', () => {
  describe('constructor', () => {
    it('should create a video track', () => {
      const track = new Track({ type: 'video', label: 'Video 1' });

      expect(track.type).toBe('video');
      expect(track.label).toBe('Video 1');
      expect(track.id).toMatch(/^track-/);
      expect(track.clips).toHaveLength(0);
    });

    it('should create an audio track', () => {
      const track = new Track({ type: 'audio', label: 'Audio 1' });

      expect(track.type).toBe('audio');
      expect(track.label).toBe('Audio 1');
    });
  });

  describe('clip management', () => {
    it('should add clips', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      const clip = new Clip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      track.addClip(clip);

      expect(track.clips).toHaveLength(1);
      expect(track.clipCount).toBe(1);
    });

    it('should create clips from config', () => {
      const track = new Track({ type: 'video', label: 'Test' });

      const clip = track.createClip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(track.clips).toHaveLength(1);
      expect(track.clips[0]).toBe(clip);
    });

    it('should remove clips by ID', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      const clip = track.createClip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(track.removeClip(clip.id)).toBe(true);
      expect(track.clips).toHaveLength(0);
    });

    it('should return false when removing non-existent clip', () => {
      const track = new Track({ type: 'video', label: 'Test' });

      expect(track.removeClip('non-existent')).toBe(false);
    });

    it('should get clip by ID', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      const clip = track.createClip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(track.getClip(clip.id)).toBe(clip);
      expect(track.getClip('non-existent')).toBeUndefined();
    });

    it('should sort clips by start time', () => {
      const track = new Track({ type: 'video', label: 'Test' });

      // Add in non-sorted order
      track.createClip({ sourceId: 'src-1', startUs: 2_000_000, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-2', startUs: 0, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-3', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      expect(track.clips[0].startUs).toBe(0);
      expect(track.clips[1].startUs).toBe(1_000_000);
      expect(track.clips[2].startUs).toBe(2_000_000);
    });
  });

  describe('durationUs', () => {
    it('should return 0 for empty track', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      expect(track.durationUs).toBe(0);
    });

    it('should return end of last clip', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-2', startUs: 1_000_000, trimIn: 0, trimOut: 1_000_000 });

      expect(track.durationUs).toBe(2_000_000);
    });
  });

  describe('getClipsInRange', () => {
    it('should return clips overlapping the range', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-2', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-3', startUs: 2_000_000, trimIn: 0, trimOut: 500_000 });

      const clips = track.getClipsInRange(400_000, 1_200_000);

      expect(clips).toHaveLength(2);
      expect(clips[0].sourceId).toBe('src-1');
      expect(clips[1].sourceId).toBe('src-2');
    });
  });

  describe('getClipAt', () => {
    it('should return clip at specific time', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      const clip1 = track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 500_000 });
      const clip2 = track.createClip({ sourceId: 'src-2', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      expect(track.getClipAt(250_000)).toBe(clip1);
      expect(track.getClipAt(1_250_000)).toBe(clip2);
      expect(track.getClipAt(750_000)).toBeUndefined();
    });
  });

  describe('getActiveClipsAt', () => {
    it('should return all clips active at a time (for audio tracks)', () => {
      const track = new Track({ type: 'audio', label: 'Test' });
      // Overlapping clips
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });
      track.createClip({ sourceId: 'src-2', startUs: 500_000, trimIn: 0, trimOut: 1_000_000 });

      const clips = track.getActiveClipsAt(750_000);

      expect(clips).toHaveLength(2);
    });
  });

  describe('wouldOverlap', () => {
    it('should detect overlaps', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      expect(track.wouldOverlap(1_200_000, 1_800_000)).toBe(true);
      expect(track.wouldOverlap(2_000_000, 3_000_000)).toBe(false);
    });

    it('should exclude specified clip from check', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      const clip = track.createClip({ sourceId: 'src-1', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      // Same range, but excluding the existing clip
      expect(track.wouldOverlap(1_000_000, 1_500_000, clip.id)).toBe(false);
    });
  });

  describe('findGap', () => {
    it('should find first available gap', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 500_000 });
      track.createClip({ sourceId: 'src-2', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      // Gap between 500k-1000k can fit 400k duration
      expect(track.findGap(400_000)).toBe(500_000);

      // No gap for 600k duration, should append at end
      expect(track.findGap(600_000)).toBe(1_500_000);
    });

    it('should respect afterUs parameter', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 500_000 });

      expect(track.findGap(300_000, 1_000_000)).toBe(1_000_000);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      const track = new Track({ type: 'video', label: 'My Track' }, 'track-test');
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });
      track.createClip({ sourceId: 'src-2', startUs: 1_500_000, trimIn: 0, trimOut: 500_000 });

      const json = track.toJSON();
      const restored = Track.fromJSON(json);

      expect(restored.id).toBe('track-test');
      expect(restored.type).toBe('video');
      expect(restored.label).toBe('My Track');
      expect(restored.clips).toHaveLength(2);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const track = new Track({ type: 'video', label: 'Original' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });

      const cloned = track.clone();

      expect(cloned.id).not.toBe(track.id);
      expect(cloned.clips).toHaveLength(1);
      expect(cloned.clips[0].id).not.toBe(track.clips[0].id);
    });
  });

  describe('clear', () => {
    it('should remove all clips', () => {
      const track = new Track({ type: 'video', label: 'Test' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });
      track.createClip({ sourceId: 'src-2', startUs: 1_000_000, trimIn: 0, trimOut: 1_000_000 });

      track.clear();

      expect(track.clips).toHaveLength(0);
    });
  });
});
