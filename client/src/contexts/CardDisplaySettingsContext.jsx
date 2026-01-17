/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { getDefaultSettings } from "../config/entityDisplayConfig.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CardDisplaySettingsContext = createContext(null);

export const CardDisplaySettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get("/user/settings");
        setSettings(response.data.settings.cardDisplaySettings || {});
      } catch (error) {
        console.error("Failed to load card display settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Get settings for a specific entity type (with defaults from shared config)
  const getSettings = useCallback((entityType) => {
    const defaults = getDefaultSettings(entityType);
    const entitySettings = settings[entityType] || {};
    return { ...defaults, ...entitySettings };
  }, [settings]);

  // Update a specific setting
  const updateSettings = useCallback(async (entityType, key, value) => {
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
      await api.put("/user/settings", {
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
