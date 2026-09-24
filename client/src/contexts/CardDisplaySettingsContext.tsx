/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiGet, apiPut } from "../api";
import { getDefaultSettings } from "../config/entityDisplayConfig";
import { useAuth } from "../hooks/useAuth";

interface CardDisplaySettingsContextValue {
  getSettings: (entityType: string) => Record<string, unknown>;
  updateSettings: (
    entityType: string,
    key: string,
    value: unknown
  ) => Promise<void>;
  isLoading: boolean;
}

const CardDisplaySettingsContext =
  createContext<CardDisplaySettingsContextValue | null>(null);

export const CardDisplaySettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [settings, setSettings] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  // Load once auth has resolved, and only for a signed-in user: a signed-out
  // request answers 401, and apiFetch then reloads the page at /login while
  // the router is already redirecting there. Until auth resolves, isLoading
  // stays true.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setSettings({});
      setIsLoading(false);
      return;
    }

    // A response that lands after sign-out (or a later load) is dropped.
    let cancelled = false;
    setIsLoading(true);
    const loadSettings = async () => {
      try {
        const data = await apiGet<{
          settings: {
            cardDisplaySettings?: Record<string, Record<string, unknown>>;
          };
        }>("/user/settings");
        if (!cancelled) setSettings(data.settings.cardDisplaySettings ?? {});
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load card display settings:", error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  // Get settings for a specific entity type (with defaults from shared config)
  const getSettings = useCallback(
    (entityType: string) => {
      const defaults = getDefaultSettings(entityType);
      const entitySettings = settings[entityType] ?? {};
      return { ...defaults, ...entitySettings };
    },
    [settings]
  );

  // Update a specific setting
  const updateSettings = useCallback(
    async (entityType: string, key: string, value: unknown) => {
      const newEntitySettings = {
        ...(settings[entityType] ?? {}),
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
    },
    [settings]
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
