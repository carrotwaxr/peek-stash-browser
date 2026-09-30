/**
 * What the request parser (`utils/listRequest.ts`) hands the query builders:
 * one already-valid criterion per contract field, the sort, the page and the
 * search text. The builders rely on it: no unknown keys, every modifier
 * present and valid for its field, refs parsed into pairs with at most
 * MAX_REF_VALUES per criterion, depth normalised, the sort a member of the
 * list's sort keys, the direction upper-case.
 */
import type {
  BooleanSpec,
  CLIP_PARAMS,
  DateSpec,
  EntityKind,
  EnumSpec,
  FieldSpec,
  FieldSpecOf,
  InstanceSpec,
  ListKind,
  NumberSpec,
  RefModifier,
  RefSpec,
  SortOf,
  TextSpec,
} from "@peek/shared-types/filters/index.js";
import type { MinimalCountFilter, MinimalScope } from "./api/index.js";

/**
 * A parsed filter value. `instanceId` undefined is a bare legacy id, which
 * matches that id on every allowed instance (server-sql.md). The resolved
 * ref, with its instance known, is `EntityRef` in `utils/entityRef.ts`.
 */
export interface FilterRef {
  readonly id: string;
  readonly instanceId: string | undefined;
}

/** refs is never empty. depth is 0 unless the field is hierarchical; -1 means every descendant. */
export interface RefCriterion {
  readonly refs: readonly FilterRef[];
  /** Single-valued fields never INCLUDES_ALL */
  readonly modifier: RefModifier;
  readonly depth: number;
}

export type NumberCriterion =
  | {
      readonly modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN";
      readonly value: number;
    }
  | {
      readonly modifier: "BETWEEN" | "NOT_BETWEEN";
      readonly value: number;
      readonly value2: number;
    }
  | { readonly modifier: "IS_NULL" | "NOT_NULL" };

/** Values are validated YYYY-MM-DD or ISO date-times, not reinterpreted: column kinds are item 43's (PR 9). */
export type DateCriterion =
  | {
      readonly modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN";
      readonly value: string;
    }
  | {
      readonly modifier: "BETWEEN" | "NOT_BETWEEN";
      readonly value: string;
      readonly value2: string;
    }
  | { readonly modifier: "IS_NULL" | "NOT_NULL" };

/** The value is trimmed, 1 to the field's maxLength characters */
export type TextCriterion =
  | {
      readonly modifier: "INCLUDES" | "EXCLUDES" | "EQUALS" | "NOT_EQUALS";
      readonly value: string;
    }
  | { readonly modifier: "IS_NULL" | "NOT_NULL" };

export interface EnumCriterion<V extends string> {
  readonly modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN";
  readonly value: V;
}

/** Any of these values; never empty */
export interface MultiEnumCriterion<V extends string> {
  readonly modifier: "INCLUDES";
  readonly values: readonly V[];
}

/** The parsed criterion of one field spec */
export type CriterionOf<S extends FieldSpec> = S extends RefSpec
  ? RefCriterion
  : S extends NumberSpec
    ? NumberCriterion
    : S extends DateSpec
      ? DateCriterion
      : S extends TextSpec
        ? TextCriterion
        : S extends EnumSpec<
              infer V,
              EnumSpec["modifiers"][number],
              infer Multi
            >
          ? Multi extends true
            ? MultiEnumCriterion<V>
            : EnumCriterion<V>
          : S extends BooleanSpec
            ? boolean
            : never;

/**
 * One optional, already-valid criterion per field of a table; booleans stay
 * boolean. The instance field is lifted out to `specificInstanceId`.
 */
export type ParsedFields<F extends Readonly<Record<string, FieldSpec>>> = {
  readonly [K in keyof F as F[K] extends InstanceSpec
    ? never
    : K]?: CriterionOf<F[K]>;
};

/** The parsed `<entity>_filter`; top-level ids are merged into `ids` (INCLUDES) */
export type ParsedFilter<E extends EntityKind> = ParsedFields<FieldSpecOf<E>>;

export interface ParsedSort<K extends ListKind> {
  /** Whitelisted; "random_<n>" arrives as field "random", seed n % 1e8 */
  readonly field: SortOf<K>;
  readonly direction: "ASC" | "DESC";
  /** Set only for random (the daily seed unless given) */
  readonly seed: number | undefined;
}

export interface ParsedListRequest<E extends EntityKind> {
  /** >= 1 */
  readonly page: number;
  /** 1..PER_PAGE_MAX */
  readonly perPage: number;
  /** Trimmed, non-empty, at most 200 characters */
  readonly q: string | undefined;
  readonly sort: ParsedSort<E>;
  readonly filter: ParsedFilter<E>;
  /** `<entity>_filter.instance_id`, INSTANCE_ID_PATTERN */
  readonly specificInstanceId: string | undefined;
  /**
   * `filter.count`: false reads the page alone and answers a null total (a
   * page change of a list whose total the client holds); counted otherwise
   */
  readonly count?: boolean;
}

/**
 * `GET /api/clips`: the filter parameters. `isGenerated` absent lists every
 * clip; the Clips page sends true for its default ("With preview only").
 */
export type ParsedClipFilter = ParsedFields<typeof CLIP_PARAMS>;

export interface ParsedClipQuery {
  readonly page: number;
  readonly perPage: number;
  readonly q: string | undefined;
  readonly sort: ParsedSort<"clip">;
  readonly filter: ParsedClipFilter;
  /** The `instanceId` parameter, INSTANCE_ID_PATTERN */
  readonly specificInstanceId: string | undefined;
  /** The `count` parameter: false reads the page alone, as the list's `filter.count` */
  readonly count?: boolean;
}

/**
 * What the clip builder takes: the parsed clip query (`isGenerated` absent:
 * every clip, as the Clips page's All clips and a scene's clips with
 * ungenerated ones).
 */
export type ClipListRequest = ParsedClipQuery;

/** `GET /api/scenes/:id/clips` */
export interface ParsedSceneClipsQuery {
  /** The `:id` path parameter, a Stash id */
  readonly sceneId: string;
  /** Clips without a generated preview too; false when absent */
  readonly includeUngenerated: boolean;
  /** The required `instanceId` parameter, INSTANCE_ID_PATTERN */
  readonly instanceId: string;
}

/** `GET /api/library/scenes/:id/similar`: 12 scenes a page */
export interface ParsedSimilarScenesQuery {
  /** The `:id` path parameter, a Stash id */
  readonly sceneId: string;
  /** >= 1 */
  readonly page: number;
  /** The seed's instance (the required `instanceId`), INSTANCE_ID_PATTERN */
  readonly instanceId: string;
}

/** `GET /api/library/scenes/recommended` */
export interface ParsedRecommendedQuery {
  /** >= 1 */
  readonly page: number;
  /** 1..PER_PAGE_MAX; 24 when absent */
  readonly perPage: number;
}

/** `GET /api/playlists/:id` */
export interface ParsedPlaylistItemsQuery {
  /**
   * One page of the items the viewer can see: page >= 1, perPage
   * 1..PLAYLIST_ITEMS_PER_PAGE_MAX (50 when absent). Undefined without
   * `page` and `per_page`: every item.
   */
  readonly paging:
    | { readonly page: number; readonly perPage: number }
    | undefined;
}

/** The lists with a `/minimal` endpoint (the entity pickers) */
export type MinimalKind = "performer" | "studio" | "tag" | "group" | "gallery";

/** `POST /api/library/<entities>/minimal`: one page, always in name order */
export interface ParsedMinimalRequest<E extends MinimalKind> {
  readonly entity: E;
  readonly q: string | undefined;
  /** 1..MINIMAL_PER_PAGE_MAX; 50 when absent */
  readonly perPage: number;
  /**
   * Only these entities (at most MINIMAL_IDS_MAX); a bare ref matches its id
   * on every instance. Undefined when absent or empty.
   */
  readonly ids: readonly FilterRef[] | undefined;
  /** Only the keys sent, each a non-negative integer; OR semantics */
  readonly countFilter: MinimalCountFilter | undefined;
  /**
   * "allEnabled": every live entity on every enabled, synced instance, in
   * place of the user's selection and without the user's exclusions (an
   * admin's Content Restrictions editor); undefined for what the user sees.
   * Whether the user may send it is the query's check.
   */
  readonly scope: MinimalScope | undefined;
}
