import { useMemo } from "react";
import { getErrorMessage } from "../../../api";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../../../api/hooks/useUserSettings";
import { migrateCarouselPreferences } from "../../../constants/carousels";
import { migrateNavPreferences } from "../../../constants/navigation";
import { showError, showSuccess } from "../../../utils/toast";
import { StatusMessage } from "../../ui/index";
import CarouselSettings from "../CarouselSettings";
import LandingPageSettings from "../LandingPageSettings";
import NavigationSettings from "../NavigationSettings";

interface NavPreference {
  id: string;
  enabled: boolean;
  order: number;
}

interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

interface LandingPagePreference {
  pages: string[];
  randomize: boolean;
}

const NavigationTab = () => {
  // The settings query: a save updates it, and every reader with it (the
  // logo's landing page). After a failed load the editors would show
  // defaults, and saving them would replace the stored preferences: show
  // Retry instead
  const { data, isPending, error, refetch } = useUserSettings();
  const save = useUpdateUserSettings();
  const settings = data?.settings;

  // Each editor resets from its prop when the prop changes, so derive each
  // from its own stored field: a save of one leaves the others' edits alone
  const storedCarousels = settings?.carouselPreferences;
  const carouselPreferences = useMemo(
    () =>
      migrateCarouselPreferences(storedCarousels ?? []) as CarouselPreference[],
    [storedCarousels]
  );
  const storedNav = settings?.navPreferences;
  const navPreferences = useMemo(
    () => migrateNavPreferences(storedNav ?? []) as NavPreference[],
    [storedNav]
  );
  const landingPagePreference = settings?.landingPagePreference ?? null;

  // Each save reports a failure here and rethrows it, so the editor keeps
  // its changes marked unsaved
  const saveCarouselPreferences = async (
    newPreferences: CarouselPreference[]
  ) => {
    try {
      await save.mutateAsync({ carouselPreferences: newPreferences });
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save carousel preferences"));
      throw err;
    }
  };

  const saveNavPreferences = async (newPreferences: NavPreference[]) => {
    try {
      await save.mutateAsync({ navPreferences: newPreferences });
      // The sidebar reads the settings query: it already shows the new order
      showSuccess("Navigation preferences saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save navigation preferences"));
      throw err;
    }
  };

  const saveLandingPagePreference = async (
    newPreference: LandingPagePreference
  ) => {
    try {
      await save.mutateAsync({ landingPagePreference: newPreference });
      showSuccess("Landing page preference saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save landing page preference"));
      throw err;
    }
  };

  if (isPending) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <StatusMessage
        variant="error"
        title="Failed to load navigation settings"
        message={getErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Landing Page Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <LandingPageSettings
          landingPagePreference={landingPagePreference}
          onSave={saveLandingPagePreference}
        />
      </div>

      {/* Navigation Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <NavigationSettings
          navPreferences={navPreferences}
          onSave={saveNavPreferences}
        />
      </div>

      {/* Carousel Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CarouselSettings
          carouselPreferences={carouselPreferences}
          onSave={saveCarouselPreferences}
        />
      </div>
    </div>
  );
};

export default NavigationTab;
