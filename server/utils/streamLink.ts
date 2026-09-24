/**
 * Signed external-player links (sweep item 2).
 *
 * VLC, Android intents and iOS x-callback pass a bare URL and cannot send
 * headers or cookies, so the direct stream accepts a link whose claims and
 * signature travel as query parameters (`uid`, `exp`, `sig`, beside the
 * existing `instanceId`).
 *
 * The key is HKDF-SHA256 over the persisted JWT secret with its own `info`
 * label, so a stream signature can never pass as a JWT signature or the
 * reverse, and rotating the JWT secret revokes every link. The claims
 * include the user's passwordChangedAt, so a password change or reset
 * revokes all of that user's links (there is no per-link revocation).
 *
 * The fields are newline-joined. `sceneId` (digits), `instanceId`
 * (INSTANCE_ID_PATTERN) and the numbers cannot contain a newline, so the
 * encoding is unambiguous.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "crypto";
import { getJwtSecret } from "./jwtSecret.js";

export const STREAM_LINK_TTL_SECONDS = 12 * 60 * 60;

const KEY_INFO = "peek:external-stream-link:v1";

export interface StreamLinkClaims {
  userId: number;
  sceneId: string;
  instanceId: string;
  /** Unix seconds. */
  exp: number;
  /** User.passwordChangedAt as epoch ms, 0 when never changed. */
  passwordChangedAtMs: number;
}

export function deriveStreamLinkKey(jwtSecret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", jwtSecret, Buffer.alloc(0), KEY_INFO, 32)
  );
}

const message = (c: StreamLinkClaims): string =>
  ["v1", c.userId, c.sceneId, c.instanceId, c.exp, c.passwordChangedAtMs].join(
    "\n"
  );

/** base64url HMAC-SHA256 over the claims: 43 characters. */
export function signStreamLink(c: StreamLinkClaims, key: Buffer): string {
  return createHmac("sha256", key).update(message(c)).digest("base64url");
}

export function isStreamLinkSignatureValid(
  c: StreamLinkClaims,
  sig: string,
  key: Buffer
): boolean {
  const expected = Buffer.from(signStreamLink(c, key));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function buildStreamLinkPath(c: StreamLinkClaims, sig: string): string {
  const q = new URLSearchParams({
    instanceId: c.instanceId,
    uid: String(c.userId),
    exp: String(c.exp),
    sig,
  });
  return `/api/scene/${c.sceneId}/proxy-stream/stream?${q.toString()}`;
}

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

/** The signing key derived from getJwtSecret(), memoized per secret value. */
export function getStreamLinkKey(): Buffer {
  const secret = getJwtSecret();
  if (cachedKey === null || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedKey = deriveStreamLinkKey(secret);
  }
  return cachedKey;
}
