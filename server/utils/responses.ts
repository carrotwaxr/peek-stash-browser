import type { Response } from "express";
import type { ApiErrorResponse } from "../types/api/index.js";

/**
 * Send a success response with the given data.
 * Controllers can adopt this incrementally — no forced migration.
 */
export function sendSuccess(
  res: Response,
  data: Record<string, unknown>,
  status = 200
) {
  return res.status(status).json(data);
}

/**
 * Send a 201 Created response with the given data.
 */
export function sendCreated(
  res: Response,
  data: Record<string, unknown>
) {
  return res.status(201).json(data);
}

/**
 * Send a 204 No Content response (no body).
 */
export function sendNoContent(res: Response) {
  return res.sendStatus(204);
}

/**
 * Send a standardized error response using the ApiErrorResponse shape.
 * Ensures all error responses include at least `{ error: string }`.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  details?: string
) {
  const body: ApiErrorResponse = { error };
  if (details) body.details = details;
  return res.status(status).json(body);
}
