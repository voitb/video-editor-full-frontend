import { describe, it, expect } from 'vitest';
import { Clip } from '../../core/Clip';

describe('Clip', () => {
  describe('constructor', () => {
    it('should create a clip with required properties', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
      });

      expect(clip.sourceId).toBe('src-123');
      expect(clip.startUs).toBe(0);
      expect(clip.trimIn).toBe(0);
      expect(clip.trimOut).toBe(1_000_000);
      expect(clip.opacity).toBe(1);
      expect(clip.volume).toBe(1);
      expect(clip.id).toMatch(/^clip-/);
    });

    it('should accept optional properties', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 500_000,
        trimIn: 100_000,
        trimOut: 900_000,
        opacity: 0.5,
        volume: 0.8,
        label: 'Test Clip',
      });

      expect(clip.opacity).toBe(0.5);
      expect(clip.volume).toBe(0.8);
      expect(clip.label).toBe('Test Clip');
    });

    it('should throw for invalid trimOut', () => {
      expect(() => new Clip({
        sourceId: 'src-123',
        startUs: 0,
        trimIn: 500_000,
        trimOut: 500_000,
      })).toThrow('trimOut must be greater than trimIn');
    });

    it('should throw for negative startUs', () => {
      expect(() => new Clip({
        sourceId: 'src-123',
        startUs: -100,
        trimIn: 0,
        trimOut: 1_000_000,
      })).toThrow('startUs cannot be negative');
    });

    it('should throw for invalid opacity', () => {
      expect(() => new Clip({
        sourceId: 'src-123',
        startUs: 0,
        trimIn: 0,
        trimOut: 1_000_000,
        opacity: 1.5,
      })).toThrow('opacity must be between 0 and 1');
    });
  });

  describe('computed properties', () => {
    it('should compute durationUs from trim points', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 0,
        trimIn: 200_000,
        trimOut: 800_000,
      });

      expect(clip.durationUs).toBe(600_000);
    });

    it('should compute endUs from startUs and duration', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 0,
        trimOut: 500_000,
      });

      expect(clip.endUs).toBe(1_500_000);
    });
  });

  describe('isActiveAt', () => {
    const clip = new Clip({
      sourceId: 'src-123',
      startUs: 1_000_000,
      trimIn: 0,
      trimOut: 500_000,
    });

    it('should return true when time is within clip bounds', () => {
      expect(clip.isActiveAt(1_000_000)).toBe(true);
      expect(clip.isActiveAt(1_250_000)).toBe(true);
      expect(clip.isActiveAt(1_499_999)).toBe(true);
    });

    it('should return false when time is before clip', () => {
      expect(clip.isActiveAt(999_999)).toBe(false);
    });

    it('should return false when time is at or after clip end', () => {
      expect(clip.isActiveAt(1_500_000)).toBe(false);
      expect(clip.isActiveAt(2_000_000)).toBe(false);
    });
  });

  describe('timelineToSource', () => {
    it('should convert timeline time to source time', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 500_000,
        trimOut: 1_500_000,
      });

      // At clip start (timeline 1s), source should be at trimIn (0.5s)
      expect(clip.timelineToSource(1_000_000)).toBe(500_000);

      // 250ms into clip, source should be at 0.75s
      expect(clip.timelineToSource(1_250_000)).toBe(750_000);
    });
  });

  describe('sourceToTimeline', () => {
    it('should convert source time to timeline time', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 500_000,
        trimOut: 1_500_000,
      });

      // Source at trimIn (0.5s) should map to clip start (1s)
      expect(clip.sourceToTimeline(500_000)).toBe(1_000_000);

      // Source at 0.75s should map to timeline 1.25s
      expect(clip.sourceToTimeline(750_000)).toBe(1_250_000);
    });
  });

  describe('overlapsRange', () => {
    const clip = new Clip({
      sourceId: 'src-123',
      startUs: 1_000_000,
      trimIn: 0,
      trimOut: 1_000_000,
    });

    it('should return true for overlapping ranges', () => {
      expect(clip.overlapsRange(500_000, 1_500_000)).toBe(true);
      expect(clip.overlapsRange(1_500_000, 2_500_000)).toBe(true);
      expect(clip.overlapsRange(0, 3_000_000)).toBe(true);
    });

    it('should return false for non-overlapping ranges', () => {
      expect(clip.overlapsRange(0, 1_000_000)).toBe(false);
      expect(clip.overlapsRange(2_000_000, 3_000_000)).toBe(false);
    });
  });

  describe('moveTo', () => {
    it('should move clip to new position', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 0,
        trimOut: 500_000,
      });

      clip.moveTo(2_000_000);
      expect(clip.startUs).toBe(2_000_000);
      expect(clip.endUs).toBe(2_500_000);
    });

    it('should clamp to zero for negative positions', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 0,
        trimOut: 500_000,
      });

      clip.moveTo(-500_000);
      expect(clip.startUs).toBe(0);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const clip = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 100_000,
        trimOut: 900_000,
        opacity: 0.8,
        volume: 0.5,
        label: 'My Clip',
      }, 'clip-test');

      const json = clip.toJSON();

      expect(json.id).toBe('clip-test');
      expect(json.sourceId).toBe('src-123');
      expect(json.startUs).toBe(1_000_000);
      expect(json.trimIn).toBe(100_000);
      expect(json.trimOut).toBe(900_000);
      expect(json.opacity).toBe(0.8);
      expect(json.volume).toBe(0.5);
      expect(json.label).toBe('My Clip');
    });

    it('should deserialize from JSON', () => {
      const json = {
        id: 'clip-restored',
        sourceId: 'src-456',
        startUs: 2_000_000,
        trimIn: 0,
        trimOut: 1_000_000,
        opacity: 1,
        volume: 1,
        label: 'Restored',
      };

      const clip = Clip.fromJSON(json);

      expect(clip.id).toBe('clip-restored');
      expect(clip.sourceId).toBe('src-456');
      expect(clip.startUs).toBe(2_000_000);
    });
  });

  describe('clone', () => {
    it('should create an independent copy with new ID', () => {
      const original = new Clip({
        sourceId: 'src-123',
        startUs: 1_000_000,
        trimIn: 0,
        trimOut: 500_000,
        label: 'Original',
      });

      const cloned = original.clone();

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.sourceId).toBe(original.sourceId);
      expect(cloned.startUs).toBe(original.startUs);
      expect(cloned.label).toBe(original.label);

      // Modifying clone should not affect original
      cloned.moveTo(2_000_000);
      expect(original.startUs).toBe(1_000_000);
    });
  });
});
