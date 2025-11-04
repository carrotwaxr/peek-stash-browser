/**
 * Logging utility with configurable log levels
 *
 * Log Levels (in order of verbosity):
 * - ERROR: Critical errors that need immediate attention
 * - WARN: Warning conditions that should be addressed
 * - INFO: Important informational messages (default)
 * - DEBUG: Detailed debugging information
 * - VERBOSE: Very detailed/noisy debugging information
 */

/**
 * Log context - arbitrary data to include with log messages
 * Can contain any JSON-serializable values or objects
 * Accepts any object with string keys for maximum flexibility
 */
export type LogContext = { [key: string]: unknown };

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.WARN]: "WARN",
  [LogLevel.INFO]: "INFO",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.VERBOSE]: "VERBOSE",
};

class Logger {
  private level: LogLevel;

  constructor() {
    // Read log level from environment variable (default: INFO)
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.level = this.parseLogLevel(envLevel) ?? LogLevel.INFO;
  }

  /**
   * Parse log level string to enum value
   */
  private parseLogLevel(level?: string): LogLevel | null {
    if (!level) return null;

    switch (level) {
      case "ERROR":
        return LogLevel.ERROR;
      case "WARN":
        return LogLevel.WARN;
      case "INFO":
        return LogLevel.INFO;
      case "DEBUG":
        return LogLevel.DEBUG;
      case "VERBOSE":
        return LogLevel.VERBOSE;
      default:
        return null;
    }
  }

  /**
   * Check if a message at the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  /**
   * Format log message with timestamp and level
   */
  private format(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${levelName}] ${message}${contextStr}`;
  }

  /**
   * Log error message (always logged)
   */
  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.format(LogLevel.ERROR, message, context));
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.format(LogLevel.WARN, message, context));
    }
  }

  /**
   * Log info message (default level)
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.format(LogLevel.INFO, message, context));
    }
  }

  /**
   * Log debug message (detailed debugging)
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.format(LogLevel.DEBUG, message, context));
    }
  }

  /**
   * Log verbose message (very detailed/noisy)
   */
  verbose(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.format(LogLevel.VERBOSE, message, context));
    }
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set log level dynamically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Singleton logger instance
export const logger = new Logger();
