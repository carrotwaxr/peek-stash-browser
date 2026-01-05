// server/types/api/setup.ts
/**
 * Setup API Types
 *
 * Request and response types for /api/setup/* endpoints.
 * These are public endpoints for initial setup wizard.
 */

// =============================================================================
// GET SETUP STATUS
// =============================================================================

/**
 * GET /api/setup/status
 * Check setup status (for determining if wizard is needed)
 */
export interface GetSetupStatusResponse {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
  userCount: number;
  stashInstanceCount: number;
}

// =============================================================================
// CREATE FIRST ADMIN
// =============================================================================

/**
 * POST /api/setup/create-admin
 * Create first admin user (only works if NO users exist)
 */
export interface CreateFirstAdminRequest {
  username: string;
  password: string;
}

export interface CreateFirstAdminResponse {
  success: true;
  user: {
    id: number;
    username: string;
    role: string;
    createdAt: Date;
  };
}

// =============================================================================
// TEST STASH CONNECTION
// =============================================================================

/**
 * POST /api/setup/test-stash-connection
 * Test connection to a Stash server
 */
export interface TestStashConnectionRequest {
  url: string;
  apiKey: string;
}

export interface TestStashConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
}

// =============================================================================
// CREATE FIRST STASH INSTANCE
// =============================================================================

/**
 * POST /api/setup/create-stash-instance
 * Create first Stash instance (only works if NO instances exist)
 */
export interface CreateFirstStashInstanceRequest {
  name?: string;
  url: string;
  apiKey: string;
}

export interface CreateFirstStashInstanceResponse {
  success: true;
  instance: {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    createdAt: Date;
  };
}

// =============================================================================
// GET STASH INSTANCE
// =============================================================================

/**
 * GET /api/setup/stash-instance
 * Get current Stash instance info (for Server Settings display)
 */
export interface GetStashInstanceResponse {
  instance: {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  instanceCount: number;
}

// =============================================================================
// RESET SETUP
// =============================================================================

/**
 * POST /api/setup/reset
 * Reset setup state for recovery from partial setup
 */
export interface ResetSetupRequest {
  confirm: "RESET_SETUP";
}

export interface ResetSetupResponse {
  success: true;
  message: string;
  deleted: {
    users: number;
    stashInstances: number;
  };
}
