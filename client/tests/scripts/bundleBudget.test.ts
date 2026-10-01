import { describe, expect, it } from "vitest";
import {
  type Budgets,
  checkBudget,
  circularChunkWarnings,
} from "../../scripts/bundleBudget.mjs";

const budgets: Budgets = {
  maxChunkKB: 1000,
  chunkKB: { Scene: 905, "video-vendor": 650 },
  entryKB: 160,
  firstLoadGzipKB: 357,
};

const kB = (n: number) => n * 1000;

describe("checkBudget", () => {
  it("a chunk over the per-chunk limit is reported by name and size", () => {
    const violations = checkBudget(
      {
        chunks: [
          { name: "Home", size: kB(1001), gzip: kB(300) },
          { name: "Small", size: kB(20), gzip: kB(8) },
        ],
        entry: { name: "index", size: kB(100), gzip: kB(30) },
        firstLoad: [],
      },
      budgets
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Home");
    expect(violations[0]).toContain("1001");
    expect(violations[0]).toContain("1000");
  });

  it("a named exception uses its own limit", () => {
    const violations = checkBudget(
      {
        chunks: [
          { name: "video-vendor", size: kB(700), gzip: kB(190) },
          { name: "Scene", size: kB(900), gzip: kB(238) },
        ],
        entry: { name: "index", size: kB(100), gzip: kB(30) },
        firstLoad: [],
      },
      budgets
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("video-vendor");
    expect(violations[0]).toContain("650");
  });

  it("first-load gzip over budget is reported with entry plus preloads summed", () => {
    const violations = checkBudget(
      {
        chunks: [],
        entry: { name: "index", size: kB(150), gzip: kB(45) },
        firstLoad: [
          { name: "index", size: kB(500), gzip: kB(150) },
          { name: "react-vendor", size: kB(50), gzip: kB(17) },
          { name: "ui-vendor", size: kB(586), gzip: kB(200) },
        ],
      },
      budgets
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("First load");
    expect(violations[0]).toContain("367");
    expect(violations[0]).toContain("357");
  });

  it("no violations returns an empty list", () => {
    const violations = checkBudget(
      {
        chunks: [
          { name: "Scene", size: kB(861), gzip: kB(238) },
          { name: "video-vendor", size: kB(621), gzip: kB(177) },
        ],
        entry: { name: "index", size: kB(140), gzip: kB(41) },
        firstLoad: [
          { name: "index", size: kB(541), gzip: kB(158) },
          { name: "react-vendor", size: kB(50), gzip: kB(17) },
        ],
      },
      budgets
    );

    expect(violations).toEqual([]);
  });

  it("an entry over its own limit is reported, apart from other chunks of its name", () => {
    const violations = checkBudget(
      {
        chunks: [{ name: "index", size: kB(20), gzip: kB(6) }],
        entry: { name: "index", size: kB(545), gzip: kB(159) },
        firstLoad: [],
      },
      budgets
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Entry");
    expect(violations[0]).toContain("545");
    expect(violations[0]).toContain("160");
  });
});

describe("circularChunkWarnings", () => {
  it("returns each build-log line that warns of a circular dependency between chunks", () => {
    const log = [
      "vite v7 building for production...",
      'Export "default" of module "src/components/ui/SceneListItem.tsx" was reexported through module "src/components/ui/index.ts" while both modules are dependencies of each other and will end up in different chunks by current Rollup settings. This scenario is not well supported at the moment as it will produce a circular dependency between chunks and will likely lead to broken execution order.',
      "dist/assets/index-abc12345.js  140.00 kB",
      "Circular chunk: react-vendor -> ui-vendor -> react-vendor. Please adjust the manual chunk logic for these chunks.",
    ].join("\n");

    const warnings = circularChunkWarnings(log);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("SceneListItem");
    expect(warnings[1]).toContain("react-vendor -> ui-vendor");
  });

  it("a clean log has none", () => {
    expect(circularChunkWarnings("built in 20s\n")).toEqual([]);
  });
});
