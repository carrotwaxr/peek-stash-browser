/**
 * The playlist API contract lives in shared/types: the item sort keys and the
 * request and response types (PR 7, B1). The type cases run in
 * `npm run typecheck:tests`; at run time they are empty.
 */
import {
  DEFAULT_PLAYLIST_ITEM_SORT,
  PLAYLIST_ITEM_SORTS,
  SORTS,
} from "@peek/shared-types/filters/index.js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AddScenesToPlaylistRequest,
  AddScenesToPlaylistResponse,
  GetPlaylistQueueResponse,
  GetPlaylistResponse,
  MovePlaylistItemRequest,
  PlaylistQueueEntry,
  RemovePlaylistItemsRequest,
  RemoveUnavailableItemsResponse,
  SortPlaylistRequest,
} from "../../types/api/index.js";

describe("playlist item sorts", () => {
  it("PLAYLIST_ITEM_SORTS is position, added_at, then every scene sort except scene_index and playlist_position", () => {
    expect(PLAYLIST_ITEM_SORTS).toEqual([
      "position",
      "added_at",
      ...SORTS.scene.filter(
        (s) => s !== "scene_index" && s !== "playlist_position"
      ),
    ]);
    expect(PLAYLIST_ITEM_SORTS).not.toContain("scene_index");
    expect(PLAYLIST_ITEM_SORTS).not.toContain("playlist_position");
  });

  it("the default playlist item sort is position ASC", () => {
    expect(DEFAULT_PLAYLIST_ITEM_SORT).toEqual({
      field: "position",
      direction: "ASC",
    });
  });
});

describe("playlist contract types", () => {
  it("the queue, bulk add, move, remove and sort types are the shared contract", () => {
    expectTypeOf<GetPlaylistQueueResponse>().toEqualTypeOf<{
      entries: PlaylistQueueEntry[];
    }>();
    expectTypeOf<AddScenesToPlaylistRequest>().toEqualTypeOf<{
      scenes: { sceneId: string; instanceId: string }[];
    }>();
    expectTypeOf<AddScenesToPlaylistResponse>().toEqualTypeOf<{
      added: number;
      alreadyInPlaylist: number;
      unavailable: number;
    }>();
    expectTypeOf<MovePlaylistItemRequest>().toEqualTypeOf<{ index: number }>();
    expectTypeOf<RemovePlaylistItemsRequest>().toEqualTypeOf<{
      itemIds: number[];
    }>();
    expectTypeOf<RemoveUnavailableItemsResponse>().toEqualTypeOf<{
      removed: number;
    }>();
    expectTypeOf<SortPlaylistRequest["direction"]>().toEqualTypeOf<
      "ASC" | "DESC"
    >();
  });

  it("a playlist response carries the sort, the page and the owner flags", () => {
    expectTypeOf<GetPlaylistResponse["isOwner"]>().toEqualTypeOf<boolean>();
    expectTypeOf<GetPlaylistResponse["totalItems"]>().toEqualTypeOf<number>();
    // Always paged, and the owner's unavailable count (0 for anyone else)
    expectTypeOf<GetPlaylistResponse["page"]>().toEqualTypeOf<number>();
    expectTypeOf<GetPlaylistResponse["perPage"]>().toEqualTypeOf<number>();
    expectTypeOf<
      GetPlaylistResponse["unavailableItems"]
    >().toEqualTypeOf<number>();
    // Every listed item is one the viewer can see, with its scene
    expectTypeOf<
      GetPlaylistResponse["playlist"]["items"][number]["scene"]
    >().not.toBeNullable();
    expectTypeOf<GetPlaylistResponse["playlist"]>().not.toHaveProperty(
      "isPublic"
    );
  });
});
