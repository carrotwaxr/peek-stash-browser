/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiGet, apiPut } from "../api";
import { getDefaultSettings } from "../config/entityDisplayConfig";

interface CardDisplaySettingsContextValue {
  getSettings: (entityType: string) => Record<string, unknown>;
  updateSettings: (entityType: string, key: string, value: unknown) => Promise<void>;
  isLoading: boolean;
}

const CardDisplaySettingsContext = createContext<CardDisplaySettingsContextValue | null>(null);

export const CardDisplaySettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await apiGet<{ settings: { cardDisplaySettings?: Record<string, Record<string, unknown>> } }>("/user/settings");
        setSettings(data.settings.cardDisplaySettings || {});
      } catch (error) {
        console.error("Failed to load card display settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Get settings for a specific entity type (with defaults from shared config)
  const getSettings = useCallback((entityType: string) => {
    const defaults = getDefaultSettings(entityType);
    const entitySettings = settings[entityType] || {};
    return { ...defaults, ...entitySettings };
  }, [settings]);

  // Update a specific setting
  const updateSettings = useCallback(async (entityType: string, key: string, value: unknown) => {
    const newEntitySettings = {
      ...(settings[entityType] || {}),
      [key]: value,
    };
    const newSettings = {
      ...settings,
      [entityType]: newEntitySettings,
    };

    // Optimistic update
    setSettings(newSettings);

    try {
      await apiPut("/user/settings", {
        cardDisplaySettings: newSettings,
      });
    } catch (error) {
      console.error("Failed to save card display settings:", error);
      // Revert on error
      setSettings(settings);
      throw error;
    }
  }, [settings]);

  return (
    <CardDisplaySettingsContext.Provider value={{ getSettings, updateSettings, isLoading }}>
      {children}
    </CardDisplaySettingsContext.Provider>
  );
};

export const useCardDisplaySettings = () => {
  const context = useContext(CardDisplaySettingsContext);
  if (!context) {
    throw new Error("useCardDisplaySettings must be used within CardDisplaySettingsProvider");
  }
  return context;
};
