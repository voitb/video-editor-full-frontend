/**
 * Timeline Hooks Module
 * Barrel export for timeline-related hooks.
 */

export { useTimeline } from './useTimeline';
export type { UseTimelineOptions, UseTimelineReturn } from './useTimeline';

// Sub-hooks (for advanced use cases)
export { useViewportState } from './useViewportState';
export { useViewportZoom } from './useViewportZoom';
export { useViewportPan } from './useViewportPan';
export { useTimelineCoordinates } from './useTimelineCoordinates';
export { useScrollSync } from './useScrollSync';
export { useTrackUIState } from './useTrackUIState';
