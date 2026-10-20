import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { secureRequestCookie } from "../../utils/secureRequestCookie.js";

const request = (headers: Record<string, string>, secure = false) =>
  ({ secure, get: (name: string) => headers[name.toLowerCase()] }) as Request;
afterEach(() => vi.unstubAllEnvs());
describe("automatic cookie security", () => {
  it("supports local HTTP ports and HTTPS proxies without trusting forwarded headers", () => {
    vi.stubEnv("SECURE_COOKIES", undefined);
    expect(
      secureRequestCookie(
        request({ host: "server:6970", origin: "http://server:6970" })
      )
    ).toBe(false);
    expect(
      secureRequestCookie(
        request({ host: "peek.example", origin: "https://peek.example" })
      )
    ).toBe(true);
    expect(
      secureRequestCookie(
        request({
          host: "peek.example",
          referer: "https://peek.example/settings",
        })
      )
    ).toBe(true);
    expect(
      secureRequestCookie(
        request({
          host: "server:6970",
          "x-forwarded-proto": "https",
          origin: "https://attacker.example",
        })
      )
    ).toBe(false);
  });
  it("keeps explicit administrator cookie policy", () => {
    vi.stubEnv("SECURE_COOKIES", "true");
    expect(secureRequestCookie()).toBe(true);
    vi.stubEnv("SECURE_COOKIES", "false");
    expect(secureRequestCookie(request({}, true))).toBe(false);
  });
});
