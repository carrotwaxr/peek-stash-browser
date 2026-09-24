/**
 * Unit tests for privateCacheControl (sweep item 2).
 *
 * Media now needs a session, so a shared cache must never store a response
 * for another visitor: `public` is dropped and `private` added unless the
 * value already says private or no-store.
 */
import { describe, expect, it } from "vitest";
import { privateCacheControl } from "../../utils/cacheControl.js";

describe("privateCacheControl", () => {
  it("replaces public with private", () => {
    expect(privateCacheControl("public, max-age=86400", "x")).toBe(
      "private, max-age=86400"
    );
  });

  it("uses the fallback unchanged when upstream sent nothing", () => {
    expect(privateCacheControl(undefined, "private, max-age=86400")).toBe(
      "private, max-age=86400"
    );
    expect(privateCacheControl(null, "private, max-age=86400")).toBe(
      "private, max-age=86400"
    );
  });

  it("prepends private to a value without it", () => {
    expect(privateCacheControl("no-cache", "x")).toBe("private, no-cache");
  });

  it("leaves an already private value unchanged", () => {
    expect(
      privateCacheControl("private, max-age=31536000, immutable", "x")
    ).toBe("private, max-age=31536000, immutable");
  });

  it("leaves no-store unchanged", () => {
    expect(privateCacheControl("no-store", "x")).toBe("no-store");
  });
});
