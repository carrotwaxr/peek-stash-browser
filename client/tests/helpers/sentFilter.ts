/**
 * What a list request filters by, flat (W10): the entity's filter object
 * (what the page fixes, a list's default) with each root row of the
 * request's `where` beside it, by field. A test of what a panel row sends
 * reads it here; where each part goes is `tests/utils/listQuery.test.ts`'s.
 * A `where` with a group or under "match any" has no flat form: it throws.
 */
export function sentFilter(
  query: Readonly<Record<string, unknown>> | null | undefined,
  filterKey: string
): Record<string, unknown> {
  if (!query) throw new Error("no request was sent");
  const filter = query[filterKey];
  const where = query.where as
    | {
        match: string;
        rules: readonly { field?: string; criterion?: unknown }[];
      }
    | undefined;
  if (where !== undefined && where.match !== "all") {
    throw new Error(`a "match ${where.match}" where has no flat form`);
  }
  const rows = (where?.rules ?? []).map((rule) => {
    if (rule.field === undefined) {
      throw new Error("a where with a group has no flat form");
    }
    return [rule.field, rule.criterion] as const;
  });
  return {
    ...(typeof filter === "object" && filter !== null ? filter : {}),
    ...Object.fromEntries(rows),
  };
}
