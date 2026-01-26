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
  version?: string;
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

// =============================================================================
// MULTI-INSTANCE MANAGEMENT (Admin only)
// =============================================================================

/**
 * Stash instance data returned in responses
 */
export interface StashInstanceData {
  id: string;
  name: string;
  description: string | null;
  url: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /api/setup/stash-instances
 * Get all Stash instances (admin only)
 */
export interface GetAllStashInstancesResponse {
  instances: StashInstanceData[];
}

/**
 * POST /api/setup/stash-instance
 * Create a new Stash instance (admin only)
 */
export interface CreateStashInstanceRequest {
  name: string;
  description?: string;
  url: string;
  apiKey: string;
  enabled?: boolean;
  priority?: number;
}

export interface CreateStashInstanceResponse {
  success: true;
  instance: StashInstanceData;
}

/**
 * PUT /api/setup/stash-instance/:id
 * Update an existing Stash instance (admin only)
 */
export interface UpdateStashInstanceParams extends Record<string, string> {
  id: string;
}

export interface UpdateStashInstanceRequest {
  name?: string;
  description?: string;
  url?: string;
  apiKey?: string;
  enabled?: boolean;
  priority?: number;
}

export interface UpdateStashInstanceResponse {
  success: true;
  instance: StashInstanceData;
}

/**
 * DELETE /api/setup/stash-instance/:id
 * Delete a Stash instance (admin only)
 */
export interface DeleteStashInstanceParams extends Record<string, string> {
  id: string;
}

export interface DeleteStashInstanceResponse {
  success: true;
  message: string;
}

// =============================================================================
// USER INSTANCE SELECTION
// =============================================================================

/**
 * GET /api/user/stash-instances
 * Get user's selected Stash instances
 */
export interface GetUserStashInstancesResponse {
  /** Selected instance IDs (empty array means all enabled instances) */
  selectedInstanceIds: string[];
  /** All available enabled instances for selection UI */
  availableInstances: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
}

/**
 * PUT /api/user/stash-instances
 * Update user's instance selection
 */
export interface UpdateUserStashInstancesRequest {
  /** Instance IDs to enable. Empty array means "show all enabled instances" */
  instanceIds: string[];
}

export interface UpdateUserStashInstancesResponse {
  success: true;
  selectedInstanceIds: string[];
}
