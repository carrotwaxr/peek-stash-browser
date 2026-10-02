/**
 * The panel's state to a list's request filter, from the field table: each
 * row's codec builds its criterion, then a page's permanent criteria (a
 * performer page's `performers`, the folder view's `tag_count`, the
 * timeline's `date`) apply over them. A new panel filter is a row in
 * `shared/types/filters/panel/`; nothing here names a field.
 *
 * Imports only relative modules and `@peek/shared-types` (see `options.ts`).
 */
import {
  type FieldSpec,
  type GalleryFilterInput,
  type GroupFilterInput,
  type ImageFilterInput,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  type PerformerFilterInput,
  type RefField,
  type SceneFilterInput,
  type StudioFilterInput,
  type TagFilterInput,
} from "@peek/shared-types";
import type { ClipFilterParams } from "../../api/clips";
import {
  type BuildContext,
  CODECS,
  type PanelState,
  type RefCriterion,
  codecOf,
  refCriterionOf,
} from "./codecs";
import { SPECS } from "./options";

/** Each list's request filter (clips: the GET parameters) */
export interface PanelFilters {
  scene: SceneFilterInput;
  performer: PerformerFilterInput;
  studio: StudioFilterInput;
  tag: TagFilterInput;
  group: GroupFilterInput;
  gallery: GalleryFilterInput;
  image: ImageFilterInput;
  clip: ClipFilterParams;
}

/** A list's rows and the contract fields they fill */
export interface PanelTable {
  readonly rows: readonly PanelField[];
  readonly specs: Readonly<Record<string, FieldSpec>>;
}

const METRIC: BuildContext = { unitPreference: "metric" };

const tableOf = (kind: ListKind): PanelTable => ({
  rows: PANEL_FIELDS[kind],
  specs: SPECS[kind],
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A permanent date range given as the panel holds one, `{ start, end }` */
const isPanelDateRange = (value: unknown): boolean =>
  isObject(value) && !("modifier" in value);

/**
 * A page's permanent criterion of a field: a ref merges with the panel's
 * picks of that field; a date range in panel shape goes through the date
 * codec; anything else is sent as it is and wins over the panel's
 */
function permanentCriterion(
  name: string,
  spec: FieldSpec,
  permanent: unknown,
  table: PanelTable,
  state: PanelState,
  ctx: BuildContext
): unknown {
  if (spec.kind === "ref") {
    const row = table.rows.find(
      (each): each is RefField => each.editor === "ref" && each.field === name
    );
    return refCriterionOf(spec, row, state, permanent);
  }
  if (spec.kind === "date" && isPanelDateRange(permanent)) {
    return CODECS.date.toCriterion(
      { key: name, field: name, label: name, group: "dates", editor: "date" },
      spec,
      { [name]: permanent },
      ctx
    );
  }
  return permanent;
}

/**
 * A list's request filter from the panel's state: each row's criterion,
 * then the state's contract fields that are no panel key (a page's
 * permanent criteria). A field with a `path` nests there
 * (`scenes_filter.groups`); clips flatten into their GET parameters (a
 * list and its `<param>Modifier`, a single ref's one id).
 */
export function buildPanelFilter<K extends ListKind>(
  kind: K,
  state: PanelState,
  ctx: BuildContext = METRIC,
  table: PanelTable = tableOf(kind)
): PanelFilters[K] {
  const specs = new Map(Object.entries(table.specs));
  const filter: Record<string, unknown> = {};

  const place = (name: string, spec: FieldSpec, criterion: unknown) => {
    if (criterion === undefined) return;
    if (spec.kind === "ref" && kind === "clip") {
      const { value, modifier } = criterion as RefCriterion;
      filter[name] = spec.single ? value[0] : value;
      if (spec.modifiers.length > 1) filter[`${name}Modifier`] = modifier;
      return;
    }
    if (spec.kind === "ref" && spec.path !== undefined) {
      const [outer, inner] = spec.path;
      const nested = filter[outer];
      filter[outer] = {
        ...(isObject(nested) ? nested : {}),
        [inner]: criterion,
      };
      return;
    }
    filter[name] = criterion;
  };

  for (const row of table.rows) {
    const spec = specs.get(row.field);
    if (spec === undefined) {
      throw new Error(`${kind} panel row ${row.key}: no field ${row.field}`);
    }
    place(row.field, spec, codecOf(row).toCriterion(row, spec, state, ctx));
  }

  const panelKeys = new Set(
    table.rows.flatMap((row) => codecOf(row).keys(row))
  );
  for (const [name, permanent] of Object.entries(state)) {
    const spec = specs.get(name);
    if (spec === undefined || panelKeys.has(name) || permanent === undefined) {
      continue;
    }
    place(
      name,
      spec,
      permanentCriterion(name, spec, permanent, table, state, ctx)
    );
  }

  return filter as PanelFilters[K];
}
