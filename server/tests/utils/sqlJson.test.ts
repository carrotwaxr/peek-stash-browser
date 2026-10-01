/**
 * `jsonListOrEmpty` wraps a JSON list column so `json_each` never meets text
 * that is not JSON (a damaged cache row), run here against real SQLite.
 */
import { afterAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { jsonListOrEmpty } from "../../utils/sqlJson.js";
import { must } from "../helpers/must.js";

/** The number of items `json_each` yields for a bound value read as the column. */
async function listLength(value: string | null): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM (SELECT ? AS col) x CROSS JOIN json_each(${jsonListOrEmpty("x.col")}) je`,
    value
  );
  return Number(must(rows[0]).n);
}

describe("jsonListOrEmpty", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("wraps the column so text that is not JSON reads as an empty list", async () => {
    expect(await listLength("not json")).toBe(0);
    expect(await listLength(null)).toBe(0);
    expect(await listLength('["1"]')).toBe(1);
  });

  it("keeps a valid list's items", async () => {
    expect(await listLength('["1","2","3"]')).toBe(3);
  });
});
