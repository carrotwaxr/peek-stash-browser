/**
 * npm run fixtures:record (sweep item 83) keeps only the shape of the test
 * Stash, regenerates the fixture from it, and checks every output file
 * against the source values it holds before writing anything. These tests
 * feed it hand-built raw Stash answers (rawStash.ts), with no network, and
 * write only into a temporary directory.
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RawStash,
  type StashRequest,
  collectSources,
  guardFixture,
  main,
  recordTarget,
  sendQuery,
} from "../../../integration/stash-replay/record.js";
import { must } from "../../helpers/must.js";
import { fakeStash, rawStash } from "./rawStash.js";
import { OWNER_TEST_ENTITIES, testStashShape } from "./shapeFixture.js";

const TEST_URL = "http://192.0.2.10:9999/graphql";
const TEST_KEY = "raw-test-key-7f3a91";
const TEST_ENV = {
  fileEnv: { STASH_TEST_URL: TEST_URL, STASH_TEST_API_KEY: TEST_KEY },
  shellEnv: {},
};
const SUMMARY =
  "shape: 16 scenes, 11 performers, 10 studios, 11 tags, 1 group, 2 galleries, 6 images, 0 clips; library after extension: 36 scenes, 11 performers, 10 studios, 11 tags, 1 group, 2 galleries, 9 images, 2 clips; guard: clean (0 source strings exempt as repo text)";
const FILES = ["library.json", "manifest.ts", "shape.json"];

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "stash-replay-record-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function logTo(lines: string[]) {
  return (line: string) => {
    lines.push(line);
  };
}

function readOut(name: string): string {
  return readFileSync(path.join(dir, name), "utf8");
}

/** The string leaves of a value, array elements included. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

/** Numbers under `key` anywhere in a value. */
function numbersAt(value: unknown, key: string): number[] {
  if (Array.isArray(value))
    return value.flatMap((item) => numbersAt(item, key));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([name, child]) =>
    name === key && typeof child === "number" ? [child] : numbersAt(child, key)
  );
}

/**
 * A small raw test Stash for the guard: one scene with a file, a performer
 * with a stash id, two tags.
 */
function guardRaw(): RawStash {
  return {
    version: {
      version: "v0.31.1",
      hash: "9c4e1a7b",
      build_time: "2025-11-02 10:00:00",
    },
    configuration: {
      general: {
        stashes: [
          {
            path: "/data/hidden-library",
            excludeVideo: false,
            excludeImage: false,
          },
        ],
      },
    },
    entities: {
      scene: [
        {
          id: "3",
          title: "Midnight Harbor Rendezvous",
          details: "Filmed on location at a private villa",
          created_at: "2021-06-15T10:11:12-07:00",
          paths: {
            screenshot:
              "http://192.0.2.10:9999/scene/3/screenshot?t=1712345678",
          },
          files: [
            {
              basename: "midnight-harbor-2160p.mp4",
              path: "/data/hidden-library/midnight-harbor-2160p.mp4",
              size: 734003200,
              width: 3840,
              height: 2160,
              fingerprints: [
                { type: "oshash", value: "8f3a1c2b9d4e5f60" },
                { type: "phash", value: "c3d2e1f0a9b8c7d6" },
              ],
            },
          ],
          sceneStreams: [
            { label: "Direct stream" },
            { label: "MP4 Full HD (1080p)" },
          ],
          performers: [{ id: "6" }],
          tags: [{ id: "1" }, { id: "2" }],
        },
      ],
      performer: [
        {
          id: "6",
          name: "Juniper Vale",
          gender: "FEMALE",
          circumcised: "UNCUT",
          height_cm: 172,
          stash_ids: [
            {
              endpoint: "https://stashbox.example/graphql",
              stash_id: "5b0c9a3e-1f2d-4c6b-8a7e-9d0f1e2a3b4c",
            },
          ],
        },
      ],
      studio: [],
      tag: [
        { id: "1", name: "Harborside" },
        { id: "2", name: "Lantern Glow" },
      ],
      group: [],
      gallery: [],
      image: [],
      clip: [],
    },
  };
}

/** The guard's lines for a library.json holding these entities. */
function guardLibrary(entities: Record<string, unknown[]>): string[] {
  const library = {
    stash: { version: {}, configuration: {} },
    entities: {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
      group: [],
      gallery: [],
      image: [],
      clip: [],
      ...entities,
    },
  };
  return guardFixture(collectSources(guardRaw()), {
    "library.json": JSON.stringify(library, null, 2),
  });
}

describe("fixtures:record", () => {
  it("shape.json holds new ids, relations, presence and lengths, and no source value", async () => {
    const raw = rawStash(testStashShape());
    const sent: string[] = [];
    const lines: string[] = [];

    const code = await main([], {
      env: TEST_ENV,
      request: () => fakeStash(raw, sent),
      outDir: dir,
      log: logTo(lines),
    });

    expect(lines).toEqual([
      "fixtures:record: reading the test Stash at http://192.0.2.10:9999",
      SUMMARY,
    ]);
    expect(code).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(FILES);
    // Every type fetched whole, plus Version and Configuration
    expect(sent).toHaveLength(10);
    expect(sent.filter((document) => document.startsWith("query "))).toEqual(
      sent
    );
    expect(
      sent.filter((document) => document.includes("per_page: -1"))
    ).toHaveLength(8);

    // The recorded shape is the hand-built one: new ids (source + 100000),
    // relations as new ids, presence and list lengths
    const shape: unknown = JSON.parse(readOut("shape.json"));
    expect(shape).toEqual(testStashShape());
    const manifest = readOut("manifest.ts");
    for (const [key, id] of Object.entries(OWNER_TEST_ENTITIES)) {
      expect(manifest).toContain(`  ${key}: ${JSON.stringify(id)},`);
    }

    // No source string, date or measurement in any written file
    const written = FILES.map(readOut).join("\n").toLowerCase();
    const sourceStrings = strings(raw).filter(
      (value) =>
        value.length >= 4 &&
        !["FEMALE", "MALE", "oshash", "phash"].includes(value) &&
        !value.startsWith("MP4") &&
        !value.startsWith("WEBM") &&
        !value.startsWith("HLS") &&
        !["Direct stream", "DASH"].includes(value)
    );
    expect(sourceStrings.length).toBeGreaterThan(500);
    expect(
      sourceStrings.filter((value) => written.includes(value.toLowerCase()))
    ).toEqual([]);
    const dates = sourceStrings.flatMap(
      (value) => value.match(/\d{4}-\d{2}-\d{2}/g) ?? []
    );
    expect(dates.length).toBeGreaterThan(100);
    expect(dates.filter((date) => written.includes(date))).toEqual([]);
    const sizes = numbersAt(raw, "size");
    expect(sizes.length).toBeGreaterThan(20);
    expect(sizes.filter((size) => written.includes(String(size)))).toEqual([]);
  });

  it("--check exits 1 when a file would change, and writes nothing", async () => {
    const raw = rawStash(testStashShape());
    const run = (argv: string[], lines: string[] = []) =>
      main(argv, {
        env: TEST_ENV,
        request: () => fakeStash(raw),
        outDir: dir,
        log: logTo(lines),
      });

    const lines: string[] = [];
    expect(await run(["--check"], lines)).toBe(1);
    expect(lines.join("\n")).toContain(
      "library.json, manifest.ts, shape.json would change"
    );
    expect(readdirSync(dir)).toEqual([]);

    expect(await run([])).toBe(0);
    expect(await run(["--check"])).toBe(0);
    writeFileSync(path.join(dir, "shape.json"), "{}\n");
    expect(await run(["--check"])).toBe(1);
    expect(readOut("shape.json")).toBe("{}\n");
    expect(await run(["--unknown"])).toBe(2);
  });

  describe("the guard fails, printing JSON paths and never the values, when the output contains", () => {
    it("a source free-text string", async () => {
      const lines = guardLibrary({
        scene: [
          {
            id: "100003",
            details: "Scene 100003 Filmed on location at a private villa",
          },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].details: contains a source string (scene[0].details)",
      ]);

      // Through the command: a source string the generator happens to
      // produce (another scene's synthetic title) stops it, and nothing is
      // written
      const raw = rawStash(testStashShape());
      must(raw.entities.scene[0]).details = "Scene 100002";
      const logged: string[] = [];
      const code = await main([], {
        env: TEST_ENV,
        request: () => fakeStash(raw),
        outDir: dir,
        log: logTo(logged),
      });
      expect(code).toBe(1);
      expect(readdirSync(dir)).toEqual([]);
      const output = logged.join("\n");
      expect(output).toContain(
        "library.json:entities.scene[1].title: contains a source string (scene[0].details)"
      );
      expect(output).toContain("nothing was written");
      expect(output.toLowerCase()).not.toContain("scene 100002");
    });

    it("a source title, in a different letter case", () => {
      const lines = guardLibrary({
        gallery: [{ id: "100001", title: "MIDNIGHT HARBOR RENDEZVOUS" }],
      });
      expect(lines).toEqual([
        "library.json:entities.gallery[0].title: contains a source string (scene[0].title)",
      ]);
      expect(lines.join("\n").toLowerCase()).not.toContain("midnight");
    });

    it("a source file basename", () => {
      const lines = guardLibrary({
        scene: [
          {
            id: "100003",
            files: [{ path: "/library/videos/midnight-harbor-2160p.mp4" }],
          },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].files[0].path: contains a source string (scene[0].files[0].basename)",
      ]);
      expect(lines.join("\n")).not.toContain("midnight");
    });

    it("a source fingerprint", () => {
      const lines = guardLibrary({
        scene: [
          {
            id: "100003",
            files: [
              {
                fingerprints: [{ type: "oshash", value: "8F3A1C2B9D4E5F60" }],
              },
            ],
          },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].files[0].fingerprints[0].value: contains a source string (scene[0].files[0].fingerprints[0].value)",
      ]);
      expect(lines.join("\n").toLowerCase()).not.toContain("8f3a1c2b");
    });

    it("a source stash_id", () => {
      const lines = guardLibrary({
        performer: [
          {
            id: "100006",
            stash_ids: [
              {
                endpoint: "https://stashbox.invalid/graphql",
                stash_id: "5b0c9a3e-1f2d-4c6b-8a7e-9d0f1e2a3b4c",
              },
            ],
          },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.performer[0].stash_ids[0].stash_id: contains a source string (performer[0].stash_ids[0].stash_id)",
      ]);
      expect(lines.join("\n")).not.toContain("5b0c9a3e");
    });

    it("a source date", () => {
      // The date of a source timestamp, in a date field
      const lines = guardLibrary({
        scene: [{ id: "100003", date: "2021-06-15" }],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].date: contains a source date (scene[0].created_at)",
      ]);
      expect(lines.join("\n")).not.toContain("2021");
    });

    it("a source measurement, such as a file size or a height", () => {
      const lines = guardLibrary({
        scene: [
          {
            id: "100003",
            files: [{ size: 734003200, height: 1083 }],
            code: "Scene 100003 code 734003200",
          },
        ],
        performer: [
          // A count equal to a measurement is not one
          { id: "100006", height_cm: 172, scene_count: 172 },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].files[0].size: equals a source measurement (scene[0].files[0].size)",
        "library.json:entities.scene[0].code: contains a source measurement (scene[0].files[0].size)",
        "library.json:entities.performer[0].height_cm: equals a source measurement (performer[0].height_cm)",
      ]);
      const output = lines.join("\n");
      expect(output).not.toContain("734003200");
      expect(output).not.toContain("172");
    });

    it("a source t= stamp inside a URL", () => {
      const lines = guardLibrary({
        scene: [
          {
            id: "100003",
            paths: {
              screenshot:
                "{{STASH_ORIGIN}}/scene/100003/screenshot?t=1712345678",
            },
          },
        ],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].paths.screenshot: contains a source measurement (scene[0].paths.screenshot)",
      ]);
      expect(lines.join("\n")).not.toContain("1712345678");
    });

    it("a source id of the same type", () => {
      const lines = guardLibrary({
        // Scene 3 and performer 6 are source ids; tag 3 is not
        scene: [{ id: "3", performers: [{ id: "6" }], tags: [{ id: "3" }] }],
      });
      expect(lines).toEqual([
        "library.json:entities.scene[0].id: equals a source scene id (scene[0].id)",
        "library.json:entities.scene[0].performers[0].id: equals a source performer id (scene[0].performers[0].id)",
      ]);
    });
  });

  it("enum values and stream labels are exempt", () => {
    const sources = collectSources(guardRaw());
    const library = {
      stash: { version: {}, configuration: {} },
      entities: {
        scene: [
          {
            id: "100003",
            files: [
              {
                fingerprints: [
                  { type: "oshash", value: "0123456789abcdef" },
                  { type: "phash", value: "fedcba9876543210" },
                ],
              },
            ],
            sceneStreams: [
              { label: "Direct stream" },
              { label: "MP4 Full HD (1080p)" },
            ],
            performers: [{ id: "100006", gender: "FEMALE" }],
          },
        ],
        performer: [{ id: "100006", gender: "FEMALE", circumcised: "UNCUT" }],
      },
    };
    const shape = {
      fields: { scene: ["files.fingerprints.type"] },
      entities: {
        scene: [
          {
            id: "100003",
            present: [],
            relations: {},
            lengths: { sceneStreams: 2 },
            files: [{ present: [], fingerprints: ["oshash", "phash"] }],
          },
        ],
      },
    };
    expect(
      guardFixture(sources, {
        "library.json": JSON.stringify(library),
        "shape.json": JSON.stringify(shape),
      })
    ).toEqual([]);
  });

  it("a source string that is part of a selected field name is exempt", async () => {
    const raw = guardRaw();
    must(raw.entities.performer[0]).fake_tits = "Fake";
    const sources = collectSources(raw);
    expect(sources.exempt).toBe(1);
    const library = {
      stash: { version: {}, configuration: {} },
      entities: {
        performer: [{ id: "100006", fake_tits: "fake_tits 3" }],
      },
    };
    const shape = { fields: { performer: ["fake_tits"] }, entities: {} };
    expect(
      guardFixture(sources, {
        "library.json": JSON.stringify(library),
        "shape.json": JSON.stringify(shape),
      })
    ).toEqual([]);

    // Through the command: counted in the summary, never named
    const recorded = rawStash(testStashShape());
    for (const performer of recorded.entities.performer) {
      performer.fake_tits = "Fake";
    }
    const lines: string[] = [];
    const code = await main([], {
      env: TEST_ENV,
      request: () => fakeStash(recorded),
      outDir: dir,
      log: logTo(lines),
    });
    expect(lines[1]).toBe(
      SUMMARY.replace("(0 source strings", "(1 source string")
    );
    expect(code).toBe(0);
  });

  it("a source string inside synth.ts's fixed text is exempt", () => {
    const raw = guardRaw();
    raw.configuration = {
      general: {
        stashes: [
          { path: "/library/videos", excludeVideo: false, excludeImage: true },
        ],
      },
    };
    const sources = collectSources(raw);
    expect(sources.exempt).toBe(1);
    const library = {
      stash: {
        version: {},
        configuration: {
          general: { stashes: [{ path: "/library/videos" }] },
        },
      },
      entities: {
        scene: [
          {
            id: "100003",
            files: [{ path: "/library/videos/scene-100003.webm" }],
          },
        ],
      },
    };
    expect(
      guardFixture(sources, { "library.json": JSON.stringify(library) })
    ).toEqual([]);
  });

  it("a source string that is not repo text still fails", () => {
    const raw = guardRaw();
    // It holds a field name, but as a whole it is no repo text
    must(raw.entities.performer[0]).name = "Fake Tits Actress 1";
    const sources = collectSources(raw);
    expect(sources.exempt).toBe(0);
    const lines = guardFixture(sources, {
      "library.json": JSON.stringify({
        stash: { version: {}, configuration: {} },
        entities: {
          performer: [
            {
              id: "100006",
              details: "Performer 100006 fake tits actress 1 details",
            },
          ],
        },
      }),
    });
    expect(lines).toEqual([
      "library.json:entities.performer[0].details: contains a source string (performer[0].name)",
    ]);
    expect(lines.join("\n").toLowerCase()).not.toContain("actress");
  });

  it("refuses a mutation document before sending", async () => {
    const request = vi.fn<StashRequest>(() =>
      Promise.resolve({ version: { version: "v0.0.0" } })
    );

    await expect(
      sendQuery(
        request,
        'mutation SceneDestroy { sceneDestroy(input: { id: "1" }) }'
      )
    ).rejects.toThrow(
      "fixtures:record refuses to send SceneDestroy: it sends queries only"
    );
    await expect(
      sendQuery(
        request,
        'query Version { version { version } } mutation TagCreate { tagCreate(input: { name: "x" }) { id } }'
      )
    ).rejects.toThrow("refuses to send TagCreate");
    await expect(
      sendQuery(request, "subscription Jobs { jobsSubscribe { type } }")
    ).rejects.toThrow("refuses to send Jobs");
    expect(request).not.toHaveBeenCalled();

    await expect(
      sendQuery(request, "query Version { version { version } }")
    ).resolves.toEqual({ version: { version: "v0.0.0" } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses STASH_TEST_URL equal to STASH_URL", async () => {
    const sameInFile = {
      STASH_TEST_URL: TEST_URL,
      STASH_TEST_API_KEY: TEST_KEY,
      STASH_URL: "http://192.0.2.10:9999/graphql/",
      STASH_API_KEY: "prod-key-5e2b",
    };
    expect(() => recordTarget(sameInFile, {})).toThrow(
      "STASH_TEST_URL is the same Stash as STASH_URL"
    );
    // STASH_URL from the shell counts too, even when the file has another
    expect(() =>
      recordTarget(
        { ...sameInFile, STASH_URL: "http://192.0.2.20:9999/graphql" },
        { STASH_URL: TEST_URL }
      )
    ).toThrow("STASH_TEST_URL is the same Stash as STASH_URL");
    expect(
      recordTarget(
        { ...sameInFile, STASH_URL: "http://192.0.2.20:9999/graphql" },
        {}
      )
    ).toEqual({
      url: TEST_URL,
      apiKey: TEST_KEY,
    });

    const request =
      vi.fn<(target: { url: string; apiKey: string }) => StashRequest>();
    const lines: string[] = [];
    const code = await main([], {
      env: { fileEnv: sameInFile, shellEnv: {} },
      request,
      outDir: dir,
      log: logTo(lines),
    });
    expect(code).toBe(1);
    expect(request).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
    const output = lines.join("\n");
    expect(output).toContain("STASH_TEST_URL is the same Stash as STASH_URL");
    expect(output).not.toContain(TEST_KEY);
    expect(output).not.toContain("prod-key-5e2b");
  });
});
