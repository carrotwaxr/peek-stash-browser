/**
 * A tab can cast only in a secure context (Chromecast needs HTTPS) of a
 * Chromium browser; anywhere else `useCast` loads no cast code and never
 * Google's script.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { canCast } from "@/components/video-player/cast/castSupport";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADLESS_UA = CHROME_UA.replace("Chrome/", "HeadlessChrome/");
const EDGE_UA = `${CHROME_UA} Edg/130.0.0.0`;
const CRIOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const FIREFOX_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function setEnvironment(secure: boolean, userAgent: string) {
  vi.stubGlobal("isSecureContext", secure);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
}

describe("canCast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a secure Chrome tab can cast", () => {
    setEnvironment(true, CHROME_UA);
    expect(canCast()).toBe(true);
  });

  it("an insecure context cannot", () => {
    setEnvironment(false, CHROME_UA);
    expect(canCast()).toBe(false);
  });

  it("a HeadlessChrome UA can (the E2E browser)", () => {
    setEnvironment(true, HEADLESS_UA);
    expect(canCast()).toBe(true);
  });

  it("an Edg UA can", () => {
    setEnvironment(true, EDGE_UA);
    expect(canCast()).toBe(true);
  });

  it.each([
    ["Firefox", FIREFOX_UA],
    ["Safari", SAFARI_UA],
    ["CriOS (WebKit on iOS)", CRIOS_UA],
  ])("%s cannot", (_name, userAgent) => {
    setEnvironment(true, userAgent);
    expect(canCast()).toBe(false);
  });
});
