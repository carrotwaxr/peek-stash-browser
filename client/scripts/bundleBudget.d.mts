export interface ChunkSize {
  /** The chunk's file name without its content hash and extension. */
  name: string;
  /** Minified size in bytes. */
  size: number;
  /** Gzip size in bytes. */
  gzip: number;
}

export interface Budgets {
  /** Default limit for one chunk, kB. */
  maxChunkKB: number;
  /** Limits for named chunks, kB; these replace `maxChunkKB`. */
  chunkKB: Record<string, number>;
  /** Entry plus modulepreloads, gzip kB. */
  firstLoadGzipKB: number;
}

export const budgets: Budgets;

export function checkBudget(
  sizes: { chunks: ChunkSize[]; firstLoad: ChunkSize[] },
  limits: Budgets
): string[];
