/**
 * The viewer's time zone for the request (item 43): the client sends its
 * IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, the
 * device's) on every API request as `X-Peek-Time-Zone`. A known zone in any
 * spelling becomes its canonical name; a missing, unknown or over-long value
 * is UTC. Date filters on stored instants (created,
 * updated, last played) read their days in it; it is a display preference,
 * never access control. Responses carry no cache headers, so no `Vary`.
 */
import type { NextFunction, Request, Response } from "express";
import { canonicalTimeZone } from "../utils/zonedTime.js";

export const TIME_ZONE_HEADER = "X-Peek-Time-Zone";

/** Puts the request's zone on `req.timeZone` (`TypedLibraryRequest`) */
export function requestTimeZone(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.header(TIME_ZONE_HEADER);
  const timeZone = header === undefined ? undefined : canonicalTimeZone(header);
  (req as { timeZone?: string }).timeZone = timeZone ?? "UTC";
  next();
}
