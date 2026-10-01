/**
 * Every route behind `requireAdmin`, as "METHOD /api/path" with the route's
 * Express params. `tests/routes/routeGuards.test.ts` checks the app's
 * middleware stacks against this list, and
 * `integration/api/admin-routes.integration.test.ts` sends each route as a
 * regular user (403) and each GET as an admin (not 403). The handlers behind
 * these routes trust `requireAdmin` and check no role of their own.
 */
export const ADMIN_ROUTES = [
  // initializers/api.ts
  "GET /api/stats",
  "POST /api/stats/refresh-cache",
  // routes/setup.ts: the instance record carries Stash's address
  "GET /api/setup/stash-instance",
  "GET /api/setup/stash-instances",
  "POST /api/setup/stash-instance",
  "PUT /api/setup/stash-instance/:id",
  "POST /api/setup/stash-instance/:id/test-connection",
  "DELETE /api/setup/stash-instance/:id",
  // routes/sync.ts
  "GET /api/sync/status",
  "POST /api/sync/trigger",
  "POST /api/sync/abort",
  "POST /api/sync/cleanup",
  "POST /api/sync/reprobe-clips",
  "PUT /api/sync/settings",
  // routes/exclusions.ts
  "POST /api/exclusions/recompute/:userId",
  "POST /api/exclusions/recompute-all",
  "GET /api/exclusions/stats",
  // routes/mergeReconciliation.ts (router-wide requireAdmin)
  "GET /api/admin/orphaned-scenes",
  "GET /api/admin/orphaned-scenes/:ref/matches",
  "POST /api/admin/orphaned-scenes/:ref/reconcile",
  "POST /api/admin/orphaned-scenes/:ref/discard",
  "POST /api/admin/reconcile-all",
  // routes/databaseBackup.ts (router-wide requireAdmin)
  "GET /api/admin/database/backups",
  "POST /api/admin/database/backup",
  "DELETE /api/admin/database/backups/:filename",
  // routes/user.ts
  "GET /api/user/all",
  "POST /api/user/create",
  "DELETE /api/user/:userId",
  "PUT /api/user/:userId/role",
  "PUT /api/user/:userId/settings",
  "POST /api/user/:userId/sync-from-stash",
  "GET /api/user/:userId/permissions",
  "PUT /api/user/:userId/permissions",
  "GET /api/user/:userId/groups",
  "POST /api/user/:userId/reset-password",
  "POST /api/user/:userId/regenerate-recovery-key",
  "GET /api/user/:userId/restrictions",
  "PUT /api/user/:userId/restrictions",
  "DELETE /api/user/:userId/restrictions",
  // routes/groups.ts (GET /api/groups/user/mine is every user's)
  "GET /api/groups",
  "GET /api/groups/:id",
  "POST /api/groups",
  "PUT /api/groups/:id",
  "DELETE /api/groups/:id",
  "POST /api/groups/:id/members",
  "DELETE /api/groups/:id/members/:userId",
] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];
