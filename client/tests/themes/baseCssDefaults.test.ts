import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { defaultTheme, themes } from "../../src/themes/themes";

/**
 * base.css declares the peek theme's variables on :root, so a page paints in
 * Peek's colours before any script runs and whenever no theme applies. The
 * copy is checked against themes.ts so the two cannot drift.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseCssPath = resolve(__dirname, "../../src/themes/base.css");

/**
 * One value as the formatter writes it: double quotes, lower-case hex colours
 * and single spaces
 */
const normalize = (value: string) =>
  value
    .replace(/'/g, '"')
    .replace(/#[0-9a-f]{3,8}\b/gi, (hex) => hex.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();

/** The declarations of the stylesheet's top-level :root block */
function rootDeclarations(css: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = /(?:^|\n):root\s*\{([^}]*)\}/.exec(withoutComments)?.[1];
  if (block === undefined) throw new Error("base.css has no :root block");
  const declarations: Record<string, string> = {};
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    declarations[name] = normalize(declaration.slice(colon + 1));
  }
  return declarations;
}

describe("base.css defaults", () => {
  it("base.css :root declares every variable of the peek theme with its value", () => {
    const declared = rootDeclarations(readFileSync(baseCssPath, "utf8"));
    const expected = Object.fromEntries(
      Object.entries(themes[defaultTheme].properties).map(([name, value]) => [
        name,
        normalize(value),
      ])
    );
    expect(defaultTheme).toBe("peek");
    expect(declared).toEqual(expected);
  });
});
