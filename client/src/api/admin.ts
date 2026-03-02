/**
 * Admin API — groups, permissions, recovery keys, password reset.
 */
import { apiGet, apiPost, apiPut, apiDelete } from "./client";

// ── User Groups (admin management) ────────────────────────────────────

export const getGroups = () => apiGet<{ groups: unknown[] }>("/groups");

export const getGroup = (groupId: string) =>
  apiGet<{ group: unknown }>(`/groups/${groupId}`);

export const createGroup = (data: Record<string, unknown>) =>
  apiPost<{ group: unknown }>("/groups", data);

export const updateGroup = (groupId: string, data: Record<string, unknown>) =>
  apiPut<{ group: unknown }>(`/groups/${groupId}`, data);

export const deleteGroup = (groupId: string) =>
  apiDelete<{ success: boolean; message: string }>(`/groups/${groupId}`);

export const addGroupMember = (groupId: string, userId: number) =>
  apiPost(`/groups/${groupId}/members`, { userId });

export const removeGroupMember = (groupId: string, userId: string) =>
  apiDelete(`/groups/${groupId}/members/${userId}`);

export const getUserGroupMemberships = (userId: number) =>
  apiGet<{ groups: unknown[] }>(`/user/${userId}/groups`);

export const getMyGroups = () =>
  apiGet<{ groups: unknown[] }>("/groups/user/mine");

// ── Permissions ────────────────────────────────────────────────────────

export const getMyPermissions = () =>
  apiGet<{ permissions: Record<string, unknown> }>("/user/permissions");

export const getUserPermissions = (userId: number) =>
  apiGet<{ permissions: Record<string, unknown> }>(`/user/${userId}/permissions`);

export const updateUserPermissionOverrides = (userId: number, overrides: Record<string, unknown>) =>
  apiPut(`/user/${userId}/permissions`, overrides);

// ── Recovery Key & Password Reset ─────────────────────────────────────

export const getRecoveryKey = () =>
  apiGet<{ recoveryKey: string | null }>("/user/recovery-key");

export const regenerateRecoveryKey = () =>
  apiPost<{ recoveryKey: string }>("/user/recovery-key/regenerate");

export const forgotPasswordInit = (username: string) =>
  apiPost<{ hasRecoveryKey: boolean }>("/auth/forgot-password/init", { username });

export const forgotPasswordReset = (username: string, recoveryKey: string, newPassword: string) =>
  apiPost<{ success: boolean }>("/auth/forgot-password/reset", { username, recoveryKey, newPassword });

export const adminResetPassword = (userId: number, newPassword: string) =>
  apiPost<{ success: boolean }>(`/user/${userId}/reset-password`, { newPassword });

export const adminRegenerateRecoveryKey = (userId: number) =>
  apiPost<{ recoveryKey: string }>(`/user/${userId}/regenerate-recovery-key`);
