/**
 * Seeded random number generator for consistent shuffling.
 * Uses LCG (Linear Congruential Generator) algorithm matching java.util.Random.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate random integer between 0 (inclusive) and max (exclusive)
   */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /**
   * Fisher-Yates shuffle an array in place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

/**
 * Generate a daily seed for consistent random ordering within a day.
 * Combines userId with day number for user-specific randomization.
 */
export function generateDailySeed(userId: number): number {
  const dayNumber = Math.floor(Date.now() / 86400000);
  return (userId + dayNumber) % 1e8;
}

/**
 * Parse sort field for random seed.
 * Handles both "random" (generates seed) and "random_12345" (uses provided seed).
 */
export function parseRandomSort(
  sortField: string,
  userId: number
): { sortField: string; randomSeed?: number } {
  if (sortField.startsWith('random_')) {
    const seedStr = sortField.slice(7);
    const parsedSeed = parseInt(seedStr, 10);
    if (!isNaN(parsedSeed)) {
      return {
        sortField: 'random',
        randomSeed: parsedSeed % 1e8,
      };
    }
  }

  if (sortField === 'random') {
    return {
      sortField: 'random',
      randomSeed: generateDailySeed(userId),
    };
  }

  return { sortField };
}
