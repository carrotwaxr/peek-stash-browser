import { useEffect, useState } from "react";
import { apiGet, apiPut, getErrorMessage } from "../../../api";
import { migrateCarouselPreferences } from "../../../constants/carousels";
import { migrateNavPreferences } from "../../../constants/navigation";
import { showError, showSuccess } from "../../../utils/toast";
import { ErrorMessage } from "../../ui/index";
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
  const [loading, setLoading] = useState(true);
  // After a failed load the editors would show defaults, and saving them
  // would replace the stored preferences: show Retry instead
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [carouselPreferences, setCarouselPreferences] = useState<
    CarouselPreference[]
  >([]);
  const [navPreferences, setNavPreferences] = useState<NavPreference[]>([]);
  const [landingPagePreference, setLandingPagePreference] =
    useState<LandingPagePreference | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await apiGet<{ settings: Record<string, unknown> }>(
          "/user/settings"
        );
        const { settings } = data;

        const migratedCarouselPrefs = migrateCarouselPreferences(
          settings.carouselPreferences as CarouselPreference[]
        ) as CarouselPreference[];
        setCarouselPreferences(migratedCarouselPrefs);

        const migratedNavPrefs = migrateNavPreferences(
          settings.navPreferences as NavPreference[]
        );
        setNavPreferences(migratedNavPrefs as NavPreference[]);

        setLandingPagePreference(
          (settings.landingPagePreference as LandingPagePreference) || {
            pages: ["home"],
            randomize: false,
          }
        );
      } catch (err) {
        setLoadError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [loadAttempt]);

  // Each save reports a failure here and rethrows it, so the editor keeps
  // its changes marked unsaved
  const saveCarouselPreferences = async (
    newPreferences: CarouselPreference[]
  ) => {
    try {
      await apiPut("/user/settings", {
        carouselPreferences: newPreferences,
      });

      setCarouselPreferences(newPreferences);
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save carousel preferences"));
      throw err;
    }
  };

  const saveNavPreferences = async (newPreferences: NavPreference[]) => {
    try {
      await apiPut("/user/settings", {
        navPreferences: newPreferences,
      });

      setNavPreferences(newPreferences);
      showSuccess("Navigation preferences saved successfully!");

      // Reload the page to apply nav changes immediately
      window.location.reload();
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save navigation preferences"));
      throw err;
    }
  };

  const saveLandingPagePreference = async (
    newPreference: LandingPagePreference
  ) => {
    try {
      await apiPut("/user/settings", {
        landingPagePreference: newPreference,
      });

      setLandingPagePreference(newPreference);
      showSuccess("Landing page preference saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save landing page preference"));
      throw err;
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorMessage
        title="Failed to load navigation settings"
        error={loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
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
