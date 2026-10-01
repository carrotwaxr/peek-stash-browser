import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../src");

// The tailwind-palette red, green, yellow and blue every banner used to
// hand-roll. Status colours come from the theme's --status-* variables
// (StatusMessage), so a theme change reaches them all.
const HAND_ROLLED =
  /rgba\(\s*(239,\s*68,\s*68|34,\s*197,\s*94|234,\s*179,\s*8|59,\s*130,\s*246)/;

/** Files allowed to keep a literal, each with the reason. */
const ALLOWED: string[] = [];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("status colours", () => {
  it("no component hand-rolls a status colour", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => !ALLOWED.includes(file))
      .filter((file) =>
        HAND_ROLLED.test(readFileSync(join(SRC, file), "utf8"))
      );

    expect(offenders).toEqual([]);
  });
});
