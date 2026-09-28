/**
 * Unit tests for toProxyUrl (item 77): the one helper that turns a Stash
 * media URL or path into Peek's proxy path, always naming the instance that
 * serves it. The cases from the old copies (UserStatsAggregationService's
 * exported transformUrl, ClipService's private one) live here now.
 */
import { describe, expect, it } from "vitest";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { untrusted } from "../helpers/untrusted.js";

const proxied = (pathWithQuery: string, instanceId = "inst-a") =>
  `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}&instanceId=${encodeURIComponent(instanceId)}`;

describe("toProxyUrl", () => {
  it.each<{
    name: string;
    input: string | null;
    instanceId?: string;
    expected: string | null;
  }>([
    { name: "null", input: null, expected: null },
    { name: "empty text", input: "", expected: null },
    {
      name: "an existing proxy path, as is",
      input: "/api/proxy/stash?path=x",
      expected: "/api/proxy/stash?path=x",
    },
    {
      name: "an existing proxy path with an instance, as is",
      input: "/api/proxy/stash?path=%2Fscene%2F123%2Fscreenshot&instanceId=b",
      expected:
        "/api/proxy/stash?path=%2Fscene%2F123%2Fscreenshot&instanceId=b",
    },
    {
      name: "an http URL: its path and query",
      input: "http://stash:9999/scene/1/screenshot?t=5",
      expected:
        "/api/proxy/stash?path=%2Fscene%2F1%2Fscreenshot%3Ft%3D5&instanceId=inst-a",
    },
    {
      name: "an https URL: its path and query",
      input: "https://stash.example.com/scene/1/screenshot?t=5",
      expected:
        "/api/proxy/stash?path=%2Fscene%2F1%2Fscreenshot%3Ft%3D5&instanceId=inst-a",
    },
    {
      name: "a URL with an IP and a port",
      input: "http://192.168.1.100:9999/performer/456/image",
      expected: proxied("/performer/456/image"),
    },
    {
      name: "a URL's fragment is dropped",
      input: "http://stash:9999/scene/1/screenshot?t=5#frag",
      expected: proxied("/scene/1/screenshot?t=5"),
    },
    {
      name: "an unparsable URL, encoded as a path",
      input: "http://[bad",
      expected: "/api/proxy/stash?path=http%3A%2F%2F%5Bbad&instanceId=inst-a",
    },
    {
      name: "a path, encoded",
      input: "/image/3/thumbnail",
      expected:
        "/api/proxy/stash?path=%2Fimage%2F3%2Fthumbnail&instanceId=inst-a",
    },
    {
      name: "a scene screenshot path",
      input: "/scene/123/screenshot",
      expected: proxied("/scene/123/screenshot"),
    },
    {
      name: "a performer image path",
      input: "/performer/abc-123/image",
      expected: proxied("/performer/abc-123/image"),
    },
    {
      name: "a studio image path",
      input: "/studio/studio-id/image",
      expected: proxied("/studio/studio-id/image"),
    },
    {
      name: "a tag image path",
      input: "/tag/tag-id/image",
      expected: proxied("/tag/tag-id/image"),
    },
    {
      name: "a path whose query is not Stash's key keeps it",
      input: "/scene/123/screenshot?api_key=secret&t=123",
      expected: proxied("/scene/123/screenshot?api_key=secret&t=123"),
    },
    {
      name: "the instance is encoded",
      input: "/image/3/thumbnail",
      instanceId: "a b",
      expected:
        "/api/proxy/stash?path=%2Fimage%2F3%2Fthumbnail&instanceId=a%20b",
    },
    {
      name: "`default` is an ordinary instance id",
      input: "/x",
      instanceId: "default",
      expected: `/api/proxy/stash?path=${encodeURIComponent("/x")}&instanceId=default`,
    },
    {
      name: "another instance id",
      input: "/x",
      instanceId: "instance-2",
      expected: `/api/proxy/stash?path=${encodeURIComponent("/x")}&instanceId=instance-2`,
    },
    {
      name: "a URL's apikey is dropped, the rest of its query kept",
      input: "http://stash:9999/scene/1/screenshot?apikey=K&t=1",
      expected: proxied("/scene/1/screenshot?t=1"),
    },
    {
      name: "a URL's apikey is dropped in any case and position",
      input: "http://stash:9999/scene/1/screenshot?t=1&ApiKey=K",
      expected: proxied("/scene/1/screenshot?t=1"),
    },
    {
      name: "a path's apikey is dropped",
      input: "/scene/1/screenshot?APIKEY=K&t=1",
      expected: proxied("/scene/1/screenshot?t=1"),
    },
    {
      name: "a query holding only the apikey goes with it",
      input: "http://stash:9999/performer/2/image?apikey=K",
      expected: proxied("/performer/2/image"),
    },
    {
      name: "an unparsable URL's apikey is dropped",
      input: "http://[bad/x?apikey=K",
      expected: proxied("http://[bad/x"),
    },
  ])("$name", ({ input, instanceId, expected }) => {
    expect(toProxyUrl(input, instanceId ?? "inst-a")).toBe(expected);
  });

  it("reads a column a row lacks (undefined) as null", () => {
    expect(toProxyUrl(untrusted(undefined), "inst-a")).toBeNull();
  });

  it("never names Stash's host or key, and always answers a Peek path", () => {
    const inputs = [
      "http://stash:9999/scene/1/screenshot?t=5",
      "https://stash:9999/scene/1/preview",
      "http://stash:9999/scene/1/screenshot?apikey=SECRET&t=1",
      "http://stash:9999/scene/1/screenshot?t=1&apiKey=SECRET",
      "/scene/1/screenshot?APIKEY=SECRET",
    ];
    for (const input of inputs) {
      const out = toProxyUrl(input, "inst-a");
      expect(out, input).toMatch(/^\/api\/proxy\/stash\?path=/);
      expect(out, input).not.toMatch(/stash:9999|SECRET|apikey/i);
    }
  });
});
