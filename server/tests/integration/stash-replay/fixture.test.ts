/**
 * The committed replay fixture (sweep item 83): fixture/shape.json,
 * library.json and manifest.ts, as npm run fixtures:record wrote them from
 * the test Stash. It must answer every query Peek defines, hold nothing
 * that points at a real host or names a real thing, and match the generator.
 */
import { readFileSync, readdirSync } from "fs";
import {
  Kind,
  type OperationDefinitionNode,
  OperationTypeNode,
  parse,
} from "graphql";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_API_KEY,
  FIXTURE_LIBRARY,
  TEST_ENTITIES,
} from "../../../integration/stash-replay/fixture/manifest.js";
import {
  FIXTURE_PATHS,
  main as generateMain,
  parseShape,
  unmetMinimums,
} from "../../../integration/stash-replay/generate.js";
import {
  ENTITY_TYPES,
  LIST_ROOTS,
  SINGLE_ROOTS,
  isRecord,
  parseReplayLibrary,
} from "../../../integration/stash-replay/library.js";
import { TEST_ENTITY_CRITERIA } from "../../../integration/stash-replay/selectTestEntities.js";
import { OPERATIONS_DIR } from "../../../integration/stash-replay/selections.js";
import { startStashReplay } from "../../../integration/stash-replay/server.js";
import { arrayContaining } from "../../helpers/matchers.js";

const FIXTURE_FILES = ["shape.json", "library.json", "manifest.ts"];

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_PATHS.outDir, name), "utf8");
}

const library = parseReplayLibrary(
  JSON.parse(readFixture("library.json")),
  "library.json"
);
const shape = parseShape(JSON.parse(readFixture("shape.json")), "shape.json");

interface Leaf {
  path: string;
  key: string;
  value: unknown;
}

/** Every leaf of a value, with its JSON path and the key it sits under. */
function leaves(value: unknown, at = "", key = ""): Leaf[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) =>
      leaves(item, `${at}[${index}]`, key)
    );
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([name, child]) =>
      leaves(child, at === "" ? name : `${at}.${name}`, name)
    );
  }
  return [{ path: at, key, value }];
}

const LABELED = /^(Scene|Performer|Studio|Tag|Group|Gallery|Image|Clip) \d+$/;

/** Inclusive date windows per key (synth.ts). */
const DATE_WINDOWS: Record<string, [string, string]> = {
  date: ["2001-01-01", "2009-12-31"],
  death_date: ["2001-01-01", "2009-12-31"],
  birthdate: ["1960-01-01", "1983-12-31"],
  created_at: ["2003-01-01", "2003-12-31"],
  // created_at plus up to 400 days
  updated_at: ["2003-01-01", "2005-02-04"],
  build_time: ["2000-01-01", "2000-01-01"],
};

describe("the committed replay fixture", () => {
  it("every query operation in graphql/operations runs against the replay", async () => {
    const replay = await startStashReplay([
      { name: "test", library, apiKey: FIXTURE_API_KEY },
    ]);
    const url = replay.libraries[0]?.url ?? "";
    const failures: string[] = [];
    const ran: string[] = [];
    try {
      const files = readdirSync(OPERATIONS_DIR)
        .filter((file) => file.endsWith(".graphql"))
        .sort();
      for (const file of files) {
        const document = readFileSync(path.join(OPERATIONS_DIR, file), "utf8");
        const queries = parse(document).definitions.filter(
          (definition): definition is OperationDefinitionNode =>
            definition.kind === Kind.OPERATION_DEFINITION &&
            definition.operation === OperationTypeNode.QUERY
        );
        for (const operation of queries) {
          const name = operation.name?.value ?? file;
          const variables: Record<string, unknown> = {};
          const roots: string[] = [];
          for (const selection of operation.selectionSet.selections) {
            if (selection.kind !== Kind.FIELD) continue;
            const root = selection.name.value;
            roots.push(root);
            const single = SINGLE_ROOTS[root];
            if (LIST_ROOTS[root] !== undefined) {
              variables.filter = { per_page: -1 };
            } else if (single !== undefined) {
              variables.id = library.entities[single][0]?.id;
            }
          }
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ApiKey: FIXTURE_API_KEY,
            },
            body: JSON.stringify({
              query: document,
              operationName: name,
              variables,
            }),
          });
          const body: unknown = await response.json();
          ran.push(name);
          if (!isRecord(body) || !isRecord(body.data) || "errors" in body) {
            failures.push(`${name}: ${JSON.stringify(body)}`);
            continue;
          }
          const data = body.data;
          for (const root of roots) {
            const answer = data[root];
            const list = LIST_ROOTS[root];
            if (answer === null || answer === undefined) {
              failures.push(`${name}: ${root} is null`);
            } else if (
              list !== undefined &&
              isRecord(answer) &&
              "count" in answer &&
              answer.count !== library.entities[list[0]].length
            ) {
              failures.push(
                `${name}: ${root}.count is ${String(answer.count)}`
              );
            }
          }
        }
      }
      expect(failures).toEqual([]);
      expect(replay.stats()).toEqual({ mutations: [], unsupported: [] });
      expect(ran).toEqual(
        arrayContaining([
          "Configuration",
          "Version",
          "FindScenes",
          "FindScenesCompact",
          "FindSceneIDs",
          "FindSceneMarkers",
          "FindGroup",
          "FindGallery",
        ])
      );
    } finally {
      await replay.close();
    }
  });

  it("no string holds an IPv4 address, localhost or a non-.invalid URL host other than {{STASH_ORIGIN}}", () => {
    for (const name of FIXTURE_FILES) {
      const text = readFixture(name);
      expect(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [], name).toEqual(
        []
      );
      expect(/localhost/i.test(text), name).toBe(false);
      const hosts = [...text.matchAll(/[a-z][a-z0-9+.-]*:\/\/([^/?#"\s]*)/gi)]
        .map((match) => match[1] ?? "")
        .filter((host) => !host.endsWith(".invalid"));
      expect(hosts, name).toEqual([]);
    }
    // Media URLs are Stash routes under the origin the replay fills in
    const media = leaves(library).filter(
      (leaf) => typeof leaf.value === "string" && leaf.value.includes("?t=")
    );
    expect(media.length).toBeGreaterThan(100);
    expect(
      media
        .filter(
          (leaf) =>
            typeof leaf.value !== "string" ||
            !leaf.value.startsWith("{{STASH_ORIGIN}}/")
        )
        .map((leaf) => leaf.path)
    ).toEqual([]);
  });

  it("every name and title matches ^(Scene|Performer|Studio|Tag|Group|Gallery|Image|Clip) \\d+$ or is empty", () => {
    const named = leaves(library).filter(
      (leaf) => leaf.key === "name" || leaf.key === "title"
    );
    expect(named.length).toBeGreaterThan(100);
    expect(
      named
        .filter(
          (leaf) =>
            !(
              leaf.value === null ||
              leaf.value === "" ||
              (typeof leaf.value === "string" && LABELED.test(leaf.value))
            )
        )
        .map((leaf) => leaf.path)
    ).toEqual([]);
  });

  it("every date lies in the synthetic windows", () => {
    const outside: string[] = [];
    let dates = 0;
    for (const leaf of leaves(library)) {
      if (typeof leaf.value !== "string") continue;
      for (const date of leaf.value.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
        dates++;
        const [from, to] = DATE_WINDOWS[leaf.key] ?? ["", ""];
        if (date < from || date > to) outside.push(leaf.path);
      }
      // t= stamps are updated_at epochs
      for (const match of leaf.value.matchAll(/[?&]t=(\d+)/g)) {
        const at = new Date(Number(match[1]) * 1000).toISOString();
        if (at < "2003-01-01" || at > "2005-02-05") outside.push(leaf.path);
      }
    }
    expect(dates).toBeGreaterThan(100);
    expect(outside).toEqual([]);
    // The shape and the manifest hold no dates at all
    for (const name of ["shape.json", "manifest.ts"]) {
      expect(readFixture(name).match(/\d{4}-\d{2}-\d{2}/g) ?? [], name).toEqual(
        []
      );
    }
  });

  it("FIXTURE_LIBRARY equals the entity counts and meets E2E's minimum library", () => {
    expect(FIXTURE_LIBRARY).toEqual({
      scenes: library.entities.scene.length,
      performers: library.entities.performer.length,
      studios: library.entities.studio.length,
      tags: library.entities.tag.length,
      groups: library.entities.group.length,
      galleries: library.entities.gallery.length,
      images: library.entities.image.length,
      clips: library.entities.clip.length,
    });
    expect(unmetMinimums(library)).toEqual([]);
    for (const type of ENTITY_TYPES) {
      expect(
        library.entities[type].length,
        `${type} is recorded and extended`
      ).toBeGreaterThanOrEqual(shape.entities[type].length);
    }
  });

  it("TEST_ENTITIES ids exist", () => {
    const missing = TEST_ENTITY_CRITERIA.filter(({ key, type }) => {
      const id = TEST_ENTITIES[key];
      return (
        !library.entities[type].some((entity) => entity.id === id) ||
        // Recorded, so live runs find it in the test Stash too
        !shape.entities[type].some((entity) => entity.id === id)
      );
    }).map(({ key }) => key);
    expect(missing).toEqual([]);
    expect(TEST_ENTITIES.inheritedTagFromPerformerOrStudio).toBe("");
  });

  it("npm run fixtures:generate -- --check is clean", () => {
    const lines: string[] = [];
    const code = generateMain(["--check"], FIXTURE_PATHS, (line) => {
      lines.push(line);
    });
    expect(lines).toEqual(["fixtures:generate: the fixture is up to date"]);
    expect(code).toBe(0);
  });
});
