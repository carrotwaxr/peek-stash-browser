/**
 * Unit tests for the media path allowlist (sweep item 2).
 *
 * The proxies accept only Stash's media routes for the eight entity types,
 * keyed by numeric id, and only the `t` and `default` query keys. Anything
 * else (GraphQL, traversal, hash-keyed sprites, streams) is refused before
 * an upstream request is built.
 */
import { describe, expect, it } from "vitest";
import {
  INSTANCE_ID_PATTERN,
  SCENE_ID_PATTERN,
  isAllowedCaption,
  isAllowedStreamPath,
  parseStashMediaPath,
  pickStreamQuery,
} from "../../utils/stashMediaPath.js";

describe("parseStashMediaPath", () => {
  it.each([
    [
      "/scene/12/screenshot?t=1780427975",
      [{ entityType: "scene", entityId: "12" }],
      "t=1780427975",
    ],
    ["/scene/12/preview", [{ entityType: "scene", entityId: "12" }], ""],
    ["/scene/12/webp", [{ entityType: "scene", entityId: "12" }], ""],
    ["/scene/12/vtt/thumbs", [{ entityType: "scene", entityId: "12" }], ""],
    ["/scene/12/vtt/sprite", [{ entityType: "scene", entityId: "12" }], ""],
    ["/scene/12/vtt/chapter", [{ entityType: "scene", entityId: "12" }], ""],
    [
      "/scene/2587/scene_marker/429/screenshot",
      [
        { entityType: "scene", entityId: "2587" },
        { entityType: "clip", entityId: "429" },
      ],
      "",
    ],
    [
      "/scene/2587/scene_marker/429/preview",
      [
        { entityType: "scene", entityId: "2587" },
        { entityType: "clip", entityId: "429" },
      ],
      "",
    ],
    [
      "/scene/2587/scene_marker/429/stream",
      [
        { entityType: "scene", entityId: "2587" },
        { entityType: "clip", entityId: "429" },
      ],
      "",
    ],
    [
      "/performer/6225/image?t=1771565524&default=true",
      [{ entityType: "performer", entityId: "6225" }],
      "t=1771565524&default=true",
    ],
    [
      "/studio/874/image?t=1",
      [{ entityType: "studio", entityId: "874" }],
      "t=1",
    ],
    ["/tag/193/image", [{ entityType: "tag", entityId: "193" }], ""],
    [
      "/group/131/frontimage?t=1&default=true",
      [{ entityType: "group", entityId: "131" }],
      "t=1&default=true",
    ],
    ["/group/32/backimage", [{ entityType: "group", entityId: "32" }], ""],
    [
      "/gallery/5/cover?t=1761756397",
      [{ entityType: "gallery", entityId: "5" }],
      "t=1761756397",
    ],
    ["/image/1/thumbnail", [{ entityType: "image", entityId: "1" }], ""],
    ["/image/1/preview", [{ entityType: "image", entityId: "1" }], ""],
    ["/image/1/image?t=1", [{ entityType: "image", entityId: "1" }], "t=1"],
  ])("accepts %s", (raw, entities, search) => {
    const target = parseStashMediaPath(raw);
    expect(target).not.toBeNull();
    expect(target!.pathname).toBe(raw.split("?")[0]);
    expect(target!.entities).toEqual(entities);
    expect(target!.search.toString()).toBe(search);
  });

  it.each([
    "/graphql?query={version{version}}",
    "/graphql",
    "/scene/1/../../graphql",
    "/scene/1/%2e%2e/graphql",
    "//evil.test/scene/1/screenshot",
    "\\scene\\1\\screenshot",
    "/scene/abc/screenshot",
    "/scene/1/stream",
    "/scene/1/stream.m3u8",
    "/scene/54d60970d229e3a3_sprite.jpg",
    "/scene/54d60970d229e3a3_thumbs.vtt",
    "/scene/1/caption",
    "/downloads/abc",
    "/scene/1/screenshot#frag",
    "scene/1/screenshot",
    "/performer/1/image/../../graphql",
  ])("rejects %s", (raw) => {
    expect(parseStashMediaPath(raw)).toBeNull();
  });

  it("drops every query key except t and default", () => {
    const target = parseStashMediaPath(
      "/scene/1/screenshot?t=5&apikey=evil&x=1&default=maybe"
    );
    expect(target).not.toBeNull();
    expect(target!.search.toString()).toBe("t=5");
  });

  it("rejects control characters and a non-numeric t", () => {
    expect(parseStashMediaPath("/scene/1/screenshot\n")).toBeNull();
    expect(parseStashMediaPath("/scene/1/screenshot?t=abc")!.search.size).toBe(
      0
    );
  });
});

describe("isAllowedStreamPath", () => {
  it.each([
    ["stream", undefined],
    ["stream.mp4", undefined],
    ["stream.webm", undefined],
    ["stream.mkv", undefined],
    ["stream.m3u8", undefined],
    ["stream.mpd", undefined],
    ["stream.m3u8", "0.ts"],
    ["stream.m3u8", "123.ts"],
  ])("accepts %s / %s", (streamPath, subPath) => {
    expect(isAllowedStreamPath(streamPath, subPath)).toBe(true);
  });

  it.each([
    ["../../graphql?query=x", undefined],
    ["stream/../../graphql", undefined],
    ["stream", "segment_0.ts"],
    ["stream.mpd", "0_v.webm"],
    ["stream.m3u8", "../0.ts"],
    ["segment_0.ts", undefined],
    ["stream.m3u8?x", undefined],
  ])("rejects %s / %s", (streamPath, subPath) => {
    expect(isAllowedStreamPath(streamPath, subPath)).toBe(false);
  });
});

describe("pickStreamQuery", () => {
  it("keeps resolution and start only", () => {
    const picked = pickStreamQuery(
      new URLSearchParams(
        "resolution=LOW&start=12.5&instanceId=inst-a&uid=7&exp=1&sig=abc&apikey=evil&foo=bar"
      )
    );
    expect(picked.toString()).toBe("resolution=LOW&start=12.5");
  });

  it.each(["ORIGINAL", "FOUR_K", "FULL_HD", "STANDARD_HD", "STANDARD", "LOW"])(
    "keeps resolution %s",
    (resolution) => {
      const picked = pickStreamQuery(new URLSearchParams({ resolution }));
      expect(picked.get("resolution")).toBe(resolution);
    }
  );

  it("drops resolution=EVIL and a non-numeric start", () => {
    const picked = pickStreamQuery(
      new URLSearchParams("resolution=EVIL&start=12.5.1")
    );
    expect(picked.toString()).toBe("");
    expect(pickStreamQuery(new URLSearchParams("start=42")).toString()).toBe(
      "start=42"
    );
  });
});

describe("isAllowedCaption", () => {
  it("accepts a short language code with srt or vtt", () => {
    expect(isAllowedCaption("en", "srt")).toBe(true);
    expect(isAllowedCaption("pt-BR", "vtt")).toBe(true);
    expect(isAllowedCaption("zh_Hant", "srt")).toBe(true);
  });

  it("rejects other types and languages with separators", () => {
    expect(isAllowedCaption("en", "ass")).toBe(false);
    expect(isAllowedCaption("en&admin=1", "srt")).toBe(false);
    expect(isAllowedCaption("", "srt")).toBe(false);
    expect(isAllowedCaption("a".repeat(17), "srt")).toBe(false);
  });
});

describe("id patterns", () => {
  it("SCENE_ID_PATTERN admits digits only", () => {
    expect(SCENE_ID_PATTERN.test("123")).toBe(true);
    expect(SCENE_ID_PATTERN.test("12a")).toBe(false);
    expect(SCENE_ID_PATTERN.test("")).toBe(false);
  });

  it("INSTANCE_ID_PATTERN admits cuid-like ids up to 64 chars", () => {
    expect(INSTANCE_ID_PATTERN.test("cmfxyz123_-A")).toBe(true);
    expect(INSTANCE_ID_PATTERN.test("a".repeat(64))).toBe(true);
    expect(INSTANCE_ID_PATTERN.test("a".repeat(65))).toBe(false);
    expect(INSTANCE_ID_PATTERN.test("inst a")).toBe(false);
    expect(INSTANCE_ID_PATTERN.test("")).toBe(false);
  });
});
