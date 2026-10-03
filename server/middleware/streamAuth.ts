/**
 * Session or signed link for the stream, caption and poster routes (sweep item 2,
 * casting).
 *
 * External players and Cast receivers cannot send cookies, so these routes
 * also accept a signed link: `uid`, `exp`, `sig` and an optional `scope` in
 * the query, checked against the user's current passwordChangedAt
 * (utils/streamLink.ts). Without `sig` this is plain authenticate.
 *
 * - A v1 link (no `scope`), minted by createExternalPlayerLink, opens the
 *   direct stream (`proxy-stream/stream`) only.
 * - A `media` link opens its one scene and instance: the direct stream, the
 *   HLS playlist and its segments (`stream.m3u8`, `stream.m3u8/<n>.ts`), and
 *   whatever the guard's own `allow` adds (the caption and poster routes). Never DASH or
 *   the piped MP4, WebM and MKV transcodes.
 * - Any other `scope`, an empty one or a repeated one is 401.
 *
 * On success req.user carries that user and res.locals.streamLink the
 * verified claims, and the controller runs the same access check as for a
 * cookie, so the link plays only what the user may see at request time.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../prisma/singleton.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";
import {
  STREAM_LINK_TTL_SECONDS,
  type StreamLinkClaims,
  getStreamLinkKey,
  isStreamLinkSignatureValid,
} from "../utils/streamLink.js";
import { type AuthenticatedRequest, authenticate } from "./auth.js";

const SIG_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UID_PATTERN = /^\d{1,10}$/;
const EXP_PATTERN = /^\d{1,12}$/;

/** Clock skew allowed on a freshly minted link's expiry. */
const EXP_SLACK_SECONDS = 60;

const invalid = (res: Response) =>
  res.status(401).json({ error: "Invalid stream link" });

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

type LinkScope = StreamLinkClaims["scope"];

/** The verified claims of a signed request, on res.locals.streamLink. */
export interface VerifiedStreamLink {
  uid: number;
  exp: number;
  scope: LinkScope;
  sig: string;
}

declare module "express-serve-static-core" {
  interface Locals {
    /** Set by the stream guards for a signed request; absent for a session. */
    streamLink?: VerifiedStreamLink;
  }
}

/** Whether a signed link of `scope` may open the route `req` names. */
type SignedAllow = (req: Request, scope: LinkScope) => boolean;

/**
 * The scope a signed request names: undefined when it names none (v1), null
 * when it names something unusable (empty, repeated or unknown).
 */
function readScope(req: Request): LinkScope | null {
  const raw: unknown = req.query.scope;
  if (raw === undefined) return undefined;
  return queryString(raw) === "media" ? "media" : null;
}

/**
 * The guard for the routes `allow` admits a signed link to; any other signed
 * request is 401 before the user lookup.
 */
function streamAuthFor(allow: SignedAllow): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.query.sig === undefined) {
      return authenticate(req, res, next);
    }

    const scope = readScope(req);
    if (scope === null) {
      invalid(res);
      return;
    }

    if (!allow(req, scope)) {
      res
        .status(401)
        .json({ error: "Signed links are valid only for the direct stream" });
      return;
    }

    await verifySignedRequest(req, res, next, scope);
  };
}

async function verifySignedRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  scope: LinkScope
): Promise<void> {
  const sig = queryString(req.query.sig);
  const uid = queryString(req.query.uid);
  const exp = queryString(req.query.exp);
  const instanceId = queryString(req.query.instanceId);
  const sceneId = req.params.sceneId;

  if (
    !sig ||
    !uid ||
    !exp ||
    !instanceId ||
    !sceneId ||
    !SIG_PATTERN.test(sig) ||
    !UID_PATTERN.test(uid) ||
    !EXP_PATTERN.test(exp) ||
    !INSTANCE_ID_PATTERN.test(instanceId)
  ) {
    invalid(res);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expSeconds = Number(exp);
  if (expSeconds <= now) {
    res.status(401).json({ error: "Stream link expired" });
    return;
  }
  if (expSeconds > now + STREAM_LINK_TTL_SECONDS + EXP_SLACK_SECONDS) {
    invalid(res);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(uid) },
    select: { id: true, username: true, role: true, passwordChangedAt: true },
  });
  if (!user) {
    invalid(res);
    return;
  }

  const claims: StreamLinkClaims = {
    userId: user.id,
    sceneId,
    instanceId,
    exp: expSeconds,
    passwordChangedAtMs: user.passwordChangedAt?.getTime() ?? 0,
  };
  if (scope !== undefined) claims.scope = scope;
  if (!isStreamLinkSignatureValid(claims, sig, getStreamLinkKey())) {
    invalid(res);
    return;
  }

  (req as AuthenticatedRequest).user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  res.locals.streamLink = { uid: user.id, exp: expSeconds, scope, sig };
  next();
}

const isDirectStream = (req: Request): boolean =>
  req.params.streamPath === "stream" && req.params.subPath === undefined;

/**
 * The stream routes: a v1 link opens the direct stream; a media link also
 * the HLS playlist and anything under it (isAllowedStreamPath, in the
 * controller, admits only `<n>.ts` there).
 */
export const authenticateStreamRequest: RequestHandler = streamAuthFor(
  (req, scope) =>
    isDirectStream(req) ||
    (scope === "media" && req.params.streamPath === "stream.m3u8")
);

/** The caption route: a media link only, never a v1 link. */
export const authenticateCaptionRequest: RequestHandler = streamAuthFor(
  (_req, scope) => scope === "media"
);

/** The poster route: a media link only, never a v1 link. */
export const authenticatePosterRequest: RequestHandler = streamAuthFor(
  (_req, scope) => scope === "media"
);
