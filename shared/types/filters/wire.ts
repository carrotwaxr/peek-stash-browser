// shared/types/filters/wire.ts
/**
 * What a list request carries, typed from the field tables: each field's
 * criterion as it is sent, and the request bodies around them.
 */
import type {
  BooleanSpec,
  DateModifier,
  DateSpec,
  EntityKind,
  EnumModifier,
  EnumSpec,
  FieldSpec,
  InstanceSpec,
  NumberModifier,
  NumberSpec,
  PlaylistSpec,
  PresenceModifier,
  RefFieldModifier,
  RefModifier,
  RefSpec,
  TextModifier,
  TextSpec,
} from "./criteria.js";
import type {
  CLIP_FIELDS,
  FieldSpecOf,
  FilterBodyKey,
  GALLERY_FIELDS,
  GROUP_FIELDS,
  IMAGE_FIELDS,
  ListKind,
  PERFORMER_FIELDS,
  RandomSortKey,
  SCENE_FIELDS,
  STUDIO_FIELDS,
  SortDirection,
  SortOf,
  TAG_FIELDS,
} from "./fields.js";
import type { WhereGroup } from "./tree.js";

// =============================================================================
// CRITERIA
// =============================================================================

/**
 * Ids as `"id:instanceId"`; a bare id matches that id on every instance.
 * IS_NULL ("has none") and NOT_NULL ("has any"), where the field offers
 * them, take an empty value. `excludes`, where the field takes them, are
 * ids none of which a row may have, beside the value's (an EXCLUDES
 * modifier adds them to its own); value and excludes hold at most
 * MAX_REF_VALUES together.
 */
export interface RefInput<M extends RefFieldModifier = RefFieldModifier> {
  value: string[];
  modifier?: M | null;
  excludes?: string[];
}

/** A hierarchical ref: depth -1 adds every descendant, n that many levels (the excludes' too) */
export interface HierarchicalRefInput<
  M extends RefFieldModifier = RefFieldModifier,
> extends RefInput<M> {
  depth?: number | null;
}

/**
 * Peek playlist ids (positive integers, at most MAX_PLAYLIST_VALUES); a
 * playlist the viewer may not read holds no scenes for them
 */
export interface PlaylistInput {
  value: number[];
  modifier?: RefModifier | null;
}

/** T when the field offers IS_NULL or NOT_NULL, else never */
type WithPresence<M extends string, T> = [
  Extract<M, PresenceModifier>,
] extends [never]
  ? never
  : T;

/** T when the field offers BETWEEN, else never */
type WithBetween<M extends string, T> = [Extract<M, "BETWEEN">] extends [never]
  ? never
  : T;

/**
 * NOT_BETWEEN also needs value2; BETWEEN takes either side alone (value
 * alone is at least it, value2 alone at most it); IS_NULL and NOT_NULL no
 * value
 */
export type NumberInput<M extends NumberModifier = NumberModifier> =
  | {
      modifier?: Exclude<M, PresenceModifier> | null;
      value: number;
      value2?: number | null;
    }
  | WithBetween<
      M,
      { modifier: "BETWEEN"; value?: number | null; value2?: number | null }
    >
  | WithPresence<
      M,
      {
        modifier: Extract<M, PresenceModifier>;
        value?: null;
        value2?: null;
      }
    >;

/**
 * Values are YYYY-MM-DD dates or ISO date-times. NOT_BETWEEN also needs
 * value2; BETWEEN takes either side alone (value alone is from that day on,
 * value2 alone up to the end of its day); IS_NULL and NOT_NULL no value
 */
export type DateInput<M extends DateModifier = DateModifier> =
  | {
      modifier?: Exclude<M, PresenceModifier> | null;
      value: string;
      value2?: string | null;
    }
  | WithBetween<
      M,
      { modifier: "BETWEEN"; value?: string | null; value2?: string | null }
    >
  | WithPresence<
      M,
      {
        modifier: Extract<M, PresenceModifier>;
        value?: null;
        value2?: null;
      }
    >;

export type TextInput<M extends TextModifier = TextModifier> =
  | { modifier?: Exclude<M, PresenceModifier> | null; value: string }
  | WithPresence<M, { modifier: Extract<M, PresenceModifier>; value?: null }>;

export interface EnumInput<
  V extends string = string,
  M extends EnumModifier = EnumModifier,
> {
  value: V;
  modifier?: M | null;
}

/** Any of these values; IS_NULL and NOT_NULL (where offered) no value */
export type MultiEnumInput<
  V extends string = string,
  M extends EnumModifier = EnumModifier,
> =
  | { value: V[]; modifier?: Exclude<M, PresenceModifier> | null }
  | WithPresence<M, { modifier: Extract<M, PresenceModifier>; value?: null }>;

/** One field's criterion as sent */
export type CriterionInput<S extends FieldSpec> =
  S extends RefSpec<EntityKind, infer M, infer H>
    ? H extends true
      ? HierarchicalRefInput<M>
      : RefInput<M>
    : S extends PlaylistSpec
      ? PlaylistInput
      : S extends NumberSpec<infer M>
        ? NumberInput<M>
        : S extends DateSpec<infer M>
          ? DateInput<M>
          : S extends TextSpec<infer M>
            ? TextInput<M>
            : S extends EnumSpec<infer V, infer M, infer Multi>
              ? Multi extends true
                ? MultiEnumInput<V, M>
                : EnumInput<V, M>
              : S extends BooleanSpec
                ? boolean
                : S extends InstanceSpec
                  ? string
                  : never;

/** The parent key of a field carried inside a nested object, else never */
type ParentOf<S> = S extends {
  readonly path: readonly [infer P extends string, string];
}
  ? P
  : never;

/** A nested field's key under parent P, else never */
type ChildOf<S, P extends string> = S extends {
  readonly path: readonly [P, infer C extends string];
}
  ? C
  : never;

type NestedParent<F> = { [K in keyof F]: ParentOf<F[K]> }[keyof F];

/**
 * An `<entity>_filter` as sent: one optional criterion per field, the nested
 * ones (a tag's `scenes_filter.id`) under their parent key
 */
export type FilterInput<F extends Readonly<Record<string, FieldSpec>>> = {
  [K in keyof F as ParentOf<F[K]> extends never ? K : never]?: CriterionInput<
    F[K]
  >;
} & {
  [P in NestedParent<F> & string]?: {
    [K in keyof F as ChildOf<F[K], P>]?: CriterionInput<F[K]>;
  };
};

export type SceneFilterInput = FilterInput<typeof SCENE_FIELDS>;
export type PerformerFilterInput = FilterInput<typeof PERFORMER_FIELDS>;
export type StudioFilterInput = FilterInput<typeof STUDIO_FIELDS>;
export type TagFilterInput = FilterInput<typeof TAG_FIELDS>;
export type GroupFilterInput = FilterInput<typeof GROUP_FIELDS>;
export type GalleryFilterInput = FilterInput<typeof GALLERY_FIELDS>;
export type ImageFilterInput = FilterInput<typeof IMAGE_FIELDS>;
export type ClipFilterInput = FilterInput<typeof CLIP_FIELDS>;

// =============================================================================
// REQUESTS
// =============================================================================

/** The `filter` object of a list request: paging, sort and text search */
export interface ListPageInput<E extends ListKind> {
  page?: number;
  /** 1 to PER_PAGE_MAX */
  per_page?: number;
  sort?: SortOf<E> | RandomSortKey;
  direction?: SortDirection;
  q?: string;
  /**
   * false: the page alone, its `count` null (a page change of a list whose
   * total the client already holds); counted when absent
   */
  count?: false;
}

/** `POST /api/library/<entities>`: paging, top-level ids and the entity's filter */
export type ListRequestInput<E extends ListKind> = {
  filter?: ListPageInput<E>;
  /** Only these, as `"id:instanceId"` */
  ids?: string[];
  /**
   * The user's rows as AND/OR groups. A request is `<base> AND
   * <entity>_filter AND where AND <search>`; the base is never inside it.
   */
  where?: WhereGroup<E>;
} & { [K in FilterBodyKey<E>]?: FilterInput<FieldSpecOf<E>> };

/**
 * `POST /api/library/clips`: paging, sort and search, and the clip filter
 * (`clip_filter`); clips take no top-level ids
 */
export type ClipListRequestInput = Omit<ListRequestInput<"clip">, "ids">;
