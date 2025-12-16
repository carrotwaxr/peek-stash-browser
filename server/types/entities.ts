/**
 * Entity Type Definitions
 *
 * This file defines the Peek-specific entity types used throughout the server.
 *
 * Type Hierarchy:
 * 1. Base Types (from stashapp-api): Raw GraphQL types from Stash server - import directly from stashapp-api
 * 2. Normalized Types (defined here): Base types + Peek user data (ratings, favorites, watch history, etc.)
 *
 * Usage:
 * - Import base types from stashapp-api when working with raw Stash GraphQL responses
 * - Import Normalized types from here when working with cached data or API responses to clients
 */
import type {
  Gallery,
  Group,
  Performer,
  Scene,
  Studio,
  Tag,
} from "stashapp-api";

/**
 * Normalized Scene
 *
 * Extends the base Scene type from Stash with Peek-specific user data.
 * This is the primary type used throughout the application for scenes.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - rating100: User's 0-100 rating (null if unrated)
 * - favorite: Whether user favorited this scene
 * - o_counter: User's orgasm counter for this scene
 * - play_count: Number of times user played this scene
 * - play_duration: Total time user spent watching (seconds)
 * - resume_time: Last playback position (seconds)
 * - play_history: Array of ISO timestamps when scene was played
 * - o_history: Array of Date objects when orgasms were recorded
 * - last_played_at: ISO timestamp of last play (null if never played)
 * - last_o_at: ISO timestamp of last orgasm (null if never)
 */
export type NormalizedScene = Scene & {
  // Rating fields
  rating: number | null;
  rating100: number | null;
  favorite: boolean;

  // Activity counters
  o_counter: number;
  play_count: number;
  play_duration: number;
  resume_time: number;

  // History arrays
  play_history: string[];
  o_history: Date[];

  // Computed timestamps
  last_played_at: string | null;
  last_o_at: string | null;
};

/**
 * Normalized Performer
 *
 * Extends the base Performer type from Stash with Peek-specific user data.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - favorite: Whether user favorited this performer
 * - o_counter: Aggregated orgasm count from scenes with this performer
 * - play_count: Aggregated play count from scenes with this performer
 * - last_played_at: Most recent play of any scene with this performer
 * - last_o_at: Most recent orgasm from any scene with this performer
 */
export type NormalizedPerformer = Performer & {
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
  last_played_at: string | null;
  last_o_at: string | null;
};

/**
 * Normalized Studio
 *
 * Extends the base Studio type from Stash with Peek-specific user data.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - favorite: Whether user favorited this studio
 * - o_counter: Aggregated orgasm count from scenes by this studio
 * - play_count: Aggregated play count from scenes by this studio
 */
export type NormalizedStudio = Studio & {
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
};

/**
 * Normalized Tag
 *
 * Extends the base Tag type from Stash with Peek-specific user data.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - rating100: User's 0-100 rating (null if unrated) - alias for rating
 * - favorite: Whether user favorited this tag
 * - o_counter: Aggregated orgasm count from scenes with this tag
 * - play_count: Aggregated play count from scenes with this tag
 * - performer_count: Count of performers with this tag
 */
export type NormalizedTag = Tag & {
  rating: number | null;
  rating100: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
  performer_count: number;
};

/**
 * Normalized Gallery
 *
 * Extends the base Gallery type from Stash with Peek-specific user data.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - favorite: Whether user favorited this gallery
 */
export type NormalizedGallery = Gallery & {
  rating: number | null;
  favorite: boolean;
};

/**
 * Normalized Group
 *
 * Extends the base Group type from Stash with Peek-specific user data.
 *
 * Additional fields:
 * - rating: User's 1-5 star rating (null if unrated)
 * - favorite: Whether user favorited this group
 */
export type NormalizedGroup = Group & {
  rating: number | null;
  favorite: boolean;
};

/**
 * Lightweight scene data for scoring operations
 * Contains only IDs needed for similarity/recommendation scoring
 */
export interface SceneScoringData {
  id: string;
  studioId: string | null;
  performerIds: string[];
  tagIds: string[];
  oCounter: number;
  date: string | null;
}
