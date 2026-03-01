import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

/**
 * Base application error with HTTP status code.
 * Throw these from route handlers; the centralized errorHandler will catch them.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errorType?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * Centralized error handler middleware.
 * Must be registered AFTER all routes in the Express app.
 *
 * - AppError subclasses produce structured JSON responses with their status code.
 * - Unhandled errors produce a generic 500 with a sanitized message.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    logger.warn("AppError", {
      status: err.statusCode,
      error: err.message,
      type: err.errorType,
    });
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.errorType && { errorType: err.errorType }),
    });
  }

  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
  });
  return res.status(500).json({ error: "Internal server error" });
}
