/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { setupApi } from "../services/api.js";

/**
 * Config context for app-wide configuration values.
 * Currently provides hasMultipleInstances for multi-Stash support.
 */

const ConfigContext = createContext({
  hasMultipleInstances: false,
  isLoading: true,
});

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({
    hasMultipleInstances: false,
    isLoading: true,
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const status = await setupApi.getSetupStatus();
        // stashInstanceCount > 1 means multiple Stash instances are configured
        const hasMultiple = (status.stashInstanceCount || 0) > 1;
        setConfig({
          hasMultipleInstances: hasMultiple,
          isLoading: false,
        });
      } catch (error) {
        console.error("Failed to fetch config:", error);
        setConfig((prev) => ({ ...prev, isLoading: false }));
      }
    };
    fetchConfig();
  }, []);

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
