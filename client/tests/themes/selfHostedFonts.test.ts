import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { describe, expect, it } from "vitest";
import { fontOptions, themes } from "../../src/themes/themes";

/**
 * Peek serves its own fonts (item 84, CS-32): the page loads nothing from
 * Google, and every family a theme or the custom theme editor can pick has a
 * bundled @font-face from Fontsource. The build keeps the font files separate
 * rather than inlining them into the render-blocking CSS.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(__dirname, "../..");
const fontsPath = resolve(clientRoot, "src/themes/fonts.ts");

/** "'Space Grotesk', -apple-system, sans-serif" gives "space-grotesk". */
function fontsourceSlug(fontStack: string): string {
  const first = fontStack.split(",")[0] ?? "";
  return first.replace(/['"]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
}

function usableFontStacks(): string[] {
  const fromEditor = Object.values(fontOptions).flatMap((options) =>
    options.map((option) => option.value)
  );
  const fromThemes = Object.values(themes).flatMap((theme) =>
    Object.entries(theme.properties)
      .filter(([name]) => name.startsWith("--font-"))
      .map(([, value]) => String(value))
  );
  return [...fromEditor, ...fromThemes];
}

describe("self-hosted fonts", () => {
  it("index.html loads nothing from Google Fonts", () => {
    const html = readFileSync(resolve(clientRoot, "index.html"), "utf8");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  it("every font family a theme or the theme editor can use has a self-hosted @font-face import", () => {
    expect(existsSync(fontsPath), "src/themes/fonts.ts exists").toBe(true);
    const fonts = readFileSync(fontsPath, "utf8");

    const slugs = [...new Set(usableFontStacks().map(fontsourceSlug))];
    expect(slugs.length).toBeGreaterThan(0);

    const missing = slugs.filter(
      (slug) => !fonts.includes(`@fontsource/${slug}/`)
    );
    expect(missing).toEqual([]);
  });

  it("the build never inlines font files into the CSS", async () => {
    // A file URL keeps tsc from resolving the untyped JS config
    const configUrl = pathToFileURL(resolve(clientRoot, "vite.config.js")).href;
    const { default: viteConfig } = await import(configUrl);
    const inline = viteConfig.build.assetsInlineLimit as (
      filePath: string,
      content: Buffer
    ) => boolean | undefined;
    const content = Buffer.alloc(100);

    for (const font of [
      "/files/inter-latin-400-normal.woff2",
      "/files/inter-latin-400-normal.woff",
      "/fonts/icons.ttf",
      "/fonts/icons.otf",
    ]) {
      expect(inline(font, content), font).toBe(false);
    }
    expect(inline("/src/assets/logo.svg", content)).toBeUndefined();
  });
});
