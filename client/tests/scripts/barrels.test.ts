import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// vite.config.js marks every src/**/index.ts side-effect free
// (`treeshake.moduleSideEffects`), so a barrel's own code may be dropped from
// the build. That is only safe while a barrel holds nothing but re-exports.

const SRC = path.resolve(__dirname, "../../src");

function findBarrels(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findBarrels(full);
    return entry.name === "index.ts" ? [full] : [];
  });
}

/** The statements of a file that are not `export ... from "..."`. */
function nonReExports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  return source.statements
    .filter(
      (statement) =>
        !(ts.isExportDeclaration(statement) && statement.moduleSpecifier)
    )
    .map((statement) => statement.getText(source).split("\n")[0] ?? "");
}

describe("barrels", () => {
  const barrels = findBarrels(SRC);

  it("finds the src barrels", () => {
    expect(barrels.length).toBeGreaterThan(5);
  });

  it("every src index.ts only re-exports", () => {
    const offenders = barrels.flatMap((file) =>
      nonReExports(file).map(
        (statement) => `${path.relative(SRC, file)}: ${statement}`
      )
    );
    expect(offenders).toEqual([]);
  });

  it("a statement that is not a re-export is caught", () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "barrels-")),
      "index.ts"
    );
    fs.writeFileSync(
      file,
      [
        "// a comment",
        'export { a, b } from "./a";',
        'export type { C } from "./c";',
        'export * from "./d";',
        'import "./side-effect";',
        "export const local = 1;",
        "register();",
      ].join("\n")
    );
    expect(nonReExports(file)).toEqual([
      'import "./side-effect";',
      "export const local = 1;",
      "register();",
    ]);
  });
});
