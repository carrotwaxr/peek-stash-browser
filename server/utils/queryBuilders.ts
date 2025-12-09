/**
 * Query Builders for SQLite Cache
 *
 * Helper functions to build Prisma where clauses from UI filter objects.
 * Used by CachedEntityQueryService for database-level filtering.
 *
 * Note: Complex filters (performers, tags, groups via junction tables)
 * are still applied in JavaScript for now. These query builders handle
 * the indexed fields that can be efficiently queried at database level.
 */

import type { Prisma } from "@prisma/client";

/**
 * Common filter criterion structure from frontend
 */
interface FilterCriterion<T> {
  value?: T;
  value2?: T;
  modifier?: string;
}

/**
 * Apply numeric comparison filter to where clause
 */
export function applyNumericFilter<T extends Record<string, unknown>>(
  where: T,
  field: keyof T,
  criterion: FilterCriterion<number> | undefined
): T {
  if (!criterion || criterion.value === undefined) return where;

  const { modifier, value, value2 } = criterion;

  switch (modifier) {
    case "EQUALS":
      return { ...where, [field]: value };
    case "NOT_EQUALS":
      return { ...where, [field]: { not: value } };
    case "GREATER_THAN":
      return { ...where, [field]: { gt: value } };
    case "LESS_THAN":
      return { ...where, [field]: { lt: value } };
    case "BETWEEN":
      if (value2 !== undefined) {
        return { ...where, [field]: { gte: value, lte: value2 } };
      }
      return where;
    case "IS_NULL":
      return { ...where, [field]: null };
    case "NOT_NULL":
      return { ...where, [field]: { not: null } };
    default:
      return where;
  }
}

/**
 * Apply string comparison filter to where clause
 */
export function applyStringFilter<T extends Record<string, unknown>>(
  where: T,
  field: keyof T,
  criterion: FilterCriterion<string> | undefined
): T {
  if (!criterion || !criterion.value) return where;

  const { modifier, value } = criterion;

  switch (modifier) {
    case "EQUALS":
      return { ...where, [field]: value };
    case "NOT_EQUALS":
      return { ...where, [field]: { not: value } };
    case "INCLUDES":
    case "MATCHES_REGEX":
      return { ...where, [field]: { contains: value } };
    case "EXCLUDES":
      return { ...where, [field]: { not: { contains: value } } };
    case "IS_NULL":
      return { ...where, [field]: null };
    case "NOT_NULL":
      return { ...where, [field]: { not: null } };
    default:
      return where;
  }
}

/**
 * Apply date comparison filter to where clause
 */
export function applyDateFilter<T extends Record<string, unknown>>(
  where: T,
  field: keyof T,
  criterion: FilterCriterion<string> | undefined
): T {
  if (!criterion || !criterion.value) return where;

  const { modifier, value, value2 } = criterion;

  switch (modifier) {
    case "EQUALS":
      return { ...where, [field]: value };
    case "NOT_EQUALS":
      return { ...where, [field]: { not: value } };
    case "GREATER_THAN":
      return { ...where, [field]: { gt: value } };
    case "LESS_THAN":
      return { ...where, [field]: { lt: value } };
    case "BETWEEN":
      if (value2) {
        return { ...where, [field]: { gte: value, lte: value2 } };
      }
      return where;
    case "IS_NULL":
      return { ...where, [field]: null };
    case "NOT_NULL":
      return { ...where, [field]: { not: null } };
    default:
      return where;
  }
}

/**
 * Apply boolean filter to where clause
 */
export function applyBooleanFilter<T extends Record<string, unknown>>(
  where: T,
  field: keyof T,
  value: boolean | undefined
): T {
  if (value === undefined) return where;
  return { ...where, [field]: value };
}

/**
 * Build scene where clause from indexed fields
 * Complex filters (performers, tags, etc.) are applied in JavaScript
 */
export function buildSceneIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenSceneIds?: string[]
): Prisma.CachedSceneWhereInput {
  let where: Prisma.CachedSceneWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden scenes
  if (hiddenSceneIds && hiddenSceneIds.length > 0) {
    where.id = { notIn: hiddenSceneIds };
  }

  if (!filters) return where;

  // Studio filter (exact match on indexed field)
  if (filters.studios?.value?.length === 1 && filters.studios.modifier === "INCLUDES") {
    where.studioId = filters.studios.value[0];
  }

  // Date filter
  if (filters.date) {
    where = applyDateFilter(where, "date", filters.date) as Prisma.CachedSceneWhereInput;
  }

  // Rating filter
  if (filters.rating100) {
    where = applyNumericFilter(where, "rating100", filters.rating100) as Prisma.CachedSceneWhereInput;
  }

  // Duration filter (in seconds)
  if (filters.duration) {
    where = applyNumericFilter(where, "duration", filters.duration) as Prisma.CachedSceneWhereInput;
  }

  // Organized filter
  if (filters.organized !== undefined) {
    where.organized = filters.organized;
  }

  return where;
}

/**
 * Build performer where clause from indexed fields
 */
export function buildPerformerIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenPerformerIds?: string[]
): Prisma.CachedPerformerWhereInput {
  let where: Prisma.CachedPerformerWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden performers
  if (hiddenPerformerIds && hiddenPerformerIds.length > 0) {
    where.id = { notIn: hiddenPerformerIds };
  }

  if (!filters) return where;

  // Name filter
  if (filters.name) {
    where = applyStringFilter(where, "name", filters.name) as Prisma.CachedPerformerWhereInput;
  }

  // Gender filter
  if (filters.gender?.value) {
    where.gender = filters.gender.value;
  }

  // Favorite filter (from Stash)
  if (filters.filter_favorites !== undefined) {
    where.favorite = filters.filter_favorites;
  }

  // Rating filter
  if (filters.rating100) {
    where = applyNumericFilter(where, "rating100", filters.rating100) as Prisma.CachedPerformerWhereInput;
  }

  // Scene count filter
  if (filters.scene_count) {
    where = applyNumericFilter(where, "sceneCount", filters.scene_count) as Prisma.CachedPerformerWhereInput;
  }

  return where;
}

/**
 * Build studio where clause from indexed fields
 */
export function buildStudioIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenStudioIds?: string[]
): Prisma.CachedStudioWhereInput {
  let where: Prisma.CachedStudioWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden studios
  if (hiddenStudioIds && hiddenStudioIds.length > 0) {
    where.id = { notIn: hiddenStudioIds };
  }

  if (!filters) return where;

  // Name filter
  if (filters.name) {
    where = applyStringFilter(where, "name", filters.name) as Prisma.CachedStudioWhereInput;
  }

  // Parent filter
  if (filters.parents?.value?.length > 0) {
    const { modifier, value } = filters.parents;
    if (modifier === "INCLUDES") {
      where.parentId = { in: value };
    } else if (modifier === "EXCLUDES") {
      where.parentId = { notIn: value };
    } else if (modifier === "IS_NULL") {
      where.parentId = null;
    }
  }

  // Favorite filter
  if (filters.filter_favorites !== undefined) {
    where.favorite = filters.filter_favorites;
  }

  // Rating filter
  if (filters.rating100) {
    where = applyNumericFilter(where, "rating100", filters.rating100) as Prisma.CachedStudioWhereInput;
  }

  // Scene count filter
  if (filters.scene_count) {
    where = applyNumericFilter(where, "sceneCount", filters.scene_count) as Prisma.CachedStudioWhereInput;
  }

  return where;
}

/**
 * Build tag where clause from indexed fields
 */
export function buildTagIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenTagIds?: string[]
): Prisma.CachedTagWhereInput {
  let where: Prisma.CachedTagWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden tags
  if (hiddenTagIds && hiddenTagIds.length > 0) {
    where.id = { notIn: hiddenTagIds };
  }

  if (!filters) return where;

  // Name filter
  if (filters.name) {
    where = applyStringFilter(where, "name", filters.name) as Prisma.CachedTagWhereInput;
  }

  // Favorite filter
  if (filters.filter_favorites !== undefined) {
    where.favorite = filters.filter_favorites;
  }

  // Scene count filter
  if (filters.scene_count) {
    where = applyNumericFilter(where, "sceneCount", filters.scene_count) as Prisma.CachedTagWhereInput;
  }

  return where;
}

/**
 * Build group where clause from indexed fields
 */
export function buildGroupIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenGroupIds?: string[]
): Prisma.CachedGroupWhereInput {
  let where: Prisma.CachedGroupWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden groups
  if (hiddenGroupIds && hiddenGroupIds.length > 0) {
    where.id = { notIn: hiddenGroupIds };
  }

  if (!filters) return where;

  // Name filter
  if (filters.name) {
    where = applyStringFilter(where, "name", filters.name) as Prisma.CachedGroupWhereInput;
  }

  // Studio filter
  if (filters.studios?.value?.length === 1 && filters.studios.modifier === "INCLUDES") {
    where.studioId = filters.studios.value[0];
  }

  // Date filter
  if (filters.date) {
    where = applyDateFilter(where, "date", filters.date) as Prisma.CachedGroupWhereInput;
  }

  // Rating filter
  if (filters.rating100) {
    where = applyNumericFilter(where, "rating100", filters.rating100) as Prisma.CachedGroupWhereInput;
  }

  return where;
}

/**
 * Build gallery where clause from indexed fields
 */
export function buildGalleryIndexedWhere(
  filters: Record<string, any> | undefined,
  hiddenGalleryIds?: string[]
): Prisma.CachedGalleryWhereInput {
  let where: Prisma.CachedGalleryWhereInput = {
    deletedAt: null,
  };

  // Exclude hidden galleries
  if (hiddenGalleryIds && hiddenGalleryIds.length > 0) {
    where.id = { notIn: hiddenGalleryIds };
  }

  if (!filters) return where;

  // Title filter
  if (filters.title) {
    where = applyStringFilter(where, "title", filters.title) as Prisma.CachedGalleryWhereInput;
  }

  // Studio filter
  if (filters.studios?.value?.length === 1 && filters.studios.modifier === "INCLUDES") {
    where.studioId = filters.studios.value[0];
  }

  // Date filter
  if (filters.date) {
    where = applyDateFilter(where, "date", filters.date) as Prisma.CachedGalleryWhereInput;
  }

  // Rating filter
  if (filters.rating100) {
    where = applyNumericFilter(where, "rating100", filters.rating100) as Prisma.CachedGalleryWhereInput;
  }

  // Image count filter
  if (filters.image_count) {
    where = applyNumericFilter(where, "imageCount", filters.image_count) as Prisma.CachedGalleryWhereInput;
  }

  return where;
}

/**
 * Build sort order for Prisma queries
 */
export function buildSortOrder(
  sortField: string,
  direction: "asc" | "desc"
): Record<string, "asc" | "desc"> {
  // Map common sort fields to database column names
  const fieldMap: Record<string, string> = {
    title: "title",
    name: "name",
    date: "date",
    created_at: "stashCreatedAt",
    updated_at: "stashUpdatedAt",
    rating: "rating100",
    rating100: "rating100",
    duration: "duration",
    scene_count: "sceneCount",
    image_count: "imageCount",
    random: "id", // Random sort handled differently
  };

  const dbField = fieldMap[sortField] || sortField;
  return { [dbField]: direction };
}
