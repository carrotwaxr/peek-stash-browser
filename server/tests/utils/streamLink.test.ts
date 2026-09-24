/**
 * Unit tests for signed external-player links (sweep item 2).
 *
 * A link is an HMAC over its claims with a key derived from the JWT secret
 * under its own label, so it can never pass as a session token and dies
 * with a password change or a secret rotation.
 */
import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJwtSecret } from "../../utils/jwtSecret.js";
import {
  STREAM_LINK_TTL_SECONDS,
  type StreamLinkClaims,
  buildStreamLinkPath,
  deriveStreamLinkKey,
  getStreamLinkKey,
  isStreamLinkSignatureValid,
  signStreamLink,
} from "../../utils/streamLink.js";

const _probe: number = "x";

vi.mock("../../utils/jwtSecret.js", () => ({
  getJwtSecret: vi.fn().mockReturnValue("test-secret"),
}));

const mockGetJwtSecret = vi.mocked(getJwtSecret);

const NOW = new Date("2026-09-23T12:00:00Z");
const SECRET = "test-secret";

describe("streamLink", () => {
  let key: Buffer;
  let claims: StreamLinkClaims;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    key = deriveStreamLinkKey(SECRET);
    claims = {
      userId: 7,
      sceneId: "123",
      instanceId: "inst-a",
      exp: Math.floor(NOW.getTime() / 1000) + STREAM_LINK_TTL_SECONDS,
      passwordChangedAtMs: new Date("2026-09-01T00:00:00Z").getTime(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has a 12 hour TTL", () => {
    expect(STREAM_LINK_TTL_SECONDS).toBe(12 * 60 * 60);
  });

  it("verifies a link it signed", () => {
    const sig = signStreamLink(claims, key);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isStreamLinkSignatureValid(claims, sig, key)).toBe(true);
  });

  it("rejects it when sceneId, instanceId, userId, exp or passwordChangedAtMs differ", () => {
    const sig = signStreamLink(claims, key);
    const changed: Array<Partial<StreamLinkClaims>> = [
      { sceneId: "124" },
      { instanceId: "inst-b" },
      { userId: 8 },
      { exp: claims.exp + 1 },
      { passwordChangedAtMs: claims.passwordChangedAtMs + 1 },
    ];
    for (const change of changed) {
      expect(
        isStreamLinkSignatureValid({ ...claims, ...change }, sig, key),
        JSON.stringify(change)
      ).toBe(false);
    }
  });

  it("rejects a signature made with another key", () => {
    const sig = signStreamLink(claims, deriveStreamLinkKey("other-secret"));
    expect(isStreamLinkSignatureValid(claims, sig, key)).toBe(false);
  });

  it("rejects a tampered signature and a wrong-length one without throwing", () => {
    const sig = signStreamLink(claims, key);
    const last = sig.slice(-1) === "A" ? "B" : "A";
    const tampered = sig.slice(0, -1) + last;
    expect(isStreamLinkSignatureValid(claims, tampered, key)).toBe(false);
    expect(isStreamLinkSignatureValid(claims, sig.slice(0, 20), key)).toBe(
      false
    );
    expect(isStreamLinkSignatureValid(claims, "", key)).toBe(false);
    expect(isStreamLinkSignatureValid(claims, sig + "x", key)).toBe(false);
  });

  it("derives a key that differs from HMAC with the raw secret", () => {
    const message = [
      "v1",
      claims.userId,
      claims.sceneId,
      claims.instanceId,
      claims.exp,
      claims.passwordChangedAtMs,
    ].join("\n");
    const rawHmac = createHmac("sha256", SECRET)
      .update(message)
      .digest("base64url");
    expect(signStreamLink(claims, key)).not.toBe(rawHmac);
    expect(key).toHaveLength(32);
    expect(key.equals(deriveStreamLinkKey(SECRET))).toBe(true);
    expect(key.equals(deriveStreamLinkKey("other-secret"))).toBe(false);
  });

  it("buildStreamLinkPath puts the claims in the query of the direct stream", () => {
    expect(buildStreamLinkPath(claims, "SIG")).toBe(
      "/api/scene/123/proxy-stream/stream?instanceId=inst-a&uid=7&exp=1790208000&sig=SIG"
    );
  });

  it("getStreamLinkKey derives from getJwtSecret and memoizes per secret", () => {
    mockGetJwtSecret.mockClear();
    const first = getStreamLinkKey();
    const second = getStreamLinkKey();
    expect(first.equals(deriveStreamLinkKey(SECRET))).toBe(true);
    expect(second).toBe(first);
    expect(mockGetJwtSecret).toHaveBeenCalledTimes(2);

    mockGetJwtSecret.mockReturnValue("rotated-secret");
    const rotated = getStreamLinkKey();
    expect(rotated.equals(deriveStreamLinkKey("rotated-secret"))).toBe(true);
    expect(rotated.equals(first)).toBe(false);
    mockGetJwtSecret.mockReturnValue(SECRET);
  });
});
