import { describe, expect, it } from "vitest";
import {
  PICK_WINDOW,
  pickVaried,
} from "../../services/RecommendationScoringService.js";
import { SeededRandom } from "../../utils/seededRandom.js";

interface Item {
  id: number;
  final: number;
  topLead: string | null;
  studio: string | null;
}

const item = (
  id: number,
  final: number,
  topLead: string | null,
  studio: string | null = null
): Item => ({ id, final, topLead, studio });

/** 100 scenes of lead "a" scoring 10, 100 of distinct leads scoring 8 */
const mixed = (): Item[] => [
  ...Array.from({ length: 100 }, (_, i) => item(i, 10, "a")),
  ...Array.from({ length: 100 }, (_, i) => item(100 + i, 8, `lead-${i}`)),
];

describe("pickVaried", () => {
  it("returns [] for an empty input", () => {
    expect(pickVaried([], 10, new SeededRandom(1))).toEqual([]);
  });

  it("keeps one favorite lead from filling the top of the list", () => {
    const picked = pickVaried(mixed(), 100, new SeededRandom(1));
    const firstLead = picked.slice(0, 20).filter((s) => s.topLead === "a");
    expect(firstLead.length).toBeLessThan(10);
  });

  it("never exceeds the limit and holds no duplicates", () => {
    const picked = pickVaried(mixed(), 50, new SeededRandom(1));
    expect(picked).toHaveLength(50);
    expect(new Set(picked.map((s) => s.id)).size).toBe(50);
  });

  it("returns every input once when the limit covers them", () => {
    const input = mixed();
    for (const limit of [input.length, input.length + 100]) {
      const picked = pickVaried(input, limit, new SeededRandom(1));
      expect(picked.map((s) => s.id).sort((a, b) => a - b)).toEqual(
        input.map((s) => s.id)
      );
    }
  });

  it("is the same for the same seed and differs for another", () => {
    const ids = (seed: number) =>
      pickVaried(mixed(), 100, new SeededRandom(seed)).map((s) => s.id);
    expect(ids(7)).toEqual(ids(7));
    expect(ids(7)).not.toEqual(ids(8));
  });

  it("shuffles only within windows of the greedy order", () => {
    // Windows of the greedy order, from a run with a no-op shuffle
    const noShuffle = { shuffle: <T>(a: T[]) => a } as SeededRandom;
    const greedy = pickVaried(mixed(), 100, noShuffle).map((s) => s.id);
    const shuffled = pickVaried(mixed(), 100, new SeededRandom(3)).map(
      (s) => s.id
    );

    expect(shuffled).not.toEqual(greedy);
    for (let start = 0; start < greedy.length; start += PICK_WINDOW) {
      expect(shuffled.slice(start, start + PICK_WINDOW).sort()).toEqual(
        greedy.slice(start, start + PICK_WINDOW).sort()
      );
    }
  });

  it("penalizes a studio that has already been picked", () => {
    const input = [
      item(0, 10, null, "s1"),
      item(1, 10, null, "s1"),
      item(2, 9.5, null, "s2"),
    ];
    const noShuffle = { shuffle: <T>(a: T[]) => a } as SeededRandom;
    expect(pickVaried(input, 3, noShuffle).map((s) => s.id)).toEqual([0, 2, 1]);
  });

  it("breaks ties by input order", () => {
    const input = [0, 1, 2, 3].map((id) => item(id, 5, null));
    const noShuffle = { shuffle: <T>(a: T[]) => a } as SeededRandom;
    expect(pickVaried(input, 4, noShuffle).map((s) => s.id)).toEqual([
      0, 1, 2, 3,
    ]);
  });
});
