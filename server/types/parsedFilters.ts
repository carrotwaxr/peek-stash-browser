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
import type { MinimalCountFilter } from "./api/index.js";

/** What happens to unknown or invalid input: ignored with a record, or a 400 */
export type FilterPolicy = "drop" | "reject";

/** One piece of input the parser ignored (drop mode only) */
export interface DroppedInput {
  readonly path: string;
  readonly reason: string;
}

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
  /** Drop mode only; empty in reject mode */
  readonly dropped: readonly DroppedInput[];
}

/** `GET /api/clips`: the filter parameters, with `isGenerated` always set (true when absent) */
export type ParsedClipFilter = ParsedFields<typeof CLIP_PARAMS> & {
  readonly isGenerated: boolean;
};

export interface ParsedClipQuery {
  readonly page: number;
  readonly perPage: number;
  readonly q: string | undefined;
  readonly sort: ParsedSort<"clip">;
  readonly filter: ParsedClipFilter;
  /** The `instanceId` parameter, INSTANCE_ID_PATTERN */
  readonly specificInstanceId: string | undefined;
  readonly dropped: readonly DroppedInput[];
}

/** The lists with a `/minimal` endpoint (the entity pickers) */
export type MinimalKind = "performer" | "studio" | "tag" | "group" | "gallery";

/** `POST /api/library/<entities>/minimal`: name order only */
export interface ParsedMinimalRequest<E extends MinimalKind> {
  readonly entity: E;
  readonly q: string | undefined;
  readonly sort: "name";
  readonly direction: "ASC" | "DESC";
  /** 1..PER_PAGE_MAX */
  readonly perPage: number;
  /** Only the keys sent, each a non-negative integer; OR semantics */
  readonly countFilter: MinimalCountFilter | undefined;
  readonly dropped: readonly DroppedInput[];
}
