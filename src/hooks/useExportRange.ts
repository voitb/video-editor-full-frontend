/**
 * Video Editor - Export Range Hook
 * Manages In/Out point markers for export range selection.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ExportRange } from '../core/types';

/** Options for useExportRange hook */
export interface UseExportRangeOptions {
  /** Total duration of the composition in microseconds */
  durationUs: number;
}

/** Return type for useExportRange hook */
export interface UseExportRangeReturn {
  /** Current in-point (resolved to 0 if not set) */
  inPointUs: number;
  /** Current out-point (resolved to durationUs if not set) */
  outPointUs: number;
  /** Whether an in-point has been explicitly set */
  hasInPoint: boolean;
  /** Whether an out-point has been explicitly set */
  hasOutPoint: boolean;
  /** Raw export range (may contain null values) */
  range: ExportRange;
  /** Duration of the export range in microseconds */
  rangeDurationUs: number;
  /** Set the in-point at a specific time */
  setInPoint: (timeUs: number) => void;
  /** Set the out-point at a specific time */
  setOutPoint: (timeUs: number) => void;
  /** Clear the in-point (resets to start of composition) */
  clearInPoint: () => void;
  /** Clear the out-point (resets to end of composition) */
  clearOutPoint: () => void;
  /** Clear both in and out points */
  clearRange: () => void;
  /** Check if a time is within the export range */
  isInRange: (timeUs: number) => boolean;
}

/**
 * Hook for managing export In/Out point markers.
 * Provides state management for marking export ranges on the timeline.
 */
export function useExportRange(options: UseExportRangeOptions): UseExportRangeReturn {
  const { durationUs } = options;

  const [inPointUsRaw, setInPointUsRaw] = useState<number | null>(null);
  const [outPointUsRaw, setOutPointUsRaw] = useState<number | null>(null);

  // Resolved values (fall back to composition bounds)
  const inPointUs = inPointUsRaw ?? 0;
  const outPointUs = outPointUsRaw ?? durationUs;

  const setInPoint = useCallback(
    (timeUs: number) => {
      // Clamp to valid range
      const clampedTime = Math.max(0, Math.min(timeUs, durationUs));

      // Don't allow in-point >= out-point (if out-point is set)
      if (outPointUsRaw !== null && clampedTime >= outPointUsRaw) {
        return;
      }

      setInPointUsRaw(clampedTime);
    },
    [durationUs, outPointUsRaw]
  );

  const setOutPoint = useCallback(
    (timeUs: number) => {
      // Clamp to valid range
      const clampedTime = Math.max(0, Math.min(timeUs, durationUs));

      // Don't allow out-point <= in-point
      const effectiveInPoint = inPointUsRaw ?? 0;
      if (clampedTime <= effectiveInPoint) {
        return;
      }

      setOutPointUsRaw(clampedTime);
    },
    [durationUs, inPointUsRaw]
  );

  const clearInPoint = useCallback(() => {
    setInPointUsRaw(null);
  }, []);

  const clearOutPoint = useCallback(() => {
    setOutPointUsRaw(null);
  }, []);

  const clearRange = useCallback(() => {
    setInPointUsRaw(null);
    setOutPointUsRaw(null);
  }, []);

  const isInRange = useCallback(
    (timeUs: number) => {
      return timeUs >= inPointUs && timeUs <= outPointUs;
    },
    [inPointUs, outPointUs]
  );

  const range: ExportRange = useMemo(
    () => ({
      inPointUs: inPointUsRaw,
      outPointUs: outPointUsRaw,
    }),
    [inPointUsRaw, outPointUsRaw]
  );

  const rangeDurationUs = useMemo(() => {
    return outPointUs - inPointUs;
  }, [inPointUs, outPointUs]);

  return {
    inPointUs,
    outPointUs,
    hasInPoint: inPointUsRaw !== null,
    hasOutPoint: outPointUsRaw !== null,
    range,
    rangeDurationUs,
    setInPoint,
    setOutPoint,
    clearInPoint,
    clearOutPoint,
    clearRange,
    isInRange,
  };
}
