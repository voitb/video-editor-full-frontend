/**
 * Generate a short, reasonably unique identifier.
 * Uses crypto.randomUUID when available, otherwise falls back to timestamp + random suffix.
 */
export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(16).slice(2, 8);
  const timestamp = Date.now().toString(16);
  return `${prefix}-${timestamp}-${random}`;
}
