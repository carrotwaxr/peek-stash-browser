/**
 * Watch history API endpoints.
 *
 * Note: The actual watch history hooks (useWatchHistory) consume these
 * via apiGet/apiPost directly. This module just re-exports the client
 * functions needed by watch history code, keeping the import path clean.
 */
export { apiGet, apiPost } from "./client";
