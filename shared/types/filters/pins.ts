// shared/types/filters/pins.ts
/**
 * Pins: the fields and filters a user keeps on a list's chip bar. Stored per
 * list kind; a list with none stored shows `defaultPinsOf(kind)`.
 */
import type { ListKind } from "./fields.js";
import { PANEL_FIELDS, type PanelField } from "./panel/index.js";

/** Fields and filters together, per list */
export const PIN_LIMIT = 10;

export interface PinnedFilter {
  /** Client-made token (32 hex); seeds use "default-<name>" */
  readonly id: string;
  /** The panel row's key ("watched") */
  readonly key: string;
  /** That row's keys and companions, unprefixed */
  readonly state: Readonly<Record<string, unknown>>;
  /** At most 60 characters; the chip text when set */
  readonly label?: string;
}

export interface ListPins {
  readonly fields: readonly string[];
  readonly filters: readonly PinnedFilter[];
}

export type FilterPins = Readonly<Record<ListKind, ListPins>>;

const FAVORITES: PinnedFilter = {
  id: "default-favorites",
  key: "favorite",
  state: { favorite: true },
  label: "Favorites",
};

/** The filters a new user has pinned */
export const DEFAULT_PINNED_FILTERS: Readonly<
  Record<ListKind, readonly PinnedFilter[]>
> = {
  scene: [
    {
      id: "default-unwatched",
      key: "watched",
      state: { watched: "false" },
      label: "Unwatched",
    },
    {
      id: "default-favorites",
      key: "favorite",
      // a scene's favorite row is a three-state choice
      state: { favorite: "true" },
      label: "Favorites",
    },
  ],
  performer: [FAVORITES],
  studio: [FAVORITES],
  tag: [FAVORITES],
  group: [FAVORITES],
  gallery: [FAVORITES],
  image: [FAVORITES],
  clip: [],
};

/** Fields from the panel table's `pinnedByDefault` rows, filters from the constant */
export function defaultPinsOf(kind: ListKind): ListPins {
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  return {
    fields: rows
      .filter((row) => row.pinnedByDefault === true && row.pinnable !== false)
      .map((row) => row.key),
    filters: DEFAULT_PINNED_FILTERS[kind],
  };
}
