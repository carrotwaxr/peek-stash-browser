/**
 * The base path Peek is served under, read once from the meta tag the
 * container writes into index.html.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setMeta(content: string | null) {
  document.head.querySelector('meta[name="peek-base-path"]')?.remove();
  if (content === null) return;
  const meta = document.createElement("meta");
  meta.name = "peek-base-path";
  meta.content = content;
  document.head.appendChild(meta);
}

async function load(content: string | null) {
  setMeta(content);
  vi.resetModules();
  return import("@/utils/basePath");
}

describe("basePath", () => {
  beforeEach(() => setMeta(null));
  afterEach(() => setMeta(null));

  it("reads /peek from the meta tag", async () => {
    const { BASE_PATH, API_PATH, withBase, stripBase } = await load("/peek");

    expect(BASE_PATH).toBe("/peek");
    expect(API_PATH).toBe("/peek/api");
    expect(withBase("/api/x")).toBe("/peek/api/x");
    expect(withBase("/")).toBe("/peek/");
    expect(withBase("https://example.com/a")).toBe("https://example.com/a");
    expect(stripBase("/peek/scenes")).toBe("/scenes");
    expect(stripBase("/peek")).toBe("/");
    expect(stripBase("/peekaboo")).toBe("/peekaboo");
    expect(stripBase("/other")).toBe("/other");
  });

  it("normalises a trailing slash and whitespace", async () => {
    expect((await load(" /a/b/ ")).BASE_PATH).toBe("/a/b");
  });

  it.each([
    ["no meta tag", null],
    ["empty content", ""],
    ["a lone slash", "/"],
    ["a protocol-relative URL", "//evil.com"],
    ["a javascript URL", "javascript:x"],
    ["a dot segment", "/a/./b"],
    ["a parent segment", "/a/../b"],
    ["no leading slash", "peek"],
    ["a query", "/peek?x=1"],
  ])("falls back to no prefix for %s", async (_name, content) => {
    const { BASE_PATH, API_PATH, withBase, stripBase } = await load(content);

    expect(BASE_PATH).toBe("");
    expect(API_PATH).toBe("/api");
    expect(withBase("/api/x")).toBe("/api/x");
    expect(stripBase("/scenes")).toBe("/scenes");
  });
});
