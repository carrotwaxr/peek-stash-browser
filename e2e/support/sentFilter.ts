/**
 * A list request's criterion of one field, wherever the request carries it
 * (W10): the user's rows go in `where`, the page's own criteria (a detail
 * page's entity, the folder's tag, the timeline's date) in
 * `<entity>_filter`. `sentCriterion` reads the first root row of the field
 * in `where`, then the field in the entity's filter object.
 */
type Body = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A field's criterion in a list request body; undefined when it sends none */
export function sentCriterion<T = Record<string, unknown>>(
  body: unknown,
  field: string
): T | undefined {
  if (!isObject(body)) return undefined;
  const where = body.where;
  if (isObject(where) && Array.isArray(where.rules)) {
    for (const rule of where.rules as unknown[]) {
      if (isObject(rule) && rule.field === field) return rule.criterion as T;
    }
  }
  for (const [key, filter] of Object.entries(body)) {
    if (key.endsWith("_filter") && isObject(filter) && field in filter) {
      return filter[field] as T;
    }
  }
  return undefined;
}
