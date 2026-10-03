/**
 * The VR code (the fork and three.js, about 750 kB) loads only through
 * loadVr's dynamic import. A static import of the fork, or of vrPlugin, from
 * any other source file would pull it into that file's chunk (the Scene page),
 * so the lint config refuses one. Type imports stay allowed.
 */
import { ESLint, Linter } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const RULE = "@typescript-eslint/no-restricted-imports";
const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const eslint = new ESLint({ cwd: clientRoot });

/** The rule messages the client's own lint config gives `code` in `file`. */
async function refusals(file: string, code: string): Promise<string[]> {
  const config = (await eslint.calculateConfigForFile(file)) as Linter.Config;
  const setting = config.rules?.[RULE];
  if (setting === undefined) return [];
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser },
        plugins: {
          "@typescript-eslint": tseslint.plugin,
        },
        rules: { [RULE]: setting },
      },
    ],
    { filename: path.join(clientRoot, file) }
  );
  return messages.map((message) => message.message);
}

const VR = "src/components/video-player/vr";

describe("the VR import rules", () => {
  it("refuse a static vrPlugin import from useVrMode", async () => {
    const messages = await refusals(
      `${VR}/useVrMode.ts`,
      'import { createVrController } from "./vrPlugin";\nvoid createVrController;\n'
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("loadVr");
  });

  it("refuse a side-effect vrPlugin import from VrControls", async () => {
    await expect(
      refusals(`${VR}/VrControls.ts`, 'import "./vrPlugin";\n')
    ).resolves.toHaveLength(1);
  });

  it("refuse vrPlugin by its alias path outside the folder", async () => {
    await expect(
      refusals(
        "src/components/video-player/useVideoPlayer.ts",
        'import "@/components/video-player/vr/vrPlugin";\n'
      )
    ).resolves.toHaveLength(1);
  });

  it("refuse the fork anywhere but vrPlugin", async () => {
    await expect(
      refusals(
        "src/components/video-player/useVideoPlayer.ts",
        'import "@blaineam/videojs-vr";\n'
      )
    ).resolves.toHaveLength(1);
    await expect(
      refusals(`${VR}/useVrMode.ts`, 'import "@blaineam/videojs-vr";\n')
    ).resolves.toHaveLength(1);
  });

  it("allow type imports of both", async () => {
    await expect(
      refusals(
        `${VR}/useVrMode.ts`,
        'import type { PeekVr } from "./vrPlugin";\nimport type { VrPlugin } from "@blaineam/videojs-vr";\nexport type T = [PeekVr, VrPlugin];\n'
      )
    ).resolves.toEqual([]);
  });

  it("allow the fork in vrPlugin and loadVr's import of vrPlugin", async () => {
    await expect(
      refusals(`${VR}/vrPlugin.ts`, 'import "@blaineam/videojs-vr";\n')
    ).resolves.toEqual([]);
    await expect(
      refusals(
        `${VR}/loadVr.ts`,
        'export const load = () => import("./vrPlugin");\n'
      )
    ).resolves.toEqual([]);
  });

  it("allow loadVr from anywhere", async () => {
    await expect(
      refusals(
        "src/components/video-player/useVideoPlayer.ts",
        'import { loadVr } from "./vr/loadVr";\nvoid loadVr;\n'
      )
    ).resolves.toEqual([]);
  });
});
