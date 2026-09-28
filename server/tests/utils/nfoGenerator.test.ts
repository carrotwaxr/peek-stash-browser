import { describe, expect, it } from "vitest";
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

  it("details containing ']]>' stay inside the plot", () => {
    const nfo = generateSceneNfo({
      id: "123",
      title: "Test",
      details: "before ]]><evil/> after",
      performerNames: [],
      tagNames: [],
    });

    expect(nfo).toContain(
      "<plot><![CDATA[before ]]]]><![CDATA[><evil/> after]]></plot>"
    );
  });

  it("a date containing '<' is escaped", () => {
    const nfo = generateSceneNfo({
      id: "123",
      title: "Test",
      date: "<2024>-01-15&",
      performerNames: [],
      tagNames: [],
    });

    expect(nfo).toContain("<premiered>&lt;2024&gt;-01-15&amp;</premiered>");
    expect(nfo).toContain("<releasedate>&lt;2024&gt;-01-15&amp;</releasedate>");
    expect(nfo).toContain("<year>&lt;2024&gt;</year>");
    expect(nfo).not.toContain("<2024>");
  });

  it("the id is escaped", () => {
    const nfo = generateSceneNfo({
      id: '1&2"<3>',
      title: "Test",
      performerNames: [],
      tagNames: [],
    });

    expect(nfo).toContain(
      '<uniqueid type="stash">1&amp;2&quot;&lt;3&gt;</uniqueid>'
    );
  });

  it("drops characters XML cannot hold, keeping tabs and line breaks", () => {
    const nfo = generateSceneNfo({
      id: "123",
      title: "a\u0000b\u000bc￾d",
      details: "x\u0001y\tz\nw",
      studioName: "S\u001ft",
      performerNames: ["P\u0008q"],
      tagNames: ["T\u000cu"],
    });

    expect(nfo).toContain("<title>abcd</title>");
    expect(nfo).toContain("<plot><![CDATA[xy\tz\nw]]></plot>");
    expect(nfo).toContain("<studio>St</studio>");
    expect(nfo).toContain("<name>Pq</name>");
    expect(nfo).toContain("<tag>Tu</tag>");
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
