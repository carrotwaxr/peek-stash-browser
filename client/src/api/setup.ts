/**
 * Setup API — initial setup wizard and user setup endpoints.
 */
import { apiGet, apiPost } from "./client";
import type {
  GetSetupStatusResponse,
  CreateFirstAdminResponse,
  TestStashConnectionResponse,
  CreateFirstStashInstanceResponse,
  ResetSetupResponse,
} from "@peek/shared-types";

export const setupApi = {
  getSetupStatus: () => apiGet<GetSetupStatusResponse>("/setup/status"),

  createFirstAdmin: (username: string, password: string) =>
    apiPost<CreateFirstAdminResponse>("/setup/create-admin", { username, password }),

  testStashConnection: (url: string, apiKey: string) =>
    apiPost<TestStashConnectionResponse>("/setup/test-stash-connection", { url, apiKey }),

  createFirstStashInstance: (url: string, apiKey: string, name = "Default") =>
    apiPost<CreateFirstStashInstanceResponse>("/setup/create-stash-instance", { url, apiKey, name }),

  resetSetup: () => apiPost<ResetSetupResponse>("/setup/reset", {}),
};

export const userSetupApi = {
  getSetupStatus: () =>
    apiGet<{ needsSetup: boolean; instances: Array<{ id: string; name: string }> }>("/user/setup-status"),

  completeSetup: (selectedInstanceIds: string[]) =>
    apiPost<{ success: boolean; user: Record<string, unknown> }>("/user/complete-setup", { selectedInstanceIds }),
};
