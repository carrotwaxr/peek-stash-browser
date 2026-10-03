/**
 * A View's filters checked on save (9b, Contract 6): the flat filter state
 * a URL holds, whose keys may carry a row prefix (Contract 3, `parseRowKey`).
 *
 * - A key is the root's `match` or a group's `g1` to `g5` ("all" or "any"),
 *   a panel key or companion with or without a row prefix, or a contract
 *   field of the list at the root (a page's permanent criterion, kept as
 *   today). Anything else is refused with its path.
 * - Rows are the distinct (group, occurrence, panel key) of the panel keys;
 *   a companion (`tagIdsModifier`, `tagIdsDepth`, `tagIdsExclude`) belongs
 *   to its row and is not one of its own, even with no panel key beside it. At most 20 rows and 5 groups (`WHERE_LIMITS`), and
 *   64 KB of filters.
 * - What is saved is the filters cleaned as a stored preset is
 *   (`cleanViewFilters`): a bare id is tied to its one enabled instance
 *   through `lookup` and kept as sent when it cannot be (it then matches on
 *   every instance, as today; a client that reads an old View or link keeps
 *   its bare ids, so refusing them would lock the user out of saving it), a
 *   multi row's lone value becomes a list, and a companion whose value its
 *   field refuses goes.
 */
import {
  type ListKind,
  WHERE_LIMITS,
} from "@peek/shared-types/filters/index.js";
import {
  type BareRefLookup,
  cleanViewFilters,
  filterKeyRole,
  isMatchValue,
} from "../services/StoredFilterCleaner.js";
import type { ApiErrorIssue } from "../types/api/common.js";

export { isViewSort } from "../services/StoredFilterCleaner.js";

/** A View's filters over this many bytes (as JSON) are refused whole */
export const VIEW_FILTERS_MAX_BYTES = 64 * 1024;

export interface ViewFiltersOptions {
  /** A bare id's instance; none leaves every bare id bare */
  readonly lookup?: BareRefLookup;
}

/** The filters to save, or every problem found with its path */
export type ViewFiltersResult =
  | {
      readonly filters: Record<string, unknown>;
      /** Bare ids tied to their one instance */
      readonly refsRewritten: number;
      /** Bare ids no single live entity has, kept as sent */
      readonly refsLeftBare: number;
    }
  | { readonly issues: ApiErrorIssue[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks a View's filters for the list `kind` and answers what to save */
export function validateViewFilters(
  kind: ListKind,
  filters: unknown,
  { lookup }: ViewFiltersOptions = {}
): ViewFiltersResult {
  if (!isPlainObject(filters)) {
    return { issues: [{ path: "filters", message: "Expected an object" }] };
  }
  // JSON.stringify answers undefined for a value with no JSON form
  const text = JSON.stringify(filters) as string | undefined;
  if (Buffer.byteLength(text ?? "") > VIEW_FILTERS_MAX_BYTES) {
    return {
      issues: [{ path: "filters", message: "Filters are limited to 64 KB" }],
    };
  }

  const issues: ApiErrorIssue[] = [];
  const rows = new Set<string>();
  const groups = new Set<number>();
  for (const [key, value] of Object.entries(filters)) {
    const path = `filters.${key}`;
    const role = filterKeyRole(kind, key);
    switch (role.kind) {
      case "match":
        if (role.group > 0) groups.add(role.group);
        if (!isMatchValue(value)) {
          issues.push({ path, message: 'Expected "all" or "any"' });
        }
        break;
      case "row":
        if (role.group > 0) groups.add(role.group);
        // A row is counted from its panel key: a companion alone (no panel
        // key beside it) is no row, and the client drops it on read
        if (role.key === role.row) {
          rows.add(JSON.stringify([role.group, role.occurrence, role.row]));
        }
        break;
      case "permanent":
        break;
      case "prefixedPermanent":
        issues.push({
          path,
          message: "A page's own criterion is kept at the root only",
        });
        break;
      case "unknown":
        issues.push({ path, message: "Not a filter of this list" });
        break;
    }
  }
  if (rows.size > WHERE_LIMITS.rows) {
    issues.push({
      path: "filters",
      message: `At most ${WHERE_LIMITS.rows} rows`,
    });
  }
  if (groups.size > WHERE_LIMITS.groups) {
    issues.push({
      path: "filters",
      message: `At most ${WHERE_LIMITS.groups} groups`,
    });
  }
  if (issues.length > 0) return { issues };

  const cleaned = cleanViewFilters(kind, filters, lookup);
  return {
    filters: cleaned.value,
    refsRewritten: cleaned.report.refsRewritten,
    refsLeftBare: cleaned.report.refsLeftBare,
  };
}
