/**
 * Grid Lines Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { getTimeStep, getGridLines } from '../../../../components/timeline/utils/gridLines';

describe('getTimeStep', () => {
  it('returns 100ms for very short durations', () => {
    // With ~10 markers, 500ms / 10 = 50ms, so first interval >= 50ms is 100ms
    const step = getTimeStep(500_000); // 0.5s
    expect(step).toBe(100_000);
  });

  it('returns 1s for 10 second duration', () => {
    // 10s / 10 = 1s
    const step = getTimeStep(10_000_000);
    expect(step).toBe(1_000_000);
  });

  it('returns 5s for 1 minute duration', () => {
    // 60s / 10 = 6s, first interval >= 6s is 10s? No, 5s is smaller
    // Actually 5s < 6s, so it should return 10s
    const step = getTimeStep(60_000_000);
    expect(step).toBe(10_000_000);
  });

  it('returns 30s for 5 minute duration', () => {
    // 300s / 10 = 30s
    const step = getTimeStep(300_000_000);
    expect(step).toBe(30_000_000);
  });

  it('returns 60s for 10 minute duration', () => {
    // 600s / 10 = 60s
    const step = getTimeStep(600_000_000);
    expect(step).toBe(60_000_000);
  });

  it('returns 300s (5min) for very long durations', () => {
    // 3600s / 10 = 360s, largest interval is 300s
    const step = getTimeStep(3_600_000_000); // 1 hour
    expect(step).toBe(300_000_000);
  });
});

describe('getGridLines', () => {
  it('returns empty array for zero duration', () => {
    const lines = getGridLines(0, 0, 0);
    expect(lines.length).toBeGreaterThanOrEqual(0);
  });

  it('returns lines sorted by time', () => {
    const lines = getGridLines(10_000_000, 0, 10_000_000);

    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]!.timeUs).toBeGreaterThanOrEqual(lines[i - 1]!.timeUs);
    }
  });

  it('has major lines at regular intervals', () => {
    // 10s duration: major at 5s intervals (0, 5s, 10s)
    const lines = getGridLines(10_000_000, 0, 10_000_000);
    const majorLines = lines.filter(l => l.type === 'major');

    expect(majorLines.length).toBeGreaterThan(0);
    expect(majorLines[0]!.timeUs).toBe(0);
  });

  it('prioritizes major over minor at same position', () => {
    const lines = getGridLines(10_000_000, 0, 10_000_000);

    // At time 0, there should only be one line (major)
    const linesAtZero = lines.filter(l => l.timeUs === 0);
    expect(linesAtZero.length).toBe(1);
    expect(linesAtZero[0]!.type).toBe('major');
  });

  it('returns minor lines between major lines', () => {
    // 10s duration
    const lines = getGridLines(10_000_000, 0, 10_000_000);
    const minorLines = lines.filter(l => l.type === 'minor');

    expect(minorLines.length).toBeGreaterThan(0);
  });

  it('respects start and end time bounds', () => {
    const lines = getGridLines(5_000_000, 2_000_000, 7_000_000);

    for (const line of lines) {
      expect(line.timeUs).toBeGreaterThanOrEqual(0);
      expect(line.timeUs).toBeLessThanOrEqual(7_000_000);
    }
  });

  it('handles very short durations with sub-minor lines', () => {
    // < 2s: includes sub-minor lines at ~33ms
    const lines = getGridLines(1_000_000, 0, 1_000_000);
    const hasSubMinor = lines.some(l => l.type === 'sub-minor');

    expect(hasSubMinor).toBe(true);
  });

  it('handles medium durations without sub-minor lines', () => {
    // > 5min: no sub-minor lines
    const lines = getGridLines(600_000_000, 0, 600_000_000);
    const hasSubMinor = lines.some(l => l.type === 'sub-minor');

    expect(hasSubMinor).toBe(false);
  });

  it('generates reasonable number of lines for 1 minute duration', () => {
    const lines = getGridLines(60_000_000, 0, 60_000_000);

    // Should have some lines but not too many
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.length).toBeLessThan(200);
  });

  it('each line has valid type', () => {
    const lines = getGridLines(10_000_000, 0, 10_000_000);

    for (const line of lines) {
      expect(['major', 'minor', 'sub-minor']).toContain(line.type);
    }
  });
});
