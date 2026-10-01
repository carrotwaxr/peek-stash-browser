import { describe, expect, it } from "vitest";
import { type Budgets, checkBudget } from "../../scripts/bundleBudget.mjs";

const budgets: Budgets = {
  maxChunkKB: 1000,
  chunkKB: { Scene: 905, "video-vendor": 650 },
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
        firstLoad: [
          { name: "index", size: kB(541), gzip: kB(158) },
          { name: "react-vendor", size: kB(50), gzip: kB(17) },
        ],
      },
      budgets
    );

    expect(violations).toEqual([]);
  });
});
