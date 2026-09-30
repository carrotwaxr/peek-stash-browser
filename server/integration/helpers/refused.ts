/**
 * A request the parser refused. Unknown or invalid list input answers 400
 * with one issue per problem, each naming its path.
 */
import { expect } from "vitest";
import type { ApiErrorResponse } from "../../types/api/index.js";

/** Expects a 400 whose issues name exactly these paths, in order */
export function expectRefused(
  response: { status: number; data: unknown },
  paths: readonly string[]
): void {
  expect(response.status).toBe(400);
  const { issues } = response.data as ApiErrorResponse;
  expect((issues ?? []).map((issue) => issue.path)).toEqual(paths);
}
