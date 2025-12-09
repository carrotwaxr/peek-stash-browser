/**
 * SceneQueryBuilder - SQL-native scene querying
 *
 * Builds parameterized SQL queries for scene filtering, sorting, and pagination.
 * Eliminates the need to load all scenes into memory.
 */
import type { PeekSceneFilter, NormalizedScene } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface SceneQueryOptions {
  userId: number;
  filters?: PeekSceneFilter;
  excludedSceneIds?: Set<string>;
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}

// Query result
export interface SceneQueryResult {
  scenes: NormalizedScene[];
  total: number;
}

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder {
  /**
   * Execute a scene query with the given options
   */
  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    // TODO: Implement in subsequent tasks
    throw new Error("Not implemented");
  }
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
