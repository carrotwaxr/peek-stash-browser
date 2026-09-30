/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from "react";
import { useSetupStatus } from "../api/hooks/useSetupStatus";

/**
 * Config context for app-wide configuration values.
 * Currently provides hasMultipleInstances for multi-Stash support.
 */

const ConfigContext = createContext({
  hasMultipleInstances: false,
  isLoading: true,
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  // The same query as the app's route gate: one request for both, refreshed
  // when an instance change invalidates it
  const { data, isPending } = useSetupStatus();
  // More than one enabled Stash instance: cards and pages name the server
  const hasMultipleInstances = (data?.stashInstanceCount ?? 0) > 1;

  const config = useMemo(
    () => ({ hasMultipleInstances, isLoading: isPending }),
    [hasMultipleInstances, isPending]
  );

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
