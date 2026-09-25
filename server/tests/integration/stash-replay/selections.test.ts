/**
 * The fixture generator reads which fields Peek's Stash queries select from
 * server/graphql/operations (sweep item 83), merged per entity type, so a
 * field any query adds gets a synthetic value or fails naming the query.
 */
import { describe, expect, it } from "vitest";
import {
  loadSelections,
  mergeSelections,
} from "../../../integration/stash-replay/selections.js";
import { must } from "../../helpers/must.js";

describe("selections", () => {
  it("merges FindScenes, FindScenesCompact and FindSceneIDs into one scene selection", () => {
    const scene = loadSelections().entities.scene;

    expect(must(scene.id).operations).toEqual([
      "FindSceneIDs",
      "FindScenes",
      "FindScenesCompact",
    ]);
    expect(must(scene.title).operations).toEqual([
      "FindScenes",
      "FindScenesCompact",
    ]);
    // Only the compact query selects these
    expect(must(scene.urls).operations).toEqual(["FindScenesCompact"]);
    expect(must(scene.captions).operations).toEqual(["FindScenesCompact"]);
    const files = must(must(scene.files).fields);
    expect(must(files.fingerprints).operations).toEqual(["FindScenesCompact"]);
    expect(Object.keys(must(files.fingerprints).fields ?? {})).toEqual([
      "type",
      "value",
    ]);
    // Only the full query selects these
    const studio = must(must(scene.studio).fields);
    expect(must(studio.aliases).operations).toEqual(["FindScenes"]);
    expect(must(studio.tags).operations).toEqual([
      "FindScenes",
      "FindScenesCompact",
    ]);
    // Both select paths; only the compact one its caption
    const paths = must(must(scene.paths).fields);
    expect(Object.keys(paths)).toEqual([
      "preview",
      "screenshot",
      "sprite",
      "vtt",
      "webp",
      "caption",
    ]);
    expect(must(paths.caption).operations).toEqual(["FindScenesCompact"]);
  });

  it("maps findGroup and findGallery onto the group and gallery selections", () => {
    const { group, gallery } = loadSelections().entities;

    expect(must(group.id).operations).toEqual([
      "FindGroup",
      "FindGroupIDs",
      "FindGroupRelations",
      "FindGroups",
    ]);
    expect(must(group.containing_groups).operations).toEqual(["FindGroup"]);
    // The sync's hierarchy pass reads sub_groups alone
    expect(must(group.sub_groups).operations).toEqual([
      "FindGroup",
      "FindGroupRelations",
    ]);
    expect(must(gallery.id).operations).toEqual([
      "FindGalleries",
      "FindGallery",
      "FindGalleryIDs",
    ]);
    expect(must(gallery.chapters).operations).toEqual(["FindGallery"]);
    expect(must(gallery.folder).operations).toEqual(["FindGalleries"]);
    // findGroup's studio selects image_path, findGroups' does not
    expect(must(must(must(group.studio).fields).image_path).operations).toEqual(
      ["FindGroup"]
    );
  });

  it("fails on conflicting arguments", () => {
    expect(() =>
      mergeSelections([
        "query FindTagsSmall { findTags { tags { id image_path(size: 1) } } }",
        "query FindTagsPlain { findTags { tags { id image_path } } }",
      ])
    ).toThrow(
      "selections: conflicting arguments for tag.image_path: FindTagsSmall selects image_path(size: 1), FindTagsPlain selects image_path"
    );
    // The same arguments merge
    const merged = mergeSelections([
      "query A { findTags { tags { image_path(size: 1) } } }",
      "query B { findTags { tags { image_path(size: 1) } } }",
    ]);
    expect(must(merged.entities.tag.image_path).operations).toEqual(["A", "B"]);
  });
});
