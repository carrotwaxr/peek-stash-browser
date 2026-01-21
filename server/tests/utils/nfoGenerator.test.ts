import { describe, it, expect } from "vitest";
import { generateSceneNfo } from "../../utils/nfoGenerator.js";

describe("generateSceneNfo", () => {
  it("should generate valid XML with scene metadata", () => {
    const scene = {
      id: "123",
      title: "Test Scene",
      details: "A test description",
      date: "2024-01-15",
      rating100: 85,
      studioName: "Test Studio",
      performerNames: ["Performer One", "Performer Two"],
      tagNames: ["tag1", "tag2"],
    };

    const nfo = generateSceneNfo(scene);

    expect(nfo).toContain('<?xml version="1.0" encoding="utf-8"');
    expect(nfo).toContain("<title>Test Scene</title>");
    expect(nfo).toContain("<plot><![CDATA[A test description]]></plot>");
    expect(nfo).toContain("<premiered>2024-01-15</premiered>");
    expect(nfo).toContain("<year>2024</year>");
    expect(nfo).toContain("<studio>Test Studio</studio>");
    expect(nfo).toContain("<rating>8</rating>");
    expect(nfo).toContain("<criticrating>85</criticrating>");
    expect(nfo).toContain('<uniqueid type="stash">123</uniqueid>');
  });

  it("should include performers as actors", () => {
    const scene = {
      id: "123",
      title: "Test",
      performerNames: ["Alice", "Bob"],
      tagNames: [],
    };

    const nfo = generateSceneNfo(scene);

    expect(nfo).toContain("<name>Alice</name>");
    expect(nfo).toContain("<order>0</order>");
    expect(nfo).toContain("<name>Bob</name>");
    expect(nfo).toContain("<order>1</order>");
  });

  it("should include tags", () => {
    const scene = {
      id: "123",
      title: "Test",
      performerNames: [],
      tagNames: ["Action", "Drama"],
    };

    const nfo = generateSceneNfo(scene);

    expect(nfo).toContain("<tag>Action</tag>");
    expect(nfo).toContain("<tag>Drama</tag>");
  });

  it("should escape XML special characters", () => {
    const scene = {
      id: "123",
      title: "Test & <Script>",
      details: 'Quote "test" here',
      performerNames: [],
      tagNames: [],
    };

    const nfo = generateSceneNfo(scene);

    expect(nfo).toContain("<title>Test &amp; &lt;Script&gt;</title>");
    expect(nfo).not.toContain("<Script>");
  });

  it("should handle missing optional fields", () => {
    const scene = {
      id: "123",
      title: null,
      details: null,
      date: null,
      rating100: null,
      studioName: null,
      performerNames: [],
      tagNames: [],
      fileName: "video.mp4",
    };

    const nfo = generateSceneNfo(scene);

    expect(nfo).toContain("<title>video.mp4</title>");
    expect(nfo).toContain("<plot><![CDATA[]]></plot>");
    expect(nfo).toContain("<studio></studio>");
  });
});
