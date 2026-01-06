import { useEffect, useState } from "react";
import axios from "axios";
import { useUnitPreference } from "../../../contexts/UnitPreferenceContext.js";
import { migrateCarouselPreferences } from "../../../constants/carousels.js";
import { migrateNavPreferences } from "../../../constants/navigation.js";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import CarouselSettings from "../CarouselSettings.jsx";
import NavigationSettings from "../NavigationSettings.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CustomizationTab = () => {
  const [loading, setLoading] = useState(true);
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [navPreferences, setNavPreferences] = useState([]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get("/user/settings");
        const { settings } = response.data;

        const migratedCarouselPrefs = migrateCarouselPreferences(
          settings.carouselPreferences
        );
        setCarouselPreferences(migratedCarouselPrefs);

        const migratedNavPrefs = migrateNavPreferences(settings.navPreferences);
        setNavPreferences(migratedNavPrefs);
      } catch {
        showError("Failed to load customization settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const saveCarouselPreferences = async (newPreferences) => {
    try {
      await api.put("/user/settings", {
        carouselPreferences: newPreferences,
      });

      setCarouselPreferences(newPreferences);
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save carousel preferences");
    }
  };

  const saveNavPreferences = async (newPreferences) => {
    try {
      await api.put("/user/settings", {
        navPreferences: newPreferences,
      });

      setNavPreferences(newPreferences);
      showSuccess("Navigation preferences saved successfully!");

      // Reload the page to apply nav changes immediately
      window.location.reload();
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save navigation preferences");
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

  return (
    <div className="space-y-6">
      {/* Measurement Units */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Measurement Units
        </h3>
        <div>
          <label
            htmlFor="unitPreference"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Measurement Units
          </label>
          <select
            id="unitPreference"
            value={unitPreference}
            onChange={(e) => setUnitPreference(e.target.value)}
            className="w-full px-4 py-2 rounded-lg"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <option value="metric">Metric (cm, kg)</option>
            <option value="imperial">Imperial (ft/in, lbs)</option>
          </select>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Display performer height, weight, and measurements in your preferred unit
            system.
          </p>
        </div>
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

export default CustomizationTab;
