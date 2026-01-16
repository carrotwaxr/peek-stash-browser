/* eslint-disable react-refresh/only-export-components */
/**
 * Mock for CardDisplaySettingsContext
 * Provides controllable settings for testing card display customization
 */
import { createContext, useContext, useState, useCallback } from "react";

const DEFAULT_ENTITY_SETTINGS = {
  showDescriptionOnCard: true,
  showDescriptionOnDetail: true,
  showRating: true,
  showFavorite: true,
  showOCounter: true,
};

const DEFAULT_SCENE_SETTINGS = {
  ...DEFAULT_ENTITY_SETTINGS,
  showCodeOnCard: true,
};

const getDefaultSettings = (entityType) => {
  if (entityType === "scene") {
    return DEFAULT_SCENE_SETTINGS;
  }
  return DEFAULT_ENTITY_SETTINGS;
};

export const MockCardDisplaySettingsContext = createContext(null);

/**
 * Mock provider for testing - allows setting specific values
 */
export const MockCardDisplaySettingsProvider = ({
  children,
  initialSettings = {},
}) => {
  const [settings, setSettings] = useState(initialSettings);

  const getSettings = useCallback(
    (entityType) => {
      const defaults = getDefaultSettings(entityType);
      const entitySettings = settings[entityType] || {};
      return { ...defaults, ...entitySettings };
    },
    [settings]
  );

  const updateSettings = useCallback(async (entityType, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [entityType]: {
        ...(prev[entityType] || {}),
        [key]: value,
      },
    }));
  }, []);

  return (
    <MockCardDisplaySettingsContext.Provider
      value={{ getSettings, updateSettings, isLoading: false }}
    >
      {children}
    </MockCardDisplaySettingsContext.Provider>
  );
};

export const useMockCardDisplaySettings = () => {
  const context = useContext(MockCardDisplaySettingsContext);
  if (!context) {
    throw new Error(
      "useMockCardDisplaySettings must be used within MockCardDisplaySettingsProvider"
    );
  }
  return context;
};
