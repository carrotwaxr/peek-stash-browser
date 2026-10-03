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
  /**
   * Absent for an external-player link (v1, the direct stream only). `media`
   * is a link a player or a Cast receiver can use for one scene's media: the
   * direct stream, HLS, captions and poster (v2).
   */
  scope?: "media";
}

export function deriveStreamLinkKey(jwtSecret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", jwtSecret, Buffer.alloc(0), KEY_INFO, 32)
  );
}

/**
 * Without a scope this is today's v1 join, byte for byte, so links minted
 * before the scope existed still verify (and never widen). A scope signs a
 * different message, so a v1 signature never passes as a media one.
 */
const message = (c: StreamLinkClaims): string =>
  c.scope === undefined
    ? [
        "v1",
        c.userId,
        c.sceneId,
        c.instanceId,
        c.exp,
        c.passwordChangedAtMs,
      ].join("\n")
    : [
        "v2",
        c.scope,
        c.userId,
        c.sceneId,
        c.instanceId,
        c.exp,
        c.passwordChangedAtMs,
      ].join("\n");

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

/**
 * The signed query: `instanceId`, `uid`, `exp`, `scope` (only when set) and
 * `sig`, in that order. Nothing else builds one.
 */
export function signedQuery(c: StreamLinkClaims, sig: string): URLSearchParams {
  return buildSignedQuery(c.instanceId, c.userId, c.exp, c.scope, sig);
}

/** The claims of a request whose signature the guard verified. */
export interface VerifiedStreamLink {
  uid: number;
  exp: number;
  scope: StreamLinkClaims["scope"];
  sig: string;
}

/**
 * The signed query for the URLs a verified request's playlist lists: the
 * same query as `signedQuery`, built from the verified fields and the
 * request's instance. It signs nothing, so it needs no password stamp.
 */
export function signedQueryOf(
  link: VerifiedStreamLink,
  instanceId: string
): URLSearchParams {
  return buildSignedQuery(instanceId, link.uid, link.exp, link.scope, link.sig);
}

function buildSignedQuery(
  instanceId: string,
  userId: number,
  exp: number,
  scope: StreamLinkClaims["scope"],
  sig: string
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("instanceId", instanceId);
  q.set("uid", String(userId));
  q.set("exp", String(exp));
  if (scope !== undefined) q.set("scope", scope);
  q.set("sig", sig);
  return q;
}

/**
 * Merge a signed query into a URL's parameters with `set`, never append: the
 * URL often holds `instanceId` already, and a repeated key is refused.
 */
export function applySignedQuery(
  params: URLSearchParams,
  signed: URLSearchParams
): void {
  for (const [key, value] of signed) params.set(key, value);
}

export function buildStreamLinkPath(c: StreamLinkClaims, sig: string): string {
  const q = signedQuery(c, sig);
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
