/**
 * Setup API — initial setup wizard and user setup endpoints.
 */
import type {
  CompleteSetupResponse,
  CreateFirstAdminResponse,
  CreateFirstStashInstanceResponse,
  GetSetupStatusResponse,
  TestStashConnectionResponse,
} from "@peek/shared-types";
import { apiGet, apiPost } from "./client";

export const setupApi = {
  getSetupStatus: () => apiGet<GetSetupStatusResponse>("/setup/status"),

  createFirstAdmin: (username: string, password: string) =>
    apiPost<CreateFirstAdminResponse>("/setup/create-admin", {
      username,
      password,
    }),

  testStashConnection: (url: string, apiKey: string) =>
    apiPost<TestStashConnectionResponse>("/setup/test-stash-connection", {
      url,
      apiKey,
    }),

  createFirstStashInstance: (
    url: string,
    apiKey: string,
    name = "Default",
    uiUrl?: string
  ) =>
    apiPost<CreateFirstStashInstanceResponse>("/setup/create-stash-instance", {
      url,
      uiUrl: uiUrl || null,
      apiKey,
      name,
    }),
};

export const userSetupApi = {
  getSetupStatus: () =>
    apiGet<{
      setupCompleted: boolean;
      instances: Array<{
        id: string;
        name: string;
        description?: string | null;
      }>;
      instanceCount: number;
    }>("/user/setup-status"),

  /** Returns the first recovery key, shown this once (null if setup was already complete). */
  completeSetup: (selectedInstanceIds: string[]) =>
    apiPost<CompleteSetupResponse>("/user/complete-setup", {
      selectedInstanceIds,
    }),
};
