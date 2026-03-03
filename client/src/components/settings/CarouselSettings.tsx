import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "../ui/index";
import { libraryApi } from "../../api";

/**
 * Carousel metadata mapping fetchKey to display information
 * Only includes active hardcoded carousels
 */
const CAROUSEL_METADATA = {
  continueWatching: {
    title: "Continue Watching",
    description: "Resume your in-progress scenes",
  },
  recentlyAddedScenes: {
    title: "Recently Added",
    description: "Newly added content",
  },
  highRatedScenes: {
    title: "High Rated",
    description: "Top rated scenes",
  },
  favoritePerformerScenes: {
    title: "Favorite Performers",
    description: "Scenes with your favorite performers",
  },
  favoriteTagScenes: {
    title: "Favorite Tags",
    description: "Scenes with your favorite tags",
  },
  favoriteStudioScenes: {
    title: "Favorite Studios",
    description: "Content from your favorite studios",
  },
};

// Maximum custom carousels allowed
const MAX_CUSTOM_CAROUSELS = 15;

/**
 * Check if an ID is a custom carousel (prefixed with "custom-")
 */
const isCustomCarousel = (id: string) => id && id.startsWith("custom-");

interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

interface Props {
  carouselPreferences?: CarouselPreference[];
  onSave: (preferences: CarouselPreference[]) => void;
}

/**
 * CarouselSettings Component
 * Allows users to enable/disable and reorder homepage carousels using up/down buttons
 * Now supports custom user-defined carousels with edit/delete functionality
 */
interface CustomCarousel {
  id: string;
  title: string;
  icon: string;
}

const CarouselSettings = ({ carouselPreferences = [], onSave }: Props) => {
  const navigate = useNavigate();
  const [userPreferences, setUserPreferences] = useState<CarouselPreference[] | null>(null);
  const [customCarousels, setCustomCarousels] = useState<CustomCarousel[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load custom carousels from API
  useEffect(() => {
    const loadCustomCarousels = async () => {
      try {
        const { carousels } = (await libraryApi.getCarousels()) as { carousels: CustomCarousel[] };
        setCustomCarousels(carousels || []);
      } catch (err) {
        console.error("Failed to load custom carousels:", err);
      } finally {
        setLoadingCustom(false);
      }
    };

    loadCustomCarousels();
  }, []);

  // Derive merged preferences at render time instead of via effect
  const preferences = useMemo(() => {
    if (loadingCustom) return [];

    // Use user-modified preferences if available, otherwise start from props
    const base = userPreferences || carouselPreferences;

    // Start with saved preferences
    let merged = [...base].sort((a, b) => a.order - b.order);

    // Add any custom carousels that aren't in preferences yet
    customCarousels.forEach((carousel) => {
      const customId = `custom-${carousel.id}`;
      if (!merged.find((p) => p.id === customId)) {
        merged.push({
          id: customId,
          enabled: true,
          order: merged.length,
        });
      }
    });

    // Remove preferences for deleted custom carousels
    const customIds = new Set(customCarousels.map((c) => `custom-${c.id}`));
    merged = merged.filter(
      (pref) => !isCustomCarousel(pref.id) || customIds.has(pref.id)
    );

    // Re-sort by order
    merged.sort((a, b) => a.order - b.order);
    merged = merged.map((pref, idx) => ({ ...pref, order: idx }));

    return merged;
  }, [carouselPreferences, customCarousels, loadingCustom, userPreferences]);

  const moveUp = (index: number) => {
    if (index === 0) return;

    const newPreferences = [...preferences];
    [newPreferences[index - 1], newPreferences[index]] = [
      newPreferences[index],
      newPreferences[index - 1],
    ];

    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setUserPreferences(reordered);
    setHasChanges(true);
  };

  const moveDown = (index: number) => {
    if (index === preferences.length - 1) return;

    const newPreferences = [...preferences];
    [newPreferences[index], newPreferences[index + 1]] = [
      newPreferences[index + 1],
      newPreferences[index],
    ];

    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setUserPreferences(reordered);
    setHasChanges(true);
  };

  const toggleEnabled = (id: string) => {
    const updated = preferences.map((pref) =>
      pref.id === id ? { ...pref, enabled: !pref.enabled } : pref
    );
    setUserPreferences(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(preferences);
    setHasChanges(false);
  };

  const handleReset = () => {
    setUserPreferences(null); // Reset to derived from props
    setHasChanges(false);
  };

  const handleCreateCarousel = () => {
    navigate("/settings/carousels/new");
  };

  const handleEditCarousel = (carouselId: string) => {
    // carouselId is the full "custom-{uuid}" format, extract the uuid
    const actualId = carouselId.replace("custom-", "");
    navigate(`/settings/carousels/${actualId}/edit`);
  };

  const handleDeleteCarousel = async (carouselId: string) => {
    const actualId = carouselId.replace("custom-", "");

    setDeletingId(carouselId);
    try {
      await libraryApi.deleteCarousel(actualId);

      // Remove from custom carousels list
      setCustomCarousels((prev) => prev.filter((c) => c.id !== actualId));

      // Remove from preferences
      const updatedPrefs = preferences
        .filter((p) => p.id !== carouselId)
        .map((p, idx) => ({ ...p, order: idx }));
      setUserPreferences(updatedPrefs);

      // Save the updated preferences immediately
      onSave(updatedPrefs);
    } catch (err) {
      console.error("Failed to delete carousel:", err);
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Get display info for a carousel preference
   */
  const getCarouselInfo = (prefId: string) => {
    if (isCustomCarousel(prefId)) {
      const actualId = prefId.replace("custom-", "");
      const carousel = customCarousels.find((c) => c.id === actualId);
      if (carousel) {
        const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[carousel.icon] || LucideIcons.Film;
        return {
          title: carousel.title,
          description: "Custom carousel",
          isCustom: true,
          icon: IconComponent,
        };
      }
      return {
        title: "Unknown Carousel",
        description: "Custom carousel not found",
        isCustom: true,
        icon: LucideIcons.AlertCircle,
      };
    }

    const metadata = (CAROUSEL_METADATA as Record<string, { title: string; description: string }>)[prefId];
    return {
      title: metadata?.title || prefId,
      description: metadata?.description || "",
      isCustom: false,
      icon: null,
    };
  };

  const customCarouselCount = customCarousels.length;
  const canCreateMore = customCarouselCount < MAX_CUSTOM_CAROUSELS;

  if (loadingCustom) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Homepage Carousels
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Use arrow buttons to reorder carousels, click the eye icon to toggle
            visibility
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleCreateCarousel}
          disabled={!canCreateMore}
          icon={<Plus className="w-4 h-4" />}
          title={
            canCreateMore
              ? "Create a new custom carousel"
              : `Maximum ${MAX_CUSTOM_CAROUSELS} custom carousels reached`
          }
        >
          Create Carousel
        </Button>
      </div>

      {customCarouselCount > 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {customCarouselCount} of {MAX_CUSTOM_CAROUSELS} custom carousels used
        </p>
      )}

      <div className="space-y-2">
        {preferences.map((pref, index) => {
          const info = getCarouselInfo(pref.id);

          return (
            <div
              key={pref.id}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                transition-all duration-200
                ${pref.enabled ? "" : "opacity-60"}
              `}
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex flex-col space-y-1">
                  <Button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    variant="secondary"
                    className="p-1"
                    icon={<ChevronUp className="w-4 h-4" />}
                    title="Move up"
                  />
                  <Button
                    onClick={() => moveDown(index)}
                    disabled={index === preferences.length - 1}
                    variant="secondary"
                    className="p-1"
                    icon={<ChevronDown className="w-4 h-4" />}
                    title="Move down"
                  />
                </div>

                {/* Custom carousel icon */}
                {info.isCustom && info.icon && (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <info.icon
                      className="w-5 h-5"
                      style={{ color: "var(--accent-primary)" }}
                    />
                  </div>
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {info.title}
                    </div>
                    {info.isCustom && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: "var(--accent-primary)",
                          color: "var(--text-on-accent)",
                        }}
                      >
                        Custom
                      </span>
                    )}
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {info.description}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* Edit button for custom carousels */}
                {info.isCustom && (
                  <>
                    <Button
                      onClick={() => handleEditCarousel(pref.id)}
                      variant="secondary"
                      className="p-2"
                      icon={<Pencil className="w-4 h-4" />}
                      title="Edit carousel"
                    />
                    <Button
                      onClick={() => handleDeleteCarousel(pref.id)}
                      variant="secondary"
                      className="p-2"
                      disabled={deletingId === pref.id}
                      icon={
                        deletingId === pref.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )
                      }
                      title="Delete carousel"
                    />
                  </>
                )}

                <Button
                  onClick={() => toggleEnabled(pref.id)}
                  variant={pref.enabled ? "primary" : "secondary"}
                  className="p-2"
                  icon={
                    pref.enabled ? (
                      <Eye className="w-5 h-5" />
                    ) : (
                      <EyeOff className="w-5 h-5" />
                    )
                  }
                  title={pref.enabled ? "Hide carousel" : "Show carousel"}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-end space-x-3 pt-4 border-t"
        style={{ borderColor: "var(--border-color)" }}
      >
        <Button
          disabled={!hasChanges}
          onClick={handleReset}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button disabled={!hasChanges} onClick={handleSave} variant="primary">
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default CarouselSettings;
