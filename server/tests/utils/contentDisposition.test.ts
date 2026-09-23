import http from "http";
import { describe, expect, it } from "vitest";
import { attachmentContentDisposition } from "../../utils/contentDisposition.js";

describe("attachmentContentDisposition", () => {
  it("keeps a plain ASCII name in both parameters", () => {
    expect(attachmentContentDisposition("scene.mp4")).toBe(
      "attachment; filename=\"scene.mp4\"; filename*=UTF-8''scene.mp4"
    );
  });

  it("folds accents and replaces other non-ASCII with _ in the fallback, percent-encodes UTF-8 in filename*", () => {
    expect(attachmentContentDisposition("Kate’s picks 🎬.zip")).toBe(
      "attachment; filename=\"Kate_s picks _.zip\"; filename*=UTF-8''Kate%E2%80%99s%20picks%20%F0%9F%8E%AC.zip"
    );
    expect(attachmentContentDisposition("Café.mp4")).toBe(
      "attachment; filename=\"Cafe.mp4\"; filename*=UTF-8''Caf%C3%A9.mp4"
    );
  });

  it("drops control characters and neutralises quotes and backslashes", () => {
    expect(attachmentContentDisposition('a"b\\c\r\n.mp4')).toBe(
      "attachment; filename=\"a_b_c.mp4\"; filename*=UTF-8''a%22b%5Cc.mp4"
    );
  });

  it("percent-encodes the RFC 8187 non-attr-chars ' ( ) *", () => {
    expect(attachmentContentDisposition("(it's)*.mp4")).toContain(
      "filename*=UTF-8''%28it%27s%29%2A.mp4"
    );
  });

  it("falls back to download for an empty name", () => {
    expect(attachmentContentDisposition("")).toBe(
      "attachment; filename=\"download\"; filename*=UTF-8''download"
    );
  });

  it("always produces a legal header value", () => {
    const names = [
      "scene.mp4",
      "Kate’s picks 🎬.zip",
      "Café.mp4",
      'a"b\\c\r\n.mp4',
      "(it's)*.mp4",
      "",
      "日本語.mp4",
      "🎬",
    ];
    for (const name of names) {
      const value = attachmentContentDisposition(name);
      expect(() =>
        http.validateHeaderValue("Content-Disposition", value)
      ).not.toThrow();
    }
  });
});
