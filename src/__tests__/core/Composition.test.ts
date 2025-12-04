import { describe, it, expect, beforeEach } from 'vitest';
import { Composition } from '../../core/Composition';
import { Track } from '../../core/Track';

describe('Composition', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const comp = new Composition();

      expect(comp.config.width).toBe(1920);
      expect(comp.config.height).toBe(1080);
      expect(comp.config.frameRate).toBe(60);
      expect(comp.id).toMatch(/^comp-/);
    });

    it('should accept custom config', () => {
      const comp = new Composition({
        width: 1280,
        height: 720,
        frameRate: 60,
      });

      expect(comp.config.width).toBe(1280);
      expect(comp.config.height).toBe(720);
      expect(comp.config.frameRate).toBe(60);
    });
  });

  describe('track management', () => {
    let comp: Composition;

    beforeEach(() => {
      comp = new Composition();
    });

    it('should add tracks', () => {
      const track = new Track({ type: 'video', label: 'V1' });
      comp.addTrack(track);

      expect(comp.tracks).toHaveLength(1);
      expect(comp.trackCount).toBe(1);
    });

    it('should create tracks', () => {
      const track = comp.createTrack({ type: 'video', label: 'V1' });

      expect(comp.tracks).toHaveLength(1);
      expect(track.type).toBe('video');
    });

    it('should get track by ID', () => {
      const track = comp.createTrack({ type: 'video', label: 'V1' });

      expect(comp.getTrack(track.id)).toBe(track);
      expect(comp.getTrack('non-existent')).toBeUndefined();
    });

    it('should remove track by ID', () => {
      const track = comp.createTrack({ type: 'video', label: 'V1' });

      expect(comp.removeTrack(track.id)).toBe(true);
      expect(comp.tracks).toHaveLength(0);
      expect(comp.removeTrack('non-existent')).toBe(false);
    });

    it('should insert tracks at default position 0 (stack behavior)', () => {
      const a1 = comp.createTrack({ type: 'audio', label: 'A1' });
      const v1 = comp.createTrack({ type: 'video', label: 'V1' });
      const a2 = comp.createTrack({ type: 'audio', label: 'A2' });
      const v2 = comp.createTrack({ type: 'video', label: 'V2' });

      // Tracks without explicit order are inserted at position 0 (stack behavior)
      // Each new track pushes others down, resulting in reverse creation order
      expect(comp.tracks[0]!).toBe(v2); // Last created, at position 0
      expect(comp.tracks[1]!).toBe(a2);
      expect(comp.tracks[2]!).toBe(v1);
      expect(comp.tracks[3]!).toBe(a1); // First created, pushed to last position

      // Order property reflects position after insertions
      expect(v2.order).toBe(0);
      expect(a2.order).toBe(1);
      expect(v1.order).toBe(2);
      expect(a1.order).toBe(3);
    });

    it('should filter video and audio tracks', () => {
      comp.createTrack({ type: 'video', label: 'V1' });
      comp.createTrack({ type: 'video', label: 'V2' });
      comp.createTrack({ type: 'audio', label: 'A1' });

      expect(comp.videoTracks).toHaveLength(2);
      expect(comp.audioTracks).toHaveLength(1);
    });

    it('should get track index', () => {
      const v1 = comp.createTrack({ type: 'video', label: 'V1' });
      const a1 = comp.createTrack({ type: 'audio', label: 'A1' });

      // Due to stack behavior (insert at 0), a1 is at index 0, v1 at index 1
      expect(comp.getTrackIndex(a1.id)).toBe(0);
      expect(comp.getTrackIndex(v1.id)).toBe(1);
    });
  });

  describe('durationUs', () => {
    it('should return 0 for empty composition', () => {
      const comp = new Composition();
      expect(comp.durationUs).toBe(0);
    });

    it('should return longest track duration', () => {
      const comp = new Composition();

      const v1 = comp.createTrack({ type: 'video', label: 'V1' });
      v1.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });

      const v2 = comp.createTrack({ type: 'video', label: 'V2' });
      v2.createClip({ sourceId: 'src-2', startUs: 0, trimIn: 0, trimOut: 2_000_000 });

      expect(comp.durationUs).toBe(2_000_000);
    });
  });

  describe('clip convenience methods', () => {
    let comp: Composition;
    let track: Track;

    beforeEach(() => {
      comp = new Composition();
      track = comp.createTrack({ type: 'video', label: 'V1' });
    });

    it('should add clip to track', () => {
      const clip = comp.addClipToTrack(track.id, {
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(clip).toBeDefined();
      expect(track.clips).toHaveLength(1);
    });

    it('should return undefined for invalid track', () => {
      const clip = comp.addClipToTrack('invalid', {
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(clip).toBeUndefined();
    });

    it('should get clip by ID', () => {
      const clip = track.createClip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      const result = comp.getClip(clip.id);

      expect(result?.clip).toBe(clip);
      expect(result?.track).toBe(track);
    });

    it('should remove clip by ID', () => {
      const clip = track.createClip({
        sourceId: 'src-1',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(comp.removeClip(clip.id)).toBe(true);
      expect(track.clips).toHaveLength(0);
    });
  });

  describe('getActiveClipsAt', () => {
    it('should return active clips at a time', () => {
      const comp = new Composition();

      const v1 = comp.createTrack({ type: 'video', label: 'V1' });
      v1.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });

      const v2 = comp.createTrack({ type: 'video', label: 'V2' });
      v2.createClip({ sourceId: 'src-2', startUs: 500_000, trimIn: 0, trimOut: 500_000 });

      const active = comp.getActiveClipsAt(750_000);

      expect(active).toHaveLength(2);
      expect(active[0]!.trackIndex).toBe(0);
      expect(active[1]!.trackIndex).toBe(1);
    });

    it('should return empty for times with no clips', () => {
      const comp = new Composition();
      const track = comp.createTrack({ type: 'video', label: 'V1' });
      track.createClip({ sourceId: 'src-1', startUs: 1_000_000, trimIn: 0, trimOut: 500_000 });

      expect(comp.getActiveClipsAt(0)).toHaveLength(0);
    });

    it('should include correct source timing', () => {
      const comp = new Composition();
      const track = comp.createTrack({ type: 'video', label: 'V1' });
      track.createClip({
        sourceId: 'src-1',
        startUs: 1_000_000,
        trimIn: 500_000,
        trimOut: 1_500_000,
        opacity: 0.8,
      });

      const clips = comp.getActiveClipsAt(1_250_000);
      const clip = clips[0]!;

      expect(clip.clipId).toBeDefined();
      expect(clip.sourceId).toBe('src-1');
      expect(clip.timelineStartUs).toBe(1_000_000);
      expect(clip.sourceStartUs).toBe(500_000);
      expect(clip.sourceEndUs).toBe(1_500_000);
      expect(clip.opacity).toBe(0.8);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      const comp = new Composition({ width: 1280, height: 720, frameRate: 24 }, 'comp-test');

      const track = comp.createTrack({ type: 'video', label: 'V1' });
      track.createClip({ sourceId: 'src-1', startUs: 0, trimIn: 0, trimOut: 1_000_000 });

      const json = comp.toJSON();
      const restored = Composition.fromJSON(json);

      expect(restored.id).toBe('comp-test');
      expect(restored.config.width).toBe(1280);
      expect(restored.config.height).toBe(720);
      expect(restored.config.frameRate).toBe(24);
      expect(restored.tracks).toHaveLength(1);
      expect(restored.tracks[0]!.clips).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all tracks', () => {
      const comp = new Composition();
      comp.createTrack({ type: 'video', label: 'V1' });
      comp.createTrack({ type: 'audio', label: 'A1' });

      comp.clear();

      expect(comp.tracks).toHaveLength(0);
    });
  });
});
