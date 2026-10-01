import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { STATUS_CODES } from "node:http";
import type { ApiErrorIssue, ApiErrorResponse } from "../types/api/index.js";
import { isDatabaseBusy } from "../utils/dbWrite.js";
import { type LogContext, logger } from "../utils/logger.js";
import type { RequestUser } from "./auth.js";

/**
 * Base application error with HTTP status code.
 * Throw these from route handlers; the centralized errorHandler answers with
 * the status and `{ error: message, errorType }`. The message goes to the
 * client, so it is text written for them, never a caught error's message.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errorType?: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

/**
 * A request whose input is invalid: 400 with errorType VALIDATION_ERROR,
 * plus the `issues` found (one per invalid field) and any `details`.
 */
export class ValidationError extends AppError {
  readonly issues: ApiErrorIssue[] | undefined;
  readonly details: string | undefined;

  constructor(
    message: string,
    { issues, details }: { issues?: ApiErrorIssue[]; details?: string } = {}
  ) {
    super(message, 400, "VALIDATION_ERROR");
    this.issues = issues;
    this.details = details;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

/** The request clashes with what is stored (a duplicate name, say): 409. */
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * The server cannot answer now but will soon: 503, with Retry-After when
 * `retryAfterSeconds` is given.
 */
export class ServiceUnavailableError extends AppError {
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message = "Service unavailable",
    { retryAfterSeconds }: { retryAfterSeconds?: number } = {}
  ) {
    super(message, 503, "SERVICE_UNAVAILABLE");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Stash (or another upstream) failed or answered something unusable: 502. */
export class BadGatewayError extends AppError {
  constructor(message = "Bad gateway") {
    super(message, 502, "BAD_GATEWAY");
  }
}

/** Stash (or another upstream) did not answer in time: 504. */
export class GatewayTimeoutError extends AppError {
  constructor(message = "Gateway timeout") {
    super(message, 504, "GATEWAY_TIMEOUT");
  }
}

/** What the handler answers for an error. */
interface HttpAnswer {
  status: number;
  body: ApiErrorResponse;
  /** Sent as the Retry-After header, in seconds. */
  retryAfterSeconds?: number;
}

const INTERNAL_ERROR: HttpAnswer = {
  status: 500,
  body: { error: "Internal server error" },
};

/**
 * SQLite was busy past busy_timeout (`isDatabaseBusy`): nothing was written,
 * and the same request a moment later will most likely succeed.
 */
const DATABASE_BUSY: HttpAnswer = {
  status: 503,
  body: {
    error: "The database is busy, try again",
    errorType: "SERVICE_UNAVAILABLE",
  },
  retryAfterSeconds: 1,
};

/**
 * Prisma errors that mean the request clashes with stored data, answered in
 * fixed text: Prisma's own names tables, columns and constraints.
 */
const PRISMA_ANSWERS = new Map<string, HttpAnswer>([
  // Unique constraint: a duplicate name, say
  [
    "P2002",
    { status: 409, body: { error: "Already exists", errorType: "CONFLICT" } },
  ],
  // Foreign key: the row it refers to is gone, or rows still refer to it
  [
    "P2003",
    {
      status: 409,
      body: { error: "Conflicts with related data", errorType: "CONFLICT" },
    },
  ],
  // The row to update or delete does not exist
  [
    "P2025",
    { status: 404, body: { error: "Not found", errorType: "NOT_FOUND" } },
  ],
]);

/**
 * A 4xx that middleware raised before or around the handler, as http-errors
 * builds it: express.json's refusals (a `type` such as "entity.parse.failed"
 * or "entity.too.large"), the router's undecodable path parameter, a missing
 * file from `res.sendFile`. The status stands; the text is fixed, because
 * the message may quote the request body or a file path.
 */
interface ClientHttpError {
  error: Error;
  status: number;
  /** body-parser's `type`, when the request body was refused. */
  bodyType: string | undefined;
}

function asClientHttpError(err: unknown): ClientHttpError | undefined {
  if (!(err instanceof Error)) return undefined;
  const status =
    "status" in err
      ? err.status
      : "statusCode" in err
        ? err.statusCode
        : undefined;
  if (typeof status !== "number" || !Number.isInteger(status)) return undefined;
  if (status < 400 || status > 499) return undefined;
  // http-errors marks a status not meant for the client with expose: false
  if ("expose" in err && err.expose === false) return undefined;
  const bodyType =
    "type" in err && typeof err.type === "string" ? err.type : undefined;
  return { error: err, status, bodyType };
}

function clientErrorText({ status, bodyType }: ClientHttpError): string {
  if (bodyType === undefined) return STATUS_CODES[status] ?? "Bad request";
  return status === 413 ? "Request body too large" : "Invalid request body";
}

function appErrorAnswer(err: AppError): HttpAnswer {
  const body: ApiErrorResponse = { error: err.message };
  if (err.errorType !== undefined) body.errorType = err.errorType;
  if (err instanceof ValidationError) {
    if (err.issues !== undefined) body.issues = err.issues;
    if (err.details !== undefined) body.details = err.details;
  }
  const answer: HttpAnswer = { status: err.statusCode, body };
  if (
    err instanceof ServiceUnavailableError &&
    err.retryAfterSeconds !== undefined
  ) {
    answer.retryAfterSeconds = err.retryAfterSeconds;
  }
  return answer;
}

/**
 * Answer `err` in the central handler's shape (`{ error, errorType }`, plus
 * Retry-After) from code that cannot throw to Express, such as a callback.
 * Does nothing once headers are out.
 */
export function sendAppError(res: Response, err: AppError): void {
  if (res.headersSent) return;
  const answer = appErrorAnswer(err);
  if (answer.retryAfterSeconds !== undefined) {
    res.setHeader("Retry-After", String(answer.retryAfterSeconds));
  }
  res.status(answer.status).json(answer.body);
}

/**
 * The status and body for `err`: an AppError as it says; a busy database
 * 503; a Prisma duplicate or foreign-key clash 409 and a missing row 404; a
 * middleware 4xx its own status; anything else 500. Only an AppError's own
 * message reaches the client; every other body is fixed text.
 */
function toHttpAnswer(err: unknown): HttpAnswer {
  if (err instanceof AppError) return appErrorAnswer(err);
  if (isDatabaseBusy(err)) return DATABASE_BUSY;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return PRISMA_ANSWERS.get(err.code) ?? INTERNAL_ERROR;
  }
  const clientError = asClientHttpError(err);
  if (clientError) {
    return {
      status: clientError.status,
      body: { error: clientErrorText(clientError) },
    };
  }
  return INTERNAL_ERROR;
}

type ErrorRequest = Request & { user?: RequestUser };

/**
 * Who asked for what, and the whole error: the logger writes its name,
 * message, stack, code and cause. The route is the path without its query
 * string, which may carry a signed link's token. A refused request body is
 * logged by body-parser's type alone: its message quotes the raw body, which
 * on the login route holds a password.
 */
function logContext(req: ErrorRequest, err: unknown): LogContext {
  const clientError = asClientHttpError(err);
  const error =
    clientError?.bodyType === undefined
      ? err
      : {
          name: clientError.error.name,
          type: clientError.bodyType,
          status: clientError.status,
        };
  const context: LogContext = {
    method: req.method,
    route: req.path,
    userId: req.user?.id,
    error,
  };
  // What was refused: each invalid field's path and message, so a drifted
  // filter shows in the log, never the value the request sent
  if (err instanceof ValidationError && err.issues !== undefined) {
    context.issues = err.issues.map(({ path, message }) => ({ path, message }));
  }
  return context;
}

/**
 * Centralized error handler middleware.
 * Must be registered AFTER all routes in the Express app. Express 5 hands it
 * whatever a handler throws or rejects with.
 *
 * Answers `toHttpAnswer(err)`, logging 5xx at ERROR and refusals (4xx and a
 * ServiceUnavailableError's 503) at WARN.
 * Once headers are out it can no longer answer, so it ends the connection,
 * which tells the client the response is incomplete.
 */
export function errorHandler(
  err: unknown,
  req: ErrorRequest,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void {
  if (res.headersSent) {
    logger.warn("Error after response started", logContext(req, err));
    res.destroy();
    return;
  }

  const answer = toHttpAnswer(err);
  // A ServiceUnavailableError is a deliberate refusal (a full media queue, a
  // sync running), not a fault; a busy database stays an error
  if (answer.status >= 500 && !(err instanceof ServiceUnavailableError)) {
    logger.error("Request failed", logContext(req, err));
  } else {
    logger.warn("Request refused", logContext(req, err));
  }
  if (answer.retryAfterSeconds !== undefined) {
    res.setHeader("Retry-After", String(answer.retryAfterSeconds));
  }
  res.status(answer.status).json(answer.body);
}
