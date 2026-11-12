import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYLIST_SORT,
  PLAYLIST_LIST_SORTS,
  type PlaylistListRow,
  filterPlaylists,
  sortPlaylists,
} from "@/components/playlists/playlistListSort";

function row(id: number, over: Partial<PlaylistListRow> = {}): PlaylistListRow {
  return {
    id,
    name: `Playlist ${id}`,
    description: null,
    count: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastChangedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const ids = (list: PlaylistListRow[]) => list.map((r) => r.id);

describe("sortPlaylists", () => {
  it("defaults to Last changed, newest first", () => {
    expect(DEFAULT_PLAYLIST_SORT).toEqual({
      field: "last_changed",
      direction: "DESC",
    });
    expect(PLAYLIST_LIST_SORTS.map((s) => s.value)).toEqual([
      "last_changed",
      "name",
      "created",
      "videos",
    ]);
  });

  it("orders by last change, newest first and oldest first", () => {
    const list = [
      row(1, { lastChangedAt: "2026-01-02T00:00:00.000Z" }),
      row(2, { lastChangedAt: "2026-03-01T00:00:00.000Z" }),
      row(3, { lastChangedAt: "2026-02-01T00:00:00.000Z" }),
    ];

    expect(ids(sortPlaylists(list, "last_changed", "DESC"))).toEqual([2, 3, 1]);
    expect(ids(sortPlaylists(list, "last_changed", "ASC"))).toEqual([1, 3, 2]);
  });

  it("orders names without regard to case and by number", () => {
    const list = [
      row(1, { name: "banana" }),
      row(2, { name: "Apple" }),
      row(3, { name: "mix 10" }),
      row(4, { name: "Mix 2" }),
    ];

    expect(ids(sortPlaylists(list, "name", "ASC"))).toEqual([2, 1, 4, 3]);
    expect(ids(sortPlaylists(list, "name", "DESC"))).toEqual([3, 4, 1, 2]);
  });

  it("orders by creation time both ways, a playlist with none last in DESC", () => {
    const list = [
      row(1, { createdAt: "2026-02-01T00:00:00.000Z" }),
      row(2, { createdAt: "2026-03-01T00:00:00.000Z" }),
      row(3, { createdAt: null }),
    ];

    expect(ids(sortPlaylists(list, "created", "DESC"))).toEqual([2, 1, 3]);
    expect(ids(sortPlaylists(list, "created", "ASC"))).toEqual([3, 1, 2]);
  });

  it("orders by video count both ways", () => {
    const list = [
      row(1, { count: 5 }),
      row(2, { count: 20 }),
      row(3, { count: 1 }),
    ];

    expect(ids(sortPlaylists(list, "videos", "DESC"))).toEqual([2, 1, 3]);
    expect(ids(sortPlaylists(list, "videos", "ASC"))).toEqual([3, 1, 2]);
  });

  it("breaks ties by id so the order is stable", () => {
    const list = [row(3), row(1), row(2)];

    expect(ids(sortPlaylists(list, "videos", "DESC"))).toEqual([1, 2, 3]);
    expect(ids(sortPlaylists(list, "videos", "ASC"))).toEqual([1, 2, 3]);
  });

  it("does not change the list it is given", () => {
    const list = [row(2, { count: 1 }), row(1, { count: 2 })];

    sortPlaylists(list, "videos", "DESC");

    expect(ids(list)).toEqual([2, 1]);
  });
});

describe("filterPlaylists", () => {
  const list = [
    row(1, { name: "Friday Mix Tape", description: null }),
    row(2, { name: "Other", description: "my mix of every tape" }),
    row(3, { name: "Mix only", description: "nothing else" }),
  ];

  it("matches a name or description holding every word, in any case", () => {
    expect(ids(filterPlaylists(list, "MIX tape"))).toEqual([1, 2]);
  });

  it("returns the whole list for a blank query", () => {
    expect(ids(filterPlaylists(list, "   "))).toEqual([1, 2, 3]);
  });

  it("returns nothing when a word matches no playlist", () => {
    expect(filterPlaylists(list, "mix zebra")).toEqual([]);
  });
});
