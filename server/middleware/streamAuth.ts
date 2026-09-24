/**
 * Session or signed link for the stream routes (sweep item 2).
 *
 * External players cannot send cookies, so the direct stream also accepts a
 * link minted by createExternalPlayerLink: `uid`, `exp` and `sig` in the
 * query, checked against the user's current passwordChangedAt. A signed
 * request is accepted for `proxy-stream/stream` only: HLS playlists and
 * segments always need the session. Without `sig` this is plain
 * authenticate.
 *
 * On success req.user carries that user, and the controller runs the same
 * access check as for a cookie, so the link plays only what the user may see
 * at request time.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../prisma/singleton.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";
import {
  STREAM_LINK_TTL_SECONDS,
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

export const authenticateStreamRequest: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.query.sig === undefined) {
    return authenticate(req, res, next);
  }

  if (req.params.streamPath !== "stream" || req.params.subPath !== undefined) {
    return res
      .status(401)
      .json({ error: "Signed links are valid only for the direct stream" });
  }

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
    return invalid(res);
  }

  const now = Math.floor(Date.now() / 1000);
  const expSeconds = Number(exp);
  if (expSeconds <= now) {
    return res.status(401).json({ error: "Stream link expired" });
  }
  if (expSeconds > now + STREAM_LINK_TTL_SECONDS + EXP_SLACK_SECONDS) {
    return invalid(res);
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(uid) },
    select: { id: true, username: true, role: true, passwordChangedAt: true },
  });
  if (!user) {
    return invalid(res);
  }

  const valid = isStreamLinkSignatureValid(
    {
      userId: user.id,
      sceneId,
      instanceId,
      exp: expSeconds,
      passwordChangedAtMs: user.passwordChangedAt?.getTime() ?? 0,
    },
    sig,
    getStreamLinkKey()
  );
  if (!valid) {
    return invalid(res);
  }

  (req as AuthenticatedRequest).user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  next();
};
