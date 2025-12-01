/**
 * Video Editor V2 - ID Generation Utilities
 */

/**
 * Generate a unique ID with optional prefix
 */
export function createId(prefix?: string): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * Generate a composition ID
 */
export function createCompositionId(): string {
  return createId('comp');
}

/**
 * Generate a track ID
 */
export function createTrackId(): string {
  return createId('track');
}

/**
 * Generate a clip ID
 */
export function createClipId(): string {
  return createId('clip');
}

/**
 * Generate a source ID
 */
export function createSourceId(): string {
  return createId('src');
}
