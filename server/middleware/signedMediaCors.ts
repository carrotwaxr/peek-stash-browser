/**
 * CORS for signed media (Contract 4): a Cast receiver, or any page another
 * origin serves, may read a signed stream, caption or poster. Such a request
 * gets `Access-Control-Allow-Origin: *`, the range headers exposed, and a
 * preflight answered here with 204; never `Access-Control-Allow-Credentials`,
 * since the link itself is the credential. It validates nothing: the stream
 * guards (`streamAuth.ts`) check the signature, user, expiry and scope.
 *
 * `isSignedMediaRequest` decides both sides: this middleware handles a
 * signed media request, and the global credentialed `cors()` in
 * `initializers/api.ts` skips it, since it would add the credentials header
 * and replace `*` with a listed origin. A request without `sig`, or on any
 * other path, is left to the global `cors()` as before.
 */
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

const SIGNED_MEDIA_PATH =
  /^\/api\/scene\/\d+\/(proxy-stream\/|caption$|poster$)/;

/** A request on a scene's stream, caption or poster with one string `sig`. */
export function isSignedMediaRequest(req: Request): boolean {
  return typeof req.query.sig === "string" && SIGNED_MEDIA_PATH.test(req.path);
}

export function signedMediaCors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isSignedMediaRequest(req)) {
    next();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges"
  );
  if (req.method !== "OPTIONS") {
    next();
    return;
  }
  const privateNetwork =
    req.header("Access-Control-Request-Private-Network") === "true";
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  if (privateNetwork) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  // Never the URL: its query holds the link's signature
  logger.debug(
    `preflight from ${req.header("Origin") ?? "no origin"}, private network: ${privateNetwork}`
  );
  res.status(204).end();
}
