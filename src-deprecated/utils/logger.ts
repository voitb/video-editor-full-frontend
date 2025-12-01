// ============================================================================
// LOGGER UTILITY
// ============================================================================
// Dev-only logging utility that strips logs in production builds.

/**
 * Check if we're in development mode.
 * In Web Workers, import.meta.env may not be available, so we fallback.
 */
const isDev = (() => {
  try {
    return import.meta.env?.DEV ?? true;
  } catch {
    // In worker context, assume dev if not explicitly set
    return true;
  }
})();

/**
 * Logger utility with dev-only logging for non-error logs.
 * Errors are always logged to help with production debugging.
 */
export const logger = {
  /** Always logs - errors should be visible in production */
  error: (...args: unknown[]) => console.error('[VideoEditor]', ...args),

  /** Dev-only warning logs */
  warn: isDev ? (...args: unknown[]) => console.warn('[VideoEditor]', ...args) : () => {},

  /** Dev-only info logs */
  log: isDev ? (...args: unknown[]) => console.log('[VideoEditor]', ...args) : () => {},

  /** Dev-only debug logs */
  debug: isDev ? (...args: unknown[]) => console.debug('[VideoEditor]', ...args) : () => {},
};

/**
 * Worker-specific logger with worker name prefix.
 * Use this in Web Workers for better log identification.
 */
export function createWorkerLogger(workerName: string) {
  const prefix = `[${workerName}]`;

  return {
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: isDev ? (...args: unknown[]) => console.warn(prefix, ...args) : () => {},
    log: isDev ? (...args: unknown[]) => console.log(prefix, ...args) : () => {},
    debug: isDev ? (...args: unknown[]) => console.debug(prefix, ...args) : () => {},
  };
}
