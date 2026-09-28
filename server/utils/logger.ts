/**
 * Logging utility with configurable log levels
 *
 * Log Levels (in order of verbosity):
 * - ERROR: Critical errors that need immediate attention
 * - WARN: Warning conditions that should be addressed
 * - INFO: Server events an admin reads: sync, users, settings,
 *   restrictions, writes to Stash (default)
 * - DEBUG: Per-request timings and other detailed debugging information
 * - VERBOSE: Very detailed/noisy debugging information
 */

/**
 * Log context - arbitrary data to include with log messages. Any value is
 * accepted: `serializeContext` writes errors, BigInts and circular objects
 * readably, and never throws.
 */
export type LogContext = { [key: string]: unknown };

const UNSERIALISABLE_CONTEXT = "[unserialisable context]";
const CIRCULAR = "[Circular]";

/**
 * An Error as the fields a log reader needs: name, message and stack, plus a
 * database error's `code` and `meta` (Prisma, SQLite, Node system errors)
 * and its `cause`, which the walk visits in turn.
 */
function serializeError(error: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if ("code" in error && error.code !== undefined) fields.code = error.code;
  if ("meta" in error && error.meta !== undefined) fields.meta = error.meta;
  if ("cause" in error && error.cause !== undefined) {
    fields.cause = error.cause;
  }
  return fields;
}

function hasToJSON(
  value: object
): value is { toJSON: (key: string) => unknown } {
  return "toJSON" in value && typeof value.toJSON === "function";
}

/**
 * `value` rebuilt as `JSON.stringify` can write it: an Error as its fields, a
 * BigInt as a number (a string past 2^53), and an object that is one of its
 * own ancestors as "[Circular]". `ancestors` is the path from the root to
 * `value` (pushed on entering an object, popped on leaving it), so the same
 * object reached twice without a cycle is written twice. `toJSON` is called
 * once, as `JSON.stringify` does; functions, symbols and undefined pass
 * through for it to drop.
 */
function toLoggable(value: unknown, key: string, ancestors: object[]): unknown {
  const current =
    typeof value === "object" && value !== null && hasToJSON(value)
      ? value.toJSON(key)
      : value;
  if (typeof current === "bigint") {
    const asNumber = Number(current);
    return Number.isSafeInteger(asNumber) ? asNumber : current.toString();
  }
  if (typeof current !== "object" || current === null) return current;
  // A boxed string, number or boolean: JSON.stringify writes its value
  if (
    current instanceof String ||
    current instanceof Number ||
    current instanceof Boolean
  ) {
    return current;
  }
  if (ancestors.includes(current)) return CIRCULAR;

  ancestors.push(current);
  try {
    if (Array.isArray(current)) {
      return current.map((item: unknown, index) =>
        toLoggable(item, String(index), ancestors)
      );
    }
    const source = current instanceof Error ? serializeError(current) : current;
    const fields: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(source)) {
      fields[name] = toLoggable(field, name, ancestors);
    }
    return fields;
  } finally {
    ancestors.pop();
  }
}

/**
 * The context as one line of JSON. `JSON.stringify` writes an Error as `{}`
 * and throws on a BigInt (raw SQL rows carry them) and on a cycle, so
 * `toLoggable` first turns an Error into its fields, a BigInt into a number
 * (a string past 2^53), and a true cycle into "[Circular]". Anything else
 * that throws (a getter, a `toJSON`) gives "[unserialisable context]": a log
 * call never becomes the caller's exception.
 */
export function serializeContext(context: LogContext): string {
  try {
    return JSON.stringify(toLoggable(context, "", []));
  } catch {
    return UNSERIALISABLE_CONTEXT;
  }
}

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
   * Format log message with timestamp and level, on one line
   */
  private format(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const contextStr = context ? ` ${serializeContext(context)}` : "";
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
