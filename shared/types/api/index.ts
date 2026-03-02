// shared/types/api/index.ts
/**
 * Shared API Types Index
 *
 * Re-exports all dependency-free API request/response types.
 * Server-internal types (Express, Prisma, GraphQL dependencies) remain in server/types/api/.
 */

export * from "./common.js";
export * from "./user.js";
export * from "./ratings.js";
export * from "./watchHistory.js";
export * from "./imageViewHistory.js";
export * from "./setup.js";
export * from "./userStats.js";
export * from "./download.js";
export * from "./groups.js";
export * from "./clips.js";
export * from "./timeline.js";
export * from "./stats.js";
