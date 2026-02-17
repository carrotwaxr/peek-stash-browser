import type {
  TypedAuthRequest,
  TypedResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  UpdatePerformerParams,
  UpdatePerformerRequest,
  UpdatePerformerResponse,
  ApiErrorResponse,
  AmbiguousLookupResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  NormalizedPerformer,
  PeekPerformerFilter,
} from "../../types/index.js";
import { disambiguateEntityNames, getEntityInstanceId } from "../../utils/entityInstanceId.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Parse a career_length string into years of career duration.
 *
 * Stash stores career_length as a free-text string with various formats:
 * - "2015-present" or "2015-" → calculate years from start to current year
 * - "2010-2018" → calculate years between start and end
 * - "5" or "5 years" → extract numeric duration directly
 *
 * @param careerLengthStr The career_length string from Stash
 * @returns Number of years, or null if unparseable/empty
 */
export function parseCareerLength(careerLengthStr: string | null | undefined): number | null {
  if (!careerLengthStr || careerLengthStr.trim() === "") {
    return null;
  }

  const str = careerLengthStr.trim().toLowerCase();
  const currentYear = new Date().getFullYear();

  // Pattern: "2015-present", "2015-", "2015 - present", "2015 -"
  // Matches: start year with optional end that's "present", empty, or missing
  const activePattern = /^(\d{4})\s*[-–—]\s*(present|current|now|\s*)$/i;
  const activeMatch = str.match(activePattern);
  if (activeMatch) {
    const startYear = parseInt(activeMatch[1], 10);
    if (startYear > 1900 && startYear <= currentYear) {
      return currentYear - startYear;
    }
  }

  // Pattern: "2010-2018", "2010 - 2018"
  // Matches: start year to end year
  const rangePattern = /^(\d{4})\s*[-–—]\s*(\d{4})$/;
  const rangeMatch = str.match(rangePattern);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1], 10);
    const endYear = parseInt(rangeMatch[2], 10);
    if (startYear > 1900 && endYear >= startYear && endYear <= currentYear + 1) {
      return endYear - startYear;
    }
  }

  // Pattern: "5", "5 years", "10 yrs"
  // Matches: just a number optionally followed by "years" or "yrs"
  const numericPattern = /^(\d+)\s*(years?|yrs?)?$/i;
  const numericMatch = str.match(numericPattern);
  if (numericMatch) {
    const years = parseInt(numericMatch[1], 10);
    if (years >= 0 && years <= 100) {
      return years;
    }
  }

  // Pattern: standalone 4-digit year like "2015" (assume active from that year)
  const yearOnlyPattern = /^(\d{4})$/;
  const yearOnlyMatch = str.match(yearOnlyPattern);
  if (yearOnlyMatch) {
    const startYear = parseInt(yearOnlyMatch[1], 10);
    if (startYear > 1900 && startYear <= currentYear) {
      return currentYear - startYear;
    }
  }

  // Unable to parse
  return null;
}

/**
 * Merge user-specific data into performers
 * OPTIMIZED: Now uses pre-computed stats from database instead of calculating on-the-fly
 */
export async function mergePerformersWithUserData(
  performers: NormalizedPerformer[],
  userId: number
): Promise<NormalizedPerformer[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, performerStats] = await Promise.all([
    prisma.performerRating.findMany({ where: { userId } }),
    userStatsService.getPerformerStats(userId),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      `${r.performerId}\0${r.instanceId || ""}`,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return performers.map((performer) => {
    const compositeKey = `${performer.id}\0${performer.instanceId || ""}`;
    const stats = performerStats.get(compositeKey) || {
      oCounter: 0,
      playCount: 0,
      lastPlayedAt: null,
      lastOAt: null,
    };
    return {
      ...performer,
      ...ratingMap.get(compositeKey),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
      last_played_at: stats.lastPlayedAt,
      last_o_at: stats.lastOAt,
    };
  });
}

/**
 * Find performers using SQL query builder
 * Uses PerformerQueryBuilder for SQL-native filtering, sorting, and pagination.
 */
export const findPerformers = async (
  req: TypedAuthRequest<FindPerformersRequest>,
  res: TypedResponse<FindPerformersResponse | ApiErrorResponse | AmbiguousLookupResponse>
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const requestingUser = req.user;
    const { filter, performer_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "name";
    const sortDirection = (filter?.direction || "ASC").toUpperCase() as "ASC" | "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random sort to extract seed for consistent pagination
    const { sortField, randomSeed } = parseRandomSort(sortFieldRaw, requestingUser.id);

    // Merge root-level ids with performer_filter
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : performer_filter?.ids;
    const mergedFilter: PeekPerformerFilter = {
      ...performer_filter,
      ids: normalizedIds,
    };

    // Extract specific instance ID for disambiguation (from performer_filter.instance_id)
    const specificInstanceId = (performer_filter as any)?.instance_id as string | undefined;

    // Use SQL query builder - admins skip exclusions
    const applyExclusions = requestingUser?.role !== "ADMIN";

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { performers, total } = await performerQueryBuilder.execute({
      userId,
      filters: mergedFilter,
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: sortField,
      sortDirection,
      page,
      perPage,
      searchQuery,
      randomSeed,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (ids && ids.length === 1 && !specificInstanceId && performers.length > 1) {
      logger.warn("Ambiguous performer lookup", {
        id: ids[0],
        matchCount: performers.length,
        instances: performers.map(p => p.instanceId),
      });
      return res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple performers found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: performers.map(p => ({
          id: p.id,
          name: p.name,
          instanceId: p.instanceId,
        })),
      });
    }

    // For single-entity requests (detail pages), hydrate tags
    let resultPerformers = performers;
    if (ids && ids.length === 1 && performers.length === 1) {
      resultPerformers = await hydrateEntityTags(performers);
    }

    // Add stashUrl to each performer
    const performersWithStashUrl = resultPerformers.map(performer => ({
      ...performer,
      stashUrl: buildStashEntityUrl('performer', performer.id),
    }));

    logger.info("findPerformers completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: performersWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findPerformers: {
        count: total,
        performers: performersWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findPerformers", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply performer filters
 */
export async function applyPerformerFilters(
  performers: NormalizedPerformer[],
  filters: (PeekPerformerFilter & Record<string, any>) | null | undefined
): Promise<NormalizedPerformer[]> {
  if (!filters) return performers;

  let filtered = performers;

  // Filter by IDs (for detail pages)
  // ids is normalized to { value: string[], modifier?: string } format
  if (filters.ids && filters.ids.value && filters.ids.value.length > 0) {
    const idSet = new Set(filters.ids.value);
    filtered = filtered.filter((p) => idSet.has(p.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((p) => p.favorite === filters.favorite);
  }

  // Filter by gender
  if (filters.gender) {
    const { modifier, value } = filters.gender;
    filtered = filtered.filter((p) => {
      if (modifier === "EQUALS") return p.gender === value;
      if (modifier === "NOT_EQUALS") return p.gender !== value;
      return true;
    });
  }

  // Filter by tags
  if (filters.tags) {
    const { modifier, value: tagIds } = filters.tags;
    if (tagIds && tagIds.length > 0) {
      filtered = filtered.filter((p) => {
        const performerTagIds = (p.tags || []).map((t: any) => String(t.id));
        const filterTagIds = tagIds.map(String);

        if (modifier === "INCLUDES_ALL") {
          return filterTagIds.every((id: string) =>
            performerTagIds.includes(id)
          );
        }
        if (modifier === "INCLUDES") {
          return filterTagIds.some((id: string) =>
            performerTagIds.includes(id)
          );
        }
        if (modifier === "EXCLUDES") {
          return !filterTagIds.some((id: string) =>
            performerTagIds.includes(id)
          );
        }
        return true;
      });
    }
  }

  // Filter by studios
  // Note: Performers don't have a direct studio relationship in Stash
  // We need to filter by performers who appear in scenes from specific studios
  // Uses efficient SQL join query instead of loading all scenes
  if (filters.studios && filters.studios.value) {
    const studioIds = filters.studios.value.map(String);
    const performerIdsInStudios = await stashEntityService.getPerformerIdsByStudios(studioIds);
    filtered = filtered.filter((p) => performerIdsInStudios.has(p.id));
  }

  // Filter by groups
  // Note: Performers don't have a direct group relationship in Stash
  // We need to filter by performers who appear in scenes from specific groups
  // Uses efficient SQL join query instead of loading all scenes
  if (filters.groups && filters.groups.value) {
    const groupIds = filters.groups.value.map(String);
    const performerIdsInGroups = await stashEntityService.getPerformerIdsByGroups(groupIds);
    filtered = filtered.filter((p) => performerIdsInGroups.has(p.id));
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((p) => {
      const rating = p.rating100 || 0;
      if (modifier === "GREATER_THAN") return rating > value;
      if (modifier === "LESS_THAN") return rating < value;
      if (modifier === "EQUALS") return rating === value;
      if (modifier === "NOT_EQUALS") return rating !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          rating >= value &&
          rating <= value2
        );
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((p) => {
      const oCounter = p.o_counter || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && oCounter > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && oCounter < value;
      if (modifier === "EQUALS") return oCounter === value;
      if (modifier === "NOT_EQUALS") return oCounter !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          oCounter >= value &&
          oCounter <= value2
        );
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((p) => {
      const playCount = p.play_count || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && playCount > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && playCount < value;
      if (modifier === "EQUALS") return playCount === value;
      if (modifier === "NOT_EQUALS") return playCount !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          playCount >= value &&
          playCount <= value2
        );
      return true;
    });
  }

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((p) => {
      const sceneCount = p.scene_count || 0;
      if (modifier === "GREATER_THAN") return sceneCount > value;
      if (modifier === "LESS_THAN") return sceneCount < value;
      if (modifier === "EQUALS") return sceneCount === value;
      if (modifier === "NOT_EQUALS") return sceneCount !== value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          sceneCount >= value &&
          sceneCount <= value2
        );
      return true;
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((p) => {
      if (!p.created_at) return false;
      const performerDate = new Date(p.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at (date)
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((p) => {
      if (!p.updated_at) return false;
      const performerDate = new Date(p.updated_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by name (text search)
  if (filters.name) {
    const { modifier, value } = filters.name;
    if (value) {
      const searchValue = value.toLowerCase();
      filtered = filtered.filter((p) => {
        const name = (p.name || "").toLowerCase();
        const aliases = (p.alias_list || []).join(" ").toLowerCase();
        const combinedText = name + " " + aliases;
        if (modifier === "INCLUDES" || !modifier) return combinedText.includes(searchValue);
        if (modifier === "EXCLUDES") return !combinedText.includes(searchValue);
        if (modifier === "EQUALS") return name === searchValue;
        if (modifier === "NOT_EQUALS") return name !== searchValue;
        return true;
      });
    }
  }

  // Filter by details (text search)
  if (filters.details) {
    const { modifier, value } = filters.details;
    if (value) {
      const searchValue = value.toLowerCase();
      filtered = filtered.filter((p) => {
        const details = (p.details || "").toLowerCase();
        if (modifier === "INCLUDES" || !modifier) return details.includes(searchValue);
        if (modifier === "EXCLUDES") return !details.includes(searchValue);
        return true;
      });
    }
  }

  // Filter by tattoos (text search)
  if (filters.tattoos) {
    const { modifier, value } = filters.tattoos;
    if (value) {
      const searchValue = value.toLowerCase();
      filtered = filtered.filter((p) => {
        const tattoos = (p.tattoos || "").toLowerCase();
        if (modifier === "INCLUDES" || !modifier) return tattoos.includes(searchValue);
        if (modifier === "EXCLUDES") return !tattoos.includes(searchValue);
        return true;
      });
    }
  }

  // Filter by piercings (text search)
  if (filters.piercings) {
    const { modifier, value } = filters.piercings;
    if (value) {
      const searchValue = value.toLowerCase();
      filtered = filtered.filter((p) => {
        const piercings = (p.piercings || "").toLowerCase();
        if (modifier === "INCLUDES" || !modifier) return piercings.includes(searchValue);
        if (modifier === "EXCLUDES") return !piercings.includes(searchValue);
        return true;
      });
    }
  }

  // Filter by measurements (text search)
  if (filters.measurements) {
    const { modifier, value } = filters.measurements;
    if (value) {
      const searchValue = value.toLowerCase();
      filtered = filtered.filter((p) => {
        const measurements = (p.measurements || "").toLowerCase();
        if (modifier === "INCLUDES" || !modifier) return measurements.includes(searchValue);
        if (modifier === "EXCLUDES") return !measurements.includes(searchValue);
        return true;
      });
    }
  }

  // Filter by height (numeric range in cm)
  if (filters.height) {
    const { modifier, value, value2 } = filters.height;
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((p) => {
        const height = p.height_cm || 0;
        if (modifier === "GREATER_THAN") return height > value;
        if (modifier === "LESS_THAN") return height < value;
        if (modifier === "EQUALS") return height === value;
        if (modifier === "NOT_EQUALS") return height !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return height >= value && height <= value2;
        }
        return true;
      });
    }
  }

  // Filter by weight (numeric range in kg)
  if (filters.weight) {
    const { modifier, value, value2 } = filters.weight;
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((p) => {
        const weight = p.weight || 0;
        if (modifier === "GREATER_THAN") return weight > value;
        if (modifier === "LESS_THAN") return weight < value;
        if (modifier === "EQUALS") return weight === value;
        if (modifier === "NOT_EQUALS") return weight !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return weight >= value && weight <= value2;
        }
        return true;
      });
    }
  }

  // Filter by penis_length (numeric range in cm)
  if (filters.penis_length) {
    const { modifier, value, value2 } = filters.penis_length;
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((p) => {
        const penisLength = p.penis_length || 0;
        if (modifier === "GREATER_THAN") return penisLength > value;
        if (modifier === "LESS_THAN") return penisLength < value;
        if (modifier === "EQUALS") return penisLength === value;
        if (modifier === "NOT_EQUALS") return penisLength !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return penisLength >= value && penisLength <= value2;
        }
        return true;
      });
    }
  }

  // Filter by eye_color (enum/string) - case-insensitive comparison
  if (filters.eye_color) {
    const { modifier, value } = filters.eye_color;
    if (value) {
      const searchValue = value.toUpperCase();
      filtered = filtered.filter((p) => {
        const eyeColor = (p.eye_color || "").toUpperCase();
        if (modifier === "EQUALS" || !modifier) return eyeColor === searchValue;
        if (modifier === "NOT_EQUALS") return eyeColor !== searchValue;
        return true;
      });
    }
  }

  // Filter by ethnicity (enum/string) - case-insensitive comparison
  if (filters.ethnicity) {
    const { modifier, value } = filters.ethnicity;
    if (value) {
      const searchValue = value.toUpperCase();
      filtered = filtered.filter((p) => {
        const ethnicity = (p.ethnicity || "").toUpperCase();
        if (modifier === "EQUALS" || !modifier) return ethnicity === searchValue;
        if (modifier === "NOT_EQUALS") return ethnicity !== searchValue;
        return true;
      });
    }
  }

  // Filter by hair_color (enum/string) - case-insensitive comparison
  if (filters.hair_color) {
    const { modifier, value } = filters.hair_color;
    if (value) {
      const searchValue = value.toUpperCase();
      filtered = filtered.filter((p) => {
        const hairColor = (p.hair_color || "").toUpperCase();
        if (modifier === "EQUALS" || !modifier) return hairColor === searchValue;
        if (modifier === "NOT_EQUALS") return hairColor !== searchValue;
        return true;
      });
    }
  }

  // Filter by fake_tits/breast_type (enum/string) - case-insensitive comparison
  if (filters.fake_tits) {
    const { modifier, value } = filters.fake_tits;
    if (value) {
      const searchValue = value.toUpperCase();
      filtered = filtered.filter((p) => {
        const fakeTits = (p.fake_tits || "").toUpperCase();
        if (modifier === "EQUALS" || !modifier) return fakeTits === searchValue;
        if (modifier === "NOT_EQUALS") return fakeTits !== searchValue;
        return true;
      });
    }
  }

  // Filter by birth_year (numeric range)
  if (filters.birth_year) {
    const { modifier, value, value2 } = filters.birth_year;
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((p) => {
        if (!p.birthdate) return false;
        const birthYear = new Date(p.birthdate).getFullYear();
        if (modifier === "GREATER_THAN") return birthYear > value;
        if (modifier === "LESS_THAN") return birthYear < value;
        if (modifier === "EQUALS") return birthYear === value;
        if (modifier === "NOT_EQUALS") return birthYear !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return birthYear >= value && birthYear <= value2;
        }
        return true;
      });
    }
  }

  // Filter by death_year (numeric range)
  if (filters.death_year) {
    const { modifier, value, value2 } = filters.death_year;
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((p) => {
        if (!p.death_date) return false;
        const deathYear = new Date(p.death_date).getFullYear();
        if (modifier === "GREATER_THAN") return deathYear > value;
        if (modifier === "LESS_THAN") return deathYear < value;
        if (modifier === "EQUALS") return deathYear === value;
        if (modifier === "NOT_EQUALS") return deathYear !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return deathYear >= value && deathYear <= value2;
        }
        return true;
      });
    }
  }

  // Filter by age (numeric range - calculated from birthdate)
  if (filters.age) {
    const { modifier, value, value2 } = filters.age;
    if (value !== undefined && value !== null) {
      const today = new Date();
      filtered = filtered.filter((p) => {
        if (!p.birthdate) return false;
        const birthDate = new Date(p.birthdate);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (modifier === "GREATER_THAN") return age > value;
        if (modifier === "LESS_THAN") return age < value;
        if (modifier === "EQUALS") return age === value;
        if (modifier === "NOT_EQUALS") return age !== value;
        if (modifier === "BETWEEN" && value2 !== undefined && value2 !== null) {
          return age >= value && age <= value2;
        }
        return true;
      });
    }
  }

  // Filter by career_length (numeric range in years)
  if (filters.career_length) {
    const careerFilter = filters.career_length as { value?: number; value2?: number; modifier?: string };
    const { modifier, value, value2 } = careerFilter;
    // For BETWEEN, we need at least one bound; for other modifiers we need value
    const hasValidFilter = (modifier === "BETWEEN" && (value !== undefined || value2 !== undefined)) ||
                           (modifier !== "BETWEEN" && value !== undefined && value !== null);
    if (hasValidFilter) {
      filtered = filtered.filter((p) => {
        const careerLength = parseCareerLength(p.career_length);
        // Exclude performers with unparseable career_length
        if (careerLength === null) return false;
        if (modifier === "GREATER_THAN" && value !== undefined) return careerLength > value;
        if (modifier === "LESS_THAN" && value !== undefined) return careerLength < value;
        if (modifier === "EQUALS") return careerLength === value;
        if (modifier === "NOT_EQUALS") return careerLength !== value;
        if (modifier === "BETWEEN") {
          // Support partial ranges (min only, max only, or both)
          const minOk = value === undefined || value === null || careerLength >= value;
          const maxOk = value2 === undefined || value2 === null || careerLength <= value2;
          return minOk && maxOk;
        }
        return true;
      });
    }
  }

  // Filter by birthdate (date range)
  if (filters.birthdate) {
    const { modifier, value, value2 } = filters.birthdate;
    filtered = filtered.filter((p) => {
      if (!p.birthdate) return false;
      const performerDate = new Date(p.birthdate);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by death_date (date range)
  if (filters.death_date) {
    const { modifier, value, value2 } = filters.death_date;
    filtered = filtered.filter((p) => {
      if (!p.death_date) return false;
      const performerDate = new Date(p.death_date);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (
  req: TypedAuthRequest<FindPerformersMinimalRequest>,
  res: TypedResponse<FindPerformersMinimalResponse | ApiErrorResponse>
) => {
  try {
    const { filter, count_filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let performers = await stashEntityService.getAllPerformers();

    // Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    const userId = req.user?.id;
    if (requestingUser?.role !== "ADMIN") {
      performers = await entityExclusionHelper.filterExcluded(
        performers,
        userId,
        "performer"
      );
    }

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_scene_count, min_gallery_count, min_image_count, min_group_count } = count_filter;
      performers = performers.filter((p) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined) conditions.push(p.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined) conditions.push(p.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined) conditions.push(p.image_count >= min_image_count);
        if (min_group_count !== undefined) conditions.push(p.group_count >= min_group_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || "";
        const aliases = p.alias_list?.join(" ") || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Sort
    performers.sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortField] || "";
      const bValue = (b as Record<string, unknown>)[sortField] || "";
      const comparison =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0;
      return sortDirection.toUpperCase() === "DESC" ? -comparison : comparison;
    });

    // Paginate (if per_page !== -1)
    let paginatedPerformers = performers;
    if (perPage !== -1 && perPage > 0) {
      paginatedPerformers = performers.slice(0, perPage);
    }

    // Disambiguate names for entities with same name across different instances
    // Only non-default instances get suffixed with instance name when duplicates exist
    const entitiesWithInstance = paginatedPerformers.map((p) => ({
      id: p.id,
      name: p.name,
      instanceId: p.instanceId,
    }));
    const minimal = disambiguateEntityNames(entitiesWithInstance);

    res.json({
      performers: minimal,
    });
  } catch (error) {
    logger.error("Error in findPerformersMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updatePerformer = async (
  req: TypedAuthRequest<UpdatePerformerRequest, UpdatePerformerParams>,
  res: TypedResponse<UpdatePerformerResponse | ApiErrorResponse>
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const instanceId = await getEntityInstanceId('performer', id);
    const stash = stashInstanceManager.get(instanceId);
    if (!stash) {
      return res.status(404).json({ error: "Stash instance not found for performer" });
    }

    const updatedPerformer = await stash.performerUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    if (!updatedPerformer.performerUpdate) {
      return res.status(500).json({ error: "Performer update returned null" });
    }

    res.json({ success: true, performer: updatedPerformer.performerUpdate as NormalizedPerformer });
  } catch (error) {
    console.error("Error updating performer:", error);
    res.status(500).json({ error: "Failed to update performer" });
  }
};
