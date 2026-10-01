import React, { useCallback } from "react";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../api/hooks/useUserSettings";
import { useAuth } from "../hooks/useAuth";
import { showError } from "../utils/toast";
import { UNITS } from "../utils/unitConversions";
import { UnitPreferenceContext } from "./UnitPreferenceContext";

/**
 * The unit preference, read from the one settings query. Until auth has
 * resolved, and while the settings load, `isLoading` is true; signed out,
 * and after a failed load, the unit is metric.
 */
export const UnitPreferenceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isPending } = useUserSettings();
  const { mutateAsync } = useUpdateUserSettings();

  const unitPreference =
    (isAuthenticated && data?.settings.unitPreference) || UNITS.METRIC;
  const isLoading = authLoading || (isAuthenticated && isPending);

  // The save shows at once in every reader; a refused save puts the server's
  // unit back (the mutation refetches the settings)
  const setUnitPreference = useCallback(
    async (newUnit: string) => {
      try {
        await mutateAsync({ unitPreference: newUnit });
      } catch (error) {
        console.error("Failed to save unit preference:", error);
        showError("Failed to save unit preference");
      }
    },
    [mutateAsync]
  );

  const value = { unitPreference, setUnitPreference, isLoading };

  return (
    <UnitPreferenceContext.Provider value={value}>
      {children}
    </UnitPreferenceContext.Provider>
  );
};
