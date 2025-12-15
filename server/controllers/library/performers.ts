import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import type {
  NormalizedPerformer,
  PeekPerformerFilter,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";

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
      r.performerId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return performers.map((performer) => {
    const stats = performerStats.get(performer.id) || {
      oCounter: 0,
      playCount: 0,
      lastPlayedAt: null,
      lastOAt: null,
    };
    return {
      ...performer,
      ...ratingMap.get(performer.id),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
      last_played_at: stats.lastPlayedAt,
      last_o_at: stats.lastOAt,
    };
  });
}

/**
 * Simplified findPerformers using cache
 */
export const findPerformers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { filter, performer_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all performers from cache
    let performers = await stashEntityService.getAllPerformers();

    if (performers.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findPerformers: {
          count: 0,
          performers: [],
        },
      });
    }

    // Step 2: Apply content restrictions & empty entity filtering with caching
    // NOTE: We apply user stats AFTER this to ensure fresh data
    const requestingUser = req.user;
    const cacheVersion = await stashEntityService.getCacheVersion();

    // Try to get filtered performers from cache
    let filteredPerformers = filteredEntityCacheService.get(
      userId,
      "performers",
      cacheVersion
    ) as NormalizedPerformer[] | null;

    if (filteredPerformers === null) {
      // Cache miss - compute filtered performers
      logger.debug("Performers cache miss", { userId, cacheVersion });
      filteredPerformers = performers;

      // Apply content restrictions and hidden entity filtering
      // Hidden entities are ALWAYS filtered (for all users including admins)
      // Content restrictions (INCLUDE/EXCLUDE) are only applied to non-admins
      filteredPerformers =
        await userRestrictionService.filterPerformersForUser(
          filteredPerformers,
          userId,
          requestingUser?.role === "ADMIN" // Skip content restrictions for admins
        );

      // Filter empty performers (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        // CRITICAL FIX: Filter scenes first to get visibility baseline
        let visibleScenes = await stashEntityService.getAllScenesWithPerformers();
        visibleScenes = await userRestrictionService.filterScenesForUser(
          visibleScenes,
          userId
        );

        // Get all entities from cache
        let allGalleries = await stashEntityService.getAllGalleries();
        let allGroups = await stashEntityService.getAllGroups();

        // Apply user restrictions to groups/galleries FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );

        // Then filter for empty entities
        const visibleGalleries =
          emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups =
          emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter performers using properly restricted visibility sets
        // CRITICAL FIX: Pass visibleScenes to check actual visibility
        filteredPerformers = emptyEntityFilterService.filterEmptyPerformers(
          filteredPerformers,
          visibleGroups,
          visibleGalleries,
          visibleScenes // ← NEW: Pass visible scenes
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "performers",
        filteredPerformers,
        cacheVersion
      );
    } else {
      logger.debug("Performers cache hit", {
        userId,
        entityCount: filteredPerformers.length,
      });
    }

    // Use cached/filtered performers for remaining operations
    performers = filteredPerformers;

    // Step 3: Merge with FRESH user data (ratings, stats)
    // IMPORTANT: Do this AFTER filtered cache to ensure stats are always current
    performers = await mergePerformersWithUserData(performers, userId);

    // Step 4: Apply search query if provided
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

    // Step 5: Apply filters (merge root-level ids with performer_filter)
    const mergedFilter = {
      ...performer_filter,
      ids: ids || performer_filter?.ids,
    };
    performers = await applyPerformerFilters(performers, mergedFilter);

    // Step 6: Sort
    performers = sortPerformers(performers, sortField, sortDirection);

    // Step 7: Paginate
    const total = performers.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    let paginatedPerformers = performers.slice(startIndex, endIndex);

    // Step 8: For single-entity requests (detail pages), get performer with computed counts
    if (ids && ids.length === 1 && paginatedPerformers.length === 1) {
      // Get performer with computed counts from junction tables
      const performerWithCounts = await stashEntityService.getPerformer(ids[0]);
      if (performerWithCounts) {
        // Merge with the paginated performer data (which has user ratings/stats)
        const existingPerformer = paginatedPerformers[0];
        paginatedPerformers = [
          {
            ...existingPerformer,
            scene_count: performerWithCounts.scene_count,
            image_count: performerWithCounts.image_count,
            gallery_count: performerWithCounts.gallery_count,
            group_count: performerWithCounts.group_count,
          },
        ];

        // Hydrate tags with names
        paginatedPerformers = await hydrateEntityTags(paginatedPerformers);

        logger.info("Computed counts for performer detail", {
          performerId: existingPerformer.id,
          performerName: existingPerformer.name,
          sceneCount: performerWithCounts.scene_count,
          imageCount: performerWithCounts.image_count,
          galleryCount: performerWithCounts.gallery_count,
          groupCount: performerWithCounts.group_count,
        });
      }
    }

    // Add stashUrl to each performer
    const performersWithStashUrl = paginatedPerformers.map(performer => ({
      ...performer,
      stashUrl: buildStashEntityUrl('performer', performer.id),
    }));

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
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
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
 * Sort performers
 */
function sortPerformers(
  performers: NormalizedPerformer[],
  sortField: string,
  direction: string
): NormalizedPerformer[] {
  const sorted = [...performers];

  sorted.sort((a, b) => {
    const aValue = getPerformerFieldValue(a, sortField);
    const bValue = getPerformerFieldValue(b, sortField);

    // Handle null values for timestamp fields
    const isTimestampField =
      sortField === "last_played_at" || sortField === "last_o_at";
    if (isTimestampField) {
      const aIsNull = aValue === null || aValue === undefined;
      const bIsNull = bValue === null || bValue === undefined;

      // Both null - equal
      if (aIsNull && bIsNull) return 0;

      // One is null - nulls go to end for DESC, start for ASC
      if (aIsNull) return direction.toUpperCase() === "DESC" ? 1 : -1;
      if (bIsNull) return direction.toUpperCase() === "DESC" ? -1 : 1;

      // Both non-null - compare as strings (safely convert to string first)
      const comparison = String(aValue).localeCompare(String(bValue));
      return direction.toUpperCase() === "DESC" ? -comparison : comparison;
    }

    // Normal sorting for other fields
    let comparison = 0;
    if (typeof aValue === "string" && typeof bValue === "string") {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === "DESC") {
      comparison = -comparison;
    }

    // Secondary sort by name
    if (comparison === 0) {
      const aName = a.name || "";
      const bName = b.name || "";
      return aName.localeCompare(bName);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from performer for sorting
 */
function getPerformerFieldValue(
  performer: NormalizedPerformer,
  field: string
): number | string | boolean | null {
  if (field === "rating") return performer.rating || 0;
  if (field === "rating100") return performer.rating100 || 0;
  if (field === "o_counter") return performer.o_counter || 0;
  if (field === "play_count") return performer.play_count || 0;
  if (field === "scene_count" || field === "scenes_count")
    return performer.scene_count || 0;
  if (field === "name") return performer.name || "";
  if (field === "created_at") return performer.created_at || "";
  if (field === "updated_at") return performer.updated_at || "";
  if (field === "last_played_at") return performer.last_played_at; // Return null as-is for timestamps
  if (field === "last_o_at") return performer.last_o_at; // Return null as-is for timestamps
  if (field === "random") return Math.random();
  if (field === "height") return performer.height_cm || 0;
  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (performer as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}
/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let performers = await stashEntityService.getAllPerformers();

    // Apply content restrictions & empty entity filtering with caching
    const requestingUser = req.user;
    const userId = req.user?.id;
    const cacheVersion = await stashEntityService.getCacheVersion();

    // Try to get filtered performers from cache
    let filteredPerformers = filteredEntityCacheService.get(
      userId,
      "performers",
      cacheVersion
    ) as NormalizedPerformer[] | null;

    if (filteredPerformers === null) {
      // Cache miss - compute filtered performers
      logger.debug("Performers minimal cache miss", { userId, cacheVersion });
      filteredPerformers = performers;

      // Apply content restrictions and hidden entity filtering
      // Hidden entities are ALWAYS filtered (for all users including admins)
      // Content restrictions (INCLUDE/EXCLUDE) are only applied to non-admins
      filteredPerformers =
        await userRestrictionService.filterPerformersForUser(
          filteredPerformers,
          userId,
          requestingUser?.role === "ADMIN" // Skip content restrictions for admins
        );

      // Filter empty performers (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        // CRITICAL FIX: Filter scenes first to get visibility baseline
        let visibleScenes = await stashEntityService.getAllScenesWithPerformers();
        visibleScenes = await userRestrictionService.filterScenesForUser(
          visibleScenes,
          userId
        );

        // Get all entities from cache
        let allGalleries = await stashEntityService.getAllGalleries();
        let allGroups = await stashEntityService.getAllGroups();

        // Apply user restrictions to groups/galleries FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );

        // Then filter for empty entities
        const visibleGalleries =
          emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups =
          emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter performers using properly restricted visibility sets
        // CRITICAL FIX: Pass visibleScenes to check actual visibility
        filteredPerformers = emptyEntityFilterService.filterEmptyPerformers(
          filteredPerformers,
          visibleGroups,
          visibleGalleries,
          visibleScenes // ← NEW: Pass visible scenes
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "performers",
        filteredPerformers,
        cacheVersion
      );
    } else {
      logger.debug("Performers minimal cache hit", {
        userId,
        entityCount: filteredPerformers.length,
      });
    }

    // Use cached/filtered performers
    performers = filteredPerformers;

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

    const minimal = paginatedPerformers.map((p) => ({
      id: p.id,
      name: p.name,
    }));

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
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = stashInstanceManager.getDefault();
    const updatedPerformer = await stash.performerUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, performer: updatedPerformer.performerUpdate });
  } catch (error) {
    console.error("Error updating performer:", error);
    res.status(500).json({ error: "Failed to update performer" });
  }
};
