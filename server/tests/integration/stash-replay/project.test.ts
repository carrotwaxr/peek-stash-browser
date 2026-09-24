/**
 * The Stash replay projects a library value onto the request's selection
 * set (sweep item 83). A field the fixture lacks is a strict failure that
 * names the operation, the path and the commands that rebuild the fixture.
 */
import { Kind, type SelectionSetNode, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { ReplayUnsupported } from "../../../integration/stash-replay/library.js";
import { project } from "../../../integration/stash-replay/project.js";
import { must } from "../../helpers/must.js";

/** The selection set under the first root field of the query's first operation. */
function selectionOf(query: string): SelectionSetNode {
  const operation = must(parse(query).definitions[0], "an operation");
  if (operation.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error("the query's first definition is not an operation");
  }
  const root = must(operation.selectionSet.selections[0], "a root field");
  if (root.kind !== Kind.FIELD || !root.selectionSet) {
    throw new Error("the root selection is not a field with a selection set");
  }
  return root.selectionSet;
}

const result = {
  count: 1,
  duration: 20.125,
  scenes: [
    {
      id: "100001",
      title: "Scene 100001",
      details: "Scene 100001 details",
      studio: null,
      files: [
        {
          path: "/library/videos/scene-100001.webm",
          size: 1000001,
          fingerprints: [{ type: "oshash", value: "0a1b2c3d4e5f0001" }],
        },
        {
          path: "/library/videos/scene-100001-b.webm",
          size: 2000002,
          fingerprints: [],
        },
      ],
    },
  ],
};

describe("project", () => {
  it("returns only the selected fields, nested through arrays", () => {
    const selection = selectionOf(
      "query FindScenesCompact { findScenes { count scenes { id files { path fingerprints { value } } } } }"
    );

    expect(
      project(result, selection, "FindScenesCompact", "findScenes")
    ).toEqual({
      count: 1,
      scenes: [
        {
          id: "100001",
          files: [
            {
              path: "/library/videos/scene-100001.webm",
              fingerprints: [{ value: "0a1b2c3d4e5f0001" }],
            },
            { path: "/library/videos/scene-100001-b.webm", fingerprints: [] },
          ],
        },
      ],
    });
  });

  it("keeps null", () => {
    const selection = selectionOf(
      "query FindScenesCompact { findScenes { scenes { id studio { id name } } } }"
    );

    expect(
      project(
        {
          scenes: [
            { id: "100001", studio: null },
            { id: "100002", studio: { id: "100001", name: "Studio 100001" } },
          ],
        },
        selection,
        "FindScenesCompact",
        "findScenes"
      )
    ).toEqual({
      scenes: [
        { id: "100001", studio: null },
        { id: "100002", studio: { id: "100001", name: "Studio 100001" } },
      ],
    });
    expect(
      project(
        { scenes: [{ id: "100001", rating100: null }] },
        selectionOf("query Q { findScenes { scenes { rating100 } } }"),
        "Q",
        "findScenes"
      )
    ).toEqual({ scenes: [{ rating100: null }] });
  });

  it("throws ReplayUnsupported naming the operation and the path, and the message names npm run fixtures:generate and npm run fixtures:record", () => {
    const selection = selectionOf(
      "query FindScenesCompact { findScenes { scenes { id files { path bit_rate } } } }"
    );
    const run = () =>
      project(result, selection, "FindScenesCompact", "findScenes");

    expect(run).toThrow(ReplayUnsupported);
    expect(run).toThrow(
      "stash-replay cannot answer FindScenesCompact: the fixture has no findScenes.scenes[].files[].bit_rate."
    );
    expect(run).toThrow("npm run fixtures:generate");
    expect(run).toThrow("npm run fixtures:record");
  });

  it("throws on fragments and aliases", () => {
    const spread = selectionOf(
      "query WithSpread { findScenes { scenes { ...SceneParts } } } fragment SceneParts on Scene { id }"
    );
    const inline = selectionOf(
      "query WithInline { findScenes { scenes { ... on Scene { id } } } }"
    );
    const alias = selectionOf(
      "query WithAlias { findScenes { scenes { sceneId: id } } }"
    );

    expect(() => project(result, spread, "WithSpread", "findScenes")).toThrow(
      ReplayUnsupported
    );
    expect(() => project(result, spread, "WithSpread", "findScenes")).toThrow(
      "stash-replay cannot answer WithSpread: fragment ...SceneParts at findScenes.scenes[] is not evaluated by the replay"
    );
    expect(() => project(result, inline, "WithInline", "findScenes")).toThrow(
      "stash-replay cannot answer WithInline: an inline fragment at findScenes.scenes[] is not evaluated by the replay"
    );
    expect(() => project(result, alias, "WithAlias", "findScenes")).toThrow(
      "stash-replay cannot answer WithAlias: the alias sceneId at findScenes.scenes[].id is not evaluated by the replay"
    );
  });
});
