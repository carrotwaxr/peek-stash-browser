/**
 * The filter panel's rows as the client draws, builds, writes and reads
 * them, from the shared field table (`shared/types/filters/panel/`).
 * Imports only relative modules and `@peek/shared-types`.
 */
export {
  CODECS,
  type ChipParts,
  type FieldCodec,
  type PanelState,
  RANGE_SUFFIXES,
  codecOf,
  entityParamFor,
  urlKeysOf,
  valuesOf,
} from "./codecs";
export {
  type PanelFilters,
  type PanelTable,
  type ReadPanelFilter,
  buildPanelFilter,
  normalizePanelState,
  panelTableOf,
  readPanelFilter,
} from "./build";
export { type FilterOption, filterOptionsOf } from "./options";
