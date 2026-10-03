/**
 * The pins answer (`GET /user/filter-pins`) a test seeds into the query
 * cache: every list empty unless named, so a chip bar draws only the rows
 * its URL holds.
 */
import {
  type GetFilterPinsResponse,
  LIST_KINDS,
  type ListKind,
  type ListPins,
} from "@peek/shared-types";

export type PinsByList = Partial<Record<ListKind, ListPins>>;

const EMPTY: ListPins = { fields: [], filters: [] };

/** Every list's pins: those named, the rest empty */
export function pinsAnswer(pins: PinsByList = {}): GetFilterPinsResponse {
  const all = Object.fromEntries(
    LIST_KINDS.map((kind) => [kind, pins[kind] ?? EMPTY])
  ) as Record<ListKind, ListPins>;
  return { pins: all };
}
