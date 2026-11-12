/**
 * Sorting and searching the Playlists page's lists in memory: a user has tens
 * of playlists, so nothing here goes to the server.
 */

export type PlaylistSortField = "last_changed" | "name" | "created" | "videos";
export type PlaylistSortDirection = "ASC" | "DESC";

export const PLAYLIST_LIST_SORTS: {
  value: PlaylistSortField;
  label: string;
}[] = [
  { value: "last_changed", label: "Last changed" },
  { value: "name", label: "Name" },
  { value: "created", label: "Date created" },
  { value: "videos", label: "Videos" },
];

/** Last changed, newest first */
export const DEFAULT_PLAYLIST_SORT: {
  field: PlaylistSortField;
  direction: PlaylistSortDirection;
} = { field: "last_changed", direction: "DESC" };

/**
 * What the page sorts and searches: a row for each playlist, own or shared.
 * Times are ISO strings; a playlist with none (a shared one has no creation
 * time) sorts as the oldest.
 */
export interface PlaylistListRow {
  id: number;
  name: string;
  description: string | null;
  /** The videos the viewer can see */
  count: number;
  createdAt: string | null;
  lastChangedAt: string | null;
}

const timeOf = (iso: string | null): number => {
  const ms = iso === null ? NaN : Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** The rows in the order asked; a tie goes to the lower id, either way */
export function sortPlaylists<T extends PlaylistListRow>(
  list: readonly T[],
  field: PlaylistSortField,
  direction: PlaylistSortDirection
): T[] {
  const sign = direction === "ASC" ? 1 : -1;
  const compare = (a: T, b: T): number => {
    switch (field) {
      case "name":
        return compareName(a.name, b.name);
      case "created":
        return timeOf(a.createdAt) - timeOf(b.createdAt);
      case "videos":
        return a.count - b.count;
      case "last_changed":
        return timeOf(a.lastChangedAt) - timeOf(b.lastChangedAt);
    }
  };
  return [...list].sort((a, b) => sign * compare(a, b) || a.id - b.id);
}

/** The rows whose name or description holds every word of the query */
export function filterPlaylists<
  T extends Pick<PlaylistListRow, "name" | "description">,
>(list: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter((row) => {
    const text = `${row.name} ${row.description ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
