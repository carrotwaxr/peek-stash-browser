/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext } from "react";
import type { GetUserSettingsResponse } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../api/hooks/useUserSettings";
import { queryKeys } from "../api/queryKeys";
import { getDefaultSettings } from "../config/entityDisplayConfig";
import { useAuth } from "../hooks/useAuth";

export interface CardDisplaySettingsContextValue {
  getSettings: (entityType: string) => Record<string, unknown>;
  updateSettings: (
    entityType: string,
    key: string,
    value: unknown
  ) => Promise<void>;
  isLoading: boolean;
}

/** Exported for tests, which provide a stub value */
export const CardDisplaySettingsContext =
  createContext<CardDisplaySettingsContextValue | null>(null);

type CardDisplaySettingsMap = Record<string, Record<string, unknown>>;

const NO_SETTINGS: CardDisplaySettingsMap = {};

/** The stored options by entity type (the wire type is a loose record) */
const optionsOf = (
  stored: GetUserSettingsResponse | undefined
): CardDisplaySettingsMap =>
  (stored?.settings.cardDisplaySettings as CardDisplaySettingsMap | null) ??
  NO_SETTINGS;

/**
 * The card display options, read from the one settings query: a change
 * shows in every card at once, and a refused save puts the server's options
 * back (`useUpdateUserSettings`).
 */
export const CardDisplaySettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending } = useUserSettings();
  const { mutateAsync } = useUpdateUserSettings();

  const settings = isAuthenticated ? optionsOf(data) : NO_SETTINGS;
  const isLoading = authLoading || (isAuthenticated && isPending);

  // Get settings for a specific entity type (with defaults from shared config)
  const getSettings = useCallback(
    (entityType: string) => {
      const defaults = getDefaultSettings(entityType);
      const entitySettings = settings[entityType] ?? {};
      return { ...defaults, ...entitySettings };
    },
    [settings]
  );

  // Update a specific setting. The merged map is built from the cache at
  // call time, so two quick changes to different cards both stay.
  const updateSettings = useCallback(
    async (entityType: string, key: string, value: unknown) => {
      const stored = queryClient.getQueryData<GetUserSettingsResponse>(
        queryKeys.user.settings()
      );
      // Saving over settings that never loaded would replace the stored ones
      if (!stored) throw new Error("Your settings have not loaded yet");
      const current = optionsOf(stored);
      try {
        await mutateAsync({
          cardDisplaySettings: {
            ...current,
            [entityType]: { ...(current[entityType] ?? {}), [key]: value },
          },
        });
      } catch (error) {
        console.error("Failed to save card display settings:", error);
        throw error;
      }
    },
    [queryClient, mutateAsync]
  );

  return (
    <CardDisplaySettingsContext.Provider
      value={{ getSettings, updateSettings, isLoading }}
    >
      {children}
    </CardDisplaySettingsContext.Provider>
  );
};

export const useCardDisplaySettings = () => {
  const context = useContext(CardDisplaySettingsContext);
  if (!context) {
    throw new Error(
      "useCardDisplaySettings must be used within CardDisplaySettingsProvider"
    );
  }
  return context;
};
