/**
 * redactUrl masks secret query values (Stash API keys, signed-link
 * signatures) before a URL reaches the log, including strings that are not
 * valid URLs.
 */
import { describe, expect, it } from "vitest";
import { SECRET_QUERY_PARAMS, redactUrl } from "../../utils/logRedaction.js";

describe("redactUrl", () => {
  it("masks apikey, api_key, token, sig and signature values", () => {
    expect(redactUrl("http://s:9999/scene/1/preview?apikey=abc&t=5")).toBe(
      "http://s:9999/scene/1/preview?apikey=***&t=5"
    );
    expect(
      redactUrl(
        "http://s/x?api_key=k1&token=k2&sig=k3&signature=k4&resolution=LOW"
      )
    ).toBe(
      "http://s/x?api_key=***&token=***&sig=***&signature=***&resolution=LOW"
    );
    expect(SECRET_QUERY_PARAMS).toEqual([
      "apikey",
      "api_key",
      "token",
      "sig",
      "signature",
    ]);
  });

  it("matches parameter names in any case", () => {
    expect(redactUrl("http://s/x?ApiKey=abc&SIG=def")).toBe(
      "http://s/x?ApiKey=***&SIG=***"
    );
  });

  it("masks them in strings that are not valid URLs", () => {
    expect(redactUrl("/scene/1/stream.mp4?sig=SECRET&exp=1")).toBe(
      "/scene/1/stream.mp4?sig=***&exp=1"
    );
    expect(redactUrl("not a url ?apikey=SECRET")).toBe("not a url ?apikey=***");
    expect(redactUrl("/api/proxy/stash?path=%2Fimage%3Fapikey%3DSECRET")).toBe(
      "/api/proxy/stash?path=%2Fimage%3Fapikey%3D***"
    );
    expect(
      redactUrl("/api/proxy/stash?path=%2Fimage%3Fapikey%3DSECRET%26t%3D5")
    ).toBe("/api/proxy/stash?path=%2Fimage%3Fapikey%3D***%26t%3D5");
  });

  it("leaves a URL without secrets unchanged", () => {
    const url = "http://s:9999/scene/1/stream.m3u8?resolution=720&t=5";
    expect(redactUrl(url)).toBe(url);
    // Names that only contain a secret name are not secrets
    expect(redactUrl("http://s/x?tokens=5&mysig=1")).toBe(
      "http://s/x?tokens=5&mysig=1"
    );
  });
});
