/**
 * Video Editor V2 - Structured Logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

/**
 * Set the minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string) {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;

    const logFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;

    if (context && Object.keys(context).length > 0) {
      logFn(`${prefix} ${message}`, context);
    } else {
      logFn(`${prefix} ${message}`);
    }
  };

  return {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    error: (message: string, context?: LogContext) => log('error', message, context),
  };
}
